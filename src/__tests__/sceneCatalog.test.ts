import { beforeEach, describe, expect, it } from 'vitest'
import { resolveActiveSceneFromCatalog, resolveOfficialSceneSyncDiff } from '@/store/sceneCatalog'
import { useViewerStore } from '@/store/viewerStore'

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    publishedScenes: [],
    discoveredScenes: [],
    uploadedScenes: [],
    officialSceneSyncOverridesByScene: {},
  })
}

describe('sceneCatalog', () => {
  beforeEach(() => {
    resetStore()
  })

  it('resolves active official scene with discovered -> published -> bootstrap precedence', () => {
    useViewerStore.setState({
      activeSceneId: 'scan-a',
      discoveredScenes: [
        {
          id: 'scan-a',
          name: 'Scan A Local Discovered',
          glbUrl: '/models/scan-a-local.glb',
          plyUrl: '/models/scan-a-local.ply',
          catalogSource: 'discovered',
        },
      ],
      publishedScenes: [
        {
          id: 'scan-a',
          name: 'Scan A Published',
          glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-a.glb',
          plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-a.ply',
          catalogSource: 'published',
        },
      ],
    })

    const activeScene = resolveActiveSceneFromCatalog(useViewerStore.getState())
    expect(activeScene?.name).toBe('Scan A Local Discovered')
    expect(activeScene?.catalogSource).toBe('discovered')
  })

  it('resolves published official scene when discovered variant is absent', () => {
    useViewerStore.setState({
      activeSceneId: 'scan-a',
      discoveredScenes: [],
      publishedScenes: [
        {
          id: 'scan-a',
          name: 'Scan A Published',
          glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-a.glb',
          plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/scan-a.ply',
          catalogSource: 'published',
        },
      ],
    })

    const activeScene = resolveActiveSceneFromCatalog(useViewerStore.getState())
    expect(activeScene?.name).toBe('Scan A Published')
    expect(activeScene?.catalogSource).toBe('published')
  })

  it('keeps discovered scene selectable even when its URLs are not cloud-valid', () => {
    useViewerStore.setState({
      activeSceneId: 'scan-local',
      discoveredScenes: [
        {
          id: 'scan-local',
          name: 'Scan Local',
          glbUrl: '/models/scan-local.glb',
          plyUrl: '/models/scan-local.ply',
          catalogSource: 'discovered',
        },
      ],
      publishedScenes: [
        {
          id: 'scan-local',
          name: 'Scan Local Published',
          glbUrl: 'https://example.com/scan-local.glb',
          plyUrl: 'https://example.com/scan-local.ply',
          catalogSource: 'published',
        },
      ],
    })

    const activeScene = resolveActiveSceneFromCatalog(useViewerStore.getState())
    expect(activeScene?.name).toBe('Scan Local')
    expect(activeScene?.catalogSource).toBe('discovered')
  })

  it('falls back to bootstrap scene for shipped IDs', () => {
    useViewerStore.setState({
      activeSceneId: 'scan-a',
      discoveredScenes: [],
      publishedScenes: [],
    })

    const activeScene = resolveActiveSceneFromCatalog(useViewerStore.getState())
    expect(activeScene?.id).toBe('scan-a')
    expect(activeScene?.catalogSource).toBe('bootstrap')
  })

  it('resolveOfficialSceneSyncDiff tracks discovered/cloud membership and sync status', () => {
    useViewerStore.setState({
      discoveredScenes: [
        {
          id: 'diff-local-only',
          name: 'Diff Local Only',
          glbUrl: '/models/diff-local-only.glb',
          plyUrl: '/models/diff-local-only.ply',
          catalogSource: 'discovered',
        },
        {
          id: 'diff-shared',
          name: 'Diff Shared Local',
          glbUrl: '/models/diff-shared.glb',
          plyUrl: '/models/diff-shared.ply',
          catalogSource: 'discovered',
        },
      ],
      publishedScenes: [
        {
          id: 'diff-shared',
          name: 'Diff Shared Cloud',
          glbUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/diff-shared.glb',
          plyUrl: 'https://fudojb4sssxlkcld.public.blob.vercel-storage.com/models/diff-shared.ply',
          catalogSource: 'published',
        },
      ],
      officialSceneSyncOverridesByScene: {
        'diff-local-only': 'error',
      },
    })

    const syncDiff = resolveOfficialSceneSyncDiff(useViewerStore.getState())
    expect(syncDiff).toEqual([
      {
        sceneId: 'diff-local-only',
        discovered: true,
        published: false,
        syncStatus: 'error',
      },
      {
        sceneId: 'diff-shared',
        discovered: true,
        published: true,
        syncStatus: 'synced',
      },
    ])
  })
})
