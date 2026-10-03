import test from 'node:test'
import assert from 'node:assert/strict'
import { airportGeoJSON, filterAirports, paginateAirports, safeAirportLink } from '../src/utils/airportCatalog.js'

const airport = (ident, properties = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [8, 50] }, properties: { ident, name: ident, ...properties } })
const airports = [
  airport('EDDM', { name: 'München Airport', municipality: 'München', country: 'DE', type: 'large_airport', iata_code: 'MUC', gps_code: 'EDDM' }),
  airport('FR-001', { name: 'Local field', municipality: 'Paris', country: 'FR', type: 'small_airport', local_code: 'LF01' }),
  airport('HELIPORT', { name: 'Paris Heliport', municipality: 'Paris', country: 'FR', type: 'heliport' }),
]

test('search handles accents, multiple words and stored airport codes', () => {
  for (const query of ['munchen de', 'MUC', 'EDDM']) assert.deepEqual(filterAirports(airports, { query }).map((item) => item.properties.ident), ['EDDM'])
  assert.equal(filterAirports(airports, { query: 'LF01' })[0].properties.ident, 'FR-001')
})
test('type and country filters intersect without dropping other catalogue categories', () => {
  assert.equal(filterAirports(airports, { country: 'FR', type: 'heliport' }).length, 1)
  assert.equal(filterAirports(airports, { country: 'DE', type: 'small_airport' }).length, 0)
  assert.equal(filterAirports(airports).length, 3)
})
test('sorting does not reorder the input data consumed by maps', () => {
  const original = [...airports].reverse()
  assert.equal(filterAirports(original, { sort: 'type' })[0].properties.ident, 'EDDM')
  assert.equal(original[0].properties.ident, 'HELIPORT')
})
test('pagination clamps empty lists and pages invalidated by filtering', () => {
  assert.deepEqual(paginateAirports([], 4), { page: 1, pageCount: 1, items: [] })
  const page = paginateAirports(airports, 100, 2)
  assert.equal(page.page, 2)
  assert.deepEqual(page.items, [airports[2]])
})
test('GeoJSON exports all matching features with metadata, skips invalid coordinates', () => {
  const bad = airport('BAD'); bad.geometry.coordinates = [181, 0]
  const payload = airportGeoJSON([...airports, bad])
  assert.equal(payload.type, 'FeatureCollection')
  assert.equal(payload.features.length, 3)
  assert.equal(payload.features[0].properties.gps_code, 'EDDM')
  assert.equal(bad.geometry.coordinates[0], 181)
})
test('external airport links cannot execute scripts or open local resources', () => {
  assert.equal(safeAirportLink('javascript:alert(1)'), null)
  assert.equal(safeAirportLink('file:///C:/test'), null)
  assert.equal(safeAirportLink('not-a-url'), null)
  assert.equal(safeAirportLink('https://example.com/airport'), 'https://example.com/airport')
})
