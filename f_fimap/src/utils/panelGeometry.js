/** Keep the complete panel inside the map, including its close/resize controls. */
export function panelGeometry({ bounds, compact, width, height, position, collapsed, align }) {
  const gap = Math.max(0, Math.min(compact ? 8 : 16, bounds.width / 2, bounds.height / 2))
  const availableWidth = Math.max(0, bounds.width - gap * 2)
  const availableHeight = Math.max(0, bounds.height - gap * 2)
  const panelWidth = compact ? availableWidth : Math.max(0, Math.min(width, availableWidth))
  const panelHeight = Math.max(0, Math.min(collapsed ? 72 : height, availableHeight))
  const clamp = (value, maximum) => Math.max(gap, Math.min(value, maximum))
  return {
    width: panelWidth,
    height: panelHeight,
    left: compact ? gap : clamp(position?.left ?? (align === 'right' ? bounds.width - panelWidth - gap : gap), bounds.width - panelWidth - gap),
    top: compact ? Math.max(gap, bounds.height - panelHeight - gap) : clamp(position?.top ?? gap, bounds.height - panelHeight - gap),
  }
}
