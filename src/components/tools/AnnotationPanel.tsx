import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { Html, QuadraticBezierLine } from '@react-three/drei'
import { ExternalLink } from 'lucide-react'
import { useViewerStore } from '@/store/viewerStore'
import { imageStorage } from '@/storage/imageStorage'
import { extractVimeoId } from '@/utils/vimeo'
import { VimeoEmbed } from '@/components/ui/VimeoEmbed'
import { cn } from '@/lib/utils'
import type { Annotation, AnnotationImage } from '@/types'

type AnimState = 'entering' | 'visible' | 'exiting' | 'hidden'

interface ResizableMediaProps {
  children: ReactNode
  defaultWidth?: number
  defaultHeight?: number
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  maintainAspectRatio?: boolean
  aspectRatio?: number
  showHandleAlways?: boolean
}

function ResizableMedia({
  children,
  defaultWidth,
  defaultHeight,
  minWidth = 100,
  maxWidth = 600,
  minHeight = 60,
  maxHeight = 400,
  maintainAspectRatio = false,
  showHandleAlways = false,
}: ResizableMediaProps) {
  const [size, setSize] = useState({
    width: defaultWidth,
    height: defaultHeight,
  })
  const isDragging = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })
  const startSize = useRef({ width: defaultWidth ?? 0, height: defaultHeight ?? 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDragging.current = true
    startPos.current = { x: e.clientX, y: e.clientY }
    startSize.current = {
      width: size.width ?? defaultWidth ?? 200,
      height: size.height ?? defaultHeight ?? 100,
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - startPos.current.x
      const dy = e.clientY - startPos.current.y

      if (maintainAspectRatio) {
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startSize.current.width + dx))
        setSize({ width: newWidth, height: undefined })
      } else {
        const newWidth = defaultWidth !== undefined
          ? Math.min(maxWidth, Math.max(minWidth, startSize.current.width + dx))
          : undefined
        const newHeight = defaultHeight !== undefined
          ? Math.min(maxHeight, Math.max(minHeight, startSize.current.height + dy))
          : undefined
        setSize({ width: newWidth, height: newHeight })
      }
    }

    const handleMouseUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      className="group relative"
      style={{
        width: size.width !== undefined ? `${size.width}px` : undefined,
        height: size.height !== undefined ? `${size.height}px` : undefined,
      }}
    >
      {children}
      <div
        className={cn(
          'absolute bottom-1 right-1 z-20 flex h-5 w-5 items-center justify-center rounded-sm border border-zinc-600 bg-zinc-900/90 text-zinc-100 transition-opacity',
          showHandleAlways ? 'opacity-90 hover:opacity-100' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'
        )}
        style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
        onMouseDown={handleMouseDown}
        aria-label="Resize media"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M9 3L3 9M9 6L6 9M9 9H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

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
  const lineRef = useRef<{
    setPoints: (
      start: THREE.Vector3 | [number, number, number],
      end: THREE.Vector3 | [number, number, number],
      mid: THREE.Vector3 | [number, number, number]
    ) => void
  } | null>(null)
  const glowRef = useRef<{
    setPoints: (
      start: THREE.Vector3 | [number, number, number],
      end: THREE.Vector3 | [number, number, number],
      mid: THREE.Vector3 | [number, number, number]
    ) => void
  } | null>(null)
  const lineProgressRef = useRef(0)
  const animStateRef = useRef<AnimState>('hidden')

  const annotation = annotations.find((a) => a.id === selectedAnnotationId) ?? null
  const displayAnnotation = annotation ?? lastAnnotationRef.current

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

  useEffect(() => {
    animStateRef.current = animState
    if (animState === 'entering') lineProgressRef.current = 0
  }, [animState])

  useFrame((_, delta) => {
    const state = animStateRef.current
    if (state === 'entering') {
      lineProgressRef.current = Math.min(lineProgressRef.current + delta / 0.3, 1)
    } else if (state === 'exiting') {
      lineProgressRef.current = Math.max(lineProgressRef.current - delta / 0.3, 0)
    } else if (state === 'visible') {
      lineProgressRef.current = 1
    }

    const t = lineProgressRef.current
    if (!displayAnnotation) return

    const markerPos = new THREE.Vector3(...displayAnnotation.position)
    const panelPos = new THREE.Vector3(
      displayAnnotation.position[0] + 0.8,
      displayAnnotation.position[1] + 1.2,
      displayAnnotation.position[2]
    )
    const midPos = new THREE.Vector3(
      displayAnnotation.position[0],
      displayAnnotation.position[1] + 1.2,
      displayAnnotation.position[2]
    )

    const currentEnd = markerPos.clone().lerp(panelPos, t)
    const currentMid = markerPos.clone().lerp(midPos, t)

    lineRef.current?.setPoints(markerPos, currentEnd, currentMid)
    glowRef.current?.setPoints(markerPos, currentEnd, currentMid)
  })

  if (animState === 'hidden' || !displayAnnotation) return null

  const markerPos = new THREE.Vector3(...displayAnnotation.position)
  const panelPos = new THREE.Vector3(
    displayAnnotation.position[0] + 0.8,
    displayAnnotation.position[1] + 1.2,
    displayAnnotation.position[2]
  )
  const midPos = new THREE.Vector3(
    displayAnnotation.position[0],
    displayAnnotation.position[1] + 1.2,
    displayAnnotation.position[2]
  )

  const vimeoId = displayAnnotation.videoUrl ? extractVimeoId(displayAnnotation.videoUrl) : null

  return (
    <>
      <QuadraticBezierLine
        ref={lineRef}
        start={markerPos}
        end={panelPos}
        mid={midPos}
        color="white"
        lineWidth={2}
      />
      <QuadraticBezierLine
        ref={glowRef}
        start={markerPos}
        end={panelPos}
        mid={midPos}
        color="white"
        lineWidth={6}
        transparent
        opacity={0.15}
      />
      <Html
        position={panelPos}
        distanceFactor={8}
        transform
        occlude={false}
      >
        <div
          data-testid={`annotation-panel-${displayAnnotation.id}`}
          className={cn(vimeoId ? 'w-fit max-w-[42rem]' : 'max-w-xs')}
          style={{
            pointerEvents: 'auto',
            transform: animState === 'entering' || animState === 'exiting' ? 'scale(0.85)' : 'scale(1)',
            opacity: animState === 'entering' || animState === 'exiting' ? 0 : 1,
            transition: 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)',
            transformOrigin: 'bottom left',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between pb-1">
            <h3
              className="text-white text-sm font-semibold leading-tight"
              style={{
                textShadow: '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.5), 1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9), 1px -1px 2px rgba(0,0,0,0.9), -1px 1px 2px rgba(0,0,0,0.9)',
                WebkitTextStroke: '0.5px rgba(0,0,0,0.6)',
              }}
            >
              {displayAnnotation.title}
            </h3>
          </div>

          <div className="pt-1 space-y-2">
            {displayAnnotation.description && (
              <p
                className="text-zinc-300 text-xs leading-relaxed line-clamp-3"
                style={{
                  textShadow: '0 0 4px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)',
                }}
              >
                {displayAnnotation.description}
              </p>
            )}

            {displayAnnotation.images.length > 0 && (
              <ResizableMedia
                defaultHeight={100}
                minHeight={60}
                maxHeight={400}
              >
                <ImageThumbnails images={displayAnnotation.images} />
              </ResizableMedia>
            )}

            {vimeoId && (
              <ResizableMedia
                defaultWidth={320}
                minWidth={180}
                maxWidth={600}
                maintainAspectRatio
                aspectRatio={16 / 9}
                showHandleAlways
              >
                <VimeoEmbed videoId={vimeoId} className="w-full" />
              </ResizableMedia>
            )}

            {displayAnnotation.links.length > 0 && (
              <div className="space-y-1">
                {displayAnnotation.links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-blue-300 hover:text-blue-200 text-xs"
                    style={{
                      textShadow: '0 0 4px rgba(0,0,0,0.9), 1px 1px 2px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.9)',
                    }}
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
    </>
  )
}
