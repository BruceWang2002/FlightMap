<template>
  <FloatingPanel title="位置天气" eyebrow="SURFACE WEATHER" :width="420" :height="570" :mobile-ratio=".48" align="right" @close="$emit('close')">
    <div class="tool-content">
      <p class="hint">{{ targetName || '自定义位置' }} · 无需 Key 的地面模型天气，不代表飞机飞行高度的天气。</p>
      <div class="coordinates">
        <label>纬度<input :value="location.latitude" type="number" min="-90" max="90" step=".0001" @change="updateLocation('latitude', $event.target.value)"></label>
        <label>经度<input :value="location.longitude" type="number" min="-180" max="180" step=".0001" @change="updateLocation('longitude', $event.target.value)"></label>
      </div>
      <button type="button" :disabled="loading" @click="$emit('refresh')">{{ loading ? '正在查询…' : '查询 / 刷新此位置天气' }}</button>
      <p v-if="error" class="warning" role="alert">{{ error }}</p>
      <label class="check"><input :checked="showMarker" type="checkbox" @change="$emit('update:show-marker', $event.target.checked)">在二维 / 三维地图显示天气标记</label>
      <template v-if="payload">
        <p v-if="payload.metadata.stale" class="warning">服务暂不可用，正在显示旧缓存，请核对获取时间。</p>
        <label>预报时刻：{{ hourIndex < 0 ? '当前' : time(sample?.time) }}
          <input :value="hourIndex" type="range" min="-1" :max="payload.hourly.length - 1" step="1" @input="$emit('update:hour-index', Number($event.target.value))">
        </label>
        <p class="hint">天气有效时间：{{ time(sample?.time) }}</p>
        <dl>
          <template v-for="item in metrics" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></template>
        </dl>
        <h3>逐小时预报</h3>
        <table><thead><tr><th>本地时间</th><th>温度 °C</th><th>风 m/s</th><th>降水 mm</th></tr></thead>
          <tbody><tr v-for="(row, index) in payload.hourly" :key="row.time" :class="{ selected: index === hourIndex }" tabindex="0"
            @click="$emit('update:hour-index', index)" @keydown.enter="$emit('update:hour-index', index)">
            <td>{{ time(row.time) }}</td><td>{{ weatherValue(row.temperature_2m) }}</td><td>{{ weatherValue(row.wind_speed_10m) }}</td><td>{{ weatherValue(row.precipitation) }}</td>
          </tr></tbody></table>
        <p class="hint">获取时间：{{ time(payload.metadata.fetched_at) }} · {{ payload.metadata.cached ? '缓存' : '新查询' }}。天气网格位置可能与查询点略有差异。</p>
      </template>
      <p v-else-if="!loading" class="hint">选择地图上的飞机或机场，再打开本面板；也可以直接输入经纬度查询。</p>
      <p class="hint">来源：<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>（CC BY 4.0）。预报来自模型，不是机场 METAR 或航空危险天气通报。免费服务适用于非商业使用。</p>
    </div>
  </FloatingPanel>
</template>

<script setup>
import { computed } from 'vue'
import FloatingPanel from './FloatingPanel.vue'
import { weatherAt, weatherValue } from '../utils/weatherDisplay'
const emit = defineEmits(['close', 'refresh', 'update:location', 'update:hour-index', 'update:show-marker'])
const props = defineProps({ location: { type: Object, required: true }, targetName: String,
  payload: Object, loading: Boolean, error: String, hourIndex: { type: Number, default: -1 }, showMarker: Boolean })
const sample = computed(() => weatherAt(props.payload, props.hourIndex))
const time = value => value ? new Date(value).toLocaleString() : '未提供'
function updateLocation(key, value) {
  emit('update:location', { ...props.location, [key]: value === '' ? NaN : Number(value) })
}
const metrics = computed(() => {
  const data = sample.value ?? {}
  return [ ['2 m 温度', 'temperature_2m', '°C'], ['10 m 风速', 'wind_speed_10m', 'm/s'],
    ['风向（风的来向）', 'wind_direction_10m', '°'], ['10 m 阵风', 'wind_gusts_10m', 'm/s'],
    ['降水量', 'precipitation', 'mm'], ['降水概率', 'precipitation_probability', '%'],
    ['云量', 'cloud_cover', '%'], ['能见度', 'visibility', 'm'], ['海平面气压', 'pressure_msl', 'hPa'],
    ['2 m 相对湿度', 'relative_humidity_2m', '%'] ].map(([label, key, unit]) => ({ label, value: weatherValue(data[key], unit) }))
})
</script>

<style scoped>
.coordinates { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.check { margin-top: 14px; }
dl { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
dt { color: var(--text-muted); } dd { margin: 0; color: var(--text-primary); }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background: var(--surface-input); } td, th { text-align: left; padding: 8px 4px; border-bottom: 1px solid var(--border); }
tbody tr { cursor: pointer; } tr.selected { background: #1f6687; }
a { color: var(--accent); }
</style>
