import { onMounted, onUnmounted, ref } from 'vue'
import { flightApi } from '../api/flightApi'

/** Keeps the application state independent from either map implementation. */
export function useFlightData(refreshMs = 30_000) {
  const flights = ref([])
  const airports = ref([])
  const loading = ref(false)
  const airportsLoading = ref(false)
  const error = ref('')
  let timerId
  let airportsLoaded = false
  let disposed = false
  const controller = new AbortController()

  async function refresh() {
    if (loading.value || disposed) return
    loading.value = true
    error.value = ''
    try {
      const tasks = [flightApi.aircraft({ signal: controller.signal }).then(data => { flights.value = data })]
      // Airports are a static local asset, not a dataset to download every 30 seconds.
      if (!airportsLoaded) {
        airportsLoading.value = true
        tasks.push(flightApi.airports({ signal: controller.signal }).then(data => {
          airports.value = data
          airportsLoaded = true
        }).finally(() => { airportsLoading.value = false }))
      }
      const outcomes = await Promise.allSettled(tasks)
      const failed = outcomes.find(item => item.status === 'rejected' && item.reason.name !== 'AbortError')
      if (failed) throw failed.reason
    } catch (cause) {
      if (!disposed) error.value = `${cause.message}。已有数据保留，请检查后端连接。`
    } finally {
      loading.value = false
    }
  }

  onMounted(() => { refresh(); timerId = window.setInterval(refresh, refreshMs) })
  onUnmounted(() => { disposed = true; controller.abort(); window.clearInterval(timerId) })
  return { flights, airports, loading, airportsLoading, error, refresh }
}
