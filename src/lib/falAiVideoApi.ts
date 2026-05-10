import { fal } from '@fal-ai/client'
import type { ApiProfile } from '../types'
import { isHttpUrl, isDataUrl, normalizeBase64Image, MIME_MAP, fetchImageUrlAsDataUrl } from './imageApiShared'

const DEFAULT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v1.6/standard/image-to-video'

/**
 * 将 profile 中的 model 值映射为 FAL 视频端点。
 * - 若 model 含 "kling"（不区分大小写）→ Kling 视频端点
 * - 若 model 含 "runway" 或 "gen3" → Runway Gen-3 视频端点
 * - 否则直接返回 model 原值（允许用户传入完整 FAL endpoint）
 */
export function mapFalVideoEndpoint(model: string): string {
  const normalized = model.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalized) return DEFAULT_FAL_VIDEO_MODEL
  if (/kling/i.test(normalized)) return 'fal-ai/kling-video/v1.6/standard/image-to-video'
  if (/runway|gen3/i.test(normalized)) return 'fal-ai/runway-gen3/turbo/image-to-video'
  return normalized
}

function configureFal(profile: ApiProfile) {
  fal.config({
    credentials: profile.apiKey,
    suppressLocalCredentialsWarning: true,
  })
}

/**
 * 通过 FAL queue API 提交视频生成任务。
 * @returns requestId 和 endpoint，用于后续状态查询和结果获取。
 */
export async function submitFalVideoTask(
  profile: ApiProfile,
  inputImageDataUrl: string,
  prompt?: string,
): Promise<{ requestId: string; endpoint: string }> {
  configureFal(profile)

  const endpoint = mapFalVideoEndpoint(profile.model)
  const input: Record<string, unknown> = {
    image_url: inputImageDataUrl,
    prompt: prompt || '',
  }

  const submitResult = await fal.queue.submit(endpoint, { input })
  return { requestId: submitResult.request_id, endpoint }
}

/**
 * 查询并获取 FAL 视频任务的结果。
 * 视频文件通常较大，返回 https URL 而非 data URL。
 */
export async function getFalVideoResult(
  profile: ApiProfile,
  endpoint: string,
  requestId: string,
): Promise<{ videoUrl: string }> {
  configureFal(profile)

  // 等待任务完成
  await fal.queue.status(endpoint, { requestId, logs: true })

  // 获取结果
  const result = await fal.queue.result(endpoint, { requestId })
  const data = result.data as Record<string, unknown> | undefined

  if (!data) {
    throw new Error('FAL 未返回可用结果数据')
  }

  // 按优先级尝试提取视频 URL
  // FAL 视频结果的常见字段：result.data.video?.url、result.data.video、result.data.url
  const video = data.video
  if (video && typeof video === 'object') {
    const videoObj = video as Record<string, unknown>
    if (typeof videoObj.url === 'string' && (isHttpUrl(videoObj.url) || isDataUrl(videoObj.url))) {
      return { videoUrl: videoObj.url }
    }
  }

  // 尝试 video 字段本身是字符串
  if (typeof video === 'string' && (isHttpUrl(video) || isDataUrl(video))) {
    return { videoUrl: video }
  }

  // 尝试 data.url
  if (typeof data.url === 'string' && (isHttpUrl(data.url) || isDataUrl(data.url))) {
    return { videoUrl: data.url }
  }

  throw new Error('FAL 未返回可用视频')
}

/**
 * 从 FAL 错误对象中提取可读错误信息。
 * 复用与 falAiImageApi.ts 中 getFalErrorMessage 相同的实现（错误消息提取逻辑通用）。
 */
export function getFalVideoErrorMessage(err: unknown): string | null {
  const body = err && typeof err === 'object' && 'body' in err ? (err as { body?: unknown }).body : null
  if (!body || typeof body !== 'object') return null

  const detail = (body as Record<string, unknown>).detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          if (typeof record.msg === 'string' && record.msg.trim()) return record.msg
          if (typeof record.message === 'string' && record.message.trim()) return record.message
        }
        return null
      })
      .filter((message): message is string => Boolean(message))
    if (messages.length) return messages.join('\n')
  }

  const message = (body as Record<string, unknown>).message
  return typeof message === 'string' && message.trim() ? message : null
}
