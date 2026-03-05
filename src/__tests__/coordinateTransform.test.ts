import { describe, it, expect } from 'vitest'

function applyPLYTransform(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

describe('PLY Coordinate Transform (Z-up → Y-up)', () => {
  it('transforms PLY(1, 2, 3) → Scene(1, 3, -2)', () => {
    const [sx, sy, sz] = applyPLYTransform(1, 2, 3)
    expect(sx).toBeCloseTo(1, 5)
    expect(sy).toBeCloseTo(3, 5)
    expect(sz).toBeCloseTo(-2, 5)
  })

  it('transforms origin PLY(0, 0, 0) → Scene(0, 0, 0)', () => {
    const [sx, sy, sz] = applyPLYTransform(0, 0, 0)
    expect(sx).toBeCloseTo(0, 5)
    expect(sy).toBeCloseTo(0, 5)
    expect(sz).toBeCloseTo(0, 5)
  })

  it('transforms negative PLY(-1, -2, -3) → Scene(-1, -3, 2)', () => {
    const [sx, sy, sz] = applyPLYTransform(-1, -2, -3)
    expect(sx).toBeCloseTo(-1, 5)
    expect(sy).toBeCloseTo(-3, 5)
    expect(sz).toBeCloseTo(2, 5)
  })

  it('height (Z in PLY) becomes Y in scene', () => {
    const [, sy] = applyPLYTransform(0, 0, 5)
    expect(sy).toBeCloseTo(5, 5)
  })

  it('PLY Y-axis becomes negative scene Z', () => {
    const [, , sz] = applyPLYTransform(0, 3, 0)
    expect(sz).toBeCloseTo(-3, 5)
  })

  it('X axis is unchanged by the transform', () => {
    const [sx] = applyPLYTransform(7, 0, 0)
    expect(sx).toBeCloseTo(7, 5)
  })

  it('transform is reversible: applying it twice yields sign flip on y and z', () => {
    const [sx, sy, sz] = applyPLYTransform(...applyPLYTransform(1, 2, 3))
    expect(sx).toBeCloseTo(1, 5)
    expect(sy).toBeCloseTo(-2, 5)
    expect(sz).toBeCloseTo(-3, 5)
  })
})
