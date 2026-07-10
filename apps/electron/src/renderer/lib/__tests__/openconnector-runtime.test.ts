import { describe, expect, it } from 'bun:test'
import type {
  OpenConnectorConnectionRecord,
  OpenConnectorCredentialField,
  OpenConnectorProviderSummary,
} from '@craft-agent/shared/connectors/openconnector'
import {
  initialOpenConnectorConnectionValues,
  resolveOpenConnectorProviderConnectionStatus,
} from '../openconnector-runtime'

const fields: OpenConnectorCredentialField[] = [
  {
    key: 'apiKey',
    label: 'API key',
    inputType: 'password',
    required: true,
    secret: true,
  },
  {
    key: 'siteId',
    label: 'Site ID',
    inputType: 'text',
    required: true,
    secret: false,
  },
]

function connection(overrides: Partial<OpenConnectorConnectionRecord> = {}): OpenConnectorConnectionRecord {
  return {
    service: 'plausible',
    connectionName: 'default',
    authType: 'custom_credential',
    ...overrides,
  }
}

describe('initialOpenConnectorConnectionValues', () => {
  it('handles older remote connection records without metadata', () => {
    expect(initialOpenConnectorConnectionValues(fields, connection())).toEqual({
      apiKey: '',
      siteId: '',
    })
  })

  it('never restores secret metadata values into the form', () => {
    expect(initialOpenConnectorConnectionValues(fields, connection({
      metadata: { apiKey: 'secret', siteId: 'example.com' },
    }))).toEqual({
      apiKey: '',
      siteId: 'example.com',
    })
  })

  it('ignores non-string metadata values', () => {
    expect(initialOpenConnectorConnectionValues(fields, connection({
      metadata: { siteId: 42 },
    }))).toEqual({
      apiKey: '',
      siteId: '',
    })
  })

  it('uses provider defaults for missing non-secret values', () => {
    expect(initialOpenConnectorConnectionValues([
      { ...fields[1], defaultValue: 'common' },
    ], connection())).toEqual({ siteId: 'common' })
  })
})

function provider(auth: OpenConnectorProviderSummary['auth']): OpenConnectorProviderSummary {
  return {
    service: 'example',
    displayName: 'Example',
    categories: [],
    auth,
    authTypes: auth.map((item) => item.type),
    actions: [],
  }
}

describe('resolveOpenConnectorProviderConnectionStatus', () => {
  it('only treats missing OAuth client config as blocking for OAuth-only providers', () => {
    const oauth = { type: 'oauth2' as const, scopes: [] }
    expect(resolveOpenConnectorProviderConnectionStatus(provider([oauth]), [], []).oauthClientRequired).toBe(true)
    expect(resolveOpenConnectorProviderConnectionStatus(provider([
      oauth,
      { type: 'api_key', label: 'API key' },
    ]), [], []).oauthClientRequired).toBe(false)
  })

  it('reports configured credential connections as connected', () => {
    const status = resolveOpenConnectorProviderConnectionStatus(
      provider([{ type: 'api_key', label: 'API key' }]),
      [connection({ service: 'example', configured: true })],
      [],
    )
    expect(status.connected).toBe(true)
    expect(status.connection?.service).toBe('example')
  })
})
