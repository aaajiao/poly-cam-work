import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveOfficialSceneSyncDiff, useViewerStore } from '@/store/viewerStore'
import * as publishApi from '@/lib/publishApi'
import * as modelApi from '@/lib/modelApi'
import { vercelBlobModelStorage } from '@/storage/vercelBlobModelStorage'

function resetStore() {
  localStorage.removeItem('polycam-viewer-state')
  useViewerStore.setState({
    activeSceneId: 'scan-a',
    publishedScenes: [],
    discoveredScenes: [],
    uploadedScenes: [],
    officialSceneSyncOverridesByScene: {},
    isAuthenticated: false,
  })
}

describe('viewerStore scene sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  describe('syncDiscoveredScene', () => {
    it('uploads GLB+PLY and registers scene on success', async () => {
      useViewerStore.setState({ isAuthenticated: true })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'sync-ok',
        name: 'Sync OK',
        glbUrl: '/models/sync-ok.glb',
        plyUrl: '/models/sync-ok.ply',
      })

      const uploadSpy = vi
        .spyOn(vercelBlobModelStorage, 'uploadFromUrl')
        .mockResolvedValueOnce('https://blob.test/sync-ok.glb')
        .mockResolvedValueOnce('https://blob.test/sync-ok.ply')

      const registerSpy = vi.spyOn(modelApi, 'registerOfficialScene').mockResolvedValue({
        id: 'sync-ok',
        name: 'Sync OK',
        glbUrl: 'https://blob.test/sync-ok.glb',
        plyUrl: 'https://blob.test/sync-ok.ply',
      })

      const { syncDiscoveredScene } = useViewerStore.getState()
      await syncDiscoveredScene('sync-ok')

      expect(uploadSpy).toHaveBeenCalledTimes(2)
      expect(uploadSpy).toHaveBeenCalledWith('/models/sync-ok.glb', { sceneKey: 'sync-ok', kind: 'glb' })
      expect(uploadSpy).toHaveBeenCalledWith('/models/sync-ok.ply', { sceneKey: 'sync-ok', kind: 'ply' })
      expect(registerSpy).toHaveBeenCalledWith({
        id: 'sync-ok',
        name: 'Sync OK',
        glbUrl: 'https://blob.test/sync-ok.glb',
        plyUrl: 'https://blob.test/sync-ok.ply',
      })

      const state = useViewerStore.getState()
      expect(state.publishedScenes.some((s) => s.id === 'sync-ok')).toBe(true)
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('synced')
      expect(state.officialSceneSyncOverridesByScene['sync-ok']).toBeUndefined()
    })

    it('sets error status when upload fails and does not call register', async () => {
      useViewerStore.setState({ isAuthenticated: true })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'upload-fail',
        name: 'Upload Fail',
        glbUrl: '/models/upload-fail.glb',
        plyUrl: '/models/upload-fail.ply',
      })

      vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')
        .mockRejectedValueOnce(new Error('GLB upload failed'))
        .mockResolvedValueOnce('https://blob.test/upload-fail.ply')

      const registerSpy = vi.spyOn(modelApi, 'registerOfficialScene')

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('upload-fail')).rejects.toThrow('GLB upload failed')

      const state = useViewerStore.getState()
      expect(state.discoveredScenes[0].id).toBe('upload-fail')
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('error')
      expect(registerSpy).not.toHaveBeenCalled()
      expect(state.publishedScenes.some((s) => s.id === 'upload-fail')).toBe(false)
    })

    it('sets error status when PLY upload fails after GLB succeeds', async () => {
      useViewerStore.setState({ isAuthenticated: true })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'ply-fail',
        name: 'PLY Fail',
        glbUrl: '/models/ply-fail.glb',
        plyUrl: '/models/ply-fail.ply',
      })

      vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')
        .mockResolvedValueOnce('https://blob.test/ply-fail.glb')
        .mockRejectedValueOnce(new Error('PLY upload failed'))

      const registerSpy = vi.spyOn(modelApi, 'registerOfficialScene')

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('ply-fail')).rejects.toThrow('PLY upload failed')

      const state = useViewerStore.getState()
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('error')
      expect(registerSpy).not.toHaveBeenCalled()
      expect(state.publishedScenes.some((s) => s.id === 'ply-fail')).toBe(false)
    })

    it('sets error status when registration fails after successful uploads', async () => {
      useViewerStore.setState({ isAuthenticated: true })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'reg-fail',
        name: 'Reg Fail',
        glbUrl: '/models/reg-fail.glb',
        plyUrl: '/models/reg-fail.ply',
      })

      vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')
        .mockResolvedValueOnce('https://blob.test/reg-fail.glb')
        .mockResolvedValueOnce('https://blob.test/reg-fail.ply')

      vi.spyOn(modelApi, 'registerOfficialScene').mockRejectedValue(new Error('Server error'))

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('reg-fail')).rejects.toThrow('Server error')

      const state = useViewerStore.getState()
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('error')
      expect(state.publishedScenes.some((s) => s.id === 'reg-fail')).toBe(false)
    })

    it('keeps unrelated published scenes untouched when discovered sync registration fails', async () => {
      useViewerStore.setState({
        isAuthenticated: true,
        publishedScenes: [
          {
            id: 'official-existing',
            name: 'Official Existing',
            glbUrl: 'https://blob.test/official-existing.glb',
            plyUrl: 'https://blob.test/official-existing.ply',
            catalogSource: 'published',
          },
        ],
      })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'new-sync-fail',
        name: 'New Sync Fail',
        glbUrl: '/models/new-sync-fail.glb',
        plyUrl: '/models/new-sync-fail.ply',
      })

      vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')
        .mockResolvedValueOnce('https://blob.test/new-sync-fail.glb')
        .mockResolvedValueOnce('https://blob.test/new-sync-fail.ply')

      vi.spyOn(modelApi, 'registerOfficialScene').mockRejectedValue(new Error('registry unavailable'))

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('new-sync-fail')).rejects.toThrow('registry unavailable')

      const state = useViewerStore.getState()
      expect(state.publishedScenes.map((scene) => scene.id)).toEqual(['official-existing'])
      expect(state.discoveredScenes.find((scene) => scene.id === 'new-sync-fail')).toBeTruthy()
      expect(state.discoveredScenes.find((scene) => scene.id === 'new-sync-fail')?.officialStatus?.syncStatus).toBe('error')
    })

    it('auth expiration during registration fails safely and keeps discovered scene recoverable', async () => {
      useViewerStore.setState({ isAuthenticated: true })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'auth-expire-scene',
        name: 'Auth Expire Scene',
        glbUrl: '/models/auth-expire.glb',
        plyUrl: '/models/auth-expire.ply',
      })

      vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')
        .mockResolvedValueOnce('https://blob.test/auth-expire.glb')
        .mockResolvedValueOnce('https://blob.test/auth-expire.ply')

      vi.spyOn(modelApi, 'registerOfficialScene').mockRejectedValue(
        Object.assign(new Error('Authentication required'), { status: 401 })
      )

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('auth-expire-scene')).rejects.toThrow('Authentication required')

      const state = useViewerStore.getState()
      expect(state.discoveredScenes.find((scene) => scene.id === 'auth-expire-scene')).toBeTruthy()
      expect(state.discoveredScenes.find((scene) => scene.id === 'auth-expire-scene')?.officialStatus?.syncStatus).toBe('error')
      expect(state.officialSceneSyncOverridesByScene['auth-expire-scene']).toBe('error')
      expect(state.publishedScenes.some((scene) => scene.id === 'auth-expire-scene')).toBe(false)
    })

    it('sets error status on 409 collision from registerOfficialScene', async () => {
      useViewerStore.setState({ isAuthenticated: true })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'conflict-scene',
        name: 'Conflict Scene',
        glbUrl: '/models/conflict-scene.glb',
        plyUrl: '/models/conflict-scene.ply',
      })

      vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')
        .mockResolvedValueOnce('https://blob.test/conflict-scene.glb')
        .mockResolvedValueOnce('https://blob.test/conflict-scene.ply')

      vi.spyOn(modelApi, 'registerOfficialScene').mockRejectedValue(
        new modelApi.SceneConflictError('conflict-scene')
      )

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('conflict-scene')).rejects.toThrow(modelApi.SceneConflictError)

      const state = useViewerStore.getState()
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('error')
      expect(state.publishedScenes.some((s) => s.id === 'conflict-scene')).toBe(false)
    })

    it('requires authentication before starting sync', async () => {
      useViewerStore.setState({ isAuthenticated: false })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: false })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'auth-test',
        name: 'Auth Test',
        glbUrl: '/models/auth-test.glb',
        plyUrl: '/models/auth-test.ply',
      })

      const uploadSpy = vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('auth-test')).rejects.toThrow('Login required')

      expect(useViewerStore.getState().discoveredScenes[0].officialStatus?.syncStatus).toBe('unsynced')
      expect(uploadSpy).not.toHaveBeenCalled()
    })

    it('throws when discovered scene does not exist', async () => {
      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('nonexistent')).rejects.toThrow('Discovered scene not found')
    })

    it('supports retry after error transitions back to synced', async () => {
      useViewerStore.setState({ isAuthenticated: true })
      vi.spyOn(publishApi, 'getSession').mockResolvedValue({ authenticated: true })

      const { addDiscoveredScene } = useViewerStore.getState()
      addDiscoveredScene({
        id: 'retry-scene',
        name: 'Retry Scene',
        glbUrl: '/models/retry-scene.glb',
        plyUrl: '/models/retry-scene.ply',
      })

      const uploadSpy = vi.spyOn(vercelBlobModelStorage, 'uploadFromUrl')
      uploadSpy.mockRejectedValue(new Error('Network error'))

      const { syncDiscoveredScene } = useViewerStore.getState()
      await expect(syncDiscoveredScene('retry-scene')).rejects.toThrow('Network error')
      expect(useViewerStore.getState().discoveredScenes[0].officialStatus?.syncStatus).toBe('error')
      expect(useViewerStore.getState().officialSceneSyncOverridesByScene['retry-scene']).toBe('error')

      vi.spyOn(modelApi, 'discoverLocalScenes').mockResolvedValueOnce({
        scenes: [
          {
            id: 'retry-scene',
            name: 'Retry Scene',
            glbUrl: '/models/retry-scene.glb',
            plyUrl: '/models/retry-scene.ply',
          },
        ],
        errors: [],
      })

      const { loadDiscoveredScenes } = useViewerStore.getState()
      await loadDiscoveredScenes()

      const refreshedErrorState = useViewerStore.getState()
      expect(refreshedErrorState.discoveredScenes[0].officialStatus?.syncStatus).toBe('error')

      uploadSpy.mockReset()
      uploadSpy
        .mockResolvedValueOnce('https://blob.test/retry-scene.glb')
        .mockResolvedValueOnce('https://blob.test/retry-scene.ply')

      vi.spyOn(modelApi, 'registerOfficialScene').mockResolvedValue({
        id: 'retry-scene',
        name: 'Retry Scene',
        glbUrl: 'https://blob.test/retry-scene.glb',
        plyUrl: 'https://blob.test/retry-scene.ply',
        catalogSource: 'published',
      })

      await syncDiscoveredScene('retry-scene')

      const state = useViewerStore.getState()
      expect(state.discoveredScenes[0].officialStatus?.syncStatus).toBe('synced')
      expect(state.publishedScenes.some((s) => s.id === 'retry-scene')).toBe(true)
      expect(state.officialSceneSyncOverridesByScene['retry-scene']).toBeUndefined()
      expect(resolveOfficialSceneSyncDiff(state)).toContainEqual({
        sceneId: 'retry-scene',
        discovered: true,
        published: true,
        syncStatus: 'synced',
      })
    })
  })
})
