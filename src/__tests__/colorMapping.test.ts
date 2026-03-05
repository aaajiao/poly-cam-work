import { describe, it, expect } from 'vitest'
import { colorRamp, mapHeightColors, mapIntensityColors } from '@/utils/colorMapping'

describe('colorRamp', () => {
  it('returns blue [~0, ~0, ~1] for value 0', () => {
    const [r, , b] = colorRamp(0)
    expect(b).toBeGreaterThan(0.8)
    expect(r).toBeLessThan(0.2)
  })

  it('returns red [~1, ~0, ~0] for value 1', () => {
    const [r, , b] = colorRamp(1)
    expect(r).toBeGreaterThan(0.8)
    expect(b).toBeLessThan(0.2)
  })

  it('returns green-ish for value 0.5', () => {
    const [, g] = colorRamp(0.5)
    expect(g).toBeGreaterThan(0.5)
  })

  it('clamps values below 0 to equal value 0', () => {
    const [r1, g1, b1] = colorRamp(-1)
    const [r2, g2, b2] = colorRamp(0)
    expect(r1).toBeCloseTo(r2, 3)
    expect(g1).toBeCloseTo(g2, 3)
    expect(b1).toBeCloseTo(b2, 3)
  })

  it('clamps values above 1 to equal value 1', () => {
    const [r1, g1, b1] = colorRamp(2)
    const [r2, g2, b2] = colorRamp(1)
    expect(r1).toBeCloseTo(r2, 3)
    expect(g1).toBeCloseTo(g2, 3)
    expect(b1).toBeCloseTo(b2, 3)
  })

  it('returns a 3-tuple of finite numbers', () => {
    const result = colorRamp(0.7)
    expect(result).toHaveLength(3)
    result.forEach((v) => {
      expect(isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    })
  })
})

describe('mapHeightColors', () => {
  it('returns Float32Array of correct length', () => {
    const positions = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2])
    const bounds = { min: [0, 0, 0] as [number, number, number], max: [2, 2, 2] as [number, number, number] }
    const colors = mapHeightColors(positions, bounds)
    expect(colors).toBeInstanceOf(Float32Array)
    expect(colors.length).toBe(9)
  })

  it('lowest point gets blue color', () => {
    const positions = new Float32Array([0, 0, 0, 0, 0, 10])
    const bounds = { min: [0, 0, 0] as [number, number, number], max: [0, 0, 10] as [number, number, number] }
    const colors = mapHeightColors(positions, bounds)
    expect(colors[2]).toBeGreaterThan(0.8)
    expect(colors[0]).toBeLessThan(0.2)
  })

  it('highest point gets red color', () => {
    const positions = new Float32Array([0, 0, 0, 0, 0, 10])
    const bounds = { min: [0, 0, 0] as [number, number, number], max: [0, 0, 10] as [number, number, number] }
    const colors = mapHeightColors(positions, bounds)
    expect(colors[3]).toBeGreaterThan(0.8)
    expect(colors[5]).toBeLessThan(0.2)
  })

  it('all output color values are in [0, 1]', () => {
    const positions = new Float32Array([0, 0, 0, 1, 2, 3, -1, -2, 5])
    const bounds = { min: [-1, -2, 0] as [number, number, number], max: [1, 2, 5] as [number, number, number] }
    const colors = mapHeightColors(positions, bounds)
    for (let i = 0; i < colors.length; i++) {
      expect(colors[i]).toBeGreaterThanOrEqual(0)
      expect(colors[i]).toBeLessThanOrEqual(1)
    }
  })

  it('uses z-axis (index 2) for height mapping', () => {
    const positionsLowZ = new Float32Array([0, 0, 0])
    const positionsHighZ = new Float32Array([0, 0, 10])
    const bounds = { min: [0, 0, 0] as [number, number, number], max: [0, 0, 10] as [number, number, number] }
    const colorsLow = mapHeightColors(positionsLowZ, bounds)
    const colorsHigh = mapHeightColors(positionsHighZ, bounds)
    expect(colorsLow[2]).toBeGreaterThan(colorsHigh[2])
  })
})

describe('mapIntensityColors', () => {
  it('returns Float32Array of correct length', () => {
    const original = new Float32Array([1, 0, 0, 0, 1, 0])
    const result = mapIntensityColors(original)
    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(6)
  })

  it('bright white maps to high intensity (red end)', () => {
    const original = new Float32Array([1, 1, 1])
    const result = mapIntensityColors(original)
    expect(result[0]).toBeGreaterThan(0.5)
  })

  it('black maps to low intensity (blue end)', () => {
    const original = new Float32Array([0, 0, 0])
    const result = mapIntensityColors(original)
    expect(result[2]).toBeGreaterThan(0.5)
  })

  it('all output values are in [0, 1]', () => {
    const original = new Float32Array([0.3, 0.6, 0.9, 0.1, 0.2, 0.3])
    const result = mapIntensityColors(original)
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0)
      expect(result[i]).toBeLessThanOrEqual(1)
    }
  })
})
