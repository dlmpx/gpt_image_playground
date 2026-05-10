import { useMemo } from 'react'
import { useStore, getCachedImage, setActiveCandidate, setShowBranchTree } from '../store'
import type { WorkflowCandidate, WorkflowStage, CandidateDecision } from '../types'

// ===== 布局常量 =====

const NODE_WIDTH = 120
const NODE_HEIGHT = 80
const VERTICAL_GAP = 180
const HORIZONTAL_GAP = 200
const START_Y = 80
const MIN_CANVAS_WIDTH = 800
const MIN_CANVAS_HEIGHT = 600

// ===== 标签映射 =====

const stageLabels: Record<WorkflowStage, string> = {
  1: '抽卡',
  2: '对齐发散',
  3: '收束',
  4: '细化',
}

const decisionColors: Record<CandidateDecision, string> = {
  draft: '#9ca3af',
  keep: '#22c55e',
  promoted: '#a855f7',
  discarded: '#ef4444',
  favorite: '#eab308',
  primary: '#3b82f6',
}

// ===== 布局节点类型 =====

interface LayoutNode {
  candidate: WorkflowCandidate
  x: number
  y: number
}

// ===== 分支树组件 =====

export default function BranchTree() {
  const workflowCandidates = useStore((s) => s.workflowCandidates)
  const activeWorkflowRunId = useStore((s) => s.activeWorkflowRunId)
  const showBranchTree = useStore((s) => s.showBranchTree)

  // 过滤出当前活跃 Run 的候选
  const runCandidates = useMemo(
    () => workflowCandidates.filter((c) => c.runId === activeWorkflowRunId),
    [workflowCandidates, activeWorkflowRunId],
  )

  // ===== 树布局算法（从上到下） =====

  const { layoutMap, canvasWidth, canvasHeight } = useMemo(() => {
    if (runCandidates.length === 0) {
      return {
        layoutMap: new Map<string, LayoutNode>(),
        canvasWidth: MIN_CANVAS_WIDTH,
        canvasHeight: MIN_CANVAS_HEIGHT,
      }
    }

    // 按 parentCandidateId 分组子节点
    const childrenMap = new Map<string, WorkflowCandidate[]>()
    for (const c of runCandidates) {
      const key = c.parentCandidateId || '__root__'
      const list = childrenMap.get(key) || []
      list.push(c)
      childrenMap.set(key, list)
    }

    // 每个父节点下的子节点按 createdAt 升序排列
    for (const [, children] of childrenMap) {
      children.sort((a, b) => a.createdAt - b.createdAt)
    }

    const layoutMap = new Map<string, LayoutNode>()

    // 计算子树宽度（叶子节点数量）
    function calcSubtreeWidth(candidateId: string): number {
      const children = childrenMap.get(candidateId) || []
      if (children.length === 0) return 1
      return children.reduce((sum, child) => sum + calcSubtreeWidth(child.id), 0)
    }

    // 递归布局：给定父节点位置，布局其所有子节点
    function layoutChildren(parentId: string, parentX: number, parentY: number): void {
      const children = childrenMap.get(parentId) || []
      if (children.length === 0) return

      const totalWidth = children.reduce((sum, child) => sum + calcSubtreeWidth(child.id), 0)
      const totalPixelWidth = (totalWidth - 1) * HORIZONTAL_GAP
      let currentX = parentX - totalPixelWidth / 2

      for (const child of children) {
        const subtreeWidth = calcSubtreeWidth(child.id)
        const childX = currentX + ((subtreeWidth - 1) * HORIZONTAL_GAP) / 2
        const childY = parentY + VERTICAL_GAP
        layoutMap.set(child.id, { candidate: child, x: childX, y: childY })
        layoutChildren(child.id, childX, childY)
        currentX += subtreeWidth * HORIZONTAL_GAP
      }
    }

    // 处理根节点（parentCandidateId === null）
    const roots = childrenMap.get('__root__') || []
    if (roots.length === 0) {
      return {
        layoutMap,
        canvasWidth: MIN_CANVAS_WIDTH,
        canvasHeight: MIN_CANVAS_HEIGHT,
      }
    }

    const totalRootWidth = roots.reduce((sum, root) => sum + calcSubtreeWidth(root.id), 0)
    const totalPixelWidth = (totalRootWidth - 1) * HORIZONTAL_GAP
    let currentX = -totalPixelWidth / 2

    for (const root of roots) {
      const subtreeWidth = calcSubtreeWidth(root.id)
      const rootX = currentX + ((subtreeWidth - 1) * HORIZONTAL_GAP) / 2
      layoutMap.set(root.id, { candidate: root, x: rootX, y: START_Y })
      layoutChildren(root.id, rootX, START_Y)
      currentX += subtreeWidth * HORIZONTAL_GAP
    }

    // 计算实际需要的画布尺寸
    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [, node] of layoutMap) {
      minX = Math.min(minX, node.x)
      maxX = Math.max(maxX, node.x + NODE_WIDTH)
      maxY = Math.max(maxY, node.y + NODE_HEIGHT)
    }

    // 偏移到正坐标空间
    const offsetX = -minX + 50
    const offsetY = 50
    for (const [, node] of layoutMap) {
      node.x += offsetX
      node.y += offsetY
    }

    const canvasW = Math.max(maxX + offsetX + 50, MIN_CANVAS_WIDTH)
    const canvasH = Math.max(maxY + offsetY + 50, MIN_CANVAS_HEIGHT)

    return { layoutMap, canvasWidth: canvasW, canvasHeight: canvasH }
  }, [runCandidates])

  // ===== 节点点击 =====

  const handleNodeClick = (candidateId: string) => {
    setActiveCandidate(candidateId)
  }

  // ===== 渲染判断 =====

  if (!showBranchTree) return null

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-overlay-in">
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl animate-modal-in"
        style={{ width: '90vw', height: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/[0.06]">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">分支树</h2>
          <button
            onClick={() => setShowBranchTree(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] text-gray-400 transition"
            title="关闭"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* SVG 树图区域 */}
        <div className="w-full" style={{ height: 'calc(100% - 48px)' }}>
          {runCandidates.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              <p>暂无候选，请先在任务详情中纳入工作流</p>
            </div>
          ) : (
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            >
              {/* 连线（edges）：从父节点底部到子节点顶部 */}
              {runCandidates
                .filter((c) => c.parentCandidateId)
                .map((c) => {
                  const child = layoutMap.get(c.id)
                  const parent = layoutMap.get(c.parentCandidateId!)
                  if (!child || !parent) return null
                  const decision: CandidateDecision = c.decision
                  const color = decisionColors[decision] || decisionColors.draft
                  const isDashed = decision === 'draft'

                  const x1 = parent.x + NODE_WIDTH / 2
                  const y1 = parent.y + NODE_HEIGHT
                  const x2 = child.x + NODE_WIDTH / 2
                  const y2 = child.y
                  const midY = (y1 + y2) / 2

                  return (
                    <path
                      key={`edge-${c.id}`}
                      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray={isDashed ? '4 2' : undefined}
                      fill="none"
                    />
                  )
                })}

              {/* 节点（nodes） */}
              {runCandidates.map((candidate) => {
                const node = layoutMap.get(candidate.id)
                if (!node) return null
                const decision: CandidateDecision = candidate.decision
                const bgColor = decisionColors[decision] || decisionColors.draft
                const thumbnail = getCachedImage(candidate.primaryImageId)

                return (
                  <g
                    key={candidate.id}
                    data-node={candidate.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => handleNodeClick(candidate.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* 节点外框 */}
                    <rect
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx={10}
                      fill={`${bgColor}1a`}
                      stroke={`${bgColor}66`}
                      strokeWidth={1}
                    />

                    {/* Decision 状态圆点 */}
                    <circle cx={NODE_WIDTH - 10} cy={10} r={5} fill={bgColor} />

                    {/* 缩略图区域 */}
                    {thumbnail ? (
                      <image
                        href={thumbnail}
                        x={6}
                        y={6}
                        width={48}
                        height={48}
                        preserveAspectRatio="xMidYMid slice"
                        clipPath="url(#thumbClip)"
                      />
                    ) : (
                      <rect
                        x={6}
                        y={6}
                        width={48}
                        height={48}
                        rx={4}
                        fill="#e5e7eb"
                      />
                    )}

                    {/* 候选标识文本 */}
                    <text x={60} y={32} fontSize={10} fill="#6b7280" textAnchor="start">
                      {candidate.notes
                        ? candidate.notes.slice(0, 10)
                        : candidate.id.slice(-6)}
                    </text>

                    {/* 阶段标签 */}
                    <text x={60} y={48} fontSize={9} fill="#9ca3af" textAnchor="start">
                      S{candidate.stage} {stageLabels[candidate.stage]}
                    </text>
                  </g>
                )
              })}

              {/* 缩略图裁剪路径 */}
              <defs>
                <clipPath id="thumbClip">
                  <rect x={6} y={6} width={48} height={48} rx={4} />
                </clipPath>
              </defs>
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
