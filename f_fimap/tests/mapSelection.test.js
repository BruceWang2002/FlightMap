import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleAircraft } from '../src/utils/mapSelection.js'

const flight = icao24 => ({ geometry: { type: 'Point', coordinates: [8, 50] }, properties: { icao24 } })
const flights = ['a', 'b', 'c'].map(flight)
const state = { flights, selectedIcao24: 'a', analysisEnabled: true, showAnalysisResults: true,
  analysisResults: { origin: flights[0], aircraftResults: [{ feature: flights[1] }] } }
const ids = value => visibleAircraft(value).map(item => item.properties.icao24)

test('2D and 3D retain the selected aircraft plus all matched aircraft when analysis is shown', () => {
  assert.deepEqual(ids(state), ['a', 'b'])
  assert.deepEqual(ids({ ...state, analysisResults: { ...state.analysisResults, aircraftResults: flights.slice(1).map(feature => ({ feature })) } }), ['a', 'b', 'c'])
})
test('hiding results or closing analysis restores single-aircraft focus', () => {
  assert.deepEqual(ids({ ...state, analysisEnabled: false }), ['a'])
  assert.deepEqual(ids({ ...state, showAnalysisResults: false }), ['a'])
})
test('clearing selection restores all aircraft and never renders an invalid coordinate', () => {
  const bad = flight('bad'); bad.geometry.coordinates = [NaN, 0]
  assert.deepEqual(ids({ ...state, selectedIcao24: null, flights: [...flights, bad] }), ['a', 'b', 'c'])
})
