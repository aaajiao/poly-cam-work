import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneDraft } from '@/types'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readJsonBlob: vi.fn(),
  writeJsonBlob: vi.fn(),
  reconcileSceneImageAssets: vi.fn(),
}))

vi.mock('../../api/_lib/auth', () => ({
  requireAuth: mocks.requireAuth,
}))

vi.mock('../../api/_lib/blobStore', () => ({
  readJsonBlob: mocks.readJsonBlob,
  writeJsonBlob: mocks.writeJsonBlob,
}))

vi.mock('../../api/_lib/sceneAssetCleanup', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/sceneAssetCleanup')>(
    '../../api/_lib/sceneAssetCleanup'
  )
  return {
    ...actual,
    reconcileSceneImageAssets: mocks.reconcileSceneImageAssets,
  }
})

import handler from '../../api/draft/[sceneId]'

describe('draft route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockReturnValue(true)
    mocks.writeJsonBlob.mockResolvedValue(undefined)
    mocks.reconcileSceneImageAssets.mockResolvedValue({
      deletedPathnames: [],
      failedPathnames: [],
    })
  })

  it('passes next draft image pathnames as protected set during cleanup', async () => {
    const currentDraft: SceneDraft = {
      sceneId: 'scan-a',
      revision: 2,
      updatedAt: Date.now() - 1000,
      annotations: [
        {
          id: 'ann-1',
          position: [0, 0, 0],
          title: 'Old',
          description: '',
          images: [
            {
              filename: 'old.png',
              url: 'https://blob.example/scenes/scan-a/images/ann-1/old.png',
            },
          ],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now() - 1000,
        },
      ],
    }

    const bodyDraft: SceneDraft = {
      sceneId: 'scan-a',
      revision: 2,
      updatedAt: Date.now(),
      annotations: [
        {
          id: 'ann-1',
          position: [0, 0, 0],
          title: 'New',
          description: '',
          images: [
            {
              filename: 'new.gif',
              url: 'https://blob.example/scenes/scan-a/images/ann-1/new.gif',
            },
          ],
          videoUrl: null,
          links: [],
          sceneId: 'scan-a',
          createdAt: Date.now(),
        },
      ],
    }

    mocks.readJsonBlob.mockResolvedValue(currentDraft)

    const request = new Request('http://localhost/api/draft/scan-a', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: 2,
        draft: bodyDraft,
      }),
    })

    const response = await handler(request)
    expect(response.status).toBe(200)

    expect(mocks.reconcileSceneImageAssets).toHaveBeenCalledWith(
      'scan-a',
      ['scenes/scan-a/images/ann-1/old.png'],
      ['scenes/scan-a/images/ann-1/new.gif']
    )
  })
})
