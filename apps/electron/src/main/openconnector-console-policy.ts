export interface OpenConnectorConsoleBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ResolvedOpenConnectorConsoleUrl {
  url: string
  origin: string
}

export type OpenConnectorPopupDisposition = 'oauth-popup' | 'external' | 'blocked'

const MAX_VIEW_DIMENSION = 20_000

export function resolveOpenConnectorConsoleUrl(value: unknown): ResolvedOpenConnectorConsoleUrl | null {
  if (typeof value !== 'string' || !value.trim()) return null

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (parsed.username || parsed.password) return null
    if (parsed.protocol === 'http:' && !isLoopbackHostname(parsed.hostname)) return null
    parsed.hash = ''
    return {
      url: parsed.toString(),
      origin: parsed.origin,
    }
  } catch {
    return null
  }
}

export function normalizeOpenConnectorConsoleBounds(value: unknown): OpenConnectorConsoleBounds | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<OpenConnectorConsoleBounds>
  const values = [candidate.x, candidate.y, candidate.width, candidate.height]
  if (!values.every((item) => typeof item === 'number' && Number.isFinite(item))) return null

  const x = Math.max(0, Math.round(candidate.x!))
  const y = Math.max(0, Math.round(candidate.y!))
  const width = Math.min(MAX_VIEW_DIMENSION, Math.max(1, Math.round(candidate.width!)))
  const height = Math.min(MAX_VIEW_DIMENSION, Math.max(1, Math.round(candidate.height!)))
  return { x, y, width, height }
}

export function isSameOpenConnectorOrigin(value: string, allowedOrigin: string): boolean {
  try {
    return new URL(value).origin === allowedOrigin
  } catch {
    return false
  }
}

export function classifyOpenConnectorPopup(
  value: string,
  frameName: string,
): OpenConnectorPopupDisposition {
  const resolved = resolveExternalHttpUrl(value)
  if (!resolved) return 'blocked'
  return frameName === 'oomol_connect_oauth' ? 'oauth-popup' : 'external'
}

function resolveExternalHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value)
    if (parsed.username || parsed.password) return null
    if (parsed.protocol === 'https:') return parsed
    if (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)) return parsed
    return null
  } catch {
    return null
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}
