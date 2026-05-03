"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { Sparkles, FolderOpen, Eye } from "lucide-react"
import type { StudioView, ReviewContext } from "./studio-app"
import type { GeneratedPhoto, Mannequin, QueuedProduct, SavedProduct } from "@/lib/studio-types"
import { BatchView } from "./views/batch-view"
import { ProductsView } from "./views/products-view"
import { ReviewView } from "./views/review-view"

interface CenterPanelProps {
  view: StudioView
  onViewChange: (v: StudioView) => void
  activeMannequin: Mannequin
  mannequins: Mannequin[]
  savedProducts: SavedProduct[]
  reviewContext: ReviewContext | null
  onOpenSavedProduct: (p: SavedProduct) => void
  onBatchComplete: (products: QueuedProduct[]) => void
  onOpenEditor: (photo: GeneratedPhoto, productName: string) => void
  onChangeMannequin: () => void
}

export function CenterPanel({
  view,
  onViewChange,
  activeMannequin,
  mannequins,
  savedProducts,
  reviewContext,
  onOpenSavedProduct,
  onBatchComplete,
  onOpenEditor,
  onChangeMannequin,
}: CenterPanelProps) {
  const tabs = useMemo(
    () =>
      [
        { id: "batch" as const, label: "Nouveau Batch", icon: Sparkles },
        { id: "products" as const, label: "Mes Produits", icon: FolderOpen },
        { id: "review" as const, label: "Review", icon: Eye, hidden: !reviewContext },
      ].filter((t) => !t.hidden),
    [reviewContext],
  )

  return (
    <div className="flex flex-1 min-w-0 flex-col">
      {/* Top tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800/60 bg-zinc-950/60 px-4 py-2 backdrop-blur-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = view === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onViewChange(tab.id)}
              className={cn(
                "group inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                active ? "bg-zinc-900 text-white" : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200",
              )}
            >
              <Icon
                className={cn("h-4 w-4", active ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300")}
              />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* View body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === "batch" && (
          <BatchView
            activeMannequin={activeMannequin}
            onChangeMannequin={onChangeMannequin}
            onBatchComplete={(products) => {
              onBatchComplete(products)
            }}
          />
        )}
        {view === "products" && (
          <ProductsView products={savedProducts} mannequins={mannequins} onOpen={onOpenSavedProduct} />
        )}
        {view === "review" && reviewContext && (
          <ReviewView
            context={reviewContext}
            onOpenEditor={onOpenEditor}
            onBack={() => onViewChange("products")}
          />
        )}
      </div>
    </div>
  )
}
