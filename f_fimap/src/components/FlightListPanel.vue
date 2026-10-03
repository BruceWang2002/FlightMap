<template>
  <FloatingPanel ref="floatingPanel" :title="`航班列表（${flights.length}）`" eyebrow="FLIGHT DATA"
    :width="800" :height="460" :mobile-ratio=".44" align="right" @close="$emit('close')" @expanded="revealSelection">
    <table ref="table">
      <thead><tr><th v-for="label in columns" :key="label">{{ label }}</th></tr></thead>
      <tbody>
        <tr v-for="flight in flights" :key="flight.properties.icao24" :data-icao="flight.properties.icao24"
          :class="{ active: selectedIcao24 === flight.properties.icao24 }" tabindex="0"
          @click="$emit('select', flight)" @keydown.enter="$emit('select', flight)">
          <td><b>{{ flight.properties.callsign || '—' }}</b><small>{{ flight.properties.icao24 }}</small></td>
          <td>{{ flight.properties.origin_country || '—' }}</td>
          <td>{{ coordinate(flight) }}</td>
          <td>{{ metric(flight.properties.altitude_m, 'm') }}</td>
          <td>{{ metric(flight.properties.velocity_ms, 'm/s') }}</td>
          <td>{{ metric(flight.properties.track_deg, '°') }}</td>
          <td>{{ metric(flight.properties.vertical_rate_ms, 'm/s') }}</td>
          <td>{{ dateTime(flight.properties.observed_at) }}</td>
        </tr>
        <tr v-if="!flights.length"><td :colspan="columns.length">当前没有航班数据。</td></tr>
      </tbody>
    </table>
  </FloatingPanel>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import FloatingPanel from './FloatingPanel.vue'

defineEmits(['close', 'select'])
const props = defineProps({ flights: { type: Array, default: () => [] }, selectedIcao24: String })
const columns = ['航班 / ICAO24', '国家', '位置', '高度', '速度', '航向', '爬升率', '更新时间']
const floatingPanel = ref(null)
const table = ref(null)

function metric(value, unit) { return value == null ? '—' : `${Math.round(value)} ${unit}` }
function coordinate(flight) { return flight.geometry.coordinates.slice(0, 2).reverse().map(value => value.toFixed(3)).join(', ') }
function dateTime(value) { return value ? new Date(value).toLocaleString() : '—' }
async function revealSelection() {
  await nextTick()
  const row = Array.from(table.value?.querySelectorAll('[data-icao]') ?? [])
    .find(element => element.dataset.icao === props.selectedIcao24)
  floatingPanel.value?.reveal(row)
}
watch(() => [props.selectedIcao24, props.flights], revealSelection, { immediate: true, flush: 'post' })
</script>

<style scoped>
table { width: 100%; min-width: 820px; border-collapse: collapse; font-size: 12px; }
th { position: sticky; top: 0; z-index: 1; padding: 10px; background: #123c56; color: #bfe8f9; text-align: left; white-space: nowrap; }
td { padding: 9px 10px; border-bottom: 1px solid #1e455d; white-space: nowrap; }
tbody tr { cursor: pointer; }
tbody tr:hover, tbody tr:focus-visible { background: #124967; }
tbody tr.active { background: #1f6687; outline: 1px solid #65d8ff; outline-offset: -1px; }
td b, td small { display: block; }
td small { margin-top: 3px; color: #9bbdce; font-family: ui-monospace, monospace; }
</style>
