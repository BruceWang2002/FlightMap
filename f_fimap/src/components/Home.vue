<template>
  <ResizableLayout>
    <template #sidebar>
      <div class="sidebar-content">
        <header><p class="eyebrow">FLIGHT MAP · 0.2</p><h1>飞行情报地图</h1><p class="subtle">二维与三维共享同一份航班状态，适合继续接入真实数据源。</p></header>

        <details class="collapse-section" open><summary>地图控制</summary><section class="control-group">
          <label>地图视图<select v-model="mapMode"><option value="2d">二维 Leaflet</option><option value="3d">三维 Cesium</option></select></label>
          <template v-if="mapMode === '3d'"><label class="check"><input v-model="showTerrain" type="checkbox">显示世界高程地形</label><label class="check"><input v-model="showLighting" type="checkbox">启用地形光照</label><label class="check"><input v-model="showBuildings" type="checkbox">显示 OSM 全球建筑物</label></template>
          <label>地图底图<select v-model="baseLayerId"><option v-for="layer in BASE_LAYERS" :key="layer.id" :value="layer.id">{{ layer.label }}</option></select></label>
          <label>天气叠加<select v-model="weatherLayerId" :disabled="!weatherAvailable"><option v-for="layer in WEATHER_LAYERS" :key="layer.id" :value="layer.id">{{ layer.label }}</option></select></label>
          <p v-if="!weatherAvailable" class="hint">天气图层需要在 <code>f_fimap/.env</code> 设置自己的 OpenWeatherMap key。</p>
          <label class="check"><input v-model="showAirports" type="checkbox">显示机场</label>
          <div v-if="showAirports" class="airport-filter"><span>机场类别</span><label v-for="type in AIRPORT_TYPES" :key="type.id" class="check"><input v-model="airportTypes" type="checkbox" :value="type.id">{{ type.label }}</label></div>
          <label class="check"><input v-model="showLabels" type="checkbox">显示飞机呼号</label>
          <button class="secondary" @click="flightListOpen = true">打开详细航班列表</button>
          <button :disabled="loading" @click="refresh">{{ loading ? '正在刷新…' : '刷新航班数据' }}</button>
        </section></details>

        <p v-if="error" class="error">{{ error }}</p>
        <section class="metrics"><span><b>{{ flights.length }}</b> 架航班</span><span><b>{{ airports.length }}</b> 个机场</span><span><b>{{ selectedTrack.length }}</b> 个轨迹点</span></section>

        <details class="collapse-section" open><summary>航班详情</summary><section class="details"><h2>{{ selectedFlight ? selectedFlight.properties.callsign || selectedFlight.properties.icao24 : '选择一架飞机' }}</h2><template v-if="selectedFlight"><dl><dt>ICAO24</dt><dd>{{ selectedFlight.properties.icao24 }}</dd><dt>起源国家</dt><dd>{{ selectedFlight.properties.origin_country || '—' }}</dd><dt>经纬坐标</dt><dd>{{ coordinates }}</dd><dt>高度</dt><dd>{{ number(selectedFlight.properties.altitude_m) }} m</dd><dt>速度</dt><dd>{{ number(selectedFlight.properties.velocity_ms) }} m/s</dd><dt>航向</dt><dd>{{ number(selectedFlight.properties.track_deg) }}°</dd><dt>采集时间</dt><dd>{{ dateTime(selectedFlight.properties.observed_at) }}</dd></dl><button class="secondary" @click="clearSelection">取消选择</button></template></section></details>

        <details class="collapse-section" open><summary>分析工具</summary><section class="control-group"><label class="check"><input v-model="analysisEnabled" type="checkbox">在地图中打开空间分析工具</label><button class="secondary" @click="analysisEnabled = true">打开空间分析面板</button><p class="hint">选择飞机后，可在地图内进行最近邻和半径范围查询。</p></section></details>
        <details class="collapse-section"><summary>机场等级图例</summary><AirportLegend /></details>
        <details class="collapse-section"><summary>飞机高度图例</summary><FlightLegend /></details>
      </div>
    </template>

    <main class="map-workspace">
      <LeafletMap v-if="mapMode === '2d'" :flights="flights" :airports="airports" :airport-types="airportTypes" :show-airports="showAirports" :show-labels="showLabels" :base-layer-id="baseLayerId" :weather-layer-id="weatherLayerId" :selected-icao24="selectedFlight?.properties.icao24" :track="selectedTrack" :analysis-enabled="analysisEnabled" :analysis-mode="analysisMode" :analysis-radius-km="analysisRadiusKm" :show-analysis-results="showAnalysisResults" :include-small-airports="includeSmallAirports" @select="selectFlight" @clear="clearSelection" />
      <CesiumMap v-else :flights="flights" :airports="airports" :show-labels="showLabels" :base-layer-id="baseLayerId" :selected-icao24="selectedFlight?.properties.icao24" :analysis-enabled="analysisEnabled" :analysis-mode="analysisMode" :analysis-radius-km="analysisRadiusKm" :show-analysis-results="showAnalysisResults" :include-small-airports="includeSmallAirports" :show-terrain="showTerrain" :show-lighting="showLighting" :show-buildings="showBuildings" @select="selectFlight" @clear="clearSelection" />
      <MapAnalysisPanel v-show="analysisEnabled" :flight="selectedFlight" :flights="flights" :airports="airports" :mode="analysisMode" :radius-km="analysisRadiusKm" :show-results="showAnalysisResults" :include-small-airports="includeSmallAirports" @close="analysisEnabled = false" @update:mode="analysisMode = $event" @update:radius-km="analysisRadiusKm = $event" @update:show-results="showAnalysisResults = $event" @update:include-small-airports="includeSmallAirports = $event" />
      <FlightListPanel v-if="flightListOpen" :flights="flights" :selected-icao24="selectedFlight?.properties.icao24" @close="flightListOpen = false" @select="selectFlight" />
    </main>
  </ResizableLayout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { AIRPORT_TYPES, BASE_LAYERS, WEATHER_LAYERS } from '../config/mapLayers'
import { flightApi } from '../api/flightApi'
import { useFlightData } from '../composables/useFlightData'
import CesiumMap from './Cesium_Map.vue'
import AirportLegend from './AirportLegend.vue'
import FlightLegend from './FlightLegend.vue'
import LeafletMap from './Leaflet_Map.vue'
import MapAnalysisPanel from './MapAnalysisPanel.vue'
import FlightListPanel from './FlightListPanel.vue'
import ResizableLayout from './ResizableLayout.vue'

const { flights, airports, loading, error, refresh } = useFlightData()
const selectedFlight = ref(null)
const selectedTrack = ref([])
const mapMode = ref('2d')
const baseLayerId = ref('osm-hot')
const weatherLayerId = ref('none')
const showAirports = ref(true)
const airportTypes = ref(['large_airport', 'medium_airport', 'small_airport'])
const showLabels = ref(true)
const showTerrain = ref(true)
const showLighting = ref(true)
const showBuildings = ref(true)
const analysisEnabled = ref(false)
const analysisMode = ref('nearest')
const analysisRadiusKm = ref(50)
const showAnalysisResults = ref(true)
const includeSmallAirports = ref(false)
const flightListOpen = ref(false)
const weatherAvailable = computed(() => Boolean(import.meta.env.VITE_OPENWEATHER_API_KEY))
const coordinates = computed(() => selectedFlight.value ? selectedFlight.value.geometry.coordinates.map((value) => value.toFixed(4)).join(', ') : '')
function number(value) { return value == null ? '—' : Math.round(value) }
function dateTime(value) { return value ? new Date(value).toLocaleString() : '—' }
async function selectFlight(flight) {
  selectedFlight.value = flight
  try { selectedTrack.value = await flightApi.track(flight.properties.icao24, 6) } catch { selectedTrack.value = [] }
}
function clearSelection() { selectedFlight.value = null; selectedTrack.value = [] }
</script>

<style scoped>
.map-workspace { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; }.sidebar-content { padding: 24px; }.eyebrow { margin: 0; color: #51c7f5; font-size: 12px; letter-spacing: .13em; }.subtle, .hint { color: #9bb7ca; font-size: 13px; line-height: 1.5; } h1 { margin: 7px 0; font-size: 25px; } h2 { font-size: 14px; margin: 14px 0 9px; }.collapse-section { border-top: 1px solid #28516b; padding: 14px 0; }.collapse-section summary { cursor: pointer; color: #eaf7ff; font-size: 14px; font-weight: 700; }.control-group { display: grid; gap: 12px; margin-top: 14px; } label { display: grid; gap: 6px; color: #c8deeb; font-size: 13px; } select, button { width: 100%; border: 1px solid #2f627f; border-radius: 7px; padding: 9px 10px; color: #eff9ff; background: #143e59; font: inherit; } button { cursor: pointer; } button:hover { background: #1d5879; } button:disabled { cursor: wait; opacity: .65; }.check { display: block; }.check input { margin-right: 8px; accent-color: #4ec7f5; }.airport-filter { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px; border: 1px solid #28516b; border-radius: 7px; }.airport-filter > span { grid-column: 1 / -1; color: #9bb7ca; font-size: 12px; }.error { border-left: 3px solid #fb8c7b; padding: 10px; background: #502c34; font-size: 13px; }.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 18px 0; color: #9ab8ca; font-size: 11px; }.metrics b { display: block; color: white; font-size: 20px; }.details dl { display: grid; grid-template-columns: 76px 1fr; gap: 7px; margin: 0; font-size: 12px; }.details dt { color: #9ab8ca; }.details dd { margin: 0; overflow-wrap: anywhere; }.secondary { width: auto; margin-top: 12px; background: transparent; }.flight-row { display: flex; justify-content: space-between; margin: 3px 0; background: transparent; border-color: transparent; text-align: left; }.flight-row.active { background: #1c597b; border-color: #55c6f2; }.flight-row small { color: #a8c5d6; }
</style>
