import type { LaborStandardBook } from './types'

// 工时标准按钢材牌号分档，标准改版只追加新版本：既有单子记录自己登记时的版本，
// 之后标准再怎么改，老单子仍按原本口径保留。
export const DEFAULT_LABOR_BOOK: LaborStandardBook = {
  currentVersion: 'v1',
  versions: {
    v1: {
      version: 'v1',
      工时每吨: {
        'AH32': 8,
        'AH36': 9,
        'DH36': 10,
        'EH36': 12,
        'Q235B': 7,
        'Q355B': 8,
      },
      updatedAt: '2026-06-01',
    },
  },
}
