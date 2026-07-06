import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneDraft } from '@/types'
import { reconcileSceneImageAssets } from '../../api/_lib/sceneAssetCleanup'
import {
  deleteBlobByPathname,
  listBlobsByPrefix,
  readJsonBlobStrict,
} from '../../api/_lib/blobStore'

vi.mock('../../api/_lib/blobStore', () => ({
  listBlobsByPrefix: vi.fn(),
  readJsonBlobStrict: vi.fn(),
  deleteBlobByPathname: vi.fn(),
}))

describe('reconcileSceneImageAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not delete protected pathnames during reconciliation', async () => {
    const draft: SceneDraft = {
      sceneId: 'scan-a',
      revision: 3,
      annotations: [],
      updatedAt: Date.now(),
    }

    vi.mocked(readJsonBlobStrict).mockResolvedValue(draft)
    vi.mocked(listBlobsByPrefix).mockImplementation(async (prefix: string) => {
      if (prefix === 'scenes/scan-a/images/') {
        return [
          {
            url: 'https://blob.example/scenes/scan-a/images/ann-1/new.gif',
            pathname: 'scenes/scan-a/images/ann-1/new.gif',
          },
          {
            url: 'https://blob.example/scenes/scan-a/images/ann-1/old.png',
            pathname: 'scenes/scan-a/images/ann-1/old.png',
          },
        ]
      }

      if (prefix === 'scenes/scan-a/releases/') {
        return []
      }

      return []
    })
    vi.mocked(deleteBlobByPathname).mockResolvedValue(true)

    const result = await reconcileSceneImageAssets(
      'scan-a',
      [],
      ['scenes/scan-a/images/ann-1/new.gif']
    )

    expect(deleteBlobByPathname).toHaveBeenCalledTimes(1)
    expect(deleteBlobByPathname).toHaveBeenCalledWith('scenes/scan-a/images/ann-1/old.png')
    expect(result.deletedPathnames).toEqual(['scenes/scan-a/images/ann-1/old.png'])
  })

  it('aborts without deleting anything when a draft/release read fails transiently', async () => {
    // A transient 503 on a referenced document must NOT be treated as "absent";
    // reconcile has to fail-safe and delete nothing rather than drop live images.
    vi.mocked(readJsonBlobStrict).mockRejectedValue(
      new Error('Failed to read JSON blob (HTTP 503): https://blob.example/draft')
    )
    vi.mocked(listBlobsByPrefix).mockResolvedValue([])
    vi.mocked(deleteBlobByPathname).mockResolvedValue(true)

    await expect(
      reconcileSceneImageAssets('scan-a', ['scenes/scan-a/images/ann-1/orphan.png'])
    ).rejects.toThrow(/HTTP 503/)

    expect(deleteBlobByPathname).not.toHaveBeenCalled()
  })

  it('aborts when a just-listed release blob is unexpectedly absent', async () => {
    vi.mocked(readJsonBlobStrict).mockImplementation(
      async (pathname: string) => {
        if (pathname === 'scenes/scan-a/draft.json') return null
        // Release listed above but its body cannot be read back -> anomalous.
        return null
      }
    )
    vi.mocked(listBlobsByPrefix).mockImplementation(async (prefix: string) => {
      if (prefix === 'scenes/scan-a/releases/') {
        return [
          {
            url: 'https://blob.example/scenes/scan-a/releases/1.json',
            pathname: 'scenes/scan-a/releases/1.json',
          },
        ]
      }
      return []
    })
    vi.mocked(deleteBlobByPathname).mockResolvedValue(true)

    await expect(
      reconcileSceneImageAssets('scan-a', ['scenes/scan-a/images/ann-1/orphan.png'])
    ).rejects.toThrow(/Release blob disappeared/)

    expect(deleteBlobByPathname).not.toHaveBeenCalled()
  })
})
