import { useStore, createWorkflowRun, setActiveWorkflowRun, removeWorkflowRun, setShowWorkflowPanel, setShowBranchTree } from '../store'
import { getTemplateByStage } from '../lib/workflowTemplates'
import type { WorkflowRun, WorkflowCandidate, WorkflowStage } from '../types'

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

export default function WorkflowPanel() {
  const workflowRuns = useStore((s) => s.workflowRuns)
  const workflowCandidates = useStore((s) => s.workflowCandidates)
  const activeWorkflowRunId = useStore((s) => s.activeWorkflowRunId)
  const showWorkflowPanel = useStore((s) => s.showWorkflowPanel)

  if (!showWorkflowPanel) return null

  const activeRun = workflowRuns.find((r) => r.id === activeWorkflowRunId) ?? null
  const runCandidates = workflowCandidates.filter((c) => c.runId === activeWorkflowRunId)

  const groupedByStage = new Map<WorkflowStage, WorkflowCandidate[]>()
  for (const c of runCandidates) {
    const list = groupedByStage.get(c.stage) || []
    list.push(c)
    groupedByStage.set(c.stage, list)
  }

  const handleCreateRun = async () => {
    const name = window.prompt('工作流名称：', '新角色')
    if (name) await createWorkflowRun(name)
  }

  const handleDeleteRun = async (runId: string) => {
    if (window.confirm('确定删除此工作流及其所有候选？')) {
      await removeWorkflowRun(runId)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] 2xl:w-[560px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-l border-gray-200 dark:border-white/[0.08] shadow-2xl flex flex-col overflow-hidden">
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
                  className="flex flex-col rounded-2xl border border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] overflow-hidden min-h-[200px]"
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
                        {zoneCandidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            data-candidate-id={candidate.id}
                            data-stage={candidate.stage}
                            className="w-full min-h-[7rem] bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-white/[0.05] hover:shadow-md hover:border-purple-200 dark:hover:border-purple-500/20 transition-all duration-200 p-1.5 cursor-pointer"
                          >
                            {/* 缩略图区域（占位） */}
                            <div className="w-full h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-white/[0.04] flex items-center justify-center mb-1">
                              <svg className="w-5 h-5 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            {/* 基本信息 */}
                            <div className="text-[10px] text-gray-600 dark:text-gray-400 truncate">
                              {candidate.notes || candidate.id.slice(-6)}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[9px] font-medium ${decisionColors[candidate.decision] || 'text-gray-400'}`}>
                                {decisionLabels[candidate.decision] || candidate.decision}
                              </span>
                              <span className="text-[9px] text-purple-500">
                                阶段{candidate.stage}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {activeRun && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => handleDeleteRun(activeRun.id)}
            className="w-full text-xs py-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
          >
            删除此工作流
          </button>
        </div>
      )}
    </div>
  )
}
