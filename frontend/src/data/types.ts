/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}

/** 船体车间流水视图：下料 → 装配 → 焊接 → 完工 四个阶段。 */
export type BlockStage = '下料' | '装配' | '焊接' | '完工'

/** 工时标准按钢材牌号分档；标准改版只生成新版本，既有单子按旧版本口径保留。 */
export type LaborStandard = {
  version: string
  工时每吨: Record<string, number>
  updatedAt: string
}

export type LaborStandardBook = {
  currentVersion: string
  versions: Record<string, LaborStandard>
}

/** 老分段历史档案：用来回填早先没登记的所属区域。 */
export type HistoryBlockRecord = {
  分段编号: string
  钢材牌号: string
  设计重量: number
  外形尺寸: string
  所属区域: string
  登记序号: number
}

/** 大合拢顺序：调度员调整后落库，落库动作会向建造计划台账补一条「待排」节点。 */
export type ErectionOrder = {
  blockId: number
  分段编号: string
}

/** 乐观锁拖卡：expectedVersion 与库里行版本不一致就拒绝，只让先落库的那条生效。 */
export type StageMoveResult = ActionResult & {
  stage?: BlockStage
  currentVersion?: number
}

export type BackfillResult = ActionResult & {
  updated: { 分段编号: string; 所属区域: string }[]
  skipped: { 分段编号: string; reason: string }[]
}
