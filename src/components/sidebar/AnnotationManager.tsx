import { useState, useEffect, useCallback, useMemo } from 'react'
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
  const presentationMode = useViewerStore((s) => s.presentationMode)

  const [localTitle, setLocalTitle] = useState(annotation.title)
  const [localDesc, setLocalDesc] = useState(annotation.description)
  const [videoInput, setVideoInput] = useState(annotation.videoUrl ?? '')
  const [localLinks, setLocalLinks] = useState<AnnotationLink[]>(annotation.links)
  const linkKeys = useMemo(() => {
    const counts = new Map<string, number>()

    return localLinks.map((link) => {
      const base = `${link.url.trim()}::${link.label.trim()}` || 'empty-link'
      const count = counts.get(base) ?? 0
      counts.set(base, count + 1)
      return `${annotation.id}:${base}:${count}`
    })
  }, [annotation.id, localLinks])

  useEffect(() => {
    setLocalTitle(annotation.title)
    setLocalDesc(annotation.description)
    setVideoInput(annotation.videoUrl ?? '')
    setLocalLinks(annotation.links)
  }, [annotation.description, annotation.links, annotation.title, annotation.videoUrl])

  const videoError = videoInput !== '' && !isValidVimeoUrl(videoInput)

  const saveLinks = useCallback(
    (links: AnnotationLink[]) => {
      if (presentationMode) return
      updateAnnotationContent(annotation.id, { links })
    },
    [annotation.id, presentationMode, updateAnnotationContent]
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
        <p className="text-faint text-xs uppercase tracking-wide mb-1">Title</p>
        <input
          value={localTitle}
          onChange={(e) => setLocalTitle(e.target.value.slice(0, 100))}
          onBlur={() => {
            if (presentationMode) return
            updateAnnotationContent(annotation.id, { title: localTitle })
          }}
          maxLength={100}
          data-testid="annotation-title-input"
          className="w-full rounded border border-subtle bg-field px-2 py-1 text-xs text-strong outline-none focus:border-[color:var(--accent-border)]"
        />
        <span className="text-faint text-xs">{localTitle.length}/100</span>
      </div>

      <div className="border-t border-subtle pt-2">
        <p className="text-faint text-xs uppercase tracking-wide mb-1">Description</p>
        <textarea
          value={localDesc}
          onChange={(e) => setLocalDesc(e.target.value.slice(0, 2000))}
          onBlur={() => {
            if (presentationMode) return
            updateAnnotationContent(annotation.id, { description: localDesc })
          }}
          maxLength={2000}
          rows={3}
          data-testid="annotation-description-input"
          className="w-full resize-none rounded border border-subtle bg-field px-2 py-1 text-xs text-strong outline-none focus:border-[color:var(--accent-border)]"
        />
        <span className="text-faint text-xs">{localDesc.length}/2000</span>
      </div>

      <div className="border-t border-subtle pt-2">
        <p className="text-faint text-xs uppercase tracking-wide mb-1">Images</p>
          <ImageUpload
            annotationId={annotation.id}
            images={annotation.images}
            onImagesChange={(images) => {
              if (presentationMode) return
              updateAnnotationContent(annotation.id, { images })
            }}
          />
      </div>

      <div className="border-t border-subtle pt-2">
        <p className="text-faint text-xs uppercase tracking-wide mb-1">Video</p>
        <input
          value={videoInput}
          onChange={(e) => setVideoInput(e.target.value)}
          onBlur={() => {
            if (presentationMode) return
            if (!videoInput || isValidVimeoUrl(videoInput)) {
              updateAnnotationContent(annotation.id, { videoUrl: videoInput || null })
            }
          }}
          placeholder="https://vimeo.com/…"
          data-testid="annotation-video-input"
          className={cn(
            'w-full rounded border bg-field px-2 py-1 text-xs text-strong outline-none',
            videoError ? 'border-destructive' : 'border-subtle focus:border-[color:var(--accent-border)]'
          )}
        />
        {videoError && (
          <p className="mt-0.5 text-xs text-danger">Only Vimeo URLs supported</p>
        )}
      </div>

      <div className="border-t border-subtle pt-2">
        <p className="text-faint text-xs uppercase tracking-wide mb-1">Links</p>
        <div className="space-y-1">
          {localLinks.map((link, i) => (
            <div key={linkKeys[i]} className="flex gap-1 items-center">
              <input
                value={link.url}
                onChange={(e) => handleLinkChange(i, 'url', e.target.value)}
                onBlur={handleLinkBlur}
                placeholder="URL"
                data-testid={`annotation-link-url-${i}`}
                className="min-w-0 flex-1 rounded border border-subtle bg-field px-2 py-1 text-xs text-strong outline-none focus:border-[color:var(--accent-border)]"
              />
              <input
                value={link.label}
                onChange={(e) => handleLinkChange(i, 'label', e.target.value)}
                onBlur={handleLinkBlur}
                placeholder="Label"
                data-testid={`annotation-link-label-${i}`}
                className="w-20 shrink-0 rounded border border-subtle bg-field px-2 py-1 text-xs text-strong outline-none focus:border-[color:var(--accent-border)]"
              />
              <button
                type="button"
                onClick={() => removeLink(i)}
                data-testid={`annotation-link-delete-${i}`}
                aria-label="Remove link"
                className="shrink-0 text-faint transition-colors hover:text-danger"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addLink}
            data-testid="annotation-add-link-btn"
            className="text-xs text-accent transition-colors hover:opacity-85"
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
          className="text-faint"
          aria-label={`${annotation.images.length} images`}
        />
      )}
      {annotation.videoUrl && (
        <Video size={10} className="text-faint" aria-label="Has video" />
      )}
      {annotation.links.length > 0 && (
        <Link
          size={10}
          className="text-faint"
          aria-label={`${annotation.links.length} links`}
        />
      )}
    </span>
  )
}

export function AnnotationManager() {
  const annotations = useViewerStore((s) => s.annotations)
  const activeSceneId = useViewerStore((s) => s.activeSceneId)
  const presentationMode = useViewerStore((s) => s.presentationMode)
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
          <p className="text-xs text-faint uppercase tracking-wider">Annotations</p>
          {sceneAnnotations.length > 0 && (
            <span
              className="rounded-full bg-field px-1.5 py-0.5 text-[10px] font-mono text-soft"
              data-testid="annotation-count-badge"
            >
              {sceneAnnotations.length}
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="annotations-toggle"
          aria-label={annotationsPanelOpen ? 'Collapse annotations panel' : 'Expand annotations panel'}
          onClick={() => setAnnotationsPanelOpen(!annotationsPanelOpen)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            annotationsPanelOpen ? 'bg-accent-soft' : 'bg-field'
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-foreground transition-transform ${
              annotationsPanelOpen ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {annotationsPanelOpen && (
        <>
          {sceneAnnotations.length === 0 && (
            <p className="text-faint text-xs text-center py-3">
              {presentationMode
                ? 'No annotations yet.'
                : <>No annotations yet. Press <kbd className="rounded bg-field px-1">A</kbd> to add markers.</>}
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
                    className="group flex items-center gap-1.5"
                  >
                    <button
                      type="button"
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
                        'flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left transition-colors',
                        isSelected
                          ? 'border border-accent-soft bg-accent-soft'
                          : 'border border-transparent hover:bg-elevated'
                      )}
                    >
                      <span
                        className={cn(
                          'flex-1 truncate text-xs',
                          isSelected ? 'text-accent' : 'text-soft'
                        )}
                      >
                        {annotation.title || <span className="italic text-faint">Untitled</span>}
                      </span>

                      <MediaIndicators annotation={annotation} />
                    </button>

                    {!presentationMode && (
                      <button
                        type="button"
                        data-testid={`annotation-delete-${annotation.id}`}
                        aria-label="Delete annotation"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(annotation)
                        }}
                         className="opacity-0 group-hover:opacity-100 text-faint hover:text-danger transition-all shrink-0"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {selectedAnnotation && !presentationMode && (
             <div className="mt-3 border-t border-subtle" data-testid="annotation-editor">
              <AnnotationEditor key={selectedAnnotation.id} annotation={selectedAnnotation} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
