import { isOpenConnectorGatewaySource } from '@craft-agent/shared/connectors/openconnector'
import type { LoadedSource } from '../../shared/types'

export function findOpenConnectorGatewaySource(sources: LoadedSource[]): LoadedSource | null {
  return sources.find((source) => isOpenConnectorGatewaySource(source.config)) ?? null
}

export function resolveOpenConnectorConsoleUrl(source: LoadedSource | null): string | null {
  const mcpUrl = source?.config.mcp?.url
  if (!mcpUrl) return null

  try {
    const url = new URL(mcpUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      return null
    }
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}
