import {
  appendRows,
  commitRows,
  listRows,
  moduleRevision,
  saveRows,
} from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 船体车间建造流水：下料 → 装配 → 焊接 → 完工 四个阶段。
// 「待开工」是登记后、尚未进入第一个阶段的预备态，卡片归入下料列的队首。
export const FLOW_STAGES = ['下料', '装配', '焊接', '完工'] as const
export type FlowStage = (typeof FLOW_STAGES)[number]
export const PRE_START = '待开工'

const BLOCK_KEY = 'block'
const ERECTION_KEY = 'erection'
const SCHEDULE_KEY = 'schedule'
const ORDER_KEY = 'ship-block-construction:erection-order'
const STANDARD_KEY = 'ship-block-construction:work-standard'

// 回填老分段所属区域时，按登记先后依次取用；不够用时落到「历史遗留区」。
const LEGACY_AREAS = ['货舱区', '舷侧区', '机舱区', '艏艉区', '上层建筑']

export type WorkStandard = {
  version: string
  /** 每吨设计重量折算工时（小时/吨）。 */
  hoursPerTon: number
  updatedAt: string
}

// 历史口径：v1 为 2.4 小时/吨，现行 v2 为 2.6 小时/吨。
const STANDARD_HISTORY: WorkStandard[] = [
  { version: 'v1', hoursPerTon: 2.4, updatedAt: '2024-01-01' },
  { version: 'v2', hoursPerTon: 2.6, updatedAt: '2026-07-01' },
]
export function currentStandard(): WorkStandard {
  const version = activeStandardVersion()
  return STANDARD_HISTORY.find((item) => item.version === version) ?? STANDARD_HISTORY[STANDARD_HISTORY.length - 1]!
}

export function standardOptions(): WorkStandard[] {
  return STANDARD_HISTORY
}

export function setCurrentStandard(version: string): ActionResult {
  const found = STANDARD_HISTORY.find((item) => item.version === version)
  if (!found) {
    return { ok: false, message: `没有工时口径版本 ${version}` }
  }
  if (found.version === currentStandard().version) {
    return { ok: false, message: `当前已是 ${version} 口径，无需调整` }
  }
  // 仅更新「现行口径」指针，既有分段单上的口径版本与计划工时一律不动。
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STANDARD_KEY, found.version)
  }
  return {
    ok: true,
    message: `现行工时口径已切换为 ${version}（${found.hoursPerTon} 小时/吨），既有工单仍按原口径保留`,
  }
}

function activeStandardVersion(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem(STANDARD_KEY)
    if (saved) {
      return saved
    }
  }
  return STANDARD_HISTORY[STANDARD_HISTORY.length - 1]!.version
}

export function weightToTon(value: unknown): number {
  const matched = String(value ?? '').match(/-?\d+(\.\d+)?/)
  return matched ? Number(matched[0]) : NaN
}

export function stageOf(row: EntryRow): FlowStage {
  const status = String(row.status)
  if (status === PRE_START) {
    return '下料'
  }
  return (FLOW_STAGES as readonly string[]).includes(status) ? (status as FlowStage) : '下料'
}

export function isPreStart(row: EntryRow): boolean {
  return String(row.status) === PRE_START
}

export function listBlocks(): EntryRow[] {
  return listRows(BLOCK_KEY)
}

export function blockRevision(): number {
  return moduleRevision(BLOCK_KEY)
}

/**
 * 拖动落库：携带模块修订号 + 该条 rev 的乐观锁。
 * 并发拖动（含跨标签页）时，先落库的推高修订号，后到的整体失败、界面回滚。
 */
export function moveBlock(
  id: number,
  stage: FlowStage,
  expectedRevision: number,
  expectedRev: number,
): ActionResult & { rows?: EntryRow[] } {
  const rows = listRows(BLOCK_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的船体分段` }
  }
  const target = rows[index]
  const nextRows = rows.map((row) =>
    Number(row.id) === id
      ? {
          ...row,
          status: stage,
          分段状态: stage,
          pending: stage !== '完工',
          rev: Number(row.rev ?? 0) + 1,
        }
      : row,
  )
  const result = commitRows(BLOCK_KEY, nextRows, expectedRevision, {
    [id]: expectedRev,
  })
  if (!result.ok) {
    return { ok: false, message: result.message, rows: result.rows }
  }
  return { ok: true, message: `${target.分段编号} 已落库到「${stage}」阶段`, rows: result.rows }
}

/** 登记新分段：计划工时按现行口径折算，并把口径版本钉在单子上。 */
export function registerBlock(input: {
  area: string
  steel: string
  weightTon: number
  dimension: string
  name: string
}): ActionResult {
  const rows = listRows(BLOCK_KEY)
  const standard = STANDARD_HISTORY.find((item) => item.version === activeStandardVersion()) ?? currentStandard()
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const hours = Math.round(input.weightTon * standard.hoursPerTon)
  const row: EntryRow = {
    id: nextId,
    status: PRE_START,
    pending: true,
    abnormal: false,
    rev: 0,
    分段编号: `B-${String(200 + nextId).padStart(3, '0')}`,
    分段名称: input.name || `新登记分段 ${nextId}`,
    所属区域: input.area,
    钢材牌号: input.steel,
    设计重量: `${input.weightTon.toFixed(1)}t`,
    外形尺寸: input.dimension,
    计划工时: `${hours}h`,
    工时口径版本: standard.version,
    分段状态: PRE_START,
  }
  saveRows(BLOCK_KEY, [...rows, row])
  return {
    ok: true,
    message: `${row.分段编号} 已登记，计划工时 ${hours}h 按 ${standard.version}（${standard.hoursPerTon} 小时/吨）口径锁定`,
  }
}

/**
 * 回填老分段所属区域：只处理历史空值，严格按登记先后（id 升序）补。
 * 已有区域的分段一律不动。
 */
export function backfillAreas(): ActionResult & { filled: number } {
  const rows = listRows(BLOCK_KEY)
  const missing = rows
    .filter((row) => String(row.所属区域 ?? '').trim() === '')
    .sort((a, b) => Number(a.id) - Number(b.id))
  if (missing.length === 0) {
    return { ok: true, message: '没有缺所属区域的老分段', filled: 0 }
  }
  let cursor = 0
  const nextRows = [...rows].sort((a, b) => Number(a.id) - Number(b.id)).map((row) => {
    if (String(row.所属区域 ?? '').trim() !== '') {
      return row
    }
    const area = LEGACY_AREAS[cursor] ?? '历史遗留区'
    cursor += 1
    return { ...row, 所属区域: area, rev: Number(row.rev ?? 0) + 1 }
  })
  saveRows(BLOCK_KEY, nextRows)
  return {
    ok: true,
    filled: missing.length,
    message: `已按登记先后回填 ${missing.length} 条老分段的所属区域`,
  }
}

export type OrderItem = {
  erectionId: number
  code: string
  blockNo: string
  location: string
  crane: string
  /** 合拢单上填报的吊装重量。 */
  liftWeight: string
  /** 分段设计重量；冲突时以它为准。 */
  designWeight: string
  conflict: boolean
}

export function erectionOrder(): OrderItem[] {
  const saved = readOrder()
  const blocks = listRows(BLOCK_KEY)
  const byNo = new Map(blocks.map((row) => [String(row.分段编号), row]))
  const items: OrderItem[] = []
  for (const code of saved) {
    const erection = listRows(ERECTION_KEY).find((row) => String(row.搭载编号) === code)
    if (!erection) {
      continue
    }
    const block = byNo.get(String(erection.搭载分段))
    const designWeight = block ? String(block.设计重量) : ''
    items.push({
      erectionId: Number(erection.id),
      code,
      blockNo: String(erection.搭载分段),
      location: String(erection.搭载位置),
      crane: String(erection.吊车编号),
      liftWeight: String(erection.吊装重量),
      designWeight,
      // 重量冲突：吊装填报与设计重量数值不一致。
      conflict:
        designWeight !== '' &&
        weightToTon(erection.吊装重量) !== weightToTon(designWeight),
    })
  }
  return items
}

function readOrder(): string[] {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = JSON.parse(window.localStorage.getItem(ORDER_KEY) ?? 'null')
      if (Array.isArray(saved)) {
        return saved
      }
    } catch {
      // 落到默认顺序
    }
  }
  return listRows(ERECTION_KEY).map((row) => String(row.搭载编号))
}

function writeOrder(codes: string[]): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(codes))
  }
}

export function saveErectionOrder(codes: string[]): ActionResult & { nodeCode?: string } {
  const blocks = listRows(BLOCK_KEY)
  const byNo = new Map(blocks.map((row) => [String(row.分段编号), row]))
  const erections = listRows(ERECTION_KEY)
  const conflicts: string[] = []
  const totalWeight = codes.reduce((sum, code) => {
    const erection = erections.find((row) => String(row.搭载编号) === code)
    if (!erection) {
      return sum
    }
    const block = byNo.get(String(erection.搭载分段))
    const design = block ? weightToTon(block.设计重量) : NaN
    if (block && design !== weightToTon(erection.吊装重量)) {
      conflicts.push(code)
    }
    return sum + (Number.isNaN(design) ? 0 : design)
  }, 0)

  // 台账追加一条「待排」节点；乐观锁失败说明台账刚被别的页面改过，顺序也不落库。
  const expectedRevision = moduleRevision(SCHEDULE_KEY)
  const schedule = listRows(SCHEDULE_KEY)
  const nextSeq = schedule.length + 1
  const nodeCode = `SCHE-2026-${String(nextSeq).padStart(3, '0')}`
  const node: EntryRow = {
    id: schedule.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1,
    status: '待排',
    pending: true,
    abnormal: false,
    rev: 0,
    节点编号: nodeCode,
    节点名称: `合拢顺序调整待排（${codes.length} 吊，按设计重量合计 ${totalWeight.toFixed(1)}t）`,
    计划开始: '',
    计划完成: '',
    实际开始: '',
    实际完成: '',
    负责人: '',
    来源: '合拢调度',
    节点状态: '待排',
  }
  const appended = appendRows(SCHEDULE_KEY, [node], expectedRevision)
  if (!appended.ok) {
    return { ok: false, message: appended.message }
  }

  writeOrder(codes)
  return {
    ok: true,
    nodeCode,
    message:
      conflicts.length > 0
        ? `合拢顺序已保存，建造计划台账新增待排节点 ${nodeCode}；${conflicts.join('、')} 吊装重量与设计重量冲突，已按设计重量 ${totalWeight.toFixed(1)}t 排产`
        : `合拢顺序已保存，建造计划台账新增待排节点 ${nodeCode}`,
  }
}

export function pendingScheduleCount(): number {
  return listRows(SCHEDULE_KEY).filter((row) => String(row.status) === '待排').length
}
