import { describe, expect, it } from 'bun:test'
import {
  buildRouteFromNavigationState,
  parseRouteToNavigationState,
} from '../route-parser'

describe('Skills marketplace routes', () => {
  it('parses the marketplace list route without auto-selectable details', () => {
    expect(parseRouteToNavigationState('skills/marketplace')).toEqual({
      navigator: 'skills',
      section: 'marketplace',
      details: null,
    })
  })

  it('round-trips a marketplace detail with an encoded repository source', () => {
    const state = {
      navigator: 'skills' as const,
      section: 'marketplace' as const,
      details: {
        type: 'marketplace-skill' as const,
        source: 'vercel-labs/agent-skills',
        skillId: 'vercel-react-best-practices',
      },
    }
    const route = buildRouteFromNavigationState(state)
    expect(route).toBe('skills/marketplace/vercel-labs%2Fagent-skills/vercel-react-best-practices')
    expect(parseRouteToNavigationState(route)).toEqual(state)
  })

  it('keeps existing installed skill routes compatible', () => {
    expect(parseRouteToNavigationState('skills/skill/code-review')).toEqual({
      navigator: 'skills',
      section: 'installed',
      details: { type: 'skill', skillSlug: 'code-review' },
    })
  })
})
