import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { ExternalLink } from 'lucide-react'
import { useViewerStore } from '@/store/viewerStore'
import { imageStorage } from '@/storage/imageStorage'
import { extractVimeoId } from '@/utils/vimeo'
import { VimeoEmbed } from '@/components/ui/VimeoEmbed'
import type { Annotation, AnnotationImage } from '@/types'

type AnimState = 'entering' | 'visible' | 'exiting' | 'hidden'

function ImageThumbnails({ images }: { images: AnnotationImage[] }) {
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const urls: Record<string, string> = {}
    const load = async () => {
      for (const img of images) {
        const blob = await imageStorage.getThumbnail(img.id)
        if (blob) urls[img.id] = URL.createObjectURL(blob)
      }
      setThumbUrls({ ...urls })
    }
    load()
    return () => {
      Object.values(urls).forEach(URL.revokeObjectURL)
    }
  }, [images])

  return (
    <div className="grid grid-cols-3 gap-1">
      {images.map((img) => (
        <div key={img.id} className="aspect-square rounded overflow-hidden bg-zinc-800">
          {thumbUrls[img.id] ? (
            <img
              src={thumbUrls[img.id]}
              alt={img.filename}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-zinc-800 animate-pulse" />
          )}
        </div>
      ))}
    </div>
  )
}

export function AnnotationPanel() {
  const annotations = useViewerStore((s) => s.annotations)
  const selectedAnnotationId = useViewerStore((s) => s.selectedAnnotationId ?? null)
  const selectAnnotation = useViewerStore((s) => s.selectAnnotation ?? (() => {}))
  const [animState, setAnimState] = useState<AnimState>('hidden')
  const lastAnnotationRef = useRef<Annotation | null>(null)

  const annotation = annotations.find((a) => a.id === selectedAnnotationId) ?? null

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectAnnotation(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectAnnotation])

  useEffect(() => {
    if (annotation) {
      lastAnnotationRef.current = annotation
      setAnimState('entering')
      const t = setTimeout(() => setAnimState('visible'), 300)
      return () => clearTimeout(t)
    }

    if (lastAnnotationRef.current) {
      setAnimState('exiting')
      const t = setTimeout(() => setAnimState('hidden'), 300)
      return () => clearTimeout(t)
    }
  }, [annotation])

  const displayAnnotation = annotation ?? lastAnnotationRef.current
  if (animState === 'hidden' || !displayAnnotation) return null

  const position = new THREE.Vector3(
    displayAnnotation.position[0],
    displayAnnotation.position[1] + 0.5,
    displayAnnotation.position[2]
  )

  const vimeoId = displayAnnotation.videoUrl ? extractVimeoId(displayAnnotation.videoUrl) : null

  return (
    <Html
      position={position}
      distanceFactor={8}
      transform
      occlude={false}
    >
      <div
        data-testid={`annotation-panel-${displayAnnotation.id}`}
        className="bg-zinc-900/95 border border-zinc-600 rounded-lg shadow-xl w-72 max-h-96 overflow-y-auto"
        style={{
          pointerEvents: 'auto',
          transform: animState === 'entering' || animState === 'exiting' ? 'scale(0.85)' : 'scale(1)',
          opacity: animState === 'entering' || animState === 'exiting' ? 0 : 1,
          transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
          transformOrigin: 'bottom left',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-3 border-b border-zinc-700">
          <h3 className="text-white text-sm font-semibold leading-tight pr-2">{displayAnnotation.title}</h3>
        </div>

        <div className="p-3 space-y-3">
          {displayAnnotation.description && (
            <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3">
              {displayAnnotation.description}
            </p>
          )}

          {displayAnnotation.images.length > 0 && (
            <ImageThumbnails images={displayAnnotation.images} />
          )}

          {vimeoId && (
            <VimeoEmbed videoId={vimeoId} />
          )}

          {displayAnnotation.links.length > 0 && (
            <div className="space-y-1">
              {displayAnnotation.links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs"
                >
                  <ExternalLink size={10} />
                  <span className="truncate">{link.label || link.url}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Html>
  )
}
