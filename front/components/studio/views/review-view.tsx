"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Pencil, RefreshCw, ChevronLeft, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReviewContext } from "../studio-app"
import type { GeneratedPhoto } from "@/lib/studio-types"

interface ReviewViewProps {
  context: ReviewContext
  onOpenEditor: (photo: GeneratedPhoto, productName: string) => void
  onBack: () => void
}

export function ReviewView({ context, onOpenEditor, onBack }: ReviewViewProps) {
  const { product } = context
  const [photoIndex, setPhotoIndex] = useState(context.photoIndex)
  const [approved, setApproved] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    product.generatedPhotos.forEach((p) => {
      initial[p.id] = p.approved
    })
    return initial
  })

  const photos = product.generatedPhotos
  const photo = photos[photoIndex]
  const total = photos.length

  const next = useCallback(() => {
    setPhotoIndex((i) => Math.min(i + 1, total - 1))
  }, [total])

  const prev = useCallback(() => {
    setPhotoIndex((i) => Math.max(i - 1, 0))
  }, [])

  const approve = useCallback(() => {
    if (!photo) return
    setApproved((prev) => ({ ...prev, [photo.id]: true }))
    if (photoIndex < total - 1) {
      setTimeout(() => next(), 200)
    }
  }, [photo, photoIndex, total, next])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "ArrowRight") next()
      else if (e.key === "ArrowLeft") prev()
      else if (e.key === "a" || e.key === "A") approve()
      else if (e.key === "e" || e.key === "E") photo && onOpenEditor(photo, product.name)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [next, prev, approve, photo, product.name, onOpenEditor])

  if (!photo) return null

  return (
    <div className="relative flex h-full flex-col bg-zinc-950/95 backdrop-blur-xl">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </button>

        <div className="text-center">
          <p className="text-sm font-medium text-zinc-100">{product.name}</p>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">
            Photo {photoIndex + 1}/{total}
          </p>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Main */}
      <div className="relative flex flex-1 min-h-0 items-center justify-center px-12 py-6">
        {/* Prev button */}
        <button
          type="button"
          onClick={prev}
          disabled={photoIndex === 0}
          className="absolute left-6 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-300 backdrop-blur-xl transition hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Photo précédente"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Photo */}
        <div className="relative flex h-full max-h-[70vh] flex-col items-center justify-center">
          <span className="absolute -top-3 left-3 z-10 inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-3 py-1 text-[11px] font-medium text-indigo-300 backdrop-blur-md">
            {photo.label}
          </span>

          {approved[photo.id] && (
            <span className="absolute -top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur-md">
              <Check className="h-3 w-3" />
              Approuvée
            </span>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id}
            src={photo.versions[0].url || "/placeholder.svg"}
            alt={photo.label}
            className="h-full max-h-[70vh] w-auto rounded-xl object-contain shadow-2xl shadow-black/50 ring-1 ring-zinc-800/60 animate-in fade-in zoom-in-95 duration-300"
          />
        </div>

        {/* Next button */}
        <button
          type="button"
          onClick={next}
          disabled={photoIndex === total - 1}
          className="absolute right-6 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/80 text-zinc-300 backdrop-blur-xl transition hover:border-zinc-700 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Photo suivante"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      {/* Action bar */}
      <div className="flex flex-col items-center gap-4 border-t border-zinc-800/60 px-6 py-4">
        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={approve}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-lg transition-all",
              approved[photo.id]
                ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                : "bg-emerald-500 text-white shadow-emerald-500/30 hover:bg-emerald-400",
            )}
          >
            <Check className="h-4 w-4" />
            {approved[photo.id] ? "Approuvée" : "Approuver"}
          </button>

          <button
            type="button"
            onClick={() => onOpenEditor(photo, product.name)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-zinc-600 hover:bg-zinc-800"
          >
            <Pencil className="h-4 w-4" />
            Modifier
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20"
          >
            <RefreshCw className="h-4 w-4" />
            Régénérer
          </button>
        </div>

        {/* Filmstrip */}
        <div className="flex items-center gap-2">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPhotoIndex(i)}
              className={cn(
                "relative h-16 w-12 overflow-hidden rounded-md transition-all",
                i === photoIndex
                  ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950 scale-105"
                  : "ring-1 ring-zinc-800 opacity-60 hover:opacity-100",
              )}
              aria-label={`Aller à la photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.versions[0].url || "/placeholder.svg"}
                alt={p.label}
                className="h-full w-full object-cover"
              />
              {approved[p.id] && (
                <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-2 w-2 text-white" strokeWidth={4} />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Hint */}
        <p className="text-[11px] text-zinc-600">
          <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">←</kbd>{" "}
          <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">→</kbd>{" "}
          naviguer ·{" "}
          <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">A</kbd>{" "}
          approuver ·{" "}
          <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">E</kbd>{" "}
          modifier
        </p>
      </div>
    </div>
  )
}
