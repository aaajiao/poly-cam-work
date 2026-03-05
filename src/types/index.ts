// Scan scene definition
export interface ScanScene {
  id: string
  name: string
  glbUrl: string
  plyUrl: string
  metadata?: ScanMetadata
}

// Scan metadata (populated after loading)
export interface ScanMetadata {
  pointCount: number
  vertexCount: number
  triangleCount: number
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  fileSize: number
}

// View mode: which representation to show
export type ViewMode = 'mesh' | 'pointcloud' | 'both'

// Tool mode: which interactive tool is active
export type ToolMode = 'orbit' | 'measure' | 'annotate'

// Measurement result
export interface Measurement {
  id: string
  type: 'distance' | 'area'
  points: [number, number, number][]
  value: number
  unit: string
  label?: string
}

// Rich media types for annotations
export interface AnnotationImage {
  id: string           // matches IndexedDB key
  filename: string     // original filename
  thumbnailId: string  // thumbnail key in IndexedDB
}

export interface AnnotationLink {
  url: string
  label: string        // display text
}

export interface ImageStorageItem {
  id: string
  blob: Blob
  annotationId: string
  filename: string
  createdAt: number
}

export type AnnotationLOD = 'far' | 'close'

// 3D annotation
export interface Annotation {
  id: string
  position: [number, number, number]
  normal?: [number, number, number]    // surface normal at placement point
  title: string                        // was "text" — renamed
  description: string                  // longer text (default "")
  images: AnnotationImage[]            // image references into IndexedDB
  videoUrl: string | null              // Vimeo URL, null = no video
  links: AnnotationLink[]              // clickable URLs
  color?: string
  sceneId: string
  createdAt: number                    // timestamp ms
}

// Clipping plane state
export interface ClipPlaneState {
  enabled: boolean
  axis: 'x' | 'y' | 'z'
  position: number  // normalized 0-1 within model bounds
  flipped: boolean
}

export interface PendingAnnotationInput {
  screenPos: { x: number; y: number }
  worldPos: [number, number, number]
  normal?: [number, number, number]
}

// Color mapping mode
export type ColorMapMode = 'original' | 'height' | 'intensity'

// PLY parse result from WebWorker
export interface PLYParseResult {
  positions: Float32Array
  colors: Float32Array
  count: number
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
}

// Worker message types
export type PLYWorkerMessage =
  | { type: 'parse'; buffer: ArrayBuffer }

export type PLYWorkerResponse =
  | { type: 'progress'; percent: number }
  | { type: 'done'; result: PLYParseResult }
  | { type: 'error'; message: string }
