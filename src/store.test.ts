import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from './types'
import { createDefaultFalProfile, createDefaultOpenAIProfile, DEFAULT_SETTINGS, normalizeSettings } from './lib/apiProfiles'
import type { TaskRecord } from './types'
import type { WorkflowRun, WorkflowCandidate, WorkflowStage, CandidateDecision } from './types'
import { editOutputs, getPersistedState, getTaskApiProfile, markInterruptedOpenAIRunningTasks, reuseConfig, submitTask, useStore } from './store'
import {
  createWorkflowRun,
  promoteCandidateToStage,
  crossStagePromoteCandidate,
  backtrackCandidate,
  rollbackRun,
  applyBatchDecision,
} from './store'

vi.mock('./lib/db', async () => {
  const actual = await vi.importActual('./lib/db')
  return {
    ...(actual as object),
    putWorkflowRun: vi.fn(() => Promise.resolve()),
    putWorkflowCandidate: vi.fn(() => Promise.resolve()),
    deleteWorkflowRun: vi.fn(() => Promise.resolve()),
    deleteWorkflowCandidate: vi.fn(() => Promise.resolve()),
    getImage: vi.fn(() => Promise.resolve(null)),
  }
})

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-a',
    prompt: 'prompt',
    params: { ...DEFAULT_PARAMS },
    inputImageIds: [],
    maskTargetImageId: null,
    maskImageId: null,
    outputImages: [],
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...overrides,
  }
}

describe('mask draft lifecycle in store actions', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: 'prompt',
      inputImages: [],
      maskDraft: null,
      maskEditorImageId: null,
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      detailTaskId: null,
      lightboxImageId: null,
      lightboxImageList: [],
      showSettings: false,
      toast: null,
      confirmDialog: null,
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
    })
  })

  it('preserves an existing mask when quick edit-output adds outputs as references', async () => {
    const maskDraft = {
      targetImageId: imageA.id,
      maskDataUrl: 'data:image/png;base64,mask',
      updatedAt: 1,
    }
    useStore.setState({
      inputImages: [imageA],
      maskDraft,
    })

    await editOutputs(task({ outputImages: [imageA.id] }))

    expect(useStore.getState().maskDraft).toEqual(maskDraft)
  })

  it('clears an invalid mask draft when submit cannot find the mask target image', async () => {
    useStore.setState({
      inputImages: [imageA],
      maskDraft: {
        targetImageId: 'missing-image',
        maskDataUrl: 'data:image/png;base64,mask',
        updatedAt: 1,
      },
    })

    await submitTask()

    expect(useStore.getState().maskDraft).toBeNull()
  })
})

describe('interrupted OpenAI running tasks', () => {
  it('marks legacy and OpenAI running tasks as interrupted', () => {
    const now = 10_000
    const legacyRunning = task({ id: 'legacy-running', status: 'running', createdAt: 1_000, finishedAt: null, elapsed: null })
    const openAIRunning = task({ id: 'openai-running', apiProvider: 'openai', status: 'running', createdAt: 2_000, finishedAt: null, elapsed: null })
    const falRunning = task({ id: 'fal-running', apiProvider: 'fal', status: 'running', createdAt: 3_000, finishedAt: null, elapsed: null })
    const customAsyncRunning = task({ id: 'custom-running', apiProvider: 'custom-provider', customTaskId: 'task-1', status: 'running', createdAt: 4_000, finishedAt: null, elapsed: null })
    const doneTask = task({ id: 'done-task', apiProvider: 'openai', status: 'done' })

    const result = markInterruptedOpenAIRunningTasks([legacyRunning, openAIRunning, falRunning, customAsyncRunning, doneTask], now)

    expect(result.interruptedTasks.map((item) => item.id)).toEqual(['legacy-running', 'openai-running'])
    expect(result.tasks.find((item) => item.id === 'legacy-running')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('请求中断'),
      finishedAt: now,
      elapsed: 9_000,
    })
    expect(result.tasks.find((item) => item.id === 'openai-running')).toMatchObject({
      status: 'error',
      error: expect.stringContaining('请求中断'),
      finishedAt: now,
      elapsed: 8_000,
    })
    expect(result.tasks.find((item) => item.id === 'fal-running')).toEqual(falRunning)
    expect(result.tasks.find((item) => item.id === 'custom-running')).toEqual(customAsyncRunning)
    expect(result.tasks.find((item) => item.id === 'done-task')).toEqual(doneTask)
  })
})

describe('input persistence setting', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS },
      prompt: 'prompt',
      inputImages: [imageA],
      dismissedCodexCliPrompts: [],
    })
  })

  it('persists input when restart input restore is enabled', () => {
    const persisted = getPersistedState(useStore.getState())

    expect(persisted.prompt).toBe('prompt')
    expect(persisted.inputImages).toEqual([{ id: imageA.id, dataUrl: '' }])
  })

  it('omits input when restart input restore is disabled', () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, persistInputOnRestart: false } })

    const persisted = getPersistedState(useStore.getState())

    expect(persisted).not.toHaveProperty('prompt')
    expect(persisted).not.toHaveProperty('inputImages')
  })

  it('writes empty input when persisted input is cleared', () => {
    useStore.setState({ prompt: '', inputImages: [] })

    const persisted = getPersistedState(useStore.getState())

    expect(persisted.prompt).toBe('')
    expect(persisted.inputImages).toEqual([])
  })
})

describe('reused task API profile', () => {
  const openaiProfile = createDefaultOpenAIProfile({ id: 'openai-profile', apiKey: 'openai-key' })
  const falProfile = createDefaultFalProfile({ id: 'fal-profile', name: 'fal 配置', apiKey: 'fal-key' })

  beforeEach(() => {
    useStore.setState({
      settings: normalizeSettings({
        ...DEFAULT_SETTINGS,
        profiles: [openaiProfile, falProfile],
        activeProfileId: openaiProfile.id,
        reuseTaskApiProfileTemporarily: true,
      }),
      prompt: '',
      inputImages: [],
      maskDraft: null,
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      showSettings: false,
      toast: null,
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
      showToast: vi.fn(),
      setConfirmDialog: vi.fn(),
    })
  })

  it('resolves a task API profile by stored profile id', () => {
    const resolved = getTaskApiProfile(useStore.getState().settings, task({ apiProvider: 'fal', apiProfileId: falProfile.id }))

    expect(resolved?.id).toBe(falProfile.id)
  })

  it('reuses the task API profile temporarily without switching the active profile', async () => {
    await reuseConfig(task({
      apiProvider: 'fal',
      apiProfileId: falProfile.id,
      params: { ...DEFAULT_PARAMS, n: 8, size: 'auto', quality: 'auto' },
    }))

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(openaiProfile.id)
    expect(state.reusedTaskApiProfileId).toBe(falProfile.id)
    expect(state.params).toMatchObject({ n: 4, size: '1360x1024', quality: 'high' })
    expect(state.showToast).toHaveBeenCalledWith('已临时复用该任务的 API 配置「fal 配置」', 'success')
  })

  it('clears temporary reuse when switching current settings to the reused API profile', async () => {
    await reuseConfig(task({ apiProvider: 'fal', apiProfileId: falProfile.id }))

    useStore.getState().setSettings({ activeProfileId: falProfile.id })

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(falProfile.id)
    expect(state.reusedTaskApiProfileId).toBeNull()
    expect(state.reusedTaskApiProfileMissing).toBe(false)
  })

  it('normalizes reused params to the current API profile when temporary reuse is disabled', async () => {
    useStore.setState({
      settings: normalizeSettings({
        ...useStore.getState().settings,
        reuseTaskApiProfileTemporarily: false,
      }),
    })

    await reuseConfig(task({
      apiProvider: 'fal',
      apiProfileId: falProfile.id,
      params: { ...DEFAULT_PARAMS, n: 8, size: 'auto', quality: 'auto' },
    }))

    const state = useStore.getState()
    expect(state.settings.activeProfileId).toBe(openaiProfile.id)
    expect(state.reusedTaskApiProfileId).toBeNull()
    expect(state.params).toMatchObject({ n: 8, size: 'auto', quality: 'auto' })
  })

  it('asks whether to submit with current API profile when the reused API profile is missing', async () => {
    await reuseConfig(task({ apiProvider: 'fal', apiProfileId: 'missing-profile' }))

    const state = useStore.getState()
    expect(state.tasks).toEqual([])
    expect(state.setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: '找不到 API 配置',
      message: '找不到复用任务所使用的 API 配置「未知配置」，要使用当前的 API 配置「默认」提交任务吗？',
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
    }))
    expect(state.showSettings).toBe(false)
  })
})

// ─── Workflow Action Helpers ───

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'run-1',
    name: '测试Run',
    currentStage: 1,
    rootCandidateIds: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

function makeCandidate(overrides: Partial<WorkflowCandidate> = {}): WorkflowCandidate {
  return {
    id: 'candidate-1',
    runId: 'run-1',
    stage: 1,
    sourceTaskId: 'task-1',
    primaryImageId: 'img-1',
    parentCandidateId: null,
    decision: 'draft',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  }
}

// ─── createWorkflowRun ───

describe('createWorkflowRun', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: '',
      inputImages: [],
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      workflowRuns: [],
      workflowCandidates: [],
      activeWorkflowRunId: null,
      activeCandidateId: null,
      showToast: vi.fn(),
    })
  })

  it('should create a new run with name and goalStyle and set it as active', async () => {
    const run = await createWorkflowRun('测试角色', '东方仙侠')

    expect(run.name).toBe('测试角色')
    expect(run.goalStyle).toBe('东方仙侠')
    expect(run.currentStage).toBe(1)
    expect(run.rootCandidateIds).toEqual([])
    expect(run.id).toBeTruthy()

    const state = useStore.getState()
    expect(state.activeWorkflowRunId).toBe(run.id)
    expect(state.workflowRuns).toContainEqual(run)
    expect(state.activeCandidateId).toBeNull()
  })

  it('should leave goalStyle undefined when not provided', async () => {
    const run = await createWorkflowRun('角色2')

    expect(run.name).toBe('角色2')
    expect(run.goalStyle).toBeUndefined()
  })

  it('should show success toast after creating run', async () => {
    await createWorkflowRun('角色')

    expect(useStore.getState().showToast).toHaveBeenCalledWith('工作流已创建', 'success')
  })
})

// ─── promoteCandidateToStage ───

describe('promoteCandidateToStage', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: '',
      inputImages: [],
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      workflowRuns: [],
      workflowCandidates: [],
      activeWorkflowRunId: null,
      activeCandidateId: null,
      showToast: vi.fn(),
    })
  })

  it('should promote candidate to next stage and advance run', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 1 })
    const candidate = makeCandidate({ id: 'cand-1', runId: 'run-1', stage: 1 })
    useStore.setState({ workflowRuns: [run], workflowCandidates: [candidate] })

    await promoteCandidateToStage('cand-1')

    const state = useStore.getState()
    const updated = state.workflowCandidates.find((c) => c.id === 'cand-1')!
    expect(updated.decision).toBe('promoted')

    const updatedRun = state.workflowRuns.find((r) => r.id === 'run-1')!
    expect(updatedRun.currentStage).toBe(2)
  })

  it('should not regress run stage when run is already ahead', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 2 })
    const candidate = makeCandidate({ id: 'cand-1', runId: 'run-1', stage: 1 })
    useStore.setState({ workflowRuns: [run], workflowCandidates: [candidate] })

    await promoteCandidateToStage('cand-1')

    const updatedRun = useStore.getState().workflowRuns.find((r) => r.id === 'run-1')!
    expect(updatedRun.currentStage).toBe(2)
  })

  it('should show error toast for missing candidate', async () => {
    useStore.setState({ workflowRuns: [makeRun()], workflowCandidates: [] })

    await promoteCandidateToStage('nonexistent')

    expect(useStore.getState().showToast).toHaveBeenCalledWith('未找到候选', 'error')
  })

  it('should show info toast when candidate is already at final stage', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 4 })
    const candidate = makeCandidate({ id: 'cand-1', runId: 'run-1', stage: 4 })
    useStore.setState({ workflowRuns: [run], workflowCandidates: [candidate] })

    await promoteCandidateToStage('cand-1')

    expect(useStore.getState().showToast).toHaveBeenCalledWith('已在最终阶段', 'info')
    const updated = useStore.getState().workflowCandidates.find((c) => c.id === 'cand-1')!
    expect(updated.decision).toBe('draft')
  })
})

// ─── crossStagePromoteCandidate ───

describe('crossStagePromoteCandidate', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: '',
      inputImages: [],
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      workflowRuns: [],
      workflowCandidates: [],
      activeWorkflowRunId: null,
      activeCandidateId: null,
      showToast: vi.fn(),
    })
  })

  it('should jump candidate to target stage and advance run', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 1 })
    const candidate = makeCandidate({ id: 'cand-1', runId: 'run-1', stage: 1 })
    useStore.setState({ workflowRuns: [run], workflowCandidates: [candidate] })

    await crossStagePromoteCandidate('cand-1', 3)

    const state = useStore.getState()
    const updated = state.workflowCandidates.find((c) => c.id === 'cand-1')!
    expect(updated.stage).toBe(3)
    expect(updated.decision).toBe('promoted')

    const updatedRun = state.workflowRuns.find((r) => r.id === 'run-1')!
    expect(updatedRun.currentStage).toBe(3)
  })

  it('should set decision to keep when target stage equals current stage', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 2 })
    const candidate = makeCandidate({ id: 'cand-1', runId: 'run-1', stage: 2 })
    useStore.setState({ workflowRuns: [run], workflowCandidates: [candidate] })

    await crossStagePromoteCandidate('cand-1', 2)

    const state = useStore.getState()
    const updated = state.workflowCandidates.find((c) => c.id === 'cand-1')!
    expect(updated.decision).toBe('keep')
    expect(updated.stage).toBe(2)

    const updatedRun = state.workflowRuns.find((r) => r.id === 'run-1')!
    expect(updatedRun.currentStage).toBe(2)
  })

  it('should show error toast for missing candidate', async () => {
    await crossStagePromoteCandidate('nonexistent', 3)

    expect(useStore.getState().showToast).toHaveBeenCalledWith('未找到候选', 'error')
  })

  it('should not regress run stage when target stage is behind current run stage', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 4 })
    const candidate = makeCandidate({ id: 'cand-1', runId: 'run-1', stage: 1 })
    useStore.setState({ workflowRuns: [run], workflowCandidates: [candidate] })

    await crossStagePromoteCandidate('cand-1', 2)

    const updatedRun = useStore.getState().workflowRuns.find((r) => r.id === 'run-1')!
    expect(updatedRun.currentStage).toBe(4)
  })
})

// ─── backtrackCandidate ───

describe('backtrackCandidate', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: '',
      inputImages: [],
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      workflowRuns: [],
      workflowCandidates: [],
      activeWorkflowRunId: null,
      activeCandidateId: null,
      showToast: vi.fn(),
    })
  })

  it('should create a forked candidate with parentCandidateId pointing to source', async () => {
    const source = makeCandidate({ id: 'source-1', runId: 'run-1', stage: 2 })
    useStore.setState({
      workflowRuns: [makeRun({ id: 'run-1' })],
      workflowCandidates: [source],
    })

    const result = await backtrackCandidate('source-1')

    expect(result.parentCandidateId).toBe('source-1')
    expect(result.stage).toBe(2)
    expect(result.decision).toBe('draft')

    const state = useStore.getState()
    expect(state.workflowCandidates).toHaveLength(2)
    expect(state.activeCandidateId).toBe(result.id)
  })

  it('should use specified targetStage for new candidate', async () => {
    const source = makeCandidate({ id: 'source-1', runId: 'run-1', stage: 2 })
    useStore.setState({
      workflowRuns: [makeRun({ id: 'run-1' })],
      workflowCandidates: [source],
    })

    const result = await backtrackCandidate('source-1', 1)

    expect(result.stage).toBe(1)
    expect(result.parentCandidateId).toBe('source-1')
  })

  it('should throw error and show error toast for missing candidate', async () => {
    await expect(backtrackCandidate('nonexistent')).rejects.toThrow('未找到候选')

    expect(useStore.getState().showToast).toHaveBeenCalledWith('未找到候选', 'error')
  })
})

// ─── rollbackRun ───

describe('rollbackRun', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: '',
      inputImages: [],
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      workflowRuns: [],
      workflowCandidates: [],
      activeWorkflowRunId: null,
      activeCandidateId: null,
      showToast: vi.fn(),
    })
  })

  it('should rollback run to target stage and clear active candidate', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 3, activeCandidateId: 'cand-1' })
    useStore.setState({
      workflowRuns: [run],
      workflowCandidates: [makeCandidate({ id: 'cand-1', runId: 'run-1' })],
    })

    await rollbackRun('run-1', 1)

    const state = useStore.getState()
    const updatedRun = state.workflowRuns.find((r) => r.id === 'run-1')!
    expect(updatedRun.currentStage).toBe(1)
    expect(updatedRun.activeCandidateId).toBeNull()
  })

  it('should show error toast for missing run', async () => {
    await rollbackRun('nonexistent', 2)

    expect(useStore.getState().showToast).toHaveBeenCalledWith('未找到工作流', 'error')
  })

  it('should show info toast when already at target stage', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 2 })
    useStore.setState({ workflowRuns: [run] })

    await rollbackRun('run-1', 2)

    const state = useStore.getState()
    expect(state.showToast).toHaveBeenCalledWith('当前已在该阶段', 'info')
    expect(state.workflowRuns.find((r) => r.id === 'run-1')!.currentStage).toBe(2)
  })

  it('should show error toast for invalid target stage', async () => {
    const run = makeRun({ id: 'run-1', currentStage: 2 })
    useStore.setState({ workflowRuns: [run] })

    await rollbackRun('run-1', 5 as WorkflowStage)

    expect(useStore.getState().showToast).toHaveBeenCalledWith('目标阶段必须为 1-4', 'error')
  })
})

// ─── applyBatchDecision ───

describe('applyBatchDecision', () => {
  beforeEach(() => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, apiKey: 'test-key' },
      prompt: '',
      inputImages: [],
      params: { ...DEFAULT_PARAMS },
      tasks: [],
      workflowRuns: [],
      workflowCandidates: [],
      activeWorkflowRunId: null,
      activeCandidateId: null,
      showToast: vi.fn(),
    })
  })

  it('should update only specified candidates to given decision', async () => {
    useStore.setState({
      workflowRuns: [makeRun()],
      workflowCandidates: [
        makeCandidate({ id: 'cand-1', decision: 'draft' }),
        makeCandidate({ id: 'cand-2', decision: 'draft' }),
        makeCandidate({ id: 'cand-3', decision: 'draft' }),
      ],
    })

    await applyBatchDecision(['cand-1', 'cand-2'], 'keep')

    const state = useStore.getState()
    expect(state.workflowCandidates.find((c) => c.id === 'cand-1')!.decision).toBe('keep')
    expect(state.workflowCandidates.find((c) => c.id === 'cand-2')!.decision).toBe('keep')
    expect(state.workflowCandidates.find((c) => c.id === 'cand-3')!.decision).toBe('draft')
  })

  it('should clear existing primary when setting new primary in same run', async () => {
    useStore.setState({
      workflowRuns: [makeRun({ id: 'run-1' })],
      workflowCandidates: [
        makeCandidate({ id: 'cand-1', runId: 'run-1', decision: 'draft' }),
        makeCandidate({ id: 'cand-2', runId: 'run-1', decision: 'primary' }),
      ],
    })

    await applyBatchDecision(['cand-1'], 'primary')

    const state = useStore.getState()
    expect(state.workflowCandidates.find((c) => c.id === 'cand-1')!.decision).toBe('primary')
    expect(state.workflowCandidates.find((c) => c.id === 'cand-2')!.decision).toBe('keep')
  })

  it('should do nothing when candidateIds is empty', async () => {
    useStore.setState({
      workflowRuns: [makeRun()],
      workflowCandidates: [makeCandidate({ id: 'cand-1', decision: 'draft' })],
    })

    await applyBatchDecision([], 'keep')

    const state = useStore.getState()
    expect(state.workflowCandidates.find((c) => c.id === 'cand-1')!.decision).toBe('draft')
  })
})
