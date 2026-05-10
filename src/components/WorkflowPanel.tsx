import { useState, useEffect, useRef } from 'react'
import { useStore, createWorkflowRun, setActiveWorkflowRun, removeWorkflowRun, setShowWorkflowPanel, setActiveCandidate, setShowBranchTree, ensureImageCached, getCachedImage, setComparedCandidates, setShowCompareModal, crossStagePromoteCandidate, setCandidateDecision } from '../store'
import { getTemplateByStage } from '../lib/workflowTemplates'
import type { WorkflowStage, WorkflowCandidate } from '../types'

const stageNames: Record<WorkflowStage, string> = {
  1: '抽卡',
  2: '对齐与发散',
  3: '收束',
  4: '细化',
}

const decisionColors: Record<string, string> = {
  draft: 'text-gray-400',
  keep: 'text-green-500',
  promoted: 'text-amber-500',
  discarded: 'text-red-400',
  favorite: 'text-yellow-400',
  primary: 'text-blue-500',
}

const decisionLabels: Record<string, string> = {
  draft: '草稿',
  keep: '保留',
  promoted: '已晋级',
  discarded: '已淘汰',
  favorite: '收藏',
  primary: '主推',
}

const decisionDotColors: Record<string, string> = {
  draft: 'bg-gray-300',
  keep: 'bg-green-500',
  promoted: 'bg-amber-500',
  discarded: 'bg-red-400',
  favorite: 'bg-yellow-400',
  primary: 'bg-blue-500',
}

export default function WorkflowPanel() {
  const workflowRuns = useStore((s) => s.workflowRuns)
  const workflowCandidates = useStore((s) => s.workflowCandidates)
  const activeWorkflowRunId = useStore((s) => s.activeWorkflowRunId)
  const activeCandidateId = useStore((s) => s.activeCandidateId)
  const comparedCandidateIds = useStore((s) => s.comparedCandidateIds)
  const showWorkflowPanel = useStore((s) => s.showWorkflowPanel)
  const showToast = useStore((s) => s.showToast)

  // 缩略图本地缓存状态：primaryImageId → dataUrl | null（null 表示加载失败）
  const [thumbnailMap, setThumbnailMap] = useState<Record<string, string | null>>({})
  const loadedIds = useRef<Set<string>>(new Set())

  // 拖拽状态（D-01/D-03）
  const [isDragging, setIsDragging] = useState(false)
  const [dragCandidateId, setDragCandidateId] = useState<string | null>(null)
  const [dragSourceStage, setDragSourceStage] = useState<WorkflowStage | null>(null)
  const [hoveredStage, setHoveredStage] = useState<WorkflowStage | null>(null)
  const [hoveredDiscard, setHoveredDiscard] = useState(false)

  if (!showWorkflowPanel) return null

  // 拖拽动画 CSS（D-03 颜色语义）
  const dragStyles = `
    @keyframes purplePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.4); }
      50% { box-shadow: 0 0 0 6px rgba(168, 85, 247, 0.1); }
    }
    @keyframes scale-in {
      from { transform: scale(0.9); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes discardPulse {
      0%, 100% { border-color: rgba(248, 113, 113, 0.4); }
      50% { border-color: rgba(248, 113, 113, 0.9); }
    }
    .animate-purple-pulse { animation: purplePulse 0.6s ease-in-out infinite; }
    .animate-scale-in { animation: scale-in 150ms ease-out; }
    .animate-discard-pulse { animation: discardPulse 0.5s ease-in-out infinite; }
  `

  const activeRun = workflowRuns.find((r) => r.id === activeWorkflowRunId) ?? null
  const runCandidates = workflowCandidates.filter((c) => c.runId === activeWorkflowRunId)

  const groupedByStage = new Map<WorkflowStage, WorkflowCandidate[]>()
  for (const c of runCandidates) {
    const list = groupedByStage.get(c.stage) || []
    list.push(c)
    groupedByStage.set(c.stage, list)
  }

  // 异步加载候选缩略图
  useEffect(() => {
    if (!activeWorkflowRunId) return
    const toLoad = runCandidates.filter(
      (c) => c.primaryImageId && !loadedIds.current.has(c.primaryImageId),
    )
    if (toLoad.length === 0) return
    for (const c of toLoad) {
      loadedIds.current.add(c.primaryImageId)
    }
    void (async () => {
      for (const c of toLoad) {
        const dataUrl = await ensureImageCached(c.primaryImageId)
        setThumbnailMap((prev) => ({
          ...prev,
          [c.primaryImageId]: dataUrl ?? null,
        }))
      }
    })()
  }, [activeWorkflowRunId, runCandidates])

  const handleCreateRun = async () => {
    const name = window.prompt('工作流名称：', '新角色')
    if (name) await createWorkflowRun(name)
  }

  const handleDeleteRun = async (runId: string) => {
    if (window.confirm('确定删除此工作流及其所有候选？')) {
      await removeWorkflowRun(runId)
    }
  }

  const handleToggleCompare = (candidateId: string) => {
    if (comparedCandidateIds.includes(candidateId)) {
      setComparedCandidates(comparedCandidateIds.filter((id) => id !== candidateId))
    } else if (comparedCandidateIds.length >= 4) {
      showToast('最多选择 4 个候选进行对比', 'info')
    } else {
      setComparedCandidates([...comparedCandidateIds, candidateId])
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] 2xl:w-[560px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-l border-gray-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
      <style>{dragStyles}</style>
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">工作流画布</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreateRun}
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-500 transition"
            title="新建工作流"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <button
            onClick={() => setShowBranchTree(true)}
            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-500 transition"
            title="分支树视图"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16m0-8h8m4 0h4m-4 0v8m4-4h-4" />
            </svg>
          </button>
          <button
            onClick={() => setShowWorkflowPanel(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-400 transition"
            title="关闭面板"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Run selector */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
        <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">当前工作流</label>
        <select
          value={activeWorkflowRunId || ''}
          onChange={(e) => setActiveWorkflowRun(e.target.value || null)}
          className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-gray-700 dark:text-gray-200"
        >
          <option value="">-- 未选择 --</option>
          {workflowRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {run.name}（阶段 {run.currentStage}）{run.goalStyle ? ` · ${run.goalStyle}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Content: 阶段区域画布 */}
      <div className="flex-1 overflow-y-auto">
        {!activeRun ? (
          <div className="text-center text-gray-400 text-xs mt-16">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">暂无活跃工作流</p>
            <p>请新建或从上方选择工作流开始创作</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
            {([1, 2, 3, 4] as WorkflowStage[]).map((stage) => {
              const template = getTemplateByStage(stage)
              const zoneCandidates = groupedByStage.get(stage) || []
              return (
                <div
                  key={stage}
                  className={`flex flex-col rounded-2xl border overflow-hidden min-h-[200px] transition-all duration-200 ${
                    hoveredStage === stage && dragSourceStage != null
                      ? stage > dragSourceStage
                        ? 'ring-2 ring-purple-400 bg-purple-50/50 dark:bg-purple-500/10 border-purple-400 animate-purple-pulse'
                        : stage === dragSourceStage
                          ? 'ring-2 ring-green-400 bg-green-50/50 dark:bg-green-500/10 border-green-400 animate-pulse'
                          : 'ring-2 ring-red-400 bg-red-50/50 dark:bg-red-500/10 border-red-400 animate-pulse'
                      : 'border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02]'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (hoveredStage !== stage) setHoveredStage(stage)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setHoveredStage(null)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
                      const srcStage: WorkflowStage = data.sourceStage
                      if (srcStage !== stage) {
                        void crossStagePromoteCandidate(data.candidateId, stage)
                      }
                    } catch { /* 忽略无效拖拽数据 */ }
                    setIsDragging(false)
                    setDragCandidateId(null)
                    setDragSourceStage(null)
                    setHoveredStage(null)
                    setHoveredDiscard(false)
                  }}
                >
                  {/* 阶段头部 */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-white/[0.06] flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                          阶段{stage}：{stageNames[stage]}
                        </span>
                        {template && (
                          <span className="text-[10px] text-gray-400 truncate block">
                            {template.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                      {zoneCandidates.length} 候选
                    </span>
                  </div>
                  {/* 候选卡片排列区 */}
                  <div className="flex-1 p-2 overflow-y-auto">
                    {zoneCandidates.length === 0 ? (
                      <p className="text-[10px] text-gray-300 dark:text-gray-600 text-center italic py-4">
                        拖拽候选到此阶段
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {zoneCandidates.map((candidate) => {
                          const isActive = activeCandidateId === candidate.id
                          const isCompared = comparedCandidateIds.includes(candidate.id)
                          const thumbnailUrl = thumbnailMap[candidate.primaryImageId]
                          return (
                            <div
                              key={candidate.id}
                              data-candidate-id={candidate.id}
                              data-stage={candidate.stage}
                              draggable={true}
                              onClick={() => setActiveCandidate(candidate.id)}
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  'text/plain',
                                  JSON.stringify({ candidateId: candidate.id, sourceStage: candidate.stage }),
                                )
                                e.dataTransfer.effectAllowed = 'move'
                                // 创建拖拽缩略图
                                const canvas = document.createElement('canvas')
                                canvas.width = 48
                                canvas.height = 48
                                const ctx = canvas.getContext('2d')
                                if (ctx) {
                                  ctx.fillStyle = '#a855f7'
                                  ctx.fillRect(0, 0, 48, 48)
                                  ctx.fillStyle = '#ffffff'
                                  ctx.font = '12px sans-serif'
                                  ctx.textAlign = 'center'
                                  ctx.textBaseline = 'middle'
                                  ctx.fillText('S' + candidate.stage, 24, 24)
                                }
                                e.dataTransfer.setDragImage(canvas, 24, 24)
                                setIsDragging(true)
                                setDragCandidateId(candidate.id)
                                setDragSourceStage(candidate.stage)
                                setActiveCandidate(candidate.id)
                              }}
                              onDragEnd={() => {
                                setIsDragging(false)
                                setDragCandidateId(null)
                                setDragSourceStage(null)
                                setHoveredStage(null)
                                setHoveredDiscard(false)
                              }}
                              className={`relative w-full min-h-[7rem] bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-white/[0.05] hover:shadow-md hover:border-purple-200 dark:hover:border-purple-500/20 transition-all duration-200 p-1.5 cursor-pointer ${
                                isActive ? 'ring-2 ring-purple-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-800' : ''
                              } ${
                                isDragging && dragCandidateId === candidate.id
                                  ? 'opacity-50 scale-95 shadow-lg shadow-purple-500/30'
                                  : isDragging
                                    ? 'opacity-60'
                                    : ''
                              }`}
                            >
                              {/* 对比复选框 */}
                              <div className="absolute top-1 right-1 z-[1]" onClick={(e) => e.stopPropagation()}>
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isCompared}
                                    onChange={() => handleToggleCompare(candidate.id)}
                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 cursor-pointer"
                                  />
                                </label>
                              </div>

                              {/* 上部：缩略图 + 信息 */}
                              <div className="flex gap-1.5 mb-1">
                                {/* 缩略图 */}
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/[0.04] flex-shrink-0 flex items-center justify-center">
                                  {thumbnailUrl === undefined ? (
                                    <svg className="w-5 h-5 text-gray-300 dark:text-gray-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  ) : thumbnailUrl === null ? (
                                    <svg className="w-5 h-5 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.9l-3.536 3.535M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                  ) : (
                                    <img
                                      src={thumbnailUrl}
                                      alt={candidate.notes || candidate.id}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                  )}
                                </div>

                                {/* 右侧信息 */}
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                                    {candidate.notes || candidate.id.slice(-6)}
                                  </div>
                                  <div className="text-[9px] text-gray-400 truncate">
                                    #{candidate.sourceTaskId.slice(-8)}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    <span className="text-[9px] text-purple-500">
                                      阶段{candidate.stage}
                                    </span>
                                    {candidate.parentCandidateId && (
                                      <span className="text-[9px] text-amber-500">分支</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 下部：decision 标签 */}
                              <div className="mt-1 pt-1 border-t border-gray-50 dark:border-white/[0.03] flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full ${decisionDotColors[candidate.decision] || 'bg-gray-300'}`} />
                                  <span className={`text-[10px] font-medium ${decisionColors[candidate.decision] || 'text-gray-400'}`}>
                                    {decisionLabels[candidate.decision] || candidate.decision}
                                  </span>
                                </span>
                                <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
                                  <circle cx="4" cy="8" r="1.5" />
                                  <circle cx="8" cy="8" r="1.5" />
                                  <circle cx="12" cy="8" r="1.5" />
                                </svg>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 拖拽淘汰区（D-01 底部 drop zone） */}
      {activeRun && (
        <div
          className={`mx-3 mb-2 rounded-xl border-2 border-dashed py-3 text-center transition-all duration-200 ${
            hoveredDiscard
              ? 'bg-red-50 dark:bg-red-500/10 border-red-400 animate-discard-pulse'
              : 'border-red-200 dark:border-red-500/20'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            if (!hoveredDiscard) setHoveredDiscard(true)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setHoveredDiscard(false)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            try {
              const data = JSON.parse(e.dataTransfer.getData('text/plain'))
              void setCandidateDecision(data.candidateId, 'discarded')
            } catch { /* 忽略无效拖拽数据 */ }
            setIsDragging(false)
            setDragCandidateId(null)
            setDragSourceStage(null)
            setHoveredStage(null)
            setHoveredDiscard(false)
          }}
        >
          <span className={`text-xs transition-colors duration-200 ${hoveredDiscard ? 'text-red-500 font-medium' : 'text-red-400'}`}>
            拖拽到此以淘汰候选
          </span>
        </div>
      )}

      {/* Footer */}
      {(activeRun || comparedCandidateIds.length >= 1) && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/[0.06] flex-shrink-0 space-y-2">
          {/* 对比按钮 */}
          {comparedCandidateIds.length >= 2 && (
            <button
              onClick={() => setShowCompareModal(true)}
              className="w-full text-xs py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white transition font-medium"
            >
              对比选中 ({comparedCandidateIds.length})
            </button>
          )}
          {comparedCandidateIds.length === 1 && (
            <button
              disabled
              className="w-full text-xs py-1.5 rounded-lg bg-gray-200 dark:bg-white/[0.05] text-gray-400 dark:text-gray-500 cursor-not-allowed"
            >
              对比选中 (1) — 至少选 2 个
            </button>
          )}
          {/* 删除按钮 */}
          {activeRun && (
            <button
              onClick={() => handleDeleteRun(activeRun.id)}
              className="w-full text-xs py-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
            >
              删除此工作流
            </button>
          )}
        </div>
      )}
    </div>
  )
}
