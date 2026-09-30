<template>
  <section class="legend">
    <h2>飞机高度图例</h2>
    <div v-for="band in ALTITUDE_BANDS" :key="band.label" class="legend-row"><i :style="{ background: band.color }" />{{ band.label }}</div>
    <p>图标朝向代表航向；图标大小随速度变化。</p>
  </section>
</template>

<script setup>
import { ALTITUDE_BANDS } from '../config/mapLayers'
</script>

<style scoped>.legend { border-top: 1px solid #28516b; margin-top: 18px; padding-top: 14px; font-size: 12px; color: #aec5d5; }.legend h2 { font-size: 14px; color: #ecf6ff; margin: 0 0 8px; }.legend-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }.legend i { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 5px #0008; }.legend p { margin: 10px 0 0; line-height: 1.5; }</style>
