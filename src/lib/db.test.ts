import 'fake-indexeddb/auto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_THUMBNAIL_VERSION,
  clearImages,
  clearTasks,
  clearWorkflowCandidates,
  clearWorkflowRuns,
  deleteImage,
  deleteTask,
  deleteWorkflowCandidate,
  deleteWorkflowRun,
  getAllImageIds,
  getAllImages,
  getAllTasks,
  getAllWorkflowCandidates,
  getAllWorkflowRuns,
  getAllWorkflowTemplates,
  getImage,
  getImageThumbnail,
  getImagesBatch,
  getStoredFreshImageThumbnail,
  getStoredImageThumbnail,
  getWorkflowCandidate,
  getWorkflowCandidatesByRun,
  getWorkflowRun,
  getWorkflowTemplate,
  hashDataUrl,
  putImage,
  putImageThumbnail,
  putTask,
  putWorkflowCandidate,
  putWorkflowRun,
  putWorkflowTemplate,
  storeImage,
} from './db'
import type {
  StoredImage,
  StoredImageThumbnail,
  TaskRecord,
  WorkflowCandidate,
  WorkflowRun,
  WorkflowTemplate,
} from '../types'

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_1PX_ALT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAFysNavAAAADklEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg=='
const PNG_1PX_GREEN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNg+M9QDwAEQAGA0j6tCAAAAABJRU5ErkJggg=='

beforeAll(async () => {
  const seed = makeStoredImage({ id: '__seed__' })
  await putImage(seed)
  await deleteImage('__seed__')
})

beforeEach(async () => {
  await clearImages()
  await clearTasks()
  await clearWorkflowRuns()
  await clearWorkflowCandidates()
})

function makeStoredImage(overrides: Partial<StoredImage> = {}): StoredImage {
  return {
    id: 'img-test',
    dataUrl: PNG_1PX,
    createdAt: Date.now(),
    source: 'upload',
    ...overrides,
  }
}

function makeStoredThumbnail(overrides: Partial<StoredImageThumbnail> = {}): StoredImageThumbnail {
  return {
    id: 'img-test',
    thumbnailDataUrl: PNG_1PX,
    width: 100,
    height: 50,
    thumbnailVersion: CURRENT_THUMBNAIL_VERSION,
    ...overrides,
  }
}

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    prompt: 'test prompt',
    params: { size: 'auto', quality: 'auto', output_format: 'png', output_compression: null, moderation: 'auto', n: 1 },
    inputImageIds: [],
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
    ...overrides,
  }
}

function makeWorkflowTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id: 'tmpl-1',
    name: 'Test Template',
    stage: 1,
    basePrompt: 'base',
    defaultParams: { size: 'auto' },
    ...overrides,
  }
}

function makeWorkflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    name: 'Test Run',
    currentStage: 1,
    rootCandidateIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makeWorkflowCandidate(overrides: Partial<WorkflowCandidate> = {}): WorkflowCandidate {
  return {
    id: 'cand-1',
    runId: 'run-1',
    stage: 1,
    sourceTaskId: 'task-1',
    primaryImageId: 'img-1',
    parentCandidateId: null,
    decision: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('hashDataUrl', () => {
  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('produces the same SHA-256 hash for identical input', async () => {
    const h1 = await hashDataUrl(PNG_1PX)
    const h2 = await hashDataUrl(PNG_1PX)
    expect(h1).toBe(h2)
  })

  it('produces different hashes for different inputs', async () => {
    const h1 = await hashDataUrl(PNG_1PX)
    const h2 = await hashDataUrl(PNG_1PX_ALT)
    expect(h1).not.toBe(h2)
  })

  it('produces a 64-character hex string from SHA-256', async () => {
    const hash = await hashDataUrl(PNG_1PX)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces the same hash for the same data URL on repeated calls', async () => {
    const h1 = await hashDataUrl(PNG_1PX_GREEN)
    const h2 = await hashDataUrl(PNG_1PX_GREEN)
    expect(h1).toBe(h2)
  })

  it('falls back to FNV hash when crypto.subtle is unavailable', async () => {
    vi.stubGlobal('crypto', { subtle: undefined })
    const hash = await hashDataUrl(PNG_1PX)
    expect(hash).toMatch(/^fallback-[0-9a-f]{16}$/)
  })

  it('produces consistent FNV fallback hash for identical input', async () => {
    vi.stubGlobal('crypto', { subtle: undefined })
    const h1 = await hashDataUrl(PNG_1PX)
    const h2 = await hashDataUrl(PNG_1PX)
    expect(h1).toBe(h2)
  })

  it('produces different FNV fallback hashes for different inputs', async () => {
    vi.stubGlobal('crypto', { subtle: undefined })
    const h1 = await hashDataUrl(PNG_1PX)
    const h2 = await hashDataUrl(PNG_1PX_ALT)
    expect(h1).not.toBe(h2)
  })
})

describe('Image CRUD', () => {
  it('putImage stores and getImage retrieves an image', async () => {
    const img = makeStoredImage({ id: 'img-1' })
    await putImage(img)
    const retrieved = await getImage('img-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('img-1')
    expect(retrieved!.dataUrl).toBe(PNG_1PX)
  })

  it('getImage returns undefined for a nonexistent image', async () => {
    const retrieved = await getImage('nonexistent')
    expect(retrieved).toBeUndefined()
  })

  it('putImage updates an existing image with the same id', async () => {
    const img1 = makeStoredImage({ id: 'img-1', source: 'upload' })
    await putImage(img1)
    const img2 = makeStoredImage({ id: 'img-1', source: 'generated' })
    await putImage(img2)
    const retrieved = await getImage('img-1')
    expect(retrieved!.source).toBe('generated')
  })

  it('getAllImages returns all stored images', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putImage(makeStoredImage({ id: 'img-2' }))
    await putImage(makeStoredImage({ id: 'img-3' }))
    const all = await getAllImages()
    expect(all).toHaveLength(3)
    expect(all.map((i) => i.id).sort()).toEqual(['img-1', 'img-2', 'img-3'])
  })

  it('getAllImages returns empty array when no images exist', async () => {
    const all = await getAllImages()
    expect(all).toEqual([])
  })

  it('getAllImageIds returns all stored image ids as strings', async () => {
    await putImage(makeStoredImage({ id: 'abc' }))
    await putImage(makeStoredImage({ id: 'def' }))
    const ids = await getAllImageIds()
    expect(ids.sort()).toEqual(['abc', 'def'])
    expect(typeof ids[0]).toBe('string')
  })

  it('getAllImageIds returns empty array when no images exist', async () => {
    const ids = await getAllImageIds()
    expect(ids).toEqual([])
  })

  it('getImagesBatch fetches multiple images by id', async () => {
    await putImage(makeStoredImage({ id: 'img-1', dataUrl: PNG_1PX }))
    await putImage(makeStoredImage({ id: 'img-2', dataUrl: PNG_1PX_ALT }))
    await putImage(makeStoredImage({ id: 'img-3', dataUrl: PNG_1PX_GREEN }))
    const results = await getImagesBatch(['img-1', 'img-3'])
    expect(results).toHaveLength(2)
    const resultIds = results.map((r) => r.id).sort()
    expect(resultIds).toEqual(['img-1', 'img-3'])
  })

  it('getImagesBatch returns empty array for empty id list', async () => {
    const results = await getImagesBatch([])
    expect(results).toEqual([])
  })

  it('getImagesBatch skips nonexistent ids', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    const results = await getImagesBatch(['img-1', 'nonexistent'])
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('img-1')
  })

  it('getImagesBatch with all nonexistent ids returns empty', async () => {
    const results = await getImagesBatch(['a', 'b', 'c'])
    expect(results).toEqual([])
  })
})

describe('Thumbnails', () => {
  it('putImageThumbnail stores and getStoredImageThumbnail retrieves', async () => {
    const thumb = makeStoredThumbnail({ id: 'img-1' })
    await putImageThumbnail(thumb)
    const retrieved = await getStoredImageThumbnail('img-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('img-1')
    expect(retrieved!.thumbnailVersion).toBe(CURRENT_THUMBNAIL_VERSION)
  })

  it('getStoredImageThumbnail returns undefined for nonexistent id', async () => {
    const retrieved = await getStoredImageThumbnail('nonexistent')
    expect(retrieved).toBeUndefined()
  })

  it('getStoredFreshImageThumbnail returns thumbnail with current version', async () => {
    const thumb = makeStoredThumbnail({ id: 'img-1', thumbnailVersion: CURRENT_THUMBNAIL_VERSION })
    await putImageThumbnail(thumb)
    const fresh = await getStoredFreshImageThumbnail('img-1')
    expect(fresh).toBeDefined()
    expect(fresh!.thumbnailVersion).toBe(CURRENT_THUMBNAIL_VERSION)
  })

  it('getStoredFreshImageThumbnail returns undefined for outdated version', async () => {
    const thumb = makeStoredThumbnail({ id: 'img-1', thumbnailVersion: 1 })
    await putImageThumbnail(thumb)
    const fresh = await getStoredFreshImageThumbnail('img-1')
    expect(fresh).toBeUndefined()
  })

  it('getStoredFreshImageThumbnail returns undefined for missing thumbnail', async () => {
    const fresh = await getStoredFreshImageThumbnail('nonexistent')
    expect(fresh).toBeUndefined()
  })

  it('getImageThumbnail returns cached thumbnail on cache hit', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-1', thumbnailVersion: CURRENT_THUMBNAIL_VERSION }))
    const thumbnail = await getImageThumbnail('img-1')
    expect(thumbnail).toBeDefined()
    expect(thumbnail!.id).toBe('img-1')
    expect(thumbnail!.thumbnailVersion).toBe(CURRENT_THUMBNAIL_VERSION)
  })

  it('getImageThumbnail backfills missing image dimensions from thumbnail', async () => {
    await putImage(makeStoredImage({ id: 'img-1', width: undefined, height: undefined }))
    await putImageThumbnail(
      makeStoredThumbnail({ id: 'img-1', width: 200, height: 150, thumbnailVersion: CURRENT_THUMBNAIL_VERSION }),
    )
    await getImageThumbnail('img-1')
    const updatedImage = await getImage('img-1')
    expect(updatedImage!.width).toBe(200)
    expect(updatedImage!.height).toBe(150)
  })

  it('getImageThumbnail does not overwrite existing image dimensions', async () => {
    await putImage(makeStoredImage({ id: 'img-1', width: 300, height: 200 }))
    await putImageThumbnail(
      makeStoredThumbnail({ id: 'img-1', width: 100, height: 50, thumbnailVersion: CURRENT_THUMBNAIL_VERSION }),
    )
    await getImageThumbnail('img-1')
    const image = await getImage('img-1')
    expect(image!.width).toBe(300)
    expect(image!.height).toBe(200)
  })

  it('getImageThumbnail returns undefined for unknown image id', async () => {
    const thumbnail = await getImageThumbnail('nonexistent')
    expect(thumbnail).toBeUndefined()
  })

  it('putImageThumbnail updates an existing thumbnail with the same id', async () => {
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-1', width: 50, thumbnailVersion: 1 }))
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-1', width: 100, thumbnailVersion: CURRENT_THUMBNAIL_VERSION }))
    const retrieved = await getStoredImageThumbnail('img-1')
    expect(retrieved!.width).toBe(100)
    expect(retrieved!.thumbnailVersion).toBe(CURRENT_THUMBNAIL_VERSION)
  })
})

describe('storeImage', () => {
  it('stores a new image and returns a hash-based id', async () => {
    const id = await storeImage(PNG_1PX_GREEN)
    expect(id).toBeDefined()
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    const image = await getImage(id)
    expect(image).toBeDefined()
    expect(image!.dataUrl).toBe(PNG_1PX_GREEN)
  })

  it('returns the same id for the same dataUrl (dedup)', async () => {
    const id1 = await storeImage(PNG_1PX)
    const id2 = await storeImage(PNG_1PX)
    expect(id1).toBe(id2)
  })

  it('stores only one image record on repeated storeImage calls with the same data', async () => {
    await storeImage(PNG_1PX)
    await storeImage(PNG_1PX)
    const all = await getAllImages()
    expect(all).toHaveLength(1)
  })

  it('produces different ids for different dataUrls', async () => {
    const id1 = await storeImage(PNG_1PX)
    const id2 = await storeImage(PNG_1PX_ALT)
    expect(id1).not.toBe(id2)
  })

  it('creates separate image records for different dataUrls', async () => {
    await storeImage(PNG_1PX)
    await storeImage(PNG_1PX_ALT)
    const all = await getAllImages()
    expect(all).toHaveLength(2)
  })

  it('uses FNV fallback id when crypto.subtle is unavailable', async () => {
    vi.stubGlobal('crypto', { subtle: undefined })
    const id = await storeImage(PNG_1PX)
    expect(id).toMatch(/^fallback-[0-9a-f]{16}$/)
  })

  it('stores source field correctly', async () => {
    const id = await storeImage(PNG_1PX, 'generated')
    const image = await getImage(id)
    expect(image!.source).toBe('generated')
  })

  it('defaults source to upload when not specified', async () => {
    const id = await storeImage(PNG_1PX_ALT)
    const image = await getImage(id)
    expect(image!.source).toBe('upload')
  })

  it('sets createdAt timestamp on new image', async () => {
    const before = Date.now()
    const id = await storeImage(PNG_1PX_GREEN)
    const after = Date.now()
    const image = await getImage(id)
    expect(image!.createdAt).toBeGreaterThanOrEqual(before)
    expect(image!.createdAt).toBeLessThanOrEqual(after)
  })
})

describe('deleteImage', () => {
  it('deletes the image record from the images store', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await deleteImage('img-1')
    const image = await getImage('img-1')
    expect(image).toBeUndefined()
  })

  it('cascade-deletes the associated thumbnail', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-1' }))
    await deleteImage('img-1')
    const thumb = await getStoredImageThumbnail('img-1')
    expect(thumb).toBeUndefined()
  })

  it('does not throw when deleting a nonexistent image', async () => {
    await expect(deleteImage('nonexistent')).resolves.toBeUndefined()
  })

  it('only deletes the specified image and its thumbnail', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putImage(makeStoredImage({ id: 'img-2' }))
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-1' }))
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-2' }))
    await deleteImage('img-1')
    expect(await getImage('img-2')).toBeDefined()
    expect(await getStoredImageThumbnail('img-2')).toBeDefined()
    expect(await getImage('img-1')).toBeUndefined()
    expect(await getStoredImageThumbnail('img-1')).toBeUndefined()
  })

  it('deletes image successfully even when no thumbnail exists', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await deleteImage('img-1')
    expect(await getImage('img-1')).toBeUndefined()
  })
})

describe('clearImages', () => {
  it('removes all image records', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putImage(makeStoredImage({ id: 'img-2' }))
    await putImage(makeStoredImage({ id: 'img-3' }))
    await clearImages()
    expect(await getAllImages()).toEqual([])
    expect(await getAllImageIds()).toEqual([])
  })

  it('removes all thumbnail records', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putImage(makeStoredImage({ id: 'img-2' }))
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-1' }))
    await putImageThumbnail(makeStoredThumbnail({ id: 'img-2' }))
    await clearImages()
    expect(await getStoredImageThumbnail('img-1')).toBeUndefined()
    expect(await getStoredImageThumbnail('img-2')).toBeUndefined()
  })

  it('is a no-op when stores are already empty', async () => {
    await expect(clearImages()).resolves.toBeUndefined()
  })

  it('does not affect workflow data', async () => {
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    await putImage(makeStoredImage({ id: 'img-1' }))
    await clearImages()
    expect(await getWorkflowRun('run-1')).toBeDefined()
    expect(await getImage('img-1')).toBeUndefined()
  })

  it('does not affect task data', async () => {
    await putTask(makeTask({ id: 'task-1' }))
    await putImage(makeStoredImage({ id: 'img-1' }))
    await clearImages()
    const tasks = await getAllTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('task-1')
    expect(await getImage('img-1')).toBeUndefined()
  })
})

describe('Tasks', () => {
  it('putTask stores a task record', async () => {
    const task = makeTask({ id: 'task-1' })
    await putTask(task)
    const all = await getAllTasks()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe('task-1')
  })

  it('getAllTasks returns empty array when no tasks exist', async () => {
    const all = await getAllTasks()
    expect(all).toEqual([])
  })

  it('putTask updates an existing task with the same id', async () => {
    await putTask(makeTask({ id: 'task-1', status: 'running' }))
    await putTask(makeTask({ id: 'task-1', status: 'done' }))
    const all = await getAllTasks()
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('done')
  })

  it('deleteTask removes a task', async () => {
    await putTask(makeTask({ id: 'task-1' }))
    await deleteTask('task-1')
    const all = await getAllTasks()
    expect(all).toEqual([])
  })

  it('deleteTask does not throw for nonexistent task', async () => {
    await expect(deleteTask('nonexistent')).resolves.toBeUndefined()
  })

  it('clearTasks removes all tasks', async () => {
    await putTask(makeTask({ id: 'task-1' }))
    await putTask(makeTask({ id: 'task-2' }))
    await putTask(makeTask({ id: 'task-3' }))
    await clearTasks()
    expect(await getAllTasks()).toEqual([])
  })

  it('clearTasks is a no-op when store is empty', async () => {
    await expect(clearTasks()).resolves.toBeUndefined()
  })

  it('preserves task record fields through put/get roundtrip', async () => {
    const task = makeTask({
      id: 'task-full',
      prompt: 'a beautiful sunset',
      status: 'running',
      inputImageIds: ['img-a', 'img-b'],
      outputImages: ['img-c'],
      rating: 4,
    })
    await putTask(task)
    const all = await getAllTasks()
    expect(all[0]).toMatchObject({
      id: 'task-full',
      prompt: 'a beautiful sunset',
      status: 'running',
      rating: 4,
    })
    expect(all[0].inputImageIds).toEqual(['img-a', 'img-b'])
    expect(all[0].outputImages).toEqual(['img-c'])
  })
})

describe('Workflow Templates', () => {
  it('putWorkflowTemplate stores and getWorkflowTemplate retrieves a template', async () => {
    const tmpl = makeWorkflowTemplate({ id: 'tmpl-1' })
    await putWorkflowTemplate(tmpl)
    const retrieved = await getWorkflowTemplate('tmpl-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('tmpl-1')
  })

  it('getWorkflowTemplate returns undefined for nonexistent template', async () => {
    const retrieved = await getWorkflowTemplate('nonexistent')
    expect(retrieved).toBeUndefined()
  })

  it('getAllWorkflowTemplates returns all stored templates', async () => {
    await putWorkflowTemplate(makeWorkflowTemplate({ id: 'tmpl-1', stage: 1 }))
    await putWorkflowTemplate(makeWorkflowTemplate({ id: 'tmpl-2', stage: 2 }))
    const all = await getAllWorkflowTemplates()
    expect(all).toHaveLength(2)
  })

  it('putWorkflowTemplate updates an existing template', async () => {
    await putWorkflowTemplate(makeWorkflowTemplate({ id: 'tmpl-1', name: 'Old' }))
    await putWorkflowTemplate(makeWorkflowTemplate({ id: 'tmpl-1', name: 'New' }))
    const retrieved = await getWorkflowTemplate('tmpl-1')
    expect(retrieved!.name).toBe('New')
  })
})

describe('Workflow Runs', () => {
  it('putWorkflowRun stores and getWorkflowRun retrieves a run', async () => {
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    const retrieved = await getWorkflowRun('run-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('run-1')
  })

  it('getWorkflowRun returns undefined for nonexistent run', async () => {
    const retrieved = await getWorkflowRun('nonexistent')
    expect(retrieved).toBeUndefined()
  })

  it('getAllWorkflowRuns returns all stored runs', async () => {
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'run-2' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'run-3' }))
    const all = await getAllWorkflowRuns()
    expect(all).toHaveLength(3)
  })

  it('getAllWorkflowRuns returns empty when no runs exist', async () => {
    const all = await getAllWorkflowRuns()
    expect(all).toEqual([])
  })

  it('putWorkflowRun updates an existing run', async () => {
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1', currentStage: 1 }))
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1', currentStage: 3 }))
    const retrieved = await getWorkflowRun('run-1')
    expect(retrieved!.currentStage).toBe(3)
  })

  it('deleteWorkflowRun removes a run', async () => {
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    await deleteWorkflowRun('run-1')
    const retrieved = await getWorkflowRun('run-1')
    expect(retrieved).toBeUndefined()
  })

  it('deleteWorkflowRun does not throw for nonexistent run', async () => {
    await expect(deleteWorkflowRun('nonexistent')).resolves.toBeUndefined()
  })
})

describe('clearWorkflowRuns', () => {
  it('removes all workflow runs', async () => {
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'run-2' }))
    await clearWorkflowRuns()
    expect(await getAllWorkflowRuns()).toEqual([])
  })

  it('is a no-op when store is empty', async () => {
    await expect(clearWorkflowRuns()).resolves.toBeUndefined()
  })

  it('does not affect workflow candidates', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    await clearWorkflowRuns()
    expect(await getWorkflowCandidate('cand-1')).toBeDefined()
    expect(await getWorkflowRun('run-1')).toBeUndefined()
  })
})

describe('Workflow Candidates', () => {
  it('putWorkflowCandidate stores and getWorkflowCandidate retrieves a candidate', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1' }))
    const retrieved = await getWorkflowCandidate('cand-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe('cand-1')
  })

  it('getWorkflowCandidate returns undefined for nonexistent candidate', async () => {
    const retrieved = await getWorkflowCandidate('nonexistent')
    expect(retrieved).toBeUndefined()
  })

  it('getAllWorkflowCandidates returns all stored candidates', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-2' }))
    const all = await getAllWorkflowCandidates()
    expect(all).toHaveLength(2)
  })

  it('getAllWorkflowCandidates returns empty when no candidates exist', async () => {
    const all = await getAllWorkflowCandidates()
    expect(all).toEqual([])
  })

  it('getWorkflowCandidatesByRun filters candidates by runId', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1', runId: 'run-a' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-2', runId: 'run-a' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-3', runId: 'run-b' }))
    const matches = await getWorkflowCandidatesByRun('run-a')
    expect(matches).toHaveLength(2)
    expect(matches.map((c) => c.id).sort()).toEqual(['cand-1', 'cand-2'])
  })

  it('getWorkflowCandidatesByRun returns empty when no candidates match the runId', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1', runId: 'run-a' }))
    const matches = await getWorkflowCandidatesByRun('run-b')
    expect(matches).toEqual([])
  })

  it('putWorkflowCandidate updates an existing candidate', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1', decision: 'draft' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1', decision: 'promoted' }))
    const retrieved = await getWorkflowCandidate('cand-1')
    expect(retrieved!.decision).toBe('promoted')
  })

  it('deleteWorkflowCandidate removes a candidate', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1' }))
    await deleteWorkflowCandidate('cand-1')
    const retrieved = await getWorkflowCandidate('cand-1')
    expect(retrieved).toBeUndefined()
  })

  it('deleteWorkflowCandidate does not throw for nonexistent candidate', async () => {
    await expect(deleteWorkflowCandidate('nonexistent')).resolves.toBeUndefined()
  })

  it('preserves candidate fields through put/get roundtrip', async () => {
    const cand = makeWorkflowCandidate({
      id: 'cand-full',
      runId: 'run-x',
      stage: 2,
      sourceTaskId: 'task-src',
      primaryImageId: 'img-pri',
      parentCandidateId: 'cand-parent',
      decision: 'keep',
      notes: 'test note',
    })
    await putWorkflowCandidate(cand)
    const retrieved = await getWorkflowCandidate('cand-full')
    expect(retrieved).toMatchObject({
      id: 'cand-full',
      runId: 'run-x',
      stage: 2,
      sourceTaskId: 'task-src',
      primaryImageId: 'img-pri',
      parentCandidateId: 'cand-parent',
      decision: 'keep',
      notes: 'test note',
    })
  })
})

describe('clearWorkflowCandidates', () => {
  it('removes all workflow candidates', async () => {
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-2' }))
    await clearWorkflowCandidates()
    expect(await getAllWorkflowCandidates()).toEqual([])
  })

  it('is a no-op when store is empty', async () => {
    await expect(clearWorkflowCandidates()).resolves.toBeUndefined()
  })

  it('does not affect workflow runs', async () => {
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1' }))
    await clearWorkflowCandidates()
    expect(await getWorkflowRun('run-1')).toBeDefined()
    expect(await getWorkflowCandidate('cand-1')).toBeUndefined()
  })
})

describe('cross-store isolation', () => {
  it('clearImages does not affect tasks, workflow runs, or workflow candidates', async () => {
    await putTask(makeTask({ id: 't-1' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'wr-1' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'wc-1' }))
    await clearImages()
    expect(await getAllTasks()).toHaveLength(1)
    expect(await getAllWorkflowRuns()).toHaveLength(1)
    expect(await getAllWorkflowCandidates()).toHaveLength(1)
  })

  it('clearTasks does not affect other stores', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'run-1' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'cand-1' }))
    await clearTasks()
    expect(await getAllImages()).toHaveLength(1)
    expect(await getAllWorkflowRuns()).toHaveLength(1)
    expect(await getAllWorkflowCandidates()).toHaveLength(1)
  })

  it('clearWorkflowRuns does not affect other stores', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putTask(makeTask({ id: 't-1' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'wc-1' }))
    await clearWorkflowRuns()
    expect(await getAllImages()).toHaveLength(1)
    expect(await getAllTasks()).toHaveLength(1)
    expect(await getAllWorkflowCandidates()).toHaveLength(1)
  })

  it('clearWorkflowCandidates does not affect other stores', async () => {
    await putImage(makeStoredImage({ id: 'img-1' }))
    await putTask(makeTask({ id: 't-1' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'wr-1' }))
    await clearWorkflowCandidates()
    expect(await getAllImages()).toHaveLength(1)
    expect(await getAllTasks()).toHaveLength(1)
    expect(await getAllWorkflowRuns()).toHaveLength(1)
  })

  it('deleteImage does not affect other stores', async () => {
    await putTask(makeTask({ id: 't-1' }))
    await putWorkflowRun(makeWorkflowRun({ id: 'wr-1' }))
    await putWorkflowCandidate(makeWorkflowCandidate({ id: 'wc-1' }))
    await putImage(makeStoredImage({ id: 'img-1' }))
    await deleteImage('img-1')
    expect(await getAllTasks()).toHaveLength(1)
    expect(await getAllWorkflowRuns()).toHaveLength(1)
    expect(await getAllWorkflowCandidates()).toHaveLength(1)
  })
})
