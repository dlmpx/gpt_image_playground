import { useEffect } from 'react'
import { initStore, rateTask, rateSelectedTasks } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import WorkflowPanel from './components/WorkflowPanel'
import BranchTree from './components/BranchTree'
import CompareModal from './components/CompareModal'

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const inputBarMinimized = useStore((s) => s.inputBarMinimized)
  useDockerApiUrlMigrationNotice()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    initStore()
  }, [setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  // 全局快捷键：Cmd/Ctrl + 1~5 评分
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return
      const digit = parseInt(e.key)
      if (!Number.isFinite(digit) || digit < 1 || digit > 5) return

      // 打字时不触发
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      e.preventDefault()

      const state = useStore.getState()
      if (state.detailTaskId) {
        rateTask(state.detailTaskId, digit)
      } else if (state.lightboxImageId) {
        const task = state.tasks.find((t) => t.outputImages.includes(state.lightboxImageId!))
        if (task) rateTask(task.id, digit)
      } else if (state.selectedTaskIds.length) {
        rateSelectedTasks(digit)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMac])

  return (
    <>
      <Header />
      <main
        data-home-main
        data-drag-select-surface
        className={inputBarMinimized ? 'pb-24 sm:pb-28' : 'pb-48'}
      >
        <div className="safe-area-x max-w-7xl mx-auto">
          <SearchBar />
          <TaskGrid />
        </div>
      </main>
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
      <WorkflowPanel />
      <BranchTree />
      <CompareModal />
    </>
  )
}
