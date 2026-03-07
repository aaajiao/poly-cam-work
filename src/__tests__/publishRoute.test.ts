import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneDraft } from '@/types'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readJsonBlob: vi.fn(),
  writeJsonBlob: vi.fn(),
  writeImmutableJsonBlob: vi.fn(),
  deleteBlobByPathname: vi.fn(),
  listBlobsByPrefix: vi.fn(),
  reconcileSceneImageAssets: vi.fn(),
  collectImagePathnamesFromDraft: vi.fn(),
}))

vi.mock('../../api/_lib/auth', () => ({
  requireAuth: mocks.requireAuth,
}))

vi.mock('../../api/_lib/blobStore', () => ({
  readJsonBlob: mocks.readJsonBlob,
  writeJsonBlob: mocks.writeJsonBlob,
  writeImmutableJsonBlob: mocks.writeImmutableJsonBlob,
  deleteBlobByPathname: mocks.deleteBlobByPathname,
  listBlobsByPrefix: mocks.listBlobsByPrefix,
}))

vi.mock('../../api/_lib/sceneAssetCleanup', () => ({
  reconcileSceneImageAssets: mocks.reconcileSceneImageAssets,
  collectImagePathnamesFromDraft: mocks.collectImagePathnamesFromDraft,
}))

import handler from '../../api/publish/[sceneId]'

describe('publish route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockReturnValue(true)
    mocks.listBlobsByPrefix.mockResolvedValue([])
    mocks.writeJsonBlob.mockResolvedValue(undefined)
    mocks.writeImmutableJsonBlob.mockResolvedValue(undefined)
    mocks.reconcileSceneImageAssets.mockResolvedValue({
      deletedPathnames: [],
      failedPathnames: [],
    })
  })

  it('publishes using body draft snapshot and protects its image pathnames', async () => {
    const oldDraft: SceneDraft = {
      sceneId: 'scan-a',
      revision: 16,
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

    const newDraft: SceneDraft = {
      sceneId: 'scan-a',
      revision: 17,
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

    mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
      if (pathname === 'scenes/scan-a/draft.json') return oldDraft
      if (pathname === 'scenes/scan-a/live.json') return { version: 10 }
      return null
    })
    mocks.collectImagePathnamesFromDraft.mockReturnValue(['scenes/scan-a/images/ann-1/new.gif'])

    const request = new Request('http://localhost/api/publish/scan-a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft: newDraft,
        expectedRevision: 17,
      }),
    })

    const response = await handler(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ ok: true, version: 11 })

    expect(mocks.writeJsonBlob).toHaveBeenCalledWith('scenes/scan-a/draft.json', newDraft)
    expect(mocks.writeImmutableJsonBlob).toHaveBeenCalledWith(
      'scenes/scan-a/releases/11.json',
      expect.objectContaining({
        sceneId: 'scan-a',
        revision: 17,
        annotations: newDraft.annotations,
      })
    )

    expect(mocks.reconcileSceneImageAssets).toHaveBeenCalledWith(
      'scan-a',
      [],
      ['scenes/scan-a/images/ann-1/new.gif']
    )
  })

  it('returns conflict when persisted draft revision is newer than expected', async () => {
    const newDraft: SceneDraft = {
      sceneId: 'scan-a',
      revision: 17,
      updatedAt: Date.now(),
      annotations: [],
    }

    mocks.readJsonBlob.mockImplementation(async (pathname: string) => {
      if (pathname === 'scenes/scan-a/draft.json') {
        return {
          sceneId: 'scan-a',
          revision: 18,
          updatedAt: Date.now(),
          annotations: [],
        } satisfies SceneDraft
      }
      return null
    })

    const request = new Request('http://localhost/api/publish/scan-a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft: newDraft,
        expectedRevision: 17,
      }),
    })

    const response = await handler(request)
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json).toEqual({ error: 'Revision mismatch' })
    expect(mocks.writeImmutableJsonBlob).not.toHaveBeenCalled()
    expect(mocks.writeJsonBlob).not.toHaveBeenCalled()
    expect(mocks.reconcileSceneImageAssets).not.toHaveBeenCalled()
  })
})
