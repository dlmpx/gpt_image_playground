import { useStore } from '../store'
import Select from './Select'

const RATING_FILTER_OPTIONS = [
  { label: '全部评分', value: 'all' },
  { label: '已评分', value: 'rated' },
  { label: '★★★★★', value: '5' },
  { label: '★★★★', value: '4' },
  { label: '★★★', value: '3' },
  { label: '★★', value: '2' },
  { label: '★', value: '1' },
  { label: '未评分', value: 'unrated' },
]

export default function SearchBar() {
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const setFilterStatus = useStore((s) => s.setFilterStatus)
  const filterRating = useStore((s) => s.filterRating)
  const setFilterRating = useStore((s) => s.setFilterRating)
  const tasks = useStore((s) => s.tasks)

  const ratingFilterValue =
    filterRating == null ? 'all' :
    filterRating === -1 ? 'rated' :
    filterRating === -2 ? 'unrated' :
    String(filterRating)
  // 特殊值 'rated' 和 'unrated' 不走数字路径
  const resolveRatingFilter = (val: string): number | null | 'rated' | 'unrated' => {
    if (val === 'rated') return 'rated'
    if (val === 'unrated') return 'unrated'
    if (val === 'all') return null
    const n = Number(val)
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
  }

  const visibleCount = tasks.filter((t) => {
    if (filterStatus === 'trashed') {
      if (!t.trashedAt) return false
    } else {
      if (t.trashedAt) return false
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
    }
    const rf = resolveRatingFilter(ratingFilterValue)
    if (rf === 'rated' && (t.rating == null || t.rating < 1)) return false
    if (rf === 'unrated' && t.rating != null && t.rating >= 1) return false
    if (typeof rf === 'number' && t.rating !== rf) return false
    if (searchQuery && !t.prompt?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  }).length

  return (
    <div data-no-drag-select className="mt-6 mb-4 flex gap-3">
      <div className="flex gap-2 flex-shrink-0 z-20">
        <div className="relative w-28">
          <Select
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as any)}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已完成', value: 'done' },
              { label: '生成中', value: 'running' },
              { label: '失败', value: 'error' },
              { label: '已弃置', value: 'trashed' },
            ]}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-white/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
        </div>
        <div className="relative w-28">
          <Select
            value={ratingFilterValue}
            onChange={(val) => {
              const resolved = resolveRatingFilter(val)
              if (resolved == null) { setFilterRating(null) }
              else if (resolved === 'rated') { setFilterRating(-1) } // 使用 -1 标记"已评分"
              else if (resolved === 'unrated') { setFilterRating(-2) } // 使用 -2 标记"未评分"
              else { setFilterRating(resolved as number) }
            }}
            options={RATING_FILTER_OPTIONS}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-white/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
        </div>
      </div>
      <div className="relative flex-1 z-10">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          type="text"
          placeholder="搜索提示词、参数..."
          className="w-full pl-10 pr-16 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
        {(searchQuery || filterStatus !== 'all' || filterRating != null) && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500">
            {visibleCount} 条
          </span>
        )}
      </div>
    </div>
  )
}
