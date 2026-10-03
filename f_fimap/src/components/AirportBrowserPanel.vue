<template>
  <FloatingPanel ref="panel" title="欧洲机场资料库" eyebrow="AIRPORT CATALOGUE"
    :width="540" :height="620" :mobile-ratio="0.55" align="right" @close="emit('close')">
    <div class="catalogue tool-content">
      <p class="catalogue-summary">已加载 {{ airports.length.toLocaleString() }} 个机场 · {{ countries.length }} 个国家 / 地区</p>
      <p class="muted">检索已有的本地机场地理数据；资料库的筛选不会改变空间分析的机场范围。</p>
      <div class="filters">
        <label class="search">搜索机场
          <input v-model="query" type="search" placeholder="名称、ICAO / IATA、城市" autocomplete="off" />
        </label>
        <label>机场类型
          <select v-model="type"><option value="">全部类型</option>
            <option v-for="item in types" :key="item.id" :value="item.id">{{ item.label }}（{{ item.count }}）</option>
          </select>
        </label>
        <label>国家 / 地区
          <select v-model="country"><option value="">全部国家 / 地区</option>
            <option v-for="item in countries" :key="item.code" :value="item.code">{{ item.label }}（{{ item.count }}）</option>
          </select>
        </label>
        <label>排序
          <select v-model="sort"><option value="name">机场名称</option><option value="type">机场等级优先</option></select>
        </label>
        <button type="button" class="reset" @click="resetFilters">重置筛选</button>
      </div>

      <section v-if="selectedAirport" ref="detail" class="airport-detail" aria-label="机场详情">
        <div class="detail-heading"><div><span class="type-badge">{{ typeLabel(selectedAirport.properties.type) }}</span>
          <h3>{{ selectedAirport.properties.name || selectedIdent }}</h3></div>
          <button type="button" @click="emit('clear')">取消选择</button>
        </div>
        <dl>
          <template v-for="field in detailFields" :key="field.label"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template>
        </dl>
        <p class="source-note">来源：{{ text(selectedAirport.properties.source, '本地导入数据，原始提供方未记录') }}<br />
          数据更新时间：{{ text(selectedAirport.properties.source_updated_at, '未记录') }}</p>
        <div class="detail-links">
          <button type="button" :disabled="!validAirportPoint(selectedAirport)" @click="emit('select', selectedAirport)">定位到地图</button>
          <a v-if="safeAirportLink(selectedAirport.properties.home_link)" :href="safeAirportLink(selectedAirport.properties.home_link)" target="_blank" rel="noopener noreferrer">机场网站 ↗</a>
          <a v-if="safeAirportLink(selectedAirport.properties.wikipedia_link)" :href="safeAirportLink(selectedAirport.properties.wikipedia_link)" target="_blank" rel="noopener noreferrer">百科资料 ↗</a>
        </div>
        <p class="muted">机场标识不一定是 ICAO 代码；定期航班字段为原始数据记录，不代表当前运营状态。</p>
      </section>

      <div class="results-toolbar">
        <span role="status">{{ loading ? '正在加载机场…' : `筛选结果 ${filtered.length.toLocaleString()} 个` }}</span>
        <button type="button" :disabled="!filtered.length || loading" @click="downloadGeoJSON">导出筛选结果</button>
      </div>
      <p v-if="exportMessage" class="muted" role="status">{{ exportMessage }}</p>
      <p v-if="!loading && !filtered.length" class="empty">没有匹配的机场，请调整搜索词或筛选条件。</p>
      <ul class="airport-list">
        <li v-for="airport in pagination.items" :key="airport.properties.ident">
          <button type="button" class="airport-row" :class="{ selected: airport.properties.ident === selectedIdent }"
            :aria-pressed="airport.properties.ident === selectedIdent" :disabled="!validAirportPoint(airport)" @click="emit('select', airport)">
            <span class="airport-symbol" :style="{ color: typeColor(airport.properties.type) }" aria-hidden="true">{{ typeSymbol(airport.properties.type) }}</span>
            <span class="airport-label"><strong>{{ airport.properties.name || airport.properties.ident }}</strong>
              <span>{{ airport.properties.ident }}<template v-if="airport.properties.iata_code"> · {{ airport.properties.iata_code }}</template> · {{ typeLabel(airport.properties.type) }}</span>
              <small>{{ text(airport.properties.municipality) }} · {{ countryLabel(airport.properties.country) }}</small>
            </span><span class="locate-label">查看 ›</span>
          </button>
        </li>
      </ul>
      <nav class="pagination" aria-label="机场列表分页">
        <button type="button" :disabled="pagination.page === 1" @click="page = pagination.page - 1">上一页</button>
        <span>{{ pagination.page }} / {{ pagination.pageCount }} 页 · 每页 50 条</span>
        <button type="button" :disabled="pagination.page === pagination.pageCount" @click="page = pagination.page + 1">下一页</button>
      </nav>
    </div>
  </FloatingPanel>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import FloatingPanel from './FloatingPanel.vue'
import { AIRPORT_TYPES } from '../config/mapLayers'
import { airportGeoJSON, filterAirports, paginateAirports, safeAirportLink, validAirportPoint } from '../utils/airportCatalog'
import { downloadGeoJSON as saveGeoJSON } from '../utils/download'
import { AIRPORT_SYMBOLS } from '../config/visualRules'

const props = defineProps({
  airports: { type: Array, default: () => [] },
  selectedIdent: String,
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'clear', 'close'])
const query = ref('')
const type = ref('')
const country = ref('')
const sort = ref('type')
const page = ref(1)
const panel = ref(null)
const detail = ref(null)
const exportMessage = ref('')
const countryNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' })

const text = (value, fallback = '未记录') => value == null || value === '' ? fallback : String(value)
const typeLabel = (value) => AIRPORT_TYPES.find((item) => item.id === value)?.label || text(value, '未知类型')
const typeColor = (value) => AIRPORT_TYPES.find((item) => item.id === value)?.color || '#94a3b8'
const typeSymbol = value => AIRPORT_SYMBOLS[value] || '·'
function countryLabel(code) {
  if (!code) return '国家未记录'
  try { return `${countryNames.of(code)} (${code})` } catch { return code }
}

const countries = computed(() => {
  const counts = new Map()
  for (const airport of props.airports) {
    const code = airport.properties.country
    if (code) counts.set(code, (counts.get(code) || 0) + 1)
  }
  return [...counts].map(([code, count]) => ({ code, count, label: countryLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
})
const types = computed(() => {
  const counts = new Map()
  for (const airport of props.airports) {
    const id = airport.properties.type
    if (id) counts.set(id, (counts.get(id) || 0) + 1)
  }
  return [...counts].map(([id, count]) => ({ id, count, label: typeLabel(id) }))
})
const filtered = computed(() => filterAirports(props.airports, {
  query: query.value, type: type.value, country: country.value, sort: sort.value,
}))
const pagination = computed(() => paginateAirports(filtered.value, page.value))
const selectedAirport = computed(() => props.airports.find((airport) => airport.properties.ident === props.selectedIdent))
const detailFields = computed(() => {
  if (!selectedAirport.value) return []
  const { properties: item, geometry } = selectedAirport.value
  const position = validAirportPoint(selectedAirport.value) ? `${geometry.coordinates[1].toFixed(5)}°, ${geometry.coordinates[0].toFixed(5)}°` : '未记录'
  const elevation = item.elevation_ft == null || item.elevation_ft === '' ? NaN : Number(item.elevation_ft)
  const service = ({ yes: '有', no: '无' })[item.scheduled_service] || '未记录'
  return [
    { label: '机场标识', value: text(item.ident) },
    { label: 'ICAO / GPS 代码', value: text(item.gps_code) },
    { label: 'IATA 代码', value: text(item.iata_code) },
    { label: '当地代码', value: text(item.local_code) },
    { label: '国家 / 地区', value: countryLabel(item.country) },
    { label: '行政区', value: text(item.iso_region) },
    { label: '城市', value: text(item.municipality) },
    { label: '纬度 / 经度', value: position },
    { label: '机场海拔', value: Number.isFinite(elevation) ? `${elevation} ft / ${Math.round(elevation * .3048)} m` : '未记录' },
    { label: '定期航班（原始记录）', value: service },
  ]
})
function resetFilters() { query.value = ''; type.value = ''; country.value = ''; sort.value = 'type' }
function downloadGeoJSON() {
  const payload = airportGeoJSON(filtered.value)
  saveGeoJSON(payload, `europe-airports-${new Date().toISOString().slice(0, 10)}.geojson`)
  const excluded = filtered.value.length - payload.features.length
  exportMessage.value = `已导出 ${payload.features.length} 个机场${excluded ? `，跳过 ${excluded} 个无有效坐标的记录` : ''}。`
}
watch([query, type, country, sort], () => { page.value = 1; exportMessage.value = '' })
watch(() => props.selectedIdent, async () => { await nextTick(); panel.value?.reveal(detail.value) })
</script>

<style scoped>
.catalogue { padding: 14px; font-size: 12px; }
.catalogue-summary { margin: 0; color: #caefff; font-weight: 600; }
.muted { color: #a9c6d7; line-height: 1.6; }
.filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
.filters label { display: grid; gap: 5px; min-width: 0; color: #c1deed; }
.search { grid-column: 1 / -1; }
input, select, button { min-height: 36px; border: 1px solid #39718e; border-radius: 5px; background: var(--surface-card); color: #e5f7ff; font: inherit; }
input, select { width: 100%; min-width: 0; padding: 7px; }
input::placeholder { color: #99b8ca; }
button { padding: 6px 9px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid #6cddff; outline-offset: 2px; }
.reset { align-self: end; }
.airport-detail { margin: 14px 0; padding: 12px; border: 1px solid #4f9dba; border-radius: 7px; background: #0d3047; }
.detail-heading { display: flex; align-items: flex-start; gap: 12px; justify-content: space-between; }
.detail-heading > div { min-width: 0; }
.detail-heading button { flex-shrink: 0; }
.type-badge { color: #81dbff; font-size: 11px; }
h3 { margin: 5px 0 10px; font-size: 15px; overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: minmax(90px, 1fr) minmax(0, 1.6fr); gap: 7px 10px; line-height: 1.5; }
dt { color: #a5c4d6; }
dd { margin: 0; overflow-wrap: anywhere; }
.source-note { line-height: 1.7; color: #c3d4df; overflow-wrap: anywhere; }
.detail-links { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
a { color: #79daff; }
.results-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin: 12px 0; }
.empty { padding: 20px 0; color: #a9c6d7; }
.airport-list { padding: 0; margin: 0; list-style: none; }
.airport-list li + li { margin-top: 6px; }
.airport-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; text-align: left; background: #0b2b41; }
.airport-row:hover { background: #144863; }
.airport-row.selected { border-color: #7fe5ff; background: #17546d; }
.airport-symbol { flex: 0 0 24px; text-align: center; font-size: 23px; }
.airport-label { display: grid; gap: 4px; min-width: 0; }
.airport-label strong { overflow-wrap: anywhere; font-size: 13px; }
.airport-label span, .airport-label small { color: #b6d1df; font-size: 11px; }
.locate-label { margin-left: auto; flex-shrink: 0; color: #8fdfff; }
.pagination { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 14px; }
.pagination span { text-align: center; color: #b6d1df; }
</style>
