const MODEL_CACHE_NAME = 'polycam-model-assets-v1'

async function openModelCache() {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return null
  }

  try {
    return await caches.open(MODEL_CACHE_NAME)
  } catch (error) {
    void error
    return null
  }
}

async function getOrFetchResponse(url: string, signal?: AbortSignal): Promise<Response> {
  const cache = await openModelCache()
  if (cache) {
    try {
      const cached = await cache.match(url)
      if (cached) {
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
