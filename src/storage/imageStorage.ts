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
}

/**
 * IndexedDB-backed image storage.
 * Stores image blobs and auto-generated thumbnails.
 * Images are associated with annotations via annotationId.
 */
class IndexedDBImageStorage implements ImageStorage {
  private db: IDBDatabase | null = null

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db
    return new Promise((resolve, reject) => {
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
        this.db = request.result
        resolve(request.result)
      }
      request.onerror = () => reject(request.error)
    })
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
    const db = await this.getDB()
    const thumbnailId = `thumb-${id}`
    const thumbnail = await this.generateThumbnail(blob)

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, THUMB_STORE_NAME], 'readwrite')
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
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(id)
      req.onsuccess = () => resolve((req.result as ImageStorageItem | undefined)?.blob ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async getThumbnail(id: string): Promise<Blob | null> {
    const db = await this.getDB()
    const thumbnailId = `thumb-${id}`
    return new Promise((resolve, reject) => {
      const tx = db.transaction(THUMB_STORE_NAME, 'readonly')
      const req = tx.objectStore(THUMB_STORE_NAME).get(thumbnailId)
      req.onsuccess = () => resolve((req.result as { id: string; blob: Blob } | undefined)?.blob ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDB()
    const thumbnailId = `thumb-${id}`
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, THUMB_STORE_NAME], 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.objectStore(THUMB_STORE_NAME).delete(thumbnailId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async deleteByAnnotation(annotationId: string): Promise<void> {
    const db = await this.getDB()
    const items = await this.list(annotationId)
    if (items.length === 0) return

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, THUMB_STORE_NAME], 'readwrite')
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
    const db = await this.getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const index = tx.objectStore(STORE_NAME).index('annotationId')
      const req = index.getAll(annotationId)
      req.onsuccess = () => resolve(req.result as ImageStorageItem[])
      req.onerror = () => reject(req.error)
    })
  }
}

/** Singleton instance — use this throughout the app */
export const imageStorage: ImageStorage = new IndexedDBImageStorage()
