import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { parse, compileScript } from '@vue/compiler-sfc'
import { buildAnalysis } from '../src/utils/spatialAnalysis.js'

// Compile the real panels and render their Vue trees without a browser or network.
// This catches missing template bindings such as the previous radiusKm exception.
const modules = new Map()
async function loadComponent(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  const { descriptor } = parse(await readFile(url, 'utf8'))
  let code = compileScript(descriptor, { id: url.href, inlineTemplate: true, genDefaultAs: '__component' }).content
  for (const match of [...code.matchAll(/from\s+(['"])([^'"]+)\1/g)]) {
    const specifier = match[2]
    let resolved
    if (specifier.startsWith('.')) {
      const target = new URL(specifier.endsWith('.vue') || specifier.endsWith('.js') ? specifier : specifier + '.js', url)
      resolved = target.pathname.endsWith('.vue') ? await loadComponent(target) : target.href
    } else resolved = import.meta.resolve(specifier)
    code = code.replace(match[0], `from ${JSON.stringify(resolved)}`)
  }
  const moduleURL = 'data:text/javascript;base64,' + Buffer.from(code + '\nexport default __component').toString('base64')
  modules.set(url.href, moduleURL)
  return moduleURL
}
async function render(name, props) {
  const { default: component } = await import(await loadComponent(new URL(`../src/components/${name}.vue`, import.meta.url)))
  return renderToString(createSSRApp({ render: () => h(component, props) }))
}
const flight = { type: 'Feature', geometry: { type: 'Point', coordinates: [8, 50] }, properties: { icao24: 'abc123', callsign: 'TEST', altitude_m: 10000 } }

test('analysis panel renders its controls before an aircraft is selected', async () => {
  const html = await render('MapAnalysisPanel', { results: buildAnalysis({}) })
  assert.ok(html.includes('分析方式'))
  assert.ok(html.includes('先从地图或航班列表选择'))
  assert.ok(html.includes('关闭空间分析'))
})
for (const mode of ['nearest', 'radius', 'corridor', 'sector']) {
  test(`selected aircraft analysis panel renders ${mode} without undefined bindings`, async () => {
    const results = buildAnalysis({ flight, mode })
    const html = await render('MapAnalysisPanel', { flight, mode, results, radiusKm: 120, corridorKm: 20 })
    assert.ok(html.includes('TEST'))
    if (mode === 'radius') assert.ok(html.includes('120 km'))
    if (mode === 'corridor') assert.ok(html.includes('20 km') && html.includes('连续的有效轨迹段'))
  })
}
test('flight table keeps its header, detailed fields, selected row and shared close action', async () => {
  const html = await render('FlightListPanel', { flights: [flight], selectedIcao24: 'abc123' })
  assert.ok(html.includes('<thead>'))
  assert.ok(html.includes('爬升率'))
  assert.ok(html.includes('class="active"'))
  assert.ok(html.includes('关闭航班列表'))
})
test('weather panel shows forecast time, source, cache warning and missing variables without crashing', async () => {
  const location = { latitude: 50, longitude: 8 }
  const payload = { location, current: { time: '2026-10-03T12:00:00Z', temperature_2m: 0 },
    hourly: [{ time: '2026-10-03T13:00:00Z', temperature_2m: 10 }], metadata: { source: 'Open-Meteo', stale: true, fetched_at: '2026-10-03T12:00:00Z' } }
  const html = await render('WeatherPanel', { location, payload, hourIndex: 0 })
  assert.ok(html.includes('逐小时预报'))
  assert.ok(html.includes('10 °C'))
  assert.ok(html.includes('旧缓存'))
  assert.ok(html.includes('未提供'))
  assert.ok(html.includes('关闭位置天气'))
})
test('airport browser displays selected metadata honestly and sanitizes external links', async () => {
  const airport = { ...flight, properties: { ident: 'TEST', name: 'Test Airport', type: 'large_airport', country: 'DE', home_link: 'javascript:alert(1)' } }
  const html = await render('AirportBrowserPanel', { airports: [airport], selectedIdent: 'TEST' })
  assert.ok(html.includes('Test Airport'))
  assert.ok(html.includes('原始提供方未记录'))
  assert.ok(!html.includes('href="javascript:'))
})
