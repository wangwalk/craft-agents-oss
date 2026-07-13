import type { NavigationState } from '../../shared/types'

export interface NewSessionInheritanceParams {
  status?: string
  label?: string
  project?: string
}

interface ProjectRef {
  config: {
    id: string
    slug: string
  }
}

interface ResolveNewSessionInheritanceOptions {
  navState: NavigationState
  projects: readonly ProjectRef[]
  statuses: ReadonlyMap<string, unknown>
  labels: ReadonlyMap<string, unknown>
  projectFilters: ReadonlyMap<string, unknown>
}

/**
 * Resolve metadata inherited by the global new-session action.
 *
 * A concrete project detail page takes precedence over list filters because it
 * is the user's current creation context. Outside a project detail page, retain
 * the existing rule: inherit only when exactly one list filter is active.
 */
export function resolveNewSessionInheritance({
  navState,
  projects,
  statuses,
  labels,
  projectFilters,
}: ResolveNewSessionInheritanceOptions): NewSessionInheritanceParams | null {
  if (navState.navigator === 'projects' && navState.details) {
    const currentProject = projects.find(
      project => project.config.slug === navState.details?.projectSlug,
    )
    if (currentProject) return { project: currentProject.config.id }
  }

  const statusCount = statuses.size
  const labelCount = labels.size
  const projectCount = projectFilters.size
  const total = statusCount + labelCount + projectCount

  if (total !== 1) return null
  if (statusCount === 1) return { status: statuses.keys().next().value }
  if (labelCount === 1) return { label: labels.keys().next().value }
  if (projectCount === 1) return { project: projectFilters.keys().next().value }
  return null
}
