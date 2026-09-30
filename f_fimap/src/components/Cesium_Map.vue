<template><div ref="container" class="map" /></template>

<script setup>
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ALTITUDE_BANDS, baseLayerById } from '../config/mapLayers'
import { featuresWithinRadius, nearestFeatures } from '../utils/spatialAnalysis'
import aircraftRed from '../assets/aircraft/AircraftRed.gltf?url'
import aircraftBlue from '../assets/aircraft/AircraftBlue.gltf?url'
import aircraftWhite from '../assets/aircraft/AircraftWhite.gltf?url'

const props = defineProps({ flights: { type: Array, required: true }, airports: { type: Array, default: () => [] }, showLabels: Boolean, baseLayerId: { type: String, default: 'osm-hot' }, selectedIcao24: String, analysisEnabled: Boolean, analysisMode: { type: String, default: 'nearest' }, analysisRadiusKm: { type: Number, default: 50 }, showAnalysisResults: { type: Boolean, default: true }, includeSmallAirports: Boolean, showTerrain: { type: Boolean, default: true }, showLighting: { type: Boolean, default: true }, showBuildings: { type: Boolean, default: true } })
const emit = defineEmits(['select', 'clear'])
const container = ref(null)
let viewer
let buildingTileset
let terrainLoaded = false
let worldTerrainProvider

function band(altitude) { return ALTITUDE_BANDS.find((item) => altitude >= item.min && altitude < item.max) ?? ALTITUDE_BANDS[0] }
function modelUrl(altitude) { if (altitude < 3000) return aircraftRed; if (altitude < 9000) return aircraftBlue; return aircraftWhite }
function nearestAnalysisFlights(selectedFlight) {
  if (!selectedFlight || !props.analysisEnabled) return []
  return nearestFeatures(selectedFlight, props.flights.filter((flight) => flight.properties.icao24 !== selectedFlight.properties.icao24), 1).map((item) => item.feature)
}
function updateBaseLayer() {
  if (!viewer) return
  const source = baseLayerById(props.baseLayerId)
  viewer.imageryLayers.removeAll()
  viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({ url: source.cesiumUrl, credit: source.attribution }))
}
async function updateWorldContext() {
  if (!viewer) return
  if (props.showTerrain) {
    if (terrainLoaded) {
      viewer.terrainProvider = worldTerrainProvider
      viewer.scene.globe.enableLighting = props.showLighting
    } else {
      try {
        worldTerrainProvider = await Cesium.createWorldTerrainAsync({ requestVertexNormals: true, requestWaterMask: true })
        viewer.terrainProvider = worldTerrainProvider
        viewer.scene.globe.enableLighting = props.showLighting; terrainLoaded = true
      } catch (error) { console.warn('Cesium World Terrain 未加载；请检查 Cesium ion token 与网络连接。', error) }
    }
  } else {
    viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider()
    viewer.scene.globe.enableLighting = props.showLighting
  }
  if (props.showBuildings) {
    if (buildingTileset) buildingTileset.show = true
    else {
      try { buildingTileset = await Cesium.createOsmBuildingsAsync({ enableShowOutline: false }); viewer.scene.primitives.add(buildingTileset) } catch (error) { console.warn('Cesium OSM Buildings 未加载；请检查 Cesium ion token 与网络连接。', error) }
    }
  } else if (buildingTileset) buildingTileset.show = false
}
function renderAircraft() {
  if (!viewer) return
  viewer.entities.removeAll()
  const selected = props.flights.find((flight) => flight.properties.icao24 === props.selectedIcao24)
  const analysisFlights = nearestAnalysisFlights(selected)
  const analysisIcao24 = new Set(analysisFlights.map((flight) => flight.properties.icao24))
  const visibleFlights = props.selectedIcao24 ? props.flights.filter((flight) => flight.properties.icao24 === props.selectedIcao24 || analysisIcao24.has(flight.properties.icao24)) : props.flights
  visibleFlights.forEach((flight) => {
    const p = flight.properties; const [longitude, latitude] = flight.geometry.coordinates
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, Math.max(p.altitude_m ?? 0, 100))
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(90 - (p.track_deg ?? 0)), 0, 0))
    const entity = viewer.entities.add({
      id: p.icao24, name: p.callsign || p.icao24, position, orientation,
      model: { uri: modelUrl(p.altitude_m ?? 0), minimumPixelSize: p.icao24 === props.selectedIcao24 ? 94 : analysisIcao24.has(p.icao24) ? 72 : 52, maximumScale: 220, scale: .22, runAnimations: false, color: p.icao24 === props.selectedIcao24 ? Cesium.Color.YELLOW : analysisIcao24.has(p.icao24) ? Cesium.Color.CYAN : Cesium.Color.fromCssColorString(band(p.altitude_m ?? 0).color) },
      label: { show: props.showLabels || analysisIcao24.has(p.icao24), text: `${analysisIcao24.has(p.icao24) ? '邻近 · ' : ''}${p.callsign || p.icao24}`, font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -32), fillColor: Cesium.Color.WHITE, showBackground: true, backgroundColor: Cesium.Color.BLACK.withAlpha(.6), scale: .82 },
      description: `<strong>${p.callsign || p.icao24}</strong><br>高度：${Math.round(p.altitude_m ?? 0)} m<br>速度：${Math.round(p.velocity_ms ?? 0)} m/s<br>航向：${Math.round(p.track_deg ?? 0)}°`,
    })
    entity.flightData = flight
    if (p.icao24 === props.selectedIcao24) viewer.selectedEntity = entity
  })
  renderAnalysis()
}
function renderAnalysis() {
  if (!viewer || !props.analysisEnabled || !props.showAnalysisResults || !props.selectedIcao24) return
  const origin = props.flights.find((flight) => flight.properties.icao24 === props.selectedIcao24)
  if (!origin) return
  const [longitude, latitude] = origin.geometry.coordinates
  const otherFlights = props.flights.filter((flight) => flight.properties.icao24 !== props.selectedIcao24)
  const airportCandidates = props.airports.filter((airport) => ['large_airport', 'medium_airport', ...(props.includeSmallAirports ? ['small_airport'] : [])].includes(airport.properties.type))
  const airportResults = props.analysisMode === 'radius'
    ? featuresWithinRadius(origin, airportCandidates, props.analysisRadiusKm)
    : ['large_airport', 'medium_airport', ...(props.includeSmallAirports ? ['small_airport'] : [])].flatMap((type) => nearestFeatures(origin, airportCandidates.filter((airport) => airport.properties.type === type), 1))
  const aircraftResults = props.analysisMode === 'radius' ? featuresWithinRadius(origin, otherFlights, props.analysisRadiusKm) : nearestFeatures(origin, otherFlights, 1)
  if (props.analysisMode === 'radius') viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(longitude, latitude), ellipse: { semiMajorAxis: props.analysisRadiusKm * 1000, semiMinorAxis: props.analysisRadiusKm * 1000, material: Cesium.Color.MEDIUMPURPLE.withAlpha(.24), outline: true, outlineColor: Cesium.Color.MEDIUMPURPLE, height: 40 } })
  airportResults.forEach(({ feature, distanceKm }) => {
    const [lng, lat] = feature.geometry.coordinates
    const originAltitude = Math.max(origin.properties.altitude_m ?? 0, 100)
    viewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(longitude, latitude, originAltitude), Cesium.Cartesian3.fromDegrees(lng, lat, 20)], width: 2, material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.ORANGE, dashLength: 12 }) } })
    viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(lng, lat, 60), point: { pixelSize: 12, color: Cesium.Color.ORANGE, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 }, label: { text: `机场 ${feature.properties.ident}\n${distanceKm.toFixed(1)} km`, font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -18), showBackground: true, backgroundColor: Cesium.Color.BLACK.withAlpha(.7), fillColor: Cesium.Color.WHITE } })
  })
  aircraftResults.forEach(({ feature, distanceKm }) => {
    const [lng, lat] = feature.geometry.coordinates
    const altitude = Math.max(feature.properties.altitude_m ?? 0, 100)
    viewer.entities.add({ polyline: { positions: [Cesium.Cartesian3.fromDegrees(longitude, latitude, Math.max(origin.properties.altitude_m ?? 0, 100)), Cesium.Cartesian3.fromDegrees(lng, lat, altitude)], width: 2, material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.CYAN, dashLength: 10 }) } })
    viewer.entities.add({ position: Cesium.Cartesian3.fromDegrees(lng, lat, altitude), point: { pixelSize: 13, color: Cesium.Color.AQUA, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 }, label: { text: `飞机 ${feature.properties.callsign || feature.properties.icao24}\n${distanceKm.toFixed(1)} km\n航向 ${Math.round(feature.properties.track_deg ?? 0)}°`, font: '12px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -18), showBackground: true, backgroundColor: Cesium.Color.BLACK.withAlpha(.7), fillColor: Cesium.Color.WHITE } })
  })
}
onMounted(() => {
  const ionToken = import.meta.env.VITE_CESIUM_ION_TOKEN
  if (ionToken) Cesium.Ion.defaultAccessToken = ionToken
  viewer = new Cesium.Viewer(container.value, { animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: true, navigationHelpButton: false, baseLayerPicker: false, baseLayer: false, infoBox: true, selectionIndicator: true, shouldAnimate: false })
  viewer.clock.shouldAnimate = false
  viewer.scene.screenSpaceCameraController.inertiaSpin = 0
  viewer.scene.screenSpaceCameraController.inertiaTranslate = 0
  viewer.scene.screenSpaceCameraController.inertiaZoom = 0
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(8.7, 50.4, 3_000_000) })
  // Handle picking ourselves so selection is emitted only once and blank clicks clear it.
  viewer.screenSpaceEventHandler.setInputAction((movement) => {
    if (!viewer || viewer.isDestroyed()) return
    const picked = viewer.scene.pick(movement.position)
    if (picked?.id?.flightData) emit('select', picked.id.flightData)
    else emit('clear')
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  updateBaseLayer(); renderAircraft(); updateWorldContext()
})
onUnmounted(() => { if (viewer && !viewer.isDestroyed()) viewer.destroy() })
watch(() => [props.flights, props.airports, props.selectedIcao24, props.showLabels, props.analysisEnabled, props.analysisMode, props.analysisRadiusKm, props.showAnalysisResults, props.includeSmallAirports], renderAircraft, { deep: true })
watch(() => props.baseLayerId, updateBaseLayer)
watch(() => [props.showTerrain, props.showLighting, props.showBuildings], updateWorldContext)
</script>

<style scoped>.map { width: 100%; height: 100%; min-height: 0; }</style>
