/** Client-side geographic helpers for already loaded map features.
 * Use this for interactive analysis; move large or indexed queries to PostGIS later.
 */
const EARTH_RADIUS_KM = 6371.0088
const toRadians = (degrees) => degrees * Math.PI / 180

export function haversineKm(firstCoordinate, secondCoordinate) {
  const [longitudeA, latitudeA] = firstCoordinate
  const [longitudeB, latitudeB] = secondCoordinate
  const deltaLatitude = toRadians(latitudeB - latitudeA)
  const deltaLongitude = toRadians(longitudeB - longitudeA)
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function nearestFeatures(origin, candidates, count = 3) {
  if (!origin?.geometry?.coordinates) return []
  return candidates
    .filter((candidate) => candidate?.geometry?.coordinates)
    .map((candidate) => ({ feature: candidate, distanceKm: haversineKm(origin.geometry.coordinates, candidate.geometry.coordinates) }))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, count)
}

/** Returns loaded features that are inside a circular search area. */
export function featuresWithinRadius(origin, candidates, radiusKm) {
  if (!origin?.geometry?.coordinates || !Number.isFinite(radiusKm)) return []
  return candidates
    .filter((candidate) => candidate?.geometry?.coordinates)
    .map((candidate) => ({ feature: candidate, distanceKm: haversineKm(origin.geometry.coordinates, candidate.geometry.coordinates) }))
    .filter((item) => item.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
}
