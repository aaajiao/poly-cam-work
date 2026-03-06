import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ScanScene,
  ViewMode,
  ToolMode,
  Measurement,
  Annotation,
  ClipPlaneState,
  ColorMapMode,
  PendingAnnotationInput,
} from '@/types'
import { PRESET_SCENES } from './presetScenes'
import { imageStorage } from '@/storage/imageStorage'

interface ViewerState {
  scenes: ScanScene[]
  uploadedScenes: ScanScene[]
  activeSceneId: string | null

  viewMode: ViewMode
  toolMode: ToolMode

  measurements: Measurement[]
  annotations: Annotation[]
  clipPlane: ClipPlaneState

  colorMapMode: ColorMapMode
  pointSize: number

  pendingAnnotationInput: PendingAnnotationInput | null

  selectedAnnotationId: string | null
  annotationsVisible: boolean
  annotationsPanelOpen: boolean

  isLoading: boolean
  loadingProgress: number
  loadingMessage: string

  setPendingAnnotationInput: (input: PendingAnnotationInput | null) => void
  setActiveScene: (id: string) => void
  setViewMode: (mode: ViewMode) => void
  setToolMode: (mode: ToolMode) => void
  addMeasurement: (m: Measurement) => void
  removeMeasurement: (id: string) => void
  clearMeasurements: () => void
  addAnnotation: (a: Annotation) => void
  removeAnnotation: (id: string) => void
  updateAnnotation: (id: string, text: string) => void
  updateAnnotationContent: (id: string, content: Partial<Pick<Annotation, 'title' | 'description' | 'images' | 'videoUrl' | 'links'>>) => void
  selectAnnotation: (id: string | null) => void
  toggleAnnotationsVisible: () => void
  setAnnotationsPanelOpen: (open: boolean) => void
  setClipPlane: (state: Partial<ClipPlaneState>) => void
  setColorMapMode: (mode: ColorMapMode) => void
  setPointSize: (size: number) => void
  setLoading: (loading: boolean, progress?: number, message?: string) => void
  addUploadedScene: (scene: ScanScene) => void
  removeUploadedScene: (id: string) => void
}

export const useViewerStore = create<ViewerState>()(
  persist(
    (set) => ({
      scenes: PRESET_SCENES,
      uploadedScenes: [],
      activeSceneId: PRESET_SCENES[0].id,

      viewMode: 'mesh',
      toolMode: 'orbit',

      measurements: [],
      annotations: [],
      clipPlane: {
        enabled: false,
        axis: 'y',
        position: 0.5,
        flipped: false,
      },

      colorMapMode: 'original',
      pointSize: 0.02,

      pendingAnnotationInput: null,

      selectedAnnotationId: null,
      annotationsVisible: true,
      annotationsPanelOpen: false,

      isLoading: false,
      loadingProgress: 0,
      loadingMessage: '',

      setPendingAnnotationInput: (pendingAnnotationInput) => set({ pendingAnnotationInput }),
      setActiveScene: (id) => set({ activeSceneId: id, measurements: [], selectedAnnotationId: null }),
      setViewMode: (viewMode) => set({ viewMode }),
      setToolMode: (toolMode) => set((state) => {
        const togglingOff = toolMode !== 'orbit' && toolMode === state.toolMode
        const nextMode = togglingOff ? 'orbit' : toolMode
        return {
          toolMode: nextMode,
          annotationsPanelOpen: nextMode === 'annotate' ? true : togglingOff && toolMode === 'annotate' ? false : state.annotationsPanelOpen,
        }
      }),

      addMeasurement: (m) =>
        set((state) => ({ measurements: [...state.measurements, m] })),
      removeMeasurement: (id) =>
        set((state) => ({ measurements: state.measurements.filter((m) => m.id !== id) })),
      clearMeasurements: () => set({ measurements: [] }),

      addAnnotation: (a) =>
        set((state) => ({ annotations: [...state.annotations, a] })),
      removeAnnotation: (id) => {
        imageStorage.deleteByAnnotation(id).catch(console.error)
        set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) }))
      },
      updateAnnotation: (id, text) =>
        set((state) => ({
          annotations: state.annotations.map((a) =>
            a.id === id ? { ...a, title: text } : a
          ),
        })),
      updateAnnotationContent: (id, content) =>
        set((state) => ({
          annotations: state.annotations.map((a) =>
            a.id === id ? { ...a, ...content } : a
          ),
        })),

      selectAnnotation: (id) => set({ selectedAnnotationId: id }),
      toggleAnnotationsVisible: () =>
        set((state) => ({ annotationsVisible: !state.annotationsVisible })),
      setAnnotationsPanelOpen: (annotationsPanelOpen) => set({ annotationsPanelOpen }),

      setClipPlane: (partial) =>
        set((state) => ({ clipPlane: { ...state.clipPlane, ...partial } })),
      setColorMapMode: (colorMapMode) => set({ colorMapMode }),
      setPointSize: (pointSize) => set({ pointSize }),

      setLoading: (isLoading, loadingProgress = 0, loadingMessage = '') =>
        set({ isLoading, loadingProgress, loadingMessage }),

      addUploadedScene: (scene) =>
        set((state) => ({
          uploadedScenes: [...state.uploadedScenes, scene],
          activeSceneId: scene.id,
        })),
      removeUploadedScene: (id) =>
        set((state) => {
          const removedAnnotations = state.annotations.filter((a) => a.sceneId === id)
          for (const a of removedAnnotations) {
            imageStorage.deleteByAnnotation(a.id).catch(console.error)
          }
          return {
            uploadedScenes: state.uploadedScenes.filter((s) => s.id !== id),
            annotations: state.annotations.filter((a) => a.sceneId !== id),
          }
        }),
    }),
    {
      name: 'polycam-viewer-state',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          // v0 format: { text } — v1 renames text→title, adds description/images/videoUrl/links/createdAt
          const state = persistedState as Record<string, unknown>
          if (Array.isArray(state.annotations)) {
            state.annotations = (state.annotations as Record<string, unknown>[]).map((a) => {
              const { text: _text, ...rest } = a
              return {
                ...rest,
                title: typeof a.text === 'string' ? a.text : (a.title ?? ''),
                description: a.description ?? '',
                images: a.images ?? [],
                videoUrl: a.videoUrl ?? null,
                links: a.links ?? [],
                createdAt: a.createdAt ?? Date.now(),
              }
            })
          }
        }
        return persistedState
      },
      partialize: (state) => ({
        annotations: state.annotations,
        colorMapMode: state.colorMapMode,
        pointSize: state.pointSize,
        viewMode: state.viewMode,
        selectedAnnotationId: state.selectedAnnotationId,
        annotationsVisible: state.annotationsVisible,
      }),
    }
  )
)

export const useActiveScene = () =>
  useViewerStore((state) => {
    const allScenes = [...state.scenes, ...state.uploadedScenes]
    return allScenes.find((s) => s.id === state.activeSceneId) ?? null
  })
