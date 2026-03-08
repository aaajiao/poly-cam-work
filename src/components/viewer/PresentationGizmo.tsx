import { useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import {
  getPresentationGizmoTargetOpacity,
  PRESENTATION_GIZMO_IDLE_OPACITY,
} from './presentationGizmoState'

const PRESENTATION_GIZMO_FADE_IN_SPEED = 8
const PRESENTATION_GIZMO_FADE_OUT_SPEED = 15
const PRESENTATION_GIZMO_OPACITY_EPSILON = 0.01

interface PresentationGizmoProps {
  presentationMode: boolean
  interactionActive: boolean
  onInteractionStart: () => void
  onInteractionEnd: () => void
}

function applyGizmoOpacity(root: THREE.Object3D, opacity: number) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite)) return

    const material = child.material
    const materials = Array.isArray(material) ? material : [material]
    const transparent = opacity < 0.999

    for (const entry of materials) {
      if (!entry || !(entry instanceof THREE.Material)) continue
      if (Math.abs(entry.opacity - opacity) <= PRESENTATION_GIZMO_OPACITY_EPSILON && entry.transparent === transparent) {
        continue
      }

      entry.opacity = opacity
      entry.transparent = transparent
      if ('depthWrite' in entry) {
        entry.depthWrite = !transparent
      }
      entry.needsUpdate = true
    }
  })
}

export function PresentationGizmo({
  presentationMode,
  interactionActive,
  onInteractionStart,
  onInteractionEnd,
}: PresentationGizmoProps) {
  const gizmoRef = useRef<THREE.Group | null>(null)
  const currentOpacityRef = useRef(presentationMode ? PRESENTATION_GIZMO_IDLE_OPACITY : 1)
  const appliedOpacityRef = useRef<number | null>(null)

  useFrame((_, delta) => {
    if (!gizmoRef.current) return

    const targetOpacity = getPresentationGizmoTargetOpacity({
      presentationMode,
      isInteracting: interactionActive,
    })
    const fadeSpeed = targetOpacity < currentOpacityRef.current
      ? PRESENTATION_GIZMO_FADE_OUT_SPEED
      : PRESENTATION_GIZMO_FADE_IN_SPEED

    currentOpacityRef.current = THREE.MathUtils.damp(
      currentOpacityRef.current,
      targetOpacity,
      fadeSpeed,
      delta
    )

    if (
      appliedOpacityRef.current !== null
      && Math.abs(appliedOpacityRef.current - currentOpacityRef.current) <= PRESENTATION_GIZMO_OPACITY_EPSILON
      && Math.abs(targetOpacity - currentOpacityRef.current) <= PRESENTATION_GIZMO_OPACITY_EPSILON
    ) {
      return
    }

    applyGizmoOpacity(gizmoRef.current, currentOpacityRef.current)
    appliedOpacityRef.current = currentOpacityRef.current
  })

  return (
    <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
      <group
        ref={gizmoRef}
      >
        <GizmoViewport
          axisColors={['#ef4444', '#22c55e', '#3b82f6']}
          labelColor="white"
          onPointerDown={(event: ThreeEvent<PointerEvent>) => {
            onInteractionStart()
            event.stopPropagation()
          }}
          onPointerUp={(event: ThreeEvent<PointerEvent>) => {
            onInteractionEnd()
            event.stopPropagation()
          }}
          onPointerOut={(event: ThreeEvent<PointerEvent>) => {
            onInteractionEnd()
            event.stopPropagation()
          }}
          onPointerCancel={(event: ThreeEvent<PointerEvent>) => {
            onInteractionEnd()
            event.stopPropagation()
          }}
        />
      </group>
    </GizmoHelper>
  )
}
