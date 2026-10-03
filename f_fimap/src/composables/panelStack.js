import { reactive } from 'vue'

// A workspace owns its stack; weak keys release it when the map is unmounted.
const stacks = new WeakMap()
export function panelStackFor(workspace) {
  if (!stacks.has(workspace)) stacks.set(workspace, reactive({ active: null }))
  return stacks.get(workspace)
}
