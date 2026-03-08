import { describe, expect, it } from 'vitest'
import {
  getPresentationGizmoTargetOpacity,
  PRESENTATION_GIZMO_ACTIVE_OPACITY,
  PRESENTATION_GIZMO_IDLE_OPACITY,
} from '@/components/viewer/presentationGizmoState'

describe('presentation gizmo opacity', () => {
  it('keeps full opacity outside presentation mode', () => {
    expect(
      getPresentationGizmoTargetOpacity({
        presentationMode: false,
        isInteracting: false,
      })
    ).toBe(1)
  })

  it('uses idle opacity in presentation mode when static', () => {
    expect(
      getPresentationGizmoTargetOpacity({
        presentationMode: true,
        isInteracting: false,
      })
    ).toBe(PRESENTATION_GIZMO_IDLE_OPACITY)
  })

  it('uses active opacity while hovered or interacting in presentation mode', () => {
    expect(
      getPresentationGizmoTargetOpacity({
        presentationMode: true,
        isInteracting: true,
      })
    ).toBe(PRESENTATION_GIZMO_ACTIVE_OPACITY)
  })
})
