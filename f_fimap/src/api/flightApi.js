// Development uses Vite's /api proxy.  Render injects VITE_API_ROOT when the
// static site is built, so the deployed UI can call its separate API service.
const API_ROOT = (import.meta.env.VITE_API_ROOT || '/api/v1').replace(/\/$/, '')

async function requestFeatures(path) {
  const response = await fetch(`${API_ROOT}${path}`)
  if (!response.ok) throw new Error(`接口请求失败（${response.status}）`)
  const payload = await response.json()
  return payload.features ?? []
}

export const flightApi = {
  aircraft: () => requestFeatures('/aircraft/?limit=1000'),
  airports: () => requestFeatures('/airports/?limit=12000'),
  track: (icao24, hours = 6) => requestFeatures(`/aircraft/${icao24}/track/?hours=${hours}&limit=600`),
}
