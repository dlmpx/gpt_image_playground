import { describe, expect, it, vi } from 'vitest'
import { loadImage, getImageDimensions } from './canvasImage'

describe('loadImage', () => {
  it('resolves with image on successful load', async () => {
    const originalImage = globalThis.Image

    class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    globalThis.Image = MockImage as unknown as typeof Image

    const result = await loadImage('data:image/png;base64,fake')
    expect(result).toBeInstanceOf(MockImage)

    globalThis.Image = originalImage
  })

  it('rejects on image load error', async () => {
    const originalImage = globalThis.Image

    class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) {
        setTimeout(() => this.onerror?.(), 0)
      }
    }
    globalThis.Image = MockImage as unknown as typeof Image

    await expect(loadImage('data:image/png;base64,fake')).rejects.toThrow('图片加载失败')

    globalThis.Image = originalImage
  })
})

describe('getImageDimensions', () => {
  it('returns image dimensions', async () => {
    const originalImage = globalThis.Image

    class MockImage {
      naturalWidth = 1920
      naturalHeight = 1080
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    globalThis.Image = MockImage as unknown as typeof Image

    const dims = await getImageDimensions('data:image/png;base64,fake')
    expect(dims).toEqual({ width: 1920, height: 1080 })

    globalThis.Image = originalImage
  })
})
