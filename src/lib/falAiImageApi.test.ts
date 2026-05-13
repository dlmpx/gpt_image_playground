import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fal } from '@fal-ai/client'
import { callFalAiImageApi, getFalErrorMessage, getFalQueuedImageResult } from './falAiImageApi'
import * as imageApiShared from './imageApiShared'
import { DEFAULT_PARAMS } from '../types'
import type { ApiProfile, AppSettings, FalApiResponse, TaskParams } from '../types'
import type { CallApiOptions } from './imageApiShared'

vi.mock('@fal-ai/client', () => ({
  fal: {
    config: vi.fn(),
    subscribe: vi.fn(),
    queue: {
      subscribeToStatus: vi.fn(),
      result: vi.fn(),
    },
  },
}))

vi.mock('./imageApiShared', async () => {
  const actual = await vi.importActual<typeof import('./imageApiShared')>('./imageApiShared')
  return {
    ...actual,
    getDataUrlEncodedByteSize: vi.fn((dataUrl: string) => actual.getDataUrlEncodedByteSize(dataUrl)),
    getDataUrlDecodedByteSize: vi.fn((dataUrl: string) => actual.getDataUrlDecodedByteSize(dataUrl)),
  }
})

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const SAMPLE_DATA_URL = `data:image/png;base64,${PNG_BASE64}`

function createTestProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'test-fal-profile',
    name: 'Test FAL',
    provider: 'fal',
    baseUrl: 'https://fal.run',
    apiKey: 'test-fal-key',
    model: 'openai/gpt-image-2',
    timeout: 600,
    apiMode: 'images',
    codexCli: false,
    apiProxy: false,
    ...overrides,
  }
}

function createTestSettings(): AppSettings {
  return {
    baseUrl: '',
    apiKey: '',
    model: '',
    timeout: 600,
    apiMode: 'images',
    codexCli: false,
    apiProxy: false,
    customProviders: [],
    clearInputAfterSubmit: false,
    persistInputOnRestart: true,
    reuseTaskApiProfileTemporarily: false,
    alwaysShowRetryButton: false,
    profiles: [],
    activeProfileId: '',
  }
}

function createTestOptions(overrides: Partial<CallApiOptions> = {}): CallApiOptions {
  return {
    settings: createTestSettings(),
    prompt: 'a beautiful landscape',
    params: { ...DEFAULT_PARAMS },
    inputImageDataUrls: [],
    ...overrides,
  }
}

function createTestParams(overrides: Partial<TaskParams> = {}): TaskParams {
  return { ...DEFAULT_PARAMS, ...overrides }
}

function pngBlob(): Blob {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: 'image/png' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getFalErrorMessage', () => {
  it('extracts detail string from error body', () => {
    const err = { body: { detail: '请求参数无效' } }
    expect(getFalErrorMessage(err)).toBe('请求参数无效')
  })

  it('extracts English detail string', () => {
    const err = { body: { detail: 'Invalid request parameters' } }
    expect(getFalErrorMessage(err)).toBe('Invalid request parameters')
  })

  it('joins detail array of strings with newline', () => {
    const err = { body: { detail: ['错误一', '错误二', '错误三'] } }
    expect(getFalErrorMessage(err)).toBe('错误一\n错误二\n错误三')
  })

  it('extracts msg fields from detail array of objects', () => {
    const err = {
      body: {
        detail: [
          { msg: '参数缺失' },
          { msg: '格式错误' },
        ],
      },
    }
    expect(getFalErrorMessage(err)).toBe('参数缺失\n格式错误')
  })

  it('extracts message fields from detail array of objects', () => {
    const err = {
      body: {
        detail: [
          { message: 'Missing required field' },
          { message: 'Invalid format' },
        ],
      },
    }
    expect(getFalErrorMessage(err)).toBe('Missing required field\nInvalid format')
  })

  it('handles mixed detail array with strings and objects', () => {
    const err = {
      body: {
        detail: [
          '通用错误',
          { msg: '字段错误' },
          { message: 'Network error' },
          null,
          undefined,
        ],
      },
    }
    expect(getFalErrorMessage(err)).toBe('通用错误\n字段错误\nNetwork error')
  })

  it('skips empty msg and message entries in detail array', () => {
    const err = {
      body: {
        detail: [
          { msg: '' },
          { msg: '有效消息' },
          { message: '   ' },
          { msg: '另一条消息' },
        ],
      },
    }
    expect(getFalErrorMessage(err)).toBe('有效消息\n另一条消息')
  })

  it('falls back to body.message when detail is absent', () => {
    const err = { body: { message: '服务暂时不可用' } }
    expect(getFalErrorMessage(err)).toBe('服务暂时不可用')
  })

  it('returns null for null body', () => {
    const err = { body: null }
    expect(getFalErrorMessage(err)).toBeNull()
  })

  it('returns null for non-object body', () => {
    const err = { body: 'string body' }
    expect(getFalErrorMessage(err)).toBeNull()
  })

  it('returns null when error has no body property', () => {
    const err = { message: 'plain error' }
    expect(getFalErrorMessage(err)).toBeNull()
  })

  it('returns null for non-object error', () => {
    expect(getFalErrorMessage('string error')).toBeNull()
    expect(getFalErrorMessage(null)).toBeNull()
    expect(getFalErrorMessage(undefined)).toBeNull()
  })

  it('returns null when body has no message fields', () => {
    const err = { body: { code: 500 } }
    expect(getFalErrorMessage(err)).toBeNull()
  })

  it('returns null when detail is empty string', () => {
    const err = { body: { detail: '' } }
    expect(getFalErrorMessage(err)).toBeNull()
  })

  it('returns null when body.message is empty', () => {
    const err = { body: { message: '' } }
    expect(getFalErrorMessage(err)).toBeNull()
  })

  it('returns null when detail array has only empty entries', () => {
    const err = { body: { detail: [{ msg: '' }, { msg: '  ' }] } }
    expect(getFalErrorMessage(err)).toBeNull()
  })
})

describe('getFalQueuedImageResult', () => {
  const REQUEST_ID = 'test-request-id'
  const ENDPOINT = 'openai/gpt-image-2'

  it('configures fal with profile credentials and polls for result', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: { images: [{ b64_json: PNG_BASE64 }] },
      requestId: REQUEST_ID,
    } as any)

    const profile = createTestProfile()
    await getFalQueuedImageResult(profile, ENDPOINT, REQUEST_ID, createTestParams())

    expect(fal.config).toHaveBeenCalledWith({
      credentials: profile.apiKey,
      suppressLocalCredentialsWarning: true,
    })
    expect(fal.queue.subscribeToStatus).toHaveBeenCalledWith(ENDPOINT, {
      requestId: REQUEST_ID,
      logs: true,
    })
    expect(fal.queue.result).toHaveBeenCalledWith(ENDPOINT, {
      requestId: REQUEST_ID,
    })
  })

  it('returns parsed images from images array with size info', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [
          { b64_json: PNG_BASE64, width: 1024, height: 768 },
        ],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toEqual([SAMPLE_DATA_URL])
    expect(result.actualParams).toEqual({ size: '1024x768' })
    expect(result.actualParamsList).toEqual([{ size: '1024x768' }])
    expect(result.revisedPrompts).toEqual([undefined])
  })

  it('parses image field as FalImageFile object', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        image: { b64_json: PNG_BASE64 },
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toEqual([SAMPLE_DATA_URL])
  })

  it('parses image field as plain data URL string', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: { image: SAMPLE_DATA_URL }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toEqual([SAMPLE_DATA_URL])
  })

  it('parses image field as plain base64 string', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: { image: PNG_BASE64 }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toEqual([SAMPLE_DATA_URL])
  })

  it('parses url field as HTTP URL by fetching it', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: { url: 'https://example.com/result.png' }, requestId: REQUEST_ID } as any)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(pngBlob(), { status: 200 }))

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toMatch(/^data:image\/png;base64,/)
  })

  it('parses object with url field as HTTP URL', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        image: { url: 'https://example.com/img.png' },
      }, requestId: REQUEST_ID } as any)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(pngBlob(), { status: 200 }))

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toHaveLength(1)
    expect(result.images[0]).toMatch(/^data:image\/png;base64,/)
  })

  it('parses base64 field from image object', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [{ base64: PNG_BASE64 }],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toEqual([SAMPLE_DATA_URL])
  })

  it('parses data field from image object', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [{ data: PNG_BASE64 }],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toEqual([SAMPLE_DATA_URL])
  })

  it('extracts actualParams from multiple images with width/height', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [
          { b64_json: PNG_BASE64, width: 1360, height: 1024 },
          { b64_json: PNG_BASE64, width: 512, height: 512 },
        ],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toHaveLength(2)
    expect(result.actualParams).toEqual({ size: '1360x1024' })
    expect(result.actualParamsList).toEqual([{ size: '1360x1024' }, { size: '512x512' }])
  })

  it('omits actualParams when image has no size info', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [{ b64_json: PNG_BASE64 }],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.actualParams).toBeUndefined()
    expect(result.actualParamsList).toEqual([undefined])
  })

  it('throws when payload has no extractable images', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: { seed: 12345 }, requestId: REQUEST_ID } as any)

    await expect(
      getFalQueuedImageResult(createTestProfile(), ENDPOINT, REQUEST_ID, createTestParams()),
    ).rejects.toThrow('fal.ai 未返回可用图片数据')
  })

  it('returns revisedPrompts as undefined for all images', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [
          { b64_json: PNG_BASE64 },
          { b64_json: PNG_BASE64 },
          { b64_json: PNG_BASE64 },
        ],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.revisedPrompts).toEqual([undefined, undefined, undefined])
  })

  it('skips null values from readFalImageValue when candidate has no image data', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [
          { width: 100, height: 100 },
          { b64_json: PNG_BASE64 },
        ],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams(),
    )

    expect(result.images).toEqual([SAMPLE_DATA_URL])
  })

  it('respects jpeg output_format for fallback mime', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [{ b64_json: PNG_BASE64 }],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams({ output_format: 'jpeg' }),
    )

    expect(result.images[0]).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('defaults fallback mime to image/png for unknown output_format', async () => {
    vi.mocked(fal.queue.subscribeToStatus).mockResolvedValue({ status: 'COMPLETED', logs: [] } as any)
    vi.mocked(fal.queue.result).mockResolvedValue({
      data: {
        images: [{ data: PNG_BASE64 }],
      }, requestId: REQUEST_ID } as any)

    const result = await getFalQueuedImageResult(
      createTestProfile(),
      ENDPOINT,
      REQUEST_ID,
      createTestParams({ output_format: 'unknown' as TaskParams['output_format'] }),
    )

    expect(result.images[0]).toMatch(/^data:image\/png;base64,/)
  })
})

describe('callFalAiImageApi', () => {
  function mockFalSubscribeSuccess(responseData: FalApiResponse, requestId = 'req-001') {
    vi.mocked(fal.subscribe).mockResolvedValue({
      data: responseData,
      requestId,
    })
  }

  it('submits text-to-image request and returns parsed result', async () => {
    mockFalSubscribeSuccess({
      images: [{ b64_json: PNG_BASE64, width: 1024, height: 768 }],
    })

    const result = await callFalAiImageApi(
      createTestOptions({ inputImageDataUrls: [] }),
      createTestProfile(),
    )

    expect(fal.config).toHaveBeenCalledWith({
      credentials: 'test-fal-key',
      suppressLocalCredentialsWarning: true,
    })
    expect(fal.subscribe).toHaveBeenCalledWith(
      'openai/gpt-image-2',
      expect.objectContaining({
        input: expect.objectContaining({ prompt: 'a beautiful landscape' }),
        logs: true,
      }),
    )
    expect(result.images).toEqual([SAMPLE_DATA_URL])
    expect(result.actualParams).toEqual({ size: '1024x768' })
  })

  it('submits image edit request with input images', async () => {
    mockFalSubscribeSuccess({
      images: [{ b64_json: PNG_BASE64 }],
    })

    await callFalAiImageApi(
      createTestOptions({ inputImageDataUrls: [SAMPLE_DATA_URL] }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      'openai/gpt-image-2/edit',
      expect.objectContaining({
        input: expect.objectContaining({
          image_urls: [SAMPLE_DATA_URL],
        }),
      }),
    )
  })

  it('submits mask edit request with mask data URL', async () => {
    mockFalSubscribeSuccess({
      images: [{ b64_json: PNG_BASE64 }],
    })

    await callFalAiImageApi(
      createTestOptions({
        inputImageDataUrls: [SAMPLE_DATA_URL],
        maskDataUrl: SAMPLE_DATA_URL,
      }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      'openai/gpt-image-2/edit',
      expect.objectContaining({
        input: expect.objectContaining({
          image_urls: [SAMPLE_DATA_URL],
          mask_url: SAMPLE_DATA_URL,
        }),
      }),
    )
  })

  it('invokes onFalRequestEnqueued callback with requestId and endpoint', async () => {
    const onEnqueued = vi.fn()
    mockFalSubscribeSuccess({
      images: [{ b64_json: PNG_BASE64 }],
    })

    await callFalAiImageApi(
      createTestOptions({ onFalRequestEnqueued: onEnqueued }),
      createTestProfile(),
    )

    expect(onEnqueued).toHaveBeenCalledWith({
      requestId: 'req-001',
      endpoint: 'openai/gpt-image-2',
    })
  })

  it('does not append /edit when endpoint already ends with /edit', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    const profile = createTestProfile({ model: 'custom-model/edit' })
    await callFalAiImageApi(
      createTestOptions({ inputImageDataUrls: [SAMPLE_DATA_URL] }),
      profile,
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      'custom-model/edit',
      expect.any(Object),
    )
  })

  it('sets image_size to auto for edit mode when params.size is auto', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    await callFalAiImageApi(
      createTestOptions({
        inputImageDataUrls: [SAMPLE_DATA_URL],
        params: createTestParams({ size: 'auto' }),
      }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({ image_size: 'auto' }),
      }),
    )
  })

  it('maps explicit size to dimensions for text-to-image', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    await callFalAiImageApi(
      createTestOptions({
        inputImageDataUrls: [],
        params: createTestParams({ size: '512x512' }),
      }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({ image_size: { width: 512, height: 512 } }),
      }),
    )
  })

  it('throws with Chinese fal error message on API error', async () => {
    vi.mocked(fal.subscribe).mockRejectedValue({
      body: { detail: '账户余额不足，请充值后重试' },
    })

    await expect(
      callFalAiImageApi(createTestOptions(), createTestProfile()),
    ).rejects.toThrow('账户余额不足，请充值后重试')
  })

  it('throws with English fal error message on API error', async () => {
    vi.mocked(fal.subscribe).mockRejectedValue({
      body: { message: 'Rate limit exceeded' },
    })

    await expect(
      callFalAiImageApi(createTestOptions(), createTestProfile()),
    ).rejects.toThrow('Rate limit exceeded')
  })

  it('rethrows original error when fal message extraction returns null', async () => {
    const originalError = new Error('Network failure')
    vi.mocked(fal.subscribe).mockRejectedValue(originalError)

    await expect(
      callFalAiImageApi(createTestOptions(), createTestProfile()),
    ).rejects.toThrow('Network failure')
  })

  it('asserts mask edit file size for main image when decoded size exceeds 50 MiB', async () => {
    vi.mocked(imageApiShared.getDataUrlDecodedByteSize).mockReturnValue(60 * 1024 * 1024)

    await expect(
      callFalAiImageApi(
        createTestOptions({
          inputImageDataUrls: [SAMPLE_DATA_URL],
          maskDataUrl: SAMPLE_DATA_URL,
        }),
        createTestProfile(),
      ),
    ).rejects.toThrow('过大')
  })

  it('asserts mask edit file size for mask file when decoded size exceeds 50 MiB', async () => {
    vi.mocked(imageApiShared.getDataUrlDecodedByteSize)
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(60 * 1024 * 1024)

    await expect(
      callFalAiImageApi(
        createTestOptions({
          inputImageDataUrls: [SAMPLE_DATA_URL],
          maskDataUrl: SAMPLE_DATA_URL,
        }),
        createTestProfile(),
      ),
    ).rejects.toThrow('过大')
  })

  it('asserts total image input payload size when encoded size exceeds 512 MiB', async () => {
    vi.mocked(imageApiShared.getDataUrlEncodedByteSize).mockReturnValue(513 * 1024 * 1024)

    await expect(
      callFalAiImageApi(
        createTestOptions({ inputImageDataUrls: [SAMPLE_DATA_URL] }),
        createTestProfile(),
      ),
    ).rejects.toThrow('过大')
  })

  it('clamps num_images between 1 and 4', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    await callFalAiImageApi(
      createTestOptions({ params: createTestParams({ n: 10 }) }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({ num_images: 4 }),
      }),
    )
  })

  it('ensures num_images is at least 1', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    await callFalAiImageApi(
      createTestOptions({ params: createTestParams({ n: 0 }) }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({ num_images: 1 }),
      }),
    )
  })

  it('maps quality auto to high for fal API', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    await callFalAiImageApi(
      createTestOptions({ params: createTestParams({ quality: 'auto' }) }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({ quality: 'high' }),
      }),
    )
  })

  it('passes through explicit quality values', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    await callFalAiImageApi(
      createTestOptions({ params: createTestParams({ quality: 'low' }) }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({ quality: 'low' }),
      }),
    )
  })

  it('strips leading and trailing slashes from model name', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    const profile = createTestProfile({ model: '///openai/gpt-image-2///' })
    await callFalAiImageApi(createTestOptions(), profile)

    expect(fal.subscribe).toHaveBeenCalledWith('openai/gpt-image-2', expect.any(Object))
  })

  it('defaults model to openai/gpt-image-2 when model is empty', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    const profile = createTestProfile({ model: '   ' })
    await callFalAiImageApi(createTestOptions(), profile)

    expect(fal.subscribe).toHaveBeenCalledWith('openai/gpt-image-2', expect.any(Object))
  })

  it('passes output_format from params into fal input', async () => {
    mockFalSubscribeSuccess({ images: [{ b64_json: PNG_BASE64 }] })

    await callFalAiImageApi(
      createTestOptions({ params: createTestParams({ output_format: 'jpeg' }) }),
      createTestProfile(),
    )

    expect(fal.subscribe).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        input: expect.objectContaining({ output_format: 'jpeg' }),
      }),
    )
  })
})
