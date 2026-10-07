import {
  inspectionBundle,
  loadInspection,
  resetInspection,
  saveBundle,
} from '@/data/inspection-store'
import type {
  CaseRuling,
  CaseStatus,
  DisposalKind,
  DisposalRecord,
  HazardLedgerItem,
  InspectionBundle,
  InspectionCase,
  MutationResult,
  SiteVerdict,
  WaterPermit,
} from '@/data/inspection-types'

// 供水稽查与违规用水处理：所有判定口径、越权校验、处置约束、台账同步都在这里，
// 页面组件只负责渲染与收集表单，不做任何业务判断。

export const DISPOSAL_KINDS: readonly DisposalKind[] = ['限期整改', '移交执法']
const ILLEGAL_TAP = '私接管路'

export type CaseFilter = {
  keyword: string
  violationType: string
  status: string
}

export function loadAll(): InspectionBundle {
  return loadInspection()
}

export function resetAll(): InspectionBundle {
  return resetInspection()
}

export function isIllicitTap(item: InspectionCase): boolean {
  return item.violationType === ILLEGAL_TAP
}

/** 列表页与详情面板共用同一个结论字段，杜绝两边各写一套。 */
export function conclusionText(item: InspectionCase): string {
  if (item.frozenLegacy?.kept) {
    return `老单留存：${item.frozenLegacy.conclusion}`
  }
  if (item.disposal) {
    return item.disposal.kind === '限期整改'
      ? `限期整改 ${item.disposal.rectifyDays} 天（${item.disposal.documentNo}）`
      : `移交执法（${item.disposal.documentNo}）`
  }
  if (item.closure) {
    return `核查销案（${item.closure.documentNo}）`
  }
  if (item.ruling) {
    return item.ruling.isViolation ? '已判定违规，待处置' : '已判定不违规，待销案'
  }
  return '待现场判定'
}

export function listCases(filter: CaseFilter): InspectionCase[] {
  const { cases } = inspectionBundle()
  const kw = filter.keyword.trim()
  return cases.filter((item) => {
    if (filter.violationType && item.violationType !== filter.violationType) {
      return false
    }
    if (filter.status && item.status !== filter.status) {
      return false
    }
    if (!kw) {
      return true
    }
    return [item.caseNo, item.user, item.userNo, item.zone, item.violationType]
      .join(' ')
      .includes(kw)
  })
}

export function getCase(id: number): InspectionCase | null {
  return inspectionBundle().cases.find((item) => item.id === id) ?? null
}

export function caseStats(): { label: string; value: number }[] {
  const { cases } = inspectionBundle()
  return [
    { label: '稽查单总数', value: cases.length },
    { label: '待现场判定', value: cases.filter((c) => c.status === '待现场判定').length },
    { label: '待处置违规单', value: cases.filter((c) => c.status === '待处置').length },
    { label: '私接管路（一眼可辨）', value: cases.filter(isIllicitTap).length },
    { label: '已落隐患台账', value: inspectionBundle().ledger.length },
    { label: '老单按当年口径留存', value: cases.filter((c) => c.frozenLegacy?.kept).length },
  ]
}

function updateCase(id: number, patch: (item: InspectionCase) => InspectionCase): MutationResult {
  const bundle = inspectionBundle()
  const index = bundle.cases.findIndex((item) => item.id === id)
  if (index < 0) {
    return { ok: false, message: `没有找到稽查编号为 ${id} 的稽查单` }
  }
  const next = { ...bundle, cases: [...bundle.cases] }
  next.cases[index] = patch(bundle.cases[index])
  saveBundle(next)
  return { ok: true, message: '已保存' }
}

/** 统一的越权拦截：老单冻结 + 跨片区改动直接打回（稽查车也必须在本片区出勤）。 */
function guardMutation(
  item: InspectionCase,
  operatorZone: string,
  vehiclePlate: string | null,
): MutationResult | null {
  if (item.frozenLegacy?.kept) {
    return {
      ok: false,
      message: `稽查单 ${item.caseNo} 是${item.year}年老单，按当年口径留存，不按新标准回头改写、也不再受理改动。`,
    }
  }
  if (operatorZone !== item.zone) {
    return {
      ok: false,
      message: `越权打回：当前出勤片区为「${operatorZone}」，该单属「${item.zone}」，跨片区改动不允许提交。`,
    }
  }
  if (vehiclePlate) {
    const vehicle = inspectionBundle().vehicles.find((v) => v.plate === vehiclePlate)
    if (!vehicle) {
      return { ok: false, message: `稽查车 ${vehiclePlate} 未登记出勤，不能出具现场判定。` }
    }
    if (vehicle.homeZone !== item.zone) {
      return {
        ok: false,
        message: `越权打回：稽查车 ${vehiclePlate} 按片区归属「${vehicle.homeZone}」，不得到「${item.zone}」跨片区出勤出具判定。`,
      }
    }
  }
  return null
}

function earliestVerdict(verdicts: SiteVerdict[]): SiteVerdict {
  return [...verdicts].sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt))[0]
}

/**
 * 判定口径收成一份：同一稽查编号下的所有现场记录按同一套标准判。
 * 两队判定打架时，以先到现场那一版的事实数据为准，再套当年标准。
 */
export function adjudicate(item: InspectionCase): CaseRuling {
  const bundle = inspectionBundle()
  const standardYear = bundle.standard.year
  const picked = earliestVerdict(item.siteVerdicts)

  if (isIllicitTap(item)) {
    return {
      isViolation: true,
      authoritativeTeam: picked.team,
      basis: `私接管路不设许可比对空间，${standardYear}年统一口径下直接认定违规；现场事实以先到现场的${picked.team}（${picked.arrivedAt}）为准。`,
      over: [
        item.permitNo
          ? `现场管路口径 DN${picked.caliber} 与许可不符`
          : `无取水许可，现场私接 DN${picked.caliber} 管路`,
      ],
      standardYear,
    }
  }

  const permit = bundle.permits.find(
    (p) => p.permitNo === item.permitNo && p.year === item.year,
  )
  const over: string[] = []
  let basis = ''
  if (!permit) {
    basis = `该单未挂${item.year}年有效取水许可，且不属于私接管路，按统一口径退回补正许可信息。`
    return { isViolation: false, authoritativeTeam: picked.team, basis, over: [], standardYear }
  }

  const conflicting =
    new Set(item.siteVerdicts.map((v) => v.opinion)).size > 1
  basis = conflicting
    ? `一队、二队判定不一致，按规程以先到现场的${picked.team}（到场 ${picked.arrivedAt}）实测数据为准，再套${standardYear}年统一口径：`
    : `以先到现场的${picked.team}（到场 ${picked.arrivedAt}）实测数据，按${standardYear}年统一口径比对：`

  // 口径按许可上下限判，超出多少写多少。
  if (picked.caliber > permit.caliberMax) {
    over.push(`取水口径 DN${picked.caliber}，超许可上限 DN${permit.caliberMax}，超 ${picked.caliber - permit.caliberMax}mm`)
  } else if (picked.caliber < permit.caliberMin) {
    over.push(`取水口径 DN${picked.caliber}，低于许可下限 DN${permit.caliberMin}，差 ${permit.caliberMin - picked.caliber}mm`)
  }

  // 取水量按年度许可额度判（许可按年核发）。
  if (picked.amount !== null && picked.amount > permit.annualQuota) {
    over.push(
      `累计取水量 ${picked.amount}m³，超${permit.year}年度许可 ${permit.annualQuota}m³，超 ${picked.amount - permit.annualQuota}m³`,
    )
  }

  const isViolation = over.length > 0
  basis += isViolation
    ? `许可范围 DN${permit.caliberMin}-DN${permit.caliberMax}、年度取水 ${permit.annualQuota}m³；${over.join('；')}，认定违规。`
    : `许可范围 DN${permit.caliberMin}-DN${permit.caliberMax}、年度取水 ${permit.annualQuota}m³；口径与取水量均在范围内，认定不违规。`

  return { isViolation, authoritativeTeam: picked.team, basis, over, standardYear }
}

/** 提交一队/二队的现场判定：跨片区出勤与跨片区操作一律越权打回。 */
export function submitVerdict(
  caseId: number,
  operatorZone: string,
  verdict: Omit<SiteVerdict, 'opinion'> & { opinion: SiteVerdict['opinion'] | '' },
): MutationResult {
  const item = getCase(caseId)
  if (!item) {
    return { ok: false, message: `没有找到编号为 ${caseId} 的稽查单` }
  }
  if (item.status !== '待现场判定') {
    return { ok: false, message: `稽查单 ${item.caseNo} 已完成现场判定，不再接收新的现场记录。` }
  }
  const blocked = guardMutation(item, operatorZone, verdict.vehiclePlate)
  if (blocked) {
    return blocked
  }
  if (!verdict.team.trim()) {
    return { ok: false, message: '请填写出勤队别（如 一队 / 二队）。' }
  }
  if (item.siteVerdicts.some((v) => v.team === verdict.team)) {
    return { ok: false, message: `${verdict.team} 的现场判定已提交，同一队别不能重复提交；以先到现场那一版为准。` }
  }
  if (!Number.isFinite(verdict.caliber) || verdict.caliber <= 0) {
    return { ok: false, message: '现场管路口径必须是大于 0 的数字（mm）。' }
  }
  if (verdict.amount !== null && verdict.amount < 0) {
    return { ok: false, message: '现场取水量不能为负数；确无计量可留空。' }
  }
  if (!verdict.arrivedAt) {
    return { ok: false, message: '请填写到场时间，用于两队打架时判定谁先到现场。' }
  }
  // 队别自报结论只作留痕，违规与否最终以统一口径裁定，不再各判各的。
  const normalized: SiteVerdict = {
    team: verdict.team,
    arrivedAt: verdict.arrivedAt,
    vehiclePlate: verdict.vehiclePlate,
    caliber: Number(verdict.caliber),
    amount: verdict.amount === null || verdict.amount === undefined ? null : Number(verdict.amount),
    opinion: verdict.opinion === '' ? '合规' : verdict.opinion,
    note: verdict.note,
  }
  return updateCase(caseId, (current) => ({
    ...current,
    siteVerdicts: [...current.siteVerdicts, normalized],
  }))
}

/** 按统一口径出裁定：同一稽查编号只此一份，覆盖任何单队自报结论。 */
export function issueRuling(caseId: number, operatorZone: string): MutationResult {
  const item = getCase(caseId)
  if (!item) {
    return { ok: false, message: `没有找到编号为 ${caseId} 的稽查单` }
  }
  if (item.frozenLegacy?.kept) {
    return {
      ok: false,
      message: `稽查单 ${item.caseNo} 是${item.year}年老单，按当年口径留存，不按新标准回头判定。`,
    }
  }
  if (operatorZone !== item.zone) {
    return { ok: false, message: `越权打回：当前出勤片区「${operatorZone}」无权处置「${item.zone}」的稽查单。` }
  }
  if (item.siteVerdicts.length === 0) {
    return { ok: false, message: '还没有任何一队到现场，先提交现场判定再按统一口径裁定。' }
  }
  if (item.ruling) {
    return { ok: false, message: '统一口径裁定已作出，同一稽查编号不允许第二套结论。' }
  }
  const ruling = adjudicate(item)
  return updateCase(caseId, (current) => ({
    ...current,
    ruling,
    // 违规与不违规都进入「待处置」页签，由面板按裁定结果分流处置/销案。
    status: '待处置',
  }))
}

function nextDocumentNo(bundle: InspectionBundle, prefix: string): string {
  const year = bundle.standard.year
  const seq =
    1 +
    bundle.cases.reduce(
      (max, c) =>
        Math.max(
          max,
          c.disposal?.documentNo.startsWith(`${prefix}-${year}`)
            ? Number(c.disposal.documentNo.split('-').pop())
            : 0,
          c.closure?.documentNo.startsWith(`${prefix}-${year}`)
            ? Number(c.closure.documentNo.split('-').pop())
            : 0,
        ),
      0,
    )
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

function nowText(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 违规处置：只认「限期整改」与「移交执法」两条路，别的写法不给过。
 * 限期整改的天数必须写在文书上；处置结论同步落到供水调度隐患台账。
 */
export function disposeCase(
  caseId: number,
  operatorZone: string,
  input: { kind: string; rectifyDays: number; summary: string },
): MutationResult {
  const item = getCase(caseId)
  if (!item) {
    return { ok: false, message: `没有找到编号为 ${caseId} 的稽查单` }
  }
  const blocked = guardMutation(item, operatorZone, null)
  if (blocked) {
    return blocked
  }
  if (!item.ruling?.isViolation) {
    return { ok: false, message: '该单未认定违规，不能走违规处置；不违规请走「核查销案」。' }
  }
  if (item.disposal) {
    return { ok: false, message: `稽查单 ${item.caseNo} 已处置，处置结论只允许一份，不能改写。` }
  }
  if (!DISPOSAL_KINDS.includes(input.kind as DisposalKind)) {
    return {
      ok: false,
      message: `处置只认「限期整改」与「移交执法」两条路，「${input.kind || '空'}」这类写法不给过。`,
    }
  }
  const kind = input.kind as DisposalKind
  const days = Number(input.rectifyDays)
  if (kind === '限期整改' && (!Number.isInteger(days) || days < 1)) {
    return { ok: false, message: '限期整改必须在文书上写明整改天数（不少于 1 天）。' }
  }
  if (!input.summary.trim()) {
    return { ok: false, message: '请填写处置文书的处置内容。' }
  }

  const bundle = inspectionBundle()
  const documentNo = nextDocumentNo(bundle, 'ZG')
  const decidedAt = nowText()
  const disposal: DisposalRecord = {
    kind,
    rectifyDays: kind === '限期整改' ? days : 0,
    documentNo,
    decidedAt,
    summary: input.summary.trim(),
  }

  // 处置结论落到供水调度隐患台账（同一稽查单只落一条，重复处置不重复建账）。
  const hazardNo = `YH-${bundle.standard.year}-${String(bundle.ledger.length + 1).padStart(4, '0')}`
  const ledgerItem: HazardLedgerItem = {
    hazardNo,
    caseNo: item.caseNo,
    zone: item.zone,
    user: item.user,
    violationType: item.violationType,
    conclusion: kind,
    rectifyDays: disposal.rectifyDays,
    documentNo,
    syncedAt: decidedAt,
    status: '未销号',
  }
  const next: InspectionBundle = {
    ...bundle,
    cases: bundle.cases.map((c) =>
      c.id === caseId ? { ...c, disposal, status: '已处置' as CaseStatus } : c,
    ),
    ledger: [...bundle.ledger.filter((h) => h.caseNo !== item.caseNo), ledgerItem],
  }
  saveBundle(next)
  return {
    ok: true,
    message:
      kind === '限期整改'
        ? `已出具限期整改文书 ${documentNo}，整改 ${days} 天已写入文书，并同步供水调度隐患台账（${hazardNo}）。`
        : `已出具移交执法文书 ${documentNo}，并同步供水调度隐患台账（${hazardNo}）。`,
  }
}

/** 不违规单核查销案：不走违规处置，也不进隐患台账。 */
export function closeCase(
  caseId: number,
  operatorZone: string,
  summary: string,
): MutationResult {
  const item = getCase(caseId)
  if (!item) {
    return { ok: false, message: `没有找到编号为 ${caseId} 的稽查单` }
  }
  const blocked = guardMutation(item, operatorZone, null)
  if (blocked) {
    return blocked
  }
  if (!item.ruling) {
    return { ok: false, message: '还未按统一口径裁定，不能销案。' }
  }
  if (item.ruling.isViolation) {
    return { ok: false, message: '该单已认定违规，必须走限期整改或移交执法，不能直接销案。' }
  }
  if (item.closure) {
    return { ok: false, message: '该单已核查销案。' }
  }
  const bundle = inspectionBundle()
  const closure = {
    documentNo: nextDocumentNo(bundle, 'HC'),
    closedAt: nowText(),
    summary: summary.trim() || '核查不违规，举报不成立，销案归档。',
  }
  const next: InspectionBundle = {
    ...bundle,
    cases: bundle.cases.map((c) =>
      c.id === caseId ? { ...c, closure, status: '已销案' as CaseStatus } : c,
    ),
  }
  saveBundle(next)
  return { ok: true, message: `已出具核查文书 ${closure.documentNo} 并销案归档（不进隐患台账）。` }
}

function findCurrentPermit(bundle: InspectionBundle, userNo: string): WaterPermit | null {
  const year = bundle.standard.year
  // 许可按年核发：只认当年许可，老许可不给新申报用。
  return bundle.permits.find((p) => p.userNo === userNo && p.year === year) ?? null
}

/**
 * 取水申报保存：取水口径超出许可范围、或累计取水量超年度额度的一律不允许保存，
 * 退回时写清每一项超了多少。
 */
export function saveDeclaration(input: {
  userNo: string
  caliber: number
  amount: number
}): MutationResult {
  const userNo = input.userNo.trim()
  const caliber = Number(input.caliber)
  const amount = Number(input.amount)
  if (!userNo) {
    return { ok: false, message: '请填写用户编号，按当年取水许可核对。' }
  }
  const bundle = inspectionBundle()
  const permit = findCurrentPermit(bundle, userNo)
  if (!permit) {
    return { ok: false, message: `用户 ${userNo} 没有${bundle.standard.year}年有效取水许可，申报不予保存。` }
  }
  if (!Number.isFinite(caliber) || caliber <= 0) {
    return { ok: false, message: '取水口径必须是大于 0 的数字（mm）。' }
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, message: '本次取水量必须是不小于 0 的数字（m³）。' }
  }

  const exceeded: string[] = []
  if (caliber > permit.caliberMax) {
    exceeded.push(
      `取水口径 DN${caliber} 超出许可上限 DN${permit.caliberMax}，超 ${caliber - permit.caliberMax}mm`,
    )
  } else if (caliber < permit.caliberMin) {
    exceeded.push(
      `取水口径 DN${caliber} 低于许可下限 DN${permit.caliberMin}，差 ${permit.caliberMin - caliber}mm（许可范围 DN${permit.caliberMin}-DN${permit.caliberMax}）`,
    )
  }
  const projected = permit.usedQuota + amount
  if (projected > permit.annualQuota) {
    exceeded.push(
      `本次申报 ${amount}m³ 入账后累计取水 ${projected}m³，超出${permit.year}年度许可 ${permit.annualQuota}m³，超 ${projected - permit.annualQuota}m³`,
    )
  }
  if (exceeded.length > 0) {
    return {
      ok: false,
      message: `申报不允许保存（许可 ${permit.permitNo}，${permit.user}）：${exceeded.join('；')}。请按许可范围改正后重新提交。`,
    }
  }

  // 校验通过才落库：累计已用额度回写许可，后续申报继续按年度额度卡。
  const next: InspectionBundle = {
    ...bundle,
    permits: bundle.permits.map((p) =>
      p.permitNo === permit.permitNo ? { ...p, usedQuota: projected } : p,
    ),
    declarations: [
      ...bundle.declarations,
      {
        id: bundle.declarations.reduce((max, d) => Math.max(max, d.id), 0) + 1,
        userNo,
        year: permit.year,
        caliber,
        amount,
        declaredAt: nowText(),
      },
    ],
  }
  saveBundle(next)
  return {
    ok: true,
    message: `申报已保存：${permit.user} DN${caliber}、本次 ${amount}m³，年度累计 ${projected}/${permit.annualQuota}m³。`,
  }
}
