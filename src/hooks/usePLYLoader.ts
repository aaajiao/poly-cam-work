import { useState, useEffect, useRef, useCallback } from 'react'
import type { PLYParseResult } from '@/types'

interface PLYLoaderState {
  data: PLYParseResult | null
  loading: boolean
  progress: number
  error: string | null
}

export function usePLYLoader(url: string | null) {
  const [state, setState] = useState<PLYLoaderState>({
    data: null,
    loading: false,
    progress: 0,
    error: null,
  })
  const workerRef = useRef<Worker | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async (plyUrl: string) => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
    }

    setState({ data: null, loading: true, progress: 0, error: null })

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const response = await fetch(plyUrl, { signal: abort.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${plyUrl}`)
      const buffer = await response.arrayBuffer()

      if (abort.signal.aborted) return

      const worker = new Worker(
        new URL('../workers/ply-parser.worker.ts', import.meta.url),
        { type: 'module' }
      )
      workerRef.current = worker

      worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as { type: string; percent?: number; result?: PLYParseResult; message?: string }
        if (msg.type === 'progress') {
          setState((prev) => ({ ...prev, progress: msg.percent ?? prev.progress }))
        } else if (msg.type === 'done') {
          setState({ data: msg.result ?? null, loading: false, progress: 100, error: null })
          worker.terminate()
          workerRef.current = null
        } else if (msg.type === 'error') {
          setState({ data: null, loading: false, progress: 0, error: msg.message ?? 'Unknown error' })
          worker.terminate()
          workerRef.current = null
        }
      }

      worker.onerror = (e) => {
        setState({ data: null, loading: false, progress: 0, error: e.message })
        worker.terminate()
        workerRef.current = null
      }

      worker.postMessage({ buffer }, [buffer])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setState({ data: null, loading: false, progress: 0, error: String(err) })
    }
  }, [])

  useEffect(() => {
    if (url) {
      load(url)
    }
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [url, load])

  return state
}
