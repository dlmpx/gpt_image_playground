import { zip, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { InputImage } from '../types'
import type { ExportData } from '../types'
import {
  CURRENT_THUMBNAIL_VERSION,
  getAllTasks,
  putTask,
  getImage,
  getImageThumbnail,
  getStoredFreshImageThumbnail,
  getAllImageIds,
  getImagesBatch,
  putImage,
  putImageThumbnail,
  storeImage,
  getAllWorkflowRuns,
  getAllWorkflowCandidates,
  putWorkflowRun,
  putWorkflowCandidate,
} from '../lib/db'
import { mergeImportedSettings } from '../lib/apiProfiles'
import { useStore } from '../store'

const imageCache = new Map<string, string>()
const thumbnailCache = new Map<string, { dataUrl: string; width?: number; height?: number; thumbnailVersion?: number }>()
const thumbnailBackfillIds = new Map<string, 'visible' | 'background'>()
const thumbnailBackfillRunningIds = new Set<string>()
const thumbnailSubscribers = new Map<string, Set<(thumbnail: { dataUrl: string; width?: number; height?: number }) => void>>()
let thumbnailBackfillScheduled = false
const MAX_IMAGE_CACHE_ENTRIES = 8
const MAX_THUMBNAIL_CACHE_ENTRIES = 80
const MAX_THUMBNAIL_BACKFILL_CONCURRENT = 4

export function getCachedImage(id: string): string | undefined {
  const dataUrl = imageCache.get(id)
  if (dataUrl) {
    imageCache.delete(id)
    imageCache.set(id, dataUrl)
  }
  return dataUrl
}

export function cacheImage(id: string, dataUrl: string) {
  imageCache.delete(id)
  imageCache.set(id, dataUrl)
  while (imageCache.size > MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageCache.keys().next().value
    if (oldestKey == null) break
    imageCache.delete(oldestKey)
  }
}

export function invalidateCachedImage(id: string) {
  imageCache.delete(id)
}

export function invalidateCachedThumbnail(id: string) {
  thumbnailCache.delete(id)
}

export function clearAllImageCaches() {
  imageCache.clear()
  thumbnailCache.clear()
  thumbnailBackfillIds.clear()
}

function getCachedThumbnail(id: string) {
  const thumbnail = thumbnailCache.get(id)
  if (thumbnail?.thumbnailVersion === CURRENT_THUMBNAIL_VERSION) {
    thumbnailCache.delete(id)
    thumbnailCache.set(id, thumbnail)
    return thumbnail
  }
  if (thumbnail) {
    thumbnailCache.delete(id)
  }
  return undefined
}

function cacheThumbnail(id: string, thumbnail: { dataUrl: string; width?: number; height?: number; thumbnailVersion?: number }) {
  if (thumbnail.thumbnailVersion !== CURRENT_THUMBNAIL_VERSION) return
  thumbnailCache.delete(id)
  thumbnailCache.set(id, thumbnail)
  while (thumbnailCache.size > MAX_THUMBNAIL_CACHE_ENTRIES) {
    const oldestKey = thumbnailCache.keys().next().value
    if (oldestKey == null) break
    thumbnailCache.delete(oldestKey)
  }
}

export async function ensureImageCached(id: string): Promise<string | undefined> {
  const cached = getCachedImage(id)
  if (cached) return cached
  const rec = await getImage(id)
  if (rec) {
    cacheImage(id, rec.dataUrl)
    return rec.dataUrl
  }
  return undefined
}

export async function ensureImageThumbnailCached(id: string): Promise<{ dataUrl: string; width?: number; height?: number } | undefined> {
  const cached = getCachedThumbnail(id)
  if (cached) return cached

  const rec = await getStoredFreshImageThumbnail(id)
  if (!rec?.thumbnailDataUrl) {
    scheduleThumbnailBackfill([id], 'visible')
    return undefined
  }

  const thumbnail = {
    dataUrl: rec.thumbnailDataUrl,
    width: rec.width,
    height: rec.height,
    thumbnailVersion: rec.thumbnailVersion,
  }
  cacheThumbnail(id, thumbnail)
  return thumbnail
}

export function subscribeImageThumbnail(id: string, callback: (thumbnail: { dataUrl: string; width?: number; height?: number }) => void) {
  let subscribers = thumbnailSubscribers.get(id)
  if (!subscribers) {
    subscribers = new Set()
    thumbnailSubscribers.set(id, subscribers)
  }
  subscribers.add(callback)
  return () => {
    subscribers?.delete(callback)
    if (subscribers?.size === 0) thumbnailSubscribers.delete(id)
  }
}

function notifyImageThumbnail(id: string, thumbnail: { dataUrl: string; width?: number; height?: number }) {
  thumbnailSubscribers.get(id)?.forEach((callback) => callback(thumbnail))
}

export function scheduleThumbnailBackfill(ids: Iterable<string>, priority: 'visible' | 'background' = 'background') {
  for (const id of ids) {
    if (getCachedThumbnail(id) || thumbnailBackfillRunningIds.has(id)) continue
    const currentPriority = thumbnailBackfillIds.get(id)
    if (!currentPriority || priority === 'visible') thumbnailBackfillIds.set(id, priority)
  }
  scheduleThumbnailBackfillTick()
}

function scheduleThumbnailBackfillTick() {
  if (thumbnailBackfillScheduled || thumbnailBackfillIds.size === 0) return
  thumbnailBackfillScheduled = true

  const run = () => {
    thumbnailBackfillScheduled = false
    void processNextThumbnailBackfill()
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 2_000 })
  } else {
    globalThis.setTimeout(run, 250)
  }
}

async function processNextThumbnailBackfill() {
  if (thumbnailBackfillRunningIds.size > 0) return

  const ids = await getNextThumbnailBackfillBatch()
  for (const id of ids) startThumbnailBackfill(id)

  if (thumbnailBackfillIds.size > 0) scheduleThumbnailBackfillTick()
}

async function getNextThumbnailBackfillBatch() {
  const candidates = getOrderedThumbnailBackfillIds().slice(0, MAX_THUMBNAIL_BACKFILL_CONCURRENT)
  if (candidates.length === 0) return []

  const sizes = await Promise.all(candidates.map(async (id) => {
    const image = await getImage(id)
    return { width: image?.width, height: image?.height }
  }))
  const concurrency = getThumbnailConcurrencyForBatch(sizes)
  const selected = candidates.slice(0, concurrency)
  for (const id of selected) thumbnailBackfillIds.delete(id)
  return selected
}

function getOrderedThumbnailBackfillIds() {
  const visible: string[] = []
  const background: string[] = []
  for (const [id, priority] of thumbnailBackfillIds) {
    if (priority === 'visible') visible.push(id)
    else background.push(id)
  }
  return [...visible, ...background]
}

function getThumbnailConcurrencyForBatch(sizes: Array<{ width?: number; height?: number }>) {
  let maxMegapixels = 0
  for (const { width, height } of sizes) {
    if (!width || !height) return 1
    maxMegapixels = Math.max(maxMegapixels, (width * height) / 1_000_000)
  }
  const megapixels = maxMegapixels
  if (megapixels >= 8) return 1
  if (megapixels >= 4) return 2
  if (megapixels >= 2) return 3
  return 4
}

function startThumbnailBackfill(id: string) {
  thumbnailBackfillRunningIds.add(id)

  void (async () => {
    if (getCachedThumbnail(id)) return

    const thumbnail = await getImageThumbnail(id)
    if (thumbnail?.thumbnailDataUrl) {
      cacheThumbnail(id, {
        dataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: thumbnail.thumbnailVersion,
      })
      notifyImageThumbnail(id, {
        dataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
      })
    }
  })().catch(() => {
  }).finally(() => {
    thumbnailBackfillRunningIds.delete(id)
    scheduleThumbnailBackfillTick()
  })
}

export function orderImagesWithMaskFirst(images: InputImage[], maskTargetImageId: string | null | undefined) {
  if (!maskTargetImageId) return images
  const maskIdx = images.findIndex((img) => img.id === maskTargetImageId)
  if (maskIdx <= 0) return images
  const next = [...images]
  const [maskImage] = next.splice(maskIdx, 1)
  next.unshift(maskImage)
  return next
}

function formatExportFileTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/)
  const ext = match?.[1] ?? 'png'
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { ext, bytes }
}

function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
  const mime = mimeMap[ext] ?? 'image/png'
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(binary)}`
}

export interface ExportProgress {
  phase: 'tasks' | 'images' | 'manifest' | 'compress' | 'download' | 'done'
  current: number
  total: number
}

export interface ExportOptions {
  exportConfig?: boolean
  exportTasks?: boolean
  selectedOnly?: boolean
  onProgress?: (progress: ExportProgress) => void
}

export async function exportData(options: ExportOptions = { exportConfig: true, exportTasks: true }) {
  const { onProgress } = options
  try {
    onProgress?.({ phase: 'tasks', current: 0, total: 0 })
    let tasks = options.exportTasks ? await getAllTasks() : []
    if (options.selectedOnly && tasks.length > 0) {
      const selectedIds = new Set(useStore.getState().selectedTaskIds)
      tasks = tasks.filter((t) => selectedIds.has(t.id))
    }
    onProgress?.({ phase: 'tasks', current: 1, total: 1 })
    const { settings } = useStore.getState()
    const exportedAt = Date.now()
    const imageCreatedAtFallback = new Map<string, number>()

    if (options.exportTasks) {
      for (const task of tasks) {
        for (const id of [
          ...(task.inputImageIds || []),
          ...(task.maskImageId ? [task.maskImageId] : []),
          ...(task.outputImages || []),
        ]) {
          const prev = imageCreatedAtFallback.get(id)
          if (prev == null || task.createdAt < prev) {
            imageCreatedAtFallback.set(id, task.createdAt)
          }
        }
      }
    }

    const imageFiles: ExportData['imageFiles'] = {}
    const thumbnailFiles: NonNullable<ExportData['thumbnailFiles']> = {}
    const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {}

    if (options.exportTasks) {
      let allImageIds: string[]
      if (options.selectedOnly) {
        const idSet = new Set<string>()
        for (const task of tasks) {
          for (const id of task.outputImages || []) idSet.add(id)
          for (const id of task.inputImageIds || []) idSet.add(id)
          if (task.maskImageId) idSet.add(task.maskImageId)
        }
        allImageIds = Array.from(idSet)
      } else {
        allImageIds = await getAllImageIds()
      }
      const totalImages = allImageIds.length
      let processedImages = 0
      onProgress?.({ phase: 'images', current: 0, total: totalImages })
      const BATCH_SIZE = 30

      for (let i = 0; i < allImageIds.length; i += BATCH_SIZE) {
        const batchIds = allImageIds.slice(i, i + BATCH_SIZE)
        const batch = await getImagesBatch(batchIds)

        for (const img of batch) {
          const { ext, bytes } = dataUrlToBytes(img.dataUrl)
          const path = `images/${img.id}.${ext}`
          const createdAt = img.createdAt ?? imageCreatedAtFallback.get(img.id) ?? exportedAt
          imageFiles[img.id] = {
            path,
            createdAt,
            source: img.source,
            width: img.width,
            height: img.height,
          }
          zipFiles[path] = [bytes, { mtime: new Date(createdAt) }]

          const thumbnail = await getImageThumbnail(img.id)
          if (thumbnail?.thumbnailDataUrl) {
            const { ext: thumbnailExt, bytes: thumbnailBytes } = dataUrlToBytes(thumbnail.thumbnailDataUrl)
            const thumbnailPath = `thumbnails/${img.id}.${thumbnailExt}`
            imageFiles[img.id].width = imageFiles[img.id].width ?? thumbnail.width
            imageFiles[img.id].height = imageFiles[img.id].height ?? thumbnail.height
            thumbnailFiles[img.id] = {
              path: thumbnailPath,
              width: thumbnail.width,
              height: thumbnail.height,
              thumbnailVersion: thumbnail.thumbnailVersion,
            }
            zipFiles[thumbnailPath] = [thumbnailBytes, { mtime: new Date(createdAt) }]
            cacheThumbnail(img.id, {
              dataUrl: thumbnail.thumbnailDataUrl,
              width: thumbnail.width,
              height: thumbnail.height,
              thumbnailVersion: thumbnail.thumbnailVersion,
            })
          }
          processedImages++
        }
        onProgress?.({ phase: 'images', current: processedImages, total: totalImages })
      }
    }

    onProgress?.({ phase: 'manifest', current: 0, total: 0 })
    const manifest: ExportData = {
      version: 4,
      exportedAt: new Date(exportedAt).toISOString(),
    }

    if (options.exportConfig) {
      manifest.settings = settings
      manifest.workflowRuns = await getAllWorkflowRuns()
      manifest.workflowCandidates = await getAllWorkflowCandidates()
    }
    if (options.exportTasks) {
      manifest.tasks = tasks
      manifest.imageFiles = imageFiles
      manifest.thumbnailFiles = thumbnailFiles
    }

    zipFiles['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { mtime: new Date(exportedAt) }]

    onProgress?.({ phase: 'compress', current: 0, total: 0 })
    await new Promise((r) => requestAnimationFrame(r))
    const zipped = await new Promise<Uint8Array>((resolve, reject) => {
      zip(zipFiles, { level: 6 }, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
    onProgress?.({ phase: 'download', current: 0, total: 0 })
    const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gpt-image-playground-${formatExportFileTime(new Date(exportedAt))}.zip`
    a.click()
    URL.revokeObjectURL(url)
    onProgress?.({ phase: 'done', current: 1, total: 1 })
    useStore.getState().showToast('数据已导出', 'success')
  } catch (e) {
    onProgress?.({ phase: 'done', current: 0, total: 0 })
    useStore
      .getState()
      .showToast(
        `导出失败：${e instanceof Error ? e.message : String(e)}`,
        'error',
      )
  }
}

export interface ImportOptions {
  importConfig?: boolean
  importTasks?: boolean
}

export async function importData(file: File, options: ImportOptions = { importConfig: true, importTasks: true }): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer()
    const unzipped = unzipSync(new Uint8Array(buffer))

    const manifestBytes = unzipped['manifest.json']
    if (!manifestBytes) throw new Error('ZIP 中缺少 manifest.json')

    const data: ExportData = JSON.parse(strFromU8(manifestBytes))

    const importedImageIds: string[] = []
    if (options.importTasks && data.tasks && data.imageFiles) {
      for (const [id, info] of Object.entries(data.imageFiles)) {
        const bytes = unzipped[info.path]
        if (!bytes) continue
        const dataUrl = bytesToDataUrl(bytes, info.path)
        await putImage({
          id,
          dataUrl,
          createdAt: info.createdAt,
          source: info.source,
          width: info.width,
          height: info.height,
        })
        cacheImage(id, dataUrl)
        importedImageIds.push(id)
      }

      for (const [id, info] of Object.entries(data.thumbnailFiles ?? {})) {
        const bytes = unzipped[info.path]
        if (!bytes) continue
        const thumbnailDataUrl = bytesToDataUrl(bytes, info.path)
        await putImageThumbnail({
          id,
          thumbnailDataUrl,
          width: info.width,
          height: info.height,
          thumbnailVersion: info.thumbnailVersion,
        })
        cacheThumbnail(id, {
          dataUrl: thumbnailDataUrl,
          width: info.width,
          height: info.height,
          thumbnailVersion: info.thumbnailVersion,
        })
      }

      for (const task of data.tasks) {
        await putTask(task)
      }

      const tasks = await getAllTasks()
      useStore.getState().setTasks(tasks)
      scheduleThumbnailBackfill(importedImageIds)
    }

    if (options.importConfig && data.settings) {
      const state = useStore.getState()
      state.setSettings(mergeImportedSettings(state.settings, data.settings))
    }

    if (options.importConfig) {
      if (data.workflowRuns?.length) {
        for (const run of data.workflowRuns) {
          await putWorkflowRun(run)
        }
      }
      if (data.workflowCandidates?.length) {
        for (const candidate of data.workflowCandidates) {
          await putWorkflowCandidate(candidate)
        }
      }
      if (data.workflowRuns?.length || data.workflowCandidates?.length) {
        const storedRuns = await getAllWorkflowRuns()
        const storedCandidates = await getAllWorkflowCandidates()
        useStore.setState({ workflowRuns: storedRuns, workflowCandidates: storedCandidates })
      }
    }

    let msg = '数据已成功导入'
    if (options.importTasks && data.tasks) {
      msg = `已导入 ${data.tasks.length} 条记录`
    } else if (options.importConfig && data.settings) {
      msg = '配置已成功导入'
    }

    useStore.getState().showToast(msg, 'success')
    return true
  } catch (e) {
    useStore
      .getState()
      .showToast(
        `导入失败：${e instanceof Error ? e.message : String(e)}`,
        'error',
      )
    return false
  }
}

export async function addImageFromFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) return
  const dataUrl = await fileToDataUrl(file)
  const id = await storeImage(dataUrl, 'upload')
  cacheImage(id, dataUrl)
  useStore.getState().addInputImage({ id, dataUrl })
}

export async function addImageFromUrl(src: string): Promise<void> {
  const res = await fetch(src)
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) throw new Error('不是有效的图片')
  const dataUrl = await blobToDataUrl(blob)
  const id = await storeImage(dataUrl, 'upload')
  cacheImage(id, dataUrl)
  useStore.getState().addInputImage({ id, dataUrl })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
