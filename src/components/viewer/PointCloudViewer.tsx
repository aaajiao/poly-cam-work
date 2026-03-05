import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { usePLYLoader } from '@/hooks/usePLYLoader'
import { useViewerStore } from '@/store/viewerStore'

interface PointCloudViewerProps {
  url: string
}

export function PointCloudViewer({ url }: PointCloudViewerProps) {
  const { data, loading, progress, error } = usePLYLoader(url)
  const pointSize = useViewerStore((s) => s.pointSize)
  const setLoading = useViewerStore((s) => s.setLoading)

  // Store original colors for color mapping restore (Task 15)
  const originalColorsRef = useRef<Float32Array | null>(null)

  useEffect(() => {
    if (loading) {
      setLoading(true, progress, 'Loading point cloud...')
    } else {
      setLoading(false, 100)
    }
  }, [loading, progress, setLoading])

  useEffect(() => {
    if (data) {
      originalColorsRef.current = new Float32Array(data.colors)
    }
  }, [data])

  const geometry = useMemo(() => {
    if (!data) return null

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  }, [data])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (error) {
    console.error('PLY load error:', error)
    return null
  }

  if (!geometry) return null

  return (
    // Apply Z-up → Y-up coordinate transform
    // PLY uses Z-up (Polycam convention), GLB uses Y-up (glTF standard)
    // Transform: PLY(x, y, z) → Scene(x, z, -y) = rotation.x = -Math.PI/2
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <points geometry={geometry}>
        <pointsMaterial
          size={pointSize}
          vertexColors
          sizeAttenuation
        />
      </points>
    </group>
  )
}
