import { describe, expect, it } from 'bun:test'
import { isAllowedOpenConnectorRuntimeMutation } from './sources'

describe('isAllowedOpenConnectorRuntimeMutation', () => {
  it('allows the explicit connection and OAuth administration matrix', () => {
    expect(isAllowedOpenConnectorRuntimeMutation('PUT', '/api/connections/plausible_analytics')).toBe(true)
    expect(isAllowedOpenConnectorRuntimeMutation('DELETE', '/api/connections/plausible_analytics')).toBe(true)
    expect(isAllowedOpenConnectorRuntimeMutation('PUT', '/api/oauth/configs/github')).toBe(true)
    expect(isAllowedOpenConnectorRuntimeMutation('DELETE', '/api/oauth/configs/github')).toBe(true)
    expect(isAllowedOpenConnectorRuntimeMutation('POST', '/api/oauth/authorizations')).toBe(true)
  })

  it('rejects wrong methods, query strings, traversal, and unrelated admin paths', () => {
    expect(isAllowedOpenConnectorRuntimeMutation('POST', '/api/connections/github')).toBe(false)
    expect(isAllowedOpenConnectorRuntimeMutation('PUT', '/api/oauth/authorizations')).toBe(false)
    expect(isAllowedOpenConnectorRuntimeMutation('POST', '/api/oauth/authorizations?service=github')).toBe(false)
    expect(isAllowedOpenConnectorRuntimeMutation('PUT', '/api/oauth/configs/github/../slack')).toBe(false)
    expect(isAllowedOpenConnectorRuntimeMutation('DELETE', '/api/runtime-tokens/token')).toBe(false)
    expect(isAllowedOpenConnectorRuntimeMutation('POST', 'https://example.com/api/oauth/authorizations')).toBe(false)
  })
})
