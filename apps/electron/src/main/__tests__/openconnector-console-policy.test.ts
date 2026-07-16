import { describe, expect, it } from 'bun:test'
import {
  classifyOpenConnectorOAuthSession,
  classifyOpenConnectorPopup,
  isSameOpenConnectorOrigin,
  normalizeOpenConnectorConsoleBounds,
  resolveOpenConnectorConsoleUrl,
} from '../openconnector-console-policy'

describe('OpenConnector console policy', () => {
  it('accepts HTTPS and strips fragments', () => {
    expect(resolveOpenConnectorConsoleUrl('https://openconnector.example/providers#token')).toEqual({
      url: 'https://openconnector.example/providers',
      origin: 'https://openconnector.example',
    })
  })

  it('allows loopback HTTP but rejects remote HTTP and credential URLs', () => {
    expect(resolveOpenConnectorConsoleUrl('http://127.0.0.1:13001/')).not.toBeNull()
    expect(resolveOpenConnectorConsoleUrl('http://openconnector.example/')).toBeNull()
    expect(resolveOpenConnectorConsoleUrl('https://admin:secret@openconnector.example/')).toBeNull()
    expect(resolveOpenConnectorConsoleUrl('file:///tmp/index.html')).toBeNull()
  })

  it('normalizes finite bounds and rejects malformed values', () => {
    expect(normalizeOpenConnectorConsoleBounds({ x: -10.4, y: 4.6, width: 500.2, height: 300.8 })).toEqual({
      x: 0,
      y: 5,
      width: 500,
      height: 301,
    })
    expect(normalizeOpenConnectorConsoleBounds({ x: 0, y: 0, width: Number.NaN, height: 10 })).toBeNull()
    expect(normalizeOpenConnectorConsoleBounds(null)).toBeNull()
  })

  it('keeps main-frame navigation on the configured console origin', () => {
    expect(isSameOpenConnectorOrigin('https://openconnector.example/runs', 'https://openconnector.example')).toBe(true)
    expect(isSameOpenConnectorOrigin('https://oauth.example/authorize', 'https://openconnector.example')).toBe(false)
  })

  it('selects a fresh session only for marked new-account OAuth URLs', () => {
    expect(
      classifyOpenConnectorOAuthSession(
        'https://x.com/i/oauth2/authorize?state=opaque#oomol-connect-fresh-session',
      ),
    ).toBe('fresh')
    expect(
      classifyOpenConnectorOAuthSession(
        'https://x.com/i/oauth2/authorize?state=opaque',
        'oomol_connect_oauth_fresh',
      ),
    ).toBe('fresh')
    expect(classifyOpenConnectorOAuthSession('https://x.com/i/oauth2/authorize?state=opaque')).toBe('persistent')
    expect(
      classifyOpenConnectorOAuthSession('javascript:alert(1)#oomol-connect-fresh-session', 'oomol_connect_oauth_fresh'),
    ).toBe('persistent')
  })

  it('only grants popup windows to the named OAuth flow', () => {
    expect(classifyOpenConnectorPopup('https://github.com/login/oauth/authorize', 'oomol_connect_oauth')).toBe('oauth-popup')
    expect(
      classifyOpenConnectorPopup(
        'https://x.com/i/oauth2/authorize#oomol-connect-fresh-session',
        'oomol_connect_oauth',
      ),
    ).toBe('oauth-popup')
    expect(classifyOpenConnectorPopup('https://x.com/i/oauth2/authorize', 'oomol_connect_oauth_fresh')).toBe(
      'oauth-popup',
    )
    expect(classifyOpenConnectorPopup('https://docs.example/', '')).toBe('external')
    expect(classifyOpenConnectorPopup('javascript:alert(1)', 'oomol_connect_oauth')).toBe('blocked')
    expect(classifyOpenConnectorPopup('http://oauth.example/', 'oomol_connect_oauth')).toBe('blocked')
  })
})
