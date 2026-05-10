import { useState, useRef } from 'react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'

interface PromotionChecklistModalProps {
  items: string[]
  stageNumber: number
  stageName: string
  onConfirm: () => void
  onCancel: () => void
}

export default function PromotionChecklistModal({
  items,
  stageNumber,
  stageName,
  onConfirm,
  onCancel,
}: PromotionChecklistModalProps) {
  const [checked, setChecked] = useState<boolean[]>(() => new Array(items.length).fill(false))
  const modalRef = useRef<HTMLDivElement>(null)

  useCloseOnEscape(true, onCancel)
  usePreventBackgroundScroll(true, modalRef)

  const allChecked = checked.length > 0 && checked.every(Boolean)

  const toggleItem = (index: number) => {
    setChecked((prev) => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-md animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border border-white/50 dark:border-white/[0.08] rounded-3xl shadow-[0_8px_40px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgb(0,0,0,0.4)] max-w-md w-full p-6 z-10 ring-1 ring-black/5 dark:ring-white/10 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题行 */}
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            晋级前检查清单
          </h3>
          <span className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-500/20 px-2.5 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
            阶段{stageNumber} · {stageName}
          </span>
        </div>

        {/* 引导文案 */}
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          请逐项确认以下检查项，全部通过后方可晋级：
        </p>

        {/* 检查清单 */}
        <div className="space-y-2 mb-6">
          {items.map((item, index) => (
            <label
              key={index}
              className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
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
              <span className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {item}
              </span>
            </label>
          ))}
        </div>

        {/* 底部按钮行 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!allChecked}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
              allChecked
                ? 'bg-purple-500 text-white hover:bg-purple-600'
                : 'bg-gray-200 dark:bg-white/[0.05] text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
          >
            确认晋级
          </button>
        </div>
      </div>
    </div>
  )
}
