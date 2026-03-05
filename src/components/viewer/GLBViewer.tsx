import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

interface GLBViewerProps {
  url: string
}

export function GLBViewer({ url }: GLBViewerProps) {
  const { scene } = useGLTF(url)

  // Ensure materials are double-sided when needed (clipping support)
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((mat) => {
          // Store original side for restoration
          if ((mat as THREE.Material & { _originalSide?: THREE.Side })._originalSide === undefined) {
            (mat as THREE.Material & { _originalSide?: THREE.Side })._originalSide = mat.side
          }
        })
      }
    })
  }, [scene])

  return <primitive object={scene} />
}

useGLTF.preload('/models/scan-a.glb')
useGLTF.preload('/models/scan-b.glb')
useGLTF.preload('/models/scan-c.glb')
