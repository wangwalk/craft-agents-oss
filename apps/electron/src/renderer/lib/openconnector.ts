import type { LoadedSource, McpToolWithPermission } from '../../shared/types'
import {
  OPENCONNECTOR_PROVIDER_APPS,
  inferOpenConnectorProviderIdsFromToolNames,
  isOpenConnectorSource,
  type OpenConnectorProviderApp,
} from '@craft-agent/shared/sources/source-templates'

const OPENCONNECTOR_VIRTUAL_SOURCE_SEPARATOR = '::openconnector::'

export interface OpenConnectorVirtualSourceItem {
  id: string
  providerId: string
  sourceSlug: string
  source: LoadedSource
  providerApp: OpenConnectorProviderApp
  tools: McpToolWithPermission[]
  actionCount: number
}

export function buildOpenConnectorVirtualSourceId(sourceSlug: string, providerId: string): string {
  return `${sourceSlug}${OPENCONNECTOR_VIRTUAL_SOURCE_SEPARATOR}${providerId}`
}

export function parseOpenConnectorVirtualSourceId(
  value: string
): { sourceSlug: string; providerId: string } | null {
  const separatorIndex = value.indexOf(OPENCONNECTOR_VIRTUAL_SOURCE_SEPARATOR)
  if (separatorIndex === -1) return null

  const sourceSlug = value.slice(0, separatorIndex)
  const providerId = value.slice(separatorIndex + OPENCONNECTOR_VIRTUAL_SOURCE_SEPARATOR.length)
  if (!sourceSlug || !providerId) return null

  return { sourceSlug, providerId }
}

export function matchesOpenConnectorProviderToolName(toolName: string, providerId: string): boolean {
  const normalized = toolName.toLowerCase()
  return (
    normalized === providerId ||
    normalized.startsWith(`${providerId}.`) ||
    normalized.startsWith(`${providerId}_`) ||
    normalized.includes(`__${providerId}__`)
  )
}

export function getOpenConnectorToolsForProvider(
  tools: McpToolWithPermission[],
  providerId: string
): McpToolWithPermission[] {
  return tools.filter((tool) => matchesOpenConnectorProviderToolName(tool.name, providerId))
}

export function getOpenConnectorActionCountForProvider(
  app: OpenConnectorProviderApp,
  tools: McpToolWithPermission[]
): number {
  const providerTools = getOpenConnectorToolsForProvider(tools, app.id)
  return providerTools.length > 0 ? providerTools.length : app.commonActions.length
}

export function buildOpenConnectorVirtualSourceItems(
  source: LoadedSource,
  tools: McpToolWithPermission[]
): OpenConnectorVirtualSourceItem[] {
  if (!isOpenConnectorSource(source.config)) return []

  const discoveredIds = inferOpenConnectorProviderIdsFromToolNames(tools.map((tool) => tool.name))
  const discovered = new Set(discoveredIds)
  const providerApps = discoveredIds.length === 0
    ? OPENCONNECTOR_PROVIDER_APPS
    : OPENCONNECTOR_PROVIDER_APPS.filter((app) => discovered.has(app.id))

  return providerApps
    .map((app) => {
      const providerTools = getOpenConnectorToolsForProvider(tools, app.id)
      return {
        id: buildOpenConnectorVirtualSourceId(source.config.slug, app.id),
        providerId: app.id,
        sourceSlug: source.config.slug,
        source,
        providerApp: app,
        tools: providerTools,
        actionCount: getOpenConnectorActionCountForProvider(app, tools),
      }
    })
}
