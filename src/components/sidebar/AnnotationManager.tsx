import { useState, useEffect, useCallback } from 'react'
import { X, Image, Video, Link, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useViewerStore } from '@/store/viewerStore'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { isValidVimeoUrl } from '@/utils/vimeo'
import type { Annotation, AnnotationLink } from '@/types'

interface AnnotationEditorProps {
  annotation: Annotation
}

function AnnotationEditor({ annotation }: AnnotationEditorProps) {
  const updateAnnotationContent = useViewerStore((s) => s.updateAnnotationContent)

  const [localTitle, setLocalTitle] = useState(annotation.title)
  const [localDesc, setLocalDesc] = useState(annotation.description)
  const [videoInput, setVideoInput] = useState(annotation.videoUrl ?? '')
  const [localLinks, setLocalLinks] = useState<AnnotationLink[]>(annotation.links)

  useEffect(() => {
    setLocalTitle(annotation.title)
    setLocalDesc(annotation.description)
    setVideoInput(annotation.videoUrl ?? '')
    setLocalLinks(annotation.links)
  }, [annotation.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const videoError = videoInput !== '' && !isValidVimeoUrl(videoInput)

  const saveLinks = useCallback(
    (links: AnnotationLink[]) => {
      updateAnnotationContent(annotation.id, { links })
    },
    [annotation.id, updateAnnotationContent]
  )

  const handleLinkChange = useCallback(
    (index: number, field: keyof AnnotationLink, value: string) => {
      setLocalLinks((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
    },
    []
  )

  const handleLinkBlur = useCallback(() => {
    saveLinks(localLinks)
  }, [localLinks, saveLinks])

  const addLink = useCallback(() => {
    const next = [...localLinks, { url: '', label: '' }]
    setLocalLinks(next)
    saveLinks(next)
  }, [localLinks, saveLinks])

  const removeLink = useCallback(
    (index: number) => {
      const next = localLinks.filter((_, i) => i !== index)
      setLocalLinks(next)
      saveLinks(next)
    },
    [localLinks, saveLinks]
  )

  return (
    <div className="space-y-3 pt-2">
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Title</p>
        <input
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value.slice(0, 100))}
          onBlur={() => updateAnnotationContent(annotation.id, { title: localTitle })}
          maxLength={100}
          data-testid="annotation-title-input"
          className="w-full bg-zinc-800 text-white text-xs px-2 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500"
        />
        <span className="text-zinc-600 text-xs">{localTitle.length}/100</span>
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Description</p>
        <textarea
          value={localDesc}
          onChange={(e) => setLocalDesc(e.target.value.slice(0, 2000))}
          onBlur={() => updateAnnotationContent(annotation.id, { description: localDesc })}
          maxLength={2000}
          rows={3}
          data-testid="annotation-description-input"
          className="w-full bg-zinc-800 text-white text-xs px-2 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500 resize-none"
        />
        <span className="text-zinc-600 text-xs">{localDesc.length}/2000</span>
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Images</p>
        <ImageUpload
          annotationId={annotation.id}
          images={annotation.images}
          onImagesChange={(images) => updateAnnotationContent(annotation.id, { images })}
        />
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Video</p>
        <input
          value={videoInput}
          onChange={(e) => setVideoInput(e.target.value)}
          onBlur={() => {
            if (!videoInput || isValidVimeoUrl(videoInput)) {
              updateAnnotationContent(annotation.id, { videoUrl: videoInput || null })
            }
          }}
          placeholder="https://vimeo.com/…"
          data-testid="annotation-video-input"
          className={cn(
            'w-full bg-zinc-800 text-white text-xs px-2 py-1 rounded border outline-none',
            videoError ? 'border-red-500' : 'border-zinc-700 focus:border-blue-500'
          )}
        />
        {videoError && (
          <p className="text-red-400 text-xs mt-0.5">Only Vimeo URLs supported</p>
        )}
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Links</p>
        <div className="space-y-1">
          {localLinks.map((link, i) => (
            <div key={i} className="flex gap-1 items-center">
              <input
                value={link.url}
                onChange={(e) => handleLinkChange(i, 'url', e.target.value)}
                onBlur={handleLinkBlur}
                placeholder="URL"
                data-testid={`annotation-link-url-${i}`}
                className="flex-1 bg-zinc-800 text-white text-xs px-2 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500 min-w-0"
              />
              <input
                value={link.label}
                onChange={(e) => handleLinkChange(i, 'label', e.target.value)}
                onBlur={handleLinkBlur}
                placeholder="Label"
                data-testid={`annotation-link-label-${i}`}
                className="w-20 bg-zinc-800 text-white text-xs px-2 py-1 rounded border border-zinc-700 outline-none focus:border-blue-500 shrink-0"
              />
              <button
                onClick={() => removeLink(i)}
                data-testid={`annotation-link-delete-${i}`}
                aria-label="Remove link"
                className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <button
            onClick={addLink}
            data-testid="annotation-add-link-btn"
            className="text-blue-400 hover:text-blue-300 text-xs transition-colors"
          >
            + Add link
          </button>
        </div>
      </div>
    </div>
  )
}

interface MediaIndicatorsProps {
  annotation: Annotation
}

function MediaIndicators({ annotation }: MediaIndicatorsProps) {
  return (
    <span className="flex items-center gap-0.5 shrink-0">
      {annotation.images.length > 0 && (
        <Image
          size={10}
          className="text-zinc-500"
          aria-label={`${annotation.images.length} images`}
        />
      )}
      {annotation.videoUrl && (
        <Video size={10} className="text-zinc-500" aria-label="Has video" />
      )}
      {annotation.links.length > 0 && (
        <Link
          size={10}
          className="text-zinc-500"
          aria-label={`${annotation.links.length} links`}
        />
      )}
    </span>
  )
}

export function AnnotationManager() {
  const annotations = useViewerStore((s) => s.annotations)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId)
  const openAnnotationPanelIds = useViewerStore((s) => s.openAnnotationPanelIds)
  const selectAnnotation = useViewerStore((s) => s.selectAnnotation)
  const openAnnotationPanel = useViewerStore((s) => s.openAnnotationPanel)
  const closeAnnotationPanel = useViewerStore((s) => s.closeAnnotationPanel)
  const removeAnnotation = useViewerStore((s) => s.removeAnnotation)
  const annotationsPanelOpen = useViewerStore((s) => s.annotationsPanelOpen)
  const setAnnotationsPanelOpen = useViewerStore((s) => s.setAnnotationsPanelOpen)

  const sceneAnnotations = annotations.filter((a) => a.sceneId === activeSceneId)
  const selectedAnnotation = sceneAnnotations.find((a) => a.id === selectedAnnotationId) ?? null

  const handleDelete = useCallback(
    (annotation: Annotation) => {
      if (window.confirm('Delete this annotation?')) {
        removeAnnotation(annotation.id)
        closeAnnotationPanel(annotation.id)
        if (selectedAnnotationId === annotation.id) {
          selectAnnotation(null)
        }
      }
    },
    [removeAnnotation, closeAnnotationPanel, selectAnnotation, selectedAnnotationId]
  )

  return (
    <div data-testid="annotation-manager">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Annotations</p>
          {sceneAnnotations.length > 0 && (
            <span
              className="bg-zinc-700 text-zinc-300 text-[10px] font-mono px-1.5 py-0.5 rounded-full"
              data-testid="annotation-count-badge"
            >
              {sceneAnnotations.length}
            </span>
          )}
        </div>
        <button
          data-testid="annotations-toggle"
          onClick={() => setAnnotationsPanelOpen(!annotationsPanelOpen)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            annotationsPanelOpen ? 'bg-blue-600' : 'bg-zinc-700'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
              annotationsPanelOpen ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {annotationsPanelOpen && (
        <>
          {sceneAnnotations.length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-3">
              No annotations yet. Press <kbd className="bg-zinc-800 px-1 rounded">A</kbd> to add markers.
            </p>
          )}

          {sceneAnnotations.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5 mt-3" data-testid="annotation-list">
              {sceneAnnotations.map((annotation) => {
                const isPanelOpen = openAnnotationPanelIds.includes(annotation.id)
                const isSelected = annotation.id === selectedAnnotationId || isPanelOpen
                return (
                  <div
                    key={annotation.id}
                    data-testid={`annotation-item-${annotation.id}`}
                    onClick={() => {
                      if (isPanelOpen) {
                        closeAnnotationPanel(annotation.id)
                        if (selectedAnnotationId === annotation.id) {
                          selectAnnotation(null)
                        }
                        return
                      }

                      openAnnotationPanel(annotation.id)
                      selectAnnotation(annotation.id)
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors group',
                      isSelected
                        ? 'bg-blue-500/10 border border-blue-500/50'
                        : 'border border-transparent hover:bg-zinc-800'
                    )}
                  >
                    <span
                      className={cn(
                        'flex-1 text-xs truncate',
                        isSelected ? 'text-blue-300' : 'text-zinc-300'
                      )}
                    >
                      {annotation.title || <span className="italic text-zinc-600">Untitled</span>}
                    </span>

                    <MediaIndicators annotation={annotation} />

                    <button
                      data-testid={`annotation-delete-${annotation.id}`}
                      aria-label="Delete annotation"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(annotation)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {selectedAnnotation && (
            <div className="border-t border-zinc-800 mt-3" data-testid="annotation-editor">
              <AnnotationEditor key={selectedAnnotation.id} annotation={selectedAnnotation} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
