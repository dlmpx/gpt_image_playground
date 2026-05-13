import type { TaskRecord, StoredImage, StoredImageThumbnail, WorkflowTemplate, WorkflowRun, WorkflowCandidate } from '../types'

const DB_NAME = 'gpt-image-playground'
const DB_VERSION = 4
const STORE_TASKS = 'tasks'
const STORE_IMAGES = 'images'
const STORE_THUMBNAILS = 'thumbnails'
const STORE_WORKFLOW_TEMPLATES = 'workflowTemplates'
const STORE_WORKFLOW_RUNS = 'workflowRuns'
const STORE_WORKFLOW_CANDIDATES = 'workflowCandidates'
const THUMBNAIL_MAX_SIZE = 720
const THUMBNAIL_QUALITY = 0.9
const THUMBNAIL_VERSION = 2

export const CURRENT_THUMBNAIL_VERSION = THUMBNAIL_VERSION

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_WORKFLOW_TEMPLATES)) {
        db.createObjectStore(STORE_WORKFLOW_TEMPLATES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_WORKFLOW_RUNS)) {
        db.createObjectStore(STORE_WORKFLOW_RUNS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_WORKFLOW_CANDIDATES)) {
        db.createObjectStore(STORE_WORKFLOW_CANDIDATES, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function dbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  return dbTransaction(STORE_TASKS, 'readonly', (s) => s.getAll())
}

export function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.put(task))
}

export function deleteTask(id: string): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.delete(id))
}

export function clearTasks(): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.clear())
}


// ===== Workflow Templates =====

export function getAllWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  return dbTransaction(STORE_WORKFLOW_TEMPLATES, 'readonly', (s) => s.getAll())
}

export function getWorkflowTemplate(id: string): Promise<WorkflowTemplate | undefined> {
  return dbTransaction(STORE_WORKFLOW_TEMPLATES, 'readonly', (s) => s.get(id))
}

export function putWorkflowTemplate(template: WorkflowTemplate): Promise<IDBValidKey> {
  return dbTransaction(STORE_WORKFLOW_TEMPLATES, 'readwrite', (s) => s.put(template))
}

// ===== Workflow Runs =====

export function getAllWorkflowRuns(): Promise<WorkflowRun[]> {
  return dbTransaction(STORE_WORKFLOW_RUNS, 'readonly', (s) => s.getAll())
}

export function getWorkflowRun(id: string): Promise<WorkflowRun | undefined> {
  return dbTransaction(STORE_WORKFLOW_RUNS, 'readonly', (s) => s.get(id))
}

export function putWorkflowRun(run: WorkflowRun): Promise<IDBValidKey> {
  return dbTransaction(STORE_WORKFLOW_RUNS, 'readwrite', (s) => s.put(run))
}

export function deleteWorkflowRun(id: string): Promise<undefined> {
  return dbTransaction(STORE_WORKFLOW_RUNS, 'readwrite', (s) => s.delete(id))
}

// ===== Workflow Candidates =====

export function getAllWorkflowCandidates(): Promise<WorkflowCandidate[]> {
  return dbTransaction(STORE_WORKFLOW_CANDIDATES, 'readonly', (s) => s.getAll())
}

export function getWorkflowCandidatesByRun(runId: string): Promise<WorkflowCandidate[]> {
  return dbTransaction(STORE_WORKFLOW_CANDIDATES, 'readonly', (s) => s.getAll()).then(
    (all) => all.filter((c: WorkflowCandidate) => c.runId === runId)
  )
}

export function getWorkflowCandidate(id: string): Promise<WorkflowCandidate | undefined> {
  return dbTransaction(STORE_WORKFLOW_CANDIDATES, 'readonly', (s) => s.get(id))
}

export function putWorkflowCandidate(candidate: WorkflowCandidate): Promise<IDBValidKey> {
  return dbTransaction(STORE_WORKFLOW_CANDIDATES, 'readwrite', (s) => s.put(candidate))
}

export function deleteWorkflowCandidate(id: string): Promise<undefined> {
  return dbTransaction(STORE_WORKFLOW_CANDIDATES, 'readwrite', (s) => s.delete(id))
}

export function clearWorkflowRuns(): Promise<undefined> {
  return dbTransaction(STORE_WORKFLOW_RUNS, 'readwrite', (s) => s.clear())
}

export function clearWorkflowCandidates(): Promise<undefined> {
  return dbTransaction(STORE_WORKFLOW_CANDIDATES, 'readwrite', (s) => s.clear())
}

// ===== Images =====

export function getImage(id: string): Promise<StoredImage | undefined> {
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.get(id))
}

export function getStoredImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  return dbTransaction(STORE_THUMBNAILS, 'readonly', (s) => s.get(id))
}

export async function getStoredFreshImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const thumbnail = await getStoredImageThumbnail(id)
  return thumbnail?.thumbnailVersion === THUMBNAIL_VERSION ? thumbnail : undefined
}

export function putImageThumbnail(thumbnail: StoredImageThumbnail): Promise<IDBValidKey> {
  return dbTransaction(STORE_THUMBNAILS, 'readwrite', (s) => s.put(thumbnail))
}

export async function getImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const existingThumbnail = await getStoredImageThumbnail(id)
  if (existingThumbnail?.thumbnailVersion === THUMBNAIL_VERSION) {
    const image = await getImage(id)
    if (image && (!image.width || !image.height) && existingThumbnail.width && existingThumbnail.height) {
      await putImage({ ...image, width: existingThumbnail.width, height: existingThumbnail.height })
    }
    return existingThumbnail
  }

  const image = await getImage(id)
  if (!image) return undefined
  const legacyImage = image as StoredImage & Partial<StoredImageThumbnail>
  if (legacyImage.thumbnailDataUrl && legacyImage.thumbnailVersion === THUMBNAIL_VERSION) {
    const thumbnail: StoredImageThumbnail = {
      id,
      thumbnailDataUrl: legacyImage.thumbnailDataUrl,
      width: legacyImage.width,
      height: legacyImage.height,
      thumbnailVersion: THUMBNAIL_VERSION,
    }
    await putImageThumbnail(thumbnail)
    if ((!image.width || !image.height) && thumbnail.width && thumbnail.height) {
      await putImage({ ...image, width: thumbnail.width, height: thumbnail.height })
    }
    return thumbnail
  }

  const metadata = await safeCreateImageThumbnail(image.dataUrl)
  if (!metadata.thumbnailDataUrl) return undefined
  const thumbnail: StoredImageThumbnail = {
    id,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    width: metadata.width,
    height: metadata.height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
  await putImageThumbnail(thumbnail)
  if (metadata.width && metadata.height && (image.width !== metadata.width || image.height !== metadata.height)) {
    await putImage({ ...image, width: metadata.width, height: metadata.height })
  }
  return thumbnail
}

export function getAllImages(): Promise<StoredImage[]> {
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.getAll())
}

/** 分批获取图片，避免一次性加载所有 dataUrl 到内存 */
export async function getImagesBatch(ids: string[]): Promise<StoredImage[]> {
  if (ids.length === 0) return []
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readonly')
    const store = tx.objectStore(STORE_IMAGES)
    const results: StoredImage[] = []
    let remaining = ids.length
    let settled = false

    for (let i = 0; i < ids.length; i++) {
      const req = store.get(ids[i])
      req.onsuccess = () => {
        if (settled) return
        if (req.result) results.push(req.result)
        remaining--
        if (remaining === 0) {
          settled = true
          resolve(results)
        }
      }
      req.onerror = () => {
        if (settled) return
        settled = true
        reject(req.error)
      }
    }

    tx.onerror = () => {
      if (!settled) {
        settled = true
        reject(tx.error)
      }
    }
  })
}

export function getAllImageIds(): Promise<string[]> {
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.map(String),
  )
}

export function putImage(image: StoredImage): Promise<IDBValidKey> {
  return dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.put(image))
}

export function deleteImage(id: string): Promise<undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).delete(id)
        tx.objectStore(STORE_THUMBNAILS).delete(id)
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

export function clearImages(): Promise<undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).clear()
        tx.objectStore(STORE_THUMBNAILS).clear()
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

// ===== Image hashing & dedup =====

export async function hashDataUrl(dataUrl: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return hashDataUrlFallback(dataUrl)
  }

  const data = new TextEncoder().encode(dataUrl)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hashDataUrlFallback(dataUrl: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < dataUrl.length; i++) {
    const code = dataUrl.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code
    h2 = Math.imul(h2, 0x27d4eb2d)
  }

  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * 存储图片，若已存在（按 hash 去重）则跳过。
 * 返回 image id。
 */
export async function storeImage(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<string> {
  const id = await hashDataUrl(dataUrl)
  const existing = await getImage(id)
  if (!existing) {
    const thumbnail = await safeCreateImageThumbnail(dataUrl)
    await putImage({
      id,
      dataUrl,
      createdAt: Date.now(),
      source,
      width: thumbnail.width,
      height: thumbnail.height,
    })
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
  } else if ((await getStoredImageThumbnail(id))?.thumbnailVersion !== THUMBNAIL_VERSION) {
    const thumbnail = await safeCreateImageThumbnail(existing.dataUrl)
    if (thumbnail.width && thumbnail.height && (existing.width !== thumbnail.width || existing.height !== thumbnail.height)) {
      await putImage({ ...existing, width: thumbnail.width, height: thumbnail.height })
    }
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
  }
  return id
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = dataUrl
  })
}

async function createImageThumbnail(dataUrl: string): Promise<Omit<StoredImageThumbnail, 'id'>> {
  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) throw new Error('图片尺寸无效')

  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  return {
    thumbnailDataUrl: canvas.toDataURL('image/webp', THUMBNAIL_QUALITY),
    width,
    height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
}

async function safeCreateImageThumbnail(dataUrl: string): Promise<Partial<Omit<StoredImageThumbnail, 'id'>>> {
  try {
    return await createImageThumbnail(dataUrl)
  } catch {
    return {}
  }
}
