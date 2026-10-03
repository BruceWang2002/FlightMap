<template><div ref="container" class="map" /></template>

<script setup>
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ALTITUDE_BANDS, airportTypeById, baseLayerById } from '../config/mapLayers'
import { haversineKm, trackSegments, validCoordinate } from '../utils/spatialAnalysis'
import { analysisIsVisible, visibleAircraft } from '../utils/mapSelection'
import { AIRPORT_SYMBOLS, MAP_VISUAL } from '../config/visualRules'
import aircraftRed from '../assets/aircraft/AircraftRed.gltf?url'
import aircraftBlue from '../assets/aircraft/AircraftBlue.gltf?url'
import aircraftWhite from '../assets/aircraft/AircraftWhite.gltf?url'

const props = defineProps({
  flights: { type: Array, required: true }, airports: { type: Array, default: () => [] },
  track: { type: Array, default: () => [] }, selectedAirport: Object, airportFocusVersion: Number, selectedIcao24: String,
  showAirports: Boolean, airportTypes: { type: Array, default: () => [] }, showLabels: Boolean,
  baseLayerId: { type: String, default: 'osm-hot' }, analysisResults: Object,
  weatherPoint: Object, weatherLayerId: { type: String, default: 'none' },
  analysisEnabled: Boolean, showAnalysisResults: { type: Boolean, default: true },
  showTerrain: Boolean, showLighting: Boolean, showBuildings: Boolean,
})
const emit = defineEmits(['select', 'select-airport', 'clear', 'weather-status'])
const container = ref(null)
let viewer, buildingTileset, terrainPromise, buildingsPromise, resizeObserver
let disposed = false
let weatherImagery
const sources = {}
const ionAvailable = Boolean(import.meta.env.VITE_CESIUM_ION_TOKEN)
const analysisVisible = () => analysisIsVisible(props)
const cssColor = value => Cesium.Color.fromCssColorString(value)
const flightAltitude = flight => Number.isFinite(flight.properties?.altitude_m) ? flight.properties.altitude_m : 0
const airportAltitude = airport => Number.isFinite(airport.properties?.elevation_ft) ? airport.properties.elevation_ft * .3048 : 0
const position = (point, altitude = 0) => Cesium.Cartesian3.fromDegrees(point[0], point[1], altitude)
const label = text => ({
  text, font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -26),
  fillColor: Cesium.Color.WHITE, showBackground: true,
  backgroundColor: Cesium.Color.BLACK.withAlpha(.7), disableDepthTestDistance: Number.POSITIVE_INFINITY,
})
function band(altitude) {
  return ALTITUDE_BANDS.find(item => altitude >= item.min && altitude < item.max) ?? ALTITUDE_BANDS[0]
}
function modelUrl(altitude) {
  return altitude < 3000 ? aircraftRed : altitude < 9000 ? aircraftBlue : aircraftWhite
}
function updateBaseLayer() {
  if (!viewer || disposed) return
  const source = baseLayerById(props.baseLayerId)
  viewer.imageryLayers.removeAll()
  viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: source.cesiumUrl, credit: source.attribution }))
  weatherImagery = null
  updateWeatherLayer()
}
function updateWeatherLayer() {
  if (!viewer || disposed) return
  if (weatherImagery) viewer.imageryLayers.remove(weatherImagery, true)
  weatherImagery = null
  emit('weather-status', '')
  const key = import.meta.env.VITE_OPENWEATHER_API_KEY
  if (props.weatherLayerId === 'none' || !key) return
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: `https://tile.openweathermap.org/map/${props.weatherLayerId}/{z}/{x}/{y}.png?appid=${key}`, credit: '© OpenWeather',
  })
  const layer = viewer.imageryLayers.addImageryProvider(provider)
  layer.alpha = 1
  weatherImagery = layer
  emit('weather-status', '三维天气图层已启用；瓦片透明像素由数据提供方决定。')
  provider.errorEvent.addEventListener(() => {
    if (!disposed && weatherImagery === layer) emit('weather-status', '三维天气瓦片加载失败，请检查网络及天气 Key。')
  })
}
function renderWeatherPoint() {
  if (!viewer || disposed) return
  sources.weather.entities.removeAll()
  const feature = props.weatherPoint
  if (!feature || !validCoordinate(feature.geometry?.coordinates)) return
  const entity = sources.weather.entities.add({ position: position(feature.geometry.coordinates),
    point: { pixelSize: 15, color: cssColor(MAP_VISUAL.weather), outlineColor: Cesium.Color.WHITE, outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    label: { ...label(feature.properties.label), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND },
  })
  entity.weatherData = feature
}
async function updateWorldContext() {
  if (!viewer || disposed) return
  viewer.scene.globe.enableLighting = props.showLighting
  // Optional ion assets must never block the map or restore a disabled toggle after a slow response.
  if (!props.showTerrain || !ionAvailable) viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
  else {
    terrainPromise ??= Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true })
      .catch(error => { terrainPromise = null; console.warn('世界高程加载失败，保留默认地球。', error); return null })
    const terrain = await terrainPromise
    if (!disposed && terrain && props.showTerrain) viewer.terrainProvider = terrain
  }
  if (disposed) return
  if (buildingTileset) buildingTileset.show = props.showBuildings
  else if (props.showBuildings && ionAvailable) {
    buildingsPromise ??= Cesium.createOsmBuildingsAsync({ enableShowOutline: false }).then(tileset => {
      if (disposed) { tileset.destroy(); return null }
      buildingTileset = viewer.scene.primitives.add(tileset)
      buildingTileset.show = props.showBuildings
      return buildingTileset
    }).catch(error => { buildingsPromise = null; console.warn('OSM 建筑加载失败，其他功能仍可使用。', error); return null })
    await buildingsPromise
  }
}
function renderAircraft() {
  if (!viewer || disposed) return
  sources.aircraft.entities.removeAll()
  viewer.selectedEntity = undefined
  const retained = new Set(analysisVisible() ? props.analysisResults.aircraftResults.map(item => item.feature.properties.icao24) : [])
  visibleAircraft(props)
    .forEach(flight => {
      const p = flight.properties, altitude = flightAltitude(flight)
      const selected = p.icao24 === props.selectedIcao24
      const location = position(flight.geometry.coordinates, altitude)
      const entity = sources.aircraft.entities.add({
        id: p.icao24, position: location,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(location,
          new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(90 - (p.track_deg ?? 0)), 0, 0)),
        model: { uri: modelUrl(altitude), minimumPixelSize: selected ? 90 : retained.has(p.icao24) ? 70 : 52,
          maximumScale: 220, scale: .22, runAnimations: false,
          color: cssColor(selected ? MAP_VISUAL.selected : Number.isFinite(p.altitude_m) ? band(altitude).color : MAP_VISUAL.unknown) },
        label: { ...label(p.callsign || p.icao24), show: props.showLabels || selected || retained.has(p.icao24) },
      })
      entity.flightData = flight
      if (selected) viewer.selectedEntity = entity
    })
}
function airportImage(airport) {
  const symbols = AIRPORT_SYMBOLS
  const selected = airport.properties.ident === props.selectedAirport?.properties.ident
  const color = selected ? MAP_VISUAL.selected : airportTypeById(airport.properties.type).color
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="13" fill="${color}" stroke="white" stroke-width="2"/><text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-size="16" fill="white">${symbols[airport.properties.type] ?? '●'}</text></svg>`)
}
function renderAirports() {
  if (!viewer || disposed) return
  sources.airports.entities.removeAll()
  const resultItems = analysisVisible() ? props.analysisResults.airportResults : []
  const forced = new Map(resultItems.map(item => [item.feature.properties.ident, item.feature]))
  if (props.selectedAirport) forced.set(props.selectedAirport.properties.ident, props.selectedAirport)
  const rectangle = viewer.camera.computeViewRectangle()
  // Approximate Leaflet zoom thresholds by camera height, keeping small airfields off world views.
  const cameraHeight = viewer.camera.positionCartographic.height
  if (props.showAirports && !props.selectedIcao24 && !props.selectedAirport && rectangle) {
    props.airports.forEach(airport => {
      const point = airport.geometry?.coordinates, type = airport.properties.type
      if (!validCoordinate(point) || !props.airportTypes.includes(type)) return
      const maximumHeight = 60_000_000 / 2 ** (airportTypeById(type).minZoom - 1)
      if (cameraHeight > maximumHeight || !Cesium.Rectangle.contains(rectangle, Cesium.Cartographic.fromDegrees(...point.slice(0, 2)))) return
      forced.set(airport.properties.ident, airport)
    })
  }
  forced.forEach(airport => {
    const matched = resultItems.find(item => item.feature.properties.ident === airport.properties.ident)
    const entity = sources.airports.entities.add({
      id: airport.properties.ident, position: position(airport.geometry.coordinates, airportAltitude(airport)),
      billboard: { image: airportImage(airport), width: Math.max(18, airportTypeById(airport.properties.type).radius * 3),
        height: Math.max(18, airportTypeById(airport.properties.type).radius * 3), heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { ...label(`${airport.properties.ident}${matched ? ' · ' + matched.distanceKm.toFixed(1) + ' km' : ''}`),
        show: Boolean(matched) || airport === props.selectedAirport },
    })
    entity.airportData = airport
  })
}
function corridorHeight(coordinate) {
  // Telemetry heights are retained. Missing heights remain a ground projection, not invented data.
  let closest = null, distance = Infinity
  for (const point of props.track) {
    if (!validCoordinate(point.geometry?.coordinates) || !Number.isFinite(point.properties?.altitude_m)) continue
    const delta = haversineKm(coordinate, point.geometry.coordinates)
    if (delta < distance) { distance = delta; closest = point }
  }
  return closest ? flightAltitude(closest) : 0
}
function renderAnalysis() {
  if (!viewer || disposed) return
  sources.analysis.entities.removeAll()
  if (!analysisVisible()) return
  const result = props.analysisResults
  const originPoint = result.origin.geometry.coordinates
  result.geometry.features.forEach(feature => {
    const ring = feature.geometry.coordinates[0]
    sources.analysis.entities.add({ polygon: {
      hierarchy: new Cesium.PolygonHierarchy(ring.slice(0, -1).map(point => position(point))),
      material: cssColor(MAP_VISUAL.queryFill).withAlpha(.16), outline: false,
    } })
  })
  function connection(item, targetHeight, material, width) {
    const from = item.closestCoordinate ?? originPoint
    const fromHeight = item.closestCoordinate ? corridorHeight(from) : flightAltitude(result.origin)
    sources.analysis.entities.add({ polyline: {
      positions: [position(from, fromHeight), position(item.feature.geometry.coordinates, targetHeight)],
      // Straight 3D connections use both endpoints' actual altitude, never a ground-only great circle.
      arcType: Cesium.ArcType.NONE, width, material,
    } })
  }
  result.airportResults.forEach(item => connection(item, airportAltitude(item.feature),
    new Cesium.PolylineDashMaterialProperty({ color: cssColor(MAP_VISUAL.airportLink), dashLength: 12 }), 2))
  result.aircraftResults.forEach(item => connection(item, flightAltitude(item.feature),
    new Cesium.PolylineArrowMaterialProperty(cssColor(MAP_VISUAL.aircraftLink)), 8))
}
function renderTrack() {
  if (!viewer || disposed) return
  sources.track.entities.removeAll()
  const segments = trackSegments(props.track)
  // Coordinates come from the same features, so archived altitude is available without another request.
  const heights = new Map(props.track.map(point => [point.geometry?.coordinates, flightAltitude(point)]))
  segments.forEach(segment => sources.track.entities.add({ polyline: {
    positions: segment.map(point => position(point, heights.get(point) ?? 0)), width: 3,
    arcType: Cesium.ArcType.NONE, material: cssColor(MAP_VISUAL.track),
  } }))
}
function renderAll() { renderAircraft(); renderAirports(); renderAnalysis(); renderTrack() }
function focusAirport(airport) {
  if (viewer && !disposed && airport) viewer.camera.flyTo({ destination: position(airport.geometry.coordinates, 80_000), duration: .5 })
}
onMounted(() => {
  if (ionAvailable) Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN
  viewer = new Cesium.Viewer(container.value, {
    animation: false, timeline: false, geocoder: false, homeButton: false,
    sceneModePicker: true, navigationHelpButton: false, baseLayerPicker: false, baseLayer: false,
    infoBox: false, selectionIndicator: true, shouldAnimate: false,
  })
  viewer.clock.shouldAnimate = false
  const controller = viewer.scene.screenSpaceCameraController
  controller.inertiaSpin = controller.inertiaTranslate = controller.inertiaZoom = 0
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(8.7, 50.4, 3_000_000) })
  for (const name of ['aircraft', 'airports', 'analysis', 'track', 'weather']) {
    sources[name] = new Cesium.CustomDataSource(name)
    viewer.dataSources.add(sources[name])
  }
  viewer.camera.moveEnd.addEventListener(renderAirports)
  viewer.screenSpaceEventHandler.setInputAction(movement => {
    if (disposed) return
    const picked = viewer.scene.pick(movement.position)
    if (picked?.id?.flightData) emit('select', picked.id.flightData)
    else if (picked?.id?.airportData) emit('select-airport', picked.id.airportData)
    else if (picked?.id?.weatherData) return
    else { viewer.selectedEntity = undefined; emit('clear') }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  resizeObserver = new ResizeObserver(() => { if (!disposed) viewer.resize() })
  resizeObserver.observe(container.value)
  updateBaseLayer(); renderAll(); updateWorldContext(); focusAirport(props.selectedAirport); renderWeatherPoint()
})
onUnmounted(() => { disposed = true; resizeObserver?.disconnect(); if (viewer && !viewer.isDestroyed()) viewer.destroy() })
watch(() => [props.flights, props.selectedIcao24, props.showLabels, props.analysisEnabled, props.showAnalysisResults, props.analysisResults], renderAll)
watch(() => [props.airports, props.airportTypes, props.showAirports, props.selectedAirport], renderAirports)
watch(() => [props.selectedAirport, props.airportFocusVersion], ([airport]) => focusAirport(airport))
watch(() => props.track, renderTrack)
watch(() => props.baseLayerId, updateBaseLayer)
watch(() => props.weatherLayerId, updateWeatherLayer)
watch(() => props.weatherPoint, renderWeatherPoint)
watch(() => [props.showTerrain, props.showLighting, props.showBuildings], updateWorldContext)
</script>

<style scoped>
.map { position: relative; z-index: 0; width: 100%; height: 100%; min-height: 0; }
</style>
