import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppSettings,
  TaskParams,
  InputImage,
  MaskDraft,
  TaskRecord,
} from './types'
import { DEFAULT_PARAMS } from './types'
import { DEFAULT_SETTINGS, normalizeSettings } from './lib/apiProfiles'
import { orderImagesWithMaskFirst, invalidateCachedImage } from './stores/imageStore'

export type {
  ApiProfile,
  AppSettings,
  TaskParams,
  InputImage,
  MaskDraft,
  TaskRecord,
  TaskStatus,
  ExportData,
  StoredImage,
  StoredImageThumbnail,
  WorkflowStage,
  WorkflowRun,
  WorkflowCandidate,
  WorkflowTemplate,
  CandidateDecision,
  WorkflowPromotion,
  CustomProviderDefinition,
  CustomProviderTemplate,
  ApiMode,
  BuiltInApiProvider,
  ApiProvider,
} from './types'

export { DEFAULT_PARAMS } from './types'

export {
  getCachedImage,
  cacheImage,
  ensureImageCached,
  ensureImageThumbnailCached,
  subscribeImageThumbnail,
  exportData,
  importData,
  addImageFromFile,
  addImageFromUrl,
} from './stores/imageStore'

export type { ExportProgress, ExportOptions, ImportOptions } from './stores/imageStore'

export {
  genId,
  getCodexCliPromptKey,
  markInterruptedOpenAIRunningTasks,
  showCodexCliPrompt,
  getTaskApiProfile,
  initStore,
  submitTask,
  updateTaskInStore,
  rateTask,
  rateSelectedTasks,
  retryTask,
  reuseConfig,
  editOutputs,
  removeMultipleTasks,
  removeTask,
  trashTask,
  restoreTask,
  toggleTrashTask,
  emptyTrash,
  clearData,
} from './stores/taskStore'

export type { ClearOptions } from './stores/taskStore'

export {
  createWorkflowRun,
  addWorkflowCandidateFromTask,
  promoteCandidateToStage,
  setActiveWorkflowRun,
  setActiveCandidate,
  setShowWorkflowPanel,
  setShowBranchTree,
  removeWorkflowRun,
  setCandidateDecision,
  updateCandidateNotes,
  crossStagePromoteCandidate,
  backtrackCandidate,
  rollbackRun,
  applyBatchDecision,
  setComparedCandidates,
  setShowCompareModal,
} from './stores/workflowStore'

export interface AppState {
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void
  dismissedCodexCliPrompts: string[]
  dismissCodexCliPrompt: (key: string) => void

  prompt: string
  setPrompt: (p: string) => void
  inputImages: InputImage[]
  addInputImage: (img: InputImage) => void
  removeInputImage: (idx: number) => void
  clearInputImages: () => void
  setInputImages: (imgs: InputImage[]) => void
  moveInputImage: (fromIdx: number, toIdx: number) => void
  maskDraft: MaskDraft | null
  setMaskDraft: (draft: MaskDraft | null) => void
  clearMaskDraft: () => void
  maskEditorImageId: string | null
  setMaskEditorImageId: (id: string | null) => void

  params: TaskParams
  setParams: (p: Partial<TaskParams>) => void
  reusedTaskApiProfileId: string | null
  reusedTaskApiProfileName: string | null
  reusedTaskApiProfileMissing: boolean
  setReusedTaskApiProfile: (profileId: string | null, missing?: boolean, profileName?: string | null) => void

  tasks: TaskRecord[]
  setTasks: (t: TaskRecord[]) => void

  searchQuery: string
  setSearchQuery: (q: string) => void
  filterStatus: 'all' | 'running' | 'done' | 'error' | 'trashed'
  setFilterStatus: (status: AppState['filterStatus']) => void
  filterRating: number | null
  setFilterRating: (r: number | null) => void

  selectedTaskIds: string[]
  setSelectedTaskIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleTaskSelection: (id: string, force?: boolean) => void
  clearSelection: () => void

  detailTaskId: string | null
  setDetailTaskId: (id: string | null) => void
  lightboxImageId: string | null
  lightboxImageList: string[]
  setLightboxImageId: (id: string | null, list?: string[]) => void
  inputBarMinimized: boolean
  setInputBarMinimized: (v: boolean) => void
  showSettings: boolean
  setShowSettings: (v: boolean) => void

  toast: { message: string; type: 'info' | 'success' | 'error' } | null
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void

  workflowRuns: import('./types').WorkflowRun[]
  workflowCandidates: import('./types').WorkflowCandidate[]
  activeWorkflowRunId: string | null
  activeCandidateId: string | null
  comparedCandidateIds: string[]
  showBranchTree: boolean
  showCompareModal: boolean
  showWorkflowPanel: boolean

  confirmDialog: {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    showCancel?: boolean
    icon?: 'info' | 'copy'
    minConfirmDelayMs?: number
    messageAlign?: 'left' | 'center'
    tone?: 'danger' | 'warning'
    action: () => void
    cancelAction?: () => void
  } | null
  setConfirmDialog: (d: AppState['confirmDialog']) => void
}

export function getPersistedState(state: AppState) {
  const settings = normalizeSettings(state.settings)
  return {
    settings,
    params: state.params,
    ...(settings.persistInputOnRestart
      ? {
          prompt: state.prompt,
          inputImages: state.inputImages.map((img) => ({ id: img.id, dataUrl: '' })),
        }
      : {}),
    dismissedCodexCliPrompts: state.dismissedCodexCliPrompts,
  }
}

function mergePersistedState(persistedState: unknown, currentState: AppState): AppState {
  if (!persistedState || typeof persistedState !== 'object') return currentState

  const persisted = persistedState as Partial<AppState>
  const settings = normalizeSettings(persisted.settings ?? currentState.settings)
  return {
    ...currentState,
    ...persisted,
    settings,
    prompt: settings.persistInputOnRestart && typeof persisted.prompt === 'string' ? persisted.prompt : '',
    inputImages: settings.persistInputOnRestart && Array.isArray(persisted.inputImages) ? persisted.inputImages : [],
  }
}

export const useStore = create<AppState>()(
  persist(
    (set, _get) => ({
      settings: { ...DEFAULT_SETTINGS },
      setSettings: (s) => set((st) => {
        const previous = normalizeSettings(st.settings)
        const incoming = s as Partial<AppSettings>
        const hasLegacyOverrides =
          incoming.baseUrl !== undefined ||
          incoming.apiKey !== undefined ||
          incoming.model !== undefined ||
          incoming.timeout !== undefined ||
          incoming.apiMode !== undefined ||
          incoming.codexCli !== undefined ||
          incoming.apiProxy !== undefined
        const merged = normalizeSettings({ ...previous, ...incoming })
        if (hasLegacyOverrides && incoming.profiles === undefined) {
          merged.profiles = merged.profiles.map((profile) =>
            profile.id === merged.activeProfileId
              ? {
                  ...profile,
                  baseUrl: incoming.baseUrl ?? profile.baseUrl,
                  apiKey: incoming.apiKey ?? profile.apiKey,
                  model: incoming.model ?? profile.model,
                  timeout: incoming.timeout ?? profile.timeout,
                  apiMode: incoming.apiMode === 'images' || incoming.apiMode === 'responses' ? incoming.apiMode : profile.apiMode,
                  codexCli: incoming.codexCli ?? profile.codexCli,
                  apiProxy: incoming.apiProxy ?? profile.apiProxy,
                }
              : profile,
          )
        }
        const settings = normalizeSettings(merged)
        const shouldClearReusedProfile = st.reusedTaskApiProfileId && settings.activeProfileId === st.reusedTaskApiProfileId
        return {
          settings,
          ...(shouldClearReusedProfile
            ? { reusedTaskApiProfileId: null, reusedTaskApiProfileName: null, reusedTaskApiProfileMissing: false }
            : {}),
        }
      }),
      dismissedCodexCliPrompts: [],
      dismissCodexCliPrompt: (key) => set((st) => ({
        dismissedCodexCliPrompts: st.dismissedCodexCliPrompts.includes(key)
          ? st.dismissedCodexCliPrompts
          : [...st.dismissedCodexCliPrompts, key],
      })),

      prompt: '',
      setPrompt: (prompt) => set({ prompt }),
      inputImages: [],
      addInputImage: (img) =>
        set((s) => {
          if (s.inputImages.find((i) => i.id === img.id)) return s
          return { inputImages: [...s.inputImages, img] }
        }),
      removeInputImage: (idx) =>
        set((s) => {
          const removed = s.inputImages[idx]
          const shouldClearMask = removed?.id === s.maskDraft?.targetImageId
          return {
            inputImages: s.inputImages.filter((_, i) => i !== idx),
            ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
          }
        }),
      clearInputImages: () =>
        set((s) => {
          for (const img of s.inputImages) invalidateCachedImage(img.id)
          return { inputImages: [], maskDraft: null, maskEditorImageId: null }
        }),
      setInputImages: (imgs) =>
        set((s) => {
          const inputImages = orderImagesWithMaskFirst(imgs, s.maskDraft?.targetImageId)
          const shouldClearMask =
            Boolean(s.maskDraft) && !inputImages.some((img) => img.id === s.maskDraft?.targetImageId)
          return {
            inputImages,
            ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
          }
        }),
      moveInputImage: (fromIdx, toIdx) =>
        set((s) => {
          const images = [...s.inputImages]
          if (fromIdx < 0 || fromIdx >= images.length) return s
          const maskTargetImageId = s.maskDraft?.targetImageId
          if (maskTargetImageId && images[fromIdx]?.id === maskTargetImageId) return s
          const minTargetIdx = maskTargetImageId && images.some((img) => img.id === maskTargetImageId) ? 1 : 0
          const targetIdx = Math.max(minTargetIdx, Math.min(images.length, toIdx))
          const insertIdx = fromIdx < targetIdx ? targetIdx - 1 : targetIdx
          if (insertIdx === fromIdx) return s
          const [moved] = images.splice(fromIdx, 1)
          images.splice(insertIdx, 0, moved)
          return { inputImages: images }
        }),
      maskDraft: null,
      setMaskDraft: (maskDraft) =>
        set((s) => ({
          maskDraft,
          inputImages: orderImagesWithMaskFirst(s.inputImages, maskDraft?.targetImageId),
        })),
      clearMaskDraft: () => set({ maskDraft: null }),
      maskEditorImageId: null,
      setMaskEditorImageId: (maskEditorImageId) => set({ maskEditorImageId }),

      params: { ...DEFAULT_PARAMS },
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
      setReusedTaskApiProfile: (profileId, missing = false, profileName = null) => set({
        reusedTaskApiProfileId: profileId,
        reusedTaskApiProfileName: profileName,
        reusedTaskApiProfileMissing: missing,
      }),

      tasks: [],
      setTasks: (tasks) => set({ tasks }),

      searchQuery: '',
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      filterStatus: 'all',
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      filterRating: null,
      setFilterRating: (filterRating) => set({ filterRating }),

      selectedTaskIds: [],
      setSelectedTaskIds: (updater) => set((s) => ({
        selectedTaskIds: typeof updater === 'function' ? updater(s.selectedTaskIds) : updater
      })),
      toggleTaskSelection: (id, force) => set((s) => {
        const isSelected = s.selectedTaskIds.includes(id)
        const shouldSelect = force !== undefined ? force : !isSelected
        if (shouldSelect === isSelected) return s
        return {
          selectedTaskIds: shouldSelect
            ? [...s.selectedTaskIds, id]
            : s.selectedTaskIds.filter((x) => x !== id)
        }
      }),
      clearSelection: () => set({ selectedTaskIds: [] }),

      detailTaskId: null,
      setDetailTaskId: (detailTaskId) => set({ detailTaskId }),
      lightboxImageId: null,
      lightboxImageList: [],
      setLightboxImageId: (lightboxImageId, list) =>
        set({ lightboxImageId, lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []) }),
      inputBarMinimized: false,
      setInputBarMinimized: (inputBarMinimized) => set({ inputBarMinimized }),
      showSettings: false,
      setShowSettings: (showSettings) => set({ showSettings }),

      toast: null,
      showToast: (message, type = 'info') => {
        set({ toast: { message, type } })
        setTimeout(() => {
          set((s) => (s.toast?.message === message ? { toast: null } : s))
        }, 3000)
      },

      workflowRuns: [],
      workflowCandidates: [],
      activeWorkflowRunId: null,
      activeCandidateId: null,
      comparedCandidateIds: [],
      showBranchTree: false,
      showCompareModal: false,
      showWorkflowPanel: false,

      confirmDialog: null,
      setConfirmDialog: (confirmDialog) => set({ confirmDialog }),
    }),
    {
      name: 'gpt-image-playground',
      partialize: getPersistedState,
      merge: mergePersistedState,
    },
  ),
)
