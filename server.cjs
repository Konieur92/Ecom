const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = 3001;

const OPENROUTER_KEY = process.env.OPENROUTER;
if (!OPENROUTER_KEY) {
    console.error('❌ OPENROUTER key missing in .env — exiting');
    process.exit(1);
}

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

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', model: 'black-forest-labs/flux.2-klein-4b (OpenRouter)' });
});

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

// ── Serve built frontend (production / Docker) ──────────────────────
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    // SPA fallback: send index.html for any non-API route
    app.get('*', (req, res) => {
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
    console.log('📦 Serving frontend from dist/');
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Vinted AI Backend — http://localhost:${PORT}`);
    console.log(`📡 Health: http://localhost:${PORT}/api/health`);
    console.log(`💾 Output: ${OUTPUT_DIR}\n`);
});
