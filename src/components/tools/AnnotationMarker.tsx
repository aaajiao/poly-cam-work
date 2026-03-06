import { useMemo, useState, type CSSProperties } from 'react'
import * as THREE from 'three'
import { Html, useCursor } from '@react-three/drei'
import { cn } from '@/lib/utils'
import { useViewerStore } from '@/store/viewerStore'
import type { Annotation } from '@/types'

interface AnnotationMarkerProps {
  annotation: Annotation
  isActive: boolean
  onSelect: () => void
}

export function AnnotationMarker({ annotation, isActive, onSelect }: AnnotationMarkerProps) {
  const [isHovered, setIsHovered] = useState(false)
  const setHoveredAnnotation = useViewerStore((s) => s.setHoveredAnnotation)
  useCursor(isHovered)

  const pulseProfile = useMemo(() => {
    let hash = 2166136261
    for (let i = 0; i < annotation.id.length; i++) {
      hash ^= annotation.id.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    const seed = (hash >>> 0) / 0xffffffff
    return {
      duration: 0.78 + seed * 0.42,
      scale: 1.16 + seed * 0.13,
      brightness: 1.2 + seed * 0.22,
    }
  }, [annotation.id])

  const nodePulseStyle = useMemo(() => {
    if (!isActive || !isHovered) return undefined
    return {
      '--node-pulse-duration': `${pulseProfile.duration.toFixed(2)}s`,
      '--node-pulse-scale': pulseProfile.scale.toFixed(3),
      '--node-pulse-brightness': pulseProfile.brightness.toFixed(3),
    } as CSSProperties & Record<string, string>
  }, [isActive, isHovered, pulseProfile])

  const position = new THREE.Vector3(...annotation.position)

  return (
    <Html
      position={position}
      distanceFactor={8}
      transform
      sprite
      occlude={false}
    >
      <div
        data-testid={`annotation-marker-${annotation.id}`}
        className="relative cursor-pointer select-none"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        onMouseEnter={() => {
          setIsHovered(true)
          if (isActive) {
            setHoveredAnnotation(annotation.id)
          }
        }}
        onMouseLeave={() => {
          setIsHovered(false)
          if (isActive) {
            setHoveredAnnotation(null)
          }
        }}
      >
        <div
          className={cn(
            'relative flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150',
            !isActive && !isHovered && 'annotation-breathe'
          )}
        >
          <div
            className={cn(
              'absolute inset-0 rounded-full border-2 transition-colors duration-150',
              isActive
                ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.92)]'
                : isHovered
                ? 'border-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'
                : 'border-white/70',
              isActive && isHovered && 'annotation-node-pulse'
            )}
            style={nodePulseStyle}
          />
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-all duration-150',
              isActive ? 'bg-blue-500' : isHovered ? 'bg-blue-300' : 'bg-blue-500'
            )}
          />
        </div>
        {isHovered && !isActive && (
          <div className="absolute left-5 top-1/2 -translate-y-1/2 rounded border border-zinc-700 bg-zinc-900/95 px-1.5 py-0 whitespace-nowrap shadow-lg">
            <span className="text-[10px] font-medium text-zinc-100">{annotation.title}</span>
          </div>
        )}
      </div>
    </Html>
  )
}
