import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都在。
// v2：分段流水/合拢调度需求落地后数据结构变化，旧缓存作废重新播种。
const STORAGE_KEY = 'ship-block-construction:entries:v2'
// 模块级修订号：跨标签页时用来判断别的页面是否已经先落库。
const META_KEY = 'ship-block-construction:meta:v2'

type ModuleMeta = { revision: number }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage
}

function readTable(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (!hasStorage()) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

function readMeta(): Record<string, ModuleMeta> {
  if (!hasStorage()) {
    return {}
  }
  try {
    return JSON.parse(window.localStorage.getItem(META_KEY) ?? '{}') as Record<string, ModuleMeta>
  } catch {
    return {}
  }
}

let cache: Record<string, EntryRow[]> | null = null
let metaCache: Record<string, ModuleMeta> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readTable()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

/** 模块修订号：每次落库 +1，跨标签页比对它来发现「已被别人抢先」。 */
export function moduleRevision(key: string): number {
  if (metaCache === null) {
    metaCache = readMeta()
  }
  return metaCache[key]?.revision ?? 0
}

function bumpRevision(key: string): number {
  if (metaCache === null) {
    metaCache = readMeta()
  }
  const next = moduleRevision(key) + 1
  metaCache = { ...metaCache, [key]: { revision: next } }
  if (hasStorage()) {
    window.localStorage.setItem(META_KEY, JSON.stringify(metaCache))
  }
  return next
}

/** 普通写入：既有页面继续用，行为与旧版保持一致，同时把模块修订号往前推。 */
export function saveRows(key: string, rows: EntryRow[]): void {
  persist(key, rows)
  bumpRevision(key)
}

function persist(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (hasStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export type CommitResult = {
  ok: boolean
  message: string
  /** 落库成功后的最新数据；失败时返回库里当前版本，调用方用它把界面拉回真相。 */
  rows: EntryRow[]
}

/**
 * 乐观锁落库：携带模块修订号与逐条 rev 写入。
 * 并发拖动同一张卡时，先落库的把修订号/rev 推高，后到的校验不过，整条作废。
 */
export function commitRows(
  key: string,
  rows: EntryRow[],
  expectedRevision: number,
  expectedRevs: Record<number, number> = {},
): CommitResult {
  const currentRevision = moduleRevision(key)
  if (currentRevision !== expectedRevision) {
    return {
      ok: false,
      message: '该数据已被其他调度员抢先落库，本次调整未生效',
      rows: listRows(key),
    }
  }
  const current = listRows(key)
  for (const [id, expectedRev] of Object.entries(expectedRevs)) {
    const row = current.find((item) => Number(item.id) === Number(id))
    if (!row || Number(row.rev ?? 0) !== Number(expectedRev)) {
      return {
        ok: false,
        message: `编号 ${id} 的记录刚被更新，本次拖动未生效`,
        rows: current,
      }
    }
  }
  persist(key, rows)
  bumpRevision(key)
  return { ok: true, message: '', rows }
}

/** 追加一批新记录（合拢调度生成待排节点时使用），走同一把乐观锁。 */
export function appendRows(
  key: string,
  additions: EntryRow[],
  expectedRevision: number,
): CommitResult {
  if (moduleRevision(key) !== expectedRevision) {
    return {
      ok: false,
      message: '台账已被其他页面更新，请刷新后再保存合拢顺序',
      rows: listRows(key),
    }
  }
  const rows = [...listRows(key), ...additions]
  persist(key, rows)
  bumpRevision(key)
  return { ok: true, message: '', rows }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

/** storage 事件触发：别的标签页写过库，丢掉内存缓存，下次读取以磁盘为准。 */
export function invalidateCache(): void {
  cache = null
  metaCache = null
}

export function storageKey(): string {
  return STORAGE_KEY
}
