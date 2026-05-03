import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, Image as ImageIcon, Sparkles, ShoppingBag, Box, AlertCircle, Download, CheckCircle2, FolderOpen, X, User } from 'lucide-react'
import { useGeneration } from '@/hooks/useGeneration'
import { useImageUpload } from '@/hooks/useImageUpload'
import { downloadFile } from '@/lib/utils'

export default function App() {
  const {
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
  } = useImageUpload()

  const [selectedEnv, setSelectedEnv] = useState(() => localStorage.getItem('vinted_env') || 'Parquet Chêne')
  const [lifestyleEnv, setLifestyleEnv] = useState(() => localStorage.getItem('vinted_lifestyle') || 'Bureau Minimaliste')

  useEffect(() => {
    localStorage.setItem('vinted_env', selectedEnv)
    localStorage.setItem('vinted_lifestyle', lifestyleEnv)
  }, [selectedEnv, lifestyleEnv])

  const { generatedImages, imageLabels, isGenerating, savedPath, error, currentStep, runGeneration, handleDownloadAll } =
    useGeneration({ selectedImages, mannequinImages, selectedEnv, lifestyleEnv })

  const productViewLabels = ['Vue face', 'Vue dos', 'Détail', 'Côté']
  const resultLabels = ['Porté Face', 'Porté Dos', 'À plat Face', 'À plat Dos']

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-4 md:p-8 font-sans">
      <header className="max-w-6xl mx-auto mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <Sparkles className="text-indigo-600 h-8 w-8" />
          Vinted AI Transformer
        </h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          Transformer vos photos AliExpress en visuels organiques Vinted — <span className="text-indigo-500 font-medium">Powered by OpenRouter</span>
        </p>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-5 space-y-6">

          {/* Mannequin Upload */}
          <Card className="border-none shadow-xl bg-white dark:bg-neutral-900 overflow-hidden">
            <CardHeader className="bg-purple-50/50 dark:bg-purple-900/10">
              <CardTitle className="text-xl flex items-center gap-2">
                <User className="h-5 w-5 text-purple-600" />
                Photo Mannequin
              </CardTitle>
              <CardDescription>Photo de la personne qui portera les vêtements (face ou dos)</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div
                className={`relative border-2 border-dashed rounded-xl p-4 flex items-center gap-3 transition-all cursor-pointer min-h-[80px]
                  ${isDraggingMannequin ? 'border-purple-500 bg-purple-50/30 scale-[1.02]' : ''}
                  ${mannequinImages.length > 0 ? 'border-purple-400 bg-purple-50/10' : 'border-neutral-200 hover:border-purple-400 hover:bg-neutral-50'}`}
                onClick={() => document.getElementById('mannequin-upload')?.click()}
                onDragEnter={handleMannequinDragEnter}
                onDragLeave={handleMannequinDragLeave}
                onDragOver={handleMannequinDragOver}
                onDrop={handleMannequinDrop}
              >
                {mannequinImages.length > 0 ? (
                  <div className="flex gap-2 w-full" onClick={e => e.stopPropagation()}>
                    {mannequinImages.map((img, i) => (
                      <div key={i} className="relative group h-16 w-16 rounded-lg overflow-hidden border shadow-sm shrink-0">
                        <img src={img} alt={`Mannequin ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          aria-label={`Supprimer mannequin ${i + 1}`}
                          className="absolute top-0.5 right-0.5 bg-red-500/80 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeMannequin(i)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    <div
                      className="h-16 w-16 rounded-lg border-2 border-dashed border-neutral-200 flex items-center justify-center cursor-pointer hover:border-purple-400 transition-all shrink-0"
                      onClick={() => document.getElementById('mannequin-upload')?.click()}
                    >
                      <Upload className="h-4 w-4 text-neutral-400" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 w-full">
                    <div className="h-12 w-12 bg-purple-100 dark:bg-purple-800/30 rounded-full flex items-center justify-center shrink-0">
                      <User className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-600">Glisser-déposer ou cliquer</p>
                      <p className="text-xs text-neutral-400">Optionnel — sinon utilise le mannequin de référence serveur</p>
                    </div>
                  </div>
                )}
                <input type="file" id="mannequin-upload" className="hidden" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { if (e.target.files) handleFiles(e.target.files, 'mannequin') }} />
              </div>
            </CardContent>
          </Card>

          {/* Product Upload */}
          <Card className="border-none shadow-xl bg-white dark:bg-neutral-900 overflow-hidden">
            <CardHeader className="bg-indigo-50/50 dark:bg-indigo-900/10">
              <CardTitle className="text-xl">Photos Produit</CardTitle>
              <CardDescription>Uploadez les photos AliExpress (face + dos minimum)</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {uploadError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {uploadError}
                </div>
              )}
              <div
                className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all cursor-pointer min-h-[200px]
                  ${isDragging ? 'border-indigo-500 bg-indigo-50/30 scale-[1.02]' : ''}
                  ${selectedImages.length > 0 ? 'border-indigo-400 bg-indigo-50/10' : 'border-neutral-200 hover:border-indigo-400 hover:bg-neutral-50'}`}
                onClick={() => document.getElementById('image-upload')?.click()}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {selectedImages.length > 0 ? (
                  <div className="w-full" onClick={(e) => e.stopPropagation()}>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedImages.map((img, i) => (
                        <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border shadow-sm">
                          <img src={img} alt={`Product ${i + 1}`} className="h-full w-full object-cover" />
                          <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                            {productViewLabels[i] || `Photo ${i + 1}`}
                          </div>
                          <button
                            aria-label={`Supprimer photo ${i + 1}`}
                            className="absolute top-1.5 right-1.5 bg-red-500/80 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            onClick={() => removeImage(i)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <div
                        className="aspect-square rounded-lg border-2 border-dashed border-neutral-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-neutral-50 transition-all"
                        onClick={() => document.getElementById('image-upload')?.click()}
                      >
                        <Upload className="h-5 w-5 text-neutral-400 mb-1" />
                        <span className="text-[10px] text-neutral-400">Ajouter</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={`h-16 w-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4 transition-transform ${isDragging ? 'scale-125' : ''}`}>
                      <Upload className={`h-8 w-8 ${isDragging ? 'text-indigo-500' : 'text-neutral-400'}`} />
                    </div>
                    <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                      {isDragging ? 'Déposez les images ici' : 'Glisser-déposer ou cliquer pour uploader'}
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">Photos produit face + dos (minimum 2 photos)</p>
                  </>
                )}
                <input type="file" id="image-upload" className="hidden" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { if (e.target.files) handleFiles(e.target.files, 'product') }} />
              </div>
            </CardContent>
          </Card>

          {/* Config + Generate */}
          <Card className="border-none shadow-xl bg-white dark:bg-neutral-900">
            <CardHeader>
              <CardTitle className="text-xl">Configuration Batch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="clothing" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="clothing" className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" /> Habits
                  </TabsTrigger>
                  <TabsTrigger value="object" className="flex items-center gap-2">
                    <Box className="h-4 w-4" /> Objets
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="clothing" className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="env-select">Environnement À Plat</Label>
                    <select
                      id="env-select"
                      value={selectedEnv}
                      onChange={(e) => setSelectedEnv(e.target.value)}
                      className="w-full h-10 px-3 py-2 rounded-md border border-neutral-200 bg-white dark:bg-neutral-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option>Parquet Chêne</option>
                      <option>Moquette Grise</option>
                      <option>Carrelage Blanc</option>
                    </select>
                  </div>

                  <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-lg text-sm text-indigo-700 dark:text-indigo-300">
                    <p className="font-medium mb-1">Fiche produit = 4 photos</p>
                    <p className="text-xs text-indigo-500">1 portée face + 1 portée dos + 2 à plat (via OpenRouter)</p>
                  </div>

                  <Button
                    className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg font-semibold shadow-lg shadow-indigo-500/20"
                    disabled={selectedImages.length === 0 || isGenerating}
                    onClick={() => runGeneration('clothing')}
                  >
                    {isGenerating ? `${currentStep || 'Génération...'}` : 'Lancer le Batch (4 photos)'}
                  </Button>

                  <p className="text-xs text-center text-neutral-400">
                    Coût estimé : ~$0.048 par fiche • FLUX Kontext
                  </p>
                </TabsContent>

                <TabsContent value="object" className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="lifestyle-select">Ambiance Lifestyle</Label>
                    <select
                      id="lifestyle-select"
                      value={lifestyleEnv}
                      onChange={(e) => setLifestyleEnv(e.target.value)}
                      className="w-full h-10 px-3 py-2 rounded-md border border-neutral-200 bg-white dark:bg-neutral-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option>Bureau Minimaliste</option>
                      <option>Salon Scandinave</option>
                      <option>Chambre Cosy</option>
                    </select>
                  </div>
                  <Button
                    className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg font-semibold shadow-lg shadow-indigo-500/20"
                    disabled={selectedImages.length === 0 || isGenerating}
                    onClick={() => runGeneration('object')}
                  >
                    {isGenerating ? `${currentStep || 'Génération...'}` : 'Générer Batch Objet (4 photos)'}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        <section className="lg:col-span-7">
          <Card className="h-full border-none shadow-xl bg-white dark:bg-neutral-900">
            <CardHeader className="border-b dark:border-neutral-800 shadow-sm flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="text-indigo-600" />
                Résultats du Batch
              </CardTitle>
              {generatedImages.length > 0 && !isGenerating && (
                <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={handleDownloadAll}>
                  <Download className="h-4 w-4" />
                  Télécharger tout
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-6">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-lg text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {savedPath && (
                <div className="mb-6 p-4 bg-green-50 border border-green-100 text-green-700 rounded-lg text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Batch sauvegardé automatiquement !</p>
                    <p className="flex items-center gap-1 mt-1 text-green-600">
                      <FolderOpen className="h-3.5 w-3.5" />
                      {savedPath}
                    </p>
                  </div>
                </div>
              )}

              {!isGenerating && generatedImages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
                  <ImageIcon className="h-16 w-16 mb-4 opacity-20" />
                  <p className="text-sm font-medium">Les photos générées apparaîtront ici</p>
                  <p className="text-xs mt-1 text-neutral-300">2 portées (face + dos) + 2 à plat</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {generatedImages.map((img, i) => (
                  <div key={i} className="group relative aspect-[3/4] rounded-xl overflow-hidden shadow-md border animate-in zoom-in duration-300">
                    <img src={img} alt={resultLabels[i] || `Photo ${i + 1}`} className="h-full w-full object-cover" />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
                      {resultLabels[i] || `Photo ${i + 1}`}
                    </div>
                    <button
                      aria-label={`Télécharger ${resultLabels[i] || `photo ${i + 1}`}`}
                      className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:bg-black/80"
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadFile(img, `${imageLabels[i] || `photo_${i + 1}`}.png`)
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {isGenerating && (
                  Array.from({ length: 4 - generatedImages.length }).map((_, i) => (
                    <div key={`loading-${i}`} className="aspect-[3/4] rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-neutral-300 animate-bounce" />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}
