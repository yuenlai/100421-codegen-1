import { getSetting, listRows, saveRows, saveSetting } from '@/data/local-store'
import { DEFAULT_LABOR_BOOK } from '@/data/labor-standards'
import { HISTORY_BLOCKS } from '@/data/history-blocks'
import { BLOCK_STAGES, STAGE_STATUS, stageOfStatus } from '@/data/block-stages'
import type {
  ActionResult,
  BackfillResult,
  BlockStage,
  EntryRow,
  ErectionOrder,
  LaborStandardBook,
  StageMoveResult,
} from '@/data/types'

// 船体车间流水视图：所有读写都集中在本文件，页面只负责渲染与拖拽交互。

const BLOCK_KEY = 'block'
const SCHEDULE_KEY = 'schedule'
const LABOR_SETTING_KEY = 'labor-standard-book'
const ORDER_SETTING_KEY = 'erection-order'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function cloneDefaultBook(): LaborStandardBook {
  return JSON.parse(JSON.stringify(DEFAULT_LABOR_BOOK)) as LaborStandardBook
}

export type BoardColumn = {
  stage: BlockStage
  cards: EntryRow[]
}

export function listBoard(): BoardColumn[] {
  const rows = listRows(BLOCK_KEY)
  return BLOCK_STAGES.map((stage) => ({
    stage,
    cards: rows.filter((row) => stageOfStatus(String(row.status)) === stage),
  }))
}

// —— 分段登记：计划工时按登记时生效的工时标准快照进单子 ——

export type RegisterBlockInput = {
  分段编号: string
  分段名称: string
  所属区域: string
  钢材牌号: string
  设计重量: number
  外形尺寸: string
}

export function registerBlock(input: RegisterBlockInput): ActionResult {
  const code = input.分段编号.trim()
  if (!code || !input.分段名称.trim() || !input.钢材牌号.trim() || !input.外形尺寸.trim()) {
    return { ok: false, message: '分段编号、名称、钢材牌号、外形尺寸都必填' }
  }
  if (!Number.isFinite(input.设计重量) || input.设计重量 <= 0) {
    return { ok: false, message: '设计重量必须是正数' }
  }
  const rows = listRows(BLOCK_KEY)
  if (rows.some((row) => String(row.分段编号) === code)) {
    return { ok: false, message: `分段编号 ${code} 已登记，不能重复建账` }
  }
  const book = loadLaborBook()
  const standard = book.versions[book.currentVersion]
  const rate = standard.工时每吨[input.钢材牌号]
  if (!rate) {
    return { ok: false, message: `现行标准 ${book.currentVersion} 没有钢材牌号 ${input.钢材牌号} 的工时档，无法计算计划工时` }
  }
  const hours = Math.round(input.设计重量 * rate)
  const row: EntryRow = {
    id: nextId(rows),
    status: STAGE_STATUS.下料,
    pending: true,
    abnormal: false,
    rowVersion: 1,
    分段编号: code,
    分段名称: input.分段名称.trim(),
    所属区域: input.所属区域.trim(),
    钢材牌号: input.钢材牌号.trim(),
    设计重量: input.设计重量,
    外形尺寸: input.外形尺寸.trim(),
    计划工时: hours,
    // 工时口径随单子固化：以后标准改版，这张单子仍按本口径保留。
    工时口径: `${book.currentVersion}（${rate}工时/吨）`,
    分段状态: STAGE_STATUS.下料,
  }
  saveRows(BLOCK_KEY, [...rows, row])
  return { ok: true, message: `${code} 已登记，计划工时 ${hours} 小时，口径 ${book.currentVersion}` }
}

// —— 流水拖卡：乐观锁，版本号对不上就拒绝，只让先落库的那条生效 ——

export function moveBlockStage(id: number, stage: BlockStage, expectedVersion: number): StageMoveResult {
  const rows = listRows(BLOCK_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的分段` }
  }
  const row = rows[index]
  const storedVersion = Number(row.rowVersion ?? 1)
  if (storedVersion !== expectedVersion) {
    return {
      ok: false,
      stage,
      currentVersion: storedVersion,
      message: `分段 ${String(row.分段编号)} 已被先落库的操作更新（库内版本 ${storedVersion}），本次拖动作废，请刷新后重试`,
    }
  }
  if (stageOfStatus(String(row.status)) === stage) {
    return { ok: true, stage, currentVersion: storedVersion, message: `${String(row.分段编号)} 已在「${stage}」阶段` }
  }
  const target = STAGE_STATUS[stage]
  const updated: EntryRow = {
    ...row,
    status: target,
    分段状态: target,
    pending: target !== STAGE_STATUS.完工,
    rowVersion: storedVersion + 1,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(BLOCK_KEY, next)
  return { ok: true, stage, currentVersion: storedVersion + 1, message: `${String(row.分段编号)} 已移入「${stage}」，当前版本 ${storedVersion + 1}` }
}

export function stageSnapshot(row: EntryRow): { stage: BlockStage; version: number } {
  return { stage: stageOfStatus(String(row.status)), version: Number(row.rowVersion ?? 1) }
}

// —— 老分段历史回填：按登记先后补所属区域，冲突时以设计重量为准 ——

export function backfillAreas(): BackfillResult {
  const rows = listRows(BLOCK_KEY)
  // 按登记先后（id 升序）逐条补；历史档案一旦命中即占用，不重复用于别的分段。
  const candidates = rows
    .filter((row) => String(row.所属区域 ?? '').trim() === '')
    .sort((a, b) => Number(a.id) - Number(b.id))
  const archive = [...HISTORY_BLOCKS]
  const updated: BackfillResult['updated'] = []
  const skipped: BackfillResult['skipped'] = []

  for (const row of candidates) {
    const code = String(row.分段编号)
    const weight = Number(row.设计重量)
    const sameCode = archive.filter((item) => item.分段编号 === code)
    if (sameCode.length === 0) {
      skipped.push({ 分段编号: code, reason: '历史档案中查无此分段编号' })
      continue
    }
    // 同编号档案出现冲突时，以台账侧设计重量为准：重量对不上的档案一律不用。
    const exact = sameCode.find((item) => Number(item.设计重量) === weight)
    if (!exact) {
      const archiveWeights = sameCode.map((item) => item.设计重量).join('/')
      skipped.push({ 分段编号: code, reason: `档案重量 ${archiveWeights} 与台账设计重量 ${weight} 不一致，以设计重量为准，不予回填` })
      continue
    }
    row.所属区域 = exact.所属区域
    updated.push({ 分段编号: code, 所属区域: exact.所属区域 })
    const usedIndex = archive.indexOf(exact)
    archive.splice(usedIndex, 1)
  }

  if (updated.length > 0) {
    saveRows(BLOCK_KEY, [...rows])
  }
  const message =
    updated.length === 0
      ? '没有可回填的老分段区域'
      : `已按登记先后回填 ${updated.length} 条老分段区域` +
        (skipped.length > 0 ? `，${skipped.length} 条因冲突跳过` : '')
  return { ok: updated.length > 0, message, updated, skipped }
}

// —— 工时标准：改版只追加新版本，不动老单子的口径 ——

export function loadLaborBook(): LaborStandardBook {
  return getSetting<LaborStandardBook>(LABOR_SETTING_KEY) ?? cloneDefaultBook()
}

export function previewLaborHours(钢材牌号: string, 设计重量: number): { hours: number | null; rate: number | null; version: string } {
  const book = loadLaborBook()
  const standard = book.versions[book.currentVersion]
  const rate = standard.工时每吨[钢材牌号]
  return {
    hours: rate && Number.isFinite(设计重量) ? Math.round(设计重量 * rate) : null,
    rate: rate ?? null,
    version: book.currentVersion,
  }
}

export function publishLaborStandard(rateByGrade: Record<string, number>, operator: string): ActionResult & { version: string } {
  const book = loadLaborBook()
  const nextVersion = `v${Object.keys(book.versions).length + 1}`
  book.versions[nextVersion] = {
    version: nextVersion,
    工时每吨: { ...rateByGrade },
    updatedAt: today(),
  }
  book.currentVersion = nextVersion
  saveSetting(LABOR_SETTING_KEY, book)
  return { ok: true, version: nextVersion, message: `工时标准 ${nextVersion} 已由 ${operator} 发布生效；既有单子仍按原登记口径保留` }
}

// —— 合拢顺序：调整落库即向建造计划节点台账补一条「待排」 ——

export type ErectionOrderBook = {
  version: number
  updatedAt: string
  operator: string
  order: ErectionOrder[]
}

export function loadErectionOrder(): ErectionOrderBook {
  const saved = getSetting<ErectionOrderBook>(ORDER_SETTING_KEY)
  if (saved) {
    return saved
  }
  // 初始顺序：取尚未完工的分段，按编号排，作为调度员调整的起点。
  const order = listRows(BLOCK_KEY)
    .filter((row) => stageOfStatus(String(row.status)) !== '完工')
    .sort((a, b) => String(a.分段编号).localeCompare(String(b.分段编号), 'zh-Hans-CN'))
    .map((row) => ({ blockId: Number(row.id), 分段编号: String(row.分段编号) }))
  return { version: 0, updatedAt: '', operator: '', order }
}

export function saveErectionOrder(order: ErectionOrder[], operator: string): ActionResult & { version: number } {
  const rows = listRows(BLOCK_KEY)
  const known = new Map(rows.map((row) => [Number(row.id), String(row.分段编号)]))
  const seen = new Set<number>()
  for (const item of order) {
    if (!known.has(item.blockId)) {
      return { ok: false, version: 0, message: `合拢顺序里有分段 id=${item.blockId} 查无台账记录` }
    }
    if (seen.has(item.blockId)) {
      return { ok: false, version: 0, message: `分段 ${item.分段编号} 在合拢顺序里重复出现` }
    }
    seen.add(item.blockId)
  }

  const previous = loadErectionOrder()
  const book: ErectionOrderBook = {
    version: previous.version + 1,
    updatedAt: today(),
    operator,
    order: order.map((item) => ({ ...item, 分段编号: known.get(item.blockId) ?? item.分段编号 })),
  }
  saveSetting(ORDER_SETTING_KEY, book)
  appendPendingScheduleNode(book)
  return { ok: true, version: book.version, message: `合拢顺序 v${book.version} 已落库，建造计划节点台账已追加一条「待排」` }
}

function appendPendingScheduleNode(book: ErectionOrderBook): void {
  const rows = listRows(SCHEDULE_KEY)
  const codes = book.order.map((item) => item.分段编号).join('、')
  const row: EntryRow = {
    id: nextId(rows),
    status: '待排',
    pending: true,
    abnormal: false,
    rowVersion: 1,
    节点编号: `SCHE-${String(nextId(rows)).padStart(4, '0')}`,
    节点名称: `大合拢顺序调整（v${book.version}）待排`,
    计划开始: '待排',
    计划完成: '待排',
    实际开始: '',
    实际完成: '',
    负责人: book.operator,
    来源: `合拢顺序调整 v${book.version} · ${book.updatedAt}（${codes}）`,
    节点状态: '待排',
  }
  saveRows(SCHEDULE_KEY, [...rows, row])
}

export function pendingScheduleCount(): number {
  return listRows(SCHEDULE_KEY).filter((row) => String(row.status) === '待排').length
}
