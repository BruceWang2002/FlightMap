/** Browser-local export: no remote calls or API credits. */
export function downloadGeoJSON(payload, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/geo+json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
