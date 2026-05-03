const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'

const PROMPTS = {
  wornFront: `Image 1: a person. Image 2: a garment. Replace only the clothing/fabric on the person with the garment from Image 2. Preserve exactly: the hands, arms, skin, belly, pose, face, hair, jeans, background. Do not alter any body part. Only swap the fabric layer of the top. Photorealistic.`,
  wornBack: `Image 1: a person wearing an outfit. Image 2: the back of their garment. Show the same person from behind taking a mirror selfie. Pose: back fully to the camera, right arm bent at elbow holding the phone at shoulder height on the right side. The phone screen faces the mirror (away from us) — only the back of the phone with camera lenses is visible to us. The fingers and hand are on the front face of the phone (between phone and mirror) and completely hidden. Left arm relaxed at side. The back of the outfit matches Image 2. Same dark hair, same blue jeans, same room and mirror. No floating fabric, no artifacts. Photorealistic.`,
  worn3quarter: `Image 1: a person taking a mirror selfie. Image 2: the garment they are wearing. Generate the same person taking a 3/4 angle mirror selfie — body turned slightly sideways toward the mirror, phone held up taking the photo. Keep the same outfit from Image 1, same jeans, same mirror and room background. Hands must be anatomically correct with 5 fingers each, no missing or extra fingers. The garment must lay flat with no floating fabric or stray pieces. No AI artifacts. Photorealistic.`,
  flatFront: `Mets ce vêtement bien à plat au sol sur un parquet en bois clair. Vue du dessus, éclairage naturel, style photo Vinted. Ne garde que le vêtement, aucun autre objet.`,
  flatBack: `Mets ce vêtement bien à plat au sol sur un parquet en bois clair. Attention le vêtement est vu de dos. Vue du dessus, éclairage naturel, style photo Vinted. Ne garde que le vêtement.`,
  objectLifestyle: (env: string) => `Place cet objet dans un décor "${env}". Photographie produit professionnelle, style e-commerce, belle lumière naturelle.`,
}

interface ImagePayload {
  data: string
  mime: string
}

function extractBase64(dataUrl: string): ImagePayload {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  if (match) return { data: match[2], mime: match[1] }
  return { data: dataUrl, mime: 'image/jpeg' }
}

async function callOpenRouter(images: ImagePayload[], description: string, signal?: AbortSignal): Promise<string> {
  // Combine the user's AbortSignal with a 130 s frontend timeout
  const timeout = AbortSignal.timeout(130_000)
  const combined = signal
    ? AbortSignal.any([signal, timeout])
    : timeout

  const response = await fetch(`${API_BASE}/api/generate/openrouter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, description }),
    signal: combined,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText })) as { error?: string }
    throw new Error(err.error || `OpenRouter error: ${response.status}`)
  }
  const result = await response.json() as { imageBase64?: string }
  if (!result.imageBase64) throw new Error('Réponse invalide du serveur : imageBase64 manquant')
  return `data:image/png;base64,${result.imageBase64}`
}

export async function generateVintedPhoto(params: {
  images: string[]
  mannequinImages?: string[]
  generatedFrontImage?: string
  mode: 'clothing' | 'object'
  type?: 'worn' | 'flat-lay'
  photoIndex?: number
  env?: string
  signal?: AbortSignal
}): Promise<string> {
  const { images, mannequinImages, generatedFrontImage, type, photoIndex, env, signal } = params
  const idx = photoIndex ?? 0

  const mannequin = mannequinImages?.length ? extractBase64(mannequinImages[0]) : null
  const productFront = images.length > 0 ? extractBase64(images[0]) : null
  const productBack = images.length > 1 ? extractBase64(images[1]) : null

  if (params.mode === 'clothing') {
    if (type === 'worn' && idx === 0) {
      if (!mannequin || !productFront) throw new Error('Photo mannequin et photo produit (face) requises pour le porté face')
      return callOpenRouter([mannequin, productFront], PROMPTS.wornFront, signal)
    }

    if (type === 'worn' && idx === 1) {
      const base = generatedFrontImage ? extractBase64(generatedFrontImage) : mannequin
      const source = productBack ?? productFront
      if (!base || !source) throw new Error('Photo générée (face) et photo produit (dos) requises pour le porté dos')
      return callOpenRouter([base, source], PROMPTS.wornBack, signal)
    }

    if (type === 'worn' && idx === 2) {
      const base = generatedFrontImage ? extractBase64(generatedFrontImage) : mannequin
      if (!base || !productFront) throw new Error('Photo générée (face) et photo produit requises pour le 3/4')
      return callOpenRouter([base, productFront], PROMPTS.worn3quarter, signal)
    }

    if (type === 'flat-lay') {
      const isFront = idx === 3 || idx === 0
      const source = isFront ? (productFront ?? productBack) : (productBack ?? productFront)
      if (!source) throw new Error('No product image available')
      return callOpenRouter([source], isFront ? PROMPTS.flatFront : PROMPTS.flatBack, signal)
    }
  }

  // Object mode
  const source = productFront ?? productBack
  if (!source) throw new Error('No product image available')
  return callOpenRouter([source], PROMPTS.objectLifestyle(env ?? 'Bureau Minimaliste'), signal)
}

export async function saveBatch(
  images: string[],
  labels: string[],
): Promise<{ directory: string; paths: string[] }> {
  const response = await fetch(`${API_BASE}/api/save-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, labels }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Save failed' })) as { error?: string }
    throw new Error(err.error || 'Failed to save batch')
  }
  return response.json() as Promise<{ directory: string; paths: string[] }>
}
