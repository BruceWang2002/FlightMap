import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { flightApi } from '../api/flightApi.js'

/** Cancellation and stale-response protection are independently testable without a map. */
export function useWeatherQuery(fetchForecast = flightApi.weather) {
  const location = ref({ latitude: 50.4, longitude: 8.7 })
  const payload = ref(null)
  const loading = ref(false)
  const error = ref('')
  const hourIndex = ref(-1)
  let controller, version = 0

  function invalidate() {
    ++version
    controller?.abort()
    payload.value = null; loading.value = false; error.value = ''; hourIndex.value = -1
  }
  async function load() {
    invalidate()
    const { latitude, longitude } = location.value
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      error.value = '请输入有效经纬度。'; return
    }
    const requestVersion = version
    controller = new AbortController()
    loading.value = true
    try {
      const next = await fetchForecast(latitude, longitude, { signal: controller.signal })
      if (requestVersion === version) payload.value = next
    } catch (cause) {
      if (requestVersion === version && cause.name !== 'AbortError') error.value = cause.message || '天气查询失败。'
    } finally { if (requestVersion === version) loading.value = false }
  }
  watch(location, invalidate, { flush: 'sync' })
  if (getCurrentScope()) onScopeDispose(invalidate)
  return { location, payload, loading, error, hourIndex, load, invalidate }
}
