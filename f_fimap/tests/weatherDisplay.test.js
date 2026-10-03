import test from 'node:test'
import assert from 'node:assert/strict'
import { weatherAt, weatherFeature, weatherValue } from '../src/utils/weatherDisplay.js'
import { MAP_VISUAL, AIRPORT_SYMBOLS } from '../src/config/visualRules.js'

const payload = { location: { latitude: 50, longitude: 8 }, current: { temperature_2m: 0, wind_speed_10m: 2 },
  hourly: [{ temperature_2m: 8, wind_speed_10m: 5 }], metadata: { stale: true } }
test('forecast slider selects the actual hour and invalid indices never substitute current weather', () => {
  assert.equal(weatherAt(payload, -1), payload.current)
  assert.equal(weatherAt(payload, 0), payload.hourly[0])
  assert.equal(weatherAt(payload, 24), null)
  assert.equal(weatherAt(null, 0), null)
})
test('weather display preserves zero and missing values and gives maps the same timestamped feature', () => {
  assert.equal(weatherValue(0, '°C'), '0 °C')
  assert.equal(weatherValue(null), '未提供')
  const feature = weatherFeature(payload, 0)
  assert.deepEqual(feature.geometry.coordinates, [8, 50])
  assert.ok(feature.properties.label.includes('8 °C'))
  assert.equal(feature.properties.stale, true)
})
test('map semantic rules and airport symbols are unique and shared', () => {
  assert.notEqual(MAP_VISUAL.selected, MAP_VISUAL.aircraftLink)
  assert.notEqual(MAP_VISUAL.queryArea, MAP_VISUAL.weather)
  assert.notEqual(AIRPORT_SYMBOLS.large_airport, AIRPORT_SYMBOLS.medium_airport)
})
