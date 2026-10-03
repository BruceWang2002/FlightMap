import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalysis, haversineKm, distanceToSegment, trackSegments, destination, bearingRadians, summarizeTrack } from '../src/utils/spatialAnalysis.js'

const point = (coordinates, properties = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties })
const flight = point([0, 0], { icao24: 'a', altitude_m: 10000 })
const airports = ['large_airport', 'medium_airport', 'small_airport', 'heliport', 'closed']
  .map((type, index) => point([.01 + index * .01, 0], { ident: type, type }))
const planes = [flight, point([.02, 0], { icao24: 'b', altitude_m: 10500 }), point([2, 0], { icao24: 'c' })]

test('great-circle distances handle invalid coordinates, identical points and the antimeridian', () => {
  assert.equal(haversineKm([0, 0], [0, 0]), 0)
  assert.ok(Math.abs(haversineKm([0, 0], [1, 0]) - 111.195) < .01)
  assert.ok(haversineKm([179.9, 0], [-179.9, 0]) < 23)
  assert.ok(Number.isNaN(haversineKm([Infinity, 0], [0, 0])))
})
for (const mode of ['nearest', 'radius', 'corridor', 'sector']) {
  test(`${mode} queries exclude small airports by default and always exclude other categories`, () => {
    const options = { flight, flights: planes, airports, mode, radiusKm: 20, corridorKm: 10, sectorBearingDeg: 90, track: [point([0, 0]), point([.1, 0])] }
    const result = buildAnalysis(options)
    assert.deepEqual(result.airportResults.map(item => item.feature.properties.type), ['large_airport', 'medium_airport'])
    const small = buildAnalysis({ ...options, includeSmallAirports: true })
    assert.deepEqual(small.airportResults.map(item => item.feature.properties.type), ['large_airport', 'medium_airport', 'small_airport'])
    assert.ok(result.aircraftResults.every(item => item.feature.properties.icao24 !== 'a'))
  })
}
test('nearest query selects one airport per eligible grade rather than three of the same grade', () => {
  const result = buildAnalysis({ flight, airports: [...airports, point([.001, 0], { ident: 'closer', type: 'large_airport' })] })
  assert.deepEqual(result.airportResults.map(item => item.feature.properties.ident), ['closer', 'medium_airport'])
})
test('vertical separation is independent of horizontal distance and unknown heights are not zero', () => {
  const result = buildAnalysis({ flight, flights: planes, mode: 'radius', radiusKm: 300 })
  assert.equal(result.aircraftResults[0].verticalSeparationM, 500)
  assert.equal(result.aircraftResults[1].verticalSeparationM, null)
})
test('radius has a closed GeoJSON boundary and rejects invalid radii', () => {
  const result = buildAnalysis({ flight, mode: 'radius', radiusKm: 50 })
  const ring = result.geometry.features[0].geometry.coordinates[0]
  assert.deepEqual(ring[0], ring.at(-1))
  for (const coordinate of ring) assert.ok(Math.abs(haversineKm([0, 0], coordinate) - 50) < .000001)
  for (const radiusKm of [NaN, -1, 0, 1001]) assert.equal(buildAnalysis({ flight, mode: 'radius', radiusKm }).geometry.features.length, 0)
})
test('track segments split invalid telemetry, reversed time and gaps without bridging them', () => {
  const track = [point([0, 0], { observed_at: '2026-01-01T00:00:00Z' }), point([1, 0], { observed_at: '2026-01-01T00:01:00Z' }),
    point([2, 0], { observed_at: '2026-01-01T01:00:00Z' }), point([3, 0], { observed_at: '2026-01-01T01:01:00Z' }),
    point([NaN, 0]), point([4, 0], { observed_at: '2026-01-01T02:00:00Z' }), point([5, 0], { observed_at: '2026-01-01T01:59:00Z' })]
  assert.deepEqual(trackSegments(track), [[[0, 0], [1, 0]], [[2, 0], [3, 0]]])
})
test('finite segment distance includes endpoints instead of an infinite-line extension', () => {
  assert.ok(Math.abs(distanceToSegment([.5, 1], [0, 0], [1, 0]).distanceKm - 111.195) < .01)
  assert.deepEqual(distanceToSegment([-1, 0], [0, 0], [1, 0]).closestCoordinate, [0, 0])
  assert.deepEqual(distanceToSegment([2, 0], [0, 0], [1, 0]).closestCoordinate, [1, 0])
  assert.equal(distanceToSegment([0, 0], [0, 0], [0, 0]).distanceKm, 0)
})
test('corridor finds targets near the track, not merely near the currently selected aircraft', () => {
  const target = point([1, .01], { ident: 'track-target', type: 'medium_airport' })
  const result = buildAnalysis({ flight, airports: [target], mode: 'corridor', corridorKm: 2, track: [point([.9, 0]), point([1.1, 0])] })
  assert.equal(result.airportResults.length, 1)
  assert.ok(result.airportResults[0].distanceKm < 2)
  assert.ok(Math.abs(result.airportResults[0].closestCoordinate[0] - 1) < .00001)
  assert.deepEqual(result.geometry.features[0].geometry.coordinates[0][0], result.geometry.features[0].geometry.coordinates[0].at(-1))
})
test('corridor does not lose curved polar arcs or candidates across the dateline', () => {
  const start = [-45, 80], end = [45, 80]
  const midpoint = destination(start, bearingRadians(start, end), haversineKm(start, end) / 2)
  for (const [track, target] of [ [[start, end], midpoint], [[[179.9, 0], [179.99, 0]], [-179.99, 0]] ]) {
    const result = buildAnalysis({ flight, mode: 'corridor', corridorKm: 5, track: track.map(p => point(p)), airports: [point(target, { ident: 'x', type: 'large_airport' })] })
    assert.equal(result.airportResults.length, 1)
  }
})
test('unselected flight and absent continuous track return safe empty results with useful feedback', () => {
  assert.equal(buildAnalysis({}).airportResults.length, 0)
  assert.ok(buildAnalysis({ flight, mode: 'corridor', track: [flight] }).warning)
  assert.ok(buildAnalysis({ flight, mode: 'corridor', track: [flight, point([1, 0])], corridorKm: 0 }).warning)
})
test('sector wraps north correctly and excludes objects behind the aircraft', () => {
  const targets = [point([.01, 1], { ident: 'north', type: 'large_airport' }), point([0, -1], { ident: 'south', type: 'large_airport' })]
  const result = buildAnalysis({ flight, airports: targets, mode: 'sector', radiusKm: 200, sectorBearingDeg: 359, sectorAngleDeg: 30 })
  assert.deepEqual(result.airportResults.map(item => item.feature.properties.ident), ['north'])
  const ring = result.geometry.features[0].geometry.coordinates[0]
  assert.deepEqual(ring[0], ring.at(-1))
  assert.ok(buildAnalysis({ flight, mode: 'sector', sectorAngleDeg: NaN }).warning)
})
test('aircraft quality filters apply before nearest selection and preserve a valid alternative', () => {
  const origin = point([0, 0], { icao24: 'a', altitude_m: 10000, observed_at: '2026-10-03T12:00:00Z' })
  const invalid = point([.001, 0], { icao24: 'unknown' })
  const farHeight = point([.002, 0], { icao24: 'high', altitude_m: 15000, observed_at: '2026-10-03T12:00:00Z' })
  const old = point([.003, 0], { icao24: 'old', altitude_m: 10000, observed_at: '2026-10-02T12:00:00Z' })
  const valid = point([.004, 0], { icao24: 'valid', altitude_m: 10000, observed_at: '2026-10-03T12:01:00Z' })
  const result = buildAnalysis({ flight: origin, flights: [origin, invalid, farHeight, old, valid], verticalFilterEnabled: true,
    maxVerticalSeparationM: 500, timeFilterEnabled: true, maxTimeDifferenceSeconds: 120 })
  assert.equal(result.aircraftResults[0].feature.properties.icao24, 'valid')
  assert.equal(result.excludedAircraftCount, 3)
})
test('track summary counts only valid coordinates and continuous segments, not missing intervals', () => {
  const track = [point([0, 0], { observed_at: '2026-10-03T12:00:00Z', altitude_m: 0 }),
    point([.01, 0], { observed_at: '2026-10-03T12:01:00Z', altitude_m: 100 }),
    point([NaN, 0]), point([2, 0], { observed_at: '2026-10-03T15:00:00Z' })]
  const result = summarizeTrack(track)
  assert.equal(result.pointCount, 3)
  assert.equal(result.segmentCount, 1)
  assert.equal(result.durationSeconds, 60)
  assert.ok(result.distanceKm < 2)
  assert.equal(result.minAltitudeM, 0)
  assert.equal(result.maxAltitudeM, 100)
  assert.equal(summarizeTrack([]).minAltitudeM, null)
})
