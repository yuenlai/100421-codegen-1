import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'ship-block-construction:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
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

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

// 车间级零散台账（工时标准、合拢顺序等）单独存一份，不混入业务模块数据。
const SETTINGS_KEY = 'ship-block-construction:shop-settings'

function readSettings(): Record<string, unknown> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  const raw = window.localStorage.getItem(SETTINGS_KEY)
  if (!raw) {
    return {}
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

let settingsCache: Record<string, unknown> | null = null

export function getSetting<T>(key: string): T | null {
  if (settingsCache === null) {
    settingsCache = readSettings()
  }
  const value = settingsCache[key]
  return value === undefined ? null : clone(value as T)
}

export function saveSetting<T>(key: string, value: T): void {
  const next = { ...(settingsCache ?? readSettings()), [key]: value }
  settingsCache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }
}

// 别的标签页落库后让本页缓存失效：并发拖卡时本页再提交就会撞版本号，
// 乐观锁据此只放行先落库的那条。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      cache = null
    }
    if (event.key === SETTINGS_KEY) {
      settingsCache = null
    }
  })
}

export function storageKey(): string {
  return STORAGE_KEY
}
