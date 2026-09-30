<template>
  <section v-if="flight" class="analysis">
    <p class="description">基于当前已加载坐标即时计算，不产生额外 API 请求。</p>
    <h3>最近机场</h3>
    <ol><li v-for="item in nearestAirports" :key="item.feature.properties.ident"><span>{{ item.feature.properties.ident }} · {{ item.feature.properties.name }}</span><b>{{ formatDistance(item.distanceKm) }}</b></li></ol>
    <h3>最近飞机</h3>
    <ol><li v-for="item in nearestAircraft" :key="item.feature.properties.icao24"><span>{{ item.feature.properties.callsign || item.feature.properties.icao24 }}</span><b>{{ formatDistance(item.distanceKm) }}</b></li></ol>
    <p v-if="!nearestAircraft.length" class="description">当前范围内没有其他有效航班位置。</p>
  </section>
  <p v-else class="description">选择一架飞机后显示其附近机场和最近飞机。</p>
</template>

<script setup>
import { computed } from 'vue'
import { nearestFeatures } from '../utils/spatialAnalysis'

const props = defineProps({ flight: Object, flights: { type: Array, default: () => [] }, airports: { type: Array, default: () => [] } })
const nearestAirports = computed(() => nearestFeatures(props.flight, props.airports))
const nearestAircraft = computed(() => nearestFeatures(props.flight, props.flights.filter((item) => item.properties.icao24 !== props.flight?.properties.icao24), 1))
function formatDistance(distanceKm) { return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km` }
</script>

<style scoped>.analysis { font-size: 12px; }.description { margin: 8px 0; color: #9bb7ca; line-height: 1.5; }.analysis h3 { margin: 13px 0 5px; font-size: 12px; color: #eaf7ff; }.analysis ol { margin: 0; padding: 0; list-style: none; }.analysis li { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid #23465e; }.analysis li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.analysis b { color: #67d5ff; white-space: nowrap; }</style>
