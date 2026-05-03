const fs = require('fs');
const path = require('path');

const OPENROUTER_KEY = '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';

const screenshots = fs.readdirSync(__dirname).filter(f => f.includes(‘22.59’)).sort();
if (screenshots.length < 2) { console.error(‘Could not find screenshot files’); process.exit(1); }
const mannequinPath = path.join(__dirname, screenshots[0]);
const garmentPath   = path.join(__dirname, screenshots[1]);
console.log(‘Mannequin:’, screenshots[0]);
console.log(‘Garment:  ‘, screenshots[1]);

function toBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

const prompts = [
  {
    name: 'current',
    text: 'Image 1: a mannequin. Image 2: a garment/clothing item. Generate a new photo: the same mannequin from Image 1 now wearing the exact clothing from Image 2. The face, pose, hands, and background must be identical to Image 1. The garment from Image 2 must be visibly fitted on the mannequin. Photorealistic result.',
  },
  {
    name: 'swap',
    text: 'Replace the top/shirt worn by the person in Image 1 with the red halter top shown in Image 2. Keep everything else identical: the person, pose, jeans, background. Photorealistic clothing swap.',
  },
  {
    name: 'native',
    text: 'Take the person in image 1. Dress them in the red halter top from image 2. Keep their face hidden (phone in front), same jeans, same mirror selfie pose and background.',
  },
];

async function test(prompt) {
  console.log(`\n--- Testing prompt: "${prompt.name}" ---`);

  const img1 = toBase64(mannequinPath);
  const img2 = toBase64(garmentPath);

  const contentArray = [
    { type: 'image_url', image_url: { url: `data:image/png;base64,${img1}` } },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${img2}` } },
    { type: 'text', text: prompt.text },
  ];

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'Vinted AI Test',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '1:1' },
      provider: { order: ['google-ai-studio'] },
      messages: [{ role: 'user', content: contentArray }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('API error:', err);
    return;
  }

  const result = await res.json();
  const msg = result.choices?.[0]?.message;

  // Try format 1: message.images[]
  let imageUrl = msg?.images?.[0]?.image_url?.url;

  // Try format 2: content as array
  if (!imageUrl && Array.isArray(msg?.content)) {
    const imgPart = msg.content.find(c => c.type === 'image_url');
    if (imgPart) imageUrl = imgPart.image_url?.url;
  }

  if (!imageUrl) {
    console.error('No image in response. Message:', JSON.stringify(msg, null, 2).slice(0, 500));
    return;
  }

  const base64 = imageUrl.startsWith('data:image') ? imageUrl.split(',')[1] : imageUrl;
  const outPath = path.join(__dirname, `test-result-${prompt.name}.png`);
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  console.log(`✅ Saved to ${outPath}`);
}

(async () => {
  for (const p of prompts) {
    await test(p);
  }
})();
