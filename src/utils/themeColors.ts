export function resolveThemeColor(variableName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback

  const probe = document.createElement('span')
  probe.style.color = `var(${variableName})`
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  document.body.appendChild(probe)

  const color = getComputedStyle(probe).color
  probe.remove()

  return color || fallback
}

export function resolveThemeVariableValue(variableName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback

  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  return value || fallback
}
