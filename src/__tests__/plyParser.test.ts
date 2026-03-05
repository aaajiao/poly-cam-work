import { describe, it, expect } from 'vitest'

// Test the PLY parser logic directly (not the Worker, which can't run in jsdom)
// We test the core parsing algorithm by extracting it

function parsePLYBuffer(buffer: ArrayBuffer): {
  positions: Float32Array
  colors: Float32Array
  count: number
  bounds: { min: [number, number, number]; max: [number, number, number] }
} {
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder('ascii')

  // Find end_header
  const endHeaderMarker = new Uint8Array([101,110,100,95,104,101,97,100,101,114,10])
  let headerEnd = 0
  for (let i = 0; i < bytes.length - endHeaderMarker.length; i++) {
    let match = true
    for (let j = 0; j < endHeaderMarker.length; j++) {
      if (bytes[i + j] !== endHeaderMarker[j]) { match = false; break }
    }
    if (match) { headerEnd = i + endHeaderMarker.length; break }
  }

  const header = decoder.decode(bytes.slice(0, headerEnd))
  const vertexMatch = header.match(/element vertex (\d+)/)
  const count = parseInt(vertexMatch![1], 10)

  const BYTES_PER_POINT = 27
  const dataView = new DataView(buffer, headerEnd)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let i = 0; i < count; i++) {
    const offset = i * BYTES_PER_POINT
    const x = dataView.getFloat64(offset, true)
    const y = dataView.getFloat64(offset + 8, true)
    const z = dataView.getFloat64(offset + 16, true)
    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z
    colors[i * 3] = dataView.getUint8(offset + 24) / 255
    colors[i * 3 + 1] = dataView.getUint8(offset + 25) / 255
    colors[i * 3 + 2] = dataView.getUint8(offset + 26) / 255
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }

  return { positions, colors, count, bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] } }
}

function createMinimalPLYBuffer(points: Array<[number, number, number, number, number, number]>): ArrayBuffer {
  const header = `ply\nformat binary_little_endian 1.0\ncomment Created by Polycam\nelement vertex ${points.length}\nproperty double x\nproperty double y\nproperty double z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`
  const headerBytes = new TextEncoder().encode(header)
  const BYTES_PER_POINT = 27
  const buffer = new ArrayBuffer(headerBytes.length + points.length * BYTES_PER_POINT)
  const view = new Uint8Array(buffer)
  view.set(headerBytes)
  const dataView = new DataView(buffer, headerBytes.length)
  points.forEach(([x, y, z, r, g, b], i) => {
    const offset = i * BYTES_PER_POINT
    dataView.setFloat64(offset, x, true)
    dataView.setFloat64(offset + 8, y, true)
    dataView.setFloat64(offset + 16, z, true)
    dataView.setUint8(offset + 24, r)
    dataView.setUint8(offset + 25, g)
    dataView.setUint8(offset + 26, b)
  })
  return buffer
}

describe('PLY Parser', () => {
  it('parses 3 points correctly', () => {
    const buffer = createMinimalPLYBuffer([
      [1.0, 2.0, 3.0, 255, 0, 0],
      [4.0, 5.0, 6.0, 0, 255, 0],
      [7.0, 8.0, 9.0, 0, 0, 255],
    ])
    const result = parsePLYBuffer(buffer)
    expect(result.count).toBe(3)
    expect(result.positions.length).toBe(9)
    expect(result.colors.length).toBe(9)
  })

  it('converts float64 coordinates to float32 correctly', () => {
    const buffer = createMinimalPLYBuffer([[1.5, 2.5, 3.5, 128, 64, 32]])
    const result = parsePLYBuffer(buffer)
    expect(result.positions[0]).toBeCloseTo(1.5, 3)
    expect(result.positions[1]).toBeCloseTo(2.5, 3)
    expect(result.positions[2]).toBeCloseTo(3.5, 3)
  })

  it('normalizes colors from uint8 to 0-1 range', () => {
    const buffer = createMinimalPLYBuffer([[0, 0, 0, 255, 128, 0]])
    const result = parsePLYBuffer(buffer)
    expect(result.colors[0]).toBeCloseTo(1.0, 2)
    expect(result.colors[1]).toBeCloseTo(0.502, 2)
    expect(result.colors[2]).toBeCloseTo(0.0, 2)
  })

  it('all color values are in [0, 1] range', () => {
    const buffer = createMinimalPLYBuffer([
      [0, 0, 0, 0, 0, 0],
      [1, 1, 1, 255, 255, 255],
      [2, 2, 2, 127, 200, 50],
    ])
    const result = parsePLYBuffer(buffer)
    for (let i = 0; i < result.colors.length; i++) {
      expect(result.colors[i]).toBeGreaterThanOrEqual(0)
      expect(result.colors[i]).toBeLessThanOrEqual(1)
    }
  })

  it('computes correct bounding box', () => {
    const buffer = createMinimalPLYBuffer([
      [-2.0, -3.0, -1.0, 0, 0, 0],
      [5.0, 4.0, 2.0, 0, 0, 0],
    ])
    const result = parsePLYBuffer(buffer)
    expect(result.bounds.min[0]).toBeCloseTo(-2.0, 3)
    expect(result.bounds.max[0]).toBeCloseTo(5.0, 3)
    expect(result.bounds.min[2]).toBeCloseTo(-1.0, 3)
    expect(result.bounds.max[2]).toBeCloseTo(2.0, 3)
  })

  it('handles a single point', () => {
    const buffer = createMinimalPLYBuffer([[0.0, 0.0, 0.0, 0, 0, 0]])
    const result = parsePLYBuffer(buffer)
    expect(result.count).toBe(1)
    expect(result.positions.length).toBe(3)
    expect(result.colors.length).toBe(3)
  })

  it('preserves x and y coordinates correctly', () => {
    const buffer = createMinimalPLYBuffer([[10.0, -5.0, 3.0, 100, 150, 200]])
    const result = parsePLYBuffer(buffer)
    expect(result.positions[0]).toBeCloseTo(10.0, 3)
    expect(result.positions[1]).toBeCloseTo(-5.0, 3)
    expect(result.positions[2]).toBeCloseTo(3.0, 3)
  })

  it('bounding box min equals max for single point', () => {
    const buffer = createMinimalPLYBuffer([[3.0, 4.0, 5.0, 0, 0, 0]])
    const result = parsePLYBuffer(buffer)
    expect(result.bounds.min[0]).toBeCloseTo(3.0, 3)
    expect(result.bounds.max[0]).toBeCloseTo(3.0, 3)
    expect(result.bounds.min[1]).toBeCloseTo(4.0, 3)
    expect(result.bounds.max[1]).toBeCloseTo(4.0, 3)
    expect(result.bounds.min[2]).toBeCloseTo(5.0, 3)
    expect(result.bounds.max[2]).toBeCloseTo(5.0, 3)
  })
})
