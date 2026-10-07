<template>
  <section class="page" data-module="inspection">
    <header class="page-head">
      <div>
        <h2>供水稽查与违规用水处理</h2>
        <p class="page-desc">
          一个稽查编号一套判定口径：取水许可按年核发，超许可范围申报退回并写明超了多少；私接管路直接认定违规；
          处置只认限期整改与移交执法；跨片区出勤与改动越权打回；两队打架以先到现场为准；老单按当年口径留存；处置结论落供水调度隐患台账。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="armFailure">演练：下一次取数失败</button>
        <button class="btn ghost" type="button" @click="resetData">恢复稽查示例数据</button>
      </div>
    </header>

    <div class="banner-standard">
      <strong>{{ bundle?.standard.year }} 年统一判定口径</strong>
      <ol class="rule-list">
        <li v-for="(rule, i) in bundle?.standard.rules ?? []" :key="i">{{ rule }}</li>
      </ol>
    </div>

    <div v-if="loadError" class="error-banner">
      <span>{{ loadError }}</span>
      <button class="btn primary" type="button" @click="reload">重新加载（重试）</button>
    </div>

    <template v-else-if="bundle">
      <div class="stat-row">
        <article v-for="item in stats" :key="item.label" class="stat-card">
          <span class="stat-label">{{ item.label }}</span>
          <strong class="stat-value">{{ item.value }}</strong>
        </article>
      </div>

      <div class="inspection-layout">
        <div class="inspection-main">
          <form class="filter-bar" @submit.prevent="reload">
            <label class="filter-item"><span>关键字</span>
              <input v-model="filters.keyword" placeholder="稽查编号 / 用户 / 片区" />
            </label>
            <label class="filter-item"><span>违规情形</span>
              <select v-model="filters.violationType">
                <option value="">全部</option>
                <option v-for="t in violationTypes" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <label class="filter-item"><span>状态</span>
              <select v-model="filters.status">
                <option value="">全部</option>
                <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <button class="btn" type="submit">查询</button>
          </form>

          <table class="data-table">
            <thead>
              <tr>
                <th>稽查编号</th>
                <th>片区</th>
                <th>被查用户</th>
                <th>违规情形</th>
                <th>现场记录</th>
                <th>处置结论（与详情一致）</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in cases"
                :key="row.id"
                :class="{
                  'row-selected': selectedId === row.id,
                  'row-illicit': isIllicitTap(row),
                }"
              >
                <td>{{ row.caseNo }}</td>
                <td>{{ row.zone }}</td>
                <td>{{ row.user }}</td>
                <td>
                  <span v-if="isIllicitTap(row)" class="tag tag-warn">私接管路</span>
                  <span v-else>{{ row.violationType }}</span>
                </td>
                <td>{{ row.siteVerdicts.length }} 份</td>
                <td>{{ conclusionOf(row) }}</td>
                <td>
                  <span class="tag" :class="statusClass(row)">{{ row.status }}</span>
                </td>
                <td><button class="link" type="button" @click="selectCase(row.id)">查看详情</button></td>
              </tr>
              <tr v-if="!cases.length">
                <td colspan="8" class="empty-state">当前筛选条件下没有稽查单</td>
              </tr>
            </tbody>
          </table>

          <div class="sub-grid">
            <section class="sub-card">
              <h4>取水许可（按年核发）</h4>
              <table class="mini-table">
                <thead><tr><th>许可号</th><th>用户</th><th>年度</th><th>口径范围</th><th>年度额度/已用(m³)</th></tr></thead>
                <tbody>
                  <tr v-for="p in bundle.permits" :key="p.permitNo" :class="{ 'row-old': p.year !== bundle.standard.year }">
                    <td>{{ p.permitNo }}</td>
                    <td>{{ p.user }}</td>
                    <td>{{ p.year }}</td>
                    <td>DN{{ p.caliberMin }}-DN{{ p.caliberMax }}</td>
                    <td>{{ p.annualQuota }} / {{ p.usedQuota }}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="sub-card">
              <h4>稽查车出勤（按片区）</h4>
              <table class="mini-table">
                <thead><tr><th>车牌</th><th>归属片区</th><th>状态</th></tr></thead>
                <tbody>
                  <tr v-for="v in bundle.vehicles" :key="v.plate">
                    <td>{{ v.plate }}</td>
                    <td>{{ v.homeZone }}</td>
                    <td>{{ v.status }}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <section class="sub-card">
            <h4>取水申报保存（超许可范围一律不允许保存）</h4>
            <form class="inline-form" @submit.prevent="submitDeclaration">
              <div class="form-grid">
                <label><span>用户编号</span>
                  <select v-model="declForm.userNo">
                    <option value="">请选择</option>
                    <option v-for="p in currentPermits" :key="p.permitNo" :value="p.userNo">
                      {{ p.userNo }} {{ p.user }}（DN{{ p.caliberMin }}-{{ p.caliberMax }} / {{ p.annualQuota }}m³）
                    </option>
                  </select>
                </label>
                <label><span>申报口径 DN(mm)</span><input v-model.number="declForm.caliber" type="number" min="1" /></label>
                <label><span>本次取水量(m³)</span><input v-model.number="declForm.amount" type="number" min="0" /></label>
              </div>
              <button class="btn primary" type="submit">校验并保存申报</button>
            </form>
            <p v-if="declMessage" :class="declOk ? 'ok-text' : 'error-text'">{{ declMessage }}</p>
          </section>
        </div>

        <CaseDetailPanel
          v-if="selected"
          class="inspection-side"
          :item="selected"
          :vehicles="bundle.vehicles"
          :standard-year="bundle.standard.year"
          @close="selectedId = null"
          @submit-verdict="onSubmitVerdict"
          @rule="onIssueRuling"
          @dispose="onDispose"
          @close-case="onCloseCase"
        />
      </div>

      <section class="sub-card ledger-card">
        <h4>供水调度隐患台账（处置结论落点，与调度页同源）</h4>
        <table class="mini-table">
          <thead>
            <tr><th>隐患号</th><th>稽查编号</th><th>片区</th><th>用户</th><th>违规情形</th><th>处置结论</th><th>整改天数</th><th>文书号</th><th>同步时间</th><th>台账状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in bundle.ledger" :key="h.hazardNo">
              <td>{{ h.hazardNo }}</td>
              <td>{{ h.caseNo }}</td>
              <td>{{ h.zone }}</td>
              <td>{{ h.user }}</td>
              <td><span v-if="h.violationType === '私接管路'" class="tag tag-warn">私接管路</span><span v-else>{{ h.violationType }}</span></td>
              <td>{{ h.conclusion }}</td>
              <td>{{ h.conclusion === '限期整改' ? h.rectifyDays + ' 天' : '—' }}</td>
              <td>{{ h.documentNo }}</td>
              <td>{{ h.syncedAt }}</td>
              <td>{{ h.status }}</td>
            </tr>
            <tr v-if="!bundle.ledger.length">
              <td colspan="10" class="empty-state">暂无隐患台账记录，违规处置后自动同步</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer class="page-foot">
        <span>
          当前出勤片区：<strong>{{ store.dutyZone }}</strong>，可在右上角切换；对非本片区稽查单的提交/处置会被越权打回。
          数据保存在本机浏览器（{{ storageKey }}）。
        </span>
        <span v-if="actionMessage" :class="actionOk ? 'ok-text' : 'error-text'">{{ actionMessage }}</span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  caseStats,
  closeCase as closeCaseSvc,
  conclusionText,
  disposeCase,
  isIllicitTap,
  issueRuling,
  listCases,
  loadAll,
  resetAll,
  saveDeclaration,
  submitVerdict,
} from '@/api/inspection-service'
import { armNextLoadFailure, inspectionStorageKey } from '@/data/inspection-store'
import type { InspectionBundle, InspectionCase, MutationResult, SiteVerdict } from '@/data/inspection-types'
import { useSessionStore } from '@/stores/session'
import CaseDetailPanel from './CaseDetailPanel.vue'

const store = useSessionStore()
const storageKey = inspectionStorageKey()

const statuses = ['待现场判定', '待处置', '已处置', '已销案', '老单留存']
const violationTypes = ['私接管路', '超许可取水', '举报核查']

const bundle = ref<InspectionBundle | null>(null)
const loadError = ref('')
const selectedId = ref<number | null>(null)
const filters = reactive({ keyword: '', violationType: '', status: '' })
const actionMessage = ref('')
const actionOk = ref(false)
const declMessage = ref('')
const declOk = ref(false)
const declForm = reactive({ userNo: '', caliber: null as number | null, amount: null as number | null })

const cases = ref<InspectionCase[]>([])
const stats = ref<{ label: string; value: number }[]>([])

const selected = computed(() =>
  bundle.value?.cases.find((c) => c.id === selectedId.value) ?? null,
)
const currentPermits = computed(() =>
  (bundle.value?.permits ?? []).filter((p) => p.year === bundle.value?.standard.year),
)

function reload() {
  loadError.value = ''
  try {
    bundle.value = loadAll()
    cases.value = listCases(filters)
    stats.value = caseStats()
  } catch (error) {
    bundle.value = null
    loadError.value = error instanceof Error ? error.message : '稽查数据取数失败，请重试'
  }
}

function armFailure() {
  armNextLoadFailure()
  actionMessage.value = '已安排下一次取数失败，点击查询或重新加载即可看到重试入口。'
  actionOk.value = true
}

function resetData() {
  resetAll()
  selectedId.value = null
  actionMessage.value = '稽查数据已恢复为示例数据。'
  actionOk.value = true
  reload()
}

function selectCase(id: number) {
  selectedId.value = id
}

function conclusionOf(row: InspectionCase): string {
  return conclusionText(row)
}

function statusClass(row: InspectionCase): string {
  if (row.frozenLegacy?.kept) return 'tag-lock'
  if (row.ruling?.isViolation && row.status === '待处置') return 'tag-danger'
  if (row.status === '已处置') return 'tag-blue'
  return 'tag-muted'
}

function notify(result: MutationResult) {
  actionMessage.value = result.message
  actionOk.value = result.ok
  if (result.ok) {
    reload()
  }
}

function onSubmitVerdict(payload: { id: number; verdict: SiteVerdict }) {
  notify(submitVerdict(payload.id, store.dutyZone, payload.verdict))
}

function onIssueRuling(id: number) {
  notify(issueRuling(id, store.dutyZone))
}

function onDispose(payload: { id: number; kind: string; rectifyDays: number; summary: string }) {
  notify(disposeCase(payload.id, store.dutyZone, payload))
}

function onCloseCase(payload: { id: number; summary: string }) {
  notify(closeCaseSvc(payload.id, store.dutyZone, payload.summary))
}

function submitDeclaration() {
  declMessage.value = ''
  const result = saveDeclaration({
    userNo: declForm.userNo,
    caliber: Number(declForm.caliber),
    amount: Number(declForm.amount),
  })
  declOk.value = result.ok
  declMessage.value = result.message
  if (result.ok) {
    declForm.userNo = ''
    declForm.caliber = null
    declForm.amount = null
    reload()
  }
}

onMounted(reload)
</script>
