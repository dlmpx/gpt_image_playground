import type { WorkflowTemplate } from '../types'
import { DEFAULT_PARAMS } from '../types'

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'stage-1-gacha',
    name: 'Multi-culture Fantasy Gacha',
    stage: 1,
    basePrompt: 'Create a four-view character design sheet (front, side, back, 3/4 view) in 16:9 format. Fully randomize: body type, skin tone, age, racial features, facial structure, eyes, brows, expression, hairstyle, accessories, hands, footwear, clothing layers, fabrics, patterns, decorations. Explore equally: Eastern xianxia, Chinese classical, Japanese fantasy, Western fantasy, cyberpunk, Middle Eastern, South Asian aesthetics. Each output must be a completely different new character. Clean animation style, sharp lines, high quality.',
    cultureBiasNotes: 'Model defaults heavily toward Western fantasy aesthetics. If 3+ consecutive outputs skew Western, manually append cultural steering keywords (xianxia, wuxia, Tang, Hanfu). This preserves randomness while allowing light cultural steering.',
    riskHints: ['Randomness illusion: AI may still over-produce Western styles', 'Screen for facial distinctiveness and plasticity', 'If face and aura are perfect but race/skin/culture is off, keep it for Stage 2 prep'],
    reviewChecklist: ['Face distinctive across all 4 views?', 'Character has plasticity for different styles?', 'Any obvious AI artifacts?', 'Getting cultural variety or mostly Western fantasy?'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: 'Select 2-3 candidates with strong facial character. Proceed to Stage 2 prep for race/skin alignment.',
  },

  {
    id: 'stage-2-prep-align',
    name: 'Feature Alignment (Prep)',
    stage: 2,
    basePrompt: 'Using this character design as reference, make targeted adjustments: remove non-human racial features (elf ears etc.) while strictly preserving face shape, features, expression, hair, body type. Adjust skin tone if needed. Maintain all other visual characteristics exactly. Output: standard human version. Same four-view layout, 16:9, clean animation style.',
    lockRules: 'Face shape, facial features, expression, hairstyle, body type MUST remain unchanged. Only modify race markers and skin tone.',
    riskHints: ['Feature drift: side/profile views most prone to losing facial identity', 'Reference contamination: previous stage dark/cool tones may affect output', 'If too many changes needed, go back to Stage 1 for better base'],
    reviewChecklist: ['Face preserved in all views?', 'Core aura intact after race change?', 'Skin tone looks natural with correct shading?', 'Side and 3/4 view faces recognizable?'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: 'Once basic features are aligned, lock them and proceed to Stage 2 Formal.',
  },

  {
    id: 'stage-2-formal-diverge',
    name: 'Locked Feature Divergence',
    stage: 2,
    basePrompt: 'Lock ALL visual features of this character: face shape, features, eyes, brows, expression, hair, eye color, body type, skin tone -- strictly unchanged. Now freely create new outfits: randomize clothing styles, accessories, gloves, boots, capes, scarves, handheld items. Explore completely different aesthetics and world-building vibes for the same character. Each output is a new variant. Four-view layout, 16:9, clean animation style, high quality.',
    lockRules: 'ALL base features locked. Only clothing, accessories, and styling elements are variable.',
    riskHints: ['Feature drift: focus on side/3/4 view facial recognition', 'Multi-candidate strategy: diverge 2-3 bases, compare cross-compatibility', 'Some face structures naturally reject certain styles -- this is normal'],
    reviewChecklist: ['Facial features stable across variants?', 'Which base compatible with target style?', 'Any outfit unexpectedly enhancing character aura?'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: 'Select the best variant. Proceed to Stage 3 for style convergence.',
  },

  {
    id: 'stage-3-converge',
    name: 'Style Convergence',
    stage: 3,
    basePrompt: 'Lock core identifying features (face shape, features, eyes, brows, expression, body type, skin tone). Now converge exploration toward Eastern fantasy / xianxia aesthetics. Randomize: aura between ethereal-clear and heroic-bold; clothing toward flowing classical cuts -- wide sleeves, gauze layers, silk ribbons, cloud collar, waist cinch, flowing skirt; hair and accessories toward classical Chinese fantasy. Each generation is a new xianxia-style variant. Four-view layout, 16:9, clean animation style, high quality with ethereal atmosphere.',
    lockRules: 'Core features locked. Style direction: Eastern fantasy / xianxia. Aesthetic elements variable within this domain.',
    riskHints: ['Style-character mismatch: if 2-3 rounds still mediocre, fall back to Stage 2', 'Reference pollution: dark tones from Stage 2 may mute xianxia brightness -- add atmosphere note'],
    reviewChecklist: ['Character feel natural in xianxia?', 'Aura hitting target?', 'Any unwanted Western fantasy elements leaking?'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: 'Select the best xianxia base. Proceed to Stage 4 for detail refinement.',
  },

  {
    id: 'stage-4-refine',
    name: 'Detail Refinement',
    stage: 4,
    basePrompt: 'Lock core identifying features. Fix hair color to pure white, eye color to red. Theme: xianxia fairy. Aura randomly oscillates between ethereal-clear and heroic-bold. Weapon: must include sword or umbrella (held, back-worn, slung, floating). Clothing: random xianxia elements -- light gauze, silk ribbons, flowing skirt, wide sleeves, cloud collar, sash, jade ornaments, bells, Chinese knots, tassels. Hands: random bracers, rings, sword-tassel wraps, umbrella-hold poses, spell-casting gestures. Feet: random embroidered shoes, cloud-pattern boots, wrapped-silk leggings, bare feet with fine chains. Atmosphere: talismans, spirit birds, drifting petals, clouds, soft glow. Each generation is a different xianxia outfit variant. Four-view layout, 16:9, clean animation style with ethereal xianxia mood.',
    lockRules: 'Core features + hair white + eyes red. Weapon (sword/umbrella) required. All other details variable within xianxia domain.',
    riskHints: ['Absolute color drift: white hair may shift blue/yellow, red eyes may shift brown/pink', 'High failure rate: 4-view + dense details = frequent local artifacts', 'Diversity decay: over-constrained prompts reduce variation -- consider removing 1-2 constraints'],
    reviewChecklist: ['White hair and red eyes consistent?', 'Sword/umbrella visible and well-rendered?', 'Xianxia atmosphere clear and appealing?', 'Any deal-breaking artifacts?'],
    defaultParams: { ...DEFAULT_PARAMS, n: 1, quality: 'high' },
    advanceInstruction: 'Character design complete. Export or start a new workflow run.',
  },
];

export function getTemplateByStage(stage: number): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.stage === stage)
}

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id)
}