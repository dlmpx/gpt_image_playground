import { useStore, createWorkflowRun, setActiveWorkflowRun, removeWorkflowRun, setShowWorkflowPanel } from '../store'
import { getTemplateByStage } from '../lib/workflowTemplates'
import type { WorkflowRun, WorkflowCandidate, WorkflowStage } from '../types'

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

  const stageLabels: Record<WorkflowStage, string> = {
    1: '阶段一：抽卡',
    2: '阶段二：对齐与发散',
    3: '阶段三：收束',
    4: '阶段四：细化',
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

  return (
    <div className="fixed right-0 top-14 bottom-0 w-80 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-l border-gray-200 dark:border-white/[0.08] shadow-2xl z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">工作流</h2>
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
            onClick={() => setShowWorkflowPanel(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-400 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Run selector */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-white/[0.06]">
        <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">当前工作流</label>
        <select
          value={activeWorkflowRunId || ''}
          onChange={(e) => setActiveWorkflowRun(e.target.value || null)}
          className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-gray-700 dark:text-gray-200"
        >
          <option value="">-- 未选择 --</option>
          {workflowRuns.map((run) => (
            <option key={run.id} value={run.id}>{run.name}（阶段 {run.currentStage}）</option>
          ))}
        </select>
      </div>

      {/* Candidates by stage */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!activeRun ? (
          <div className="text-center text-gray-400 text-xs mt-8">
            <p>暂无活跃工作流</p>
            <p className="mt-1">请新建或从上方选择</p>
          </div>
        ) : runCandidates.length === 0 ? (
          <div className="text-center text-gray-400 text-xs mt-8">
            <p>暂无候选</p>
            <p className="mt-1">打开任务详情，点击「纳入工作流」</p>
            <p>即可开始构建角色</p>
          </div>
        ) : (
          Array.from(groupedByStage.entries())
            .sort(([a], [b]) => a - b)
            .map(([stage, candidates]) => (
              <div key={stage} className="mb-4">
                <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                  <span className={'w-2 h-2 rounded-full ' + (stage === activeRun.currentStage ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600')} />
                  {stageLabels[stage]}
                  <span className="text-gray-300 dark:text-gray-600">({candidates.length})</span>
                </h3>
                <div className="space-y-1.5">
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.03] text-xs"
                    >
                      <span className={'font-mono ' + (decisionColors[candidate.decision] || 'text-gray-400')}>
                        {decisionLabels[candidate.decision] || candidate.decision}
                      </span>
                      <span className="text-gray-400 truncate flex-1">
                        {candidate.notes || candidate.id.slice(-6)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>

      {/* Footer: delete active run */}
      {activeRun && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-white/[0.06]">
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