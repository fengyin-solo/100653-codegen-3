import { INSPECTION_SEED } from './inspection-seed'
import type { InspectionBundle } from './inspection-types'

// 稽查模块与通用台账分开存：判定口径、许可、出勤、隐患台账整包持久化。
const STORAGE_KEY = 'waterworks-ops:inspection'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): InspectionBundle {
  const fallback = clone(INSPECTION_SEED)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Partial<InspectionBundle>
    // 老版本缺字段时用种子补齐，避免取数直接挂掉。
    return {
      standard: parsed.standard ?? fallback.standard,
      permits: parsed.permits ?? fallback.permits,
      vehicles: parsed.vehicles ?? fallback.vehicles,
      declarations: parsed.declarations ?? fallback.declarations,
      cases: parsed.cases ?? fallback.cases,
      ledger: parsed.ledger ?? fallback.ledger,
    }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: InspectionBundle | null = null

export function inspectionBundle(): InspectionBundle {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveBundle(next: InspectionBundle): void {
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetInspection(): InspectionBundle {
  const fresh = clone(INSPECTION_SEED)
  saveBundle(fresh)
  return fresh
}

export function inspectionStorageKey(): string {
  return STORAGE_KEY
}

// 取数失败演练开关：打开后下一次 loadInspection 会抛错，页面展示重试按钮。
// 默认关闭，线上数据不受影响；仅用于验证「取数失败时能重试」。
let failNextLoad = false

export function armNextLoadFailure(): void {
  failNextLoad = true
}

/** 读取稽查整包数据；带一次可演练的失败，调用方负责捕获后重试。 */
export function loadInspection(): InspectionBundle {
  if (failNextLoad) {
    failNextLoad = false
    throw new Error('稽查数据取数失败（演练）：请点击「重新加载」重试')
  }
  return inspectionBundle()
}
