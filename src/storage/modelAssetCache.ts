const MODEL_CACHE_PREFIX = 'polycam-model-assets-'
const MODEL_CACHE_VERSION = 'v1'
const MODEL_CACHE_NAME = `${MODEL_CACHE_PREFIX}${MODEL_CACHE_VERSION}`

let legacyCleanupDone = false

// Preset scenes use stable paths (/models/*.ply), so a cache keyed only by URL
// with no revalidation pins the very first bytes forever — replacing a PLY in
// place never propagates. We keep a stale-while-revalidate policy instead.

async function deleteLegacyModelCaches(): Promise<void> {
  if (legacyCleanupDone) return
  legacyCleanupDone = true
  if (typeof window === 'undefined' || !('caches' in window)) return

  try {
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter((key) => key.startsWith(MODEL_CACHE_PREFIX) && key !== MODEL_CACHE_NAME)
        .map((key) => caches.delete(key)),
    )
  } catch (error) {
    void error
  }
}

async function openModelCache() {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return null
  }

  try {
    await deleteLegacyModelCaches()
    return await caches.open(MODEL_CACHE_NAME)
  } catch (error) {
    void error
    return null
  }
}

// Cheap content fingerprint from validators the CDN sends. When it changes the
// asset was replaced and the cache entry must be refreshed.
function responseIdentity(response: Response): string {
  const etag = response.headers.get('ETag') ?? ''
  const lastModified = response.headers.get('Last-Modified') ?? ''
  const length = response.headers.get('Content-Length') ?? ''
  return `${etag}|${lastModified}|${length}`
}

async function revalidateModelAsset(cache: Cache, url: string, cached: Response): Promise<void> {
  try {
    // cache: 'no-cache' forces a conditional request so ETag/304 works; the
    // browser transparently returns the HTTP-cached bytes as a 200 on 304.
    const fresh = await fetch(url, {
      cache: 'no-cache',
      credentials: 'omit',
    })

    if (!fresh.ok) return
    if (responseIdentity(fresh) === responseIdentity(cached)) return

    await cache.put(url, fresh)
  } catch (error) {
    // Offline or transient failure — keep the stale entry, try again next load.
    void error
  }
}

async function getOrFetchResponse(url: string, signal?: AbortSignal): Promise<Response> {
  const cache = await openModelCache()
  if (cache) {
    try {
      const cached = await cache.match(url)
      if (cached) {
        // Stale-while-revalidate: serve the cached bytes immediately, then
        // refresh in the background (not tied to the caller's signal) so the
        // NEXT load reflects a replaced asset.
        void revalidateModelAsset(cache, url, cached.clone())
        return cached
      }
    } catch (error) {
      void error
    }
  }

  const response = await fetch(url, {
    signal,
    credentials: 'omit',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }

  if (cache) {
    try {
      await cache.put(url, response.clone())
    } catch (error) {
      void error
    }
  }

  return response
}

export async function fetchModelArrayBuffer(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await getOrFetchResponse(url, signal)
  return response.arrayBuffer()
}
