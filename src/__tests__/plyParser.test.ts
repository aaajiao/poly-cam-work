import { describe, it, expect } from 'vitest'

// Exercises the real worker parser (the pure `parsePLY` export). The worker
// module assigns `self.onmessage` at import, which is harmless under jsdom.
import { parsePLY } from '@/workers/ply-parser.worker'

const TYPE_BYTES: Record<string, number> = {
  char: 1, uchar: 1,
  short: 2, ushort: 2,
  int: 4, uint: 4,
  float: 4, double: 8,
}

interface PropSpec {
  name: string
  type: keyof typeof valueWriters
}

const valueWriters = {
  char: (v: DataView, o: number, x: number) => v.setInt8(o, x),
  uchar: (v: DataView, o: number, x: number) => v.setUint8(o, x),
  short: (v: DataView, o: number, x: number) => v.setInt16(o, x, true),
  ushort: (v: DataView, o: number, x: number) => v.setUint16(o, x, true),
  int: (v: DataView, o: number, x: number) => v.setInt32(o, x, true),
  uint: (v: DataView, o: number, x: number) => v.setUint32(o, x, true),
  float: (v: DataView, o: number, x: number) => v.setFloat32(o, x, true),
  double: (v: DataView, o: number, x: number) => v.setFloat64(o, x, true),
}

// Build a binary_little_endian PLY from an arbitrary vertex property layout.
// Each point is a record mapping property name -> numeric value.
function buildPLY(
  props: PropSpec[],
  points: Array<Record<string, number>>,
  opts: { format?: string } = {},
): ArrayBuffer {
  const format = opts.format ?? 'binary_little_endian 1.0'
  const propLines = props.map((p) => `property ${p.type} ${p.name}`).join('\n')
  const header =
    `ply\nformat ${format}\ncomment test fixture\n` +
    `element vertex ${points.length}\n${propLines}\nend_header\n`
  const headerBytes = new TextEncoder().encode(header)

  const offsets: Record<string, number> = {}
  let stride = 0
  for (const p of props) {
    offsets[p.name] = stride
    stride += TYPE_BYTES[p.type]
  }

  const buffer = new ArrayBuffer(headerBytes.length + points.length * stride)
  new Uint8Array(buffer).set(headerBytes)
  const view = new DataView(buffer, headerBytes.length)

  points.forEach((point, i) => {
    const base = i * stride
    for (const p of props) {
      const value = point[p.name] ?? 0
      valueWriters[p.type](view, base + offsets[p.name], value)
    }
  })
  return buffer
}

// Original exporter layout: double xyz + uchar rgb.
function createMinimalPLYBuffer(
  points: Array<[number, number, number, number, number, number]>,
): ArrayBuffer {
  return buildPLY(
    [
      { name: 'x', type: 'double' },
      { name: 'y', type: 'double' },
      { name: 'z', type: 'double' },
      { name: 'red', type: 'uchar' },
      { name: 'green', type: 'uchar' },
      { name: 'blue', type: 'uchar' },
    ],
    points.map(([x, y, z, r, g, b]) => ({ x, y, z, red: r, green: g, blue: b })),
  )
}

describe('PLY Parser', () => {
  it('parses 3 points correctly', () => {
    const buffer = createMinimalPLYBuffer([
      [1.0, 2.0, 3.0, 255, 0, 0],
      [4.0, 5.0, 6.0, 0, 255, 0],
      [7.0, 8.0, 9.0, 0, 0, 255],
    ])
    const result = parsePLY(buffer)
    expect(result.count).toBe(3)
    expect(result.positions.length).toBe(9)
    expect(result.colors.length).toBe(9)
  })

  it('converts float64 coordinates to float32 correctly', () => {
    const buffer = createMinimalPLYBuffer([[1.5, 2.5, 3.5, 128, 64, 32]])
    const result = parsePLY(buffer)
    expect(result.positions[0]).toBeCloseTo(1.5, 3)
    expect(result.positions[1]).toBeCloseTo(2.5, 3)
    expect(result.positions[2]).toBeCloseTo(3.5, 3)
  })

  it('normalizes colors from uint8 to 0-1 range', () => {
    const buffer = createMinimalPLYBuffer([[0, 0, 0, 255, 128, 0]])
    const result = parsePLY(buffer)
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
    const result = parsePLY(buffer)
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
    const result = parsePLY(buffer)
    expect(result.bounds.min[0]).toBeCloseTo(-2.0, 3)
    expect(result.bounds.max[0]).toBeCloseTo(5.0, 3)
    expect(result.bounds.min[2]).toBeCloseTo(-1.0, 3)
    expect(result.bounds.max[2]).toBeCloseTo(2.0, 3)
  })

  it('handles a single point', () => {
    const buffer = createMinimalPLYBuffer([[0.0, 0.0, 0.0, 0, 0, 0]])
    const result = parsePLY(buffer)
    expect(result.count).toBe(1)
    expect(result.positions.length).toBe(3)
    expect(result.colors.length).toBe(3)
  })

  it('preserves x and y coordinates correctly', () => {
    const buffer = createMinimalPLYBuffer([[10.0, -5.0, 3.0, 100, 150, 200]])
    const result = parsePLY(buffer)
    expect(result.positions[0]).toBeCloseTo(10.0, 3)
    expect(result.positions[1]).toBeCloseTo(-5.0, 3)
    expect(result.positions[2]).toBeCloseTo(3.0, 3)
  })

  it('bounding box min equals max for single point', () => {
    const buffer = createMinimalPLYBuffer([[3.0, 4.0, 5.0, 0, 0, 0]])
    const result = parsePLY(buffer)
    expect(result.bounds.min[0]).toBeCloseTo(3.0, 3)
    expect(result.bounds.max[0]).toBeCloseTo(3.0, 3)
    expect(result.bounds.min[1]).toBeCloseTo(4.0, 3)
    expect(result.bounds.max[1]).toBeCloseTo(4.0, 3)
    expect(result.bounds.min[2]).toBeCloseTo(5.0, 3)
    expect(result.bounds.max[2]).toBeCloseTo(5.0, 3)
  })
})

describe('PLY Parser — header-driven layouts (ITEM 7)', () => {
  it('parses a float32 coordinate layout', () => {
    const buffer = buildPLY(
      [
        { name: 'x', type: 'float' },
        { name: 'y', type: 'float' },
        { name: 'z', type: 'float' },
        { name: 'red', type: 'uchar' },
        { name: 'green', type: 'uchar' },
        { name: 'blue', type: 'uchar' },
      ],
      [{ x: 1.5, y: -2.25, z: 3.75, red: 255, green: 0, blue: 128 }],
    )
    const result = parsePLY(buffer)
    expect(result.count).toBe(1)
    expect(result.positions[0]).toBeCloseTo(1.5, 4)
    expect(result.positions[1]).toBeCloseTo(-2.25, 4)
    expect(result.positions[2]).toBeCloseTo(3.75, 4)
    expect(result.colors[0]).toBeCloseTo(1.0, 3)
    expect(result.colors[2]).toBeCloseTo(0.502, 2)
  })

  it('handles reordered properties (colors before coordinates)', () => {
    const buffer = buildPLY(
      [
        { name: 'red', type: 'uchar' },
        { name: 'green', type: 'uchar' },
        { name: 'blue', type: 'uchar' },
        { name: 'x', type: 'float' },
        { name: 'y', type: 'float' },
        { name: 'z', type: 'float' },
      ],
      [{ red: 10, green: 20, blue: 30, x: 7, y: 8, z: 9 }],
    )
    const result = parsePLY(buffer)
    expect(result.positions[0]).toBeCloseTo(7, 4)
    expect(result.positions[1]).toBeCloseTo(8, 4)
    expect(result.positions[2]).toBeCloseTo(9, 4)
    expect(result.colors[0]).toBeCloseTo(10 / 255, 4)
    expect(result.colors[1]).toBeCloseTo(20 / 255, 4)
    expect(result.colors[2]).toBeCloseTo(30 / 255, 4)
  })

  it('skips arbitrary extra scalar properties (normals + alpha)', () => {
    const buffer = buildPLY(
      [
        { name: 'x', type: 'float' },
        { name: 'y', type: 'float' },
        { name: 'z', type: 'float' },
        { name: 'nx', type: 'float' },
        { name: 'ny', type: 'float' },
        { name: 'nz', type: 'float' },
        { name: 'red', type: 'uchar' },
        { name: 'green', type: 'uchar' },
        { name: 'blue', type: 'uchar' },
        { name: 'alpha', type: 'uchar' },
      ],
      [
        {
          x: -1, y: 2, z: -3,
          nx: 0, ny: 1, nz: 0,
          red: 200, green: 100, blue: 50, alpha: 255,
        },
      ],
    )
    const result = parsePLY(buffer)
    expect(result.positions[0]).toBeCloseTo(-1, 4)
    expect(result.positions[1]).toBeCloseTo(2, 4)
    expect(result.positions[2]).toBeCloseTo(-3, 4)
    expect(result.colors[0]).toBeCloseTo(200 / 255, 4)
    expect(result.colors[1]).toBeCloseTo(100 / 255, 4)
    expect(result.colors[2]).toBeCloseTo(50 / 255, 4)
  })

  it('defaults to white when colour channels are absent', () => {
    const buffer = buildPLY(
      [
        { name: 'x', type: 'float' },
        { name: 'y', type: 'float' },
        { name: 'z', type: 'float' },
      ],
      [{ x: 0, y: 0, z: 0 }],
    )
    const result = parsePLY(buffer)
    expect(result.colors[0]).toBe(1)
    expect(result.colors[1]).toBe(1)
    expect(result.colors[2]).toBe(1)
  })

  it('rejects ascii PLY with a clear error', () => {
    const buffer = buildPLY(
      [
        { name: 'x', type: 'double' },
        { name: 'y', type: 'double' },
        { name: 'z', type: 'double' },
      ],
      [{ x: 0, y: 0, z: 0 }],
      { format: 'ascii 1.0' },
    )
    expect(() => parsePLY(buffer)).toThrow(/ascii/i)
  })

  it('rejects big-endian PLY with a clear error', () => {
    const buffer = buildPLY(
      [
        { name: 'x', type: 'double' },
        { name: 'y', type: 'double' },
        { name: 'z', type: 'double' },
      ],
      [{ x: 0, y: 0, z: 0 }],
      { format: 'binary_big_endian 1.0' },
    )
    expect(() => parsePLY(buffer)).toThrow(/big-endian/i)
  })

  it('rejects a vertex list property with a clear error', () => {
    const header =
      'ply\nformat binary_little_endian 1.0\n' +
      'element vertex 1\n' +
      'property float x\nproperty float y\nproperty float z\n' +
      'property list uchar int extra\n' +
      'end_header\n'
    const headerBytes = new TextEncoder().encode(header)
    const buffer = new ArrayBuffer(headerBytes.length + 16)
    new Uint8Array(buffer).set(headerBytes)
    expect(() => parsePLY(buffer)).toThrow(/list properties/i)
  })

  it('rejects a layout missing x/y/z with a clear error', () => {
    const buffer = buildPLY(
      [
        { name: 'x', type: 'float' },
        { name: 'y', type: 'float' },
        { name: 'red', type: 'uchar' },
      ],
      [{ x: 1, y: 2, red: 255 }],
    )
    expect(() => parsePLY(buffer)).toThrow(/missing x\/y\/z/i)
  })

  it('rejects an unknown scalar property type with a clear error', () => {
    const header =
      'ply\nformat binary_little_endian 1.0\n' +
      'element vertex 1\n' +
      'property float64x x\nproperty float y\nproperty float z\n' +
      'end_header\n'
    const headerBytes = new TextEncoder().encode(header)
    const buffer = new ArrayBuffer(headerBytes.length + 16)
    new Uint8Array(buffer).set(headerBytes)
    expect(() => parsePLY(buffer)).toThrow(/Unsupported PLY property type/i)
  })
})
