export const PRESENTATION_GIZMO_IDLE_OPACITY = 0.18
export const PRESENTATION_GIZMO_ACTIVE_OPACITY = 0.72

interface PresentationGizmoOpacityState {
  presentationMode: boolean
  isInteracting: boolean
}

export function getPresentationGizmoTargetOpacity({
  presentationMode,
  isInteracting,
}: PresentationGizmoOpacityState) {
  if (!presentationMode) return 1
  if (isInteracting) return PRESENTATION_GIZMO_ACTIVE_OPACITY
  return PRESENTATION_GIZMO_IDLE_OPACITY
}
