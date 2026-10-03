/** Pure catalogue helpers, shared by the browser and its regression tests. */
const TYPE_ORDER = ['large_airport', 'medium_airport', 'small_airport', 'heliport', 'seaplane_base', 'balloonport', 'closed']

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

export function filterAirports(airports, { query = '', type = '', country = '', sort = 'name' } = {}) {
  const words = normalized(query).trim().split(/\s+/).filter(Boolean)
  return airports.filter(({ properties = {} }) => {
    if (type && properties.type !== type) return false
    if (country && properties.country !== country) return false
    const searchable = normalized([
      properties.name, properties.ident, properties.iata_code, properties.gps_code,
      properties.local_code, properties.municipality, properties.country,
    ].filter(Boolean).join(' '))
    return words.every((word) => searchable.includes(word))
  }).sort((a, b) => {
    if (sort === 'type') {
      const rank = (value) => TYPE_ORDER.includes(value) ? TYPE_ORDER.indexOf(value) : TYPE_ORDER.length
      const difference = rank(a.properties.type) - rank(b.properties.type)
      if (difference) return difference
    }
    return String(a.properties.name || a.properties.ident).localeCompare(String(b.properties.name || b.properties.ident))
      || String(a.properties.ident).localeCompare(String(b.properties.ident))
  })
}

export function paginateAirports(airports, requestedPage = 1, pageSize = 50) {
  const size = Math.max(1, Math.trunc(pageSize) || 50)
  const pageCount = Math.max(1, Math.ceil(airports.length / size))
  const page = Math.max(1, Math.min(Math.trunc(requestedPage) || 1, pageCount))
  return { page, pageCount, items: airports.slice((page - 1) * size, page * size) }
}

export function validAirportPoint(feature) {
  const coordinates = feature.geometry?.coordinates
  return feature.geometry?.type === 'Point' && Array.isArray(coordinates)
    && coordinates.length >= 2 && coordinates.slice(0, 2).every((value) => typeof value === 'number' && Number.isFinite(value))
    && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90
}

export function airportGeoJSON(airports) {
  // Export the complete filtered set, not merely the visible page.
  return { type: 'FeatureCollection', features: airports.filter(validAirportPoint) }
}

export function safeAirportLink(value) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
