<template>
  <section class="page workshop">
    <header class="page-head">
      <div>
        <h2>船体车间 · 建造流水</h2>
        <p class="page-desc">
          按 下料 → 装配 → 焊接 → 完工 四个阶段盯住每条分段，拖动卡片推进进度；
          调度合拢顺序后，建造计划节点台账自动追加一条「待排」。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/schedule">打开建造计划台账</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <div class="rule-bar">
      <div class="rule-group">
        <span class="rule-label">工时口径</span>
        <span class="rule-text">
          现行 <strong>{{ standard.version }}</strong>（{{ standard.hoursPerTon }} 小时/吨，
          {{ standard.updatedAt }} 起），既有工单按单子上的原口径保留
        </span>
        <select v-model="standardChoice" class="inline-select">
          <option v-for="item in standardVersionOptions" :key="item.version" :value="item.version">
            {{ item.version }} · {{ item.hoursPerTon }}h/t
          </option>
        </select>
        <button class="btn" type="button" @click="applyStandard">调整标准</button>
      </div>
      <div class="rule-group">
        <span class="rule-label">老分段</span>
        <span class="rule-text">缺所属区域 {{ missingAreaCount }} 条，回填按登记先后补</span>
        <button class="btn" type="button" @click="backfill">回填所属区域</button>
      </div>
      <div class="rule-group">
        <span class="rule-label">并发演练</span>
        <span class="rule-text">模拟两个调度员同时拖同一张卡，只让先落库的生效</span>
        <button class="btn" type="button" @click="simulateConcurrent">并发拖动演练</button>
      </div>
      <button class="btn ghost" type="button" @click="openRegister">登记新分段</button>
    </div>

    <p v-if="toast.kind" class="toast" :class="toast.kind">{{ toast.text }}</p>

    <div class="board">
      <div
        v-for="stage in stages"
        :key="stage.key"
        class="lane"
        :class="{ over: dragOverStage === stage.key }"
        @dragover.prevent="dragOverStage = stage.key"
        @dragleave="dragOverStage = ''"
        @drop.prevent="onDrop(stage.key)"
      >
        <header class="lane-head">
          <strong>{{ stage.key }}</strong>
          <span class="lane-count">{{ stage.cards.length }}</span>
        </header>
        <p v-if="stage.key === '下料'" class="lane-hint">待开工卡片排在队首，开拖即进入下料</p>
        <div class="lane-body">
          <article
            v-for="card in stage.cards"
            :key="String(card.id)"
            class="block-card"
            :class="{ dragging: draggingId === card.id, 'pre-start': isPreStart(card) }"
            draggable="true"
            @dragstart="onDragStart(card, stage.key)"
            @dragend="onDragEnd"
          >
            <div class="card-top">
              <strong>{{ card.分段编号 }}</strong>
              <span v-if="isPreStart(card)" class="tag tag-wait">待开工</span>
              <span v-else class="tag tag-stage">{{ card.status }}</span>
            </div>
            <h4 class="card-name">{{ card.分段名称 }}</h4>
            <dl class="card-meta">
              <div><dt>钢材牌号</dt><dd>{{ card.钢材牌号 }}</dd></div>
              <div><dt>设计重量</dt><dd class="weight">{{ card.设计重量 }}</dd></div>
              <div><dt>外形尺寸</dt><dd>{{ card.外形尺寸 }}</dd></div>
              <div>
                <dt>所属区域</dt>
                <dd :class="{ 'area-empty': !card.所属区域 }">{{ card.所属区域 || '历史未登记' }}</dd>
              </div>
              <div>
                <dt>计划工时</dt>
                <dd>{{ card.计划工时 }}
                  <span class="tag tag-cal">{{ card.工时口径版本 }}</span>
                </dd>
              </div>
            </dl>
          </article>
          <p v-if="!stage.cards.length" class="lane-empty">暂无分段</p>
        </div>
      </div>
    </div>

    <section class="order-panel">
      <header class="order-head">
        <div>
          <h3>合拢顺序调度</h3>
          <p class="page-desc">
            拖动调整搭载先后，保存后建造计划节点台账追加一条「待排」；吊装重量与设计重量冲突时以设计重量为准。
          </p>
        </div>
        <div class="page-actions">
          <button class="btn primary" type="button" @click="saveOrder">保存合拢顺序</button>
          <button class="btn" type="button" @click="moveOrder(-1)">上移</button>
          <button class="btn" type="button" @click="moveOrder(1)">下移</button>
        </div>
      </header>
      <table class="data-table order-table">
        <thead>
          <tr>
            <th>顺序</th>
            <th>选择</th>
            <th>搭载编号</th>
            <th>搭载分段</th>
            <th>搭载位置</th>
            <th>吊车</th>
            <th>吊装重量（填报）</th>
            <th>设计重量（准）</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in order" :key="item.code" :class="{ selected: selectedCode === item.code }">
            <td>{{ index + 1 }}</td>
            <td>
              <input
                type="radio"
                name="order-select"
                :checked="selectedCode === item.code"
                @change="selectedCode = item.code"
              />
            </td>
            <td>{{ item.code }}</td>
            <td>{{ item.blockNo }}</td>
            <td>{{ item.location }}</td>
            <td>{{ item.crane }}</td>
            <td :class="{ 'weight-conflict': item.conflict }">
              {{ item.liftWeight }}
              <span v-if="item.conflict" class="tag tag-conflict">冲突</span>
            </td>
            <td class="weight">{{ item.designWeight }}</td>
          </tr>
          <tr v-if="!order.length">
            <td colspan="8" class="empty-state">暂无合拢搭载单</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="registerOpen" class="modal-mask" @click.self="registerOpen = false">
      <form class="modal" @submit.prevent="submitRegister">
        <h3>登记船体分段</h3>
        <label class="modal-item">
          <span>分段名称</span>
          <input v-model="registerForm.name" required placeholder="如：货舱底部分段 211" />
        </label>
        <label class="modal-item">
          <span>所属区域</span>
          <input v-model="registerForm.area" required placeholder="如：货舱区" />
        </label>
        <label class="modal-item">
          <span>钢材牌号</span>
          <input v-model="registerForm.steel" required placeholder="如：AH36" />
        </label>
        <label class="modal-item">
          <span>设计重量（吨）</span>
          <input v-model.number="registerForm.weightTon" type="number" step="0.1" min="0" required />
        </label>
        <label class="modal-item">
          <span>外形尺寸</span>
          <input v-model="registerForm.dimension" required placeholder="如：15000×8200×1800" />
        </label>
        <p class="modal-hint">
          计划工时将按现行 {{ standardChoice || standard.version }} 口径自动折算并锁定，今后改标准不影响本单。
        </p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="registerOpen = false">取消</button>
          <button class="btn primary" type="submit">确认登记</button>
        </div>
      </form>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import {
  backfillAreas,
  blockRevision,
  currentStandard,
  erectionOrder,
  FLOW_STAGES,
  isPreStart,
  listBlocks,
  moveBlock,
  pendingScheduleCount,
  registerBlock,
  saveErectionOrder,
  setCurrentStandard,
  stageOf,
  standardOptions,
  type FlowStage,
  type OrderItem,
} from '@/api/workshop'
import { invalidateCache } from '@/data/local-store'
import type { EntryRow } from '@/data/types'

const blocks = ref<EntryRow[]>([])
const revision = ref(0)
const order = ref<OrderItem[]>([])
const selectedCode = ref('')
const standard = ref(currentStandard())
const standardChoice = ref(currentStandard().version)
const standardVersionOptions = standardOptions()
const registerOpen = ref(false)
const registerForm = ref({ name: '', area: '', steel: 'AH36', weightTon: 100, dimension: '' })

const toast = ref<{ kind: '' | 'ok' | 'error'; text: string }>({ kind: '', text: '' })
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(kind: 'ok' | 'error', text: string) {
  toast.value = { kind, text }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = { kind: '', text: '' }
  }, 4200)
}

const stages = computed(() =>
  FLOW_STAGES.map((key) => {
    const cards = blocks.value
      .filter((row) => stageOf(row) === key)
      .sort((a, b) => {
        // 待开工的预备态排在下料列队首，其余按登记先后。
        if (key === '下料') {
          return Number(isPreStart(b)) - Number(isPreStart(a)) || Number(a.id) - Number(b.id)
        }
        return Number(a.id) - Number(b.id)
      })
    return { key, cards }
  }),
)

const stats = computed(() => [
  { label: '分段总数', value: blocks.value.length },
  { label: '建造中（下料/装配/焊接）', value: blocks.value.filter((row) => row.status !== '完工').length },
  { label: '已完工', value: blocks.value.filter((row) => row.status === '完工').length },
  { label: '计划台账待排', value: pendingScheduleCount() },
])

const missingAreaCount = computed(
  () => blocks.value.filter((row) => String(row.所属区域 ?? '').trim() === '').length,
)

function refresh() {
  invalidateCache()
  blocks.value = listBlocks()
  revision.value = blockRevision()
  order.value = erectionOrder()
  if (!selectedCode.value || !order.value.some((item) => item.code === selectedCode.value)) {
    selectedCode.value = order.value[0]?.code ?? ''
  }
  standard.value = currentStandard()
}

/* ---------- 拖拽推进流水：乐观锁，只有先落库的那条生效 ---------- */
const draggingId = ref<number | null>(null)
const draggingFrom = ref<FlowStage | ''>('')
const dragOverStage = ref<FlowStage | ''>('')

function onDragStart(card: EntryRow, from: FlowStage) {
  draggingId.value = Number(card.id)
  draggingFrom.value = from
}

function onDragEnd() {
  draggingId.value = null
  draggingFrom.value = ''
  dragOverStage.value = ''
}

function onDrop(stage: FlowStage) {
  const id = draggingId.value
  const from = draggingFrom.value
  onDragEnd()
  if (id === null) {
    return
  }
  const card = blocks.value.find((row) => Number(row.id) === id)
  if (!card) {
    return
  }
  if (stageOf(card) === stage && !isPreStart(card)) {
    return
  }
  const expectedRev = Number(card.rev ?? 0)
  const expectedRevision = revision.value
  const result = moveBlock(id, stage, expectedRevision, expectedRev)
  if (!result.ok) {
    // 落库失败：以库里真相覆盖界面（后拖的那条不动），并提示是谁先落了库。
    blocks.value = result.rows ?? listBlocks()
    revision.value = blockRevision()
    showToast('error', result.message)
    return
  }
  blocks.value = result.rows ?? listBlocks()
  revision.value = blockRevision()
  showToast('ok', result.message || `${card.分段编号} 已进入「${stage}」`)
}

/* ---------- 合拢顺序 ---------- */
function moveOrder(delta: number) {
  const index = order.value.findIndex((item) => item.code === selectedCode.value)
  const target = index + delta
  if (index < 0 || target < 0 || target >= order.value.length) {
    showToast('error', delta < 0 ? '已经是第一条' : '已经是最后一条')
    return
  }
  const next = [...order.value]
  const [picked] = next.splice(index, 1)
  next.splice(target, 0, picked)
  order.value = next
}

function saveOrder() {
  const result = saveErectionOrder(order.value.map((item) => item.code))
  if (!result.ok) {
    refresh()
    showToast('error', result.message)
    return
  }
  refresh()
  showToast('ok', result.message)
}

/* ---------- 规则操作 ---------- */
function applyStandard() {
  const result = setCurrentStandard(standardChoice.value)
  showToast(result.ok ? 'ok' : 'error', result.message)
}

function backfill() {
  const result = backfillAreas()
  refresh()
  showToast(result.ok ? 'ok' : 'error', result.message)
}

function openRegister() {
  registerForm.value = { name: '', area: '', steel: 'AH36', weightTon: 100, dimension: '' }
  registerOpen.value = true
}

function submitRegister() {
  const result = registerBlock({ ...registerForm.value })
  registerOpen.value = false
  refresh()
  showToast(result.ok ? 'ok' : 'error', result.message)
}

/**
 * 并发演练：取一张非完工卡，伪造「另一个调度员」基于旧修订号的拖动。
 * 先用底层 commit 语义让 A 落库，再让拿着旧快照的 B 提交 —— B 必然被拒。
 */
function simulateConcurrent() {
  const target = blocks.value.find((row) => row.status !== '完工')
  if (!target) {
    showToast('error', '没有可演练的在制分段')
    return
  }
  const staleRevision = revision.value
  const staleRev = Number(target.rev ?? 0)
  // A：先落库（进入焊接；若已在焊接则进入完工）。
  const nextStage: FlowStage = target.status === '焊接' ? '完工' : '焊接'
  const first = moveBlock(Number(target.id), nextStage, staleRevision, staleRev)
  if (!first.ok) {
    refresh()
    showToast('error', `A 落库意外失败：${first.message}`)
    return
  }
  // B：仍拿着 A 落库前的旧修订号/旧 rev 提交同一张卡，应被乐观锁拒绝。
  const second = moveBlock(Number(target.id), '装配', staleRevision, staleRev)
  refresh()
  if (!second.ok) {
    showToast(
      'ok',
      `演练结果：A（→${nextStage}）已先落库生效；B 的并发拖动被拒绝——${second.message}`,
    )
  } else {
    showToast('error', '演练异常：并发的第二条本应被拒绝却落库了')
  }
}

function onStorage(event: StorageEvent) {
  if (!event.key) {
    return
  }
  // 别的标签页写过库：重读真相，正在拖的卡片也以库里的状态为准。
  refresh()
}

onMounted(() => {
  refresh()
  window.addEventListener('storage', onStorage)
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  clearTimeout(toastTimer)
})
</script>

<style scoped>
.workshop { display: flex; flex-direction: column; gap: 12px; }
.rule-bar {
  display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center;
  background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px;
}
.rule-group { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.rule-label {
  background: #eef2f7; border-radius: 4px; padding: 2px 8px; color: var(--muted);
}
.rule-text { color: var(--muted); }
.inline-select { padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; }
.toast { margin: 0; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
.toast.ok { background: #ecfdf3; border: 1px solid #73e2a3; color: #067647; }
.toast.error { background: #fef3f2; border: 1px solid #fda29b; color: #b42318; }

.board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.lane {
  background: #eef2f7; border: 2px solid transparent; border-radius: 10px;
  padding: 10px; min-height: 320px; display: flex; flex-direction: column; gap: 8px;
}
.lane.over { border-color: var(--brand); background: #e8f0fe; }
.lane-head { display: flex; justify-content: space-between; align-items: center; }
.lane-count {
  background: #fff; border-radius: 999px; min-width: 22px; text-align: center;
  padding: 1px 7px; font-size: 12px; color: var(--muted);
}
.lane-hint, .lane-empty { margin: 0; font-size: 11.5px; color: var(--muted); }
.lane-body { display: flex; flex-direction: column; gap: 8px; }
.block-card {
  background: #fff; border: 1px solid var(--border); border-radius: 8px;
  padding: 10px; cursor: grab; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
}
.block-card:active { cursor: grabbing; }
.block-card.dragging { opacity: 0.45; }
.block-card.pre-start { border-style: dashed; }
.card-top { display: flex; justify-content: space-between; align-items: center; }
.card-name { margin: 6px 0 8px; font-size: 13.5px; }
.card-meta { margin: 0; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.card-meta div { display: flex; gap: 6px; }
.card-meta dt { color: var(--muted); width: 58px; flex: none; }
.card-meta dd { margin: 0; }
.weight { font-weight: 600; }
.area-empty { color: #b54708; }
.tag { border-radius: 4px; padding: 1px 6px; font-size: 11px; }
.tag-wait { background: #fffaeb; color: #b54708; }
.tag-stage { background: #eef4ff; color: #1f6feb; }
.tag-cal { background: #f2f4f7; color: var(--muted); margin-left: 4px; }
.tag-conflict { background: #fef3f2; color: #b42318; margin-left: 4px; }

.order-panel {
  background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 12px;
}
.order-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.order-table tr.selected { background: #e8f0fe; }
.weight-conflict { color: #b42318; }

.modal-mask {
  position: fixed; inset: 0; background: rgba(16, 24, 40, 0.45);
  display: flex; align-items: center; justify-content: center; z-index: 20;
}
.modal {
  background: #fff; border-radius: 10px; padding: 18px 20px; width: 420px;
  display: flex; flex-direction: column; gap: 10px;
}
.modal h3 { margin: 0; }
.modal-item { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); }
.modal-item input { padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; }
.modal-hint { margin: 0; font-size: 12px; color: var(--muted); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
