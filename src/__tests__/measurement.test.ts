import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { calculateDistance, formatDistance, calculatePolygonArea, getMidpoint } from '@/utils/measurement'

describe('calculateDistance', () => {
  it('calculates 3-4-5 right triangle distance', () => {
    const p1 = new THREE.Vector3(0, 0, 0)
    const p2 = new THREE.Vector3(3, 4, 0)
    expect(calculateDistance(p1, p2)).toBeCloseTo(5, 5)
  })

  it('returns 0 for same point', () => {
    const p = new THREE.Vector3(1, 2, 3)
    expect(calculateDistance(p, p)).toBe(0)
  })

  it('calculates 3D distance correctly', () => {
    const p1 = new THREE.Vector3(0, 0, 0)
    const p2 = new THREE.Vector3(1, 1, 1)
    expect(calculateDistance(p1, p2)).toBeCloseTo(Math.sqrt(3), 5)
  })

  it('is symmetric', () => {
    const p1 = new THREE.Vector3(1, 2, 3)
    const p2 = new THREE.Vector3(4, 6, 3)
    expect(calculateDistance(p1, p2)).toBeCloseTo(calculateDistance(p2, p1), 10)
  })

  it('calculates distance along a single axis', () => {
    const p1 = new THREE.Vector3(0, 0, 0)
    const p2 = new THREE.Vector3(0, 5, 0)
    expect(calculateDistance(p1, p2)).toBeCloseTo(5, 5)
  })
})

describe('formatDistance', () => {
  it('formats meters with 2 decimal places', () => {
    expect(formatDistance(2.456)).toBe('2.46 m')
  })

  it('formats centimeters for sub-meter distances', () => {
    expect(formatDistance(0.5)).toBe('50.0 cm')
  })

  it('formats millimeters for very small distances', () => {
    expect(formatDistance(0.005)).toBe('5.0 mm')
  })

  it('formats zero correctly', () => {
    expect(formatDistance(0)).toBe('0.0 mm')
  })

  it('formats exactly 1 meter', () => {
    expect(formatDistance(1)).toBe('1.00 m')
  })

  it('formats boundary 0.01 m as cm', () => {
    expect(formatDistance(0.01)).toBe('1.0 cm')
  })
})

describe('getMidpoint', () => {
  it('returns midpoint of two points', () => {
    const p1 = new THREE.Vector3(0, 0, 0)
    const p2 = new THREE.Vector3(2, 4, 6)
    const mid = getMidpoint(p1, p2)
    expect(mid.x).toBeCloseTo(1, 5)
    expect(mid.y).toBeCloseTo(2, 5)
    expect(mid.z).toBeCloseTo(3, 5)
  })

  it('midpoint of equal points is the same point', () => {
    const p = new THREE.Vector3(3, 5, 7)
    const mid = getMidpoint(p, p)
    expect(mid.x).toBeCloseTo(3, 5)
    expect(mid.y).toBeCloseTo(5, 5)
    expect(mid.z).toBeCloseTo(7, 5)
  })

  it('midpoint is equidistant from both endpoints', () => {
    const p1 = new THREE.Vector3(1, 0, 0)
    const p2 = new THREE.Vector3(5, 0, 0)
    const mid = getMidpoint(p1, p2)
    expect(calculateDistance(p1, mid)).toBeCloseTo(calculateDistance(p2, mid), 5)
  })
})

describe('calculatePolygonArea', () => {
  it('returns 0 for empty array', () => {
    expect(calculatePolygonArea([])).toBe(0)
  })

  it('returns 0 for a single point', () => {
    expect(calculatePolygonArea([new THREE.Vector3()])).toBe(0)
  })

  it('returns 0 for two points', () => {
    expect(calculatePolygonArea([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)])).toBe(0)
  })

  it('calculates area of unit square in XZ plane', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1, 0, 1),
      new THREE.Vector3(0, 0, 1),
    ]
    expect(calculatePolygonArea(points)).toBeCloseTo(1.0, 3)
  })

  it('calculates area of 3x4 rectangle', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(3, 0, 0),
      new THREE.Vector3(3, 0, 4),
      new THREE.Vector3(0, 0, 4),
    ]
    expect(calculatePolygonArea(points)).toBeCloseTo(12.0, 3)
  })

  it('calculates area of right triangle', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0, 0, 2),
    ]
    expect(calculatePolygonArea(points)).toBeCloseTo(2.0, 3)
  })
})
