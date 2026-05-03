"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, Check, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type ConversationMessage,
  type GeneratedPhoto,
} from "@/lib/studio-types"
import { fetchConversation, addConversationMessage } from "@/lib/api"

interface EditorPanelProps {
  open: boolean
  photo: GeneratedPhoto | null
  productName: string
  onClose: () => void
}

export function EditorPanel({ open, photo, productName, onClose }: EditorPanelProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState("")
  const [activeVersion, setActiveVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load conversation from API when photo changes
  useEffect(() => {
    if (!photo || !open) return
    setMessages([])
    fetchConversation(photo.id)
      .then(setMessages)
      .catch((err) => console.error("Failed to load conversation:", err))
  }, [photo?.id, open])

  // Versions: original photo + every assistant image
  const versions = photo
    ? [
        { url: photo.versions[0]?.url || "", label: "v1" },
        ...messages
          .filter((m) => m.role === "assistant" && m.imageUrl)
          .map((m, i) => ({ url: m.imageUrl!, label: m.versionLabel ?? `v${i + 2}` })),
      ]
    : []

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isLoading])

  useEffect(() => {
    if (open && photo) {
      setActiveVersion(versions.length - 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, photo?.id])

  const handleSend = async () => {
    if (!input.trim() || isLoading || !photo) return
    const text = input.trim()

    // Add user message to UI immediately
    const tempUserMsg: ConversationMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      text,
    }
    setMessages((prev) => [...prev, tempUserMsg])
    setInput("")
    setIsLoading(true)

    try {
      // Save user message to DB
      await addConversationMessage(photo.id, { role: "user", text })

      // Call generation API with the current image + instruction
      const currentUrl = versions[activeVersion]?.url || photo.versions[0]?.url || ""
      let imageData = ""
      let mime = "image/png"

      if (currentUrl.startsWith("data:")) {
        const match = currentUrl.match(/^data:(image\/\w+);base64,(.+)$/)
        if (match) {
          mime = match[1]
          imageData = match[2]
        }
      }

      if (imageData) {
        const genRes = await fetch("/api/generate/openrouter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            images: [{ mime, data: imageData }],
            description: text,
          }),
        })

        if (genRes.ok) {
          const { imageBase64 } = await genRes.json()
          const newImageUrl = `data:image/png;base64,${imageBase64}`
          const versionNumber = messages.filter((m) => m.role === "assistant" && m.imageUrl).length + 2
          const versionLabel = `v${versionNumber}`

          // Save assistant message with image
          const saved = await addConversationMessage(photo.id, {
            role: "assistant",
            text: "Voici une nouvelle proposition basée sur votre instruction.",
            imageUrl: newImageUrl,
            versionLabel,
          })

          setMessages((prev) => [
            ...prev,
            {
              id: saved.id,
              role: "assistant",
              text: "Voici une nouvelle proposition basée sur votre instruction.",
              imageUrl: newImageUrl,
              versionLabel,
            },
          ])
          setActiveVersion(versionNumber - 1)
        } else {
          // Generation failed, add error message
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: "assistant",
              text: "Désolé, la génération a échoué. Réessayez avec une instruction différente.",
            },
          ])
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            text: "Impossible de modifier cette image (pas de données disponibles).",
          },
        ])
      }
    } catch (err) {
      console.error("Editor send error:", err)
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: "Une erreur est survenue. Réessayez.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const currentImageUrl = versions[activeVersion]?.url ?? photo?.versions[0]?.url ?? ""

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 z-10 bg-black/30 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          "absolute right-0 top-0 z-20 flex h-full w-[380px] flex-col border-l border-zinc-800/60 bg-zinc-950/95 backdrop-blur-2xl shadow-2xl shadow-black/50 transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/60 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {photo && (
                <span className="inline-flex rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                  {photo.label}
                </span>
              )}
              <span className="truncate text-sm font-medium text-zinc-100">{productName}</span>
            </div>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-zinc-500">Éditeur IA</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
            aria-label="Fermer l'éditeur"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {photo && (
          <>
            {/* Preview */}
            <div className="shrink-0 px-4 pt-4">
              <div className="relative mx-auto aspect-[3/4] w-full max-h-[40vh] overflow-hidden rounded-xl ring-1 ring-zinc-800">
                {currentImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={currentImageUrl}
                    src={currentImageUrl}
                    alt={photo.label}
                    className="h-full w-full object-cover animate-in fade-in duration-300"
                  />
                ) : (
                  <div className="h-full w-full bg-zinc-900 flex items-center justify-center">
                    <span className="text-xs text-zinc-600">Pas d&apos;image</span>
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-md bg-zinc-950/80 px-2 py-0.5 text-[10px] font-medium text-zinc-100 backdrop-blur">
                  {versions[activeVersion]?.label}
                </span>
              </div>

              {/* Versions */}
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-2">
                {versions.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveVersion(i)}
                    className={cn(
                      "relative h-14 w-11 shrink-0 overflow-hidden rounded-md transition-all",
                      i === activeVersion
                        ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-zinc-950"
                        : "ring-1 ring-zinc-800 opacity-60 hover:opacity-100",
                    )}
                  >
                    {v.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.url} alt={v.label} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-zinc-800" />
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-zinc-950/70 py-0.5 text-center text-[9px] font-medium text-zinc-100">
                      {v.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && !isLoading && (
                <div className="text-center py-8">
                  <p className="text-xs text-zinc-600">Aucun message. Envoyez une instruction pour modifier la photo.</p>
                </div>
              )}
              {messages.map((m) => (
                <Message key={m.id} message={m} />
              ))}
              {isLoading && <LoadingMessage />}
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-zinc-800/60 p-3">
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 backdrop-blur-xl focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/40">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend()
                  }}
                  placeholder="Ex: Rends le tissu plus lisse..."
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  aria-label="Envoyer"
                >
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
              >
                <Check className="h-4 w-4" />
                Utiliser cette version
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function Message({ message }: { message: ConversationMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-800 px-3.5 py-2 text-sm text-zinc-100">
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {message.imageUrl && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.imageUrl}
            alt="Version générée"
            className="max-w-[200px] rounded-lg ring-1 ring-zinc-800 animate-in fade-in zoom-in-95 duration-400"
          />
          {message.versionLabel && (
            <span className="absolute left-2 top-2 rounded-md bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100 backdrop-blur">
              {message.versionLabel}
            </span>
          )}
        </div>
      )}
      {message.text && (
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-900 px-3.5 py-2 text-sm text-zinc-300">
          {message.text}
        </div>
      )}
    </div>
  )
}

function LoadingMessage() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-32 w-24 items-center justify-center rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
        <Sparkles className="h-5 w-5 animate-bounce text-indigo-400" />
      </div>
      <div className="space-y-1.5">
        <div className="h-2 w-32 animate-pulse rounded-full bg-zinc-800" />
        <div className="h-2 w-24 animate-pulse rounded-full bg-zinc-800" />
        <div className="h-2 w-20 animate-pulse rounded-full bg-zinc-800" />
      </div>
    </div>
  )
}
