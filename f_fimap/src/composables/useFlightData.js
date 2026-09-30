import { onMounted, onUnmounted, ref } from 'vue'
import { flightApi } from '../api/flightApi'

/** Keeps the application state independent from either map implementation. */
export function useFlightData(refreshMs = 30_000) {
  const flights = ref([])
  const airports = ref([])
  const loading = ref(false)
  const error = ref('')
  let timerId

  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      const [nextFlights, nextAirports] = await Promise.all([flightApi.aircraft(), flightApi.airports()])
      flights.value = nextFlights
      airports.value = nextAirports
    } catch (cause) {
      error.value = `${cause.message}。请确认 Django 后端正在运行。`
    } finally {
      loading.value = false
    }
  }

  onMounted(() => { refresh(); timerId = window.setInterval(refresh, refreshMs) })
  onUnmounted(() => window.clearInterval(timerId))
  return { flights, airports, loading, error, refresh }
}
