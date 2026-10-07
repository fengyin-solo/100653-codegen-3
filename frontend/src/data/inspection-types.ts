/**
 * 供水稽查与违规用水处理模块的领域类型。
 * 判定口径（标准、许可、出勤、裁定、处置、台账）全部在这里显式建模，
 * 不再走通用 EntryRow 的自由字段，业务规则只在 local-service 里判。
 */

/** 取水许可：按年核发，口径给上下限、取水量给年度额度。 */
export type WaterPermit = {
  permitNo: string
  userNo: string
  user: string
  year: number
  zone: string
  caliberMin: number
  caliberMax: number
  /** 年度许可取水量，m³。 */
  annualQuota: number
  /** 当年已申报累计取水量，m³。 */
  usedQuota: number
}

/** 稽查车：按片区出勤，跨片区出勤的现场判定按越权打回。 */
export type AuditVehicle = {
  plate: string
  homeZone: string
  status: '在岗' | '出勤中' | '维保'
}

/** 取水申报：许可范围外的申报一律不允许保存。 */
export type IntakeDeclaration = {
  id: number
  userNo: string
  year: number
  caliber: number
  amount: number
  declaredAt: string
}

/** 现场判定记录：一队、二队可各交一版，先到现场的一版为准。 */
export type SiteVerdict = {
  team: string
  arrivedAt: string
  vehiclePlate: string
  caliber: number
  amount: number | null
  opinion: '违规' | '合规'
  note: string
}

/** 统一口径下对稽查单的裁定：同一稽查编号下所有记录共用同一套标准。 */
export type CaseRuling = {
  isViolation: boolean
  /** 两队打架时被采信的那一队（先到现场）。 */
  authoritativeTeam: string
  basis: string
  /** 超出许可的明细，给退回/文书直接引用，单位随条目写明。 */
  over: string[]
  standardYear: number
}

export type DisposalKind = '限期整改' | '移交执法'

/** 违规处置：处置只认限期整改与移交执法两条路；整改天数写入文书。 */
export type DisposalRecord = {
  kind: DisposalKind
  rectifyDays: number
  documentNo: string
  decidedAt: string
  summary: string
}

/** 合规单（举报不成立）的核查销案，不是违规处置。 */
export type ClosureRecord = {
  documentNo: string
  closedAt: string
  summary: string
}

/** 老稽查单冻结：按当年口径留存，不按新标准回头改写。 */
export type LegacyFreeze = {
  legacyStandard: string
  conclusion: string
  kept: boolean
}

export type CaseStatus =
  | '待现场判定'
  | '待处置'
  | '已处置'
  | '已销案'
  | '老单留存'

/** 稽查单（一个稽查编号一条）。 */
export type InspectionCase = {
  id: number
  caseNo: string
  year: number
  zone: string
  user: string
  userNo: string
  permitNo: string | null
  violationType: string
  reportedAt: string
  status: CaseStatus
  siteVerdicts: SiteVerdict[]
  ruling: CaseRuling | null
  disposal: DisposalRecord | null
  closure: ClosureRecord | null
  frozenLegacy: LegacyFreeze | null
  createdAt: string
}

/** 供水调度隐患台账条目：违规处置结论落到这里。 */
export type HazardLedgerItem = {
  hazardNo: string
  caseNo: string
  zone: string
  user: string
  violationType: string
  /** 与稽查详情一致的处置结论。 */
  conclusion: DisposalKind
  rectifyDays: number
  documentNo: string
  syncedAt: string
  status: '未销号' | '已销号'
}

export type InspectionStandard = {
  year: number
  rules: string[]
}

/** 稽查模块在 localStorage 里的整包数据。 */
export type InspectionBundle = {
  standard: InspectionStandard
  permits: WaterPermit[]
  vehicles: AuditVehicle[]
  declarations: IntakeDeclaration[]
  cases: InspectionCase[]
  ledger: HazardLedgerItem[]
}

/** 本地变更（保存、提交、判定、处置、销案）的统一返回。 */
export type MutationResult = {
  ok: boolean
  message: string
}
