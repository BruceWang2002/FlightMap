export function weatherAt(payload, hourIndex) {
  if (!payload) return null
  return hourIndex < 0 ? payload.current : payload.hourly?.[hourIndex] ?? null
}
export function weatherValue(value, unit = '') {
  return Number.isFinite(value) ? `${Number(value.toFixed(1))}${unit ? ' ' + unit : ''}` : '未提供'
}
export function weatherFeature(payload, hourIndex) {
  const data = weatherAt(payload, hourIndex)
  if (!data || !payload.location) return null
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [payload.location.longitude, payload.location.latitude] },
    properties: { ...data, stale: Boolean(payload.metadata?.stale), source: 'Open-Meteo',
      label: `${hourIndex < 0 ? '当前地面天气' : '地面预报'} · ${weatherValue(data.temperature_2m, '°C')} · 风 ${weatherValue(data.wind_speed_10m, 'm/s')}` } }
}
