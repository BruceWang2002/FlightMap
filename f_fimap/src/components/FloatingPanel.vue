<template>
  <aside ref="panel" class="floating-panel" :class="{ compact, collapsed }" :style="panelStyle"
    :aria-label="title" @pointerdown="activate" @focusin="activate" @keydown.esc.stop="emit('close')">
    <header class="panel-header" @pointerdown="startInteraction($event, 'drag')">
      <div class="panel-heading"><p>{{ eyebrow }}</p><h2>{{ title }}</h2></div>
      <div class="panel-actions" @pointerdown.stop="activate">
        <button type="button" :aria-expanded="!collapsed" @click="toggleCollapsed">{{ collapsed ? '展开' : '收起' }}</button>
        <button type="button" :aria-label="`关闭${title}`" @click="emit('close')">关闭</button>
      </div>
    </header>
    <div v-show="!collapsed" ref="body" class="panel-body"><slot /></div>
    <button v-if="resizable && !compact && !collapsed" class="resize-grip" type="button"
      aria-label="调整弹窗大小" title="拖动调整大小；方向键微调"
      @pointerdown.stop="startInteraction($event, 'resize')" @keydown="resizeWithKeyboard">◢</button>
  </aside>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { panelGeometry } from '../utils/panelGeometry'
import { panelStackFor } from '../composables/panelStack'

const props = defineProps({
  title: { type: String, required: true },
  eyebrow: String,
  width: { type: Number, default: 360 },
  height: { type: Number, default: 480 },
  mobileRatio: { type: Number, default: .4 },
  align: { type: String, default: 'left' },
  resizable: { type: Boolean, default: true },
})
const emit = defineEmits(['close', 'expanded'])
const panel = ref(null)
const body = ref(null)
const collapsed = ref(false)
const compact = ref(false)
const bounds = ref({ width: 0, height: 0 })
const position = ref(null)
const size = ref(null)
const stack = shallowRef(null)
const panelId = Symbol('panel')
let observer
let media
let stopInteraction = () => {}

const geometry = computed(() => panelGeometry({
  bounds: bounds.value, compact: compact.value, position: position.value,
  width: size.value?.width ?? props.width,
  height: compact.value ? Math.max(160, bounds.value.height * props.mobileRatio) : size.value?.height ?? props.height,
  collapsed: collapsed.value, align: props.align,
}))
const panelStyle = computed(() => ({
  ...Object.fromEntries(Object.entries(geometry.value).map(([key, value]) => [key, `${value}px`])),
  zIndex: stack.value?.active === panelId ? 2001 : 2000,
}))

function activate() {
  if (stack.value) stack.value.active = panelId
}
function stopAndMeasure() {
  stopInteraction()
  compact.value = media.matches
  const parent = panel.value.parentElement
  bounds.value = { width: parent.clientWidth, height: parent.clientHeight }
}
async function toggleCollapsed() {
  collapsed.value = !collapsed.value
  await nextTick()
  if (!collapsed.value) emit('expanded')
}
function resize(width, height) {
  const gap = 16
  size.value = {
    width: Math.max(280, Math.min(width, bounds.value.width - geometry.value.left - gap)),
    height: Math.max(160, Math.min(height, bounds.value.height - geometry.value.top - gap)),
  }
}
function resizeWithKeyboard(event) {
  const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key]
  if (!delta) return
  event.preventDefault()
  resize(geometry.value.width + delta[0], geometry.value.height + delta[1])
}
function startInteraction(event, mode) {
  if (compact.value || event.button !== 0) return
  event.preventDefault()
  activate()
  stopInteraction()
  const start = { x: event.clientX, y: event.clientY, ...geometry.value }
  const move = (next) => {
    if (next.pointerId !== event.pointerId) return
    const dx = next.clientX - start.x
    const dy = next.clientY - start.y
    if (mode === 'resize') resize(start.width + dx, start.height + dy)
    else {
      const constrained = panelGeometry({ bounds: bounds.value, compact: false,
        width: start.width, height: start.height, collapsed: collapsed.value,
        position: { left: start.left + dx, top: start.top + dy } })
      position.value = { left: constrained.left, top: constrained.top }
    }
  }
  const end = (next) => { if (next.pointerId === event.pointerId) stopInteraction() }
  stopInteraction = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('blur', stopInteraction)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('blur', stopInteraction)
}

/** Scroll this panel only, never the page or map container. */
function reveal(element) {
  if (!element || collapsed.value || !body.value) return
  const row = element.getBoundingClientRect()
  const viewport = body.value.getBoundingClientRect()
  const stickyHeaderHeight = body.value.querySelector('thead')?.getBoundingClientRect().height ?? 0
  if (row.top < viewport.top + stickyHeaderHeight) body.value.scrollTop += row.top - viewport.top - stickyHeaderHeight
  else if (row.bottom > viewport.bottom) body.value.scrollTop += row.bottom - viewport.bottom
}
defineExpose({ reveal })
onMounted(() => {
  stack.value = panelStackFor(panel.value.parentElement)
  media = window.matchMedia('(max-width: 760px)')
  stopAndMeasure()
  media.addEventListener('change', stopAndMeasure)
  observer = new ResizeObserver(stopAndMeasure)
  observer.observe(panel.value.parentElement)
  activate()
})
onUnmounted(() => {
  stopInteraction()
  observer?.disconnect()
  media?.removeEventListener('change', stopAndMeasure)
})
</script>

<style scoped>
.floating-panel {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #2a617d;
  border-radius: 10px;
  background: var(--surface-panel);
  color: #e9f7ff;
  box-shadow: 0 10px 28px #00152277;
  backdrop-filter: blur(8px);
  font-size: 12px;
}
.panel-header {
  display: flex;
  flex: 0 0 70px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #28516b;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.panel-heading { min-width: 0; }
.panel-heading p { margin: 0; color: #65d8ff; font-size: 10px; letter-spacing: .12em; }
.panel-heading h2 { margin: 3px 0 0; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.panel-actions { display: flex; flex-shrink: 0; gap: 6px; }
.panel-actions button {
  min-height: 36px;
  padding: 6px 9px;
  border: 1px solid #41718a;
  border-radius: 5px;
  background: #123c56;
  color: #dff6ff;
  cursor: pointer;
}
.panel-body {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #58c8ee #11364d;
}
.panel-body::-webkit-scrollbar { width: 7px; height: 7px; }
.panel-body::-webkit-scrollbar-track { background: #11364d; }
.panel-body::-webkit-scrollbar-thumb { background: #58c8ee; border-radius: 8px; }
.resize-grip { position: absolute; bottom: 0; right: 0; width: 18px; height: 18px; padding: 0; border: 0; background: #123c56; color: #65d8ff; cursor: nwse-resize; touch-action: none; }
.compact .panel-header { cursor: default; }
.collapsed .panel-header { border-bottom: 0; }
button:focus-visible { outline: 2px solid #65d8ff; outline-offset: -2px; }
</style>
