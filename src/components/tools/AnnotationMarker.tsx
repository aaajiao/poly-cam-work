import { useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { Annotation } from '@/types'

interface AnnotationMarkerProps {
  annotation: Annotation
  isSelected: boolean
  onSelect: () => void
}

export function AnnotationMarker({ annotation, isSelected, onSelect }: AnnotationMarkerProps) {
  const [isHovered, setIsHovered] = useState(false)
  const position = new THREE.Vector3(...annotation.position)

  const dotColor = isSelected ? '#ef4444' : isHovered ? '#f97316' : '#3b82f6'

  return (
    <Html
      position={position}
      distanceFactor={8}
      transform
      occlude={false}
    >
      <div
        data-testid={`annotation-marker-${annotation.id}`}
        className="relative cursor-pointer"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={`w-3 h-3 rounded-full border-2 border-white shadow-lg transition-colors duration-150${!isSelected && !isHovered ? ' annotation-breathe' : ''}`}
          style={{ backgroundColor: dotColor }}
        />
        {!isSelected && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-zinc-900/95 border border-zinc-600 rounded px-2 py-0.5 whitespace-nowrap shadow-lg">
            <span className="text-white text-xs font-medium">{annotation.title}</span>
          </div>
        )}
      </div>
    </Html>
  )
}
