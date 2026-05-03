import { useState, useRef } from 'react'
import { generateVintedPhoto, saveBatch } from '@/services/api-client'
import { downloadFile } from '@/lib/utils'

const STEP_NAMES: Record<'clothing' | 'object', string[]> = {
  clothing: ['👗 Porté Face', '🔄 Porté Dos', '📐 À plat Face', '📐 À plat Dos'],
  object: ['🖼 Lifestyle 1', '🖼 Lifestyle 2', '🔍 Close-up', '🖼 Lifestyle 3'],
}

const CLOTHING_LABELS = ['porte_face', 'porte_dos', 'plat_face', 'plat_dos']
const GENERATION_COUNT = 1
const MAX_RETRIES = 2

async function withRetry<T>(fn: () => Promise<T>, _signal: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const error = err as Error
      if (error.name === 'AbortError') throw error
      if (attempt === MAX_RETRIES) throw error
      await new Promise(res => setTimeout(res, 1000 * 2 ** attempt))
    }
  }
  throw new Error('unreachable')
}

export function useGeneration({
  selectedImages,
  mannequinImages,
  selectedEnv,
  lifestyleEnv,
}: {
  selectedImages: string[]
  mannequinImages: string[]
  selectedEnv: string
  lifestyleEnv: string
}) {
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [imageLabels, setImageLabels] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const runGeneration = async (mode: 'clothing' | 'object') => {
    if (selectedImages.length === 0) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsGenerating(true)
    setGeneratedImages([])
    setImageLabels([])
    setError(null)
    setSavedPath(null)

    const results: string[] = []
    const labels: string[] = []

    try {
      for (let i = 0; i < GENERATION_COUNT; i++) {
        setCurrentStep(`${STEP_NAMES[mode][i]} (${i + 1}/${GENERATION_COUNT})...`)

        const type = mode === 'clothing' ? (i < 2 ? 'worn' as const : 'flat-lay' as const) : undefined
        const label = mode === 'clothing' ? CLOTHING_LABELS[i] : `objet_${i + 1}`

        const img = await withRetry(
          () => generateVintedPhoto({
            images: selectedImages,
            mannequinImages: mannequinImages.length > 0 ? mannequinImages : undefined,
            mode,
            type,
            photoIndex: i,
            env: mode === 'clothing' ? selectedEnv : lifestyleEnv,
            signal: controller.signal,
          }),
          controller.signal,
        )

        results.push(img)
        labels.push(label)
        setGeneratedImages([...results])
        setImageLabels([...labels])
      }

      setCurrentStep('')

      try {
        const saveResult = await saveBatch(results, labels)
        setSavedPath(saveResult.directory)
      } catch (saveErr: unknown) {
        console.error('[Save] Failed to auto-save:', (saveErr as Error).message)
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message || 'Erreur de génération')
    } finally {
      abortRef.current = null
      setIsGenerating(false)
      setCurrentStep('')
    }
  }

  const handleDownloadAll = () => {
    generatedImages.forEach((img, i) => {
      downloadFile(img, `${imageLabels[i] || `photo_${i + 1}`}.png`)
    })
  }

  return { generatedImages, imageLabels, isGenerating, savedPath, error, currentStep, runGeneration, handleDownloadAll }
}
