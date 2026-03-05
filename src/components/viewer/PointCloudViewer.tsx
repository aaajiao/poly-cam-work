import { useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { usePLYLoader } from '@/hooks/usePLYLoader'
import { useViewerStore } from '@/store/viewerStore'
import { mapHeightColors, mapIntensityColors } from '@/utils/colorMapping'
import type { PLYParseResult } from '@/types'

interface PointCloudViewerProps {
  url: string
}

export function PointCloudViewer({ url }: PointCloudViewerProps) {
  const { data, loading, progress, error } = usePLYLoader(url)
  const pointSize = useViewerStore((s) => s.pointSize)
  const setLoading = useViewerStore((s) => s.setLoading)
  const colorMapMode = useViewerStore((s) => s.colorMapMode)

  const originalColorsRef = useRef<Float32Array | null>(null)
  const dataRef = useRef<PLYParseResult | null>(null)

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
      dataRef.current = data
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

  useEffect(() => {
    if (!geometry || !dataRef.current) return

    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    if (!colorAttr) return

    let newColors: Float32Array

    if (colorMapMode === 'original') {
      newColors = originalColorsRef.current ?? dataRef.current.colors
    } else if (colorMapMode === 'height') {
      newColors = mapHeightColors(dataRef.current.positions, dataRef.current.bounds)
    } else {
      newColors = mapIntensityColors(originalColorsRef.current ?? dataRef.current.colors)
    }

    colorAttr.array.set(newColors)
    colorAttr.needsUpdate = true
  }, [colorMapMode, geometry])

  if (error) {
    console.error('PLY load error:', error)
    return null
  }

  if (!geometry) return null

  return (
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
