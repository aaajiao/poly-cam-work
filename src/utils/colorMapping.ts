import * as THREE from 'three'

export function colorRamp(value: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, value))
  // HSL: hue 240° (blue) → 0° (red) maps low→high values
  const hue = (1 - v) * 240 / 360
  const color = new THREE.Color().setHSL(hue, 1.0, 0.5)
  return [color.r, color.g, color.b]
}

export function mapHeightColors(
  positions: Float32Array,
  bounds: { min: [number, number, number]; max: [number, number, number] }
): Float32Array {
  const count = positions.length / 3
  const colors = new Float32Array(count * 3)

  // PLY uses Z-up convention; height = Z before the -Math.PI/2 rotation transform
  const minZ = bounds.min[2]
  const maxZ = bounds.max[2]
  const range = maxZ - minZ

  for (let i = 0; i < count; i++) {
    const z = positions[i * 3 + 2]
    const normalized = range > 0 ? (z - minZ) / range : 0.5
    const [r, g, b] = colorRamp(normalized)
    colors[i * 3]     = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }

  return colors
}

export function mapIntensityColors(originalColors: Float32Array): Float32Array {
  const count = originalColors.length / 3
  const colors = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    const r = originalColors[i * 3]
    const g = originalColors[i * 3 + 1]
    const b = originalColors[i * 3 + 2]
    // BT.601 perceptual luminance coefficients
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const [cr, cg, cb] = colorRamp(lum)
    colors[i * 3]     = cr
    colors[i * 3 + 1] = cg
    colors[i * 3 + 2] = cb
  }

  return colors
}
