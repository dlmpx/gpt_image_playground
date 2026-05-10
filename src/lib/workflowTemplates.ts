import type { WorkflowTemplate } from '../types'
import { DEFAULT_PARAMS } from '../types'

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'stage-1-gacha',
    name: '多文化幻想抽卡',
    stage: 1,
    basePrompt: 'Create a four-view character design sheet (front, side, back, 3/4 view) in 16:9 format. Fully randomize: body type, skin tone, age, racial features, facial structure, eyes, brows, expression, hairstyle, accessories, hands, footwear, clothing layers, fabrics, patterns, decorations. Explore equally: Eastern xianxia, Chinese classical, Japanese fantasy, Western fantasy, cyberpunk, Middle Eastern, South Asian aesthetics. Each output must be a completely different new character. Clean animation style, sharp lines, high quality.',
    cultureBiasNotes: '模型默认严重偏向西方奇幻风格。如果连续 3 次以上输出偏西式，手动追加文化调频关键词（仙侠、武侠、唐风、汉服）。在保持随机性的同时允许轻度文化引导。',
    riskHints: ['随机性幻觉：AI 仍可能过度产出西方风格', '筛选面部辨识度和可塑性', '如果脸和气场完美但种族/肤色/文化不符，保留用于阶段二预备'],
    reviewChecklist: ['四视图面部是否各有辨识度？', '角色是否具备跨风格可塑性？', '有无明显 AI 伪影？', '文化多样性是否达标，还是大部分偏西幻？'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: '选择 2-3 个面部特征强烈的候选，进入阶段二预备进行种族/肤色对齐。',
  },

  {
    id: 'stage-2-prep-align',
    name: '特征对齐（预备）',
    stage: 2,
    basePrompt: 'Using this character design as reference, make targeted adjustments: remove non-human racial features (elf ears etc.) while strictly preserving face shape, features, expression, hair, body type. Adjust skin tone if needed. Maintain all other visual characteristics exactly. Output: standard human version. Same four-view layout, 16:9, clean animation style.',
    lockRules: '脸型、五官、表情、发型、体型必须保持不变。仅允许修改种族标记和肤色。',
    riskHints: ['特征漂移：侧脸/半侧脸最容易丢失面部辨识度', '参考图污染：上一阶段暗色调可能影响输出', '如需修改太多，回到阶段一重新抽更好的底子'],
    reviewChecklist: ['四视图面部是否保持一致？', '种族变更后核心气场是否保留？', '肤色是否自然、光影是否正确？', '侧脸和 3/4 面是否可辨认？'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: '基础特征对齐后锁定，进入阶段二正式发散。',
  },

  {
    id: 'stage-2-formal-diverge',
    name: '锁定特征发散',
    stage: 2,
    basePrompt: 'Lock ALL visual features of this character: face shape, features, eyes, brows, expression, hair, eye color, body type, skin tone -- strictly unchanged. Now freely create new outfits: randomize clothing styles, accessories, gloves, boots, capes, scarves, handheld items. Explore completely different aesthetics and world-building vibes for the same character. Each output is a new variant. Four-view layout, 16:9, clean animation style, high quality.',
    lockRules: '所有基础特征已锁定。仅服装、配饰和造型元素可变。',
    riskHints: ['特征漂移：重点关注侧脸/3/4 面的面部辨识度', '多候选策略：发散 2-3 个底子，交叉比较兼容性', '部分脸型天然排斥某些风格——这是正常现象'],
    reviewChecklist: ['各变体面部特征是否稳定？', '哪个底子与目标风格兼容性最好？', '有无某套服装意外提升角色气质的？'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: '选择最佳变体，进入阶段三进行风格收束。',
  },

  {
    id: 'stage-3-converge',
    name: '风格收束',
    stage: 3,
    basePrompt: 'Lock core identifying features (face shape, features, eyes, brows, expression, body type, skin tone). Now converge exploration toward Eastern fantasy / xianxia aesthetics. Randomize: aura between ethereal-clear and heroic-bold; clothing toward flowing classical cuts -- wide sleeves, gauze layers, silk ribbons, cloud collar, waist cinch, flowing skirt; hair and accessories toward classical Chinese fantasy. Each generation is a new xianxia-style variant. Four-view layout, 16:9, clean animation style, high quality with ethereal atmosphere.',
    lockRules: '核心特征已锁定。风格方向：东方玄幻/仙侠。美学元素在此范围内可变。',
    riskHints: ['风格-角色错配：如果 2-3 轮后仍不理想，退回到阶段二', '参考污染：阶段二的暗色调可能压制仙侠的明亮感——追加氛围提示词'],
    reviewChecklist: ['角色在仙侠风格中是否自然？', '气场是否命中目标？', '有无西方奇幻元素残留？'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: '选择最佳仙侠底子，进入阶段四进行细节细化。',
  },

  {
    id: 'stage-4-refine',
    name: '细节细化',
    stage: 4,
    basePrompt: 'Lock core identifying features. Fix hair color to pure white, eye color to red. Theme: xianxia fairy. Aura randomly oscillates between ethereal-clear and heroic-bold. Weapon: must include sword or umbrella (held, back-worn, slung, floating). Clothing: random xianxia elements -- light gauze, silk ribbons, flowing skirt, wide sleeves, cloud collar, sash, jade ornaments, bells, Chinese knots, tassels. Hands: random bracers, rings, sword-tassel wraps, umbrella-hold poses, spell-casting gestures. Feet: random embroidered shoes, cloud-pattern boots, wrapped-silk leggings, bare feet with fine chains. Atmosphere: talismans, spirit birds, drifting petals, clouds, soft glow. Each generation is a different xianxia outfit variant. Four-view layout, 16:9, clean animation style with ethereal xianxia mood.',
    lockRules: '核心特征 + 白发 + 红瞳已锁定。必须包含武器（剑/伞）。其余细节在仙侠范围内可变。',
    riskHints: ['绝对颜色漂移：白发可能偏蓝/黄，红瞳可能偏棕/粉', '高失败率：四视图 + 密集细节 = 频繁局部伪影', '多样性衰减：过度约束会减少变化——考虑移除 1-2 个约束'],
    reviewChecklist: ['白发和红瞳是否一致？', '剑/伞是否清晰可见且渲染良好？', '仙侠氛围是否明确且有吸引力？', '有无不可接受的伪影？'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: '角色设计完成。可导出或开始新的工作流。',
  },
];

export function getTemplateByStage(stage: number): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.stage === stage)
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id)
}