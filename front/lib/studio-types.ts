export interface Mannequin {
  id: string
  name: string
  frontUrl: string
  backUrl: string
}

export interface UploadedImage {
  id: string
  url: string
  label: "Face" | "Dos" | "Détail" | "Côté"
}

export type ProductType = "vetement" | "objet"

export interface QueuedProduct {
  id: string
  name: string
  type: ProductType
  sourceImages: Partial<Record<UploadedImage["label"], string>>
  environment: string
  status: "pending" | "generating" | "done"
  generatedPhotos: GeneratedPhoto[]
}

export interface GeneratedPhoto {
  id: string
  label: string
  versions: { url: string; prompt?: string }[]
  approved: boolean
}

export interface SavedProduct {
  id: string
  name: string
  date: string
  mannequinId: string
  coverUrl: string
  approvedCount: number
  totalCount: number
  generatedPhotos: GeneratedPhoto[]
}

export interface ConversationMessage {
  id: string
  role: "user" | "assistant"
  text?: string
  imageUrl?: string
  versionLabel?: string
  loading?: boolean
}

export const ENVIRONMENTS = [
  { value: "parquet", label: "Parquet Chêne" },
  { value: "moquette", label: "Moquette Grise" },
  { value: "carrelage", label: "Carrelage Blanc" },
] as const

export const PHOTO_LABELS = ["Porté Face", "Porté Dos", "Détail Tissu"] as const
