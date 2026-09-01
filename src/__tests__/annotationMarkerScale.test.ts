import { describe, expect, it } from 'vitest'

import { getAnnotationMarkerVisualScale } from '@/utils/annotationMarkerScale'

const REFERENCE_VIEW = {
  cameraSpaceDepth: 12,
  verticalFovDegrees: 50,
  viewportHeight: 900,
}

function depthAtCameraScale(cameraScale: number) {
  return REFERENCE_VIEW.cameraSpaceDepth / Math.pow(cameraScale, 4)
}

describe('getAnnotationMarkerVisualScale', () => {
  it('returns the base sizes at the reference view', () => {
    expect(getAnnotationMarkerVisualScale(REFERENCE_VIEW)).toEqual({
      markerPx: 24,
      labelPx: 12,
    })
  })

  it('uses a restrained quarter-power zoom between the near and far bounds', () => {
    const depthFactor = 1.3
    const closer = getAnnotationMarkerVisualScale({
      ...REFERENCE_VIEW,
      cameraSpaceDepth: REFERENCE_VIEW.cameraSpaceDepth / depthFactor,
    })
    const farther = getAnnotationMarkerVisualScale({
      ...REFERENCE_VIEW,
      cameraSpaceDepth: REFERENCE_VIEW.cameraSpaceDepth * depthFactor,
    })

    expect(closer.markerPx).toBeCloseTo(24 * Math.pow(depthFactor, 0.25), 10)
    expect(closer.labelPx).toBeCloseTo(12 * Math.pow(depthFactor, 0.25), 10)
    expect(farther.markerPx).toBeCloseTo(24 * Math.pow(depthFactor, -0.25), 10)
    expect(farther.labelPx).toBeCloseTo(12 * Math.pow(depthFactor, -0.25), 10)
  })

  it('caps very near and very far views at readable screen sizes', () => {
    expect(
      getAnnotationMarkerVisualScale({ ...REFERENCE_VIEW, cameraSpaceDepth: 0.01 })
    ).toEqual({ markerPx: 32, labelPx: 14 })
    expect(
      getAnnotationMarkerVisualScale({ ...REFERENCE_VIEW, cameraSpaceDepth: 1000 })
    ).toEqual({ markerPx: 20, labelPx: 11 })
  })

  it('responds to vertical field of view through perspective projection density', () => {
    const narrow = getAnnotationMarkerVisualScale({
      ...REFERENCE_VIEW,
      verticalFovDegrees: 35,
    })
    const reference = getAnnotationMarkerVisualScale(REFERENCE_VIEW)
    const wide = getAnnotationMarkerVisualScale({
      ...REFERENCE_VIEW,
      verticalFovDegrees: 70,
    })

    expect(narrow.markerPx).toBeGreaterThan(reference.markerPx)
    expect(wide.markerPx).toBeLessThan(reference.markerPx)
    expect(narrow.labelPx).toBeGreaterThan(reference.labelPx)
    expect(wide.labelPx).toBeLessThan(reference.labelPx)
  })

  it('uses viewport height and camera depth as equivalent projection inputs', () => {
    const doubledViewportAndDepth = getAnnotationMarkerVisualScale({
      ...REFERENCE_VIEW,
      cameraSpaceDepth: REFERENCE_VIEW.cameraSpaceDepth * 2,
      viewportHeight: REFERENCE_VIEW.viewportHeight * 2,
    })
    const halfViewportAndDepth = getAnnotationMarkerVisualScale({
      ...REFERENCE_VIEW,
      cameraSpaceDepth: REFERENCE_VIEW.cameraSpaceDepth / 2,
      viewportHeight: REFERENCE_VIEW.viewportHeight / 2,
    })

    expect(doubledViewportAndDepth.markerPx).toBeCloseTo(24, 10)
    expect(doubledViewportAndDepth.labelPx).toBeCloseTo(12, 10)
    expect(halfViewportAndDepth.markerPx).toBeCloseTo(24, 10)
    expect(halfViewportAndDepth.labelPx).toBeCloseTo(12, 10)
  })

  it('is continuous where marker and label sizes enter their clamp ranges', () => {
    const boundaryCameraScales = [
      20 / 24,
      32 / 24,
      11 / 12,
      14 / 12,
    ]

    for (const cameraScale of boundaryCameraScales) {
      const boundaryDepth = depthAtCameraScale(cameraScale)
      const justCloser = getAnnotationMarkerVisualScale({
        ...REFERENCE_VIEW,
        cameraSpaceDepth: boundaryDepth * (1 - 0.000001),
      })
      const atBoundary = getAnnotationMarkerVisualScale({
        ...REFERENCE_VIEW,
        cameraSpaceDepth: boundaryDepth,
      })
      const justFarther = getAnnotationMarkerVisualScale({
        ...REFERENCE_VIEW,
        cameraSpaceDepth: boundaryDepth * (1 + 0.000001),
      })

      expect(Math.abs(justCloser.markerPx - atBoundary.markerPx)).toBeLessThan(0.00001)
      expect(Math.abs(justFarther.markerPx - atBoundary.markerPx)).toBeLessThan(0.00001)
      expect(Math.abs(justCloser.labelPx - atBoundary.labelPx)).toBeLessThan(0.00001)
      expect(Math.abs(justFarther.labelPx - atBoundary.labelPx)).toBeLessThan(0.00001)
    }
  })

  it('returns finite bounded values for degenerate runtime inputs', () => {
    const result = getAnnotationMarkerVisualScale({
      cameraSpaceDepth: 0,
      verticalFovDegrees: Number.NaN,
      viewportHeight: Number.POSITIVE_INFINITY,
    })

    expect(result.markerPx).toBe(32)
    expect(result.labelPx).toBe(14)
  })
})
