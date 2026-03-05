import { useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { X, Edit2 } from 'lucide-react'
import { useViewerStore } from '@/store/viewerStore'
import type { Annotation } from '@/types'

interface AnnotationLabelProps {
  annotation: Annotation
}

export function AnnotationLabel({ annotation }: AnnotationLabelProps) {
  const removeAnnotation = useViewerStore((s) => s.removeAnnotation)
  const updateAnnotation = useViewerStore((s) => s.updateAnnotation)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(annotation.title)

  const position = new THREE.Vector3(...annotation.position)

  const handleSave = () => {
    if (editText.trim()) {
      updateAnnotation(annotation.id, editText.trim())
    }
    setIsEditing(false)
  }

  return (
    <Html
      position={position}
      distanceFactor={10}
      transform
      occlude={false}
    >
      <div
        data-testid={`annotation-${annotation.id}`}
        className="relative"
        style={{ pointerEvents: 'auto' }}
      >
        <div className="absolute -top-1 -left-1 w-2 h-2 bg-yellow-400 rounded-full border border-yellow-600" />

        <div className="ml-3 bg-zinc-900/95 border border-zinc-600 rounded-md shadow-lg min-w-max">
          {isEditing ? (
            <div className="flex items-center gap-1 p-1">
              <input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                className="bg-zinc-800 text-white text-xs px-2 py-1 rounded border border-zinc-600 w-32 outline-none"
              />
              <button
                onClick={handleSave}
                className="text-green-400 hover:text-green-300 text-xs px-1"
              >
                ✓
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1">
              <span className="text-yellow-300 text-xs font-medium">{annotation.title}</span>
              <button
                onClick={() => setIsEditing(true)}
                className="text-zinc-500 hover:text-zinc-300 ml-1"
              >
                <Edit2 size={10} />
              </button>
              <button
                data-testid={`annotation-delete-${annotation.id}`}
                onClick={() => removeAnnotation(annotation.id)}
                className="text-zinc-500 hover:text-red-400"
              >
                <X size={10} />
              </button>
            </div>
          )}
        </div>
      </div>
    </Html>
  )
}
