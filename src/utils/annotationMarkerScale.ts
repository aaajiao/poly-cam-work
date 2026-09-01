const REFERENCE_CAMERA_SPACE_DEPTH = 12
const REFERENCE_VERTICAL_FOV_DEGREES = 50
const REFERENCE_VIEWPORT_HEIGHT = 900

const MARKER_BASE_PX = 24
const MARKER_MIN_PX = 20
const MARKER_MAX_PX = 32

const LABEL_BASE_PX = 12
const LABEL_MIN_PX = 11
const LABEL_MAX_PX = 14

const CAMERA_ZOOM_EXPONENT = 0.25
const MIN_CAMERA_SPACE_DEPTH = 0.001
const MIN_VERTICAL_FOV_DEGREES = 1
const MAX_VERTICAL_FOV_DEGREES = 179
const MIN_VIEWPORT_HEIGHT = 1

export interface AnnotationMarkerScaleInput {
  cameraSpaceDepth: number
  verticalFovDegrees: number
  viewportHeight: number
}

export interface AnnotationMarkerVisualScale {
  markerPx: number
  labelPx: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function perspectivePixelsPerWorldUnit(
  cameraSpaceDepth: number,
  verticalFovDegrees: number,
  viewportHeight: number
) {
  const fovRadians = verticalFovDegrees * (Math.PI / 180)
  const visibleWorldHeight = 2 * cameraSpaceDepth * Math.tan(fovRadians * 0.5)
  return viewportHeight / visibleWorldHeight
}

const REFERENCE_PROJECTION_DENSITY = perspectivePixelsPerWorldUnit(
  REFERENCE_CAMERA_SPACE_DEPTH,
  REFERENCE_VERTICAL_FOV_DEGREES,
  REFERENCE_VIEWPORT_HEIGHT
)

/**
 * Returns bounded screen-space sizes while retaining a subtle sense of camera zoom.
 * `cameraSpaceDepth` is the positive distance along the camera's forward axis.
 */
export function getAnnotationMarkerVisualScale({
  cameraSpaceDepth,
  verticalFovDegrees,
  viewportHeight,
}: AnnotationMarkerScaleInput): AnnotationMarkerVisualScale {
  const safeDepth = Number.isFinite(cameraSpaceDepth)
    ? Math.max(Math.abs(cameraSpaceDepth), MIN_CAMERA_SPACE_DEPTH)
    : REFERENCE_CAMERA_SPACE_DEPTH
  const safeFov = Number.isFinite(verticalFovDegrees)
    ? clamp(
        verticalFovDegrees,
        MIN_VERTICAL_FOV_DEGREES,
        MAX_VERTICAL_FOV_DEGREES
      )
    : REFERENCE_VERTICAL_FOV_DEGREES
  const safeViewportHeight = Number.isFinite(viewportHeight)
    ? Math.max(viewportHeight, MIN_VIEWPORT_HEIGHT)
    : REFERENCE_VIEWPORT_HEIGHT

  const projectionDensity = perspectivePixelsPerWorldUnit(
    safeDepth,
    safeFov,
    safeViewportHeight
  )
  const cameraScale = Math.pow(
    projectionDensity / REFERENCE_PROJECTION_DENSITY,
    CAMERA_ZOOM_EXPONENT
  )

  return {
    markerPx: clamp(MARKER_BASE_PX * cameraScale, MARKER_MIN_PX, MARKER_MAX_PX),
    labelPx: clamp(LABEL_BASE_PX * cameraScale, LABEL_MIN_PX, LABEL_MAX_PX),
  }
}
