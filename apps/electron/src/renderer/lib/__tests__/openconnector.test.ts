import { describe, expect, it } from 'bun:test'
import type { LoadedSource } from '../../../shared/types'
import {
  findOpenConnectorGatewaySource,
  resolveOpenConnectorConsoleUrl,
} from '../openconnector'

function source(overrides: Partial<LoadedSource['config']>): LoadedSource {
  return {
    config: {
      name: 'Example',
      slug: 'example',
      provider: 'custom',
      type: 'mcp',
      enabled: true,
      ...overrides,
    },
  } as LoadedSource
}

describe('OpenConnector official console helpers', () => {
  it('finds the gateway source by provider metadata', () => {
    const regular = source({ slug: 'regular' })
    const gateway = source({ name: 'OpenConnector', slug: 'openconnector', provider: 'openconnector' })

    expect(findOpenConnectorGatewaySource([regular, gateway])).toBe(gateway)
  })

  it('derives the Console root from an HTTPS MCP URL without carrying query data', () => {
    const gateway = source({
      provider: 'openconnector',
      mcp: { transport: 'http', url: 'https://connect.example.test/mcp?ignored=value' },
    })

    expect(resolveOpenConnectorConsoleUrl(gateway)).toBe('https://connect.example.test/')
  })

  it('allows loopback HTTP but rejects remote plaintext origins', () => {
    const loopback = source({
      provider: 'openconnector',
      mcp: { transport: 'http', url: 'http://127.0.0.1:3001/mcp' },
    })
    const remotePlaintext = source({
      provider: 'openconnector',
      mcp: { transport: 'http', url: 'http://connect.example.test/mcp' },
    })

    expect(resolveOpenConnectorConsoleUrl(loopback)).toBe('http://127.0.0.1:3001/')
    expect(resolveOpenConnectorConsoleUrl(remotePlaintext)).toBeNull()
  })
})
