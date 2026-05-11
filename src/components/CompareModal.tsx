import { useEffect, useState, useRef, useCallback } from 'react'
import {
  useStore,
  getCachedImage,
  ensureImageCached,
  setCandidateDecision,
  applyBatchDecision,
  crossStagePromoteCandidate,
  setShowCompareModal,
  submitVideoTask,
} from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'
import type { WorkflowCandidate, CandidateDecision, WorkflowStage } from '../types'

// ===== Decision 展示映射 =====

const DECISION_LABELS: Record<CandidateDecision, string> = {
  draft: '草稿',
  keep: '保留',
  promoted: '已晋级',
  discarded: '已淘汰',
  favorite: '收藏',
  primary: '主推',
}

const DECISION_DOT_COLORS: Record<CandidateDecision, string> = {
  draft: 'bg-gray-400',
  keep: 'bg-green-400',
  promoted: 'bg-amber-400',
  discarded: 'bg-red-400',
  favorite: 'bg-yellow-400',
  primary: 'bg-blue-400',
}

// ===== 候选卡片子组件 =====

interface CandidateCardProps {
  candidate: WorkflowCandidate
  index: number
  isFocused: boolean
  imageUrl: string | undefined
  loading: boolean
  loadError: boolean
  onFocus: () => void
}

function CandidateCard({ candidate, index, isFocused, imageUrl, loading, loadError, onFocus }: CandidateCardProps) {
  const showToast = useStore((s) => s.showToast)

  const handleDecision = useCallback(async (decision: CandidateDecision) => {
    try {
      await setCandidateDecision(candidate.id, decision)
      showToast(`已标记为${DECISION_LABELS[decision]}`, 'success')
    } catch {
      showToast('决策更新失败', 'error')
    }
  }, [candidate.id, showToast])

  const handlePromote = useCallback(async () => {
    const nextStage = (candidate.stage + 1) as WorkflowStage
    if (nextStage > 4) {
      showToast('已在最终阶段，无法晋级', 'info')
      return
    }
    try {
      await crossStagePromoteCandidate(candidate.id, nextStage)
      showToast(`已晋级到阶段 ${nextStage}`, 'success')
    } catch {
      showToast('晋级失败', 'error')
    }
  }, [candidate.id, candidate.stage, showToast])

  const focusRingClass = isFocused
    ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-black'
    : ''

  return (
    <div
      className={`flex flex-col flex-1 min-w-0 rounded-xl bg-white/5 border border-white/10 overflow-hidden transition-all ${focusRingClass}`}
      onClick={onFocus}
    >
      {/* 图片区域 */}
      <div className="flex-1 relative bg-black/40 flex items-center justify-center min-h-0">
        {loading && !loadError && (
          <svg className="w-10 h-10 text-white/30 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {loadError && (
          <div className="flex flex-col items-center gap-2 text-white/40">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">图片加载失败</span>
          </div>
        )}
        {imageUrl && !loadError && (
          <img
            src={imageUrl}
            data-image-id={candidate.primaryImageId}
            className="saveable-image w-full h-full object-contain"
            alt={`候选 ${index + 1}`}
            draggable={false}
          />
        )}
      </div>

      {/* 信息条 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-black/60">
        {/* Decision 圆点 + 标签 */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${DECISION_DOT_COLORS[candidate.decision]}`} />
          <span className="text-white/70 text-xs truncate">{DECISION_LABELS[candidate.decision]}</span>
        </div>

        {/* 候选编号 */}
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white/10 text-white text-xs font-bold">
          {index + 1}
        </span>

        {/* 阶段标签 */}
        <span className="flex-shrink-0 text-white/50 text-xs">S{candidate.stage}</span>
      </div>

      {/* 决策按钮行 */}
      <div className="flex gap-1.5 px-3 py-2 bg-black/60 border-t border-white/5">
        <button
          onClick={(e) => { e.stopPropagation(); handleDecision('keep') }}
          className="flex-1 text-xs px-2.5 py-1 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 transition"
        >
          保留
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDecision('discarded') }}
          className="flex-1 text-xs px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition"
        >
          淘汰
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDecision('primary') }}
          className="flex-1 text-xs px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition"
        >
          主推
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handlePromote() }}
          className="flex-1 text-xs px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition"
        >
          晋级
        </button>
        {/* 视频按钮 — v2.0 前禁用 */}
        {/* TODO(v2.0): 恢复 submitVideoTask */}
      </div>
    </div>
  )
}

// ===== 主组件 =====

export default function CompareModal() {
  const showCompareModal = useStore((s) => s.showCompareModal)
  const comparedCandidateIds = useStore((s) => s.comparedCandidateIds)
  const candidates = useStore((s) => s.workflowCandidates)
  const showToast = useStore((s) => s.showToast)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)

  // 图像加载状态
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set())

  // 聚焦索引（0-based）
  const [focusedIndex, setFocusedIndex] = useState<number>(0)

  // 取消标记
  const cancelledRef = useRef(false)

  // 关闭弹窗
  const close = useCallback(() => {
    setShowCompareModal(false)
  }, [])

  useCloseOnEscape(showCompareModal, close)
  usePreventBackgroundScroll(showCompareModal)

  // 过滤出参与对比的候选对象
  const comparedCandidates = comparedCandidateIds
    .map((id) => candidates.find((c) => c.id === id))
    .filter(Boolean) as WorkflowCandidate[]

  // 如果数量 < 2 或弹窗关闭，不渲染
  const shouldShow = showCompareModal && comparedCandidates.length >= 2

  // 不足 2 个时自动关闭
  useEffect(() => {
    if (showCompareModal && comparedCandidateIds.length > 0 && comparedCandidates.length < 2) {
      setShowCompareModal(false)
    }
  }, [showCompareModal, comparedCandidateIds.length, comparedCandidates.length])

  // 全局初始化 focusedIndex
  useEffect(() => {
    if (showCompareModal) {
      setFocusedIndex(0)
    }
  }, [showCompareModal])

  // 加载候选图片
  useEffect(() => {
    if (!shouldShow) return

    cancelledRef.current = false
    const cancelled = () => cancelledRef.current

    const ids = comparedCandidates.map((c) => c.primaryImageId)
    const initial: Record<string, string> = {}
    const errorSet = new Set<string>()
    const loadingSet = new Set<string>()

    for (const id of ids) {
      const cached = getCachedImage(id)
      if (cached) {
        initial[id] = cached
      } else {
        loadingSet.add(id)
      }
    }

    setImageUrls(initial)
    setLoadingIds(loadingSet)
    setErrorIds(new Set())

    // 异步加载未缓存的图片
    for (const id of ids) {
      if (initial[id]) continue
      ensureImageCached(id).then((url) => {
        if (cancelled()) return
        if (url) {
          setImageUrls((prev) => ({ ...prev, [id]: url }))
        } else {
          setErrorIds((prev) => new Set([...prev, id]))
        }
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      })
    }

    return () => {
      cancelledRef.current = true
    }
  }, [shouldShow, comparedCandidates.map((c) => c.primaryImageId).join(',')])

  // ===== 键盘快捷键 =====
  useEffect(() => {
    if (!shouldShow) return

    const onKeyDown = (e: KeyboardEvent) => {
      const count = comparedCandidates.length

      // 数字键 1-4 聚焦
      if (e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key) - 1
        if (idx < count) {
          e.preventDefault()
          setFocusedIndex(idx)
        }
        return
      }

      // Enter: 设为 primary
      if (e.key === 'Enter') {
        e.preventDefault()
        const candidate = comparedCandidates[focusedIndex]
        if (candidate) {
          setCandidateDecision(candidate.id, 'primary').catch(() => {})
          showToast('已标记为主推', 'success')
        }
        return
      }

      // Delete / Backspace: 淘汰
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const candidate = comparedCandidates[focusedIndex]
        if (candidate) {
          setCandidateDecision(candidate.id, 'discarded').catch(() => {})
          showToast('已标记为淘汰', 'info')
        }
        return
      }

      // Escape: 关闭（已由 useCloseOnEscape 处理，这里做后备）
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shouldShow, comparedCandidates, focusedIndex, showToast, close])

  // ===== 批量决策 =====
  const handleBatchKeepAll = useCallback(async () => {
    const ids = comparedCandidates.map((c) => c.id)
    try {
      await applyBatchDecision(ids, 'keep')
      showToast(`已全部保留 ${ids.length} 个候选`, 'success')
      setShowCompareModal(false)
    } catch {
      showToast('批量保留失败', 'error')
    }
  }, [comparedCandidates, showToast])

  const handleBatchPromoteBest = useCallback(async () => {
    const primaryCandidate = comparedCandidates.find((c) => c.decision === 'primary')
    if (!primaryCandidate) {
      showToast('请先标记一个主推候选', 'info')
      return
    }
    const nextStage = (primaryCandidate.stage + 1) as WorkflowStage
    if (nextStage > 4) {
      showToast('已在最终阶段', 'info')
      return
    }
    try {
      await crossStagePromoteCandidate(primaryCandidate.id, nextStage)
      showToast(`已晋级到阶段 ${nextStage}`, 'success')
      setShowCompareModal(false)
    } catch {
      showToast('晋级失败', 'error')
    }
  }, [comparedCandidates, showToast])

  const handleBatchDiscardAll = useCallback(() => {
    const ids = comparedCandidates.map((c) => c.id)
    setConfirmDialog({
      title: '全部淘汰',
      message: `确定要淘汰当前对比中的所有 ${ids.length} 个候选吗？`,
      confirmText: '全部淘汰',
      cancelText: '取消',
      tone: 'danger',
      action: async () => {
        try {
          await applyBatchDecision(ids, 'discarded')
          showToast(`已淘汰 ${ids.length} 个候选`, 'info')
          setShowCompareModal(false)
        } catch {
          showToast('批量淘汰失败', 'error')
        }
      },
    })
  }, [comparedCandidates, showToast, setConfirmDialog])

  // 列宽计算
  const columnWidthClass =
    comparedCandidates.length === 2 ? 'w-1/2' :
    comparedCandidates.length === 3 ? 'w-1/3' :
    'w-1/4'

  if (!shouldShow) return null

  const focusedCandidate = comparedCandidates[focusedIndex]

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-[65] flex flex-col animate-overlay-in"
      onClick={close}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-md" />

      {/* 顶部操作栏 */}
      <div className="relative z-10 h-14 flex items-center justify-between px-4 flex-shrink-0 bg-black/40">
        {/* 左侧：标题 */}
        <div className="flex items-center gap-2">
          <h2 className="text-white text-sm font-medium">候选对比</h2>
          <span className="text-white/50 text-xs bg-white/10 px-2 py-0.5 rounded-full">
            {comparedCandidates.length}
          </span>
        </div>

        {/* 中间：聚焦候选 */}
        {focusedCandidate && (
          <div className="text-white/60 text-xs truncate max-w-[200px]">
            {focusedCandidate.id.slice(-6)}
          </div>
        )}

        {/* 右侧：批量按钮 + 关闭 */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleBatchKeepAll() }}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 transition whitespace-nowrap"
          >
            全部保留
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleBatchPromoteBest() }}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition whitespace-nowrap"
          >
            择优晋级
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleBatchDiscardAll() }}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition whitespace-nowrap"
          >
            全部淘汰
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); close() }}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
            aria-label="关闭"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 主体：候选对比区域 */}
      <div
        className="relative z-10 flex-1 flex gap-0 min-h-0 px-4 pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        {comparedCandidates.map((candidate, idx) => {
          const imgUrl = imageUrls[candidate.primaryImageId]
          const isLoading = loadingIds.has(candidate.primaryImageId)
          const hasError = errorIds.has(candidate.primaryImageId)

          return (
            <div key={candidate.id} className={`${columnWidthClass} flex flex-col p-1`}>
              <CandidateCard
                candidate={candidate}
                index={idx}
                isFocused={idx === focusedIndex}
                imageUrl={imgUrl}
                loading={isLoading}
                loadError={hasError}
                onFocus={() => setFocusedIndex(idx)}
              />
            </div>
          )
        })}
      </div>

      {/* 底部快捷键提示栏（POLISH-01: 按实际候选数动态生成） */}
      <div className="relative z-10 h-8 flex items-center justify-center flex-shrink-0 bg-black/60">
        <span className="text-white/50 text-xs">
          {comparedCandidates.length >= 2 && `${[...Array(comparedCandidates.length)].map((_, i) => i + 1).join('/')} 聚焦 · `}Enter 主推 · Delete 淘汰 · Esc 关闭
        </span>
      </div>
    </div>
  )
}
