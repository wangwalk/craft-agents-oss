import { describe, expect, it } from 'bun:test'
import { resolveNewSessionInheritance } from '../new-session-inheritance'
import type { NavigationState } from '../../../shared/types'

const dollifyProject = {
  config: { id: 'proj_dollify', slug: 'dollify-ai' },
}

function resolve(
  navState: NavigationState,
  overrides: Partial<Parameters<typeof resolveNewSessionInheritance>[0]> = {},
) {
  return resolveNewSessionInheritance({
    navState,
    projects: [dollifyProject],
    statuses: new Map(),
    labels: new Map(),
    projectFilters: new Map(),
    ...overrides,
  })
}

describe('resolveNewSessionInheritance', () => {
  it('inherits the current project from a project detail page', () => {
    expect(resolve({
      navigator: 'projects',
      details: { type: 'project', projectSlug: 'dollify-ai' },
    })).toEqual({ project: 'proj_dollify' })
  })

  it('does not bind a project from the project list or an unknown detail slug', () => {
    expect(resolve({ navigator: 'projects', details: null })).toBeNull()
    expect(resolve({
      navigator: 'projects',
      details: { type: 'project', projectSlug: 'missing-project' },
    })).toBeNull()
  })

  it('prioritizes the current project over lingering list filters', () => {
    expect(resolve(
      {
        navigator: 'projects',
        details: { type: 'project', projectSlug: 'dollify-ai' },
      },
      { statuses: new Map([['in-progress', 'include']]) },
    )).toEqual({ project: 'proj_dollify' })
  })

  it('retains sole-filter inheritance outside project details', () => {
    const navState: NavigationState = {
      navigator: 'sessions',
      filter: { kind: 'allSessions' },
      details: null,
    }

    expect(resolve(navState, {
      projectFilters: new Map([['proj_filtered', 'include']]),
    })).toEqual({ project: 'proj_filtered' })

    expect(resolve(navState, {
      statuses: new Map([['todo', 'include']]),
      labels: new Map([['bug', 'include']]),
    })).toBeNull()
  })
})
