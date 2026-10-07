import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 供水稽查与违规用水处理的业务规则都收在这一个文件里：
// 判定口径统一、超许可不许保存、跨片区打回、先到现场为准、处置落隐患台账。

// 统一判定口径：私接管路不再一队按管径、一队按取水量各判各的，
// 稽查编号下的记录一律按「取水口径比对许可口径」这一套判。
export const UNIFIED_STANDARD = '取水口径比对许可口径'
// 取水许可按年核发，当前年度用来识别「老稽查单」。
export const CURRENT_PERMIT_YEAR = 2026

export const DISTRICTS = ['城东片区', '城西片区', '城南片区', '城北片区']
export const VIOLATION_TYPES = ['私接管路', '超许可取水', '绕表取水', '无违规']
// 处置只认这两条路，别的写法不给过。
export const DISPOSITIONS = ['限期整改', '移交执法']
export const ILLEGAL_PIPE = '私接管路'

// 稽查车按片区出勤，跨片区调车不允许。
export const VEHICLES_BY_DISTRICT: Record<string, string[]> = {
  城东片区: ['稽查车-城东-01', '稽查车-城东-02'],
  城西片区: ['稽查车-城西-01', '稽查车-城西-02'],
  城南片区: ['稽查车-城南-01', '稽查车-城南-02'],
  城北片区: ['稽查车-城北-01', '稽查车-城北-02'],
}

const INSPECTION_KEY = 'inspection'
const PERMIT_KEY = 'inspectionPermits'
const HAZARD_KEY = 'dispatchHazards'

export type DutyContext = { district: string }

export type InspectionInput = {
  稽查编号: string
  所属片区: string
  用水户: string
  违规情形: string
  取水口径: number
  许可年度: number
  稽查车: string
  到场时间: string
}

function fail(message: string): ActionResult {
  return { ok: false, message }
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------- 取水许可（按年核发） ----------

export function listPermits(): EntryRow[] {
  return listRows(PERMIT_KEY)
}

export function findPermit(user: string, year: number): EntryRow | undefined {
  return listRows(PERMIT_KEY).find(
    (row) => String(row['用水户']) === user && Number(row['许可年度']) === year,
  )
}

export function issuePermit(input: { 用水户: string; 许可年度: number; 许可口径: number }): ActionResult {
  const user = input.用水户.trim()
  if (!user) {
    return fail('用水户不能为空')
  }
  if (!Number.isInteger(input.许可年度) || input.许可年度 < 2000) {
    return fail('取水许可按年核发，许可年度要填四位年份')
  }
  if (!Number.isFinite(input.许可口径) || input.许可口径 <= 0) {
    return fail('许可口径要大于 0')
  }
  if (findPermit(user, input.许可年度)) {
    return fail(`取水许可按年核发，${user} 的 ${input.许可年度} 年许可已经核发过，不能重复`)
  }
  const rows = listRows(PERMIT_KEY)
  const row: EntryRow = {
    id: nextId(rows),
    status: '已核发',
    pending: false,
    abnormal: false,
    用水户: user,
    许可年度: input.许可年度,
    许可口径: input.许可口径,
    核发日期: now().slice(0, 10),
  }
  saveRows(PERMIT_KEY, [...rows, row])
  return { ok: true, message: `${user} 的 ${input.许可年度} 年取水许可已核发，许可口径 ${input.许可口径}mm` }
}

// ---------- 判定口径与校验 ----------

type CaliberResult = { ok: true; permit: EntryRow } | { ok: false; message: string }

// 取水口径超出许可范围的一律不允许保存，退回时写清超了多少。
// 比对用的是该记录自己许可年度的许可，老稽查单不按新标准回头改写。
function caliberCheck(user: string, year: number, caliber: number): CaliberResult {
  const permit = findPermit(user, year)
  if (!permit) {
    return { ok: false, message: `${user} 没有 ${year} 年的取水许可，取水许可按年核发，请先核发再登记` }
  }
  const limit = Number(permit['许可口径'])
  if (caliber > limit) {
    return {
      ok: false,
      message: `取水口径 ${caliber}mm 超出 ${year} 年许可口径 ${limit}mm，超了 ${caliber - limit}mm，一律不允许保存`,
    }
  }
  return { ok: true, permit }
}

// 跨片区递上来的改动算越权，直接打回。
function districtGuard(district: string, ctx: DutyContext): ActionResult | null {
  if (district !== ctx.district) {
    return fail(`跨片区递上来的改动算越权，直接打回：记录属${district}，当前出勤片区是${ctx.district}`)
  }
  return null
}

function vehicleGuard(district: string, vehicle: string): ActionResult | null {
  const fleet = VEHICLES_BY_DISTRICT[district] ?? []
  if (!fleet.includes(vehicle)) {
    return fail(`稽查车按片区出勤，「${vehicle}」不归${district}调派`)
  }
  return null
}

// ---------- 稽查记录 ----------

// 取数可能失败（比如本地数据被写坏），页面拿到错误后要能重试。
export function listInspections(): EntryRow[] {
  const rows = listRows(INSPECTION_KEY)
  const broken = rows.some((row) => typeof row !== 'object' || row === null || !('稽查编号' in row))
  if (broken) {
    throw new Error('稽查记录取数失败：本地数据不完整，请重试')
  }
  return rows
}

export function caseRows(all: EntryRow[], caseId: string): EntryRow[] {
  return all.filter((row) => String(row['稽查编号']) === caseId)
}

// 两条判定打架时以先到现场的那一版为准：到场时间最早（并列取 id 最小）的记录生效。
export function effectiveRow(all: EntryRow[], caseId: string): EntryRow | undefined {
  return [...caseRows(all, caseId)].sort((a, b) => {
    const byTime = String(a['到场时间']).localeCompare(String(b['到场时间']))
    return byTime !== 0 ? byTime : Number(a.id) - Number(b.id)
  })[0]
}

export function isEffective(all: EntryRow[], row: EntryRow): boolean {
  const eff = effectiveRow(all, String(row['稽查编号']))
  return eff !== undefined && Number(eff.id) === Number(row.id)
}

// 列表页和详情面板都从这里读处置结论，两边看到的永远是同一版。
export function caseConclusion(all: EntryRow[], caseId: string): string {
  const eff = effectiveRow(all, caseId)
  return eff ? String(eff['处置结论'] ?? '待处置') : '待处置'
}

export function nextCaseId(): string {
  const seq = listRows(INSPECTION_KEY).reduce((max, row) => {
    const match = String(row['稽查编号']).match(/^JC-(\d{4})-(\d{4})$/)
    if (!match || Number(match[1]) !== CURRENT_PERMIT_YEAR) {
      return max
    }
    return Math.max(max, Number(match[2]))
  }, 0)
  return `JC-${CURRENT_PERMIT_YEAR}-${String(seq + 1).padStart(4, '0')}`
}

export function createInspection(input: InspectionInput, ctx: DutyContext): ActionResult {
  const caseId = input.稽查编号.trim()
  if (!caseId) {
    return fail('稽查编号不能为空')
  }
  if (!VIOLATION_TYPES.includes(input.违规情形)) {
    return fail(`违规情形只认 ${VIOLATION_TYPES.join('、')} 这几种`)
  }
  const crossDistrict = districtGuard(input.所属片区, ctx)
  if (crossDistrict) {
    return crossDistrict
  }
  const wrongVehicle = vehicleGuard(input.所属片区, input.稽查车)
  if (wrongVehicle) {
    return wrongVehicle
  }
  if (!input.到场时间.trim()) {
    return fail('到场时间不能为空，两条判定打架时以先到现场的那一版为准')
  }
  if (!Number.isFinite(input.取水口径) || input.取水口径 <= 0) {
    return fail('取水口径要大于 0')
  }
  const check = caliberCheck(input.用水户.trim(), input.许可年度, input.取水口径)
  if (!check.ok) {
    return fail(check.message)
  }
  const rows = listInspections()
  const row: EntryRow = {
    id: nextId(rows),
    status: '待处置',
    pending: true,
    abnormal: input.违规情形 !== '无违规',
    稽查编号: caseId,
    所属片区: input.所属片区,
    用水户: input.用水户.trim(),
    违规情形: input.违规情形,
    取水口径: input.取水口径,
    许可口径: Number(check.permit['许可口径']),
    许可年度: input.许可年度,
    判定口径: `${input.许可年度}年统一口径：${UNIFIED_STANDARD}`,
    稽查车: input.稽查车,
    到场时间: input.到场时间.trim(),
    处置结论: '待处置',
    整改天数: '',
  }
  saveRows(INSPECTION_KEY, [...rows, row])
  return { ok: true, message: `稽查记录 ${caseId} 已按统一口径（${UNIFIED_STANDARD}）登记` }
}

export function updateInspection(id: number, patch: InspectionInput, ctx: DutyContext): ActionResult {
  const rows = listInspections()
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return fail(`没有找到编号为 ${id} 的稽查记录`)
  }
  const current = rows[index]
  const crossDistrict = districtGuard(String(current['所属片区']), ctx)
  if (crossDistrict) {
    return crossDistrict
  }
  if (String(current.status) === '已处置') {
    return fail('已处置的稽查单按存档留存，不能再改动')
  }
  // 老稽查单按当年口径留存，不按新标准回头改写：许可年度和判定口径不许改。
  if (Number(patch.许可年度) !== Number(current['许可年度'])) {
    return fail(`稽查单按 ${current['许可年度']} 年口径留存，不按新标准回头改写，许可年度不能改`)
  }
  if (!VIOLATION_TYPES.includes(patch.违规情形)) {
    return fail(`违规情形只认 ${VIOLATION_TYPES.join('、')} 这几种`)
  }
  const wrongVehicle = vehicleGuard(String(current['所属片区']), patch.稽查车)
  if (wrongVehicle) {
    return wrongVehicle
  }
  if (!Number.isFinite(patch.取水口径) || patch.取水口径 <= 0) {
    return fail('取水口径要大于 0')
  }
  const check = caliberCheck(String(current['用水户']), Number(current['许可年度']), patch.取水口径)
  if (!check.ok) {
    return fail(check.message)
  }
  const next: EntryRow = {
    ...current,
    违规情形: patch.违规情形,
    取水口径: patch.取水口径,
    许可口径: Number(check.permit['许可口径']),
    稽查车: patch.稽查车,
    到场时间: patch.到场时间.trim() || String(current['到场时间']),
    abnormal: patch.违规情形 !== '无违规',
  }
  const updated = [...rows]
  updated[index] = next
  saveRows(INSPECTION_KEY, updated)
  return { ok: true, message: `稽查记录 ${current['稽查编号']} 已更新，仍按 ${current['许可年度']} 年口径留存` }
}

// ---------- 处置（只认限期整改与移交执法，结论落隐患台账） ----------

export function disposeCase(caseId: string, disposition: string, days: number, ctx: DutyContext): ActionResult {
  const rows = listInspections()
  const target = effectiveRow(rows, caseId)
  if (!target) {
    return fail(`没有找到稽查编号 ${caseId} 的记录`)
  }
  const crossDistrict = districtGuard(String(target['所属片区']), ctx)
  if (crossDistrict) {
    return crossDistrict
  }
  if (String(target['处置结论']) !== '待处置') {
    return fail(`稽查编号 ${caseId} 已处置，结论「${target['处置结论']}」，列表和详情以这一版为准`)
  }
  if (!DISPOSITIONS.includes(disposition)) {
    return fail(`处置只认限期整改与移交执法两条路，「${disposition}」不给过`)
  }
  let rectifyDays = 0
  if (disposition === '限期整改') {
    if (!Number.isInteger(days) || days <= 0) {
      return fail('限期整改的天数要写在文书上，填大于 0 的整数')
    }
    rectifyDays = days
  }
  const index = rows.findIndex((row) => Number(row.id) === Number(target.id))
  const next = [...rows]
  next[index] = {
    ...rows[index],
    status: '已处置',
    pending: false,
    处置结论: disposition,
    整改天数: disposition === '限期整改' ? rectifyDays : '',
  }
  saveRows(INSPECTION_KEY, next)

  // 处理结论落到供水调度的隐患台账。
  const hazards = listRows(HAZARD_KEY)
  const hazardId = `YHZ-${caseId.replace(/^JC-/, '')}`
  const hazard: EntryRow = {
    id: nextId(hazards),
    status: disposition === '限期整改' ? '待整改' : '已移交',
    pending: disposition === '限期整改',
    abnormal: true,
    隐患编号: hazardId,
    来源稽查编号: caseId,
    所属片区: String(target['所属片区']),
    用水户: String(target['用水户']),
    隐患内容: String(target['违规情形']),
    处置方式: disposition,
    整改天数: disposition === '限期整改' ? rectifyDays : '',
    登记时间: now(),
    台账状态: disposition === '限期整改' ? '待整改' : '已移交',
  }
  saveRows(HAZARD_KEY, [...hazards, hazard])
  return {
    ok: true,
    message: `稽查编号 ${caseId} 处置结论「${disposition}」已生效（以先到现场的判定为准），并落入供水调度隐患台账 ${hazardId}`,
  }
}

// ---------- 供水调度隐患台账 ----------

export function listHazards(): EntryRow[] {
  return listRows(HAZARD_KEY)
}

export function hazardForCase(caseId: string): EntryRow | undefined {
  return listRows(HAZARD_KEY).find((row) => String(row['来源稽查编号']) === caseId)
}
