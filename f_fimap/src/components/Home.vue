<template>
  <ResizableLayout>
    <template #sidebar>
      <div class="sidebar-content">
        <header><p class="eyebrow">FLIGHT MAP</p><h1>飞行情报地图</h1><p class="subtle">浏览机场资料，查看归档航迹，进行二维 / 三维空间查询。</p></header>
        <details class="collapse-section" open>
          <summary>地图控制</summary>
          <section class="control-group">
            <label>地图视图<select v-model="mapMode"><option value="2d">二维 Leaflet</option><option value="3d">三维 Cesium</option></select></label>
            <template v-if="mapMode === '3d'">
              <label class="check"><input v-model="showTerrain" type="checkbox">显示世界高程地形</label>
              <label class="check"><input v-model="showLighting" type="checkbox">启用地形光照</label>
              <label class="check"><input v-model="showBuildings" type="checkbox">显示 OSM 全球建筑物</label>
            </template>
            <label>地图底图<select v-model="baseLayerId"><option v-for="layer in BASE_LAYERS" :key="layer.id" :value="layer.id">{{ layer.label }}</option></select></label>
            <label>天气叠加<select v-model="weatherLayerId" :disabled="!weatherAvailable"><option v-for="layer in WEATHER_LAYERS" :key="layer.id" :value="layer.id">{{ layer.label }}</option></select></label>
            <p v-if="!weatherAvailable" class="hint">天气瓦片未配置 Key；位置天气和逐小时预报仍可使用。</p>
            <p v-if="weatherTileStatus" class="hint" role="status">{{ weatherTileStatus }}</p>
            <button class="secondary" @click="openTool('weather')">打开位置天气 / 逐小时预报</button>
            <label class="check"><input v-model="showAirports" type="checkbox">显示机场</label>
            <div v-if="showAirports" class="airport-filter"><span>地图机场类别</span>
              <label v-for="type in AIRPORT_TYPES" :key="type.id" class="check"><input v-model="airportTypes" type="checkbox" :value="type.id">{{ type.label }}</label>
            </div>
            <label class="check"><input v-model="showLabels" type="checkbox">显示飞机呼号</label>
            <button class="secondary" @click="openTool('airports')">打开欧洲机场资料库</button>
            <button class="secondary" @click="openTool('flights')">打开详细航班列表</button>
            <button :disabled="loading" @click="refresh">{{ loading ? '正在刷新…' : '刷新本地航班数据' }}</button>
          </section>
        </details>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <section class="metrics">
          <span><b>{{ flights.length }}</b> 架航班</span><span><b>{{ airports.length }}</b> 个机场</span><span><b>{{ selectedTrack.length }}</b> 个归档点</span>
        </section>
        <p class="hint">航班记录时间：{{ latestObservation ? dateTime(latestObservation) : '暂无数据' }}。刷新读取本地保存的数据（可能含演示记录），不代表实时航班。</p>
        <details class="collapse-section" open>
          <summary>航班详情</summary>
          <section class="details">
            <h2>{{ selectedFlight ? selectedFlight.properties.callsign || selectedFlight.properties.icao24 : '选择一架飞机' }}</h2>
            <template v-if="selectedFlight">
              <dl><dt>ICAO24</dt><dd>{{ selectedFlight.properties.icao24 }}</dd>
                <dt>起源国家</dt><dd>{{ selectedFlight.properties.origin_country || '—' }}</dd>
                <dt>经纬坐标</dt><dd>{{ coordinates }}</dd>
                <dt>高度</dt><dd>{{ number(selectedFlight.properties.altitude_m) }} m</dd>
                <dt>速度</dt><dd>{{ number(selectedFlight.properties.velocity_ms) }} m/s</dd>
                <dt>航向</dt><dd>{{ number(selectedFlight.properties.track_deg) }}°</dd>
                <dt>采集时间</dt><dd>{{ dateTime(selectedFlight.properties.observed_at) }}</dd>
              </dl>
              <p class="hint">{{ trackLoading ? '正在读取归档航迹…' : '显示该机最后记录前 6 小时的本地轨迹。' }}</p>
              <p v-if="trackError" class="error">{{ trackError }}</p>
              <button class="secondary" @click="clearSelection">取消选择</button>
            </template>
          </section>
        </details>
        <details class="collapse-section" open>
          <summary>分析工具</summary>
          <section class="control-group">
            <label class="check"><input :checked="analysisEnabled" type="checkbox" @change="$event.target.checked ? openTool('analysis') : analysisEnabled = false">在地图中打开空间分析工具</label>
            <button class="secondary" @click="openTool('analysis')">打开空间分析面板</button>
            <p class="hint">支持分等级最近邻、半径查询和归档航迹走廊；默认只查询中大型机场。</p>
          </section>
        </details>
        <details class="collapse-section"><summary>机场等级图例</summary><AirportLegend /></details>
        <details class="collapse-section"><summary>飞机高度图例</summary><FlightLegend /></details>
      </div>
    </template>

    <main class="map-workspace">
      <LeafletMap v-if="mapMode === '2d'" v-bind="sharedMapProps" :weather-layer-id="weatherLayerId" @weather-status="weatherTileStatus = $event"
        @select="selectFlight" @select-airport="selectAirport" @clear="clearSelection" />
      <CesiumMap v-else v-bind="sharedMapProps" :weather-layer-id="weatherLayerId" @weather-status="weatherTileStatus = $event" :show-terrain="showTerrain" :show-lighting="showLighting" :show-buildings="showBuildings"
        @select="selectFlight" @select-airport="selectAirport" @clear="clearSelection" />
      <MapAnalysisPanel v-if="analysisEnabled" :flight="selectedFlight" :results="analysisResults"
        v-model:mode="analysisMode" v-model:radius-km="analysisRadiusKm" v-model:corridor-km="corridorKm"
        v-model:show-results="showAnalysisResults" v-model:include-small-airports="includeSmallAirports"
        v-model:sector-bearing-deg="sectorBearingDeg" v-model:sector-angle-deg="sectorAngleDeg"
        v-model:vertical-filter-enabled="verticalFilterEnabled" v-model:max-vertical-separation-m="maxVerticalSeparationM"
        v-model:time-filter-enabled="timeFilterEnabled" v-model:max-time-difference-seconds="maxTimeDifferenceSeconds"
        :track-loading="trackLoading" :track-error="trackError" @close="analysisEnabled = false" />
      <FlightListPanel v-if="flightListOpen" :flights="flights" :selected-icao24="selectedIcao24"
        @close="flightListOpen = false" @select="selectFlight" />
      <AirportBrowserPanel v-if="airportBrowserOpen" :airports="airports" :selected-ident="selectedAirportIdent"
        :loading="airportsLoading" @close="airportBrowserOpen = false" @select="selectAirport" @clear="clearSelection" />
      <WeatherPanel v-if="weatherOpen" v-model:location="weatherLocation" :target-name="weatherTargetName"
        :payload="weatherPayload" :loading="weatherLoading" :error="weatherError" v-model:hour-index="weatherHourIndex"
        v-model:show-marker="showWeatherMarker" @refresh="loadWeather" @close="closeWeather" />
    </main>
  </ResizableLayout>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { AIRPORT_TYPES, BASE_LAYERS, WEATHER_LAYERS } from '../config/mapLayers'
import { flightApi } from '../api/flightApi'
import { useFlightData } from '../composables/useFlightData'
import { buildAnalysis } from '../utils/spatialAnalysis'
import { weatherFeature } from '../utils/weatherDisplay'
import { useWeatherQuery } from '../composables/useWeatherQuery'
import WeatherPanel from './WeatherPanel.vue'
import AirportLegend from './AirportLegend.vue'
import AirportBrowserPanel from './AirportBrowserPanel.vue'
import FlightLegend from './FlightLegend.vue'
import LeafletMap from './Leaflet_Map.vue'
import MapAnalysisPanel from './MapAnalysisPanel.vue'
import FlightListPanel from './FlightListPanel.vue'
import ResizableLayout from './ResizableLayout.vue'

// Load 3D code only when requested; phones opening the 2D map need not load it.
const CesiumMap = defineAsyncComponent(() => import('./Cesium_Map.vue'))

const { flights, airports, loading, airportsLoading, error, refresh } = useFlightData()
const selectedIcao24 = ref(null)
const selectedAirportIdent = ref(null)
const selectedFlight = computed(() => flights.value.find(item => item.properties.icao24 === selectedIcao24.value) ?? null)
const selectedAirport = computed(() => airports.value.find(item => item.properties.ident === selectedAirportIdent.value) ?? null)
const selectedTrack = ref([])
const trackLoading = ref(false)
const trackError = ref('')
let trackController
let selectionVersion = 0

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
const corridorKm = ref(10)
const sectorBearingDeg = ref(0)
const sectorAngleDeg = ref(90)
const verticalFilterEnabled = ref(false)
const maxVerticalSeparationM = ref(1000)
const timeFilterEnabled = ref(false)
const maxTimeDifferenceSeconds = ref(300)
const showAnalysisResults = ref(true)
const includeSmallAirports = ref(false)
const flightListOpen = ref(false)
const airportBrowserOpen = ref(false)
const airportFocusVersion = ref(0)
const weatherOpen = ref(false)
const weatherTargetName = ref('欧洲初始视图中心')
const { location: weatherLocation, payload: weatherPayload, loading: weatherLoading,
  error: weatherError, hourIndex: weatherHourIndex, load: loadWeather, invalidate: invalidateWeather } = useWeatherQuery()
const showWeatherMarker = ref(true)
const weatherTileStatus = ref('')
let compactMedia
let lastTool = null

const analysisResults = computed(() => buildAnalysis({
  flight: selectedFlight.value, flights: analysisEnabled.value ? flights.value : [],
  airports: analysisEnabled.value ? airports.value : [], track: analysisEnabled.value ? selectedTrack.value : [],
  mode: analysisMode.value, radiusKm: analysisRadiusKm.value,
  includeSmallAirports: includeSmallAirports.value, corridorKm: corridorKm.value,
  sectorBearingDeg: sectorBearingDeg.value, sectorAngleDeg: sectorAngleDeg.value,
  verticalFilterEnabled: verticalFilterEnabled.value, maxVerticalSeparationM: maxVerticalSeparationM.value,
  timeFilterEnabled: timeFilterEnabled.value, maxTimeDifferenceSeconds: maxTimeDifferenceSeconds.value,
}))
const sharedMapProps = computed(() => ({
  flights: flights.value, airports: airports.value, airportTypes: airportTypes.value,
  showAirports: showAirports.value, showLabels: showLabels.value, baseLayerId: baseLayerId.value,
  selectedIcao24: selectedIcao24.value, selectedAirport: selectedAirport.value, track: selectedTrack.value,
  airportFocusVersion: airportFocusVersion.value,
  analysisEnabled: analysisEnabled.value, showAnalysisResults: showAnalysisResults.value,
  analysisResults: analysisResults.value,
  weatherPoint: showWeatherMarker.value && weatherOpen.value ? weatherFeature(weatherPayload.value, weatherHourIndex.value) : null,
}))
const weatherAvailable = computed(() => Boolean(import.meta.env.VITE_OPENWEATHER_API_KEY))
const coordinates = computed(() => selectedFlight.value?.geometry.coordinates.map(value => value.toFixed(4)).join(', ') ?? '')
const latestObservation = computed(() => {
  const times = flights.value.map(item => Date.parse(item.properties.observed_at)).filter(Number.isFinite)
  return times.length ? Math.max(...times) : null
})
function number(value) { return value == null ? '—' : Math.round(value) }
function dateTime(value) { return value ? new Date(value).toLocaleString() : '—' }

function openTool(tool) {
  lastTool = tool
  // A phone has room for one bottom sheet; desktop panels remain independently usable.
  if (window.matchMedia('(max-width: 760px)').matches) {
    flightListOpen.value = false
    airportBrowserOpen.value = false
    analysisEnabled.value = false
    closeWeather()
  }
  if (tool === 'flights') flightListOpen.value = true
  if (tool === 'airports') airportBrowserOpen.value = true
  if (tool === 'analysis') analysisEnabled.value = true
  if (tool === 'weather') { weatherOpen.value = true; syncWeatherTarget(); loadWeather() }
}
function syncWeatherTarget() {
  const target = selectedAirport.value ?? selectedFlight.value
  if (!target) return
  weatherTargetName.value = target.properties.name || target.properties.callsign || target.properties.icao24
  weatherLocation.value = { longitude: target.geometry.coordinates[0], latitude: target.geometry.coordinates[1] }
}
function closeWeather() {
  weatherOpen.value = false
  invalidateWeather()
}
watch(weatherLocation, () => {
  const target = selectedAirport.value ?? selectedFlight.value
  weatherTargetName.value = target && target.geometry.coordinates[0] === weatherLocation.value.longitude
    && target.geometry.coordinates[1] === weatherLocation.value.latitude
    ? target.properties.name || target.properties.callsign || target.properties.icao24 : '自定义位置'
}, { flush: 'sync' })
watch([selectedIcao24, selectedAirportIdent], () => {
  if (weatherOpen.value) {
    invalidateWeather(); syncWeatherTarget()
  }
})
async function selectFlight(flight) {
  trackController?.abort()
  const version = ++selectionVersion
  selectedIcao24.value = flight.properties.icao24
  sectorBearingDeg.value = Number.isFinite(flight.properties.track_deg) ? flight.properties.track_deg : 0
  selectedAirportIdent.value = null
  selectedTrack.value = []
  trackError.value = ''
  trackLoading.value = true
  trackController = new AbortController()
  try {
    const points = await flightApi.track(flight.properties.icao24, 6, { signal: trackController.signal })
    if (version === selectionVersion) selectedTrack.value = points
  } catch (cause) {
    if (version === selectionVersion && cause.name !== 'AbortError') trackError.value = '归档轨迹读取失败，请稍后重新选择。'
  } finally {
    if (version === selectionVersion) trackLoading.value = false
  }
}
function clearSelection() {
  ++selectionVersion
  trackController?.abort()
  selectedIcao24.value = null
  selectedAirportIdent.value = null
  selectedTrack.value = []
  trackLoading.value = false
  trackError.value = ''
}
function selectAirport(airport) {
  clearSelection()
  selectedAirportIdent.value = airport.properties.ident
  airportFocusVersion.value++
  openTool('airports')
}
function adaptOpenPanels() {
  if (!compactMedia.matches) return
  if (lastTool !== 'flights') flightListOpen.value = false
  if (lastTool !== 'airports') airportBrowserOpen.value = false
  if (lastTool !== 'analysis') analysisEnabled.value = false
  if (lastTool !== 'weather') closeWeather()
}
watch(flights, () => { if (selectedIcao24.value && !selectedFlight.value) clearSelection() })
onMounted(() => {
  compactMedia = window.matchMedia('(max-width: 760px)')
  compactMedia.addEventListener('change', adaptOpenPanels)
})
onUnmounted(() => {
  ++selectionVersion; trackController?.abort()
  compactMedia?.removeEventListener('change', adaptOpenPanels)
})
</script>

<style scoped>
.map-workspace { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; }
.sidebar-content { padding: 24px; }
.eyebrow { margin: 0; color: #51c7f5; font-size: 12px; letter-spacing: .13em; }
.subtle, .hint { color: #9bb7ca; font-size: 13px; line-height: 1.5; }
h1 { margin: 7px 0; font-size: 25px; }
h2 { font-size: 14px; margin: 14px 0 9px; }
.collapse-section { border-top: 1px solid #28516b; padding: 14px 0; }
.collapse-section summary { cursor: pointer; color: #eaf7ff; font-size: 14px; font-weight: 700; }
.control-group { display: grid; gap: 12px; margin-top: 14px; }
label { display: grid; gap: 6px; color: #c8deeb; font-size: 13px; }
select, button { width: 100%; border: 1px solid #2f627f; border-radius: 7px; padding: 9px 10px; color: #eff9ff; background: #143e59; font: inherit; }
button { cursor: pointer; }
button:hover { background: #1d5879; }
button:disabled { cursor: wait; opacity: .65; }
.check { display: block; }
.check input { margin-right: 8px; accent-color: #4ec7f5; }
.airport-filter { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px; border: 1px solid #28516b; border-radius: 7px; }
.airport-filter > span { grid-column: 1 / -1; color: #9bb7ca; font-size: 12px; }
.error { border-left: 3px solid #fb8c7b; padding: 10px; background: #502c34; font-size: 13px; }
.metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 18px 0; color: #9ab8ca; font-size: 11px; }
.metrics b { display: block; color: white; font-size: 20px; }
.details dl { display: grid; grid-template-columns: 76px 1fr; gap: 7px; margin: 0; font-size: 12px; }
.details dt { color: #9ab8ca; }
.details dd { margin: 0; overflow-wrap: anywhere; }
.secondary { width: auto; margin-top: 12px; background: transparent; }
.flight-row { display: flex; justify-content: space-between; margin: 3px 0; background: transparent; border-color: transparent; text-align: left; }
.flight-row.active { background: #1c597b; border-color: #55c6f2; }
.flight-row small { color: #a8c5d6; }
.map-workspace { isolation: isolate; }
@media (max-width: 760px) {
  .sidebar-content { padding: 14px; }
.sidebar-content header .subtle, .sidebar-content .details { display: none; }
.sidebar-content h1 { font-size: 21px; }
.collapse-section { padding: 10px 0; }
.control-group { gap: 9px; margin-top: 10px; }
.metrics { margin: 11px 0; }
.metrics b { font-size: 17px; }
.airport-filter { grid-template-columns: repeat(3, 1fr); padding: 8px; }
}
</style>
