<template>
  <FloatingPanel title="空间分析" eyebrow="SPATIAL ANALYSIS" :width="400" :height="530" :mobile-ratio=".44" @close="$emit('close')">
    <div class="analysis-content tool-content">
      <label>分析方式
        <select :value="mode" @change="$emit('update:mode', $event.target.value)">
          <option value="nearest">分等级最近邻</option>
          <option value="radius">半径范围查询</option>
          <option value="corridor">归档航迹走廊查询</option>
          <option value="sector">方向扇区查询</option>
        </select>
      </label>
      <label class="check"><input :checked="showResults" type="checkbox" @change="$emit('update:show-results', $event.target.checked)">在地图上显示分析结果</label>
      <label class="check"><input :checked="includeSmallAirports" type="checkbox" @change="$emit('update:include-small-airports', $event.target.checked)">分析中包含小型机场</label>
      <label v-if="mode === 'radius' || mode === 'sector'">搜索半径：{{ radiusKm }} km
        <input :value="radiusKm" type="range" min="10" max="300" step="10" @input="$emit('update:radius-km', Number($event.target.value))">
      </label>
      <template v-if="mode === 'sector'">
        <label>扇区中心方向：{{ sectorBearingDeg }}°（正北为 0°）<input :value="sectorBearingDeg" type="range" min="0" max="359" step="1" @input="$emit('update:sector-bearing-deg', Number($event.target.value))"></label>
        <label>扇区张角：{{ sectorAngleDeg }}°<input :value="sectorAngleDeg" type="range" min="30" max="180" step="10" @input="$emit('update:sector-angle-deg', Number($event.target.value))"></label>
      </template>
      <details class="query-options"><summary>飞机筛选与数据质量</summary>
        <label class="check"><input :checked="verticalFilterEnabled" type="checkbox" @change="$emit('update:vertical-filter-enabled', $event.target.checked)">按高度差筛选飞机</label>
        <label v-if="verticalFilterEnabled">最大高度差：{{ maxVerticalSeparationM }} m<input :value="maxVerticalSeparationM" type="range" min="0" max="5000" step="100" @input="$emit('update:max-vertical-separation-m', Number($event.target.value))"></label>
        <label class="check"><input :checked="timeFilterEnabled" type="checkbox" @change="$emit('update:time-filter-enabled', $event.target.checked)">只比较采集时间接近的飞机</label>
        <label v-if="timeFilterEnabled">最大采集时间差：{{ maxTimeDifferenceSeconds }} 秒<input :value="maxTimeDifferenceSeconds" type="range" min="30" max="900" step="30" @input="$emit('update:max-time-difference-seconds', Number($event.target.value))"></label>
        <p class="hint">启用筛选时，缺少对应高度 / 时间的飞机也会排除。不是碰撞预警。</p>
      </details>
      <label v-if="mode === 'corridor'">走廊单侧宽度：{{ corridorKm }} km
        <input :value="corridorKm" type="range" min="1" max="50" step="1" @input="$emit('update:corridor-km', Number($event.target.value))">
      </label>
      <p v-if="!flight" class="hint" role="status">先从地图或航班列表选择一架飞机，再开始分析。</p>
      <template v-else>
        <p class="hint">分析对象：{{ flight.properties.callsign || flight.properties.icao24 }}。默认只查询中大型机场。</p>
        <p v-if="mode === 'corridor'" class="hint">以该机最后记录前 6 小时的连续归档航迹为中心查询。目标飞机为已加载位置，不代表同一时刻的历史交通；走廊边界为近似展示，查询按球面距离计算。</p>
        <p v-else class="hint">距离为地表水平距离；飞机高度差单独展示。各记录的采集时间可能不同。</p>
        <p v-if="trackLoading && mode === 'corridor'" role="status">正在读取本地归档轨迹…</p>
        <p v-if="trackError && mode === 'corridor'" class="warning">{{ trackError }}</p>
        <p v-if="results.warning && !trackLoading" class="warning" role="status">{{ results.warning }}</p>
        <p v-if="results.excludedAircraftCount" class="hint">高度 / 时间条件排除了 {{ results.excludedAircraftCount }} 架飞机。</p>
        <div class="counts">
          <span><b>{{ results.airportResults.length }}</b> 个机场</span>
          <span><b>{{ results.aircraftResults.length }}</b> 架飞机</span>
        </div>
        <h3>{{ mode === 'nearest' ? (includeSmallAirports ? '大型 / 中型 / 小型各最近 1 个' : '大型 / 中型各最近 1 个') : '符合条件的机场' }}</h3>
        <ol>
          <li v-for="item in results.airportResults.slice(0, 50)" :key="item.feature.properties.ident">
            <div><b>{{ item.feature.properties.ident }}</b> · {{ item.feature.properties.name }}
              <small>{{ typeLabel(item.feature.properties.type) }}</small></div>
            <strong>{{ distance(item.distanceKm) }}</strong>
          </li>
        </ol>
        <p v-if="!results.airportResults.length" class="hint">当前条件下没有匹配机场。</p>
        <h3>{{ mode === 'nearest' ? '最近的其他飞机' : '符合条件的飞机' }}</h3>
        <ol>
          <li v-for="item in results.aircraftResults.slice(0, 50)" :key="item.feature.properties.icao24">
            <div>{{ item.feature.properties.callsign || item.feature.properties.icao24 }}
              <small>高度差：{{ item.verticalSeparationM == null ? '未知' : Math.round(item.verticalSeparationM) + ' m' }}</small></div>
            <strong>{{ distance(item.distanceKm) }}</strong>
          </li>
        </ol>
        <p v-if="!results.aircraftResults.length" class="hint">当前条件下没有匹配飞机。</p>
        <details class="query-options"><summary>归档航迹统计</summary>
          <p class="hint">{{ results.trackSummary.pointCount }} 个有效点 · {{ results.trackSummary.segmentCount }} 段连续轨迹<br>
            累计水平距离：{{ distance(results.trackSummary.distanceKm) }} · 连续段时长：{{ Math.round(results.trackSummary.durationSeconds / 60) }} 分钟<br>
            高度范围：{{ results.trackSummary.minAltitudeM == null ? '未知' : Math.round(results.trackSummary.minAltitudeM) + '–' + Math.round(results.trackSummary.maxAltitudeM) + ' m' }}<br>
            缺失区间不计入距离和时长；轨迹不足时不补造数据。</p>
        </details>
        <p v-if="results.aircraftResults.length > 50 || results.airportResults.length > 50" class="hint">面板显示每类前 50 个，地图和导出包含全部结果。</p>
        <button type="button" :disabled="!results.airportResults.length && !results.aircraftResults.length" @click="downloadResults">导出分析结果 GeoJSON</button>
      </template>
    </div>
  </FloatingPanel>
</template>

<script setup>
import FloatingPanel from './FloatingPanel.vue'
import { airportTypeById } from '../config/mapLayers'
import { downloadGeoJSON } from '../utils/download'

defineEmits(['close', 'update:mode', 'update:radius-km', 'update:corridor-km', 'update:show-results', 'update:include-small-airports',
  'update:sector-bearing-deg', 'update:sector-angle-deg', 'update:vertical-filter-enabled', 'update:max-vertical-separation-m',
  'update:time-filter-enabled', 'update:max-time-difference-seconds'])
const props = defineProps({
  flight: Object,
  results: { type: Object, required: true },
  mode: { type: String, default: 'nearest' },
  radiusKm: { type: Number, default: 50 },
  corridorKm: { type: Number, default: 10 },
  showResults: { type: Boolean, default: true },
  includeSmallAirports: Boolean,
  trackLoading: Boolean,
  trackError: String,
  sectorBearingDeg: { type: Number, default: 0 }, sectorAngleDeg: { type: Number, default: 90 },
  verticalFilterEnabled: Boolean, maxVerticalSeparationM: { type: Number, default: 1000 },
  timeFilterEnabled: Boolean, maxTimeDifferenceSeconds: { type: Number, default: 300 },
})
const typeLabel = value => airportTypeById(value).label
const distance = value => value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`
function downloadResults() {
  const targets = [...props.results.airportResults, ...props.results.aircraftResults]
    .map(item => ({ ...item.feature, properties: { ...item.feature.properties,
      analysis_mode: props.mode, horizontal_distance_km: item.distanceKm,
      vertical_separation_m: item.verticalSeparationM ?? null } }))
  downloadGeoJSON({ type: 'FeatureCollection', features: [...props.results.geometry.features, ...targets],
    metadata: { mode: props.mode, aircraft: props.flight?.properties.icao24, observed_at: props.flight?.properties.observed_at,
      radius_km: props.radiusKm, corridor_half_width_km: props.corridorKm,
      sector_bearing_deg: props.sectorBearingDeg, sector_angle_deg: props.sectorAngleDeg,
      include_small_airports: props.includeSmallAirports,
      max_vertical_separation_m: props.verticalFilterEnabled ? props.maxVerticalSeparationM : null,
      max_time_difference_seconds: props.timeFilterEnabled ? props.maxTimeDifferenceSeconds : null,
      note: 'Horizontal spherical distances; not an aviation safety assessment.' } }, `analysis-${props.mode}.geojson`)
}
</script>

<style scoped>
.analysis-content { padding: 14px; }
.query-options { margin: 12px 0; border: 1px solid var(--border); border-radius: var(--radius-control); padding: 10px; }
.query-options summary { cursor: pointer; color: var(--text-primary); }
.query-options label { margin-top: 12px; }
input[type="range"] { margin-top: 8px; }
h3 { margin: 14px 0 6px; font-size: 13px; }
ol { padding: 0; margin: 0; list-style: none; }
li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid #285069; }
li div { min-width: 0; overflow-wrap: anywhere; }
li strong { color: #70d9ff; white-space: nowrap; }
li small { display: block; color: #aac8d9; margin-top: 5px; }
.counts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.counts span { padding: 8px; border-radius: 6px; background: var(--surface-card); color: #b9d5e3; }
.counts b { display: block; color: white; font-size: 19px; }
</style>
