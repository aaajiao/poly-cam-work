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
import { vercelBlobModelStorage } from '@/storage/vercelBlobModelStorage'
import * as publishApi from '@/lib/publishApi'
import * as modelApi from '@/lib/modelApi'

const PERSIST_KEY = 'polycam-viewer-state'

type DraftStatus = 'idle' | 'loading' | 'saving' | 'error' | 'conflict'
type DraftRevisionSource = 'draft' | 'release'

type LegacyAnnotationImage = {
  filename?: string
  url?: string
  id?: string
  localId?: string
}

interface LocalDraftImageFileRecord {
  filename: string
  kind: 'remote' | 'embedded'
  url?: string
  dataUrl?: string
}

interface LocalDraftAnnotationFileRecord {
  id: string
  position: [number, number, number]
  normal?: [number, number, number]
  title: string
  description: string
  images: LocalDraftImageFileRecord[]
  videoUrl: string | null
  links: { url: string; label: string }[]
  createdAt: number
  color?: string
}

interface LocalDraftFileRecord {
  version: 1
  sceneId: string
  exportedAt: number
  annotations: LocalDraftAnnotationFileRecord[]
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

function bumpSceneMutationVersion(
  versions: Record<string, number>,
  sceneId: string
): Record<string, number> {
  return {
    ...versions,
    [sceneId]: (versions[sceneId] ?? 0) + 1,
  }
}

function isLocalImage(image: AnnotationImage): image is Extract<AnnotationImage, { localId: string }> {
  return 'localId' in image && typeof image.localId === 'string' && image.localId.length > 0
}

function isRemoteImage(image: AnnotationImage): image is Extract<AnnotationImage, { url: string }> {
  return 'url' in image && typeof image.url === 'string' && image.url.length > 0
}

function collectLocalImageIds(images: AnnotationImage[]): string[] {
  return images.filter(isLocalImage).map((image) => image.localId)
}

function hasPendingLocalImages(annotations: Annotation[]): boolean {
  return annotations.some((annotation) => annotation.images.some((image) => isLocalImage(image)))
}

function toRemoteImages(images: AnnotationImage[]): AnnotationImage[] {
  return images
    .filter(isRemoteImage)
    .map((image) => ({
      filename: image.filename,
      url: image.url,
    }))
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Unsupported file content'))
    }
    reader.readAsText(file)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to serialize image'))
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Unsupported image format'))
    }
    reader.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error('Invalid embedded image data')
  }
  return response.blob()
}

function asVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return fallback
  const [x, y, z] = value
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return fallback
  return [x, y, z]
}

function sanitizeLinks(value: unknown): { url: string; label: string }[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const candidate = entry as Record<string, unknown>
      const url = typeof candidate.url === 'string' ? candidate.url : ''
      const label = typeof candidate.label === 'string' ? candidate.label : ''
      return { url, label }
    })
    .filter((entry): entry is { url: string; label: string } => entry !== null)
}

interface ViewerState {
  scenes: ScanScene[]
  cloudScenes: ScanScene[]
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
  draftRevisionSourceByScene: Record<string, DraftRevisionSource>
  draftDirtyByScene: Record<string, boolean>
  publishedVersionByScene: Record<string, number>
  publishedVersionsByScene: Record<string, number[]>
  sceneMutationVersion: Record<string, number>
  loadRequestVersionByScene: Record<string, number>

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
  loadCloudScenes: () => Promise<void>
  addCloudScene: (scene: ScanScene) => void
  syncPresetScenesToCloud: () => Promise<ScanScene[]>
  loadDraft: (sceneId: string) => Promise<void>
  loadPublishedVersions: (sceneId: string) => Promise<void>
  saveDraft: (sceneId: string) => Promise<number>
  publishDraft: (sceneId: string, message?: string) => Promise<number>
  rollbackToVersion: (sceneId: string, version: number) => Promise<number>
  deletePublishedVersion: (sceneId: string, version: number) => Promise<void>
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
  refreshAuthSession: () => Promise<void>
  downloadLocalDraft: (sceneId: string) => Promise<void>
  importLocalDraftFile: (sceneId: string, file: File) => Promise<void>
  importLocalData: (sceneId: string) => Promise<void>
}

export const useViewerStore = create<ViewerState>()(
  persist(
    (set, get) => ({
      scenes: PRESET_SCENES,
      cloudScenes: [],
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
      draftRevisionSourceByScene: {},
      draftDirtyByScene: {},
      publishedVersionByScene: {},
      publishedVersionsByScene: {},
      sceneMutationVersion: {},
      loadRequestVersionByScene: {},

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
        set((state) => ({
          annotations: [...state.annotations, a],
          annotationsVisible: true,
          draftDirtyByScene: {
            ...state.draftDirtyByScene,
            [a.sceneId]: true,
          },
          sceneMutationVersion: bumpSceneMutationVersion(state.sceneMutationVersion, a.sceneId),
        })),
      removeAnnotation: (id) => {
        const annotation = get().annotations.find((item) => item.id === id)
        if (annotation) {
          for (const localId of collectLocalImageIds(annotation.images)) {
            imageStorage.delete(localId).catch(console.error)
          }
        }

        set((state) => ({
          annotations: state.annotations.filter((a) => a.id !== id),
          selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
          openAnnotationPanelIds: state.openAnnotationPanelIds.filter((panelId) => panelId !== id),
          hoveredAnnotationId: state.hoveredAnnotationId === id ? null : state.hoveredAnnotationId,
          draftDirtyByScene: (() => {
            const annotation = state.annotations.find((item) => item.id === id)
            if (!annotation) return state.draftDirtyByScene
            return {
              ...state.draftDirtyByScene,
              [annotation.sceneId]: true,
            }
          })(),
          sceneMutationVersion: (() => {
            const annotation = state.annotations.find((item) => item.id === id)
            if (!annotation) return state.sceneMutationVersion
            return bumpSceneMutationVersion(state.sceneMutationVersion, annotation.sceneId)
          })(),
        }))
      },
      updateAnnotation: (id, text) =>
        set((state) => ({
          annotations: state.annotations.map((a) =>
            a.id === id ? { ...a, title: text } : a
          ),
          draftDirtyByScene: (() => {
            const annotation = state.annotations.find((item) => item.id === id)
            if (!annotation) return state.draftDirtyByScene
            return {
              ...state.draftDirtyByScene,
              [annotation.sceneId]: true,
            }
          })(),
          sceneMutationVersion: (() => {
            const annotation = state.annotations.find((item) => item.id === id)
            if (!annotation) return state.sceneMutationVersion
            return bumpSceneMutationVersion(state.sceneMutationVersion, annotation.sceneId)
          })(),
        })),
      updateAnnotationContent: (id, content) =>
        set((state) => ({
          annotations: state.annotations.map((a) =>
            a.id === id ? { ...a, ...content } : a
          ),
          draftDirtyByScene: (() => {
            const annotation = state.annotations.find((item) => item.id === id)
            if (!annotation) return state.draftDirtyByScene
            return {
              ...state.draftDirtyByScene,
              [annotation.sceneId]: true,
            }
          })(),
          sceneMutationVersion: (() => {
            const annotation = state.annotations.find((item) => item.id === id)
            if (!annotation) return state.sceneMutationVersion
            return bumpSceneMutationVersion(state.sceneMutationVersion, annotation.sceneId)
          })(),
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
      loadCloudScenes: async () => {
        try {
          const models = await modelApi.getModels()
          set((state) => ({
            cloudScenes: models,
            activeSceneId:
              state.activeSceneId ??
              (models[0]?.id ?? state.scenes[0]?.id ?? null),
          }))
        } catch {
          set((state) => ({ cloudScenes: state.cloudScenes }))
        }
      },
      addCloudScene: (scene) => {
        set((state) => ({
          cloudScenes: [scene, ...state.cloudScenes.filter((item) => item.id !== scene.id)],
          activeSceneId: scene.id,
          selectedAnnotationId: null,
          openAnnotationPanelIds: [],
          hoveredAnnotationId: null,
        }))
      },
      syncPresetScenesToCloud: async () => {
        if (!get().isAuthenticated) {
          throw new Error('Login required to sync preset models.')
        }

        const presetScenes = get().scenes
        const syncedModels: ScanScene[] = []
        for (const scene of presetScenes) {
          const [glbUrl, plyUrl] = await Promise.all([
            vercelBlobModelStorage.uploadFromUrl(scene.glbUrl, {
              sceneKey: scene.id,
              kind: 'glb',
            }),
            vercelBlobModelStorage.uploadFromUrl(scene.plyUrl, {
              sceneKey: scene.id,
              kind: 'ply',
            }),
          ])

          const mergedModel = await modelApi.createModel({
            id: scene.id,
            name: scene.name,
            glbUrl,
            plyUrl,
            mergeById: true,
          })
          syncedModels.push(mergedModel)
        }

        await get().loadCloudScenes()
        return syncedModels
      },
      removeUploadedScene: (id) =>
        set((state) => {
          const removedAnnotations = state.annotations.filter((a) => a.sceneId === id)
          for (const annotation of removedAnnotations) {
            for (const localId of collectLocalImageIds(annotation.images)) {
              imageStorage.delete(localId).catch(console.error)
            }
          }
          const removedIds = new Set(removedAnnotations.map((a) => a.id))
          return {
            uploadedScenes: state.uploadedScenes.filter((s) => s.id !== id),
            annotations: state.annotations.filter((a) => a.sceneId !== id),
            draftDirtyByScene: (() => {
              const next = { ...state.draftDirtyByScene }
              delete next[id]
              return next
            })(),
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
      loadPublishedVersions: async (sceneId) => {
        try {
          const result = await publishApi.getPublishedVersions(sceneId)

          set((state) => {
            const nextPublishedVersionByScene = { ...state.publishedVersionByScene }
            if (typeof result.liveVersion === 'number') {
              nextPublishedVersionByScene[sceneId] = result.liveVersion
            } else {
              delete nextPublishedVersionByScene[sceneId]
            }

            return {
              publishedVersionByScene: nextPublishedVersionByScene,
              publishedVersionsByScene: {
                ...state.publishedVersionsByScene,
                [sceneId]: result.versions,
              },
            }
          })
        } catch {
          set((state) => ({
            publishedVersionsByScene: {
              ...state.publishedVersionsByScene,
              [sceneId]: state.publishedVersionsByScene[sceneId] ?? [],
            },
          }))
        }
      },
      loadDraft: async (sceneId) => {
        const mutationVersionAtStart = get().sceneMutationVersion[sceneId] ?? 0
        const requestVersion = (get().loadRequestVersionByScene[sceneId] ?? 0) + 1

        set((state) => ({
          draftStatus: 'loading',
          draftError: null,
          loadRequestVersionByScene: {
            ...state.loadRequestVersionByScene,
            [sceneId]: requestVersion,
          },
        }))
        try {
          const draft = normalizeDraft(sceneId, await publishApi.getDraft(sceneId))

          if ((get().loadRequestVersionByScene[sceneId] ?? 0) !== requestVersion) {
            return
          }

          if ((get().sceneMutationVersion[sceneId] ?? 0) !== mutationVersionAtStart) {
            set((state) => ({
              draftStatus: 'idle',
              draftError: null,
              isAuthenticated: true,
              draftRevisionByScene: {
                ...state.draftRevisionByScene,
                [sceneId]: draft.revision,
              },
              draftRevisionSourceByScene: {
                ...state.draftRevisionSourceByScene,
                [sceneId]: 'draft',
              },
            }))
            return
          }

          set((state) => ({
            annotations: replaceSceneAnnotations(state.annotations, sceneId, draft.annotations),
            draftStatus: 'idle',
            draftError: null,
            isAuthenticated: true,
            draftRevisionByScene: {
              ...state.draftRevisionByScene,
              [sceneId]: draft.revision,
            },
            draftRevisionSourceByScene: {
              ...state.draftRevisionSourceByScene,
              [sceneId]: 'draft',
            },
            draftDirtyByScene: {
              ...state.draftDirtyByScene,
              [sceneId]: false,
            },
          }))
          return
        } catch (error) {
          if ((get().loadRequestVersionByScene[sceneId] ?? 0) !== requestVersion) {
            return
          }

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

          if ((get().loadRequestVersionByScene[sceneId] ?? 0) !== requestVersion) {
            return
          }

          if ((get().sceneMutationVersion[sceneId] ?? 0) !== mutationVersionAtStart) {
            set((state) => ({
              draftStatus: 'idle',
              draftError: null,
              isAuthenticated: false,
              draftRevisionByScene: {
                ...state.draftRevisionByScene,
                [sceneId]: release.revision,
              },
              draftRevisionSourceByScene: {
                ...state.draftRevisionSourceByScene,
                [sceneId]: 'release',
              },
            }))
            return
          }

          set((state) => ({
            annotations: replaceSceneAnnotations(state.annotations, sceneId, release.annotations),
            draftStatus: 'idle',
            draftError: null,
            isAuthenticated: false,
            draftRevisionByScene: {
              ...state.draftRevisionByScene,
              [sceneId]: release.revision,
            },
            draftRevisionSourceByScene: {
              ...state.draftRevisionSourceByScene,
              [sceneId]: 'release',
            },
            draftDirtyByScene: {
              ...state.draftDirtyByScene,
              [sceneId]: false,
            },
          }))
        } catch (error) {
          if ((get().loadRequestVersionByScene[sceneId] ?? 0) !== requestVersion) {
            return
          }

          set({
            draftStatus: 'error',
            draftError: error instanceof Error ? error.message : 'Failed to load release',
          })
        }
      },
      saveDraft: async (sceneId) => {
        const applySuccess = (revision: number) => {
          set((nextState) => ({
            draftStatus: 'idle',
            draftError: null,
            isAuthenticated: true,
            draftRevisionByScene: {
              ...nextState.draftRevisionByScene,
              [sceneId]: revision,
            },
            draftRevisionSourceByScene: {
              ...nextState.draftRevisionSourceByScene,
              [sceneId]: 'draft',
            },
            draftDirtyByScene: {
              ...nextState.draftDirtyByScene,
              [sceneId]: hasPendingLocalImages(sceneAnnotations(nextState.annotations, sceneId)),
            },
          }))
        }

        const applyFailure = (error: unknown) => {
          const status = (error as Error & { status?: number }).status
          if (status === 401) {
            set({
              draftStatus: 'error',
              draftError: 'Authentication required',
              isAuthenticated: false,
            })
            return
          }

          if (status === 409) {
            set({
              draftStatus: 'conflict',
              draftError: 'Draft changed while saving. Please try Publish again.',
            })
            return
          }

          set({
            draftStatus: 'error',
            draftError: error instanceof Error ? error.message : 'Failed to save draft',
          })
        }

        const buildDraft = (revision: number): SceneDraft => {
          const state = get()
          return {
            sceneId,
            revision,
            annotations: sceneAnnotations(state.annotations, sceneId).map((annotation) => ({
              ...annotation,
              images: toRemoteImages(annotation.images),
            })),
            updatedAt: Date.now(),
          }
        }

        const saveWithRevision = async (revision: number) => {
          const draft = buildDraft(revision)
          return publishApi.saveDraft(sceneId, draft, revision)
        }

        let expectedRevision = get().draftRevisionByScene[sceneId]
        const revisionSource = get().draftRevisionSourceByScene[sceneId]

        if (typeof expectedRevision !== 'number' || revisionSource !== 'draft') {
          try {
            const remoteDraft = await publishApi.getDraft(sceneId)
            expectedRevision = remoteDraft.revision
            set((state) => ({
              draftRevisionByScene: {
                ...state.draftRevisionByScene,
                [sceneId]: remoteDraft.revision,
              },
              draftRevisionSourceByScene: {
                ...state.draftRevisionSourceByScene,
                [sceneId]: 'draft',
              },
            }))
          } catch {
            expectedRevision = 0
          }
        }

        set({ draftStatus: 'saving', draftError: null })

        let revision = expectedRevision ?? 0

        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const result = await saveWithRevision(revision)
            applySuccess(result.revision)
            return result.revision
          } catch (error) {
            const status = (error as Error & { status?: number }).status
            if (status !== 409) {
              applyFailure(error)
              throw error
            }

            try {
              const remoteDraft = await publishApi.getDraft(sceneId)
              revision = remoteDraft.revision
            } catch (refreshError) {
              applyFailure(refreshError)
              throw refreshError
            }
          }
        }

        const conflictError = Object.assign(
          new Error('Draft changed while saving. Please try Publish again.'),
          { status: 409 }
        )
        applyFailure(conflictError)
        throw conflictError
      },
      publishDraft: async (sceneId, message) => {
        const localImagesToUpload = sceneAnnotations(get().annotations, sceneId)
          .flatMap((annotation) =>
            annotation.images
              .filter(isLocalImage)
              .map((image) => ({
                annotationId: annotation.id,
                localId: image.localId,
                filename: image.filename,
              }))
          )

        if (localImagesToUpload.length > 0) {
          const uploadedByLocalId = new Map<string, AnnotationImage>()
          const applyUploadedImages = () => {
            if (uploadedByLocalId.size === 0) return

            set((state) => ({
              annotations: state.annotations.map((annotation) => {
                if (annotation.sceneId !== sceneId) return annotation
                return {
                  ...annotation,
                  images: annotation.images.map((image) => {
                    if (!isLocalImage(image)) return image
                    const uploaded = uploadedByLocalId.get(image.localId)
                    return uploaded ?? image
                  }),
                }
              }),
              draftDirtyByScene: {
                ...state.draftDirtyByScene,
                [sceneId]: true,
              },
              sceneMutationVersion: bumpSceneMutationVersion(state.sceneMutationVersion, sceneId),
            }))

            for (const localId of uploadedByLocalId.keys()) {
              imageStorage.delete(localId).catch(console.error)
            }
          }

          try {
            for (const localImage of localImagesToUpload) {
              const blob = await imageStorage.get(localImage.localId)
              if (!blob) {
                throw new Error(`Local image missing: ${localImage.filename}. Please re-add the image.`)
              }

              const uploaded = await vercelBlobImageStorage.upload(blob, {
                annotationId: localImage.annotationId,
                filename: localImage.filename,
              })

              uploadedByLocalId.set(localImage.localId, uploaded)
            }
          } catch (error) {
            applyUploadedImages()
            set({
              draftStatus: 'error',
              draftError: error instanceof Error ? error.message : 'Failed to upload local images',
            })
            throw error
          }

          applyUploadedImages()
        }

        await get().saveDraft(sceneId)
        const result = await publishApi.publishDraft(sceneId, message)
        set((state) => ({
          isAuthenticated: true,
          publishedVersionByScene: {
            ...state.publishedVersionByScene,
            [sceneId]: result.version,
          },
          publishedVersionsByScene: {
            ...state.publishedVersionsByScene,
            [sceneId]: Array.from(
              new Set([result.version, ...(state.publishedVersionsByScene[sceneId] ?? [])])
            ).sort((a, b) => b - a),
          },
          draftDirtyByScene: {
            ...state.draftDirtyByScene,
            [sceneId]: false,
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
          publishedVersionsByScene: {
            ...state.publishedVersionsByScene,
            [sceneId]: Array.from(
              new Set([result.version, ...(state.publishedVersionsByScene[sceneId] ?? [])])
            ).sort((a, b) => b - a),
          },
          draftDirtyByScene: {
            ...state.draftDirtyByScene,
            [sceneId]: false,
          },
        }))
        return result.version
      },
      deletePublishedVersion: async (sceneId, version) => {
        const result = await publishApi.deletePublishedVersion(sceneId, version)

        set((state) => {
          const nextPublishedVersionByScene = { ...state.publishedVersionByScene }
          if (typeof result.liveVersion === 'number') {
            nextPublishedVersionByScene[sceneId] = result.liveVersion
          } else {
            delete nextPublishedVersionByScene[sceneId]
          }

          return {
            publishedVersionByScene: nextPublishedVersionByScene,
            publishedVersionsByScene: {
              ...state.publishedVersionsByScene,
              [sceneId]: result.versions,
            },
          }
        })
      },
      login: async (password) => {
        await publishApi.login(password)
        set({ isAuthenticated: true, draftError: null })
      },
      logout: async () => {
        await publishApi.logout()
        set({ isAuthenticated: false })
      },
      refreshAuthSession: async () => {
        try {
          const session = await publishApi.getSession()
          set({ isAuthenticated: session.authenticated })
        } catch {
          set({ isAuthenticated: false })
        }
      },
      downloadLocalDraft: async (sceneId) => {
        const sceneDraftAnnotations = sceneAnnotations(get().annotations, sceneId)
        const exportAnnotations: LocalDraftAnnotationFileRecord[] = []

        for (const annotation of sceneDraftAnnotations) {
          const exportImages: LocalDraftImageFileRecord[] = []

          for (const image of annotation.images) {
            if (isRemoteImage(image)) {
              exportImages.push({
                filename: image.filename,
                kind: 'remote',
                url: image.url,
              })
              continue
            }

            if (!isLocalImage(image)) continue
            const blob = await imageStorage.get(image.localId)
            if (!blob) {
              throw new Error(`Local image missing: ${image.filename}. Please re-add it before export.`)
            }

            exportImages.push({
              filename: image.filename,
              kind: 'embedded',
              dataUrl: await blobToDataUrl(blob),
            })
          }

          exportAnnotations.push({
            id: annotation.id,
            position: annotation.position,
            normal: annotation.normal,
            title: annotation.title,
            description: annotation.description,
            images: exportImages,
            videoUrl: annotation.videoUrl,
            links: annotation.links,
            createdAt: annotation.createdAt,
            color: annotation.color,
          })
        }

        const payload: LocalDraftFileRecord = {
          version: 1,
          sceneId,
          exportedAt: Date.now(),
          annotations: exportAnnotations,
        }

        const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], {
          type: 'application/json',
        })

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `${sceneId}-draft-${timestamp}.json`
        const url = URL.createObjectURL(jsonBlob)

        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
      },
      importLocalDraftFile: async (sceneId, file) => {
        const fileText = await readFileAsText(file)
        const parsed = JSON.parse(fileText) as Partial<LocalDraftFileRecord>
        if (parsed.version !== 1 || !Array.isArray(parsed.annotations)) {
          throw new Error('Invalid draft file format')
        }

        const currentSceneAnnotations = sceneAnnotations(get().annotations, sceneId)
        for (const annotation of currentSceneAnnotations) {
          for (const localId of collectLocalImageIds(annotation.images)) {
            imageStorage.delete(localId).catch(console.error)
          }
        }

        const importedAnnotations: Annotation[] = []

        for (const sourceAnnotation of parsed.annotations) {
          if (!sourceAnnotation || typeof sourceAnnotation !== 'object') continue

          const images: AnnotationImage[] = []
          for (const sourceImage of Array.isArray(sourceAnnotation.images)
            ? sourceAnnotation.images
            : []) {
            if (!sourceImage || typeof sourceImage !== 'object') continue

            const filename =
              typeof sourceImage.filename === 'string' && sourceImage.filename.length > 0
                ? sourceImage.filename
                : 'image'

            if (sourceImage.kind === 'remote' && typeof sourceImage.url === 'string') {
              images.push({
                filename,
                url: sourceImage.url,
              })
              continue
            }

            if (sourceImage.kind === 'embedded' && typeof sourceImage.dataUrl === 'string') {
              const blob = await dataUrlToBlob(sourceImage.dataUrl)
              const localId = `img-${Date.now()}-${Math.random().toString(36).slice(2)}`
              await imageStorage.save(localId, blob, {
                annotationId:
                  typeof sourceAnnotation.id === 'string' ? sourceAnnotation.id : `ann-${Date.now()}`,
                filename,
              })
              images.push({
                filename,
                localId,
              })
            }
          }

          importedAnnotations.push({
            id:
              typeof sourceAnnotation.id === 'string' && sourceAnnotation.id.length > 0
                ? sourceAnnotation.id
                : `ann-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            position: asVec3(sourceAnnotation.position, [0, 0, 0]),
            normal: sourceAnnotation.normal ? asVec3(sourceAnnotation.normal, [0, 0, 1]) : undefined,
            title: typeof sourceAnnotation.title === 'string' ? sourceAnnotation.title : '',
            description:
              typeof sourceAnnotation.description === 'string' ? sourceAnnotation.description : '',
            images,
            videoUrl:
              typeof sourceAnnotation.videoUrl === 'string' ? sourceAnnotation.videoUrl : null,
            links: sanitizeLinks(sourceAnnotation.links),
            color: typeof sourceAnnotation.color === 'string' ? sourceAnnotation.color : undefined,
            sceneId,
            createdAt:
              typeof sourceAnnotation.createdAt === 'number'
                ? sourceAnnotation.createdAt
                : Date.now(),
          })
        }

        set((state) => ({
          annotations: replaceSceneAnnotations(state.annotations, sceneId, importedAnnotations),
          selectedAnnotationId: null,
          openAnnotationPanelIds: [],
          hoveredAnnotationId: null,
          draftDirtyByScene: {
            ...state.draftDirtyByScene,
            [sceneId]: true,
          },
          sceneMutationVersion: bumpSceneMutationVersion(state.sceneMutationVersion, sceneId),
        }))
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
        const migratedLocalIds: string[] = []
        for (const annotation of sceneSource) {
          const migratedImages: AnnotationImage[] = []
          for (const image of annotation.images as LegacyAnnotationImage[]) {
            const filename = typeof image.filename === 'string' && image.filename.length > 0
              ? image.filename
              : 'image'

            if (typeof image.url === 'string' && image.url.length > 0) {
              migratedImages.push({ url: image.url, filename })
              continue
            }

            const localId =
              typeof image.localId === 'string'
                ? image.localId
                : typeof image.id === 'string'
                  ? image.id
                  : null

            if (!localId) continue
            const blob = await imageStorage.get(localId)
            if (!blob) continue
            const uploaded = await vercelBlobImageStorage.upload(blob, {
              annotationId: annotation.id,
              filename,
            })
            migratedImages.push(uploaded)
            migratedLocalIds.push(localId)
          }

          migratedAnnotations.push({
            ...annotation,
            images: migratedImages,
          })
        }

        set((state) => ({
          annotations: replaceSceneAnnotations(state.annotations, sceneId, migratedAnnotations),
          draftDirtyByScene: {
            ...state.draftDirtyByScene,
            [sceneId]: true,
          },
          sceneMutationVersion: bumpSceneMutationVersion(state.sceneMutationVersion, sceneId),
        }))

        await get().saveDraft(sceneId)

        for (const localId of migratedLocalIds) {
          imageStorage.delete(localId).catch(console.error)
        }
      },
    }),
    {
      name: 'polycam-viewer-state',
      version: 7,
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

        if (version <= 4 && Array.isArray(state.annotations)) {
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

                const localId =
                  typeof candidate.localId === 'string'
                    ? candidate.localId
                    : typeof candidate.id === 'string'
                      ? candidate.id
                      : null

                if (localId) {
                  return {
                    localId,
                    filename,
                  }
                }

                return null
              })
              .filter((image): image is AnnotationImage => image !== null)

            return {
              ...annotation,
              images,
            }
          })
        }

        if (typeof state.sceneMutationVersion !== 'object' || state.sceneMutationVersion === null) {
          state.sceneMutationVersion = {}
        }

        if (
          typeof state.draftRevisionSourceByScene !== 'object' ||
          state.draftRevisionSourceByScene === null
        ) {
          state.draftRevisionSourceByScene = {}
        }

        if (typeof state.draftDirtyByScene !== 'object' || state.draftDirtyByScene === null) {
          state.draftDirtyByScene = {}
        }

        return persistedState
      },
      partialize: (state) => ({
        annotations: state.annotations,
        draftRevisionByScene: state.draftRevisionByScene,
        draftRevisionSourceByScene: state.draftRevisionSourceByScene,
        draftDirtyByScene: state.draftDirtyByScene,
        sceneMutationVersion: state.sceneMutationVersion,
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
    const allScenes = [...state.cloudScenes, ...state.scenes, ...state.uploadedScenes]
    return allScenes.find((s) => s.id === state.activeSceneId) ?? null
  })
