import { describe, expect, it } from 'vitest'
import {
  isHttpUrl,
  isDataUrl,
  normalizeBase64Image,
  getDataUrlEncodedByteSize,
  getDataUrlDecodedByteSize,
  assertImageInputPayloadSize,
  assertMaskEditFileSize,
  pickActualParams,
  mergeActualParams,
  MAX_MASK_EDIT_FILE_BYTES,
  MAX_IMAGE_INPUT_PAYLOAD_BYTES,
} from './imageApiShared'

describe('isHttpUrl', () => {
  it('returns true for http URLs', () => {
    expect(isHttpUrl('http://example.com')).toBe(true)
  })

  it('returns true for https URLs', () => {
    expect(isHttpUrl('https://example.com/path')).toBe(true)
  })

  it('returns false for non-URL strings', () => {
    expect(isHttpUrl('not-a-url')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isHttpUrl('')).toBe(false)
  })

  it('returns false for data URLs', () => {
    expect(isHttpUrl('data:image/png;base64,abc')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(isHttpUrl(null)).toBe(false)
    expect(isHttpUrl(undefined)).toBe(false)
    expect(isHttpUrl(123)).toBe(false)
  })
})

describe('isDataUrl', () => {
  it('returns true for data URLs', () => {
    expect(isDataUrl('data:image/png;base64,abc')).toBe(true)
    expect(isDataUrl('data:text/plain,hello')).toBe(true)
  })

  it('returns false for http URLs', () => {
    expect(isDataUrl('http://example.com')).toBe(false)
  })

  it('returns false for non-string values', () => {
    expect(isDataUrl(null)).toBe(false)
    expect(isDataUrl(undefined)).toBe(false)
  })
})

describe('normalizeBase64Image', () => {
  it('returns data URL unchanged', () => {
    expect(normalizeBase64Image('data:image/png;base64,abc', 'image/png')).toBe('data:image/png;base64,abc')
  })

  it('wraps raw base64 with data URL prefix', () => {
    expect(normalizeBase64Image('abc123', 'image/png')).toBe('data:image/png;base64,abc123')
  })
})

describe('getDataUrlEncodedByteSize', () => {
  it('returns string length of data URL', () => {
    expect(getDataUrlEncodedByteSize('data:,hello')).toBe(11)
  })
})

describe('getDataUrlDecodedByteSize', () => {
  it('decodes base64 data URL size', () => {
    const result = getDataUrlDecodedByteSize('data:image/png;base64,YQ==')
    expect(result).toBe(1)
  })

  it('handles non-base64 data URLs', () => {
    const result = getDataUrlDecodedByteSize('data:text/plain,hello')
    expect(result).toBe(5)
  })

  it('returns dataUrl length when no comma found', () => {
    const result = getDataUrlDecodedByteSize('nodataurl')
    expect(result).toBe(9)
  })

  it('handles base64 padding correctly', () => {
    const r1 = getDataUrlDecodedByteSize('data:;base64,YQ==')
    const r2 = getDataUrlDecodedByteSize('data:;base64,YWI=')
    expect(r1).toBe(1)
    expect(r2).toBe(2)
  })
})

describe('assertImageInputPayloadSize', () => {
  it('does not throw when bytes are within limit', () => {
    expect(() => assertImageInputPayloadSize(100)).not.toThrow()
  })

  it('throws when bytes exceed limit', () => {
    expect(() => assertImageInputPayloadSize(MAX_IMAGE_INPUT_PAYLOAD_BYTES + 1)).toThrow(/过大/)
  })
})

describe('assertMaskEditFileSize', () => {
  it('does not throw when bytes are within limit', () => {
    expect(() => assertMaskEditFileSize('test', 100)).not.toThrow()
  })

  it('throws when bytes exceed limit', () => {
    expect(() => assertMaskEditFileSize('test', MAX_MASK_EDIT_FILE_BYTES + 1)).toThrow(/过大/)
  })
})

describe('pickActualParams', () => {
  it('returns empty object for non-object input', () => {
    expect(pickActualParams(null)).toEqual({})
    expect(pickActualParams(undefined)).toEqual({})
    expect(pickActualParams('string')).toEqual({})
  })

  it('extracts known param fields', () => {
    expect(pickActualParams({
      size: '1024x1024',
      quality: 'high',
      output_format: 'png',
      output_compression: 80,
      moderation: 'auto',
      n: 4,
    })).toEqual({
      size: '1024x1024',
      quality: 'high',
      output_format: 'png',
      output_compression: 80,
      moderation: 'auto',
      n: 4,
    })
  })

  it('ignores invalid quality values', () => {
    expect(pickActualParams({ quality: 'invalid' })).toEqual({})
  })

  it('accepts valid quality values', () => {
    expect(pickActualParams({ quality: 'auto' })).toEqual({ quality: 'auto' })
    expect(pickActualParams({ quality: 'low' })).toEqual({ quality: 'low' })
    expect(pickActualParams({ quality: 'medium' })).toEqual({ quality: 'medium' })
    expect(pickActualParams({ quality: 'high' })).toEqual({ quality: 'high' })
  })

  it('ignores invalid output_format values', () => {
    expect(pickActualParams({ output_format: 'bmp' })).toEqual({})
  })

  it('accepts valid output_format values', () => {
    expect(pickActualParams({ output_format: 'png' })).toEqual({ output_format: 'png' })
    expect(pickActualParams({ output_format: 'jpeg' })).toEqual({ output_format: 'jpeg' })
    expect(pickActualParams({ output_format: 'webp' })).toEqual({ output_format: 'webp' })
  })

  it('ignores invalid moderation values', () => {
    expect(pickActualParams({ moderation: 'high' })).toEqual({})
  })

  it('accepts valid moderation values', () => {
    expect(pickActualParams({ moderation: 'auto' })).toEqual({ moderation: 'auto' })
    expect(pickActualParams({ moderation: 'low' })).toEqual({ moderation: 'low' })
  })
})

describe('mergeActualParams', () => {
  it('returns undefined for empty sources', () => {
    expect(mergeActualParams()).toBeUndefined()
    expect(mergeActualParams({})).toBeUndefined()
    expect(mergeActualParams(undefined, {})).toBeUndefined()
  })

  it('returns the single source when only one', () => {
    expect(mergeActualParams({ size: '1024x1024' })).toEqual({ size: '1024x1024' })
  })

  it('merges multiple sources with later overriding earlier', () => {
    expect(mergeActualParams(
      { size: '1024x1024', quality: 'auto' },
      { size: '2048x2048' },
    )).toEqual({ size: '2048x2048', quality: 'auto' })
  })

  it('skips undefined and empty sources', () => {
    expect(mergeActualParams(
      undefined,
      {},
      { size: '1024x1024' },
      undefined,
    )).toEqual({ size: '1024x1024' })
  })
})
