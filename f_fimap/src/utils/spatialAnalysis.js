/** Shared analysis engine. Distances are horizontal great-circle kilometres. */
const EARTH_RADIUS_KM = 6371.0088
const radians = value => value * Math.PI / 180
const degrees = value => value * 180 / Math.PI
const clamp = value => Math.max(-1, Math.min(1, value))
const wrapLongitude = value => ((value + 540) % 360) - 180

export function validCoordinate(point) {
  return Array.isArray(point) && point.length >= 2
    && point.slice(0, 2).every(value => typeof value === 'number' && Number.isFinite(value))
    && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
}
const coordinateOf = feature => feature?.geometry?.type === 'Point' && validCoordinate(feature.geometry.coordinates)
  ? feature.geometry.coordinates : null

export function haversineKm(first, second) {
  if (!validCoordinate(first) || !validCoordinate(second)) return NaN
  const deltaLat = radians(second[1] - first[1])
  const deltaLng = radians(second[0] - first[0])
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(first[1])) * Math.cos(radians(second[1])) * Math.sin(deltaLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))))
}
export function bearingRadians(first, second) {
  const latA = radians(first[1]), latB = radians(second[1])
  const delta = radians(second[0] - first[0])
  return Math.atan2(Math.sin(delta) * Math.cos(latB),
    Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(delta))
}
export function destination(origin, bearing, distanceKm) {
  const latitude = radians(origin[1]), longitude = radians(origin[0])
  const angular = distanceKm / EARTH_RADIUS_KM
  const nextLatitude = Math.asin(clamp(Math.sin(latitude) * Math.cos(angular)
    + Math.cos(latitude) * Math.sin(angular) * Math.cos(bearing)))
  const nextLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(latitude),
    Math.cos(angular) - Math.sin(latitude) * Math.sin(nextLatitude))
  return [wrapLongitude(degrees(nextLongitude)), degrees(nextLatitude)]
}
export function nearestFeatures(origin, candidates, count = 3) {
  const position = coordinateOf(origin)
  if (!position) return []
  return candidates.filter(candidate => coordinateOf(candidate))
    .map(feature => ({ feature, distanceKm: haversineKm(position, feature.geometry.coordinates) }))
    .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, Math.max(0, count))
}
export function featuresWithinRadius(origin, candidates, radiusKm) {
  if (!Number.isFinite(radiusKm) || radiusKm < 0) return []
  return nearestFeatures(origin, candidates, candidates.length).filter(item => item.distanceKm <= radiusKm)
}

/** Reject invalid points, and never bridge missing telemetry longer than 15 minutes. */
export function trackSegments(track, maxGapMs = 15 * 60 * 1000) {
  const segments = []
  let current = []
  let previousTime = null
  function finish() { if (current.length >= 2) segments.push(current); current = []; previousTime = null }
  for (const feature of track) {
    const point = coordinateOf(feature)
    const timestamp = Date.parse(feature?.properties?.observed_at)
    if (!point) { finish(); continue }
    if (previousTime != null && Number.isFinite(timestamp)
      && (timestamp <= previousTime || timestamp - previousTime > maxGapMs)) finish()
    current.push(point)
    previousTime = Number.isFinite(timestamp) ? timestamp : null
  }
  finish()
  return segments
}

/** Closest point on a finite great-circle segment, including both endpoints. */
export function distanceToSegment(point, first, last) {
  const length = haversineKm(first, last)
  if (!Number.isFinite(length) || !validCoordinate(point)) return null
  const fromFirst = haversineKm(first, point)
  if (length < .000001) return { distanceKm: fromFirst, closestCoordinate: first }
  const direction = bearingRadians(first, last)
  const relativeBearing = bearingRadians(first, point) - direction
  const angularDistance = fromFirst / EARTH_RADIUS_KM
  const along = Math.atan2(Math.sin(angularDistance) * Math.cos(relativeBearing), Math.cos(angularDistance))
  if (along <= 0) return { distanceKm: fromFirst, closestCoordinate: first }
  if (along * EARTH_RADIUS_KM >= length) return { distanceKm: haversineKm(last, point), closestCoordinate: last }
  const cross = Math.asin(clamp(Math.sin(angularDistance) * Math.sin(relativeBearing)))
  return { distanceKm: Math.abs(cross) * EARTH_RADIUS_KM,
    closestCoordinate: destination(first, direction, along * EARTH_RADIUS_KM) }
}
function corridorMatches(candidates, segments, distanceKm) {
  const results = []
  // Bounding rectangles discard distant candidates before the segment calculations.
  const rectangles = segments.map(segment => {
    const minLat = Math.min(...segment.map(p => p[1])), maxLat = Math.max(...segment.map(p => p[1]))
    // Every point on an arc is within half its length of an endpoint. Include that
    // margin so curved polar arcs cannot be discarded by an endpoint-only rectangle.
    const longestArc = Math.max(...segment.slice(1).map((point, index) => haversineKm(segment[index], point)))
    const margin = distanceKm + longestArc / 2
    const latPadding = margin / 110
    const highestLatitude = Math.min(90, Math.max(Math.abs(minLat), Math.abs(maxLat)) + latPadding)
    const lngPadding = margin / (110 * Math.max(.001, Math.cos(radians(highestLatitude))))
    return { minLat: minLat - latPadding, maxLat: maxLat + latPadding,
      minLng: Math.min(...segment.map(p => p[0])) - lngPadding, maxLng: Math.max(...segment.map(p => p[0])) + lngPadding }
  })
  for (const feature of candidates) {
    const point = coordinateOf(feature)
    if (!point) continue
    let nearest = null
    segments.forEach((segment, index) => {
      const rectangle = rectangles[index]
      if (point[1] < rectangle.minLat || point[1] > rectangle.maxLat) return
      // When a segment crosses the antimeridian, skip the longitude prefilter.
      if (rectangle.minLng >= -180 && rectangle.maxLng <= 180
        && rectangle.maxLng - rectangle.minLng < 180
        && (point[0] < rectangle.minLng || point[0] > rectangle.maxLng)) return
      for (let i = 1; i < segment.length; i++) {
        const result = distanceToSegment(point, segment[i - 1], segment[i])
        if (result && (!nearest || result.distanceKm < nearest.distanceKm)) nearest = result
      }
    })
    if (nearest && nearest.distanceKm <= distanceKm) results.push({ feature, ...nearest })
  }
  return results.sort((a, b) => a.distanceKm - b.distanceKm)
}
function circleFeature(origin, radiusKm) {
  const ring = Array.from({ length: 65 }, (_, index) => destination(origin, index / 64 * Math.PI * 2, radiusKm))
  ring[ring.length - 1] = ring[0]
  return { type: 'Feature', properties: { kind: 'radius' }, geometry: { type: 'Polygon', coordinates: [ring] } }
}
function sectorFeature(origin, radiusKm, bearingDeg, angleDeg) {
  const ring = [origin, ...Array.from({ length: 33 }, (_, index) => destination(origin,
    radians(bearingDeg - angleDeg / 2 + index * angleDeg / 32), radiusKm)), origin]
  return { type: 'Feature', properties: { kind: 'sector' }, geometry: { type: 'Polygon', coordinates: [ring] } }
}
export function summarizeTrack(track) {
  const points = track.filter(item => coordinateOf(item))
  const segments = trackSegments(track)
  const times = points.map(item => Date.parse(item.properties?.observed_at)).filter(Number.isFinite)
  const altitudes = points.map(item => item.properties?.altitude_m).filter(Number.isFinite)
  const timeByCoordinate = new Map(points.map(item => [item.geometry.coordinates, Date.parse(item.properties?.observed_at)]))
  let distanceKm = 0, durationSeconds = 0
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      distanceKm += haversineKm(segment[i - 1], segment[i])
      const delta = timeByCoordinate.get(segment[i]) - timeByCoordinate.get(segment[i - 1])
      if (Number.isFinite(delta) && delta > 0) durationSeconds += delta / 1000
    }
  }
  return { pointCount: points.length, segmentCount: segments.length, distanceKm, durationSeconds,
    startTime: times.length ? new Date(Math.min(...times)).toISOString() : null,
    endTime: times.length ? new Date(Math.max(...times)).toISOString() : null,
    minAltitudeM: altitudes.length ? Math.min(...altitudes) : null,
    maxAltitudeM: altitudes.length ? Math.max(...altitudes) : null }
}
function corridorGeometry(segments, radiusKm) {
  // Each short arc gets a capsule. Polygons overlap at bends; queries use spherical
  // segment distances rather than this deliberately coarser display geometry.
  return segments.flatMap(segment => segment.slice(1).map((end, index) => {
    const start = segment[index], heading = bearingRadians(start, end)
    const endHeading = bearingRadians(end, start) + Math.PI
    const ring = []
    for (let step = 0; step <= 8; step++) ring.push(destination(end, endHeading - Math.PI / 2 + step * Math.PI / 8, radiusKm))
    for (let step = 0; step <= 8; step++) ring.push(destination(start, heading + Math.PI / 2 + step * Math.PI / 8, radiusKm))
    ring.push(ring[0])
    return { type: 'Feature', properties: { kind: 'corridor' }, geometry: { type: 'Polygon', coordinates: [ring] } }
  }))
}

/** One result feeds the panel and both map renderers, preserving identical filters. */
export function buildAnalysis({ flight, flights = [], airports = [], track = [], mode = 'nearest',
  radiusKm = 50, includeSmallAirports = false, corridorKm = 10,
  sectorBearingDeg = null, sectorAngleDeg = 90, verticalFilterEnabled = false,
  maxVerticalSeparationM = 1000, timeFilterEnabled = false, maxTimeDifferenceSeconds = 300 }) {
  const result = { mode, origin: flight ?? null, airportResults: [], aircraftResults: [],
    geometry: { type: 'FeatureCollection', features: [] }, trackSegments: trackSegments(track),
    trackSummary: summarizeTrack(track), excludedAircraftCount: 0, warning: null }
  if (!coordinateOf(flight)) return result
  const types = ['large_airport', 'medium_airport', ...(includeSmallAirports ? ['small_airport'] : [])]
  const candidates = airports.filter(airport => types.includes(airport.properties?.type))
  const altitude = flight.properties?.altitude_m
  const originTime = Date.parse(flight.properties?.observed_at)
  const allOthers = flights.filter(item => item.properties?.icao24 !== flight.properties?.icao24)
  const others = allOthers.filter(item => {
    if (verticalFilterEnabled && (!Number.isFinite(altitude) || !Number.isFinite(item.properties?.altitude_m)
      || !Number.isFinite(maxVerticalSeparationM) || maxVerticalSeparationM < 0
      || Math.abs(altitude - item.properties.altitude_m) > maxVerticalSeparationM)) return false
    const timestamp = Date.parse(item.properties?.observed_at)
    if (timeFilterEnabled && (!Number.isFinite(originTime) || !Number.isFinite(timestamp)
      || !Number.isFinite(maxTimeDifferenceSeconds) || maxTimeDifferenceSeconds < 0
      || Math.abs(originTime - timestamp) / 1000 > maxTimeDifferenceSeconds)) return false
    return true
  })
  result.excludedAircraftCount = allOthers.length - others.length
  if (mode === 'corridor') {
    if (!result.trackSegments.length) {
      result.warning = '本地归档中没有连续的有效轨迹段，无法进行走廊查询。'
      return result
    }
    if (!Number.isFinite(corridorKm) || corridorKm <= 0 || corridorKm > 100) {
      result.warning = '走廊单侧宽度应为 1–100 km。'
      return result
    }
    result.airportResults = corridorMatches(candidates, result.trackSegments, corridorKm)
    result.aircraftResults = corridorMatches(others, result.trackSegments, corridorKm)
    result.geometry.features = corridorGeometry(result.trackSegments, corridorKm)
  } else if (mode === 'radius' || mode === 'sector') {
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 1000) return result
    result.airportResults = featuresWithinRadius(flight, candidates, radiusKm)
    result.aircraftResults = featuresWithinRadius(flight, others, radiusKm)
    if (mode === 'sector') {
      const heading = Number.isFinite(sectorBearingDeg) ? sectorBearingDeg : flight.properties?.track_deg
      if (!Number.isFinite(heading) || !Number.isFinite(sectorAngleDeg) || sectorAngleDeg <= 0 || sectorAngleDeg > 360) {
        result.airportResults = []; result.aircraftResults = []
        result.warning = '请设置有效的扇区中心方向和张角。'
        return result
      }
      const inSector = item => item.distanceKm < .000001 || Math.abs(((degrees(bearingRadians(flight.geometry.coordinates,
        item.feature.geometry.coordinates)) - heading + 540) % 360) - 180) <= sectorAngleDeg / 2 + .000001
      result.airportResults = result.airportResults.filter(inSector)
      result.aircraftResults = result.aircraftResults.filter(inSector)
      result.geometry.features = [sectorFeature(flight.geometry.coordinates, radiusKm, heading, sectorAngleDeg)]
    } else result.geometry.features = [circleFeature(flight.geometry.coordinates, radiusKm)]
  } else {
    result.airportResults = types.flatMap(type => nearestFeatures(flight, candidates.filter(item => item.properties.type === type), 1))
    result.aircraftResults = nearestFeatures(flight, others, 1)
  }
  result.aircraftResults = result.aircraftResults.map(item => ({ ...item,
    verticalSeparationM: Number.isFinite(altitude) && Number.isFinite(item.feature.properties?.altitude_m)
      ? Math.abs(altitude - item.feature.properties.altitude_m) : null }))
  return result
}
