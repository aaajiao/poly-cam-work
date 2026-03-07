import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  handleUpload: vi.fn(),
}))

vi.mock('../../api/_lib/auth', () => ({
  requireAuth: mocks.requireAuth,
}))

vi.mock('@vercel/blob/client', () => ({
  handleUpload: mocks.handleUpload,
}))

import handler from '../../api/media/upload'

describe('media upload route auth behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handleUpload.mockResolvedValue({ ok: true })
  })

  it('requires auth for client token generation', async () => {
    mocks.requireAuth.mockReturnValue(false)

    const request = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname: 'scenes/scan-a/images/ann-1/test.gif',
          clientPayload: JSON.stringify({ sceneId: 'scan-a', annotationId: 'ann-1' }),
        },
      }),
    })

    const response = await handler(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
    expect(mocks.handleUpload).not.toHaveBeenCalled()
  })

  it('allows upload completed callback without auth cookie', async () => {
    mocks.requireAuth.mockReturnValue(false)

    const request = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.upload-completed',
        payload: {
          pathname: 'scenes/scan-a/images/ann-1/test.gif',
          url: 'https://blob.example/scenes/scan-a/images/ann-1/test.gif',
        },
      }),
    })

    const response = await handler(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mocks.handleUpload).toHaveBeenCalledTimes(1)
  })
})
