import type { WorkflowStage, WorkflowRun, WorkflowCandidate, CandidateDecision } from '../types'
import {
  putWorkflowRun,
  putWorkflowCandidate,
  deleteWorkflowRun,
  deleteWorkflowCandidate,
} from '../lib/db'
import { useStore } from '../store'
import { ensureImageCached } from './imageStore'
import { genId } from './taskStore'

export async function createWorkflowRun(name: string, goalStyle?: string): Promise<WorkflowRun> {
  const id = genId()
  const now = Date.now()
  const run: WorkflowRun = {
    id,
    name,
    goalStyle,
    currentStage: 1,
    rootCandidateIds: [],
    createdAt: now,
    updatedAt: now,
  }
  await putWorkflowRun(run)
  const state = useStore.getState()
  useStore.setState({
    workflowRuns: [...state.workflowRuns, run],
    activeWorkflowRunId: id,
    activeCandidateId: null,
  })
  state.showToast('工作流已创建', 'success')
  return run
}

export async function addWorkflowCandidateFromTask(
  taskId: string,
  stage: WorkflowStage,
  runId: string,
  primaryImageId: string,
  options: { parentCandidateId?: string | null; cultureDirection?: string } = {},
): Promise<WorkflowCandidate> {
  const id = genId()
  const now = Date.now()
  const candidate: WorkflowCandidate = {
    id,
    runId,
    stage,
    sourceTaskId: taskId,
    primaryImageId,
    parentCandidateId: options.parentCandidateId ?? null,
    decision: 'draft',
    cultureDirection: options.cultureDirection,
    createdAt: now,
    updatedAt: now,
  }
  await putWorkflowCandidate(candidate)
  const state = useStore.getState()
  useStore.setState({
    workflowCandidates: [...state.workflowCandidates, candidate],
    activeCandidateId: id,
  })
  if (stage === 1) {
    const run = state.workflowRuns.find((r) => r.id === runId)
    if (run && !run.rootCandidateIds.includes(id)) {
      const updatedRun: WorkflowRun = {
        ...run,
        rootCandidateIds: [...run.rootCandidateIds, id],
        updatedAt: now,
      }
      await putWorkflowRun(updatedRun)
      useStore.setState({
        workflowRuns: state.workflowRuns.map((r) => (r.id === runId ? updatedRun : r)),
      })
    }
  }
  state.showToast('候选已纳入工作流', 'success')
  return candidate
}

export async function promoteCandidateToStage(candidateId: string): Promise<void> {
  const state = useStore.getState()
  const candidate = state.workflowCandidates.find((c) => c.id === candidateId)
  if (!candidate) {
    state.showToast('未找到候选', 'error')
    return
  }
  const run = state.workflowRuns.find((r) => r.id === candidate.runId)
  if (!run) {
    state.showToast('未找到工作流', 'error')
    return
  }
  const nextStage = (candidate.stage + 1) as WorkflowStage
  if (nextStage > 4) {
    state.showToast('已在最终阶段', 'info')
    return
  }
  const updatedCandidate: WorkflowCandidate = {
    ...candidate,
    decision: 'promoted',
    updatedAt: Date.now(),
  }
  await putWorkflowCandidate(updatedCandidate)
  const updatedRun: WorkflowRun = {
    ...run,
    currentStage: nextStage,
    activeCandidateId: candidateId,
    updatedAt: Date.now(),
  }
  await putWorkflowRun(updatedRun)
  const primaryDataUrl = await ensureImageCached(candidate.primaryImageId)
  if (primaryDataUrl) {
    const existingImages = state.inputImages
    if (!existingImages.some((img) => img.id === candidate.primaryImageId)) {
      state.setInputImages([{ id: candidate.primaryImageId, dataUrl: primaryDataUrl, sourceCandidateId: candidate.id }])
    }
  }
  useStore.setState({
    workflowCandidates: state.workflowCandidates.map((c) =>
      c.id === candidateId ? updatedCandidate : c,
    ),
    workflowRuns: state.workflowRuns.map((r) =>
      r.id === run.id ? updatedRun : r,
    ),
    activeCandidateId: candidateId,
  })
  state.showToast(
    "已晋级到阶段 " + nextStage,
    'success',
  )
}

export function setActiveWorkflowRun(runId: string | null) {
  const state = useStore.getState()
  const run = runId ? state.workflowRuns.find((r) => r.id === runId) ?? null : null
  useStore.setState({
    activeWorkflowRunId: runId,
    activeCandidateId: run?.activeCandidateId ?? null,
  })
}

export function setActiveCandidate(candidateId: string | null) {
  useStore.setState({ activeCandidateId: candidateId })
}

export function setShowWorkflowPanel(show: boolean) {
  useStore.setState({ showWorkflowPanel: show })
}

export function setShowBranchTree(show: boolean) {
  useStore.setState({ showBranchTree: show })
}

export async function removeWorkflowRun(runId: string): Promise<void> {
  const state = useStore.getState()
  const candidates = state.workflowCandidates.filter((c) => c.runId === runId)
  for (const candidate of candidates) {
    await deleteWorkflowCandidate(candidate.id)
  }
  await deleteWorkflowRun(runId)
  useStore.setState({
    workflowRuns: state.workflowRuns.filter((r) => r.id !== runId),
    workflowCandidates: state.workflowCandidates.filter((c) => c.runId !== runId),
    activeWorkflowRunId: state.activeWorkflowRunId === runId ? null : state.activeWorkflowRunId,
    activeCandidateId: null,
  })
  state.showToast('工作流已删除', 'success')
}

export async function setCandidateDecision(
  candidateId: string,
  decision: CandidateDecision,
): Promise<void> {
  const state = useStore.getState()
  const candidate = state.workflowCandidates.find((c) => c.id === candidateId)
  if (!candidate) return
  const updated: WorkflowCandidate = { ...candidate, decision, updatedAt: Date.now() }
  await putWorkflowCandidate(updated)
  useStore.setState({
    workflowCandidates: state.workflowCandidates.map((c) =>
      c.id === candidateId ? updated : c,
    ),
  })
}

export async function updateCandidateNotes(candidateId: string, notes: string): Promise<void> {
  const state = useStore.getState()
  const candidate = state.workflowCandidates.find((c) => c.id === candidateId)
  if (!candidate) {
    state.showToast('未找到候选', 'error')
    return
  }
  const updated: WorkflowCandidate = { ...candidate, notes, updatedAt: Date.now() }
  await putWorkflowCandidate(updated)
  useStore.setState({
    workflowCandidates: state.workflowCandidates.map((c) =>
      c.id === candidateId ? updated : c,
    ),
  })
}

export async function crossStagePromoteCandidate(candidateId: string, targetStage: WorkflowStage): Promise<void> {
  const state = useStore.getState()
  const candidate = state.workflowCandidates.find((c) => c.id === candidateId)
  if (!candidate) {
    state.showToast('未找到候选', 'error')
    return
  }
  const run = state.workflowRuns.find((r) => r.id === candidate.runId)
  if (!run) {
    state.showToast('未找到工作流', 'error')
    return
  }
  if (candidate.stage === targetStage) {
    const updated: WorkflowCandidate = { ...candidate, decision: 'keep', updatedAt: Date.now() }
    await putWorkflowCandidate(updated)
    useStore.setState({
      workflowCandidates: state.workflowCandidates.map((c) =>
        c.id === candidateId ? updated : c,
      ),
    })
    state.showToast(`候选已保留在阶段 ${targetStage}`, 'success')
    return
  }
  const updatedCandidate: WorkflowCandidate = {
    ...candidate,
    stage: targetStage,
    decision: 'promoted',
    updatedAt: Date.now(),
  }
  await putWorkflowCandidate(updatedCandidate)
  let updatedRun: WorkflowRun = run
  if (targetStage > run.currentStage) {
    updatedRun = { ...run, currentStage: targetStage, updatedAt: Date.now() }
    await putWorkflowRun(updatedRun)
  }
  const primaryDataUrl = await ensureImageCached(candidate.primaryImageId)
  if (primaryDataUrl) {
    const existingImages = state.inputImages
    if (!existingImages.some((img) => img.id === candidate.primaryImageId)) {
      state.setInputImages([{ id: candidate.primaryImageId, dataUrl: primaryDataUrl, sourceCandidateId: candidate.id }])
    }
  }
  useStore.setState({
    workflowCandidates: state.workflowCandidates.map((c) =>
      c.id === candidateId ? updatedCandidate : c,
    ),
    workflowRuns: state.workflowRuns.map((r) =>
      r.id === run.id ? updatedRun : r,
    ),
    activeCandidateId: candidateId,
  })
  state.showToast(`已晋级到阶段 ${targetStage}`, 'success')
}

export async function backtrackCandidate(candidateId: string, targetStage?: WorkflowStage): Promise<WorkflowCandidate> {
  const state = useStore.getState()
  const source = state.workflowCandidates.find((c) => c.id === candidateId)
  if (!source) {
    state.showToast('未找到候选', 'error')
    throw new Error('未找到候选')
  }
  const id = genId()
  const now = Date.now()
  const newCandidate: WorkflowCandidate = {
    id,
    runId: source.runId,
    stage: targetStage ?? source.stage,
    sourceTaskId: source.sourceTaskId,
    primaryImageId: source.primaryImageId,
    parentCandidateId: candidateId,
    decision: 'draft',
    createdAt: now,
    updatedAt: now,
  }
  await putWorkflowCandidate(newCandidate)
  const primaryDataUrl = await ensureImageCached(source.primaryImageId)
  if (primaryDataUrl) {
    const existingImages = state.inputImages
    if (!existingImages.some((img) => img.id === source.primaryImageId)) {
      state.setInputImages([{ id: source.primaryImageId, dataUrl: primaryDataUrl, sourceCandidateId: source.id }])
    }
  }
  useStore.setState({
    workflowCandidates: [...state.workflowCandidates, newCandidate],
    activeCandidateId: id,
  })
  state.showToast('已从候选分叉，新候选待处理', 'info')
  return newCandidate
}

export async function rollbackRun(runId: string, targetStage: WorkflowStage): Promise<void> {
  const state = useStore.getState()
  const run = state.workflowRuns.find((r) => r.id === runId)
  if (!run) {
    state.showToast('未找到工作流', 'error')
    return
  }
  if (targetStage < 1 || targetStage > 4) {
    state.showToast('目标阶段必须为 1-4', 'error')
    return
  }
  if (targetStage === run.currentStage) {
    state.showToast('当前已在该阶段', 'info')
    return
  }
  const updatedRun: WorkflowRun = {
    ...run,
    currentStage: targetStage,
    activeCandidateId: null,
    updatedAt: Date.now(),
  }
  await putWorkflowRun(updatedRun)
  useStore.setState({
    workflowRuns: state.workflowRuns.map((r) =>
      r.id === runId ? updatedRun : r,
    ),
  })
  state.showToast(`工作流已回退到阶段 ${targetStage}`, 'success')
}

export async function applyBatchDecision(candidateIds: string[], decision: CandidateDecision): Promise<void> {
  const state = useStore.getState()
  if (!candidateIds.length) return
  const clearedPrimaryIds = new Set<string>()
  if (decision === 'primary') {
    const targetRunId = state.workflowCandidates.find((c) => candidateIds.includes(c.id))?.runId
    if (targetRunId) {
      const existingPrimaries = state.workflowCandidates.filter(
        (c) => c.runId === targetRunId && c.decision === 'primary' && !candidateIds.includes(c.id),
      )
      for (const pc of existingPrimaries) {
        const cleared: WorkflowCandidate = { ...pc, decision: 'keep', updatedAt: Date.now() }
        await putWorkflowCandidate(cleared)
        clearedPrimaryIds.add(pc.id)
      }
    }
  }
  const updatedIds = new Set(candidateIds)
  const now = Date.now()
  const updatedCandidates = state.workflowCandidates.map((c) => {
    if (updatedIds.has(c.id)) return { ...c, decision, updatedAt: now } as WorkflowCandidate
    if (clearedPrimaryIds.has(c.id)) return { ...c, decision: 'keep' as CandidateDecision, updatedAt: now } as WorkflowCandidate
    return c
  })
  for (const id of candidateIds) {
    const candidate = updatedCandidates.find((c) => c.id === id)
    if (candidate) await putWorkflowCandidate(candidate)
  }
  useStore.setState({ workflowCandidates: updatedCandidates })
  state.showToast(`已批量更新 ${candidateIds.length} 个候选状态`, 'success')
}

export function setComparedCandidates(ids: string[]): void {
  useStore.setState({ comparedCandidateIds: ids })
}

export function setShowCompareModal(show: boolean): void {
  if (!show) {
    useStore.setState({ showCompareModal: false, comparedCandidateIds: [] })
  } else {
    useStore.setState({ showCompareModal: true })
  }
}
