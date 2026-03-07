import { describe, expect, it } from 'vitest'
import { ALLOWED_CONTENT_TYPES } from '../../api/media/upload'

describe('media upload allowlist', () => {
  it('includes GIF content type for publish-time image uploads', () => {
    expect(ALLOWED_CONTENT_TYPES).toContain('image/gif')
  })
})
