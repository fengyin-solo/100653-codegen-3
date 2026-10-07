<template>
  <aside v-if="item" class="detail-panel">
    <header class="detail-head">
      <div>
        <h3>
          稽查单 {{ item.caseNo }}
          <span class="tag" :class="isViolationTag ? 'tag-danger' : 'tag-muted'">{{ statusLabel }}</span>
          <span v-if="isIllicit" class="tag tag-warn">私接管路</span>
          <span v-if="item.frozenLegacy?.kept" class="tag tag-lock">老单留存</span>
        </h3>
        <p class="detail-conclusion">处置结论：<strong>{{ conclusion }}</strong></p>
      </div>
      <button class="btn ghost" type="button" @click="emit('close')">收起</button>
    </header>

    <section class="detail-section">
      <h4>基本信息</h4>
      <dl class="kv">
        <div><dt>所属片区</dt><dd>{{ item.zone }}</dd></div>
        <div><dt>被查用户</dt><dd>{{ item.user }}（{{ item.userNo }}）</dd></div>
        <div><dt>违规情形</dt><dd>
          <span :class="isIllicit ? 'danger-text' : ''">{{ item.violationType }}</span>
        </dd></div>
        <div><dt>取水许可</dt><dd>{{ item.permitNo ?? '无许可（私接/无证）' }}</dd></div>
        <div><dt>举报时间</dt><dd>{{ item.reportedAt }}</dd></div>
        <div><dt>适用标准年度</dt><dd>{{ item.year }} 年口径</dd></div>
      </dl>
    </section>

    <section class="detail-section">
      <h4>现场记录（同一稽查编号，一套标准）</h4>
      <table v-if="item.siteVerdicts.length" class="mini-table">
        <thead>
          <tr><th>队别</th><th>到场时间</th><th>稽查车</th><th>口径(mm)</th><th>取水量(m³)</th><th>自报</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="v in item.siteVerdicts"
            :key="v.team + v.arrivedAt"
            :class="{ 'row-author': item.ruling && v.team === item.ruling.authoritativeTeam }"
          >
            <td>
              {{ v.team }}
              <span v-if="item.ruling && v.team === item.ruling.authoritativeTeam" class="tag tag-blue">先到现场·采信</span>
            </td>
            <td>{{ v.arrivedAt }}</td>
            <td>{{ v.vehiclePlate }}</td>
            <td>{{ v.caliber }}</td>
            <td>{{ v.amount ?? '—' }}</td>
            <td>{{ v.opinion }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted-text">尚无队伍到现场。</p>
      <p v-for="v in item.siteVerdicts" :key="'n' + v.team + v.arrivedAt" class="verdict-note">
        {{ v.team}}现场说明：{{ v.note }}
      </p>

      <div v-if="canSubmit" class="inline-form">
        <h4>提交现场判定</h4>
        <div class="form-grid">
          <label><span>队别</span>
            <select v-model="form.team">
              <option value="">请选择</option>
              <option>一队</option>
              <option>二队</option>
            </select>
          </label>
          <label><span>到场时间</span><input v-model="form.arrivedAt" placeholder="2026-10-07 09:30" /></label>
          <label><span>出勤稽查车</span>
            <select v-model="form.vehiclePlate">
              <option value="">请选择（按片区出勤）</option>
              <option v-for="veh in zoneVehicles" :key="veh.plate" :value="veh.plate">
                {{ veh.plate }}（{{ veh.homeZone }}·{{ veh.status }}）
              </option>
              <option v-for="veh in otherVehicles" :key="veh.plate" :value="veh.plate">
                {{ veh.plate }}（{{ veh.homeZone }}·跨片区，越权）
              </option>
            </select>
          </label>
          <label><span>实测口径 DN(mm)</span><input v-model.number="form.caliber" type="number" min="1" /></label>
          <label><span>累计取水量(m³，无证留空)</span><input v-model.number="form.amount" type="number" min="0" /></label>
          <label><span>队别自报意见（仅留痕）</span>
            <select v-model="form.opinion">
              <option value="合规">合规（一队常用口径）</option>
              <option value="违规">违规（二队常用口径）</option>
            </select>
          </label>
        </div>
        <label class="full-line"><span>现场说明</span><textarea v-model="form.note" rows="2"></textarea></label>
        <button class="btn primary" type="button" @click="submit">提交现场判定</button>
        <p class="hint">队别自报的合规/违规只作留痕，最终按统一口径裁定；两队打架以先到现场一版为准。</p>
      </div>
    </section>

    <section v-if="item.ruling" class="detail-section">
      <h4>统一口径裁定</h4>
      <p :class="item.ruling.isViolation ? 'danger-text' : 'ok-text'">
        <strong>{{ item.ruling.isViolation ? '认定违规' : '认定不违规' }}</strong>
        （采信 {{ item.ruling.authoritativeTeam }} 先到现场数据，按 {{ item.ruling.standardYear }} 年标准）
      </p>
      <p class="ruling-basis">{{ item.ruling.basis }}</p>
    </section>

    <section v-if="item.frozenLegacy?.kept" class="detail-section frozen-box">
      <h4>老单冻结（按当年口径留存）</h4>
      <p>当年口径：{{ item.frozenLegacy.legacyStandard }}</p>
      <p>原结论：{{ item.frozenLegacy.conclusion }}</p>
      <p class="hint">本单不按 {{ standardYear }} 年新标准回头改写，也不受理跨片区改动。</p>
    </section>

    <section v-if="canRule" class="detail-section">
      <h4>出具裁定</h4>
      <p class="hint">已有 {{ item.siteVerdicts.length }} 份现场记录，将按统一口径（{{ standardYear }} 年标准）自动裁定，覆盖各队自报结论。</p>
      <button class="btn primary" type="button" @click="emit('rule', item.id)">按统一口径裁定</button>
    </section>

    <section v-if="canDispose" class="detail-section action-box">
      <h4>违规处置（只认限期整改 / 移交执法）</h4>
      <form class="inline-form" @submit.prevent="dispose">
        <div class="form-grid">
          <label><span>处置方式</span>
            <select v-model="disposeForm.kind">
              <option value="">请选择</option>
              <option v-for="k in kinds" :key="k" :value="k">{{ k }}</option>
              <option value="口头警告">口头警告（不允许，演示拦截）</option>
              <option value="罚款放行">罚款放行（不允许，演示拦截）</option>
            </select>
          </label>
          <label v-if="disposeForm.kind === '限期整改'"><span>整改天数（写入文书）</span>
            <input v-model.number="disposeForm.rectifyDays" type="number" min="1" placeholder="如 7" />
          </label>
        </div>
        <label class="full-line"><span>处置内容</span><textarea v-model="disposeForm.summary" rows="2"></textarea></label>
        <button class="btn primary" type="submit">出具处置文书并同步隐患台账</button>
      </form>
    </section>

    <section v-if="canClose" class="detail-section action-box">
      <h4>核查销案（不违规）</h4>
      <form class="inline-form" @submit.prevent="closeCase">
        <label class="full-line"><span>销案说明</span><textarea v-model="closureSummary" rows="2"></textarea></label>
        <button class="btn" type="submit">出具核查文书并销案</button>
      </form>
    </section>

    <section v-if="item.disposal || item.closure" class="detail-section">
      <h4>处置/销案文书</h4>
      <div v-if="item.disposal">
        <p>文书号：{{ item.disposal.documentNo }}</p>
        <p>处置结论：<strong :class="item.disposal.kind === '移交执法' ? 'danger-text' : ''">{{ item.disposal.kind }}<template v-if="item.disposal.kind === '限期整改'">，{{ item.disposal.rectifyDays }} 天（已写入文书）</template></strong></p>
        <p>作出时间：{{ item.disposal.decidedAt }}</p>
        <p>内容：{{ item.disposal.summary }}</p>
        <p class="hint">该结论已同步供水调度隐患台账；列表页结论与本面板同源一致。</p>
      </div>
      <div v-else-if="item.closure">
        <p>文书号：{{ item.closure.documentNo }}</p>
        <p>结论：核查销案，{{ item.closure.closedAt }}</p>
        <p>内容：{{ item.closure.summary }}</p>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'

import { DISPOSAL_KINDS, isIllicitTap } from '@/api/inspection-service'
import type { AuditVehicle, InspectionCase, SiteVerdict } from '@/data/inspection-types'

const props = defineProps<{
  item: InspectionCase
  vehicles: AuditVehicle[]
  standardYear: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit-verdict', payload: { id: number; verdict: SiteVerdict }): void
  (e: 'rule', id: number): void
  (e: 'dispose', payload: { id: number; kind: string; rectifyDays: number; summary: string }): void
  (e: 'close-case', payload: { id: number; summary: string }): void
}>()

const kinds = DISPOSAL_KINDS
const isIllicit = computed(() => isIllicitTap(props.item))
const isViolationTag = computed(() => props.item.ruling?.isViolation ?? false)
const statusLabel = computed(() => props.item.status)
const conclusion = computed(() => {
  const item = props.item
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
})

const canSubmit = computed(() => props.item.status === '待现场判定')
const canRule = computed(
  () => !props.item.frozenLegacy && canSubmit.value && props.item.siteVerdicts.length > 0,
)
const canDispose = computed(
  () => props.item.status === '待处置' && props.item.ruling?.isViolation && !props.item.disposal,
)
const canClose = computed(
  () => props.item.status === '待处置' && props.item.ruling && !props.item.ruling.isViolation && !props.item.closure,
)

const zoneVehicles = computed(() => props.vehicles.filter((v) => v.homeZone === props.item.zone))
const otherVehicles = computed(() => props.vehicles.filter((v) => v.homeZone !== props.item.zone))

const form = reactive({
  team: '',
  arrivedAt: '',
  vehiclePlate: '',
  caliber: null as number | null,
  amount: null as number | null,
  opinion: '合规' as SiteVerdict['opinion'],
  note: '',
})

function submit() {
  emit('submit-verdict', {
    id: props.item.id,
    verdict: {
      team: form.team,
      arrivedAt: form.arrivedAt,
      vehiclePlate: form.vehiclePlate,
      caliber: Number(form.caliber),
      amount: form.amount === null ? null : Number(form.amount),
      opinion: form.opinion,
      note: form.note,
    },
  })
}

const disposeForm = reactive({ kind: '', rectifyDays: null as number | null, summary: '' })
function dispose() {
  emit('dispose', {
    id: props.item.id,
    kind: disposeForm.kind,
    rectifyDays: Number(disposeForm.rectifyDays),
    summary: disposeForm.summary,
  })
}

const closureSummary = ref('')
function closeCase() {
  emit('close-case', { id: props.item.id, summary: closureSummary.value })
}
</script>
