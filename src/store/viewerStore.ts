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

      isLoading: false,
      loadingProgress: 0,
      loadingMessage: '',

      setPendingAnnotationInput: (pendingAnnotationInput) => set({ pendingAnnotationInput }),
      setActiveScene: (id) => set({ activeSceneId: id, measurements: [] }),
      setViewMode: (viewMode) => set({ viewMode }),
      setToolMode: (toolMode) => set({ toolMode }),

      addMeasurement: (m) =>
        set((state) => ({ measurements: [...state.measurements, m] })),
      removeMeasurement: (id) =>
        set((state) => ({ measurements: state.measurements.filter((m) => m.id !== id) })),
      clearMeasurements: () => set({ measurements: [] }),

      addAnnotation: (a) =>
        set((state) => ({ annotations: [...state.annotations, a] })),
      removeAnnotation: (id) =>
        set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) })),
      updateAnnotation: (id, text) =>
        set((state) => ({
          annotations: state.annotations.map((a) =>
            a.id === id ? { ...a, title: text } : a
          ),
        })),

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
        set((state) => ({
          uploadedScenes: state.uploadedScenes.filter((s) => s.id !== id),
        })),
    }),
    {
      name: 'polycam-viewer-state',
      partialize: (state) => ({
        annotations: state.annotations,
        colorMapMode: state.colorMapMode,
        pointSize: state.pointSize,
        viewMode: state.viewMode,
      }),
    }
  )
)

export const useActiveScene = () =>
  useViewerStore((state) => {
    const allScenes = [...state.scenes, ...state.uploadedScenes]
    return allScenes.find((s) => s.id === state.activeSceneId) ?? null
  })
