<template>
  <section class="page" data-module="inspection">
    <header class="page-head">
      <div>
        <h2>供水稽查与违规用水处理</h2>
        <p class="page-desc">
          稽查编号下的记录按同一套标准判（{{ standardText }}）；取水口径超出许可范围的一律不允许保存；
          处置只认限期整改与移交执法两条路，结论落到供水调度隐患台账。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记稽查记录</button>
        <button class="btn" type="button" @click="openPermits">取水许可核发</button>
        <button class="btn" type="button" @click="exportRows">导出稽查清单</button>
      </div>
    </header>

    <div class="session-bar">
      <label class="session-item">
        当前出勤片区
        <select v-model="dutyDistrict">
          <option v-for="d in districts" :key="d" :value="d">{{ d }}</option>
        </select>
      </label>
      <span class="detail-note">稽查车按片区出勤；跨片区递上来的改动算越权，直接打回。</span>
    </div>

    <div v-if="loadError" class="error-bar">
      <span>{{ loadError }}</span>
      <button class="btn" type="button" @click="reload">重试</button>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>稽查编号</th>
          <th>所属片区</th>
          <th>用水户</th>
          <th>违规情形</th>
          <th>取水口径(mm)</th>
          <th>许可口径(mm)</th>
          <th>稽查车</th>
          <th>到场时间</th>
          <th>判定效力</th>
          <th>处置结论</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="item in viewRows"
          :key="String(item.row.id)"
          :class="{ 'row-illegal': item.row['违规情形'] === illegalPipe }"
        >
          <td>{{ item.row['稽查编号'] }}</td>
          <td>{{ item.row['所属片区'] }}</td>
          <td>{{ item.row['用水户'] }}</td>
          <td>
            <span class="tag" :class="violationTag(String(item.row['违规情形']))">
              {{ item.row['违规情形'] }}
            </span>
          </td>
          <td>{{ item.row['取水口径'] }}</td>
          <td>{{ item.row['许可口径'] }}（{{ item.row['许可年度'] }}年）</td>
          <td>{{ item.row['稽查车'] }}</td>
          <td>{{ item.row['到场时间'] }}</td>
          <td>
            <span v-if="item.effective" class="tag tag-ok">生效·先到现场</span>
            <span v-else class="tag tag-warn">被覆盖</span>
          </td>
          <td>
            <span class="tag" :class="conclusionTag(item.conclusion)">{{ item.conclusion }}</span>
          </td>
          <td class="row-actions">
            <button class="link" type="button" @click="openDetail(String(item.row['稽查编号']))">详情</button>
            <button
              v-if="item.row.status === '待处置'"
              class="link"
              type="button"
              @click="openEdit(item.row)"
            >
              编辑
            </button>
          </td>
        </tr>
        <tr v-if="!viewRows.length">
          <td colspan="11" class="empty-state">暂无稽查记录，可先登记稽查记录</td>
        </tr>
      </tbody>
    </table>

    <section v-if="detail" class="detail-panel">
      <h3>
        稽查编号 {{ detail.caseId }} · 处置结论：
        <span class="tag" :class="conclusionTag(detail.conclusion)">{{ detail.conclusion }}</span>
      </h3>
      <p class="detail-note">
        统一判定口径：{{ detail.standard }}；两条判定打架时以先到现场的那一版为准。
        <template v-if="detail.conflict">本单存在冲突判定，生效的是 {{ detail.firstArrival }} 到场的那一版。</template>
      </p>
      <p v-if="detail.legacy" class="detail-note">
        老稽查单按 {{ detail.year }} 年口径留存，不按新标准回头改写。
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>到场时间</th>
            <th>稽查车</th>
            <th>违规情形</th>
            <th>取水口径(mm)</th>
            <th>许可口径(mm)</th>
            <th>判定口径</th>
            <th>判定效力</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in detail.rows"
            :key="String(row.id)"
            :class="{ 'row-illegal': row['违规情形'] === illegalPipe }"
          >
            <td>{{ row['到场时间'] }}</td>
            <td>{{ row['稽查车'] }}</td>
            <td>
              <span class="tag" :class="violationTag(String(row['违规情形']))">{{ row['违规情形'] }}</span>
            </td>
            <td>{{ row['取水口径'] }}</td>
            <td>{{ row['许可口径'] }}</td>
            <td>{{ row['判定口径'] }}</td>
            <td>{{ isEffective(rows, row) ? '生效·先到现场' : '被覆盖' }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="detail.conclusion === '待处置'" class="dispose-bar">
        <label class="session-item">
          处置方式
          <select v-model="disposeForm.disposition">
            <option v-for="d in dispositions" :key="d" :value="d">{{ d }}</option>
          </select>
        </label>
        <label v-if="disposeForm.disposition === '限期整改'" class="session-item">
          整改天数（写在文书上）
          <input v-model.number="disposeForm.days" type="number" min="1" placeholder="如 15" />
        </label>
        <button class="btn primary" type="button" @click="submitDispose">提交处置</button>
      </div>
      <p v-else class="detail-note">
        处置文书：{{ detail.conclusion }}<template v-if="detail.conclusion === '限期整改'">，限期 {{ detail.days }} 天</template>。
        <template v-if="detail.hazard">
          已落入供水调度隐患台账：{{ detail.hazard['隐患编号'] }}（{{ detail.hazard['台账状态'] }}）。
        </template>
      </p>
      <p v-if="disposeError" class="error-text">{{ disposeError }}</p>
    </section>

    <footer class="page-foot">
      <span>共 {{ viewRows.length }} 条稽查记录（{{ stats[0].value }} 个稽查编号）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="notice" class="ok-text">{{ notice }}</span>
    </footer>

    <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <div class="modal-card">
        <h3>{{ form.mode === 'create' ? '登记稽查记录' : `编辑稽查记录 ${form.稽查编号}` }}</h3>
        <div class="form-grid">
          <label class="form-item">
            <span>稽查编号</span>
            <input v-model="form.稽查编号" :readonly="form.mode === 'edit'" />
          </label>
          <label class="form-item">
            <span>所属片区（按当前出勤片区登记）</span>
            <input :value="form.所属片区" readonly />
          </label>
          <label class="form-item">
            <span>用水户</span>
            <select v-if="form.mode === 'create'" v-model="form.用水户">
              <option v-for="u in permitUsers" :key="u" :value="u">{{ u }}</option>
            </select>
            <input v-else :value="form.用水户" readonly />
          </label>
          <label class="form-item">
            <span>许可年度（取水许可按年核发）</span>
            <select v-if="form.mode === 'create'" v-model.number="form.许可年度">
              <option v-for="y in permitYears" :key="y" :value="y">{{ y }}</option>
            </select>
            <input v-else :value="`${form.许可年度}（老单按当年口径留存）`" readonly />
          </label>
          <label class="form-item">
            <span>违规情形</span>
            <select v-model="form.违规情形">
              <option v-for="v in violationTypes" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>取水口径(mm)</span>
            <input v-model.number="form.取水口径" type="number" min="1" placeholder="超出许可范围不予保存" />
          </label>
          <label class="form-item">
            <span>稽查车（按片区出勤）</span>
            <select v-model="form.稽查车">
              <option v-for="v in formVehicles" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>
          <label class="form-item">
            <span>到场时间（先到现场为准）</span>
            <input v-model="form.到场时间" type="datetime-local" />
          </label>
        </div>
        <p v-if="formError" class="error-text">{{ formError }}</p>
        <div class="form-actions">
          <button class="btn ghost" type="button" @click="showForm = false">取消</button>
          <button class="btn primary" type="button" @click="submitForm">保存</button>
        </div>
      </div>
    </div>

    <div v-if="showPermits" class="modal-mask" @click.self="showPermits = false">
      <div class="modal-card">
        <h3>取水许可（按年核发）</h3>
        <table class="data-table">
          <thead>
            <tr><th>用水户</th><th>许可年度</th><th>许可口径(mm)</th><th>核发日期</th></tr>
          </thead>
          <tbody>
            <tr v-for="p in permits" :key="String(p.id)">
              <td>{{ p['用水户'] }}</td>
              <td>{{ p['许可年度'] }}</td>
              <td>{{ p['许可口径'] }}</td>
              <td>{{ p['核发日期'] }}</td>
            </tr>
          </tbody>
        </table>
        <div class="form-grid permit-form">
          <label class="form-item">
            <span>用水户</span>
            <input v-model="permitForm.用水户" placeholder="用水户名称" />
          </label>
          <label class="form-item">
            <span>许可年度</span>
            <input v-model.number="permitForm.许可年度" type="number" min="2000" />
          </label>
          <label class="form-item">
            <span>许可口径(mm)</span>
            <input v-model.number="permitForm.许可口径" type="number" min="1" />
          </label>
        </div>
        <p v-if="permitError" class="error-text">{{ permitError }}</p>
        <div class="form-actions">
          <button class="btn ghost" type="button" @click="showPermits = false">关闭</button>
          <button class="btn primary" type="button" @click="submitPermit">核发许可</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import {
  CURRENT_PERMIT_YEAR,
  DISPOSITIONS,
  DISTRICTS,
  ILLEGAL_PIPE,
  UNIFIED_STANDARD,
  VEHICLES_BY_DISTRICT,
  VIOLATION_TYPES,
  caseConclusion,
  caseRows,
  createInspection,
  disposeCase,
  effectiveRow,
  hazardForCase,
  isEffective,
  issuePermit,
  listInspections,
  listPermits,
  nextCaseId,
  updateInspection,
} from '@/api/inspection-service'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const standardText = UNIFIED_STANDARD
const districts = DISTRICTS
const violationTypes = VIOLATION_TYPES
const dispositions = DISPOSITIONS
const illegalPipe = ILLEGAL_PIPE

const store = useSessionStore()
// 当前出勤片区写在会话里：跨片区递上来的改动算越权，直接打回。
const dutyDistrict = computed({
  get: () => store.district,
  set: (value: string) => store.setDistrict(value),
})

const rows = ref<EntryRow[]>([])
const permits = ref<EntryRow[]>([])
const loadError = ref('')
const errorMessage = ref('')
const notice = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ['稽查编号', '用水户', '违规情形', '所属片区']
const selectedCaseId = ref('')

// 取数失败时能重试：reload 出错只提示，点重试再取一遍。
function reload() {
  loadError.value = ''
  try {
    rows.value = listInspections()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '稽查记录取数失败，请重试'
  }
  permits.value = listPermits()
}

// 列表页每行的处置结论都走 caseConclusion，和详情面板读的是同一份。
const viewRows = computed(() => {
  const pairs = Object.entries(filters.value).filter(([, value]) => value.trim() !== '')
  return rows.value
    .filter((row) => pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())))
    .map((row) => ({
      row,
      effective: isEffective(rows.value, row),
      conclusion: caseConclusion(rows.value, String(row['稽查编号'])),
    }))
})

const stats = computed(() => {
  const effective = rows.value.filter((row) => isEffective(rows.value, row))
  return [
    { label: '稽查编号数', value: new Set(rows.value.map((row) => String(row['稽查编号']))).size },
    { label: '待处置', value: effective.filter((row) => row['处置结论'] === '待处置').length },
    { label: '私接管路', value: effective.filter((row) => row['违规情形'] === ILLEGAL_PIPE).length },
    { label: '限期整改', value: effective.filter((row) => row['处置结论'] === '限期整改').length },
    { label: '移交执法', value: effective.filter((row) => row['处置结论'] === '移交执法').length },
  ]
})

const detail = computed(() => {
  if (!selectedCaseId.value) {
    return null
  }
  const rowsOfCase = caseRows(rows.value, selectedCaseId.value)
  const eff = effectiveRow(rows.value, selectedCaseId.value)
  if (!rowsOfCase.length || !eff) {
    return null
  }
  return {
    caseId: selectedCaseId.value,
    rows: [...rowsOfCase].sort((a, b) => String(a['到场时间']).localeCompare(String(b['到场时间']))),
    conclusion: caseConclusion(rows.value, selectedCaseId.value),
    standard: String(eff['判定口径'] ?? ''),
    year: Number(eff['许可年度']),
    legacy: Number(eff['许可年度']) < CURRENT_PERMIT_YEAR,
    days: eff['整改天数'],
    hazard: hazardForCase(selectedCaseId.value),
    conflict: new Set(rowsOfCase.map((row) => String(row['违规情形']))).size > 1,
    firstArrival: String(eff['到场时间']),
  }
})

function violationTag(value: string) {
  if (value === ILLEGAL_PIPE) {
    return 'tag-danger'
  }
  if (value === '无违规') {
    return 'tag-ok'
  }
  return 'tag-warn'
}

function conclusionTag(value: string) {
  if (value === '限期整改') {
    return 'tag-info'
  }
  if (value === '移交执法') {
    return 'tag-danger'
  }
  return ''
}

function resetFilters() {
  filters.value = {}
}

function exportRows() {
  downloadEntries('inspection')
}

function openDetail(caseId: string) {
  selectedCaseId.value = caseId
  disposeError.value = ''
  disposeForm.disposition = DISPOSITIONS[0]
  disposeForm.days = 15
}

// ---------- 登记 / 编辑 ----------

const showForm = ref(false)
const formError = ref('')
const form = reactive({
  mode: 'create' as 'create' | 'edit',
  id: 0,
  稽查编号: '',
  所属片区: '',
  用水户: '',
  违规情形: VIOLATION_TYPES[0],
  取水口径: 100,
  许可年度: CURRENT_PERMIT_YEAR,
  稽查车: '',
  到场时间: '',
})

const permitUsers = computed(() => [...new Set(permits.value.map((p) => String(p['用水户'])))])
const permitYears = computed(() =>
  permits.value
    .filter((p) => String(p['用水户']) === form.用水户)
    .map((p) => Number(p['许可年度']))
    .sort((a, b) => b - a),
)
const formVehicles = computed(() => VEHICLES_BY_DISTRICT[form.所属片区] ?? [])

function toLocalInput(value: string) {
  return value.replace(' ', 'T').slice(0, 16)
}

function nowLocalInput() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openCreate() {
  const district = store.district
  form.mode = 'create'
  form.id = 0
  form.稽查编号 = nextCaseId()
  form.所属片区 = district
  form.用水户 = permitUsers.value[0] ?? ''
  form.违规情形 = VIOLATION_TYPES[0]
  form.取水口径 = 100
  form.许可年度 = CURRENT_PERMIT_YEAR
  form.稽查车 = (VEHICLES_BY_DISTRICT[district] ?? [])[0] ?? ''
  form.到场时间 = nowLocalInput()
  formError.value = ''
  showForm.value = true
}

function openEdit(row: EntryRow) {
  form.mode = 'edit'
  form.id = Number(row.id)
  form.稽查编号 = String(row['稽查编号'])
  form.所属片区 = String(row['所属片区'])
  form.用水户 = String(row['用水户'])
  form.违规情形 = String(row['违规情形'])
  form.取水口径 = Number(row['取水口径'])
  form.许可年度 = Number(row['许可年度'])
  form.稽查车 = String(row['稽查车'])
  form.到场时间 = toLocalInput(String(row['到场时间']))
  formError.value = ''
  showForm.value = true
}

function submitForm() {
  formError.value = ''
  errorMessage.value = ''
  notice.value = ''
  const payload = {
    稽查编号: form.稽查编号,
    所属片区: form.所属片区,
    用水户: form.用水户,
    违规情形: form.违规情形,
    取水口径: Number(form.取水口径),
    许可年度: Number(form.许可年度),
    稽查车: form.稽查车,
    到场时间: form.到场时间.replace('T', ' '),
  }
  const ctx = { district: store.district }
  const result =
    form.mode === 'create' ? createInspection(payload, ctx) : updateInspection(form.id, payload, ctx)
  if (!result.ok) {
    formError.value = result.message
    return
  }
  notice.value = result.message
  showForm.value = false
  reload()
}

// ---------- 处置 ----------

const disposeForm = reactive({ disposition: DISPOSITIONS[0], days: 15 })
const disposeError = ref('')

function submitDispose() {
  disposeError.value = ''
  errorMessage.value = ''
  notice.value = ''
  if (!detail.value) {
    return
  }
  const result = disposeCase(
    detail.value.caseId,
    disposeForm.disposition,
    Number(disposeForm.days),
    { district: store.district },
  )
  if (!result.ok) {
    disposeError.value = result.message
    return
  }
  notice.value = result.message
  reload()
}

// ---------- 取水许可 ----------

const showPermits = ref(false)
const permitError = ref('')
const permitForm = reactive({ 用水户: '', 许可年度: CURRENT_PERMIT_YEAR, 许可口径: 100 })

function openPermits() {
  permits.value = listPermits()
  permitError.value = ''
  showPermits.value = true
}

function submitPermit() {
  permitError.value = ''
  const result = issuePermit({ ...permitForm })
  if (!result.ok) {
    permitError.value = result.message
    return
  }
  notice.value = result.message
  permitForm.用水户 = ''
  permits.value = listPermits()
  reload()
}

onMounted(reload)
</script>
