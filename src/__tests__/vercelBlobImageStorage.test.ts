import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
}))

vi.mock('@vercel/blob/client', () => ({
  upload: mocks.upload,
}))

import { vercelBlobImageStorage } from '@/storage/vercelBlobImageStorage'

describe('VercelBlobImageStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    mocks.upload.mockResolvedValue({
      url: 'https://blob.example/image.jpg',
    })
  })

  it('uses the blob MIME for both content type and pathname extension', async () => {
    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })

    await expect(
      vercelBlobImageStorage.upload(blob, {
        sceneId: 'Scan A',
        annotationId: 'Ann 1',
        filename: 'My detail.png',
      })
    ).resolves.toEqual({
      url: 'https://blob.example/image.jpg',
      filename: 'My detail.png',
    })

    expect(mocks.upload).toHaveBeenCalledWith(
      'scenes/scan-a/images/ann-1/1700000000000-My-detail.jpg',
      blob,
      expect.objectContaining({
        access: 'public',
        contentType: 'image/jpeg',
        handleUploadUrl: '/api/media/upload',
      })
    )
  })

  it('rejects unsupported image types before requesting an upload token', async () => {
    const blob = new Blob(['svg'], { type: 'image/svg+xml' })

    await expect(
      vercelBlobImageStorage.upload(blob, {
        sceneId: 'scan-a',
        annotationId: 'ann-1',
        filename: 'unsafe.svg',
      })
    ).rejects.toThrow(/Unsupported image type/)
    expect(mocks.upload).not.toHaveBeenCalled()
  })
})
