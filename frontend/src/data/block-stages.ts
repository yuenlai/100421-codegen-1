import type { BlockStage } from './types'

// 流水视图只呈现四个阶段；台账里更细的状态归并到对应阶段列。
export const BLOCK_STAGES: BlockStage[] = ['下料', '装配', '焊接', '完工']

// 拖动卡片落到某一阶段后，写回台账的具体状态（每列选一个代表状态）。
export const STAGE_STATUS: Record<BlockStage, string> = {
  下料: '下料中',
  装配: '装配中',
  焊接: '焊接中',
  完工: '已完工',
}

export function stageOfStatus(status: string): BlockStage {
  if (status === '装配中') return '装配'
  if (status === '焊接中') return '焊接'
  if (status === '已完工') return '完工'
  // 「待开工」与「下料中」都归到下料阶段列。
  return '下料'
}
