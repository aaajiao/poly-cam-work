import { describe, expect, it } from 'vitest'

import { normalizeSrgbColor } from '@/utils/themeColors'

describe('normalizeSrgbColor', () => {
  it('converts browser color(srgb) output into a Three.js-compatible RGB string', () => {
    expect(
      normalizeSrgbColor('color(srgb 0.284052 0.878085 0.996148)')
    ).toBe('rgb(72, 224, 254)')
  })

  it('clamps extended sRGB channels and ignores alpha', () => {
    expect(normalizeSrgbColor('color(srgb -0.2 1.4 0.5 / 0.4)')).toBe(
      'rgb(0, 255, 128)'
    )
  })

  it('rejects unsupported color syntax', () => {
    expect(normalizeSrgbColor('oklch(0.84 0.13 214)')).toBeNull()
  })
})
