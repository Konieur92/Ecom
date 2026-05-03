import type { Mannequin, SavedProduct, ConversationMessage, GeneratedPhoto } from "./studio-types"

const API = "" // same origin — Next.js rewrites proxy to backend

// ── Mannequins ───────────────────────────────────────────────────────

export async function fetchMannequins(): Promise<Mannequin[]> {
  const res = await fetch(`${API}/api/mannequins`)
  if (!res.ok) throw new Error("Failed to fetch mannequins")
  return res.json()
}

export async function createMannequin(data: { name: string; frontUrl: string; backUrl: string }): Promise<Mannequin> {
  const res = await fetch(`${API}/api/mannequins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create mannequin")
  return res.json()
}

export async function deleteMannequin(id: string): Promise<void> {
  const res = await fetch(`${API}/api/mannequins/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete mannequin")
}

// ── Products ─────────────────────────────────────────────────────────

export async function fetchProducts(): Promise<SavedProduct[]> {
  const res = await fetch(`${API}/api/products`)
  if (!res.ok) throw new Error("Failed to fetch products")
  const raw = await res.json()
  return raw.map((p: Record<string, unknown>) => ({
    id: p.id,
    name: p.name,
    date: formatDate(p.createdAt as string),
    mannequinId: p.mannequinId || "",
    coverUrl: getProductCover(p),
    approvedCount: ((p.generatedPhotos as GeneratedPhoto[]) || []).filter((gp) => gp.approved).length,
    totalCount: ((p.generatedPhotos as GeneratedPhoto[]) || []).length,
    generatedPhotos: p.generatedPhotos || [],
  }))
}

export async function createProduct(data: {
  name: string
  type: string
  environment: string
  mannequinId: string
  sourceImages: Record<string, string>
}): Promise<{ id: string }> {
  const res = await fetch(`${API}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to create product")
  return res.json()
}

export async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`${API}/api/products/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error("Failed to delete product")
}

// ── Photos ───────────────────────────────────────────────────────────

export async function addGeneratedPhoto(
  productId: string,
  data: { label: string; imageUrl: string; prompt?: string },
): Promise<GeneratedPhoto> {
  const res = await fetch(`${API}/api/products/${productId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to save generated photo")
  return res.json()
}

export async function approvePhoto(photoId: string, approved = true): Promise<void> {
  const res = await fetch(`${API}/api/photos/${photoId}/approve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  })
  if (!res.ok) throw new Error("Failed to approve photo")
}

// ── Conversation ─────────────────────────────────────────────────────

export async function fetchConversation(photoId: string): Promise<ConversationMessage[]> {
  const res = await fetch(`${API}/api/photos/${photoId}/conversation`)
  if (!res.ok) throw new Error("Failed to fetch conversation")
  return res.json()
}

export async function addConversationMessage(
  photoId: string,
  data: { role: string; text?: string; imageUrl?: string; versionLabel?: string },
): Promise<ConversationMessage> {
  const res = await fetch(`${API}/api/photos/${photoId}/conversation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error("Failed to add message")
  return res.json()
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "À l'instant"
  if (diffMin < 60) return `Il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Il y a ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return "Hier"
  return `Il y a ${diffD} jours`
}

function getProductCover(p: Record<string, unknown>): string {
  const photos = (p.generatedPhotos as GeneratedPhoto[]) || []
  if (photos.length > 0 && photos[0].versions?.length > 0) {
    return photos[0].versions[0].url
  }
  return ""
}
