import { afterEach, describe, expect, it, vi } from 'vitest'
import { IndexedDBImageStorage } from '@/storage/imageStorage'

/**
 * Minimal controllable IndexedDB mock. We only need enough surface for getDB()
 * (open -> onsuccess with a db exposing onclose/onversionchange) and a single
 * read transaction so we can drive a public method through getDB().
 */
interface FakeRequest {
  onupgradeneeded: ((event: { target: { result: FakeDB } }) => void) | null
  onsuccess: (() => void) | null
  onerror: (() => void) | null
  result: FakeDB
  error: unknown
}

interface FakeDB {
  objectStoreNames: { contains: (name: string) => boolean }
  onclose: (() => void) | null
  onversionchange: (() => void) | null
  close: () => void
  createObjectStore: () => { createIndex: () => void }
  transaction: (storeNames: string | string[], mode: string) => FakeTx
}

interface FakeTx {
  objectStore: () => { get: (id: string) => FakeReadReq }
  oncomplete: (() => void) | null
  onerror: (() => void) | null
  error: unknown
}

interface FakeReadReq {
  onsuccess: (() => void) | null
  onerror: (() => void) | null
  result: unknown
}

function createMock(options: { transactionThrowsOnce?: boolean } = {}) {
  let openCount = 0
  let throwArmed = options.transactionThrowsOnce ?? false
  const dbs: FakeDB[] = []

  function makeDB(): FakeDB {
    const db: FakeDB = {
      objectStoreNames: { contains: () => true },
      onclose: null,
      onversionchange: null,
      close: () => {},
      createObjectStore: () => ({ createIndex: () => {} }),
      transaction: () => {
        if (throwArmed) {
          throwArmed = false
          throw new DOMException('connection closing', 'InvalidStateError')
        }
        return {
          objectStore: () => ({
            get: (): FakeReadReq => {
              const req: FakeReadReq = {
                onsuccess: null,
                onerror: null,
                result: undefined,
              }
              queueMicrotask(() => req.onsuccess?.())
              return req
            },
          }),
          oncomplete: null,
          onerror: null,
          error: null,
        }
      },
    }
    dbs.push(db)
    return db
  }

  const indexedDB = {
    open: (): FakeRequest => {
      openCount += 1
      const db = makeDB()
      const request: FakeRequest = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: db,
        error: null,
      }
      queueMicrotask(() => request.onsuccess?.())
      return request
    },
  }

  return {
    indexedDB,
    get openCount() {
      return openCount
    },
    get lastDB() {
      return dbs[dbs.length - 1]
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('IndexedDBImageStorage connection lifecycle', () => {
  it('opens the connection at most once for concurrent first callers (F12)', async () => {
    const mock = createMock()
    vi.stubGlobal('indexedDB', mock.indexedDB)
    const storage = new IndexedDBImageStorage()

    await Promise.all([
      storage.get('a'),
      storage.get('b'),
      storage.get('c'),
    ])

    expect(mock.openCount).toBe(1)
  })

  it('re-opens after the connection is closed (F11)', async () => {
    const mock = createMock()
    vi.stubGlobal('indexedDB', mock.indexedDB)
    const storage = new IndexedDBImageStorage()

    await storage.get('a')
    expect(mock.openCount).toBe(1)
    expect(typeof mock.lastDB.onclose).toBe('function')

    // Simulate the browser closing the underlying connection.
    mock.lastDB.onclose?.()

    await storage.get('b')
    expect(mock.openCount).toBe(2)
  })

  it('recovers from InvalidStateError by re-opening once (F11)', async () => {
    const mock = createMock({ transactionThrowsOnce: true })
    vi.stubGlobal('indexedDB', mock.indexedDB)
    const storage = new IndexedDBImageStorage()

    const result = await storage.get('a')

    expect(result).toBeNull()
    // First open succeeds, its transaction() throws InvalidStateError, so the
    // stale handle is dropped and a second connection is opened to retry.
    expect(mock.openCount).toBe(2)
  })

  it('registers onversionchange that closes and resets the handle (F11)', async () => {
    const mock = createMock()
    vi.stubGlobal('indexedDB', mock.indexedDB)
    const storage = new IndexedDBImageStorage()

    await storage.get('a')
    const closeSpy = vi.spyOn(mock.lastDB, 'close')
    expect(typeof mock.lastDB.onversionchange).toBe('function')

    mock.lastDB.onversionchange?.()
    expect(closeSpy).toHaveBeenCalledTimes(1)

    await storage.get('b')
    expect(mock.openCount).toBe(2)
  })
})
