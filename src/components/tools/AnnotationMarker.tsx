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
                ? 'border-[color:var(--signal-strong)] shadow-[0_0_24px_color-mix(in_oklab,var(--signal-strong)_90%,transparent)] ring-2 ring-[color:color-mix(in_oklab,var(--signal-strong)_30%,transparent)]'
                : isHovered
                ? 'border-[color:var(--signal-strong)] shadow-[0_0_16px_color-mix(in_oklab,var(--signal-hover)_80%,transparent)]'
                : 'border-[color:var(--signal-ring)] shadow-[0_0_12px_color-mix(in_oklab,var(--signal)_60%,transparent)] opacity-90',
              isActive && isHovered && 'annotation-node-pulse'
            )}
            style={nodePulseStyle}
          />
          <div
            className={cn(
              'h-3 w-3 rounded-full transition-all duration-150 shadow-[0_0_14px_color-mix(in_oklab,var(--signal)_48%,transparent)]',
              isActive
                ? 'bg-[var(--signal-strong)] scale-110'
                : isHovered
                ? 'bg-[var(--signal-hover)] scale-105'
                : 'bg-[var(--signal)]'
            )}
          />
        </div>
        {isHovered && !isActive && (
          <div className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded border border-subtle bg-elevated px-1.5 py-0 shadow-panel">
            <span className="text-[10px] font-medium text-strong">{annotation.title}</span>
          </div>
        )}
      </div>
    </Html>
  )
}
