import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ScanScene,
  ViewMode,
  ToolMode,
  Measurement,
  Annotation,
  AnnotationImage,
  ClipPlaneState,
  ColorMapMode,
  PendingAnnotationInput,
  SceneDraft,
} from '@/types'
import { PRESET_SCENES } from './presetScenes'
import { imageStorage } from '@/storage/imageStorage'
import { vercelBlobImageStorage } from '@/storage/vercelBlobImageStorage'
import * as publishApi from '@/lib/publishApi'

const PERSIST_KEY = 'polycam-viewer-state'

type DraftStatus = 'idle' | 'loading' | 'saving' | 'error' | 'conflict'

type LegacyAnnotationImage = AnnotationImage & {
  id?: string
}

function sceneAnnotations(annotations: Annotation[], sceneId: string) {
  return annotations.filter((annotation) => annotation.sceneId === sceneId)
}

function replaceSceneAnnotations(
  currentAnnotations: Annotation[],
  sceneId: string,
  nextSceneAnnotations: Annotation[]
) {
  const nonScene = currentAnnotations.filter((annotation) => annotation.sceneId !== sceneId)
  return [...nonScene, ...nextSceneAnnotations]
}

function normalizeDraft(sceneId: string, draft: SceneDraft): SceneDraft {
  return {
    sceneId,
    revision: draft.revision,
    annotations: draft.annotations,
    updatedAt: draft.updatedAt,
    publishedAt: draft.publishedAt,
    publishedBy: draft.publishedBy,
    message: draft.message,
  }
}

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
  openAnnotationPanelIds: string[]
  hoveredAnnotationId: string | null
  annotationsVisible: boolean
  annotationsPanelOpen: boolean
  sidebarOpen: boolean
  cameraControlsEnabled: boolean

  isLoading: boolean
  loadingProgress: number
  loadingMessage: string

  draftStatus: DraftStatus
  draftError: string | null
  isAuthenticated: boolean
  draftRevisionByScene: Record<string, number>
  publishedVersionByScene: Record<string, number>

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
  setHoveredAnnotation: (id: string | null) => void
  openAnnotationPanel: (id: string) => void
  closeAnnotationPanel: (id: string) => void
  toggleAnnotationPanel: (id: string) => void
  clearAnnotationPanels: () => void
  toggleAnnotationsVisible: () => void
  setAnnotationsPanelOpen: (open: boolean) => void
  setSidebarOpen: (open: boolean) => void
  setCameraControlsEnabled: (enabled: boolean) => void
  setClipPlane: (state: Partial<ClipPlaneState>) => void
  setColorMapMode: (mode: ColorMapMode) => void
  setPointSize: (size: number) => void
  setLoading: (loading: boolean, progress?: number, message?: string) => void
  addUploadedScene: (scene: ScanScene) => void
  removeUploadedScene: (id: string) => void
  loadDraft: (sceneId: string) => Promise<void>
  saveDraft: (sceneId: string) => Promise<number>
  publishDraft: (sceneId: string, message?: string) => Promise<number>
  rollbackToVersion: (sceneId: string, version: number) => Promise<number>
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
  importLocalData: (sceneId: string) => Promise<void>
}

export const useViewerStore = create<ViewerState>()(
  persist(
    (set, get) => ({
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
      openAnnotationPanelIds: [],
      hoveredAnnotationId: null,
      annotationsVisible: true,
      annotationsPanelOpen: false,
      sidebarOpen: false,
      cameraControlsEnabled: true,

      isLoading: false,
      loadingProgress: 0,
      loadingMessage: '',

      draftStatus: 'idle',
      draftError: null,
      isAuthenticated: false,
      draftRevisionByScene: {},
      publishedVersionByScene: {},

      setPendingAnnotationInput: (pendingAnnotationInput) => set({ pendingAnnotationInput }),
      setActiveScene: (id) => set({
        activeSceneId: id,
        measurements: [],
        selectedAnnotationId: null,
        openAnnotationPanelIds: [],
        hoveredAnnotationId: null,
      }),
      setViewMode: (viewMode) => set({ viewMode }),
      setToolMode: (toolMode) => set((state) => {
        const togglingOff = toolMode !== 'orbit' && toolMode === state.toolMode
        const nextMode = togglingOff ? 'orbit' : toolMode
        const panelOpen = nextMode === 'annotate' ? true : togglingOff && toolMode === 'annotate' ? false : state.annotationsPanelOpen
        return {
          toolMode: nextMode,
          annotationsPanelOpen: panelOpen,
          sidebarOpen: nextMode === 'annotate' ? true : state.sidebarOpen,
        }
      }),

      addMeasurement: (m) =>
        set((state) => ({ measurements: [...state.measurements, m] })),
      removeMeasurement: (id) =>
        set((state) => ({ measurements: state.measurements.filter((m) => m.id !== id) })),
      clearMeasurements: () => set({ measurements: [] }),

      addAnnotation: (a) =>
        set((state) => ({ annotations: [...state.annotations, a], annotationsVisible: true })),
      removeAnnotation: (id) => {
        set((state) => ({
          annotations: state.annotations.filter((a) => a.id !== id),
          selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
          openAnnotationPanelIds: state.openAnnotationPanelIds.filter((panelId) => panelId !== id),
          hoveredAnnotationId: state.hoveredAnnotationId === id ? null : state.hoveredAnnotationId,
        }))
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
      setHoveredAnnotation: (id) => set({ hoveredAnnotationId: id }),
      openAnnotationPanel: (id) =>
        set((state) => {
          if (state.openAnnotationPanelIds.includes(id)) return state
          return {
            openAnnotationPanelIds: [...state.openAnnotationPanelIds, id],
            annotationsVisible: true,
          }
        }),
      closeAnnotationPanel: (id) =>
        set((state) => ({
          openAnnotationPanelIds: state.openAnnotationPanelIds.filter((panelId) => panelId !== id),
          hoveredAnnotationId: state.hoveredAnnotationId === id ? null : state.hoveredAnnotationId,
        })),
      toggleAnnotationPanel: (id) =>
        set((state) => ({
          openAnnotationPanelIds: state.openAnnotationPanelIds.includes(id)
            ? state.openAnnotationPanelIds.filter((panelId) => panelId !== id)
            : [...state.openAnnotationPanelIds, id],
          hoveredAnnotationId:
            state.openAnnotationPanelIds.includes(id) && state.hoveredAnnotationId === id
              ? null
              : state.hoveredAnnotationId,
        })),
      clearAnnotationPanels: () => set({ openAnnotationPanelIds: [], hoveredAnnotationId: null }),
      toggleAnnotationsVisible: () =>
        set((state) => ({ annotationsVisible: !state.annotationsVisible })),
      setAnnotationsPanelOpen: (annotationsPanelOpen) => set({ annotationsPanelOpen }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setCameraControlsEnabled: (cameraControlsEnabled) => set({ cameraControlsEnabled }),

      setClipPlane: (partial) =>
        set((state) => ({
          clipPlane: { ...state.clipPlane, ...partial },
          sidebarOpen: partial.enabled ? true : state.sidebarOpen,
        })),
      setColorMapMode: (colorMapMode) => set({ colorMapMode }),
      setPointSize: (pointSize) => set({ pointSize }),

      setLoading: (isLoading, loadingProgress = 0, loadingMessage = '') =>
        set({ isLoading, loadingProgress, loadingMessage }),

      addUploadedScene: (scene) =>
        set((state) => ({
          uploadedScenes: [...state.uploadedScenes, scene],
          activeSceneId: scene.id,
          selectedAnnotationId: null,
          openAnnotationPanelIds: [],
          hoveredAnnotationId: null,
        })),
      removeUploadedScene: (id) =>
        set((state) => {
          const removedAnnotations = state.annotations.filter((a) => a.sceneId === id)
          const removedIds = new Set(removedAnnotations.map((a) => a.id))
          return {
            uploadedScenes: state.uploadedScenes.filter((s) => s.id !== id),
            annotations: state.annotations.filter((a) => a.sceneId !== id),
            selectedAnnotationId:
              state.selectedAnnotationId && removedIds.has(state.selectedAnnotationId)
                ? null
                : state.selectedAnnotationId,
            openAnnotationPanelIds: state.openAnnotationPanelIds.filter((panelId) => !removedIds.has(panelId)),
            hoveredAnnotationId:
              state.hoveredAnnotationId && removedIds.has(state.hoveredAnnotationId)
                ? null
                : state.hoveredAnnotationId,
          }
        }),
      loadDraft: async (sceneId) => {
        set({ draftStatus: 'loading', draftError: null })
        try {
          const draft = normalizeDraft(sceneId, await publishApi.getDraft(sceneId))
          set((state) => ({
            annotations: replaceSceneAnnotations(state.annotations, sceneId, draft.annotations),
            draftStatus: 'idle',
            draftError: null,
            isAuthenticated: true,
            draftRevisionByScene: {
              ...state.draftRevisionByScene,
              [sceneId]: draft.revision,
            },
          }))
          return
        } catch (error) {
          const status = (error as Error & { status?: number }).status
          if (status !== 401) {
            set({
              draftStatus: 'error',
              draftError: error instanceof Error ? error.message : 'Failed to load draft',
            })
            return
          }
        }

        try {
          const release = normalizeDraft(sceneId, await publishApi.getRelease(sceneId))
          set((state) => ({
            annotations: replaceSceneAnnotations(state.annotations, sceneId, release.annotations),
            draftStatus: 'idle',
            draftError: null,
            isAuthenticated: false,
            draftRevisionByScene: {
              ...state.draftRevisionByScene,
              [sceneId]: release.revision,
            },
          }))
        } catch (error) {
          set({
            draftStatus: 'error',
            draftError: error instanceof Error ? error.message : 'Failed to load release',
          })
        }
      },
      saveDraft: async (sceneId) => {
        const state = get()
        const expectedRevision = state.draftRevisionByScene[sceneId] ?? 0
        const draft: SceneDraft = {
          sceneId,
          revision: expectedRevision,
          annotations: sceneAnnotations(state.annotations, sceneId),
          updatedAt: Date.now(),
        }

        set({ draftStatus: 'saving', draftError: null })

        try {
          const result = await publishApi.saveDraft(sceneId, draft, expectedRevision)
          set((nextState) => ({
            draftStatus: 'idle',
            draftError: null,
            isAuthenticated: true,
            draftRevisionByScene: {
              ...nextState.draftRevisionByScene,
              [sceneId]: result.revision,
            },
          }))
          return result.revision
        } catch (error) {
          const status = (error as Error & { status?: number }).status
          if (status === 401) {
            set({
              draftStatus: 'error',
              draftError: 'Authentication required',
              isAuthenticated: false,
            })
          } else if (status === 409) {
            set({
              draftStatus: 'conflict',
              draftError: 'Draft has changed in another window. Reload before saving.',
            })
          } else {
            set({
              draftStatus: 'error',
              draftError: error instanceof Error ? error.message : 'Failed to save draft',
            })
          }
          throw error
        }
      },
      publishDraft: async (sceneId, message) => {
        await get().saveDraft(sceneId)
        const result = await publishApi.publishDraft(sceneId, message)
        set((state) => ({
          isAuthenticated: true,
          publishedVersionByScene: {
            ...state.publishedVersionByScene,
            [sceneId]: result.version,
          },
        }))
        return result.version
      },
      rollbackToVersion: async (sceneId, version) => {
        const result = await publishApi.rollbackRelease(sceneId, version)
        await get().loadDraft(sceneId)
        set((state) => ({
          publishedVersionByScene: {
            ...state.publishedVersionByScene,
            [sceneId]: result.version,
          },
        }))
        return result.version
      },
      login: async (password) => {
        await publishApi.login(password)
        set({ isAuthenticated: true, draftError: null })
      },
      logout: async () => {
        await publishApi.logout()
        set({ isAuthenticated: false })
      },
      importLocalData: async (sceneId) => {
        const raw = localStorage.getItem(PERSIST_KEY)
        if (!raw) return

        const parsed = JSON.parse(raw) as {
          state?: {
            annotations?: Annotation[]
          }
        }

        const sourceAnnotations = parsed.state?.annotations ?? []
        const sceneSource = sourceAnnotations.filter((annotation) => annotation.sceneId === sceneId)
        if (sceneSource.length === 0) return

        const migratedAnnotations: Annotation[] = []
        for (const annotation of sceneSource) {
          const migratedImages: AnnotationImage[] = []
          for (const image of annotation.images as LegacyAnnotationImage[]) {
            if (typeof image.url === 'string' && image.url.length > 0) {
              migratedImages.push({ url: image.url, filename: image.filename })
              continue
            }

            if (!image.id) continue
            const blob = await imageStorage.get(image.id)
            if (!blob) continue
            const uploaded = await vercelBlobImageStorage.upload(blob, {
              annotationId: annotation.id,
              filename: image.filename,
            })
            migratedImages.push(uploaded)
          }

          migratedAnnotations.push({
            ...annotation,
            images: migratedImages,
          })
        }

        set((state) => ({
          annotations: replaceSceneAnnotations(state.annotations, sceneId, migratedAnnotations),
        }))

        await get().saveDraft(sceneId)
        await imageStorage.clearAll()
        localStorage.removeItem(PERSIST_KEY)
      },
    }),
    {
      name: 'polycam-viewer-state',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>
        if (version === 0) {
          // v0 format: { text } — v1 renames text→title, adds description/images/videoUrl/links/createdAt
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

        if (version <= 1 && Array.isArray(state.annotations)) {
          state.annotations = (state.annotations as Record<string, unknown>[]).map((annotation) => {
            const imagesRaw = Array.isArray(annotation.images) ? annotation.images : []
            const images = imagesRaw
              .map((image) => {
                if (!image || typeof image !== 'object') return null
                const candidate = image as Record<string, unknown>
                const filename = typeof candidate.filename === 'string' ? candidate.filename : 'image'
                if (typeof candidate.url === 'string' && candidate.url.length > 0) {
                  return {
                    url: candidate.url,
                    filename,
                  }
                }
                return null
              })
              .filter((image): image is { url: string; filename: string } => image !== null)

            return {
              ...annotation,
              images,
            }
          })
        }

        return persistedState
      },
      partialize: (state) => ({
        colorMapMode: state.colorMapMode,
        pointSize: state.pointSize,
        viewMode: state.viewMode,
        annotationsVisible: state.annotationsVisible,
      }),
    }
  )
)

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__store = useViewerStore

export const useActiveScene = () =>
  useViewerStore((state) => {
    const allScenes = [...state.scenes, ...state.uploadedScenes]
    return allScenes.find((s) => s.id === state.activeSceneId) ?? null
  })
