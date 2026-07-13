import { describe, expect, it } from 'bun:test'
import {
  buildRouteFromNavigationState,
  parseCompoundRoute,
  parseRouteToNavigationState,
} from '../route-parser'
import { isSessionsNavigation } from '../types'

describe('route-parser: List-only session navigation', () => {
  it('degrades a legacy Board deep link to All Sessions List', () => {
    const parsed = parseCompoundRoute('board')
    expect(parsed).toEqual({
      navigator: 'sessions',
      sessionFilter: { kind: 'allSessions' },
      details: null,
    })

    const state = parseRouteToNavigationState('board')
    if (!state || !isSessionsNavigation(state)) {
      throw new Error('expected sessions navigation state')
    }
    expect(state.filter).toEqual({ kind: 'allSessions' })
    expect(state.details).toBeNull()
    expect(buildRouteFromNavigationState(state)).toBe('allSessions')
  })
})
