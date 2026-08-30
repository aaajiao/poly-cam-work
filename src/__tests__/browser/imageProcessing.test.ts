import { describe, expect, test } from 'vitest'

import {
  DISPLAY_IMAGE_BYTE_BUDGET,
  MAX_DISPLAY_IMAGE_DIMENSION,
  prepareImageForStorage,
} from '@/utils/imageProcessing'

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encoding failed'))),
      type,
      quality
    )
  })
}

async function readImageDimensions(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  const dimensions = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return dimensions
}

describe('browser image processing', () => {
  test('caps the longest edge and preserves PNG transparency', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 1500
    const context = canvas.getContext('2d')
    expect(context).not.toBeNull()
    context!.clearRect(0, 0, canvas.width, canvas.height)
    context!.fillStyle = '#ff3158'
    context!.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height)

    const sourceBlob = await canvasToBlob(canvas, 'image/png')
    const source = new File([sourceBlob], 'transparent.png', { type: 'image/png' })
    const prepared = await prepareImageForStorage(source)

    expect(prepared.type).toBe('image/png')
    expect(await readImageDimensions(prepared)).toEqual({
      width: MAX_DISPLAY_IMAGE_DIMENSION,
      height: MAX_DISPLAY_IMAGE_DIMENSION / 2,
    })

    const bitmap = await createImageBitmap(prepared)
    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = 2
    sampleCanvas.height = 1
    const sampleContext = sampleCanvas.getContext('2d')
    expect(sampleContext).not.toBeNull()
    sampleContext!.drawImage(bitmap, 0, 0, 2, 1)
    bitmap.close()
    const pixels = sampleContext!.getImageData(0, 0, 2, 1).data
    expect(pixels[3]).toBe(0)
    expect(pixels[7]).toBe(255)
  })

  test('re-encodes a byte-heavy photo without shrinking moderate dimensions', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 800
    const context = canvas.getContext('2d')
    expect(context).not.toBeNull()
    context!.fillStyle = '#3158ff'
    context!.fillRect(0, 0, canvas.width, canvas.height)

    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.92)
    const padding = new Uint8Array(DISPLAY_IMAGE_BYTE_BUDGET + 1)
    const source = new File([jpeg, padding], 'metadata-heavy.jpg', {
      type: 'image/jpeg',
    })
    const prepared = await prepareImageForStorage(source)

    expect(source.size).toBeGreaterThan(DISPLAY_IMAGE_BYTE_BUDGET)
    expect(prepared.type).toBe('image/jpeg')
    expect(prepared.size).toBeLessThan(source.size)
    expect(await readImageDimensions(prepared)).toEqual({ width: 1200, height: 800 })
  })

  test('leaves a small image byte-for-byte untouched', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const sourceBlob = await canvasToBlob(canvas, 'image/webp', 0.9)
    const source = new File([sourceBlob], 'small.webp', { type: 'image/webp' })

    await expect(prepareImageForStorage(source)).resolves.toBe(source)
  })

  test('normalizes a valid dropped JPEG when the OS omits its MIME type', async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 600
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9)
    const source = new File([jpeg], 'camera-photo.jpg', { type: '' })

    const prepared = await prepareImageForStorage(source)

    expect(prepared.type).toBe('image/jpeg')
    expect(await readImageDimensions(prepared)).toEqual({ width: 800, height: 600 })
  })

  test('preserves animated GIF files instead of flattening them', async () => {
    const source = new File(
      [Uint8Array.from([71, 73, 70, 56, 57, 97])],
      'animation.gif',
      { type: 'image/gif' }
    )

    await expect(prepareImageForStorage(source)).resolves.toBe(source)
  })
})
