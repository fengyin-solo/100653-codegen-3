// 稽查模块业务规则冒烟测试：直接跑 service，不经过浏览器；localStorage 用内存桩代替。
// 运行：见 package.json 的 smoke:inspection 脚本。
import {
  conclusionText,
  disposeCase,
  getCase,
  isIllicitTap,
  issueRuling,
  listCases,
  loadAll,
  resetAll,
  saveDeclaration,
  submitVerdict,
} from '../src/api/inspection-service'

const store = new Map<string, string>()
;(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
}

function main() {
  let pass = 0
  let fail = 0
  function check(name: string, cond: boolean, detail = '') {
    if (cond) {
      pass++
      console.log(`  ✓ ${name}`)
    } else {
      fail++
      console.log(`  ✗ ${name} ${detail}`)
    }
  }

  resetAll()

  console.log('1) 两队打架：以先到现场为准 + 统一口径（一队按管径说合规，取水量超了仍违规）')
  let r = issueRuling(1, '河东片区')
  check('统一口径裁定成功', r.ok, r.message)
  const c1 = getCase(1)!
  check('认定违规（取水量超年度许可）', c1.ruling?.isViolation === true)
  check('采信先到现场的一队', c1.ruling?.authoritativeTeam === '一队')
  check('退回/裁定写清超了多少', c1.ruling.over.join().includes('超 12000m³') || c1.ruling.over.join().includes('12000'))

  console.log('2) 私接管路：无证直接违规，且列表可一眼分辨')
  // 南郊片区先补现场判定（跨片区车辆应被打回）
  r = submitVerdict(2, '南郊片区', {
    team: '一队', arrivedAt: '2026-09-25 15:00', vehiclePlate: '稽A·3101',
    caliber: 50, amount: null, opinion: '合规', note: '试开河东车去南郊',
  })
  check('跨片区车辆出勤越权打回', !r.ok && r.message.includes('越权'))
  r = submitVerdict(2, '南郊片区', {
    team: '一队', arrivedAt: '2026-09-25 15:00', vehiclePlate: '稽A·3103',
    caliber: 50, amount: null, opinion: '合规', note: '私接DN50',
  })
  check('本片区车辆提交成功', r.ok, r.message)
  r = issueRuling(2, '南郊片区')
  check('私接管路按统一口径直接违规', r.ok && getCase(2)!.ruling!.isViolation)
  check('列表可一眼分辨私接管路', isIllicitTap(getCase(2)!))

  console.log('3) 跨片区操作人越权打回')
  r = issueRuling(3, '河东片区') // 3 号单属河西
  check('跨片区裁定打回', !r.ok && r.message.includes('越权'))
  r = disposeCase(3, '河东片区', { kind: '限期整改', rectifyDays: 7, summary: 'x' })
  check('跨片区处置打回', !r.ok && r.message.includes('越权'))

  console.log('4) 处置只认限期整改/移交执法，整改天数必须写')
  r = disposeCase(3, '河西片区', { kind: '口头警告', rectifyDays: 0, summary: '下不为例' })
  check('口头警告不给过', !r.ok && r.message.includes('只认'))
  r = disposeCase(3, '河西片区', { kind: '限期整改', rectifyDays: 0, summary: '整改' })
  check('整改 0 天不给过', !r.ok && r.message.includes('天数'))
  const ledgerBefore = loadAll().ledger.length
  r = disposeCase(3, '河西片区', { kind: '限期整改', rectifyDays: 15, summary: '15日内拆除超许可取水设施' })
  check('限期整改 15 天通过', r.ok, r.message)
  const c3 = getCase(3)!
  check('整改天数写入文书', c3.disposal?.rectifyDays === 15)
  check('处置结论同步隐患台账', loadAll().ledger.length === ledgerBefore + 1)
  const h3 = loadAll().ledger.find((h) => h.caseNo === 'JC-2026-0003')!
  check('台账结论与详情一致', h3.conclusion === '限期整改' && conclusionText(c3).includes('限期整改 15 天'))

  console.log('5) 重复处置不允许（结论只有一份）')
  r = disposeCase(3, '河西片区', { kind: '移交执法', rectifyDays: 0, summary: '改移交' })
  check('处置后不能改写', !r.ok)

  console.log('6) 合规单不能走违规处置，只能销案')
  r = disposeCase(6, '南郊片区', { kind: '移交执法', rectifyDays: 0, summary: 'x' })
  check('合规单移交执法被拦', !r.ok)

  console.log('7) 取水申报超许可范围不允许保存，并写明超出量')
  r = saveDeclaration({ userNo: 'U-1001', caliber: 200, amount: 100 })
  check('口径超上限退回', !r.ok && r.message.includes('超 50mm'), r.message)
  r = saveDeclaration({ userNo: 'U-1002', caliber: 100, amount: 100 })
  check('超年度额度退回并写明 m³', !r.ok && r.message.includes('m³'), r.message)
  r = saveDeclaration({ userNo: 'U-1001', caliber: 150, amount: 100 })
  check('许可范围内申报可保存', r.ok, r.message)
  r = saveDeclaration({ userNo: 'U-2004', caliber: 80, amount: 10 })
  check('只有老许可的用户新年度申报拒绝', !r.ok)

  console.log('8) 老稽查单冻结：不按新标准改写、不受理改动')
  const c5 = getCase(5)!
  check('老单状态为老单留存', c5.status === '老单留存')
  r = issueRuling(5, '北郊片区')
  check('老单不重新判定', !r.ok && r.message.includes('当年口径'))
  r = disposeCase(5, '北郊片区', { kind: '移交执法', rectifyDays: 0, summary: 'x' })
  check('老单不受理处置', !r.ok)
  check('老单结论保留当年口径', conclusionText(c5).includes('按2025年当年口径'))

  console.log('9) 列表页结论与详情同源')
  const list = listCases({ keyword: '', violationType: '', status: '' })
  const same = list.every((c) => conclusionText(c) === conclusionText(getCase(c.id)!))
  check('列表/详情结论函数完全一致', same)

  console.log(`\n结果：${pass} 通过，${fail} 失败`)
  if (fail > 0) process.exit(1)
}

main()
