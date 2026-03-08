export type SceneId = string

export type OfficialSceneCatalogSource = 'bootstrap' | 'discovered' | 'published'

export type OfficialScenePairCompleteness = 'complete' | 'missing-glb' | 'missing-ply'

export type OfficialSceneSyncStatus = 'unsynced' | 'syncing' | 'synced' | 'error'

export interface OfficialSceneStatus {
  sceneId: SceneId
  catalogSource: OfficialSceneCatalogSource
  pairCompleteness: OfficialScenePairCompleteness
  syncStatus: OfficialSceneSyncStatus
}

export interface OfficialSceneSyncDiffEntry {
  sceneId: SceneId
  discovered: boolean
  published: boolean
  syncStatus: OfficialSceneSyncStatus
}

// Discovery validation errors (deterministic, UI-ready)
export type DiscoveryValidationErrorCode =
  | 'orphan-glb'
  | 'orphan-ply'
  | 'duplicate-basename'
  | 'malformed-glb'
  | 'malformed-ply'
  | 'invalid-basename'

export interface DiscoveryValidationError {
  code: DiscoveryValidationErrorCode
  basename: string
  message: string
}

export interface DiscoveredSceneCandidate {
  id: string
  name: string
  glbUrl: string
  plyUrl: string
}

export interface DiscoveryResult {
  scenes: DiscoveredSceneCandidate[]
  errors: DiscoveryValidationError[]
}

// Scan scene definition
export interface ScanScene {
  id: SceneId
  name: string
  glbUrl: string
  plyUrl: string
  metadata?: ScanMetadata
  catalogSource?: OfficialSceneCatalogSource
  officialStatus?: OfficialSceneStatus
  createdAt?: number
  updatedAt?: number
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
export type AnnotationImage =
  | {
      filename: string
      url: string
      localId?: never
    }
  | {
      filename: string
      localId: string
      url?: never
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
  images: AnnotationImage[]
  videoUrl: string | null              // Vimeo URL, null = no video
  links: AnnotationLink[]              // clickable URLs
  color?: string
  sceneId: string
  createdAt: number                    // timestamp ms
}

export interface SceneDraft {
  sceneId: string
  revision: number
  annotations: Annotation[]
  updatedAt: number
  publishedAt?: number
  publishedBy?: string
  message?: string
}

export interface LivePointer {
  version: number
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
