/** Shared map-source definitions. Keep provider URLs in one auditable place. */
export const BASE_LAYERS = [
  { id: 'osm', label: 'OpenStreetMap 标准图', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', cesiumUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', subdomains: 'abc', attribution: '© OpenStreetMap contributors' },
  { id: 'osm-fr', label: 'OpenStreetMap France', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', cesiumUrl: 'https://a.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', subdomains: 'abc', attribution: '© OpenStreetMap contributors · OpenStreetMap France' },
  { id: 'osm-hot', label: '人道主义 OpenStreetMap', url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', cesiumUrl: 'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', subdomains: 'abc', attribution: '© OpenStreetMap contributors · HOT' },
  { id: 'osm-de', label: 'OpenStreetMap 德国风格', url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', cesiumUrl: 'https://a.tile.openstreetmap.de/{z}/{x}/{y}.png', subdomains: 'abc', attribution: '© OpenStreetMap contributors · OpenStreetMap DE' },
  { id: 'sentinel-2', label: 'Sentinel-2 卫星图像', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', cesiumUrl: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg', attribution: 'Sentinel-2 cloudless © EOX IT Services GmbH · Contains modified Copernicus Sentinel data 2024' },
]

export const WEATHER_LAYERS = [
  { id: 'none', label: '关闭天气图层' },
  { id: 'precipitation_new', label: '降水' },
  { id: 'clouds_new', label: '云量' },
  { id: 'wind_new', label: '风速' },
  { id: 'pressure_new', label: '气压' },
]

export const ALTITUDE_BANDS = [
  { label: '地面 / 低空 < 600 m', color: '#f87171', min: 0, max: 600 },
  { label: '低空 600–2,000 m', color: '#fb923c', min: 600, max: 2000 },
  { label: '中低空 2,000–6,000 m', color: '#facc15', min: 2000, max: 6000 },
  { label: '巡航 6,000–10,000 m', color: '#38bdf8', min: 6000, max: 10000 },
  { label: '高空 ≥ 10,000 m', color: '#a78bfa', min: 10000, max: Infinity },
]

export const AIRPORT_TYPES = [
  { id: 'large_airport', label: '大型机场', color: '#ef4444', radius: 8, minZoom: 5 },
  { id: 'medium_airport', label: '中型机场', color: '#f97316', radius: 6, minZoom: 8 },
  { id: 'small_airport', label: '小型机场', color: '#facc15', radius: 4, minZoom: 11 },
  { id: 'heliport', label: '直升机场', color: '#a78bfa', radius: 4, minZoom: 13 },
  { id: 'seaplane_base', label: '水上机场', color: '#38bdf8', radius: 5, minZoom: 11 },
  { id: 'balloonport', label: '热气球场', color: '#f472b6', radius: 4, minZoom: 13 },
  { id: 'closed', label: '关闭机场', color: '#64748b', radius: 3, minZoom: 13 },
]

export function baseLayerById(id) {
  return BASE_LAYERS.find((layer) => layer.id === id) ?? BASE_LAYERS[0]
}

export function airportTypeById(id) {
  return AIRPORT_TYPES.find((type) => type.id === id) ?? AIRPORT_TYPES.at(-1)
}
