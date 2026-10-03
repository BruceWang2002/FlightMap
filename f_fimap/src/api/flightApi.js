// Development uses Vite's /api proxy.  Render injects VITE_API_ROOT when the
// static site is built, so the deployed UI can call its separate API service.
const API_ROOT = (import.meta.env?.VITE_API_ROOT || '/api/v1').replace(/\/$/, '')

async function requestFeatures(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, options)
  if (!response.ok) throw new Error(`接口请求失败（${response.status}）`)
  const payload = await response.json()
  return payload.features ?? []
}

export const flightApi = {
  weather: async (latitude, longitude, options = {}) => {
    const response = await fetch(`${API_ROOT}/weather/?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`, options)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.detail || `天气查询失败（${response.status}）`)
    return payload
  },
  aircraft: (options) => requestFeatures('/aircraft/?limit=1000', options),
  airports: (options) => requestFeatures('/airports/?limit=15000', options),
  track: (icao24, hours = 6, options) => requestFeatures(`/aircraft/${encodeURIComponent(icao24)}/track/?hours=${hours}&limit=600&reference=latest`, options),
}
