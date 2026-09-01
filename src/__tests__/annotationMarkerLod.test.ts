import { describe, expect, it } from 'vitest'

import { selectHtmlAnnotationMarkerIds } from '@/utils/annotationMarkerLod'

function candidates(count: number) {
  return Array.from({ length: count }, (_, sourceIndex) => ({
    id: `annotation-${sourceIndex}`,
    distance: sourceIndex + 1,
    sourceIndex,
  }))
}

describe('selectHtmlAnnotationMarkerIds', () => {
  it('reserves the bounded HTML budget for selected and open markers first', () => {
    const allCandidates = candidates(20)
    const result = selectHtmlAnnotationMarkerIds(
      allCandidates,
      ['annotation-18', 'annotation-17'],
      'annotation-19',
      15
    )

    expect(result).toHaveLength(15)
    expect(result.slice(0, 3)).toEqual([
      'annotation-19',
      'annotation-18',
      'annotation-17',
    ])
    expect(result).toContain('annotation-0')
    expect(result).not.toContain('annotation-16')
  })

  it('keeps over-budget open markers available to the instanced fallback', () => {
    const allCandidates = candidates(20)
    const openIds = allCandidates.slice(0, 18).map(({ id }) => id)
    const htmlIds = selectHtmlAnnotationMarkerIds(
      allCandidates,
      openIds,
      'annotation-19',
      15
    )
    const htmlIdSet = new Set(htmlIds)
    const instancedIds = allCandidates
      .filter(({ id }) => !htmlIdSet.has(id))
      .map(({ id }) => id)

    expect(htmlIds).toHaveLength(15)
    expect(htmlIds[0]).toBe('annotation-19')
    expect(instancedIds).toEqual([
      'annotation-14',
      'annotation-15',
      'annotation-16',
      'annotation-17',
      'annotation-18',
    ])
  })

  it('uses source order as a deterministic distance tie-breaker without mutation', () => {
    const allCandidates = [
      { id: 'third', distance: 3, sourceIndex: 2 },
      { id: 'second', distance: 1, sourceIndex: 1 },
      { id: 'first', distance: 1, sourceIndex: 0 },
    ]
    const originalOrder = allCandidates.map(({ id }) => id)

    expect(selectHtmlAnnotationMarkerIds(allCandidates, [], null, 3)).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(allCandidates.map(({ id }) => id)).toEqual(originalOrder)
  })

  it('deduplicates selected and open IDs and ignores invisible IDs', () => {
    expect(
      selectHtmlAnnotationMarkerIds(
        candidates(3),
        ['annotation-2', 'annotation-2', 'missing'],
        'annotation-2',
        3
      )
    ).toEqual(['annotation-2', 'annotation-0', 'annotation-1'])
  })
})
