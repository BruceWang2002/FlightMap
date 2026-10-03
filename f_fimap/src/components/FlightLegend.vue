<template>
  <section class="legend">
    <h2>飞机高度图例</h2>
    <div v-for="band in ALTITUDE_BANDS" :key="band.label" class="legend-row"><i :style="{ background: band.color }" />{{ band.label }}</div>
    <p>图标朝向代表航向；图标大小随速度变化。</p>
    <div v-for="item in semanticLegend" :key="item.label" class="legend-row"><i :style="{ background: item.color }" />{{ item.label }}</div>
  </section>
</template>

<script setup>
import { ALTITUDE_BANDS } from '../config/mapLayers'
import { MAP_VISUAL } from '../config/visualRules'
const semanticLegend = [
  { label: '选中对象（金色高亮）', color: MAP_VISUAL.selected },
  { label: '高度未知（不当作零高度）', color: MAP_VISUAL.unknown },
  { label: '飞机关系（箭头）', color: MAP_VISUAL.aircraftLink },
  { label: '机场关系（虚线）', color: MAP_VISUAL.airportLink },
  { label: '查询范围（半透明区域）', color: MAP_VISUAL.queryArea },
  { label: '地面天气查询点', color: MAP_VISUAL.weather },
]
</script>

<style scoped>.legend { border-top: 1px solid #28516b; margin-top: 18px; padding-top: 14px; font-size: 12px; color: #aec5d5; }.legend h2 { font-size: 14px; color: #ecf6ff; margin: 0 0 8px; }.legend-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }.legend i { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 5px #0008; }.legend p { margin: 10px 0 0; line-height: 1.5; }</style>
