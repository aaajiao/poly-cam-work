export interface AnnotationMarkerLodCandidate {
  id: string
  distance: number
  sourceIndex: number
}

/**
 * Keeps the HTML marker budget deterministic while reserving it for markers
 * whose panels are already in use. All unselected candidates remain eligible
 * for the instanced fallback rather than disappearing from both render paths.
 */
export function selectHtmlAnnotationMarkerIds(
  candidates: readonly AnnotationMarkerLodCandidate[],
  openAnnotationPanelIds: readonly string[],
  selectedAnnotationId: string | null,
  limit: number
): string[] {
  if (limit <= 0 || candidates.length === 0) return []

  const candidateIdSet = new Set(candidates.map((candidate) => candidate.id))
  const selectedIds = new Set<string>()
  const result: string[] = []

  const addIfAvailable = (id: string | null) => {
    if (
      id === null ||
      result.length >= limit ||
      selectedIds.has(id) ||
      !candidateIdSet.has(id)
    ) {
      return
    }

    selectedIds.add(id)
    result.push(id)
  }

  addIfAvailable(selectedAnnotationId)
  for (const id of openAnnotationPanelIds) addIfAvailable(id)

  const nearestCandidates = [...candidates].sort(
    (a, b) =>
      a.distance - b.distance ||
      a.sourceIndex - b.sourceIndex ||
      a.id.localeCompare(b.id)
  )
  for (const candidate of nearestCandidates) addIfAvailable(candidate.id)

  return result
}
