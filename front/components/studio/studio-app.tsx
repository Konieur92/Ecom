"use client"

import { useCallback, useEffect, useState } from "react"
import { MannequinSidebar } from "./mannequin-sidebar"
import { CenterPanel } from "./center-panel"
import { EditorPanel } from "./editor-panel"
import {
  type GeneratedPhoto,
  type Mannequin,
  type QueuedProduct,
  type SavedProduct,
} from "@/lib/studio-types"
import {
  fetchMannequins,
  createMannequin,
  updateMannequin,
  deleteMannequin as apiDeleteMannequin,
  fetchProducts,
  deleteProduct as apiDeleteProduct,
} from "@/lib/api"

export type StudioView = "batch" | "products" | "review"

export interface ReviewContext {
  product: QueuedProduct | SavedProduct
  photoIndex: number
}

export function StudioApp() {
  const [mannequins, setMannequins] = useState<Mannequin[]>([])
  const [activeMannequinId, setActiveMannequinId] = useState<string>("")
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([])
  const [view, setView] = useState<StudioView>("batch")
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)

  const [reviewContext, setReviewContext] = useState<ReviewContext | null>(null)
  const [editorPhoto, setEditorPhoto] = useState<GeneratedPhoto | null>(null)
  const [editorProductName, setEditorProductName] = useState<string>("")

  // Load data from API on mount
  useEffect(() => {
    async function load() {
      try {
        const [m, p] = await Promise.all([fetchMannequins(), fetchProducts()])
        setMannequins(m)
        if (m.length > 0) setActiveMannequinId(m[0].id)
        setSavedProducts(p)
      } catch (err) {
        console.error("Failed to load data:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const activeMannequin = mannequins.find((m) => m.id === activeMannequinId) ?? mannequins[0]

  const handleAddMannequin = useCallback(async (m: Mannequin) => {
    try {
      const created = await createMannequin({ name: m.name, frontUrl: m.frontUrl, backUrl: m.backUrl })
      setMannequins((prev) => [...prev, created])
      setActiveMannequinId(created.id)
    } catch (err) {
      console.error("Failed to create mannequin:", err)
    }
  }, [])

  const handleRenameMannequin = useCallback(async (id: string, name: string) => {
    try {
      const updated = await updateMannequin(id, { name })
      setMannequins((prev) => prev.map((m) => (m.id === id ? updated : m)))
    } catch (err) {
      console.error("Failed to rename mannequin:", err)
    }
  }, [])

  const handleDeleteMannequin = useCallback(
    async (id: string) => {
      try {
        await apiDeleteMannequin(id)
        setMannequins((prev) => {
          const next = prev.filter((m) => m.id !== id)
          if (activeMannequinId === id && next.length > 0) {
            setActiveMannequinId(next[0].id)
          }
          return next
        })
      } catch (err) {
        console.error("Failed to delete mannequin:", err)
      }
    },
    [activeMannequinId],
  )

  const handleDeleteProduct = useCallback(async (id: string) => {
    try {
      await apiDeleteProduct(id)
      setSavedProducts((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      console.error("Failed to delete product:", err)
    }
  }, [])

  const refreshProducts = useCallback(async () => {
    try {
      const p = await fetchProducts()
      setSavedProducts(p)
    } catch (err) {
      console.error("Failed to refresh products:", err)
    }
  }, [])

  const openEditor = useCallback((photo: GeneratedPhoto, productName: string) => {
    setEditorPhoto(photo)
    setEditorProductName(productName)
  }, [])

  const closeEditor = useCallback(() => {
    setEditorPhoto(null)
  }, [])

  const openReview = useCallback((product: QueuedProduct | SavedProduct, photoIndex = 0) => {
    setReviewContext({ product, photoIndex })
    setView("review")
  }, [])

  const handleBatchComplete = useCallback(
    async (products: QueuedProduct[]) => {
      // Refresh products from DB
      await refreshProducts()
      if (products.length > 0) {
        // Re-fetch to get the saved version with proper IDs
        const freshProducts = await fetchProducts()
        if (freshProducts.length > 0) {
          openReview(freshProducts[0], 0)
        }
      }
    },
    [refreshProducts, openReview],
  )

  if (loading) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
          <p className="text-sm">Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-svh w-full overflow-hidden bg-zinc-950 text-zinc-100">
      <MannequinSidebar
        mannequins={mannequins}
        activeId={activeMannequinId}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onSelect={setActiveMannequinId}
        onAdd={handleAddMannequin}
        onRename={handleRenameMannequin}
        onDelete={handleDeleteMannequin}
      />

      <main className="relative flex flex-1 min-w-0">
        <CenterPanel
          view={view}
          onViewChange={setView}
          activeMannequin={activeMannequin}
          mannequins={mannequins}
          savedProducts={savedProducts}
          reviewContext={reviewContext}
          onOpenSavedProduct={(p) => openReview(p, 0)}
          onDeleteProduct={handleDeleteProduct}
          onBatchComplete={handleBatchComplete}
          onOpenEditor={openEditor}
          onChangeMannequin={() => setSidebarCollapsed(false)}
        />

        <EditorPanel
          open={editorPhoto !== null}
          photo={editorPhoto}
          productName={editorProductName}
          onClose={closeEditor}
        />
      </main>
    </div>
  )
}
