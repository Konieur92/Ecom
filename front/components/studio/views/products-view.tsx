"use client"

import Image from "next/image"
import { FolderOpen, ImageIcon, AlertTriangle, CheckCircle2 } from "lucide-react"
import type { Mannequin, SavedProduct } from "@/lib/studio-types"

interface ProductsViewProps {
  products: SavedProduct[]
  mannequins: Mannequin[]
  onOpen: (p: SavedProduct) => void
}

export function ProductsView({ products, mannequins, onOpen }: ProductsViewProps) {
  if (products.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <ImageIcon className="h-24 w-24 text-zinc-800" strokeWidth={1} />
        <div>
          <h3 className="text-lg font-medium text-zinc-300">Aucun produit pour l&apos;instant</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Lancez un nouveau batch pour générer vos premières photos produits.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-white">Mes Produits</h2>
            <p className="text-sm text-zinc-400">
              {products.length} {products.length > 1 ? "produits générés" : "produit généré"}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 backdrop-blur-xl">
            <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-400">Trié par récent</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductFolderCard
              key={product.id}
              product={product}
              mannequin={mannequins.find((m) => m.id === product.mannequinId)}
              onClick={() => onOpen(product)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProductFolderCard({
  product,
  mannequin,
  onClick,
}: {
  product: SavedProduct
  mannequin?: Mannequin
  onClick: () => void
}) {
  const isComplete = product.approvedCount === product.totalCount && product.totalCount > 0
  const pendingCount = product.totalCount - product.approvedCount

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/60 backdrop-blur-xl text-left transition-all duration-200 hover:scale-[1.02] hover:border-zinc-700 hover:shadow-2xl hover:shadow-black/50"
    >
      {/* Cover image */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-zinc-900">
        {product.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.coverUrl}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <ImageIcon className="h-12 w-12 text-zinc-800" />
          </div>
        )}

        {/* Status badge */}
        {product.totalCount > 0 && (
          <div className="absolute right-3 top-3">
            {isComplete ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur-md">
                <CheckCircle2 className="h-3 w-3" />
                {product.approvedCount}/{product.totalCount} approuvées
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-300 backdrop-blur-md">
                <AlertTriangle className="h-3 w-3" />
                {pendingCount} à vérifier
              </span>
            )}
          </div>
        )}

        {/* Photo count overlay */}
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md bg-zinc-950/70 px-2 py-1 text-[11px] font-medium text-zinc-100 backdrop-blur-md">
          <ImageIcon className="h-3 w-3" />
          {product.totalCount} photos
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-3 border-t border-zinc-800/60 p-3">
        {mannequin && mannequin.frontUrl ? (
          <Image
            src={mannequin.frontUrl}
            alt={mannequin.name}
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-zinc-800"
            unoptimized
          />
        ) : mannequin ? (
          <div className="h-7 w-7 shrink-0 rounded-full bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-700">
            <span className="text-xs text-zinc-500">{mannequin.name.charAt(0)}</span>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">{product.name}</p>
          <p className="text-[11px] text-zinc-500">
            {product.date}
            {mannequin && ` · ${mannequin.name}`}
          </p>
        </div>
      </div>
    </button>
  )
}
