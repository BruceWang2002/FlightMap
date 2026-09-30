<template>
  <main class="layout" :style="{ '--sidebar-width': `${sidebarWidth}px` }">
    <aside class="sidebar"><slot name="sidebar" /></aside>
    <div class="resize-handle" role="separator" aria-label="调整侧栏宽度" @pointerdown="startResize" />
    <section class="content"><slot /></section>
  </main>
</template>

<script setup>
import { onUnmounted, ref } from 'vue'

const sidebarWidth = ref(360)
let activePointerId = null
function move(event) {
  if (event.pointerId !== activePointerId) return
  sidebarWidth.value = Math.min(Math.max(event.clientX, 280), Math.min(580, window.innerWidth * .55))
}
function stop(event) {
  if (event.pointerId !== activePointerId) return
  activePointerId = null
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', stop)
}
function startResize(event) {
  activePointerId = event.pointerId
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
}
onUnmounted(() => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) })
</script>

<style scoped>
.layout { height: 100dvh; overflow: hidden; display: grid; grid-template-columns: var(--sidebar-width) 8px minmax(0, 1fr); background: #071725; color: #ecf6ff; }.sidebar { min-height: 0; overflow-y: auto; overscroll-behavior: contain; background: #0b2539; z-index: 2; }.resize-handle { cursor: col-resize; background: #17425e; transition: background .15s; }.resize-handle:hover { background: #41b9ee; }.content { min-width: 0; min-height: 0; overflow: hidden; position: relative; }
@media (max-width: 760px) { .layout { height: 100dvh; grid-template-columns: 1fr; grid-template-rows: minmax(96px, 21dvh) minmax(0, 1fr); }.sidebar { max-height: none; -webkit-overflow-scrolling: touch; }.resize-handle { display: none; }.content { min-height: 0; } }
</style>
