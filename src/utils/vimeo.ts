/**
 * Vimeo URL validation and embed utilities.
 * Only Vimeo is supported — no YouTube, no self-hosted video.
 */

const VIMEO_PATTERNS = [
  /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\?.*)?$/,
  /^https?:\/\/player\.vimeo\.com\/video\/(\d+)(?:\?.*)?$/,
  /^https?:\/\/(?:www\.)?vimeo\.com\/channels\/[^/]+\/(\d+)(?:\?.*)?$/,
]

/**
 * Returns true only for valid Vimeo URLs.
 * Rejects YouTube, non-Vimeo, and malformed URLs.
 */
export function isValidVimeoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return VIMEO_PATTERNS.some((pattern) => pattern.test(url.trim()))
}

/**
 * Extracts the numeric Vimeo video ID from a URL.
 * Returns null if URL is not a valid Vimeo URL.
 */
export function extractVimeoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  for (const pattern of VIMEO_PATTERNS) {
    const match = url.trim().match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

/**
 * Returns the Vimeo player embed URL for a given video ID.
 */
export function getVimeoEmbedUrl(videoId: string): string {
  return `https://player.vimeo.com/video/${videoId}`
}
