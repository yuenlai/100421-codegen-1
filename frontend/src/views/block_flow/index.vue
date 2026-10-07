<template>
  <section class="page" data-module="block-flow">
    <header class="page-head">
      <div>
        <h2>船体车间建造流水</h2>
        <p class="page-desc">
          分段按下料、装配、焊接、完工四个阶段排列呈现；拖动卡片推进阶段，并发拖动时只让先落库的那条生效。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openRegister">登记船体分段</button>
        <button class="btn" type="button" @click="reload">刷新看板</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="column in columns" :key="column.stage" class="stat-card">
        <span class="stat-label">{{ column.stage }}阶段</span>
        <strong class="stat-value">{{ column.cards.length }}</strong>
      </article>
    </div>

    <div class="toolbar">
      <button class="btn" type="button" @click="runBackfill">按登记先后回填老分段区域</button>
      <button class="btn" type="button" @click="openLabor">工时标准改版</button>
      <button class="btn ghost" type="button" @click="simulateConcurrency">模拟并发拖动</button>
      <span class="tool-hint">规则：冲突以设计重量为准 · 既有单子保留原工时口径</span>
    </div>

    <p v-if="message" class="notice" :class="messageKind">{{ message }}</p>

    <div class="board">
      <div
        v-for="column in columns"
        :key="column.stage"
        class="board-col"
        :class="{ dragover: dragOverStage === column.stage }"
        @dragover.prevent="dragOverStage = column.stage"
        @dragleave="dragOverStage = ''"
        @drop.prevent="onDrop(column.stage)"
      >
        <header class="col-head">
          <strong>{{ column.stage }}</strong>
          <span class="col-count">{{ column.cards.length }}</span>
        </header>
        <div class="col-body">
          <article
            v-for="card in column.cards"
            :key="String(card.id)"
            class="flow-card"
            :class="{ dragging: draggingId === Number(card.id) }"
            draggable="true"
            @dragstart="onDragStart($event, card)"
            @dragend="dragOverStage = ''"
          >
            <header class="card-head">
              <strong>{{ card.分段编号 }}</strong>
              <span class="card-name">{{ card.分段名称 }}</span>
            </header>
            <dl class="card-fields">
              <div><dt>钢材牌号</dt><dd>{{ card.钢材牌号 }}</dd></div>
              <div><dt>设计重量</dt><dd>{{ card.设计重量 }} t</dd></div>
              <div><dt>外形尺寸</dt><dd>{{ card.外形尺寸 }}</dd></div>
              <div><dt>所属区域</dt><dd :class="{ missing: !card.所属区域 }">{{ card.所属区域 || '未登记' }}</dd></div>
              <div><dt>计划工时</dt><dd>{{ card.计划工时 }} h</dd></div>
              <div><dt>工时口径</dt><dd class="snapshot">{{ card.工时口径 }}</dd></div>
            </dl>
            <footer class="card-foot">
              <span>v{{ Number(card.rowVersion ?? 1) }} · {{ card.status }}</span>
              <select
                :value="column.stage"
                title="也可下拉推进阶段"
                @change="onQuickMove(card, ($event.target as HTMLSelectElement).value as BlockStage)"
              >
                <option v-for="stage in stages" :key="stage" :value="stage">移到{{ stage }}</option>
              </select>
            </footer>
          </article>
          <p v-if="!column.cards.length" class="col-empty">本阶段暂无分段</p>
        </div>
      </div>
    </div>

    <section class="panel">
      <header class="panel-head">
        <h3>大合拢顺序调整</h3>
        <span class="tool-hint">调整落库后，建造计划节点台账自动追加一条「待排」节点（当前待排 {{ pendingCount }} 条）</span>
      </header>
      <ol class="order-list">
        <li v-for="(item, index) in orderDraft" :key="item.blockId" class="order-item">
          <span class="order-index">{{ index + 1 }}</span>
          <span class="order-code">{{ item.分段编号 }}</span>
          <span class="order-grade">{{ blockMap.get(item.blockId)?.钢材牌号 }}</span>
          <span class="order-weight">{{ blockMap.get(item.blockId)?.设计重量 }} t</span>
          <span class="order-actions">
            <button class="link" type="button" :disabled="index === 0" @click="moveOrder(index, -1)">上移</button>
            <button class="link" type="button" :disabled="index === orderDraft.length - 1" @click="moveOrder(index, 1)">下移</button>
          </span>
        </li>
      </ol>
      <footer class="panel-foot">
        <label class="filter-item">
          <span>调度员</span>
          <input v-model="operator" placeholder="调度员姓名" />
        </label>
        <button class="btn primary" type="button" @click="saveOrder">保存合拢顺序并生成待排节点</button>
      </footer>
    </section>

    <div v-if="backfill" class="panel">
      <header class="panel-head"><h3>历史区域回填结果</h3></header>
      <ul class="result-list">
        <li v-for="item in backfill.updated" :key="item.分段编号" class="ok">
          {{ item.分段编号 }} → {{ item.所属区域 }}
        </li>
        <li v-for="item in backfill.skipped" :key="item.分段编号" class="warn">
          {{ item.分段编号 }}：{{ item.reason }}
        </li>
      </ul>
    </div>

    <div v-if="registerOpen" class="modal-mask" @click.self="registerOpen = false">
      <div class="modal">
        <h3>登记船体分段</h3>
        <p class="tool-hint">计划工时按现行标准 {{ laborBook.currentVersion }} 计算，并随单固化口径。</p>
        <div class="form-grid">
          <label><span>分段编号</span><input v-model="registerForm.分段编号" placeholder="如 BLOC-0013" /></label>
          <label><span>分段名称</span><input v-model="registerForm.分段名称" /></label>
          <label><span>所属区域</span><input v-model="registerForm.所属区域" placeholder="可留空，后续按历史回填" /></label>
          <label>
            <span>钢材牌号</span>
            <select v-model="registerForm.钢材牌号" @change="updatePreview">
              <option value="" disabled>请选择</option>
              <option v-for="rate in Object.keys(laborBook.versions[laborBook.currentVersion].工时每吨)" :key="rate" :value="rate">
                {{ rate }}
              </option>
            </select>
          </label>
          <label>
            <span>设计重量(t)</span>
            <input v-model.number="registerForm.设计重量" type="number" min="0" step="0.1" @input="updatePreview" />
          </label>
          <label><span>外形尺寸</span><input v-model="registerForm.外形尺寸" placeholder="如 10000×12000×2000" /></label>
        </div>
        <p class="preview-text">
          试算计划工时：<strong>{{ previewHours === null ? '—' : `${previewHours} 工时（${laborBook.currentVersion}）` }}</strong>
        </p>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="registerOpen = false">取消</button>
          <button class="btn primary" type="button" @click="submitRegister">确认登记</button>
        </footer>
      </div>
    </div>

    <div v-if="laborOpen" class="modal-mask" @click.self="laborOpen = false">
      <div class="modal">
        <h3>工时标准改版</h3>
        <p class="tool-hint">改版发布后现行版本切到下一版；既有单子仍按登记时口径保留，只有新登记分段用新标准。</p>
        <div class="form-grid">
          <label v-for="(rate, grade) in laborDraft" :key="grade">
            <span>{{ grade }}（工时/吨）</span>
            <input v-model.number="laborDraft[grade]" type="number" min="0" step="0.5" />
          </label>
        </div>
        <footer class="modal-foot">
          <button class="btn" type="button" @click="laborOpen = false">取消</button>
          <button class="btn primary" type="button" @click="publishLabor">发布新版本</button>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import {
  backfillAreas,
  listBoard,
  loadErectionOrder,
  loadLaborBook,
  moveBlockStage,
  pendingScheduleCount,
  previewLaborHours,
  publishLaborStandard,
  registerBlock,
  saveErectionOrder,
} from '@/api/block-workshop'
import { BLOCK_STAGES, stageOfStatus } from '@/data/block-stages'
import { listRows } from '@/data/local-store'
import { useSessionStore } from '@/stores/session'
import type { BackfillResult, BlockStage, EntryRow, ErectionOrder, LaborStandardBook } from '@/data/types'

const store = useSessionStore()
const stages = BLOCK_STAGES

const columns = ref(listBoard())
const message = ref('')
const messageKind = ref<'ok' | 'warn'>('ok')
let messageTimer: number | undefined

function flash(text: string, kind: 'ok' | 'warn' = 'ok') {
  message.value = text
  messageKind.value = kind
  window.clearTimeout(messageTimer)
  messageTimer = window.setTimeout(() => {
    message.value = ''
  }, 6000)
}

function reload() {
  columns.value = listBoard()
  orderBook.value = loadErectionOrder()
  orderDraft.value = orderBook.value.order.map((item) => ({ ...item }))
  pendingCount.value = pendingScheduleCount()
}

// —— 拖卡推进：落库带乐观锁版本，输的一方整笔作废 ——

const draggingId = ref<number | null>(null)
const dragOverStage = ref<BlockStage | ''>('')

function onDragStart(event: DragEvent, card: EntryRow) {
  draggingId.value = Number(card.id)
  event.dataTransfer?.setData('text/plain', String(card.id))
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

function onDrop(stage: BlockStage) {
  dragOverStage.value = ''
  const id = draggingId.value
  draggingId.value = null
  if (id === null) return
  const card = findCard(id)
  if (!card) return
  if (stageOfStatus(String(card.status)) === stage) return
  const result = moveBlockStage(id, stage, Number(card.rowVersion ?? 1))
  if (result.ok) {
    flash(result.message, 'ok')
  } else {
    flash(result.message, 'warn')
  }
  reload()
}

function onQuickMove(card: EntryRow, stage: BlockStage) {
  if (stageOfStatus(String(card.status)) === stage) return
  const result = moveBlockStage(Number(card.id), stage, Number(card.rowVersion ?? 1))
  flash(result.message, result.ok ? 'ok' : 'warn')
  reload()
}

function findCard(id: number): EntryRow | undefined {
  for (const column of columns.value) {
    const hit = column.cards.find((card) => Number(card.id) === id)
    if (hit) return hit
  }
  return undefined
}

// —— 老分段区域回填 ——

const backfill = ref<BackfillResult | null>(null)

function runBackfill() {
  const result = backfillAreas()
  backfill.value = result
  flash(result.message, result.ok ? 'ok' : 'warn')
  reload()
}

// —— 分段登记（工时口径快照） ——

const registerOpen = ref(false)
const registerForm = reactive({
  分段编号: '',
  分段名称: '',
  所属区域: '',
  钢材牌号: '',
  设计重量: 0,
  外形尺寸: '',
})
const previewHours = ref<number | null>(null)
const laborBook = ref<LaborStandardBook>(loadLaborBook())

function openRegister() {
  laborBook.value = loadLaborBook()
  Object.assign(registerForm, {
    分段编号: '',
    分段名称: '',
    所属区域: '',
    钢材牌号: '',
    设计重量: 0,
    外形尺寸: '',
  })
  previewHours.value = null
  registerOpen.value = true
}

function updatePreview() {
  if (!registerForm.钢材牌号 || !registerForm.设计重量) {
    previewHours.value = null
    return
  }
  previewHours.value = previewLaborHours(registerForm.钢材牌号, Number(registerForm.设计重量)).hours
}

function submitRegister() {
  const result = registerBlock({ ...registerForm, 设计重量: Number(registerForm.设计重量) })
  flash(result.message, result.ok ? 'ok' : 'warn')
  if (result.ok) {
    registerOpen.value = false
    reload()
  }
}

// —— 工时标准改版 ——

const laborOpen = ref(false)
const laborDraft = reactive<Record<string, number>>({})

function openLabor() {
  laborBook.value = loadLaborBook()
  const current = laborBook.value.versions[laborBook.value.currentVersion].工时每吨
  for (const key of Object.keys(laborDraft)) {
    delete laborDraft[key]
  }
  Object.assign(laborDraft, current)
  laborOpen.value = true
}

function publishLabor() {
  const result = publishLaborStandard({ ...laborDraft }, operator.value || store.operator)
  flash(result.message, 'ok')
  laborOpen.value = false
  laborBook.value = loadLaborBook()
}

// —— 合拢顺序 ——

const operator = ref(store.operator)
const orderBook = ref(loadErectionOrder())
const orderDraft = ref<ErectionOrder[]>(orderBook.value.order.map((item) => ({ ...item })))
const pendingCount = ref(pendingScheduleCount())

const blockMap = computed(() => new Map(listRows('block').map((row) => [Number(row.id), row])))

function moveOrder(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= orderDraft.value.length) return
  const next = [...orderDraft.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  orderDraft.value = next
}

function saveOrder() {
  const result = saveErectionOrder(orderDraft.value, operator.value || store.operator)
  flash(result.message, result.ok ? 'ok' : 'warn')
  reload()
}

// —— 并发拖动演示：同一张卡两个标签页式客户端各拿旧版本，只放行先落库那条 ——

function simulateConcurrency() {
  const card = listRows('block').find((row) => stageOfStatus(String(row.status)) === '下料')
  if (!card) {
    flash('当前没有停留在「下料」阶段的分段，无法演示并发冲突', 'warn')
    return
  }
  const id = Number(card.id)
  const staleVersion = Number(card.rowVersion ?? 1)
  const first = moveBlockStage(id, '装配', staleVersion)
  const second = moveBlockStage(id, '焊接', staleVersion)
  flash(`并发演示｜客户端A（装配）：${first.message}；客户端B（焊接，旧版本）：${second.message}`, 'warn')
  reload()
}

// 其他标签页落库后本页看板自动对齐。
function onStorage(event: StorageEvent) {
  if (event.key === 'ship-block-construction:entries') {
    reload()
  }
}

onMounted(() => window.addEventListener('storage', onStorage))
onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
  window.clearTimeout(messageTimer)
})
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.tool-hint { color: var(--muted); font-size: 12px; }
.notice { border-radius: 6px; padding: 8px 12px; font-size: 13px; margin: 0 0 12px; }
.notice.ok { background: #ecfdf3; color: #027a48; border: 1px solid #abefc6; }
.notice.warn { background: #fef3f2; color: #b42318; border: 1px solid #fda29b; }
.board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.board-col { background: #eef2f7; border: 1px solid var(--border); border-radius: 8px; min-height: 320px; display: flex; flex-direction: column; }
.board-col.dragover { border-color: var(--brand); background: #e3edfd; }
.col-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.col-count { background: #fff; border-radius: 999px; padding: 1px 10px; font-size: 12px; color: var(--muted); }
.col-body { padding: 10px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.col-empty { color: var(--muted); font-size: 12px; text-align: center; margin: 8px 0; }
.flow-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px; cursor: grab; }
.flow-card.dragging { opacity: 0.5; }
.card-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.card-name { font-size: 12px; color: var(--muted); }
.card-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; margin: 0; }
.card-fields div { display: flex; flex-direction: column; font-size: 12px; }
.card-fields dt { color: var(--muted); }
.card-fields dd { margin: 0; }
.card-fields dd.missing { color: #b54708; }
.card-fields dd.snapshot { color: var(--brand); }
.card-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; color: var(--muted); }
.panel { margin-top: 16px; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
.panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.panel-head h3 { margin: 0 0 8px; font-size: 15px; }
.order-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.order-item { display: flex; gap: 14px; align-items: center; border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; font-size: 13px; }
.order-index { width: 24px; color: var(--muted); }
.order-code { font-weight: 600; width: 110px; }
.order-grade { width: 80px; }
.order-weight { width: 70px; color: var(--muted); }
.order-actions { margin-left: auto; display: flex; gap: 10px; }
.order-actions .link:disabled { color: #9aa6b2; cursor: not-allowed; }
.panel-foot { display: flex; justify-content: flex-end; align-items: flex-end; gap: 12px; margin-top: 12px; }
.result-list { margin: 0; padding: 0; list-style: none; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.result-list .ok { color: #027a48; }
.result-list .warn { color: #b54708; }
.modal-mask { position: fixed; inset: 0; background: rgba(16, 24, 40, 0.45); display: flex; align-items: center; justify-content: center; z-index: 20; }
.modal { background: #fff; border-radius: 10px; padding: 20px; width: 560px; max-width: 92vw; max-height: 86vh; overflow: auto; }
.modal h3 { margin: 0 0 6px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin-top: 12px; }
.form-grid label span, .panel-foot label span { display: block; font-size: 12px; color: var(--muted); }
.form-grid input, .form-grid select, .panel-foot input { width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
.preview-text { font-size: 13px; margin: 12px 0 0; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
