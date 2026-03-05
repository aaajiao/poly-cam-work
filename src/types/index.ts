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
export type ToolMode = 'orbit' | 'measure' | 'clip' | 'annotate'

// Measurement result
export interface Measurement {
  id: string
  type: 'distance' | 'area'
  points: [number, number, number][]
  value: number
  unit: string
  label?: string
}

// 3D annotation
export interface Annotation {
  id: string
  position: [number, number, number]
  text: string
  color?: string
  sceneId: string
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
