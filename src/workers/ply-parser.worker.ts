/// <reference lib="webworker" />

import type { PLYParseResult } from '@/types'

self.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const { buffer } = e.data
    const result = parsePLY(buffer)
    // Transfer the large arrays back to main thread without copying
    self.postMessage(
      { type: 'done', result },
      [result.positions.buffer, result.colors.buffer]
    )
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) })
  }
}

function parsePLY(buffer: ArrayBuffer): PLYParseResult {
  const bytes = new Uint8Array(buffer)

  // --- Parse header ---
  const decoder = new TextDecoder('ascii')

  // Find "end_header\n"
  const endHeaderMarker = new Uint8Array([101, 110, 100, 95, 104, 101, 97, 100, 101, 114, 10]) // "end_header\n"
  let headerEnd = 0
  for (let i = 0; i < bytes.length - endHeaderMarker.length; i++) {
    let match = true
    for (let j = 0; j < endHeaderMarker.length; j++) {
      if (bytes[i + j] !== endHeaderMarker[j]) { match = false; break }
    }
    if (match) { headerEnd = i + endHeaderMarker.length; break }
  }

  if (headerEnd === 0) throw new Error('PLY header not found')

  const header = decoder.decode(bytes.slice(0, headerEnd))

  // Extract vertex count
  const vertexMatch = header.match(/element vertex (\d+)/)
  if (!vertexMatch) throw new Error('No vertex count in PLY header')
  const count = parseInt(vertexMatch[1], 10)

  // Verify format
  if (!header.includes('format binary_little_endian')) {
    throw new Error('Only binary_little_endian PLY supported')
  }

  // --- Parse binary data ---
  const BYTES_PER_POINT = 27 // 3×float64 + 3×uint8
  const dataView = new DataView(buffer, headerEnd)

  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  const PROGRESS_INTERVAL = Math.max(1, Math.floor(count / 10)) // report every 10%

  for (let i = 0; i < count; i++) {
    const offset = i * BYTES_PER_POINT

    // Read float64 coordinates (little-endian)
    const x = dataView.getFloat64(offset, true)
    const y = dataView.getFloat64(offset + 8, true)
    const z = dataView.getFloat64(offset + 16, true)

    // Convert to float32 (safe: coords are ±10m, float32 precision ~0.001mm)
    positions[i * 3]     = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    // Read uint8 colors, normalize to 0-1
    colors[i * 3]     = dataView.getUint8(offset + 24) / 255
    colors[i * 3 + 1] = dataView.getUint8(offset + 25) / 255
    colors[i * 3 + 2] = dataView.getUint8(offset + 26) / 255

    // Track bounds
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z

    // Report progress every 10%
    if (i > 0 && i % PROGRESS_INTERVAL === 0) {
      self.postMessage({ type: 'progress', percent: Math.round((i / count) * 100) })
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
