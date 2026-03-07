import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneDraft } from '@/types'
import { reconcileSceneImageAssets } from '../../api/_lib/sceneAssetCleanup'
import {
  deleteBlobByPathname,
  listBlobsByPrefix,
  readJsonBlob,
} from '../../api/_lib/blobStore'

vi.mock('../../api/_lib/blobStore', () => ({
  listBlobsByPrefix: vi.fn(),
  readJsonBlob: vi.fn(),
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

    vi.mocked(readJsonBlob).mockResolvedValue(draft)
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
})
