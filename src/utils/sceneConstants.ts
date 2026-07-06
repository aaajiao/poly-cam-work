// Shared scene-space constants.
//
// CLIP_SCENE_HALF: the clipping-plane position slider (0–1) maps to the world
// range [-CLIP_SCENE_HALF, +CLIP_SCENE_HALF]. The clipping plane world mapping
// and the annotation clip-culling test must stay aligned (AGENTS.md invariant),
// so both consumers import this single source of truth instead of re-declaring it.
export const CLIP_SCENE_HALF = 15
