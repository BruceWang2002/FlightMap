import { validCoordinate } from './spatialAnalysis.js'

/** Both map engines use the same selection visibility contract. */
export function analysisIsVisible(state) {
  return Boolean(state.analysisEnabled && state.showAnalysisResults && state.analysisResults?.origin)
}

export function visibleAircraft(state) {
  const retained = new Set(analysisIsVisible(state)
    ? state.analysisResults.aircraftResults.map(item => item.feature.properties.icao24) : [])
  return state.flights.filter(flight => validCoordinate(flight.geometry?.coordinates)
    && (!state.selectedIcao24 || flight.properties.icao24 === state.selectedIcao24 || retained.has(flight.properties.icao24)))
}
