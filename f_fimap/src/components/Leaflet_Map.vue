<template><div ref="container" class="map" /></template>

<script setup>
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ALTITUDE_BANDS, airportTypeById, baseLayerById } from '../config/mapLayers'
import { haversineKm, trackSegments, validCoordinate } from '../utils/spatialAnalysis'
import { analysisIsVisible, visibleAircraft } from '../utils/mapSelection'
import { AIRPORT_SYMBOLS, MAP_VISUAL } from '../config/visualRules'

const props = defineProps({
  flights: { type: Array, required: true }, airports: { type: Array, required: true }, track: { type: Array, default: () => [] },
  showAirports: Boolean, showLabels: Boolean, airportTypes: { type: Array, default: () => [] }, baseLayerId: { type: String, default: 'osm-hot' }, weatherLayerId: { type: String, default: 'none' }, selectedIcao24: String,
  selectedAirport: Object, airportFocusVersion: Number, analysisResults: Object, weatherPoint: Object,
  analysisEnabled: Boolean, showAnalysisResults: { type: Boolean, default: true },
})
const emit = defineEmits(['select', 'select-airport', 'clear', 'weather-status'])
const container = ref(null)
let map, baseLayer, weatherLayer, aircraftLayer, airportLayer, trackLayer, measureLayer, analysisLayer, overviewMap, overviewBounds
let resizeObserver
let weatherPointLayer
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const analysisVisible = () => analysisIsVisible(props)
let measuring = false
let measurePoints = []

function altitudeBand(altitude) { if (!Number.isFinite(altitude)) return { color: MAP_VISUAL.unknown }; return ALTITUDE_BANDS.find((band) => altitude >= band.min && altitude < band.max) ?? ALTITUDE_BANDS[0] }
function aircraftIcon(flight) {
  const p = flight.properties; const selected = p.icao24 === props.selectedIcao24
  const size = Math.min(38, Math.max(23, 23 + Math.round((p.velocity_ms ?? 0) / 28)))
  const color = selected ? MAP_VISUAL.selected : altitudeBand(p.altitude_m).color
  return L.divIcon({ className: 'aircraft-wrapper', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<svg class="aircraft-symbol ${selected ? 'selected' : ''}" viewBox="0 0 32 32" aria-label="飞机" style="width:${size}px;height:${size}px;transform:rotate(${p.track_deg ?? 0}deg);--aircraft-color:${color}"><path d="M16 1 20 12 30 16 30 19 20 18 19 30 16 31 13 18 2 19 2 16 12 12Z" /></svg>` })
}
function directionArrowIcon(angle) {
  return L.divIcon({ className: 'direction-arrow-wrapper', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<span class="direction-arrow" style="transform:rotate(${angle}deg)">➤</span>` })
}
function airportIcon(airport) {
  const style = airportTypeById(airport.properties.type)
  const symbols = AIRPORT_SYMBOLS
  const size = Math.max(18, style.radius * 3)
  const selected = airport.properties.ident === props.selectedAirport?.properties.ident
  return L.divIcon({ className: 'airport-wrapper', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<span class="airport-icon ${selected ? 'selected-airport' : ''}" style="--airport-color:${style.color};width:${size}px;height:${size}px">${symbols[airport.properties.type] ?? '●'}</span>` })
}
function popupHtml(flight) {
  const p = flight.properties; const [longitude, latitude] = flight.geometry.coordinates
  return `<div class="flight-popup"><strong>${escapeHtml(p.callsign || p.icao24)}</strong><dl><dt>ICAO24</dt><dd>${escapeHtml(p.icao24)}</dd><dt>高度</dt><dd>${Math.round(p.altitude_m ?? 0)} m</dd><dt>速度</dt><dd>${Math.round(p.velocity_ms ?? 0)} m/s</dd><dt>航向</dt><dd>${Math.round(p.track_deg ?? 0)}°</dd><dt>坐标</dt><dd>${latitude.toFixed(4)}, ${longitude.toFixed(4)}</dd></dl><small>点击图标可加载最近 6 小时轨迹</small></div>`
}
function renderAircraft() {
  if (!aircraftLayer) return
  aircraftLayer.clearLayers()
  const retained = new Set(analysisVisible() ? props.analysisResults.aircraftResults.map(item => item.feature.properties.icao24) : [])
  visibleAircraft(props)
    .forEach(flight => {
      const [lng, lat] = flight.geometry.coordinates
      const marker = L.marker([lat, lng], { icon: aircraftIcon(flight), keyboard: true }).bindPopup(popupHtml(flight))
      if (props.showLabels || retained.has(flight.properties.icao24)) marker.bindTooltip(
        escapeHtml(flight.properties.callsign || flight.properties.icao24), { direction: 'bottom', offset: [0, 12], className: 'flight-label' })
      marker.on('click', () => emit('select', flight)).addTo(aircraftLayer)
    })
}
function renderAirports() {
  if (!airportLayer) return
  airportLayer.clearLayers()
  const forced = new Map(analysisVisible() ? props.analysisResults.airportResults.map(item => [item.feature.properties.ident, item.feature]) : [])
  if (props.selectedAirport) forced.set(props.selectedAirport.properties.ident, props.selectedAirport)
  const bounds = map.getBounds()
  if (props.showAirports && !props.selectedIcao24 && !props.selectedAirport) {
    props.airports.forEach(airport => {
      const point = airport.geometry?.coordinates
      if (!validCoordinate(point)) return
      const p = airport.properties
      if (bounds.contains([point[1], point[0]]) && props.airportTypes.includes(p.type)
        && map.getZoom() >= airportTypeById(p.type).minZoom) forced.set(p.ident, airport)
    })
  }
  forced.forEach(airport => {
    const [lng, lat] = airport.geometry.coordinates
    const p = airport.properties
    L.marker([lat, lng], { icon: airportIcon(airport), keyboard: true, zIndexOffset: 900 })
      .bindTooltip(escapeHtml(`${p.name} · ${p.ident}`))
      .on('click', () => emit('select-airport', airport)).addTo(airportLayer)
  })
}
function renderAnalysis() {
  if (!analysisLayer) return
  analysisLayer.clearLayers()
  if (!analysisVisible()) return
  const result = props.analysisResults
  const origin = result.origin.geometry.coordinates
  L.geoJSON(result.geometry, { style: { color: MAP_VISUAL.queryArea, weight: 1, fillColor: MAP_VISUAL.queryFill, fillOpacity: .16 }, interactive: false }).addTo(analysisLayer)
  result.airportResults.forEach(({ feature, closestCoordinate, distanceKm }) => {
    const from = closestCoordinate ?? origin, to = feature.geometry.coordinates
    L.polyline([[from[1], from[0]], [to[1], to[0]]], { color: MAP_VISUAL.airportLink, weight: 2, dashArray: '7 7', bubblingMouseEvents: false })
      .bindTooltip(`距机场 ${distanceKm.toFixed(1)} km`).addTo(analysisLayer)
  })
  result.aircraftResults.forEach(({ feature, closestCoordinate, distanceKm, verticalSeparationM }) => {
    const from = closestCoordinate ?? origin, to = feature.geometry.coordinates
    const a = map.latLngToLayerPoint([from[1], from[0]]), b = map.latLngToLayerPoint([to[1], to[0]])
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
    L.polyline([[from[1], from[0]], [to[1], to[0]]], { color: MAP_VISUAL.aircraftLink, weight: 2, bubblingMouseEvents: false })
      .bindTooltip(`水平 ${distanceKm.toFixed(1)} km · 高度差 ${verticalSeparationM == null ? '未知' : Math.round(verticalSeparationM) + ' m'}`).addTo(analysisLayer)
    if (a.distanceTo(b) > 1) L.marker(map.layerPointToLatLng(a.add(b).divideBy(2)), {
      icon: directionArrowIcon(angle), interactive: false, zIndexOffset: 1100,
    }).addTo(analysisLayer)
  })
}
function renderTrack() {
  if (!trackLayer) return
  trackLayer.clearLayers()
  for (const segment of trackSegments(props.track)) {
    L.polyline(segment.map(([lng, lat]) => [lat, lng]), { color: MAP_VISUAL.track, weight: 3, opacity: .85, dashArray: '7 6' }).addTo(trackLayer)
  }
  props.track.forEach((item, index) => {
    if (!validCoordinate(item.geometry?.coordinates) || (index % 10 !== 0 && index !== props.track.length - 1)) return
    const [lng, lat] = item.geometry.coordinates
    L.circleMarker([lat, lng], { radius: 3, color: '#e0f2fe', weight: 1, fillColor: '#0284c7', fillOpacity: 1 })
      .bindTooltip(escapeHtml(item.properties.observed_at ? new Date(item.properties.observed_at).toLocaleString() : '时间未知')).addTo(trackLayer)
  })
}
function updateBaseLayer() {
  if (!map) return
  if (baseLayer) map.removeLayer(baseLayer)
  const source = baseLayerById(props.baseLayerId)
  const options = { maxZoom: 19, attribution: source.attribution }
  if (source.subdomains) options.subdomains = source.subdomains
  baseLayer = L.tileLayer(source.url, options)
  baseLayer.addTo(map).bringToBack()
}
function updateWeatherLayer() {
  if (!map) return
  if (weatherLayer) { map.removeLayer(weatherLayer); weatherLayer = null }
  const key = import.meta.env.VITE_OPENWEATHER_API_KEY
  emit('weather-status', '')
  if (props.weatherLayerId !== 'none' && key) {
    let failed = false
    const layer = L.tileLayer(`https://tile.openweathermap.org/map/${props.weatherLayerId}/{z}/{x}/{y}.png?appid=${key}`, { opacity: 1, attribution: '© OpenWeather' })
    weatherLayer = layer
    layer.on('tileerror', () => { failed = true; if (weatherLayer === layer && map) emit('weather-status', '部分天气瓦片加载失败：请检查网络及 OpenWeatherMap Key；位置天气可独立使用。') })
    layer.on('tileload', () => { if (!failed && weatherLayer === layer && map) emit('weather-status', '天气图层已加载（不额外设置透明度）。') })
    layer.addTo(map)
  }
}
function renderWeatherPoint() {
  if (!weatherPointLayer) return
  weatherPointLayer.clearLayers()
  const feature = props.weatherPoint
  if (!feature || !validCoordinate(feature.geometry?.coordinates)) return
  const [lng, lat] = feature.geometry.coordinates
  L.circleMarker([lat, lng], { radius: 9, color: '#ffffff', weight: 2, fillColor: MAP_VISUAL.weather, fillOpacity: 1, bubblingMouseEvents: false })
    .bindTooltip(escapeHtml(feature.properties.label), { permanent: true, direction: 'top' }).addTo(weatherPointLayer)
}
function renderMeasurement() {
  measureLayer.clearLayers()
  if (!measurePoints.length) return
  measurePoints.forEach((point) => L.circleMarker(point, { radius: 4, color: '#fff', weight: 1, fillColor: '#f43f5e', fillOpacity: 1 }).addTo(measureLayer))
  if (measurePoints.length < 2) return
  L.polyline(measurePoints, { color: '#f43f5e', weight: 3 }).addTo(measureLayer)
  const distanceKm = measurePoints.slice(1).reduce((total, point, index) => total + haversineKm([measurePoints[index][1], measurePoints[index][0]], [point[1], point[0]]), 0)
  L.tooltip({ permanent: true, direction: 'top', offset: [0, -5], className: 'measure-distance' }).setLatLng(measurePoints.at(-1)).setContent(`测距：${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(2)} km`}`).addTo(measureLayer)
}
function setupMeasureControl() {
  const control = L.control({ position: 'topright' })
  control.onAdd = () => {
    const panel = L.DomUtil.create('div', 'leaflet-bar measure-control')
    const toggle = L.DomUtil.create('button', '', panel); toggle.type = 'button'; toggle.title = '点击开始测距；再次点击关闭并清除'; toggle.setAttribute('aria-label', '测距'); toggle.textContent = '📏'
    L.DomEvent.disableClickPropagation(panel)
    toggle.addEventListener('click', () => { measuring = !measuring; if (!measuring) { measurePoints = []; renderMeasurement() }; toggle.classList.toggle('active', measuring) })
    return panel
  }
  control.addTo(map)
  map.on('click', (event) => {
    if (!measuring) { emit('clear'); return }
    measurePoints.push([event.latlng.lat, event.latlng.lng]); renderMeasurement()
  })
}
function setupOverviewControl() {
  const control = L.control({ position: 'bottomright' })
  control.onAdd = () => {
    const panel = L.DomUtil.create('div', 'overview-control')
    const title = L.DomUtil.create('div', 'overview-title', panel)
    const label = L.DomUtil.create('span', '', title); label.textContent = '鹰眼地图'
    const actions = L.DomUtil.create('span', 'overview-actions', title)
    const zoomOut = L.DomUtil.create('button', '', actions); zoomOut.type = 'button'; zoomOut.textContent = '−'; zoomOut.title = '缩小鹰眼'
    const zoomIn = L.DomUtil.create('button', '', actions); zoomIn.type = 'button'; zoomIn.textContent = '+'; zoomIn.title = '放大鹰眼'
    const expand = L.DomUtil.create('button', '', actions); expand.type = 'button'; expand.textContent = '展开'; expand.title = '展开或收起鹰眼地图'
    const visibility = L.DomUtil.create('button', 'overview-toggle', actions); visibility.type = 'button'; visibility.textContent = '隐藏'; visibility.title = '隐藏或显示鹰眼地图'
    const target = L.DomUtil.create('div', 'overview-map', panel)
    L.DomEvent.disableClickPropagation(panel)
    L.DomEvent.disableScrollPropagation(panel)
    overviewMap = L.map(target, { attributionControl: false, zoomControl: false, dragging: true, scrollWheelZoom: true, doubleClickZoom: true, boxZoom: false, keyboard: false }).setView(map.getCenter(), Math.max(1, map.getZoom() - 4))
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { subdomains: 'abc', maxZoom: 19 }).addTo(overviewMap)
    overviewBounds = L.rectangle(map.getBounds(), { color: '#38bdf8', weight: 1, fillOpacity: .08 }).addTo(overviewMap)
    zoomOut.addEventListener('click', () => overviewMap.zoomOut())
    zoomIn.addEventListener('click', () => overviewMap.zoomIn())
    expand.addEventListener('click', () => { panel.classList.toggle('expanded'); expand.textContent = panel.classList.contains('expanded') ? '收起' : '展开'; setTimeout(() => overviewMap?.invalidateSize(), 50) })
    visibility.addEventListener('click', () => {
      panel.classList.toggle('minimized')
      visibility.textContent = panel.classList.contains('minimized') ? '显示' : '隐藏'
      if (!panel.classList.contains('minimized')) overviewMap.invalidateSize()
    })
    overviewMap.on('click', (event) => map.setView(event.latlng, Math.max(map.getZoom(), overviewMap.getZoom() + 3)))
    return panel
  }
  control.addTo(map)
  map.on('moveend', () => {
    if (!overviewMap || !overviewBounds) return
    overviewMap.setView(map.getCenter(), Math.max(1, map.getZoom() - 4), { animate: false })
    overviewBounds.setBounds(map.getBounds())
  })
}
function setupNavigationControl() {
  const control = L.control({ position: 'topleft' })
  control.onAdd = () => {
    const panel = L.DomUtil.create('div', 'leaflet-bar navigation-control')
    const home = L.DomUtil.create('button', '', panel); home.type = 'button'; home.title = '返回欧洲初始视图'; home.textContent = '⌂'
    const fullscreen = L.DomUtil.create('button', '', panel); fullscreen.type = 'button'; fullscreen.title = '切换全屏地图'; fullscreen.textContent = '⛶'
    L.DomEvent.disableClickPropagation(panel)
    home.addEventListener('click', () => map.setView([50.4, 8.7], 5, { animate: true }))
    fullscreen.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen()
        else await container.value?.parentElement?.requestFullscreen()
        setTimeout(() => map?.invalidateSize(), 150)
      } catch { /* Fullscreen can be blocked by an embedded browser; the map remains usable. */ }
    })
    return panel
  }
  control.addTo(map)
}
function setupCoordinateControl() {
  const control = L.control({ position: 'bottomleft' })
  control.onAdd = () => {
    const panel = L.DomUtil.create('div', 'coordinate-control')
    panel.textContent = '经纬度：移动鼠标查看'
    map.on('mousemove', (event) => { panel.textContent = `纬度 ${event.latlng.lat.toFixed(4)} · 经度 ${event.latlng.lng.toFixed(4)}` })
    return panel
  }
  control.addTo(map)
}
function focusSelectedFlight() {
  if (!map || !props.selectedIcao24) return
  const flight = props.flights.find((item) => item.properties.icao24 === props.selectedIcao24)
  if (flight) map.flyTo([flight.geometry.coordinates[1], flight.geometry.coordinates[0]], Math.max(map.getZoom(), 7), { duration: .45 })
}
function focusAirport(airport) {
  if (map && airport) map.flyTo([airport.geometry.coordinates[1], airport.geometry.coordinates[0]], Math.max(map.getZoom(), 10), { duration: .45 })
}
onMounted(() => {
  map = L.map(container.value, { zoomControl: false, preferCanvas: true }).setView([50.4, 8.7], 5)
  L.control.zoom({ position: 'topleft' }).addTo(map)
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)
  const initialSource = baseLayerById(props.baseLayerId)
  const initialOptions = { maxZoom: 19, attribution: initialSource.attribution }
  if (initialSource.subdomains) initialOptions.subdomains = initialSource.subdomains
  baseLayer = L.tileLayer(initialSource.url, initialOptions).addTo(map)
  aircraftLayer = L.layerGroup().addTo(map); airportLayer = L.layerGroup().addTo(map); trackLayer = L.layerGroup().addTo(map); measureLayer = L.layerGroup().addTo(map); analysisLayer = L.layerGroup().addTo(map)
  weatherPointLayer = L.layerGroup().addTo(map)
  setupMeasureControl()
  setupOverviewControl()
  setupNavigationControl()
  setupCoordinateControl()
  map.on('zoomend moveend', () => { renderAirports(); renderAnalysis() })
  resizeObserver = new ResizeObserver(() => map?.invalidateSize())
  resizeObserver.observe(container.value)
  focusSelectedFlight()
  focusAirport(props.selectedAirport)
  renderAircraft(); renderAirports(); renderTrack(); renderAnalysis(); updateWeatherLayer(); renderWeatherPoint()
})
onUnmounted(() => { resizeObserver?.disconnect(); overviewMap?.remove(); overviewMap = null; map?.remove(); map = null })
watch(() => [props.flights, props.selectedIcao24, props.showLabels, props.analysisEnabled, props.showAnalysisResults, props.analysisResults], () => {
  renderAircraft(); renderAirports(); renderAnalysis()
})
watch(() => props.selectedIcao24, focusSelectedFlight)
watch(() => [props.selectedAirport, props.airportFocusVersion], ([airport]) => {
  renderAirports()
  focusAirport(airport)
})
watch(() => [props.airports, props.showAirports, props.airportTypes], renderAirports)
watch(() => props.track, renderTrack)
watch(() => props.baseLayerId, updateBaseLayer)
watch(() => props.weatherLayerId, updateWeatherLayer)
watch(() => props.weatherPoint, renderWeatherPoint)
</script>

<style scoped>.map { position: relative; z-index: 0; width: 100%; height: 100%; min-height: 0; }</style>
<style>.aircraft-wrapper,.airport-wrapper,.direction-arrow-wrapper { background: transparent; border: 0; }
.aircraft-symbol { display: block; transform-origin: 50% 50%; }
.aircraft-symbol path { fill: var(--aircraft-color); stroke: #082f49; stroke-width: 1.3; stroke-linejoin: round; filter: drop-shadow(0 1px 2px #001018b3); }
.aircraft-symbol.selected { filter: drop-shadow(0 0 7px #facc15); }
.aircraft-symbol.selected path { stroke: #fff7b0; stroke-width: 2.4; }
.direction-arrow { display: block; color: #22d3ee; font-size: 23px; line-height: 28px; text-shadow: 0 1px 3px #001018; transform-origin: 50% 50%; }
.airport-icon { display: grid; place-items: center; box-sizing: border-box; border: 2px solid #fff; border-radius: 50%; background: var(--airport-color); color: white; font-size: 12px; font-weight: 800; line-height: 1; box-shadow: 0 1px 4px #0009; }
.flight-label { border: 0; border-radius: 3px; padding: 2px 5px; background: #0b2133dc; color: #e8f8ff; box-shadow: none; font-weight: 600; }
.flight-label::before { display: none; }
.flight-popup dl { display: grid; grid-template-columns: 52px 1fr; gap: 3px 8px; margin: 7px 0; }
.flight-popup dt { color: #557; }
.flight-popup dd { margin: 0; }
.measure-control button,.navigation-control button { display: block; width: 42px; height: 31px; border: 0; border-bottom: 1px solid #ccc; background: #fff; color: #123; font-size: 16px; cursor: pointer; }
.measure-control button:last-child,.navigation-control button:last-child { border-bottom: 0; }
.measure-control button.active { background: #f43f5e; color: white; }
.measure-distance { border: 0; background: #111d; color: white; font-weight: 700; box-shadow: none; }
.overview-control { box-sizing: border-box; width: 170px; padding: 5px; border: 2px solid #fff; border-radius: 4px; background: #fff; box-shadow: 0 1px 5px #0008; transition: width .15s; }
.overview-control.expanded { width: 270px; }
.overview-control.minimized { width: auto; }
.overview-control.minimized .overview-map,.overview-control.minimized .overview-actions button:not(.overview-toggle) { display:none; }
.overview-title { display: flex; justify-content: space-between; align-items: center; padding: 1px 2px 4px; color: #1d4155; font-size: 10px; font-weight: 700; }
.overview-actions { display: flex; gap: 2px; }
.overview-actions button { min-width: 20px; height: 18px; border: 1px solid #8daabd; border-radius: 2px; padding: 0 4px; background: #fff; color: #173449; font-size: 11px; cursor: pointer; }
.overview-map { width: 156px; height: 96px; transition: width .15s,height .15s; }
.overview-control.expanded .overview-map { width: 256px; height: 170px; }
.coordinate-control { padding: 4px 7px; border: 1px solid #8daabd; border-radius: 3px; background: #fffffd; color: #173449; font: 11px/1.2 ui-monospace, monospace; box-shadow: 0 1px 4px #0005; }</style>
<style>
.selected-airport { outline: 3px solid #facc15; box-shadow: 0 0 12px #facc15; }
@media (max-width: 760px) {
  .overview-control { transform: scale(.8); transform-origin: bottom right; }
.coordinate-control { max-width: 210px; font-size: 9px; }
}
</style>
