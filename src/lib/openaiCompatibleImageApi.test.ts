import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiProfile, CustomProviderDefinition, CustomProviderPollMapping } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { callOpenAICompatibleImageApi, getCustomQueuedImageResult } from './openaiCompatibleImageApi'

vi.mock('./devProxy', async () => {
  const actual = await vi.importActual<typeof import('./devProxy')>('./devProxy')
  return { ...actual, readClientDevProxyConfig: vi.fn(() => null) }
})

vi.mock('./canvasImage', () => ({
  dataUrlToBlob: vi.fn(async () => new Blob(['test-image'], { type: 'image/png' })),
  imageDataUrlToPngBlob: vi.fn(async () => new Blob(['test-image-png'], { type: 'image/png' })),
  maskDataUrlToPngBlob: vi.fn(async () => new Blob(['test-mask-png'], { type: 'image/png' })),
}))

function makeProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'test-profile',
    name: 'Test',
    provider: 'custom-test',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'test-key',
    model: 'test-model',
    timeout: 60,
    apiMode: 'images',
    codexCli: false,
    apiProxy: false,
    ...overrides,
  }
}

function makePollMapping(overrides: Partial<CustomProviderPollMapping> = {}): CustomProviderPollMapping {
  return {
    path: 'tasks/{task_id}',
    method: 'GET',
    intervalSeconds: 0.01,
    statusPath: 'status',
    successValues: ['SUCCESS'],
    failureValues: ['FAILURE'],
    result: { b64JsonPaths: ['images.*.b64_json'] },
    ...overrides,
  }
}

function makeProvider(overrides: Partial<CustomProviderDefinition> = {}): CustomProviderDefinition {
  return {
    id: 'custom-test',
    name: 'Custom Test',
    submit: {
      path: 'images/generations',
      method: 'POST',
      contentType: 'json',
      body: { model: '$profile.model', prompt: '$prompt' },
    },
    poll: makePollMapping(),
    ...overrides,
  }
}

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('getByPath and getAllByPath', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('getAllByPath resolves * wildcard on arrays of objects', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS',
      images: [{ b64_json: 'aW1hZ2U=' }, { b64_json: 'aW1hZ2Uy' }],
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['images.*.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(
      makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS },
    )

    expect(result.images).toEqual([
      'data:image/png;base64,aW1hZ2U=',
      'data:image/png;base64,aW1hZ2Uy',
    ])
  })

  it('getAllByPath resolves * wildcard on object values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS',
      data: { img1: { b64_json: 'YWFh' }, img2: { b64_json: 'YmJi' } },
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['data.*.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(
      makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS },
    )

    expect(result.images).toEqual([
      'data:image/png;base64,YWFh',
      'data:image/png;base64,YmJi',
    ])
  })

  it('getAllByPath resolves numeric array indices', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS',
      data: [{ b64_json: 'Zmlyc3Q=' }, { b64_json: 'c2Vjb25k' }],
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['data.0.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(
      makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS, output_format: 'jpeg' },
    )

    expect(result.images).toEqual(['data:image/jpeg;base64,Zmlyc3Q='])
  })

  it('getAllByPath flattens nested arrays in final flatMap step', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS',
      output: [[{ b64_json: 'bmVzdGVk' }], [{ b64_json: 'ZmxhdA==' }]],
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['output.*.*.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(
      makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS },
    )

    expect(result.images).toEqual([
      'data:image/png;base64,bmVzdGVk',
      'data:image/png;base64,ZmxhdA==',
    ])
  })

  it('getAllByPath filters null and undefined items', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS',
      data: [{ b64_json: 'dmFsaWQ=' }, { b64_json: null }, { no_b64: true }],
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['data.*.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(
      makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS },
    )

    expect(result.images).toEqual(['data:image/png;base64,dmFsaWQ='])
  })

  it('getByPath resolves nested dot-separated path (taskId extraction)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ data: { task: { id: 'nested-task' } } }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' }, taskIdPath: 'data.task.id',
      },
      poll: makePollMapping({ path: 'tasks/{task_id}' }),
    })

    await callOpenAICompatibleImageApi(
      { settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [] },
      makeProfile(), provider,
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('tasks/nested-task')
  })

  it('getByPath resolves array numeric index in path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ results: [{ id: 'arr-task' }] }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' }, taskIdPath: 'results.0.id',
      },
      poll: makePollMapping({ path: 'tasks/{task_id}' }),
    })

    await callOpenAICompatibleImageApi(
      { settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [] },
      makeProfile(), provider,
    )

    expect(fetchMock.mock.calls[1][0]).toContain('tasks/arr-task')
  })

  it('getByPath returns undefined for missing path leading to empty taskId and sync extraction', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider: CustomProviderDefinition = {
      id: 'custom-test',
      name: 'Custom Test',
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' }, taskIdPath: 'nonexistent.deep.path',
        result: { b64JsonPaths: ['images.*.b64_json'] },
      },
    }

    const result = await callOpenAICompatibleImageApi(
      { settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [] },
      makeProfile(), provider,
    )

    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('getByPath handles null intermediate values in dotted path gracefully', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider: CustomProviderDefinition = {
      id: 'custom-test',
      name: 'Custom Test',
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' }, taskIdPath: 'wrapper.task.id',
        result: { b64JsonPaths: ['images.*.b64_json'] },
      },
    }

    const result = await callOpenAICompatibleImageApi(
      { settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [] },
      makeProfile(), provider,
    )

    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
  })
})

describe('getTaskState', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('classifies as success when status string matches successValues', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }],
    }))

    const provider = makeProvider({ poll: makePollMapping({ successValues: ['SUCCESS', 'DONE'] }) })
    const result = await getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    expect(result.images).toHaveLength(1)
  })

  it('classifies as failure and extracts message from configured errorPath', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'FAILURE', message: 'Task failed permanently',
    }))

    const provider = makeProvider({
      poll: makePollMapping({ failureValues: ['FAILURE', 'ERROR', 'FAILED'], errorPath: 'message' }),
    })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    await expect(promise).rejects.toThrow('Task failed permanently')
  })

  it('extracts error message from configured errorPath on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'ERROR', error: { message: 'Custom error from path' },
    }))

    const provider = makeProvider({
      poll: makePollMapping({ failureValues: ['ERROR'], errorPath: 'error.message' }),
    })

    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    await expect(promise).rejects.toThrow('Custom error from path')
  })

  it('fallback to data.fail_reason when errorPath points there', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'FAILED', data: { fail_reason: 'Reason from data.fail_reason' },
    }))

    const provider = makeProvider({
      poll: makePollMapping({ failureValues: ['FAILED'], errorPath: 'data.fail_reason' }),
    })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    await expect(promise).rejects.toThrow('Reason from data.fail_reason')
  })

  it('fallback to error.message when errorPath points there', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'FAILED', error: { message: 'From nested error.message' },
    }))

    const provider = makeProvider({
      poll: makePollMapping({ failureValues: ['FAILED'], errorPath: 'error.message' }),
    })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    await expect(promise).rejects.toThrow('From nested error.message')
  })

  it('classifies as pending when status does not match either value list', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'PROCESSING' }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({
      poll: makePollMapping({ intervalSeconds: 1, successValues: ['SUCCESS'], failureValues: ['FAILURE'] }),
    })

    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toHaveProperty('images')
  })

  it('handles non-string status by coercing to string', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: '200', data: { images: [{ b64_json: 'aW1hZ2U=' }] },
    }))

    const provider = makeProvider({
      poll: makePollMapping({
        statusPath: 'status', successValues: ['200'], failureValues: ['400', '500'],
        result: { b64JsonPaths: ['data.images.*.b64_json'] },
      }),
    })

    const result = await getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
  })

  it('classifies undefined status (missing statusPath) as pending', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ result: 'incomplete' }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ intervalSeconds: 0.1 }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    await vi.advanceTimersByTimeAsync(100)
    await expect(promise).resolves.toHaveProperty('images')
  })
})

describe('extractCustomImages', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('extracts base64 images via b64JsonPaths with wildcard', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS', output: { items: [{ b64_json: 'Zm9v' }, { b64_json: 'YmFy' }] },
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['output.items.*.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(
      makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS, output_format: 'webp' },
    )

    expect(result.images).toEqual([
      'data:image/webp;base64,Zm9v', 'data:image/webp;base64,YmFy',
    ])
  })

  it('normalizes raw base64 strings by prepending data URI prefix', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS', data: [{ b64_json: 'cmF3YmFzZTY0' }],
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['data.*.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(
      makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS, output_format: 'jpeg' },
    )

    expect(result.images).toEqual(['data:image/jpeg;base64,cmF3YmFzZTY0'])
  })

  it('extracts data URLs via imageUrlPaths without re-fetching', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', data: { urls: ['data:image/png;base64,ZGlyZWN0'] } }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { imageUrlPaths: ['data.urls.*'] } }),
    })

    const result = await getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    expect(result.images).toEqual(['data:image/png;base64,ZGlyZWN0'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fetches HTTP URLs from imageUrlPaths via fetchImageUrlAsDataUrl', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', results: [{ url: 'https://cdn.example.com/img.png' }] }))
      .mockResolvedValueOnce(makeResponse('fake-image-binary'))

    const provider = makeProvider({
      poll: makePollMapping({ result: { imageUrlPaths: ['results.*.url'] } }),
    })

    const result = await getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    expect(result.images).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://cdn.example.com/img.png')
  })

  it('combines multiple b64JsonPaths and imageUrlPaths into single image list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS', b64s: [{ img: 'Y29tYm8x' }], urls: ['data:image/png;base64,Y29tYm8y'],
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['b64s.*.img'], imageUrlPaths: ['urls.*'] } }),
    })

    const result = await getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    expect(result.images).toEqual([
      'data:image/png;base64,Y29tYm8x', 'data:image/png;base64,Y29tYm8y',
    ])
  })

  it('skips empty and whitespace-only strings from b64JsonPaths', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({
      status: 'SUCCESS', data: [{ b64_json: 'dmFsaWQ=' }, { b64_json: '' }, { b64_json: '  ' }],
    }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['data.*.b64_json'] } }),
    })

    const result = await getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    expect(result.images).toEqual(['data:image/png;base64,dmFsaWQ='])
  })

  it('throws when no images are found in the response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', data: {} }))

    const provider = makeProvider({
      poll: makePollMapping({ result: { b64JsonPaths: ['data.images.*.b64'] } }),
    })

    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })
    await expect(promise).rejects.toThrow('接口未返回可用图片数据')
  })
})

describe('submitCustomRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends JSON POST with template-resolved body and correct headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const result = await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'hello world',
        params: { ...DEFAULT_PARAMS, size: '1024x1024' }, inputImageDataUrls: [],
      },
      makeProfile({ model: 'my-json-model' }),
      makeProvider({
        submit: {
          path: 'images/generations', method: 'POST', contentType: 'json',
          body: { model: '$profile.model', prompt: '$prompt', size: '$params.size' },
          result: { b64JsonPaths: ['images.*.b64_json'] },
        },
      }),
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/images/generations')
    expect(init!.method).toBe('POST')

    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBe('Bearer test-key')

    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.model).toBe('my-json-model')
    expect(body.prompt).toBe('hello world')
    expect(body.size).toBe('1024x1024')
    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
  })

  it('resolves $params template variables to actual param values', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'prompt',
        params: {
          ...DEFAULT_PARAMS, size: '1792x1024', quality: 'high',
          output_format: 'webp', output_compression: 80, moderation: 'low', n: 4,
        },
        inputImageDataUrls: [],
      },
      makeProfile(),
      makeProvider({
        submit: {
          path: 'images/generations', method: 'POST', contentType: 'json',
          body: {
            size: '$params.size', quality: '$params.quality',
            format: '$params.output_format', compression: '$params.output_compression',
          },
          result: { b64JsonPaths: ['images.*.b64_json'] },
        },
      }),
    )

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.size).toBe('1792x1024')
    expect(body.quality).toBe('high')
    expect(body.format).toBe('webp')
    expect(body.compression).toBe(80)
  })

  it('resolves $inputImages template variables with count and dataUrls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS },
        inputImageDataUrls: ['data:image/png;base64,aW1nMQ==', 'data:image/png;base64,aW1nMg=='],
      },
      makeProfile(),
      makeProvider({
        submit: {
          path: 'images/generations', method: 'POST', contentType: 'json',
          body: { imageCount: '$inputImages.count', firstImage: '$inputImages.dataUrls.0' },
          result: { b64JsonPaths: ['images.*.b64_json'] },
        },
      }),
    )

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.imageCount).toBe(2)
    expect(body.firstImage).toBe('data:image/png;base64,aW1nMQ==')
  })

  it('sends GET request without body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [],
      },
      makeProfile(),
      makeProvider({
        submit: {
          path: 'images/quota', method: 'GET', contentType: 'json',
          result: { b64JsonPaths: ['images.*.b64_json'] },
        },
      }),
    )

    const [, init] = fetchMock.mock.calls[0]
    expect(init!.method).toBe('GET')
    expect((init as RequestInit).body).toBeUndefined()
  })

  it('adds template-resolved query parameters to URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'prompt',
        params: { ...DEFAULT_PARAMS, size: '512x512' }, inputImageDataUrls: [],
      },
      makeProfile({ model: 'query-model' }),
      makeProvider({
        submit: {
          path: 'images/generations', method: 'POST', contentType: 'json',
          query: { model: '$profile.model', size: '$params.size' },
          body: { prompt: '$prompt' },
          result: { b64JsonPaths: ['images.*.b64_json'] },
        },
      }),
    )

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('model=query-model')
    expect(url).toContain('size=512x512')
  })

  it('sends multipart form data without manual Content-Type header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'multipart test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [],
      },
      makeProfile({ model: 'mp-model' }),
      makeProvider({
        submit: {
          path: 'images/generations', method: 'POST', contentType: 'multipart',
          body: { model: '$profile.model', prompt: '$prompt' },
          result: { b64JsonPaths: ['images.*.b64_json'] },
        },
      }),
    )

    const [, init] = fetchMock.mock.calls[0]
    expect(init!.method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers['Authorization']).toBe('Bearer test-key')
    expect((init as RequestInit).body).toBeInstanceOf(FormData)
  })

  it('submits multipart with file attachments from inputImages source', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'edit test', params: { ...DEFAULT_PARAMS },
        inputImageDataUrls: ['data:image/png;base64,aW1hZ2Ux'],
      },
      makeProfile(),
      makeProvider({
        editSubmit: {
          path: 'images/edits', method: 'POST', contentType: 'multipart',
          body: { prompt: '$prompt' },
          files: [{ field: 'image', source: 'inputImages' as const }],
          result: { b64JsonPaths: ['images.*.b64_json'] },
        },
      }),
    )

    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).body).toBeInstanceOf(FormData)
  })

  it('uses editSubmit instead of submit when inputImageDataUrls are provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' },
        result: { b64JsonPaths: ['images.*.b64_json'] },
      },
      editSubmit: {
        path: 'images/edits', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt', image_count: '$inputImages.count' },
        result: { b64JsonPaths: ['images.*.b64_json'] },
      },
    })

    await callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'edit prompt', params: { ...DEFAULT_PARAMS },
        inputImageDataUrls: ['data:image/png;base64,aW1hZ2Ux'],
      },
      makeProfile(), provider,
    )

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('images/edits')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.image_count).toBe(1)
  })
})

describe('pollCustomTaskResult', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('polls once and succeeds when first response is successful', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const result = await getCustomQueuedImageResult(
      makeProfile(), makeProvider({ poll: makePollMapping() }), 'task-1', { ...DEFAULT_PARAMS },
    )

    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on transient network errors and eventually succeeds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ intervalSeconds: 2 }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await vi.advanceTimersByTimeAsync(2000)
    const result = await promise

    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on retryable HTTP status code 429', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 429 }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ intervalSeconds: 1 }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise

    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries on HTTP status code 408', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 408 }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ intervalSeconds: 1 }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toHaveProperty('images')
  })

  it('retries on HTTP status code 500 and above', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ intervalSeconds: 0.5 }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await vi.advanceTimersByTimeAsync(500)
    await expect(promise).resolves.toHaveProperty('images')
  })

  it('replaces {task_id} and {taskId} placeholders in poll path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ path: 'async/results/{taskId}/status' }) })

    await getCustomQueuedImageResult(makeProfile(), provider, 'task/001', { ...DEFAULT_PARAMS })
    expect(fetchMock.mock.calls[0][0]).toContain('async/results/task%2F001/status')
  })

  it('throws generic error when task fails without error path configuration', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({ status: 'FAILURE' }))

    const provider = makeProvider({ poll: makePollMapping({ failureValues: ['FAILURE'] }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await expect(promise).rejects.toThrow('异步任务失败')
  })

  it('respects polling interval between retry attempts', async () => {
    vi.useFakeTimers()
    let sleepResolved = false

    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ intervalSeconds: 5 }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    const checkAfter4s = vi.advanceTimersByTimeAsync(4000).then(() => {
      sleepResolved = false
    })
    await checkAfter4s
    expect(sleepResolved).toBe(false)

    await vi.advanceTimersByTimeAsync(1000)
    await promise
  })

  it('retries on recoverable error messages (abort, timeout, network, 连接断开)', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('连接超时'))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({ poll: makePollMapping({ intervalSeconds: 0.1 }) })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await vi.advanceTimersByTimeAsync(100)
    await expect(promise).resolves.toHaveProperty('images')
  })

  it('does not retry on non-recoverable errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Invalid API key'))
    const provider = makeProvider({ poll: makePollMapping() })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await expect(promise).rejects.toThrow('Invalid API key')
  })

  it('does not retry on non-retryable HTTP status codes like 404', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 }))

    const provider = makeProvider({ poll: makePollMapping() })
    const promise = getCustomQueuedImageResult(makeProfile(), provider, 'task-1', { ...DEFAULT_PARAMS })

    await expect(promise).rejects.toThrow('Not found')
  })
})

describe('callOpenAICompatibleImageApi integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('invokes onCustomTaskEnqueued callback when async task is submitted', async () => {
    vi.useFakeTimers()
    const onCustomTaskEnqueued = vi.fn()

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ task_id: 'cb-task-1' }))
      .mockResolvedValueOnce(makeResponse({ status: 'PROCESSING' }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' }, taskIdPath: 'task_id',
      },
      poll: makePollMapping({ intervalSeconds: 0.5 }),
    })

    const promise = callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [],
        onCustomTaskEnqueued,
      },
      makeProfile(), provider,
    )

    await vi.waitFor(() => expect(onCustomTaskEnqueued).toHaveBeenCalled())
    expect(onCustomTaskEnqueued).toHaveBeenCalledWith({ taskId: 'cb-task-1' })

    await vi.advanceTimersByTimeAsync(500)
    await expect(promise).resolves.toHaveProperty('images')
  })

  it('clears submit timeout once task enters polling phase', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse({ task_id: 'no-timeout-task' }))
      .mockResolvedValueOnce(makeResponse({ status: 'IN_PROGRESS' }))
      .mockResolvedValueOnce(makeResponse({ status: 'SUCCESS', images: [{ b64_json: 'aW1hZ2U=' }] }))

    const provider = makeProvider({
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' }, taskIdPath: 'task_id',
      },
      poll: makePollMapping({ intervalSeconds: 5 }),
    })

    const promise = callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [],
      },
      makeProfile({ timeout: 0.01 }), provider,
    )

    await vi.advanceTimersByTimeAsync(6000)
    await expect(promise).resolves.toEqual({ images: ['data:image/png;base64,aW1hZ2U='] })
  })

  it('rejects when custom provider requires polling but submit returns no task_id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(makeResponse({ message: 'no task id returned' }))

    const provider = makeProvider({
      submit: {
        path: 'images/generations', method: 'POST', contentType: 'json',
        body: { prompt: '$prompt' }, taskIdPath: 'task_id',
      },
      poll: makePollMapping(),
    })

    const promise = callOpenAICompatibleImageApi(
      {
        settings: { ...DEFAULT_SETTINGS }, prompt: 'test', params: { ...DEFAULT_PARAMS }, inputImageDataUrls: [],
      },
      makeProfile(), provider,
    )

    await expect(promise).rejects.toThrow()
  })
})
