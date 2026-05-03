const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { rateLimit } = require('express-rate-limit');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const app = express();
const PORT = 3001;

const OPENROUTER_KEY = process.env.OPENROUTER;
if (!OPENROUTER_KEY) {
    console.error('❌ OPENROUTER key missing in .env — exiting');
    process.exit(1);
}

// ── Database ─────────────────────────────────────────────────────────
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// ── Cloudflare R2 ───────────────────────────────────────────────────
const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

async function uploadToR2(input, prefix = 'photo') {
    if (!process.env.R2_BUCKET_NAME) return input; // Fallback to original if R2 not config

    try {
        let buffer;
        let contentType = 'image/png';

        if (typeof input === 'string' && input.startsWith('data:')) {
            const matches = input.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
            if (matches) {
                contentType = matches[1];
                buffer = Buffer.from(matches[2], 'base64');
            }
        } else if (typeof input === 'string' && input.startsWith('http')) {
            const response = await fetch(input);
            buffer = Buffer.from(await response.arrayBuffer());
            contentType = response.headers.get('content-type') || 'image/png';
        } else if (typeof input === 'string') {
            buffer = Buffer.from(input, 'base64');
        }

        if (!buffer) return input;

        const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.png`;
        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: filename,
            Body: buffer,
            ContentType: contentType,
        });

        await s3Client.send(command);
        const publicUrl = process.env.R2_PUBLIC_URL.replace(/\/$/, '');
        return `${publicUrl}/${filename}`;
    } catch (err) {
        console.error('[R2] Upload error:', err.message);
        return input; // Fallback to base64 if upload fails
    }
}

async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS mannequins (
                id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                name        TEXT NOT NULL,
                front_url   TEXT NOT NULL DEFAULT '',
                back_url    TEXT DEFAULT '',
                created_at  TIMESTAMPTZ DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS products (
                id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                name          TEXT NOT NULL,
                type          TEXT NOT NULL DEFAULT 'vetement',
                environment   TEXT DEFAULT 'parquet',
                mannequin_id  TEXT REFERENCES mannequins(id) ON DELETE SET NULL,
                source_images JSONB DEFAULT '{}',
                status        TEXT DEFAULT 'done',
                created_at    TIMESTAMPTZ DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS generated_photos (
                id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                label       TEXT NOT NULL,
                approved    BOOLEAN DEFAULT false,
                created_at  TIMESTAMPTZ DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS photo_versions (
                id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                photo_id   TEXT NOT NULL REFERENCES generated_photos(id) ON DELETE CASCADE,
                url        TEXT NOT NULL,
                prompt     TEXT,
                version    INT NOT NULL DEFAULT 1,
                created_at TIMESTAMPTZ DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS conversation_messages (
                id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                photo_id      TEXT NOT NULL REFERENCES generated_photos(id) ON DELETE CASCADE,
                role          TEXT NOT NULL,
                text          TEXT,
                image_url     TEXT,
                version_label TEXT,
                created_at    TIMESTAMPTZ DEFAULT now()
            );
        `);
        console.log('✅ Database tables initialized');
    } finally {
        client.release();
    }
}

// ── Middleware ────────────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '50mb' }));

const generateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    message: { error: 'Trop de requêtes — réessaie dans une minute.' },
});
app.use('/api/generate', generateLimiter);

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
app.use('/output', express.static(OUTPUT_DIR));

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function validateImagePayload(img, index) {
    if (!img || typeof img !== 'object') return `Image ${index + 1}: payload invalide`;
    if (!img.data || typeof img.data !== 'string') return `Image ${index + 1}: données manquantes`;
    if (!ALLOWED_MIME_TYPES.includes(img.mime)) return `Image ${index + 1}: type MIME non supporté (${img.mime})`;
    const sizeBytes = Math.ceil(img.data.length * 0.75);
    if (sizeBytes > MAX_IMAGE_SIZE_BYTES) return `Image ${index + 1}: taille dépasse 10 Mo`;
    return null;
}

async function downloadToBase64(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
}

// ── Health ───────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected' });
    } catch {
        res.json({ status: 'ok', db: 'disconnected' });
    }
});

// ══════════════════════════════════════════════════════════════════════
// ── MANNEQUINS CRUD ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

app.get('/api/mannequins', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, name, front_url AS "frontUrl", back_url AS "backUrl", created_at AS "createdAt" FROM mannequins ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('[Mannequins] GET error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mannequins', async (req, res) => {
    try {
        const { name, frontUrl, backUrl } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const { rows } = await pool.query(
            'INSERT INTO mannequins (name, front_url, back_url) VALUES ($1, $2, $3) RETURNING id, name, front_url AS "frontUrl", back_url AS "backUrl", created_at AS "createdAt"',
            [name, frontUrl || '', backUrl || '']
        );
        console.log(`[Mannequins] ✅ Created: ${rows[0].name}`);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[Mannequins] POST error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/mannequins/:id', async (req, res) => {
    try {
        const { name, frontUrl, backUrl } = req.body;
        const fields = [];
        const values = [];
        let idx = 1;
        if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
        if (frontUrl !== undefined) { fields.push(`front_url = $${idx++}`); values.push(frontUrl); }
        if (backUrl !== undefined) { fields.push(`back_url = $${idx++}`); values.push(backUrl); }
        if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
        values.push(req.params.id);
        const { rows, rowCount } = await pool.query(
            `UPDATE mannequins SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, front_url AS "frontUrl", back_url AS "backUrl", created_at AS "createdAt"`,
            values
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
        console.log(`[Mannequins] ✏️ Updated: ${rows[0].name}`);
        res.json(rows[0]);
    } catch (err) {
        console.error('[Mannequins] PATCH error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/mannequins/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM mannequins WHERE id = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
        console.log(`[Mannequins] 🗑️ Deleted: ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Mannequins] DELETE error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════
// ── PRODUCTS CRUD ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

app.get('/api/products', async (req, res) => {
    try {
        const { rows: products } = await pool.query(`
            SELECT p.id, p.name, p.type, p.environment, p.mannequin_id AS "mannequinId",
                   p.source_images AS "sourceImages", p.status, p.created_at AS "createdAt"
            FROM products p ORDER BY p.created_at DESC
        `);

        // Fetch photos for each product
        for (const product of products) {
            const { rows: photos } = await pool.query(`
                SELECT gp.id, gp.label, gp.approved,
                       COALESCE(json_agg(json_build_object('url', pv.url, 'prompt', pv.prompt)
                           ORDER BY pv.version) FILTER (WHERE pv.id IS NOT NULL), '[]') AS versions
                FROM generated_photos gp
                LEFT JOIN photo_versions pv ON pv.photo_id = gp.id
                WHERE gp.product_id = $1
                GROUP BY gp.id, gp.label, gp.approved, gp.created_at
                ORDER BY gp.created_at
            `, [product.id]);
            product.generatedPhotos = photos;
        }

        res.json(products);
    } catch (err) {
        console.error('[Products] GET error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, type, environment, mannequinId, sourceImages } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const { rows } = await pool.query(
            `INSERT INTO products (name, type, environment, mannequin_id, source_images)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, type, environment, mannequin_id AS "mannequinId",
                       source_images AS "sourceImages", status, created_at AS "createdAt"`,
            [name, type || 'vetement', environment || 'parquet', mannequinId || null, JSON.stringify(sourceImages || {})]
        );
        rows[0].generatedPhotos = [];
        console.log(`[Products] ✅ Created: ${rows[0].name}`);
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[Products] POST error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, name, type, environment, mannequin_id AS "mannequinId",
                    source_images AS "sourceImages", status, created_at AS "createdAt"
             FROM products WHERE id = $1`, [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

        const product = rows[0];
        const { rows: photos } = await pool.query(`
            SELECT gp.id, gp.label, gp.approved,
                   COALESCE(json_agg(json_build_object('url', pv.url, 'prompt', pv.prompt)
                       ORDER BY pv.version) FILTER (WHERE pv.id IS NOT NULL), '[]') AS versions
            FROM generated_photos gp
            LEFT JOIN photo_versions pv ON pv.photo_id = gp.id
            WHERE gp.product_id = $1
            GROUP BY gp.id, gp.label, gp.approved, gp.created_at
            ORDER BY gp.created_at
        `, [req.params.id]);
        product.generatedPhotos = photos;

        res.json(product);
    } catch (err) {
        console.error('[Products] GET/:id error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
        console.log(`[Products] 🗑️ Deleted: ${req.params.id}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[Products] DELETE error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════
// ── GENERATED PHOTOS ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

app.post('/api/products/:id/photos', async (req, res) => {
    try {
        const { label, imageUrl, prompt } = req.body;
        if (!label || !imageUrl) return res.status(400).json({ error: 'label and imageUrl required' });

        // Upload to R2 if it's a data URL
        const finalUrl = await uploadToR2(imageUrl, `product_${req.params.id}`);

        const { rows: photoRows } = await pool.query(
            'INSERT INTO generated_photos (product_id, label) VALUES ($1, $2) RETURNING id, label, approved',
            [req.params.id, label]
        );
        const photo = photoRows[0];

        await pool.query(
            'INSERT INTO photo_versions (photo_id, url, prompt, version) VALUES ($1, $2, $3, 1)',
            [photo.id, finalUrl, prompt || null]
        );

        photo.versions = [{ url: finalUrl, prompt: prompt || null }];
        console.log(`[Photos] ✅ Added: ${label} for product ${req.params.id} (Stored: ${finalUrl.startsWith('http') ? 'R2' : 'Base64'})`);
        res.status(201).json(photo);
    } catch (err) {
        console.error('[Photos] POST error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/photos/:id/approve', async (req, res) => {
    try {
        const approved = req.body.approved !== false;
        const { rowCount } = await pool.query(
            'UPDATE generated_photos SET approved = $1 WHERE id = $2',
            [approved, req.params.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, approved });
    } catch (err) {
        console.error('[Photos] PATCH error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════
// ── CONVERSATION ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

app.get('/api/photos/:id/conversation', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, role, text, image_url AS "imageUrl", version_label AS "versionLabel", created_at AS "createdAt"
             FROM conversation_messages WHERE photo_id = $1 ORDER BY created_at`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[Conversation] GET error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/photos/:id/conversation', async (req, res) => {
    try {
        const { role, text, imageUrl, versionLabel } = req.body;
        if (!role) return res.status(400).json({ error: 'role is required' });

        // Upload to R2 if assistant provided an image
        const finalUrl = imageUrl ? await uploadToR2(imageUrl, `edit_${req.params.id}`) : null;

        const { rows } = await pool.query(
            `INSERT INTO conversation_messages (photo_id, role, text, image_url, version_label)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, role, text, image_url AS "imageUrl", version_label AS "versionLabel", created_at AS "createdAt"`,
            [req.params.id, role, text || null, finalUrl, versionLabel || null]
        );

        // If assistant message with image, also add a photo version
        if (role === 'assistant' && finalUrl) {
            const { rows: countRows } = await pool.query(
                'SELECT COUNT(*) AS cnt FROM photo_versions WHERE photo_id = $1',
                [req.params.id]
            );
            const nextVersion = parseInt(countRows[0].cnt) + 1;
            await pool.query(
                'INSERT INTO photo_versions (photo_id, url, prompt, version) VALUES ($1, $2, $3, $4)',
                [req.params.id, finalUrl, text || null, nextVersion]
            );
        }

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[Conversation] POST error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════
// ── EXISTING: GENERATION + SAVE-BATCH ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

app.post('/api/save-batch', async (req, res) => {
    try {
        const { images, labels } = req.body;
        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ error: 'No images to save' });
        }
        for (let i = 0; i < images.length; i++) {
            if (typeof images[i] !== 'string' || !images[i].startsWith('data:image/')) {
                return res.status(400).json({ error: `Image ${i + 1}: format data URL invalide` });
            }
            const sizeBytes = Math.ceil(images[i].length * 0.75);
            if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
                return res.status(400).json({ error: `Image ${i + 1}: taille dépasse 10 Mo` });
            }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const batchDir = path.join(OUTPUT_DIR, timestamp);
        await fs.promises.mkdir(batchDir, { recursive: true });

        const savedPaths = [];
        for (let i = 0; i < images.length; i++) {
            const label = labels?.[i] || `photo_${i + 1}`;
            const base64Data = images[i].replace(/^data:image\/\w+;base64,/, '');
            const filePath = path.join(batchDir, `${label}.png`);
            await fs.promises.writeFile(filePath, Buffer.from(base64Data, 'base64'));
            savedPaths.push(`/output/${timestamp}/${label}.png`);
        }

        console.log(`[Save] 💾 Batch saved to output/${timestamp}/ (${savedPaths.length} images)`);
        res.json({ directory: `output/${timestamp}`, paths: savedPaths, count: savedPaths.length });
    } catch (error) {
        console.error('[Save] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate/openrouter', async (req, res) => {
    try {
        const { images, description } = req.body;
        if (!images || images.length === 0) return res.status(400).json({ error: 'Missing images' });

        for (let i = 0; i < images.length; i++) {
            const err = validateImagePayload(images[i], i);
            if (err) return res.status(400).json({ error: err });
        }

        console.log(`\n[OpenRouter] 🎨 Generating...`);
        console.log(`[OpenRouter] Prompt: ${description}`);

        const contentArray = [
            { type: "text", text: description },
            ...images.map(img => ({
                type: "image_url",
                image_url: { url: `data:${img.mime || 'image/jpeg'};base64,${img.data}` }
            })),
        ];

        const model = req.body.model || 'black-forest-labs/flux.2-klein-4b';
        const isGemini = model.startsWith('google/');
        const bodyPayload = {
            model,
            messages: [{ role: "user", content: contentArray }],
        };
        if (isGemini) {
            bodyPayload.modalities = ["image", "text"];
            bodyPayload.image_config = { aspect_ratio: "1:1" };
            bodyPayload.provider = { order: ["google-ai-studio"] };
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(120_000),
            headers: {
                'Authorization': `Bearer ${OPENROUTER_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3001',
                'X-Title': 'Vinted AI'
            },
            body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
            throw new Error(err.error?.message || `OpenRouter error: ${response.status}`);
        }

        const result = await response.json();
        console.log('[OpenRouter] Raw response message:', JSON.stringify(result.choices?.[0]?.message, null, 2));

        const msg = result.choices?.[0]?.message;
        let imageUrl = null;

        // Format 1: message.images[] (OpenRouter modalities format)
        const outputImages = msg?.images || [];
        if (outputImages.length > 0) imageUrl = outputImages[0]?.image_url?.url;

        // Format 2: message.content as array (Gemini native format)
        if (!imageUrl && Array.isArray(msg?.content)) {
            const imgPart = msg.content.find(c => c.type === 'image_url');
            if (imgPart) imageUrl = imgPart.image_url?.url;
        }

        // Format 3: message.content as markdown string
        if (!imageUrl && typeof msg?.content === 'string') {
            const match = msg.content.match(/!\[.*?\]\((https?:\/\/[^\s]+)\)/) || msg.content.match(/!\[.*?\]\((data:image[^\s]+)\)/);
            if (match) imageUrl = match[1];
        }

        if (!imageUrl) {
            console.error('[OpenRouter] No image in response:', JSON.stringify(result.choices?.[0]?.message, null, 2));
            return res.status(500).json({ error: "Le modèle n'a pas généré d'image. Il s'agit peut-être d'un refus de sécurité (visage humain reconnu)." });
        }

        console.log(`[OpenRouter] ✅ Image generated`);

        const imageBase64 = imageUrl.startsWith('data:image')
            ? imageUrl.split(',')[1]
            : await downloadToBase64(imageUrl);

        res.json({ imageBase64 });
    } catch (error) {
        console.error('[OpenRouter] Error:', error.message);
        res.status(error.status || 500).json({ error: error.message });
    }
});

// ── Frontend is served separately by Next.js ────────────────────────

// ── Start server ─────────────────────────────────────────────────────
initDB()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 Vinted AI Backend — http://localhost:${PORT}`);
            console.log(`📡 Health: http://localhost:${PORT}/api/health`);
            console.log(`💾 Output: ${OUTPUT_DIR}\n`);
        });
    })
    .catch((err) => {
        console.error('❌ Failed to initialize database:', err.message);
        process.exit(1);
    });
