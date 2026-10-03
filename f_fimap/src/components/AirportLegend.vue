<template><section class="legend"><p>机场按级别和缩放层级渲染，避免一次绘制全部点位。</p><div v-for="type in AIRPORT_TYPES" :key="type.id" class="row"><i :style="{ background: type.color }">{{ AIRPORT_SYMBOLS[type.id] }}</i>{{ type.label }}<small>2D ≥ {{ type.minZoom }} 级</small></div></section></template>
<script setup>
import { AIRPORT_TYPES } from '../config/mapLayers'
import { AIRPORT_SYMBOLS } from '../config/visualRules'
</script>
<style scoped>.legend { font-size: 12px; color: #aec5d5; }.legend p { margin: 8px 0; line-height: 1.5; }.row { display: flex; align-items: center; gap: 8px; margin: 7px 0; }.row i { display: grid; place-items: center; width: 22px; height: 22px; font-size: 12px; font-style: normal; color: white; border: 1px solid white; border-radius: 50%; box-shadow: 0 0 4px #0008; }.row small { margin-left: auto; color: #7fa0b7; }</style>
