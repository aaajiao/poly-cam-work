const SRGB_COLOR_PATTERN =
  /^color\(srgb\s+([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)(?:\s*\/[^)]+)?\)$/i

function srgbChannelToByte(channel: string) {
  const value = Number.parseFloat(channel)
  if (!Number.isFinite(value)) return null
  return Math.round(Math.min(Math.max(value, 0), 1) * 255)
}

export function normalizeSrgbColor(value: string): string | null {
  const match = value.trim().match(SRGB_COLOR_PATTERN)
  if (!match) return null

  const red = srgbChannelToByte(match[1])
  const green = srgbChannelToByte(match[2])
  const blue = srgbChannelToByte(match[3])
  if (red === null || green === null || blue === null) return null

  return `rgb(${red}, ${green}, ${blue})`
}

export function resolveThemeColor(variableName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback

  const probe = document.createElement('span')
  probe.style.color = `var(${variableName})`
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.pointerEvents = 'none'
  document.body.appendChild(probe)

  const color = getComputedStyle(probe).color
  if (color && !/^(?:oklch|oklab|lab|lch|color)\(/i.test(color)) {
    probe.remove()
    return color
  }

  probe.style.color = `color-mix(in srgb, ${color || fallback} 100%, transparent)`
  const srgbColor = getComputedStyle(probe).color
  probe.remove()

  return normalizeSrgbColor(srgbColor) || srgbColor || fallback
}

export function resolveThemeVariableValue(variableName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback

  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  return value || fallback
}
