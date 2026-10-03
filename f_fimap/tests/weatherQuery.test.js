import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope } from 'vue'
import { useWeatherQuery } from '../src/composables/useWeatherQuery.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
test('rapid coordinate changes cancel old requests and reject late responses even when upstream ignores abort', async () => {
  const first = deferred(), second = deferred(), calls = []
  const scope = effectScope()
  const state = scope.run(() => useWeatherQuery((lat, lng, options) => {
    calls.push(options.signal)
    return calls.length === 1 ? first.promise : second.promise
  }))
  const a = state.load()
  state.location.value = { latitude: 51, longitude: 9 }
  assert.ok(calls[0].aborted)
  const b = state.load()
  second.resolve({ id: 'new' }); await b
  first.resolve({ id: 'old' }); await a
  assert.equal(state.payload.value.id, 'new')
  assert.equal(state.loading.value, false)
  scope.stop()
})
test('closing or unmounting while loading leaves no stale forecast or stuck spinner', async () => {
  const response = deferred(), scope = effectScope()
  const state = scope.run(() => useWeatherQuery(() => response.promise))
  const pending = state.load()
  state.invalidate()
  response.resolve({ id: 'late' }); await pending
  assert.equal(state.payload.value, null)
  assert.equal(state.loading.value, false)
  scope.stop()
})
test('invalid input never calls the server and errors allow a successful subsequent query', async () => {
  let calls = 0
  const scope = effectScope()
  const state = scope.run(() => useWeatherQuery(async () => {
    calls++
    if (calls === 1) throw new Error('service unavailable')
    return { id: 'ok' }
  }))
  state.location.value = { latitude: NaN, longitude: 8 }
  await state.load(); assert.equal(calls, 0); assert.ok(state.error.value)
  state.location.value = { latitude: 50, longitude: 8 }
  await state.load(); assert.equal(state.error.value, 'service unavailable'); assert.equal(state.loading.value, false)
  await state.load(); assert.equal(state.payload.value.id, 'ok'); assert.equal(state.error.value, '')
  scope.stop()
})
