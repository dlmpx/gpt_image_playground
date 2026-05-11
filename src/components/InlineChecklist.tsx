import { useState, useEffect } from 'react'
import type { WorkflowStage } from '../types'

interface InlineChecklistProps {
  items: string[]
  stageNumber: WorkflowStage
  stageName: string
  onConfirmAll: () => void
  onConfirm: () => void
  onCancel: () => void
}

export default function InlineChecklist({
  items,
  stageNumber,
  stageName,
  onConfirmAll,
  onConfirm,
  onCancel,
}: InlineChecklistProps) {
  const [checked, setChecked] = useState<boolean[]>(
    () => new Array(items.length).fill(false),
  )

  const allChecked = checked.length > 0 && checked.every(Boolean)

  const toggleItem = (index: number) => {
    setChecked((prev) => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }

  const handleConfirmAll = () => {
    setChecked(new Array(items.length).fill(true))
    onConfirmAll()
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="animate-scale-in rounded-2xl border border-purple-200 dark:border-purple-500/20 bg-purple-50/50 dark:bg-purple-500/5 p-4">
      {/* 头部行 */}
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          晋级前检查清单
        </h3>
        <span className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
          阶段{stageNumber} · {stageName}
        </span>
      </div>

      {/* 引导文案 */}
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        请逐项确认以下检查项，全部通过后方可晋级：
      </p>

      {/* 检查项列表 */}
      <div className="space-y-1.5 mb-4">
        {items.map((item, index) => (
          <label
            key={index}
            className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer ${
              checked[index]
                ? 'border-purple-300 dark:border-purple-500/30 bg-purple-50/50 dark:bg-purple-500/10'
                : 'border-gray-200 dark:border-white/[0.08] bg-gray-50/50 dark:bg-white/[0.02] hover:border-purple-200 dark:hover:border-purple-500/20'
            }`}
          >
            <input
              type="checkbox"
              checked={checked[index]}
              onChange={() => toggleItem(index)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 cursor-pointer accent-purple-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
              {item}
            </span>
          </label>
        ))}
      </div>

      {/* 按钮行 */}
      <div className="flex gap-2">
        <button
          onClick={handleConfirmAll}
          className="flex-1 px-3 py-2 rounded-xl bg-purple-500 text-white hover:bg-purple-600 transition text-xs font-medium"
        >
          全部确认并晋级
        </button>
        <button
          onClick={onConfirm}
          disabled={!allChecked}
          className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition ${
            allChecked
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-gray-200 dark:bg-white/[0.05] text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          确认晋级
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition text-xs font-medium"
        >
          取消
        </button>
      </div>
    </div>
  )
}
