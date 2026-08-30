export const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_DISPLAY_IMAGE_DIMENSION = 2560
export const DISPLAY_IMAGE_BYTE_BUDGET = 4 * 1024 * 1024

const MIN_DISPLAY_IMAGE_DIMENSION = 2048
const MAX_RESIZE_PASSES = 3
const LOSSY_QUALITY_STEPS = [0.9, 0.86, 0.82]
const supportedImageMimeTypes = new Set<string>(SUPPORTED_IMAGE_MIME_TYPES)
const lossyImageMimeTypes = new Set<string>(['image/jpeg', 'image/webp'])
const mimeTypeAliases = new Map<string, string>([['image/jpg', 'image/jpeg']])
const extensionMimeTypes = new Map<string, string>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
])

interface ImageDimensions {
  width: number
  height: number
}

export function isSupportedImageMimeType(type: string): boolean {
  return normalizeImageMimeType(type) !== null
}

export function normalizeImageMimeType(type: string): string | null {
  const normalized = type.trim().toLowerCase()
  const canonical = mimeTypeAliases.get(normalized) ?? normalized
  return supportedImageMimeTypes.has(canonical) ? canonical : null
}

export function resolveImageMimeType(file: {
  type: string
  name: string
}): string | null {
  const declaredType = normalizeImageMimeType(file.type)
  if (declaredType) return declaredType

  const normalizedType = file.type.trim().toLowerCase()
  if (normalizedType !== '' && normalizedType !== 'application/octet-stream') {
    return null
  }

  const extension = file.name.trim().toLowerCase().split('.').pop()
  return extension ? (extensionMimeTypes.get(extension) ?? null) : null
}

function fitWithinDimension(
  width: number,
  height: number,
  maxDimension: number
): ImageDimensions {
  const scale = Math.min(maxDimension / width, maxDimension / height, 1)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(blob)
    image.decoding = 'async'

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Image could not be decoded'))
    }
    image.src = objectUrl
  })
}

function renderImage(
  image: HTMLImageElement,
  dimensions: ImageDimensions
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = dimensions.width
  canvas.height = dimensions.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context unavailable')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height)

  return canvas
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
          return
        }
        reject(new Error('Image encoding failed'))
      },
      type,
      quality
    )
  })
}

async function encodeForDisplay(
  canvas: HTMLCanvasElement,
  type: string
): Promise<Blob> {
  if (!lossyImageMimeTypes.has(type)) {
    return encodeCanvas(canvas, type)
  }

  let encoded: Blob | null = null
  for (const quality of LOSSY_QUALITY_STEPS) {
    encoded = await encodeCanvas(canvas, type, quality)
    if (encoded.size <= DISPLAY_IMAGE_BYTE_BUDGET) {
      return encoded
    }
  }

  if (!encoded) {
    throw new Error('Image encoding failed')
  }
  return encoded
}

/**
 * Build the single high-quality display derivative stored locally and later
 * uploaded to Blob. Pixel dimensions drive the first resize so a highly
 * compressed source is still bounded and a metadata-heavy source is not
 * needlessly reduced. The byte budget is soft: clarity wins once the long edge
 * reaches the Retina-safe floor used by the largest annotation panel.
 */
export async function prepareImageForStorage(file: File): Promise<Blob> {
  const imageType = resolveImageMimeType(file)
  if (!imageType) {
    throw new Error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.')
  }
  const normalizedFile =
    file.type.trim().toLowerCase() === imageType
      ? file
      : new File([file], file.name, {
          type: imageType,
          lastModified: file.lastModified,
        })
  if (imageType === 'image/gif') return normalizedFile

  const image = await loadImage(normalizedFile)
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Image has invalid dimensions')
  }

  let dimensions = fitWithinDimension(
    sourceWidth,
    sourceHeight,
    MAX_DISPLAY_IMAGE_DIMENSION
  )
  const needsResize =
    dimensions.width !== sourceWidth || dimensions.height !== sourceHeight
  const needsReencode = normalizedFile.size > DISPLAY_IMAGE_BYTE_BUDGET
  if (!needsResize && !needsReencode) return normalizedFile

  let encoded = await encodeForDisplay(renderImage(image, dimensions), imageType)
  let resizePass = 0

  while (
    encoded.size > DISPLAY_IMAGE_BYTE_BUDGET &&
    Math.max(dimensions.width, dimensions.height) > MIN_DISPLAY_IMAGE_DIMENSION &&
    resizePass < MAX_RESIZE_PASSES
  ) {
    const currentLongEdge = Math.max(dimensions.width, dimensions.height)
    const byteDrivenScale =
      Math.sqrt(DISPLAY_IMAGE_BYTE_BUDGET / encoded.size) * 0.96
    const nextLongEdge = Math.max(
      MIN_DISPLAY_IMAGE_DIMENSION,
      Math.floor(currentLongEdge * Math.min(0.92, byteDrivenScale))
    )
    if (nextLongEdge >= currentLongEdge) break

    dimensions = fitWithinDimension(sourceWidth, sourceHeight, nextLongEdge)
    encoded = await encodeForDisplay(renderImage(image, dimensions), imageType)
    resizePass += 1
  }

  return encoded
}
