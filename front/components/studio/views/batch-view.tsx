"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Plus, Rocket, Sparkles, Trash2, Upload, X, Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  ENVIRONMENTS,
  PHOTO_LABELS,
  type Mannequin,
  type ProductType,
  type QueuedProduct,
} from "@/lib/studio-types"
import { createProduct, addGeneratedPhoto } from "@/lib/api"

interface BatchViewProps {
  activeMannequin: Mannequin
  onChangeMannequin: () => void
  onBatchComplete: (products: QueuedProduct[]) => void
}

const SLOT_LABELS = ["Face", "Dos", "Détail", "Côté"] as const
type SlotLabel = (typeof SLOT_LABELS)[number]

const PROMPTS = {
  wornFront: `Image 1: a person. Image 2: a garment. Replace only the clothing/fabric on the person with the garment from Image 2. Preserve exactly: the hands, arms, skin, belly, pose, face, hair, jeans, background. Do not alter any body part. Only swap the fabric layer of the top. Photorealistic.`,
  wornBack: `Image 1: a person wearing an outfit. Image 2: the back of their garment. Show the same person from behind taking a mirror selfie. Pose: back fully to the camera, right arm bent at elbow holding the phone at shoulder height on the right side. The phone screen faces the mirror (away from us) — only the back of the phone with camera lenses is visible to us. The fingers and hand are on the front face of the phone (between phone and mirror) and completely hidden. Left arm relaxed at side. The back of the outfit matches Image 2. Same dark hair, same blue jeans, same room and mirror. No floating fabric, no artifacts. Photorealistic.`,
  worn3quarter: `Image 1: a person taking a mirror selfie. Image 2: the garment they are wearing. Generate the same person taking a 3/4 angle mirror selfie — body turned slightly sideways toward the mirror, phone held up taking the photo. Keep the same outfit from Image 1, same jeans, same mirror and room background. Hands must be anatomically correct with 5 fingers each, no missing or extra fingers. The garment must lay flat with no floating fabric or stray pieces. No AI artifacts. Photorealistic.`,
  flatFront: `Mets ce vêtement bien à plat au sol sur un parquet en bois clair. Vue du dessus, éclairage naturel, style photo Vinted. Ne garde que le vêtement, aucun autre objet.`,
  flatBack: `Mets ce vêtement bien à plat au sol sur un parquet en bois clair. Attention le vêtement est vu de dos. Vue du dessus, éclairage naturel, style photo Vinted. Ne garde que le vêtement.`,
  objectLifestyle: (env: string) => `Place cet objet dans un décor "${env}". Photographie produit professionnelle, style e-commerce, belle lumière naturelle.`,
}

function extractBase64(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  return match ? { mime: match[1], data: match[2] } : { mime: "image/jpeg", data: dataUrl }
}

function makeProduct(index: number): QueuedProduct {
  return {
    id: `p-${Date.now()}-${index}`,
    name: `Produit ${index + 1}`,
    type: "vetement",
    sourceImages: {},
    environment: ENVIRONMENTS[0].value,
    status: "pending",
    generatedPhotos: [],
  }
}

export function BatchView({ activeMannequin, onChangeMannequin, onBatchComplete }: BatchViewProps) {
  const [products, setProducts] = useState<QueuedProduct[]>([makeProduct(0)])
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState({ productIdx: 0, photoIdx: 0, label: "" })
  const generationRef = useRef<{ cancel: boolean }>({ cancel: false })

  useEffect(() => {
    return () => {
      generationRef.current.cancel = true
    }
  }, [])

  const updateProduct = (id: string, patch: Partial<QueuedProduct>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const addProduct = () => {
    setProducts((prev) => [...prev, makeProduct(prev.length)])
  }

  const removeProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  const totalCost = products.length * 3 * 0.016

  const startGeneration = async () => {
    if (products.length === 0 || isGenerating || !activeMannequin) return
    setIsGenerating(true)
    generationRef.current.cancel = false

    const updated: QueuedProduct[] = products.map((p) => ({
      ...p,
      status: "pending",
      generatedPhotos: [],
    }))
    setProducts(updated)

    for (let i = 0; i < updated.length; i++) {
      if (generationRef.current.cancel) break
      const product = updated[i]

      // Create product in DB
      let dbProductId: string
      try {
        const dbProduct = await createProduct({
          name: product.name,
          type: product.type,
          environment: product.environment,
          mannequinId: activeMannequin.id,
          sourceImages: product.sourceImages as Record<string, string>,
        })
        dbProductId = dbProduct.id
      } catch (err) {
        console.error("Failed to create product:", err)
        continue
      }

      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "generating" } : p)))

      // Collect source image data for the generation API
      const mannequinFront = activeMannequin?.frontUrl ? extractBase64(activeMannequin.frontUrl) : null
      const productFront = product.sourceImages["Face"] ? extractBase64(product.sourceImages["Face"]) : null
      const productBack = product.sourceImages["Dos"] ? extractBase64(product.sourceImages["Dos"]) : null

      let generatedFrontImage: string | null = null

      for (let j = 0; j < PHOTO_LABELS.length; j++) {
        if (generationRef.current.cancel) break
        const label = PHOTO_LABELS[j]
        setProgress({ productIdx: i, photoIdx: j, label })

        let photoUrl = ""
        try {
          let prompt = ""
          let imagesForApi: { mime: string; data: string }[] = []

          if (product.type === "vetement") {
            if (j === 0) { // Porté Face
              if (mannequinFront && productFront) {
                prompt = PROMPTS.wornFront
                imagesForApi = [mannequinFront, productFront]
              }
            } else if (j === 1) { // Porté Dos
              const base = generatedFrontImage ? extractBase64(generatedFrontImage) : mannequinFront
              const source = productBack || productFront
              if (base && source) {
                prompt = PROMPTS.wornBack
                imagesForApi = [base, source]
              }
            } else if (j === 2) { // Détail / 3/4
              const base = generatedFrontImage ? extractBase64(generatedFrontImage) : mannequinFront
              if (base && productFront) {
                prompt = PROMPTS.worn3quarter
                imagesForApi = [base, productFront]
              }
            }
          } else { // Objet
            const source = productFront || productBack || (product.sourceImages["Détail"] ? extractBase64(product.sourceImages["Détail"]) : null)
            if (source) {
              const envLabel = ENVIRONMENTS.find(e => e.value === product.environment)?.label || product.environment
              prompt = PROMPTS.objectLifestyle(envLabel)
              imagesForApi = [source]
            }
          }

          if (imagesForApi.length > 0 && prompt) {
            // Call the real generation API
            const genRes = await fetch("/api/generate/openrouter", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                images: imagesForApi,
                description: prompt,
              }),
            })
            if (genRes.ok) {
              const { imageBase64 } = await genRes.json()
              photoUrl = `data:image/png;base64,${imageBase64}`
              if (j === 0) {
                generatedFrontImage = photoUrl // Save for next iterations
              }
            } else {
              const errData = await genRes.json().catch(() => ({ error: "Generation failed" }))
              console.error(`[Gen] Error for ${label}:`, errData.error)
              photoUrl = ""
            }
          } else {
            console.warn(`[Gen] Missing source images for ${label}`)
          }
        } catch (err) {
          console.error(`[Gen] Error for ${label}:`, err)
        }

        // Save to DB
        let savedPhoto
        if (photoUrl) {
          try {
            savedPhoto = await addGeneratedPhoto(dbProductId, {
              label,
              imageUrl: photoUrl,
              prompt: `${label} — ${product.name}`,
            })
          } catch (err) {
            console.error("Failed to save photo:", err)
          }
        }

        const newPhoto = {
          id: savedPhoto?.id || `gp-${product.id}-${j}`,
          label,
          versions: [{ url: photoUrl || "" }], // Ensure at least one version exists to prevent frontend crash
          approved: false,
        }

        product.generatedPhotos.push(newPhoto)
        setProducts((prev) =>
          prev.map((p) =>
            p.id === product.id
              ? { ...p, generatedPhotos: [...product.generatedPhotos] }
              : p,
          ),
        )
      }

      product.status = "done"
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, status: "done" } : p)))
    }

    setIsGenerating(false)
    if (!generationRef.current.cancel) {
      onBatchComplete(updated)
    }
  }

  const totalPhotos = products.length * 3
  const completedPhotos = products.reduce((acc, p) => acc + p.generatedPhotos.length, 0)
  const progressPct = totalPhotos > 0 ? (completedPhotos / totalPhotos) * 100 : 0

  return (
    <div className="flex h-full flex-col">
      {/* Active mannequin bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/40 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {activeMannequin?.frontUrl ? (
            <Image
              src={activeMannequin.frontUrl}
              alt={activeMannequin.name}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover ring-1 ring-indigo-500/40"
              unoptimized
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-700">
              <span className="text-sm text-zinc-500">{activeMannequin?.name?.charAt(0) || "?"}</span>
            </div>
          )}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Mannequin actif</p>
            <p className="text-sm font-medium text-zinc-100">{activeMannequin?.name || "Aucun"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onChangeMannequin}
          className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Changer →
        </button>
      </div>

      {/* No mannequin warning */}
      {!activeMannequin && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <p className="text-zinc-400 text-sm">Ajoutez un mannequin pour commencer</p>
          </div>
        </div>
      )}

      {activeMannequin && (
        <>
          {/* Product queue */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-4xl space-y-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-white">File d&apos;attente</h2>
                <p className="text-sm text-zinc-400">
                  Ajoutez vos produits, configurez les photos sources, puis lancez la génération.
                </p>
              </div>

              <div className="space-y-3">
                {products.map((product, idx) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onUpdate={(patch) => updateProduct(product.id, patch)}
                    onRemove={() => removeProduct(product.id)}
                    isOnly={products.length === 1}
                    isGenerating={isGenerating && progress.productIdx === idx && product.status === "generating"}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={addProduct}
                disabled={isGenerating}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-800 bg-transparent py-4 text-sm font-medium text-zinc-400 transition-all hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:text-indigo-300 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Ajouter un produit
              </button>

              <div className="h-32" />
            </div>
          </div>

          {/* Sticky bottom bar */}
          <div className="sticky bottom-0 shrink-0 border-t border-zinc-800/60 bg-zinc-950/90 px-6 py-4 backdrop-blur-xl">
            <div className="mx-auto max-w-4xl">
              {isGenerating ? (
                <GenerationProgress
                  progressPct={progressPct}
                  productIdx={progress.productIdx}
                  total={products.length}
                  label={progress.label}
                  productName={products[progress.productIdx]?.name ?? ""}
                />
              ) : (
                <button
                  type="button"
                  onClick={startGeneration}
                  disabled={products.length === 0}
                  className="group relative flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-3.5 text-sm font-semibold text-white shadow-xl shadow-indigo-500/30 transition-all hover:from-indigo-500 hover:to-indigo-600 disabled:cursor-not-allowed disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
                >
                  <span className="flex items-center gap-2">
                    <Rocket className="h-4 w-4" />
                    Générer ({products.length} {products.length > 1 ? "produits" : "produit"} × 3 photos)
                  </span>
                  <span className="rounded-md bg-black/20 px-2 py-1 text-xs font-medium tabular-nums">
                    ≈ ${totalCost.toFixed(2)}
                  </span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ProductCard({
  product,
  onUpdate,
  onRemove,
  isOnly,
  isGenerating,
}: {
  product: QueuedProduct
  onUpdate: (patch: Partial<QueuedProduct>) => void
  onRemove: () => void
  isOnly: boolean
  isGenerating: boolean
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border bg-zinc-900/60 backdrop-blur-xl transition-all",
        product.status === "done"
          ? "border-emerald-500/40 shadow-lg shadow-emerald-500/10"
          : isGenerating
            ? "border-indigo-500/50 shadow-lg shadow-indigo-500/20"
            : "border-zinc-800/60 hover:border-zinc-700",
      )}
    >
      {product.status === "done" && (
        <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 ring-2 ring-zinc-950">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800/60 px-4 py-3">
        <input
          type="text"
          value={product.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1 bg-transparent text-sm font-medium text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />

        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950/60 p-0.5">
          {(["vetement", "objet"] as ProductType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onUpdate({ type: t })}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                product.type === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t === "vetement" ? "Vêtement" : "Objet"}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={isOnly}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
          aria-label="Supprimer le produit"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Body — 4 upload slots */}
      <div className="flex gap-3 px-4 py-4">
        {SLOT_LABELS.map((label) => (
          <UploadSlot
            key={label}
            label={label}
            value={product.sourceImages[label]}
            onChange={(url) =>
              onUpdate({ sourceImages: { ...product.sourceImages, [label]: url } })
            }
            onClear={() => {
              const next = { ...product.sourceImages }
              delete next[label]
              onUpdate({ sourceImages: next })
            }}
          />
        ))}
      </div>

      {/* Footer — environment select */}
      <div className="flex items-center gap-2 border-t border-zinc-800/60 px-4 py-3">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">Environnement</span>
        <div className="relative">
          <select
            value={product.environment}
            onChange={(e) => onUpdate({ environment: e.target.value })}
            className="appearance-none rounded-md border border-zinc-800 bg-zinc-950/60 py-1.5 pl-3 pr-8 text-xs font-medium text-zinc-200 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
          >
            {ENVIRONMENTS.map((env) => (
              <option key={env.value} value={env.value} className="bg-zinc-900">
                {env.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        </div>
      </div>

      {/* Generated thumbnails when done */}
      {product.generatedPhotos.length > 0 && (
        <div className="flex items-center gap-2 border-t border-zinc-800/60 bg-emerald-500/5 px-4 py-3">
          <span className="text-[11px] uppercase tracking-wider text-emerald-400/80">Générées</span>
          <div className="flex gap-2">
            {product.generatedPhotos.map((photo) => (
              <div
                key={photo.id}
                className="group relative h-14 w-11 overflow-hidden rounded-md border border-emerald-500/30 animate-in fade-in zoom-in-95 duration-500"
              >
                {photo.versions[0]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.versions[0].url}
                    alt={photo.label}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-zinc-800 flex items-center justify-center">
                    <span className="text-[8px] text-zinc-500">Erreur</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UploadSlot({
  label,
  value,
  onChange,
  onClear,
}: {
  label: SlotLabel
  value?: string
  onChange: (url: string) => void
  onClear: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => {
      onChange(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="group relative h-[100px] w-[80px] shrink-0">
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className="h-full w-full rounded-lg object-cover ring-1 ring-zinc-800"
          />
          <span className="absolute bottom-1 left-1 rounded bg-zinc-950/80 px-1.5 py-0.5 text-[9px] font-medium text-zinc-100 backdrop-blur">
            {label}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg group-hover:flex"
            aria-label={`Retirer ${label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 text-zinc-600 transition hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:text-indigo-300"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">{label}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}

function GenerationProgress({
  progressPct,
  productIdx,
  total,
  label,
  productName,
}: {
  progressPct: number
  productIdx: number
  total: number
  label: string
  productName: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 animate-bounce text-indigo-400" />
          <p className="text-sm font-medium text-zinc-100">
            Produit {productIdx + 1}/{total} —{" "}
            <span className="text-zinc-400">
              {productName} · {label}…
            </span>
          </p>
        </div>
        <p className="text-xs font-medium tabular-nums text-zinc-400">{Math.round(progressPct)}%</p>
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-zinc-900">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.6)] transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 h-full w-full animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  )
}
