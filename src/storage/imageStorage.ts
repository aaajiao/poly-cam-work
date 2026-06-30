import type { ImageStorageItem } from '@/types'

const DB_NAME = 'polycam-images'
const DB_VERSION = 1
const STORE_NAME = 'images'
const THUMB_STORE_NAME = 'thumbnails'
const THUMB_MAX_DIMENSION = 200

/**
 * Abstract interface for image storage.
 * Current implementation: IndexedDB (local browser storage).
 * Future: S3/Cloudflare R2 by swapping this implementation.
 */
export interface ImageStorage {
  save(
    id: string,
    blob: Blob,
    metadata: { annotationId: string; filename: string }
  ): Promise<void>
  get(id: string): Promise<Blob | null>
  getThumbnail(id: string): Promise<Blob | null>
  delete(id: string): Promise<void>
  deleteByAnnotation(annotationId: string): Promise<void>
  list(annotationId: string): Promise<ImageStorageItem[]>
  clearAll(): Promise<void>
}

/**
 * IndexedDB-backed image storage.
 * Stores image blobs and auto-generated thumbnails.
 * Images are associated with annotations via annotationId.
 */
export class IndexedDBImageStorage implements ImageStorage {
  private db: IDBDatabase | null = null
  // Memoize the in-flight open promise so concurrent first callers share a
  // single indexedDB.open() instead of leaking parallel connections (F12).
  private dbPromise: Promise<IDBDatabase> | null = null

  private getDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db)
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('annotationId', 'annotationId', { unique: false })
        }
        if (!db.objectStoreNames.contains(THUMB_STORE_NAME)) {
          db.createObjectStore(THUMB_STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        const db = request.result
        // Invalidate the cache when the connection drops or a newer version is
        // requested elsewhere, so the next call re-opens instead of reusing a
        // dead handle that throws InvalidStateError forever (F11).
        db.onclose = () => {
          this.db = null
          this.dbPromise = null
        }
        db.onversionchange = () => {
          db.close()
          this.db = null
          this.dbPromise = null
        }
        this.db = db
        resolve(db)
      }
      request.onerror = () => {
        this.dbPromise = null
        reject(request.error)
      }
    })
    return this.dbPromise
  }

  /**
   * Create a transaction, transparently recovering from a closed connection.
   * If the cached handle was closed without firing onclose (e.g. tab BFCache
   * or backgrounding), db.transaction() throws InvalidStateError; we drop the
   * stale handle and re-open exactly once before retrying (F11).
   */
  private async transaction(
    storeNames: string | string[],
    mode: IDBTransactionMode
  ): Promise<IDBTransaction> {
    const db = await this.getDB()
    try {
      return db.transaction(storeNames, mode)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'InvalidStateError') {
        this.db = null
        this.dbPromise = null
        const reopened = await this.getDB()
        return reopened.transaction(storeNames, mode)
      }
      throw e
    }
  }

  private async generateThumbnail(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        const scale = Math.min(
          THUMB_MAX_DIMENSION / img.width,
          THUMB_MAX_DIMENSION / img.height,
          1
        )
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(
          (thumbBlob) => {
            if (thumbBlob) resolve(thumbBlob)
            else reject(new Error('Thumbnail generation failed'))
          },
          'image/jpeg',
          0.8
        )
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Image load failed'))
      }
      img.src = url
    })
  }

  async save(
    id: string,
    blob: Blob,
    metadata: { annotationId: string; filename: string }
  ): Promise<void> {
    const thumbnailId = `thumb-${id}`
    const thumbnail = await this.generateThumbnail(blob)
    const tx = await this.transaction([STORE_NAME, THUMB_STORE_NAME], 'readwrite')

    await new Promise<void>((resolve, reject) => {
      const item: ImageStorageItem = {
        id,
        blob,
        annotationId: metadata.annotationId,
        filename: metadata.filename,
        createdAt: Date.now(),
      }
      tx.objectStore(STORE_NAME).put(item)
      tx.objectStore(THUMB_STORE_NAME).put({ id: thumbnailId, blob: thumbnail })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async get(id: string): Promise<Blob | null> {
    const tx = await this.transaction(STORE_NAME, 'readonly')
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get(id)
      req.onsuccess = () => resolve((req.result as ImageStorageItem | undefined)?.blob ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async getThumbnail(id: string): Promise<Blob | null> {
    const thumbnailId = `thumb-${id}`
    const tx = await this.transaction(THUMB_STORE_NAME, 'readonly')
    return new Promise((resolve, reject) => {
      const req = tx.objectStore(THUMB_STORE_NAME).get(thumbnailId)
      req.onsuccess = () => resolve((req.result as { id: string; blob: Blob } | undefined)?.blob ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async delete(id: string): Promise<void> {
    const thumbnailId = `thumb-${id}`
    const tx = await this.transaction([STORE_NAME, THUMB_STORE_NAME], 'readwrite')
    await new Promise<void>((resolve, reject) => {
      tx.objectStore(STORE_NAME).delete(id)
      tx.objectStore(THUMB_STORE_NAME).delete(thumbnailId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async deleteByAnnotation(annotationId: string): Promise<void> {
    const items = await this.list(annotationId)
    if (items.length === 0) return

    const tx = await this.transaction([STORE_NAME, THUMB_STORE_NAME], 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const imageStore = tx.objectStore(STORE_NAME)
      const thumbStore = tx.objectStore(THUMB_STORE_NAME)
      for (const item of items) {
        imageStore.delete(item.id)
        thumbStore.delete(`thumb-${item.id}`)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async list(annotationId: string): Promise<ImageStorageItem[]> {
    const tx = await this.transaction(STORE_NAME, 'readonly')
    return new Promise((resolve, reject) => {
      const index = tx.objectStore(STORE_NAME).index('annotationId')
      const req = index.getAll(annotationId)
      req.onsuccess = () => resolve(req.result as ImageStorageItem[])
      req.onerror = () => reject(req.error)
    })
  }

  async clearAll(): Promise<void> {
    const tx = await this.transaction([STORE_NAME, THUMB_STORE_NAME], 'readwrite')
    await new Promise<void>((resolve, reject) => {
      tx.objectStore(STORE_NAME).clear()
      tx.objectStore(THUMB_STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

/** Singleton instance — use this throughout the app */
export const imageStorage: ImageStorage = new IndexedDBImageStorage()
