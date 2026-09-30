<template><div ref="container" class="map" /></template>

<script setup>
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ALTITUDE_BANDS, airportTypeById, baseLayerById } from '../config/mapLayers'
import { featuresWithinRadius, haversineKm, nearestFeatures } from '../utils/spatialAnalysis'

const props = defineProps({
  flights: { type: Array, required: true }, airports: { type: Array, required: true }, track: { type: Array, default: () => [] },
  showAirports: Boolean, showLabels: Boolean, airportTypes: { type: Array, default: () => [] }, baseLayerId: { type: String, default: 'osm-hot' }, weatherLayerId: { type: String, default: 'none' }, selectedIcao24: String,
  analysisEnabled: Boolean, analysisMode: { type: String, default: 'nearest' }, analysisRadiusKm: { type: Number, default: 50 }, showAnalysisResults: { type: Boolean, default: true }, includeSmallAirports: Boolean,
})
const emit = defineEmits(['select', 'clear'])
const container = ref(null)
let map, baseLayer, weatherLayer, aircraftLayer, airportLayer, trackLayer, measureLayer, analysisLayer, overviewMap, overviewBounds
let measuring = false
let measurePoints = []

function altitudeBand(altitude) { return ALTITUDE_BANDS.find((band) => altitude >= band.min && altitude < band.max) ?? ALTITUDE_BANDS[0] }
function aircraftIcon(flight) {
  const p = flight.properties; const selected = p.icao24 === props.selectedIcao24
  const size = Math.min(38, Math.max(23, 23 + Math.round((p.velocity_ms ?? 0) / 28)))
  const color = selected ? '#facc15' : altitudeBand(p.altitude_m).color
  return L.divIcon({ className: 'aircraft-wrapper', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<svg class="aircraft-symbol ${selected ? 'selected' : ''}" viewBox="0 0 32 32" aria-label="飞机" style="width:${size}px;height:${size}px;transform:rotate(${p.track_deg ?? 0}deg);--aircraft-color:${color}"><path d="M16 1 20 12 30 16 30 19 20 18 19 30 16 31 13 18 2 19 2 16 12 12Z" /></svg>` })
}
function directionArrowIcon(trackDeg) {
  // The arrow glyph points east at 0°, while geographic bearings use north at 0°.
  return L.divIcon({ className: 'direction-arrow-wrapper', iconSize: [28, 28], iconAnchor: [14, 14], html: `<span class="direction-arrow" style="transform:rotate(${(trackDeg ?? 0) - 90}deg)">➤</span>` })
}
function bearingDegrees(from, to) {
  const toRadians = (value) => value * Math.PI / 180
  const toDegrees = (value) => value * 180 / Math.PI
  const [fromLng, fromLat] = from; const [toLng, toLat] = to
  const longitudeDelta = toRadians(toLng - fromLng)
  const y = Math.sin(longitudeDelta) * Math.cos(toRadians(toLat))
  const x = Math.cos(toRadians(fromLat)) * Math.sin(toRadians(toLat)) - Math.sin(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.cos(longitudeDelta)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}
function airportIcon(airport) {
  const style = airportTypeById(airport.properties.type)
  const symbols = { large_airport: '✈', medium_airport: '◆', small_airport: '●', heliport: 'H', seaplane_base: '≈', balloonport: '◉', closed: '×' }
  const size = Math.max(18, style.radius * 3)
  return L.divIcon({ className: 'airport-wrapper', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<span class="airport-icon" style="--airport-color:${style.color};width:${size}px;height:${size}px">${symbols[airport.properties.type] ?? '●'}</span>` })
}
function popupHtml(flight) {
  const p = flight.properties; const [longitude, latitude] = flight.geometry.coordinates
  return `<div class="flight-popup"><strong>${p.callsign || p.icao24}</strong><dl><dt>ICAO24</dt><dd>${p.icao24}</dd><dt>高度</dt><dd>${Math.round(p.altitude_m ?? 0)} m</dd><dt>速度</dt><dd>${Math.round(p.velocity_ms ?? 0)} m/s</dd><dt>航向</dt><dd>${Math.round(p.track_deg ?? 0)}°</dd><dt>坐标</dt><dd>${latitude.toFixed(4)}, ${longitude.toFixed(4)}</dd></dl><small>点击图标可加载最近 6 小时轨迹</small></div>`
}
function renderAircraft() {
  if (!aircraftLayer) return
  aircraftLayer.clearLayers()
  const visibleFlights = props.selectedIcao24 ? props.flights.filter((flight) => flight.properties.icao24 === props.selectedIcao24) : props.flights
  visibleFlights.forEach((flight) => {
    const [longitude, latitude] = flight.geometry.coordinates
    const marker = L.marker([latitude, longitude], { icon: aircraftIcon(flight), keyboard: true }).bindPopup(popupHtml(flight))
    if (props.showLabels) marker.bindTooltip(flight.properties.callsign || flight.properties.icao24, { direction: 'bottom', offset: [0, 12], className: 'flight-label' })
    marker.on('click', () => emit('select', flight))
    marker.addTo(aircraftLayer)
  })
}
function renderAirports() {
  if (!airportLayer) return
  airportLayer.clearLayers()
  // Once a flight is selected, analysis results own the airport layer so the map stays focused.
  if (!props.showAirports || props.selectedIcao24) return
  const bounds = map.getBounds()
  props.airports.forEach((airport) => {
    const [longitude, latitude] = airport.geometry.coordinates; const p = airport.properties
    const style = airportTypeById(p.type)
    if (!bounds.contains([latitude, longitude]) || !props.airportTypes.includes(p.type) || map.getZoom() < style.minZoom) return
    const elevation = p.elevation_ft == null ? '' : `<br>海拔：${Math.round(p.elevation_ft)} ft`
    const iata = p.iata_code ? ` · IATA: ${p.iata_code}` : ''
    L.marker([latitude, longitude], { icon: airportIcon(airport), keyboard: true }).bindPopup(`<strong>${p.name}</strong><br>${p.ident}${iata} · ${p.country || '—'}<br>${p.municipality || ''}${elevation}`).addTo(airportLayer)
  })
}
function renderAnalysis() {
  if (!analysisLayer) return
  analysisLayer.clearLayers()
  if (!props.analysisEnabled || !props.showAnalysisResults || !props.selectedIcao24) return
  const origin = props.flights.find((flight) => flight.properties.icao24 === props.selectedIcao24)
  if (!origin) return
  const [longitude, latitude] = origin.geometry.coordinates
  const others = props.flights.filter((flight) => flight.properties.icao24 !== props.selectedIcao24)
  const airportCandidates = props.airports.filter((airport) => ['large_airport', 'medium_airport', ...(props.includeSmallAirports ? ['small_airport'] : [])].includes(airport.properties.type))
  const airportResults = props.analysisMode === 'radius'
    ? featuresWithinRadius(origin, airportCandidates, props.analysisRadiusKm)
    : ['large_airport', 'medium_airport', ...(props.includeSmallAirports ? ['small_airport'] : [])].flatMap((type) => nearestFeatures(origin, airportCandidates.filter((airport) => airport.properties.type === type), 1))
  const aircraftResults = props.analysisMode === 'radius' ? featuresWithinRadius(origin, others, props.analysisRadiusKm) : nearestFeatures(origin, others, 1)
  if (props.analysisMode === 'radius') L.circle([latitude, longitude], { radius: props.analysisRadiusKm * 1000, color: '#a855f7', weight: 2, fillColor: '#c084fc', fillOpacity: .16 }).bindTooltip(`分析半径：${props.analysisRadiusKm} km`, { permanent: false }).addTo(analysisLayer)
  airportResults.forEach(({ feature, distanceKm }) => {
    const [lng, lat] = feature.geometry.coordinates
    L.polyline([[latitude, longitude], [lat, lng]], { color: '#f59e0b', weight: 2, opacity: .9, dashArray: '7 7' }).addTo(analysisLayer)
    L.marker([lat, lng], { icon: airportIcon(feature), zIndexOffset: 900 }).bindTooltip(`分析机场：${feature.properties.ident} · ${distanceKm.toFixed(1)} km`, { permanent: false }).addTo(analysisLayer)
  })
  aircraftResults.forEach(({ feature, distanceKm }) => {
    const [lng, lat] = feature.geometry.coordinates
    L.polyline([[latitude, longitude], [lat, lng]], { color: '#22d3ee', weight: 2, opacity: .8, dashArray: '4 8' }).addTo(analysisLayer)
    L.marker([lat, lng], { icon: aircraftIcon(feature), zIndexOffset: 1000 }).bindTooltip(`分析飞机：${feature.properties.callsign || feature.properties.icao24} · ${distanceKm.toFixed(1)} km`, { permanent: false }).addTo(analysisLayer)
    const midpoint = [(latitude + lat) / 2, (longitude + lng) / 2]
    L.marker(midpoint, { icon: directionArrowIcon(bearingDegrees([longitude, latitude], [lng, lat])), interactive: false, zIndexOffset: 1100 }).addTo(analysisLayer)
  })
}
function renderTrack() {
  if (!trackLayer) return
  trackLayer.clearLayers()
  const points = props.track.map((item) => [item.geometry.coordinates[1], item.geometry.coordinates[0]])
  if (!points.length) return
  L.polyline(points, { color: '#0ea5e9', weight: 3, opacity: .85, dashArray: '7 6' }).addTo(trackLayer)
  props.track.forEach((item, index) => {
    if (index % 10 !== 0 && index !== props.track.length - 1) return
    const [longitude, latitude] = item.geometry.coordinates
    L.circleMarker([latitude, longitude], { radius: 3, color: '#e0f2fe', weight: 1, fillColor: '#0284c7', fillOpacity: 1 }).bindTooltip(new Date(item.properties.observed_at).toLocaleString()).addTo(trackLayer)
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
  if (props.weatherLayerId !== 'none' && key) weatherLayer = L.tileLayer(`https://tile.openweathermap.org/map/${props.weatherLayerId}/{z}/{x}/{y}.png?appid=${key}`, { opacity: 1, attribution: '© OpenWeather' }).addTo(map)
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
    expand.addEventListener('click', () => { panel.classList.toggle('expanded'); expand.textContent = panel.classList.contains('expanded') ? '收起' : '展开'; setTimeout(() => overviewMap.invalidateSize(), 50) })
    visibility.addEventListener('click', () => { panel.classList.toggle('minimized'); visibility.textContent = panel.classList.contains('minimized') ? '显示' : '隐藏' })
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
        else await container.value?.requestFullscreen()
        setTimeout(() => map.invalidateSize(), 150)
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
onMounted(() => {
  map = L.map(container.value, { zoomControl: false, preferCanvas: true }).setView([50.4, 8.7], 5)
  L.control.zoom({ position: 'topleft' }).addTo(map)
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)
  const initialSource = baseLayerById(props.baseLayerId)
  const initialOptions = { maxZoom: 19, attribution: initialSource.attribution }
  if (initialSource.subdomains) initialOptions.subdomains = initialSource.subdomains
  baseLayer = L.tileLayer(initialSource.url, initialOptions).addTo(map)
  aircraftLayer = L.layerGroup().addTo(map); airportLayer = L.layerGroup().addTo(map); trackLayer = L.layerGroup().addTo(map); measureLayer = L.layerGroup().addTo(map); analysisLayer = L.layerGroup().addTo(map)
  setupMeasureControl()
  setupOverviewControl()
  setupNavigationControl()
  setupCoordinateControl()
  map.on('zoomend moveend', renderAirports)
  renderAircraft(); renderAirports(); renderTrack(); renderAnalysis(); updateWeatherLayer()
})
onUnmounted(() => { overviewMap?.remove(); map?.remove() })
watch(() => [props.flights, props.selectedIcao24, props.showLabels], () => { renderAircraft(); renderAirports(); renderAnalysis(); focusSelectedFlight() }, { deep: true })
watch(() => [props.airports, props.showAirports, props.airportTypes], renderAirports, { deep: true })
watch(() => props.track, renderTrack, { deep: true })
watch(() => [props.analysisEnabled, props.analysisMode, props.analysisRadiusKm, props.showAnalysisResults, props.includeSmallAirports], renderAnalysis)
watch(() => props.baseLayerId, updateBaseLayer)
watch(() => props.weatherLayerId, updateWeatherLayer)
</script>

<style scoped>.map { width: 100%; height: 100%; min-height: 0; }</style>
<style>.aircraft-wrapper,.airport-wrapper,.direction-arrow-wrapper { background: transparent; border: 0; }.aircraft-symbol { display: block; transform-origin: 50% 50%; }.aircraft-symbol path { fill: var(--aircraft-color); stroke: #082f49; stroke-width: 1.3; stroke-linejoin: round; filter: drop-shadow(0 1px 2px #001018b3); }.aircraft-symbol.selected { filter: drop-shadow(0 0 7px #facc15); }.aircraft-symbol.selected path { stroke: #fff7b0; stroke-width: 2.4; }.direction-arrow { display: block; color: #22d3ee; font-size: 23px; line-height: 28px; text-shadow: 0 1px 3px #001018; transform-origin: 50% 50%; }.airport-icon { display: grid; place-items: center; box-sizing: border-box; border: 2px solid #fff; border-radius: 50%; background: var(--airport-color); color: white; font-size: 12px; font-weight: 800; line-height: 1; box-shadow: 0 1px 4px #0009; }.flight-label { border: 0; border-radius: 3px; padding: 2px 5px; background: #0b2133dc; color: #e8f8ff; box-shadow: none; font-weight: 600; }.flight-label::before { display: none; }.flight-popup dl { display: grid; grid-template-columns: 52px 1fr; gap: 3px 8px; margin: 7px 0; }.flight-popup dt { color: #557; }.flight-popup dd { margin: 0; }.measure-control button,.navigation-control button { display: block; width: 42px; height: 31px; border: 0; border-bottom: 1px solid #ccc; background: #fff; color: #123; font-size: 16px; cursor: pointer; }.measure-control button:last-child,.navigation-control button:last-child { border-bottom: 0; }.measure-control button.active { background: #f43f5e; color: white; }.measure-distance { border: 0; background: #111d; color: white; font-weight: 700; box-shadow: none; }.overview-control { box-sizing: border-box; width: 170px; padding: 5px; border: 2px solid #fff; border-radius: 4px; background: #fff; box-shadow: 0 1px 5px #0008; transition: width .15s; }.overview-control.expanded { width: 270px; }.overview-control.minimized { width: auto; }.overview-control.minimized .overview-map,.overview-control.minimized .overview-actions button:not(.overview-toggle) { display:none; }.overview-title { display: flex; justify-content: space-between; align-items: center; padding: 1px 2px 4px; color: #1d4155; font-size: 10px; font-weight: 700; }.overview-actions { display: flex; gap: 2px; }.overview-actions button { min-width: 20px; height: 18px; border: 1px solid #8daabd; border-radius: 2px; padding: 0 4px; background: #fff; color: #173449; font-size: 11px; cursor: pointer; }.overview-map { width: 156px; height: 96px; transition: width .15s,height .15s; }.overview-control.expanded .overview-map { width: 256px; height: 170px; }.coordinate-control { padding: 4px 7px; border: 1px solid #8daabd; border-radius: 3px; background: #fffffd; color: #173449; font: 11px/1.2 ui-monospace, monospace; box-shadow: 0 1px 4px #0005; }</style>
