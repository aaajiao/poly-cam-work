import { describe, it, expect } from 'vitest'
import { isValidVimeoUrl, extractVimeoId, getVimeoEmbedUrl } from '@/utils/vimeo'

describe('isValidVimeoUrl', () => {
  it('accepts standard vimeo.com URL', () => expect(isValidVimeoUrl('https://vimeo.com/123456789')).toBe(true))
  it('accepts player.vimeo.com URL', () => expect(isValidVimeoUrl('https://player.vimeo.com/video/123456789')).toBe(true))
  it('accepts channel URL', () => expect(isValidVimeoUrl('https://vimeo.com/channels/mychannel/123456789')).toBe(true))
  it('rejects YouTube URL', () => expect(isValidVimeoUrl('https://youtube.com/watch?v=abc')).toBe(false))
  it('rejects empty string', () => expect(isValidVimeoUrl('')).toBe(false))
  it('rejects plain text', () => expect(isValidVimeoUrl('not-a-url')).toBe(false))
  it('rejects non-numeric ID', () => expect(isValidVimeoUrl('https://vimeo.com/abc')).toBe(false))
})

describe('extractVimeoId', () => {
  it('extracts ID from standard URL', () => expect(extractVimeoId('https://vimeo.com/123456789')).toBe('123456789'))
  it('extracts ID from player URL', () => expect(extractVimeoId('https://player.vimeo.com/video/987654321')).toBe('987654321'))
  it('returns null for invalid URL', () => expect(extractVimeoId('https://youtube.com/watch?v=abc')).toBeNull())
  it('returns null for empty string', () => expect(extractVimeoId('')).toBeNull())
})

describe('getVimeoEmbedUrl', () => {
  it('returns correct embed URL', () => expect(getVimeoEmbedUrl('123456789')).toBe('https://player.vimeo.com/video/123456789'))
})
