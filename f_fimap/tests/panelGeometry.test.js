import test from 'node:test'
import assert from 'node:assert/strict'
import { panelGeometry } from '../src/utils/panelGeometry.js'

const desktop = { bounds: { width: 1200, height: 800 }, width: 360, height: 480 }

function assertWithinMap(geometry, bounds) {
  for (const value of Object.values(geometry)) assert.ok(Number.isFinite(value))
  assert.ok(geometry.width >= 0 && geometry.height >= 0)
  assert.ok(geometry.left >= 0 && geometry.top >= 0)
  assert.ok(geometry.left + geometry.width <= bounds.width)
  assert.ok(geometry.top + geometry.height <= bounds.height)
}

test('desktop panels retain their readable requested size and align to either side', () => {
  assert.deepEqual(panelGeometry(desktop), { width: 360, height: 480, left: 16, top: 16 })
  assert.deepEqual(panelGeometry({ ...desktop, align: 'right' }), {
    width: 360, height: 480, left: 824, top: 16,
  })
})

test('dragging beyond any edge leaves the whole panel and its close button inside the map', () => {
  for (const position of [
    { left: -1000, top: -1000 },
    { left: 2000, top: 2000 },
    { left: -1000, top: 2000 },
    { left: 2000, top: -1000 },
  ]) {
    const geometry = panelGeometry({ ...desktop, position })
    assertWithinMap(geometry, desktop.bounds)
    assert.equal(geometry.width, desktop.width)
    assert.equal(geometry.height, desktop.height)
  }
})

test('container shrink clamps a previously large, dragged panel without page overflow', () => {
  const bounds = { width: 430, height: 280 }
  const geometry = panelGeometry({
    bounds, width: 820, height: 600, position: { left: 600, top: 360 },
  })
  assertWithinMap(geometry, bounds)
  assert.deepEqual(geometry, { width: 398, height: 248, left: 16, top: 16 })
})

test('mobile panels use map width, anchor to its bottom, and ignore desktop drag coordinates', () => {
  const bounds = { width: 390, height: 640 }
  const geometry = panelGeometry({
    bounds, compact: true, width: 820, height: bounds.height * .4,
    position: { left: 500, top: 500 },
  })
  assert.deepEqual(geometry, { width: 374, height: 256, left: 8, top: 376 })
  assertWithinMap(geometry, bounds)
})

test('collapse fits just the header, and expanding restores the requested content height', () => {
  const options = { ...desktop, position: { left: 200, top: 650 } }
  const collapsed = panelGeometry({ ...options, collapsed: true })
  const expanded = panelGeometry({ ...options, collapsed: false })
  assert.equal(collapsed.height, 72)
  assert.equal(expanded.height, 480)
  assertWithinMap(collapsed, desktop.bounds)
  assertWithinMap(expanded, desktop.bounds)
})

test('compact collapsed panel stays at the map bottom after orientation changes', () => {
  for (const bounds of [{ width: 390, height: 640 }, { width: 740, height: 210 }]) {
    const geometry = panelGeometry({
      bounds, compact: true, width: 820, height: bounds.height * .4, collapsed: true,
    })
    assert.equal(geometry.height, 72)
    assert.equal(geometry.top + geometry.height, bounds.height - 8)
    assertWithinMap(geometry, bounds)
  }
})

test('temporarily zero or tiny map bounds produce valid geometry during layout changes', () => {
  for (const compact of [false, true]) {
    for (const bounds of [
      { width: 0, height: 0 }, { width: 10, height: 10 },
      { width: 30, height: 20 }, { width: 320, height: 60 },
    ]) {
      assertWithinMap(panelGeometry({ ...desktop, bounds, compact }), bounds)
    }
  }
})
