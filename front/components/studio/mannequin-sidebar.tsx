"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { Menu, Plus, Trash2, Upload, Sparkles, Pencil, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Mannequin } from "@/lib/studio-types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface MannequinSidebarProps {
  mannequins: Mannequin[]
  activeId: string
  collapsed: boolean
  onToggleCollapse: () => void
  onSelect: (id: string) => void
  onAdd: (m: Mannequin) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function MannequinSidebar({
  mannequins,
  activeId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: MannequinSidebarProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl transition-[width] duration-300 ease-out",
        collapsed ? "w-[76px]" : "w-[260px]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800/60 px-4 py-4">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 transition-colors"
          aria-label={collapsed ? "Étendre la sidebar" : "Réduire la sidebar"}
        >
          <Menu className="h-5 w-5" />
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-lg shadow-indigo-500/30">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight text-white truncate">Studio AI</h1>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Photos Produits</p>
            </div>
          </div>
        )}
      </div>

      {/* Section title */}
      {!collapsed && (
        <div className="px-4 pt-5 pb-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Mannequins</h2>
          <p className="mt-1 text-[11px] text-zinc-600">{mannequins.length} disponibles</p>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {mannequins.map((m) => (
          <MannequinCard
            key={m.id}
            mannequin={m}
            active={m.id === activeId}
            collapsed={collapsed}
            onSelect={() => onSelect(m.id)}
            onRename={(name) => onRename(m.id, name)}
            onDelete={() => onDelete(m.id)}
          />
        ))}

        {mannequins.length === 0 && !collapsed && (
          <div className="py-6 text-center">
            <p className="text-xs text-zinc-600">Aucun mannequin</p>
            <p className="text-[11px] text-zinc-700 mt-1">Ajoutez-en un pour commencer</p>
          </div>
        )}

        {/* Add button */}
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={cn(
            "group mt-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-700/70 bg-zinc-900/40 transition-all hover:border-indigo-500/60 hover:bg-indigo-500/5",
            collapsed ? "justify-center p-2" : "p-3",
          )}
          aria-label="Ajouter un mannequin"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-zinc-700 group-hover:border-indigo-500/60 group-hover:text-indigo-400">
            <Plus className="h-4 w-4 text-zinc-500 group-hover:text-indigo-400" />
          </div>
          {!collapsed && (
            <span className="text-sm text-zinc-400 group-hover:text-zinc-100">Ajouter un mannequin</span>
          )}
        </button>
      </div>

      <AddMannequinDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={(m) => {
          onAdd(m)
          setDialogOpen(false)
        }}
      />
    </aside>
  )
}

function MannequinCard({
  mannequin,
  active,
  collapsed,
  onSelect,
  onRename,
  onDelete,
}: {
  mannequin: Mannequin
  active: boolean
  collapsed: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(mannequin.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraft(mannequin.name)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== mannequin.name) onRename(trimmed)
    setEditing(false)
  }

  const cancelEdit = () => {
    setDraft(mannequin.name)
    setEditing(false)
  }

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-zinc-900/60 backdrop-blur-xl transition-all duration-200 cursor-pointer",
        collapsed ? "justify-center p-2" : "p-2.5",
        active
          ? "border-indigo-500/60 shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500/40"
          : "border-zinc-800/60 hover:border-zinc-700 hover:scale-[1.02]",
      )}
      onClick={editing ? undefined : onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (editing) return
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="relative h-12 w-12 shrink-0">
        {mannequin.frontUrl ? (
          <Image
            src={mannequin.frontUrl}
            alt={mannequin.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover ring-1 ring-zinc-800"
            unoptimized
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-700">
            <span className="text-lg text-zinc-500">{mannequin.name.charAt(0).toUpperCase()}</span>
          </div>
        )}
        {active && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-zinc-950 bg-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit()
                  if (e.key === "Escape") cancelEdit()
                }}
                className="w-full rounded border border-indigo-500/60 bg-zinc-800 px-1.5 py-0.5 text-sm text-zinc-100 focus:outline-none"
                autoFocus
              />
              <button type="button" onClick={commitEdit} className="text-emerald-400 hover:text-emerald-300" aria-label="Valider">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300" aria-label="Annuler">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <p className="truncate text-sm font-medium text-zinc-100">{mannequin.name}</p>
          )}
          {active ? (
            <p className="text-[11px] font-medium text-emerald-400">Actif</p>
          ) : (
            <p className="text-[11px] text-zinc-500">Disponible</p>
          )}
        </div>
      )}

      {!collapsed && !editing && (
        <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={startEdit}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-indigo-500/20 hover:text-indigo-400"
            aria-label={`Renommer ${mannequin.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-400"
            aria-label={`Supprimer ${mannequin.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function AddMannequinDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (m: Mannequin) => void
}) {
  const [name, setName] = useState("")
  const [frontUrl, setFrontUrl] = useState("")
  const [backUrl, setBackUrl] = useState("")

  const handleSubmit = () => {
    onSubmit({
      id: `temp-${Date.now()}`,
      name: name || "Nouveau mannequin",
      frontUrl,
      backUrl,
    })
    setName("")
    setFrontUrl("")
    setBackUrl("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950/95 backdrop-blur-2xl text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-zinc-50">Ajouter un mannequin</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Téléversez les photos face et dos de votre mannequin pour les réutiliser dans vos shootings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <DropZone label="Photo Face" value={frontUrl} onChange={setFrontUrl} />
            <DropZone label="Photo Dos" value={backUrl} onChange={setBackUrl} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wider text-zinc-500">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Sophie — Studio"
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-zinc-800 bg-transparent px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500"
          >
            Sauvegarder
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DropZone({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="group relative flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 text-zinc-500 transition hover:border-indigo-500/60 hover:bg-indigo-500/5 hover:text-indigo-300 overflow-hidden"
    >
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <Upload className="h-5 w-5" />
          <span className="text-xs font-medium">{label}</span>
          <span className="text-[10px] text-zinc-600">Glissez ou cliquez</span>
        </>
      )}
      {value && (
        <span className="absolute bottom-2 left-2 rounded-md bg-zinc-950/80 px-2 py-1 text-[10px] font-medium text-zinc-100 backdrop-blur">
          {label}
        </span>
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
    </button>
  )
}
