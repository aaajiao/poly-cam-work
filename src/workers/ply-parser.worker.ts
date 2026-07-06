/// <reference lib="webworker" />

import type { PLYParseResult } from '@/types'

self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const { buffer } = e.data
    const result = parsePLY(buffer, (percent) =>
      self.postMessage({ type: 'progress', percent })
    )
    // Transfer the large arrays back to main thread without copying
    self.postMessage(
      { type: 'done', result },
      [result.positions.buffer, result.colors.buffer]
    )
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
  }
}

// Byte size of each PLY scalar property type.
const TYPE_BYTES: Record<string, number> = {
  char: 1, int8: 1,
  uchar: 1, uint8: 1,
  short: 2, int16: 2,
  ushort: 2, uint16: 2,
  int: 4, int32: 4,
  uint: 4, uint32: 4,
  float: 4, float32: 4,
  double: 8, float64: 8,
}

interface VertexProperty {
  name: string
  type: string
  offset: number
}

function readScalar(view: DataView, offset: number, type: string): number {
  switch (type) {
    case 'char': case 'int8': return view.getInt8(offset)
    case 'uchar': case 'uint8': return view.getUint8(offset)
    case 'short': case 'int16': return view.getInt16(offset, true)
    case 'ushort': case 'uint16': return view.getUint16(offset, true)
    case 'int': case 'int32': return view.getInt32(offset, true)
    case 'uint': case 'uint32': return view.getUint32(offset, true)
    case 'float': case 'float32': return view.getFloat32(offset, true)
    case 'double': case 'float64': return view.getFloat64(offset, true)
    default: throw new Error(`Unsupported PLY property type: ${type}`)
  }
}

// Normalize a raw colour channel value into 0–1 based on its declared type.
function normalizeColor(value: number, type: string): number {
  switch (type) {
    case 'uchar': case 'uint8': return value / 255
    case 'char': case 'int8': return value / 127
    case 'ushort': case 'uint16': return value / 65535
    case 'short': case 'int16': return value / 32767
    // float channels are already authored in 0–1
    default: return value
  }
}

function findHeaderEnd(bytes: Uint8Array): number {
  // "end_header\n"
  const marker = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114, 10]
  for (let i = 0; i <= bytes.length - marker.length; i++) {
    let match = true
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker[j]) { match = false; break }
    }
    if (match) return i + marker.length
  }
  return 0
}

interface ParsedHeader {
  count: number
  stride: number
  properties: VertexProperty[]
}

// Parse the vertex element's property list, computing the byte stride and each
// property's offset from the declared scalar types (any order, arbitrary extra
// scalar properties are tolerated). Rejects list properties inside the vertex
// element and unknown scalar types with a clear message.
function parseVertexElement(header: string): ParsedHeader {
  const lines = header.split('\n')
  let count = -1
  let inVertex = false
  let stride = 0
  const properties: VertexProperty[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('element ')) {
      const parts = line.split(/\s+/)
      if (parts[1] === 'vertex') {
        inVertex = true
        count = parseInt(parts[2], 10)
      } else {
        // A different element begins; vertex property list is complete.
        inVertex = false
      }
      continue
    }
    if (inVertex && line.startsWith('property ')) {
      const parts = line.split(/\s+/)
      if (parts[1] === 'list') {
        throw new Error(
          'PLY vertex element with list properties is not supported'
        )
      }
      const type = parts[1]
      const name = parts[2]
      const size = TYPE_BYTES[type]
      if (size === undefined) {
        throw new Error(`Unsupported PLY property type: ${type}`)
      }
      properties.push({ name, type, offset: stride })
      stride += size
    }
  }

  if (count < 0 || Number.isNaN(count)) {
    throw new Error('No vertex element in PLY header')
  }

  return { count, stride, properties }
}

export function parsePLY(
  buffer: ArrayBuffer,
  onProgress?: (percent: number) => void
): PLYParseResult {
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder('ascii')

  const headerEnd = findHeaderEnd(bytes)
  if (headerEnd === 0) throw new Error('PLY header not found')

  const header = decoder.decode(bytes.slice(0, headerEnd))

  // Verify format — ascii and big-endian are unsupported (as before).
  if (!/format\s+binary_little_endian/.test(header)) {
    if (/format\s+ascii/.test(header)) {
      throw new Error('ASCII PLY is not supported; expected binary_little_endian')
    }
    if (/format\s+binary_big_endian/.test(header)) {
      throw new Error('Big-endian PLY is not supported; expected binary_little_endian')
    }
    throw new Error('Only binary_little_endian PLY supported')
  }

  const { count, stride, properties } = parseVertexElement(header)

  const px = properties.find((p) => p.name === 'x')
  const py = properties.find((p) => p.name === 'y')
  const pz = properties.find((p) => p.name === 'z')
  if (!px || !py || !pz) {
    throw new Error('PLY vertex element is missing x/y/z properties')
  }

  const rProp = properties.find((p) => p.name === 'red')
  const gProp = properties.find((p) => p.name === 'green')
  const bProp = properties.find((p) => p.name === 'blue')
  const color = rProp && gProp && bProp ? { r: rProp, g: gProp, b: bProp } : null

  const dataView = new DataView(buffer, headerEnd)

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  const PROGRESS_INTERVAL = Math.max(1, Math.floor(count / 10)) // report every 10%

  for (let i = 0; i < count; i++) {
    const base = i * stride

    const x = readScalar(dataView, base + px.offset, px.type)
    const y = readScalar(dataView, base + py.offset, py.type)
    const z = readScalar(dataView, base + pz.offset, pz.type)

    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    if (color) {
      colors[i * 3]     = normalizeColor(readScalar(dataView, base + color.r.offset, color.r.type), color.r.type)
      colors[i * 3 + 1] = normalizeColor(readScalar(dataView, base + color.g.offset, color.g.type), color.g.type)
      colors[i * 3 + 2] = normalizeColor(readScalar(dataView, base + color.b.offset, color.b.type), color.b.type)
    } else {
      // No colour channels — default to white.
      colors[i * 3]     = 1
      colors[i * 3 + 1] = 1
      colors[i * 3 + 2] = 1
    }

    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z

    if (onProgress && i > 0 && i % PROGRESS_INTERVAL === 0) {
      onProgress(Math.round((i / count) * 100))
    }
  }

  return {
    positions,
    colors,
    count,
    bounds: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
  }
}
