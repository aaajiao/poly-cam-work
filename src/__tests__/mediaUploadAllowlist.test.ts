import { describe, expect, it } from 'vitest'

import { SUPPORTED_IMAGE_MIME_TYPES } from '@/utils/imageProcessing'

import { ALLOWED_CONTENT_TYPES } from '../../api/media/upload'

describe('media upload allowlist', () => {
  it('matches the image types accepted during local editing', () => {
    expect(ALLOWED_CONTENT_TYPES).toEqual([...SUPPORTED_IMAGE_MIME_TYPES])
  })
})
