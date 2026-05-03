import { useState, useCallback } from 'react'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_FILE_SIZE_MB = 10

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `Type non supporté : ${file.type || 'inconnu'}. Formats acceptés : JPEG, PNG, WebP, GIF.`
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `Fichier trop lourd : ${(file.size / 1024 / 1024).toFixed(1)} Mo (max ${MAX_FILE_SIZE_MB} Mo).`
  }
  return null
}

export function useImageUpload() {
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [mannequinImages, setMannequinImages] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingMannequin, setIsDraggingMannequin] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFiles = useCallback(async (files: FileList | File[], target: 'product' | 'mannequin' = 'product') => {
    setUploadError(null)
    const fileArray = Array.from(files)
    const newImages: string[] = []

    for (const file of fileArray) {
      const err = validateFile(file)
      if (err) {
        setUploadError(err)
        return
      }
      newImages.push(await readFileAsDataUrl(file))
    }

    if (newImages.length === 0) return
    if (target === 'mannequin') setMannequinImages(prev => [...prev, ...newImages])
    else setSelectedImages(prev => [...prev, ...newImages])
  }, [])

  const removeImage = useCallback((index: number) =>
    setSelectedImages(prev => prev.filter((_, i) => i !== index)), [])

  const removeMannequin = useCallback((index: number) =>
    setMannequinImages(prev => prev.filter((_, i) => i !== index)), [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.currentTarget === e.target) setIsDragging(false)
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files, 'product')
  }, [handleFiles])

  const handleMannequinDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingMannequin(true)
  }, [])
  const handleMannequinDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.currentTarget === e.target) setIsDraggingMannequin(false)
  }, [])
  const handleMannequinDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }, [])
  const handleMannequinDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDraggingMannequin(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files, 'mannequin')
  }, [handleFiles])

  return {
    selectedImages,
    mannequinImages,
    isDragging,
    isDraggingMannequin,
    uploadError,
    handleFiles,
    removeImage,
    removeMannequin,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleMannequinDragEnter,
    handleMannequinDragLeave,
    handleMannequinDragOver,
    handleMannequinDrop,
  }
}
