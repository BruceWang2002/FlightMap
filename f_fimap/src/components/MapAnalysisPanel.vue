<template>
  <aside ref="panel" class="analysis-panel" :class="{ collapsed }" :style="panelStyle" aria-label="空间分析工具">
    <header @pointerdown="startDrag">
      <div><p>SPATIAL ANALYSIS</p><h2>空间分析</h2></div>
      <div class="panel-actions"><button type="button" @pointerdown.stop @click.stop="collapsed = !collapsed">{{ collapsed ? '展开' : '收起' }}</button><button type="button" @pointerdown.stop @click.stop="$emit('close')">关闭</button></div>
    </header>
    <div v-show="!collapsed" class="analysis-content">
    <template v-if="flight">
      <label>分析方式
        <select :value="mode" @change="$emit('update:mode', $event.target.value)">
          <option value="nearest">最近邻分析</option>
          <option value="radius">半径范围查询</option>
        </select>
      </label>
      <label class="show-results"><input :checked="showResults" type="checkbox" @change="$emit('update:showResults', $event.target.checked)">在地图上显示分析结果</label>
      <label class="show-results"><input :checked="includeSmallAirports" type="checkbox" @change="$emit('update:includeSmallAirports', $event.target.checked)">分析中包含小型机场</label>

      <template v-if="mode === 'nearest'">
        <p class="hint">以 {{ callsign }} 为中心，计算当前已加载的真实机场与航班位置；不会增加 API 请求。</p>
        <h3>最近机场（大型 / 中型 / 小型各 1 个）</h3>
        <ol><li v-for="item in nearestAirports" :key="item.feature.properties.ident"><span>{{ item.feature.properties.ident }} · {{ item.feature.properties.name }}</span><b>{{ formatDistance(item.distanceKm) }}</b></li></ol>
        <h3>最近的其他飞机</h3>
        <ol><li v-for="item in nearestAircraft" :key="item.feature.properties.icao24"><span>{{ item.feature.properties.callsign || item.feature.properties.icao24 }}</span><b>{{ formatDistance(item.distanceKm) }}</b></li></ol>
      </template>

      <template v-else>
        <label>搜索半径：{{ radiusKm }} km
          <input :value="radiusKm" type="range" min="10" max="300" step="10" @input="$emit('update:radiusKm', Number($event.target.value))">
        </label>
        <p class="hint">圆形范围查询适合检查备降机场、临近空域目标等情况。</p>
        <div class="counts"><span><b>{{ airportsInRange.length }}</b> 个机场</span><span><b>{{ aircraftInRange.length }}</b> 架飞机</span></div>
        <h3>范围内最近机场</h3>
        <ol><li v-for="item in airportsInRange.slice(0, 5)" :key="item.feature.properties.ident"><span>{{ item.feature.properties.ident }} · {{ item.feature.properties.name }}</span><b>{{ formatDistance(item.distanceKm) }}</b></li></ol>
        <p v-if="!airportsInRange.length" class="hint">当前半径内没有已加载的机场。</p>
      </template>
    </template>
    <p v-else class="hint empty">先从地图或航班列表选择一架飞机，再开始分析。</p>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { featuresWithinRadius, nearestFeatures } from '../utils/spatialAnalysis'

defineEmits(['close', 'update:mode', 'update:radiusKm', 'update:showResults', 'update:includeSmallAirports'])
const props = defineProps({ flight: Object, flights: { type: Array, default: () => [] }, airports: { type: Array, default: () => [] }, mode: { type: String, default: 'nearest' }, radiusKm: { type: Number, default: 50 }, showResults: { type: Boolean, default: true }, includeSmallAirports: Boolean })
const panel = ref(null)
const position = ref(null)
const collapsed = ref(false)
const panelStyle = computed(() => position.value ? { left: `${position.value.left}px`, top: `${position.value.top}px` } : {})
const callsign = computed(() => props.flight?.properties.callsign || props.flight?.properties.icao24)
const otherFlights = computed(() => props.flights.filter((item) => item.properties.icao24 !== props.flight?.properties.icao24))
const airportCandidates = computed(() => props.airports.filter((airport) => ['large_airport', 'medium_airport', ...(props.includeSmallAirports ? ['small_airport'] : [])].includes(airport.properties.type)))
const nearestAirports = computed(() => ['large_airport', 'medium_airport', ...(props.includeSmallAirports ? ['small_airport'] : [])].flatMap((type) => nearestFeatures(props.flight, airportCandidates.value.filter((airport) => airport.properties.type === type), 1)))
const nearestAircraft = computed(() => nearestFeatures(props.flight, otherFlights.value, 1))
const airportsInRange = computed(() => featuresWithinRadius(props.flight, airportCandidates.value, props.radiusKm))
const aircraftInRange = computed(() => featuresWithinRadius(props.flight, otherFlights.value, props.radiusKm))
function formatDistance(distanceKm) { return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km` }
function startDrag(event) {
  if (event.button !== 0 || !panel.value) return
  const rect = panel.value.getBoundingClientRect(); const parentRect = panel.value.parentElement.getBoundingClientRect()
  position.value = { left: rect.left - parentRect.left, top: rect.top - parentRect.top }
  const origin = { x: event.clientX, y: event.clientY, left: position.value.left, top: position.value.top }
  const move = (moveEvent) => { position.value = { left: Math.max(0, origin.left + moveEvent.clientX - origin.x), top: Math.max(0, origin.top + moveEvent.clientY - origin.y) } }
  const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
}
</script>

<style scoped>
.analysis-panel { position: absolute; z-index: 900; top: 16px; left: 16px; width: min(340px, calc(100% - 32px)); max-height: calc(100% - 32px); box-sizing: border-box; display:flex; flex-direction:column; padding: 14px; border: 1px solid #2a617d; border-radius: 10px; overflow:hidden; background: #082034ed; color: #e9f7ff; box-shadow: 0 10px 28px #00152266; font-size: 12px; backdrop-filter: blur(8px); }.analysis-panel.collapsed { padding-bottom: 10px; }
header { display: flex; flex:0 0 auto; justify-content: space-between; align-items: start; margin-bottom: 12px; cursor: grab; user-select: none; } header:active { cursor: grabbing; } header p { margin: 0; color: #65d8ff; font-size: 10px; letter-spacing: .12em; } h2 { margin: 3px 0 0; font-size: 17px; } h3 { margin: 13px 0 5px; color: #dff6ff; font-size: 12px; } .analysis-content { min-height:0; overflow-y:auto; overscroll-behavior:contain; padding-right:4px; -webkit-overflow-scrolling:touch; } select { width: 100%; margin-top: 5px; padding: 7px; border: 1px solid #387594; border-radius: 6px; background: #123d56; color: #effaff; } label { display: block; color: #c7dfec; } input { width: 100%; margin-top: 8px; accent-color: #53d0fc; } .show-results { margin-top: 10px; }.show-results input { width: auto; margin: 0 7px 0 0; }.panel-actions { display:flex; gap:7px; }.panel-actions button { border:1px solid #41718a; border-radius:5px; padding:6px 8px; background:#123c56; color:#dff6ff; font-size:12px; line-height:16px; cursor:pointer; }.hint { margin: 10px 0; color: #a7c6d7; line-height: 1.45; } .empty { margin-bottom: 0; } ol { margin: 0; padding: 0; list-style: none; } li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid #285069; } li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } li b { color: #70d9ff; white-space: nowrap; } .counts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }.counts span { padding: 8px; border-radius: 6px; background: #103a52; color: #b9d5e3; }.counts b { display: block; color: #fff; font-size: 19px; }
</style>

<style scoped>
.analysis-panel { z-index: 2000; }
.analysis-panel:not(.collapsed) { height: min(480px, calc(100% - 32px)); }
.analysis-content { flex: 1 1 0; min-height: 0; }
@media (max-width: 760px) {
  .analysis-panel { top: auto !important; right: auto !important; bottom: 8px !important; left: 8px !important; width: calc(100% - 16px) !important; height: 30dvh !important; max-height: 30dvh !important; padding: 10px !important; overflow: hidden !important; }
  .analysis-panel.collapsed { height: auto !important; min-height: 0; }
  .analysis-content { flex: 1 1 0 !important; min-height: 0 !important; overflow-y: scroll !important; padding-right: 7px; scrollbar-width: thin; scrollbar-color: #58c8ee #11364d; }
  .analysis-content::-webkit-scrollbar { width: 7px; }
  .analysis-content::-webkit-scrollbar-track { background: #11364d; border-radius: 8px; }
  .analysis-content::-webkit-scrollbar-thumb { background: #58c8ee; border-radius: 8px; }
  header { margin-bottom: 7px; }
}
</style>
