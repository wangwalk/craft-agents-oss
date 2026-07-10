import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import { loadWorkspaceSources } from '@craft-agent/shared/sources'
import { safeJsonParse } from '@craft-agent/shared/utils/files'
import { getCredentialManager } from '@craft-agent/shared/credentials'
import { isOpenConnectorGatewaySource } from '@craft-agent/shared/connectors/openconnector'
import type { LoadedSource } from '@craft-agent/shared/sources'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.sources.GET,
  RPC_CHANNELS.sources.CREATE,
  RPC_CHANNELS.sources.DELETE,
  RPC_CHANNELS.sources.START_OAUTH,
  RPC_CHANNELS.sources.SAVE_CREDENTIALS,
  RPC_CHANNELS.sources.GET_PERMISSIONS,
  RPC_CHANNELS.workspace.GET_PERMISSIONS,
  RPC_CHANNELS.permissions.GET_DEFAULTS,
  RPC_CHANNELS.sources.GET_MCP_TOOLS,
  RPC_CHANNELS.sources.GET_OPENCONNECTOR_RUNTIME_JSON,
  RPC_CHANNELS.sources.GET_OPENCONNECTOR_RUNTIME_SNAPSHOT,
] as const

export function registerSourcesHandlers(server: RpcServer, deps: HandlerDeps): void {
  const log = deps.platform.logger

  // Get all sources for a workspace
  server.handle(RPC_CHANNELS.sources.GET, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) {
      log.error(`SOURCES_GET: Workspace not found: ${workspaceId}`)
      return []
    }
    return loadWorkspaceSources(workspace.rootPath)
  })

  // Create a new source
  server.handle(RPC_CHANNELS.sources.CREATE, async (_ctx, workspaceId: string, config: Partial<import('@craft-agent/shared/sources').CreateSourceInput>) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { createSource } = await import('@craft-agent/shared/sources')
    const source = await createSource(workspace.rootPath, {
      name: config.name || 'New Source',
      provider: config.provider || 'custom',
      type: config.type || 'mcp',
      enabled: config.enabled ?? true,
      icon: config.icon,
      tagline: config.tagline,
      mcp: config.mcp,
      api: config.api,
      local: config.local,
    })

    if (source.provider === 'openconnector') {
      const { writeFileSync } = await import('fs')
      const { getSourcePath, getOpenConnectorGuide } = await import('@craft-agent/shared/sources')
      const { getSourcePermissionsPath } = await import('@craft-agent/shared/agent')
      const { join } = await import('path')

      writeFileSync(join(getSourcePath(workspace.rootPath, source.slug), 'guide.md'), getOpenConnectorGuide())
      writeFileSync(getSourcePermissionsPath(workspace.rootPath, source.slug), JSON.stringify({
        allowedMcpPatterns: [
          { pattern: 'list', comment: 'Read-only list operations exposed by OpenConnector providers' },
          { pattern: 'get', comment: 'Read-only get/read operations exposed by OpenConnector providers' },
          { pattern: 'search', comment: 'Read-only search operations exposed by OpenConnector providers' },
          { pattern: 'find', comment: 'Read-only find operations exposed by OpenConnector providers' },
        ],
      }, null, 2))
    }

    return source
  })

  // Delete a source
  server.handle(RPC_CHANNELS.sources.DELETE, async (_ctx, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { deleteSource } = await import('@craft-agent/shared/sources')
    deleteSource(workspace.rootPath, sourceSlug)

    // Clean up stale slug from workspace default sources
    const { loadWorkspaceConfig, saveWorkspaceConfig } = await import('@craft-agent/shared/workspaces')
    const config = loadWorkspaceConfig(workspace.rootPath)
    if (config?.defaults?.enabledSourceSlugs?.includes(sourceSlug)) {
      config.defaults.enabledSourceSlugs = config.defaults.enabledSourceSlugs.filter(s => s !== sourceSlug)
      saveWorkspaceConfig(workspace.rootPath, config)
    }
  })

  // Start OAuth flow for a source (DEPRECATED — use oauth:start + performOAuth client-side)
  // Kept for backward compatibility with old IPC preload; WS clients use performOAuth().
  server.handle(RPC_CHANNELS.sources.START_OAUTH, async () => {
    return {
      success: false,
      error: 'Deprecated: use the client-side performOAuth() flow (oauth:start + oauth:complete) instead',
    }
  })

  // Save credentials for a source (bearer token or API key)
  server.handle(RPC_CHANNELS.sources.SAVE_CREDENTIALS, async (_ctx, workspaceId: string, sourceSlug: string, credential: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const { loadSource, getSourceCredentialManager } = await import('@craft-agent/shared/sources')

    const source = loadSource(workspace.rootPath, sourceSlug)
    if (!source) {
      throw new Error(`Source not found: ${sourceSlug}`)
    }

    // SourceCredentialManager handles credential type resolution
    const credManager = getSourceCredentialManager()
    await credManager.save(source, { value: credential })

    log.info(`Saved credentials for source: ${sourceSlug}`)
  })

  // Get permissions config for a source (raw format for UI display)
  server.handle(RPC_CHANNELS.sources.GET_PERMISSIONS, async (_ctx, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null

    const { existsSync, readFileSync } = await import('fs')
    const { getSourcePermissionsPath } = await import('@craft-agent/shared/agent')
    const path = getSourcePermissionsPath(workspace.rootPath, sourceSlug)

    if (!existsSync(path)) return null

    try {
      const content = readFileSync(path, 'utf-8')
      return safeJsonParse(content)
    } catch (error) {
      log.error('Error reading permissions config:', error)
      return null
    }
  })

  // Get permissions config for a workspace (raw format for UI display)
  server.handle(RPC_CHANNELS.workspace.GET_PERMISSIONS, async (_ctx, workspaceId: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return null

    const { existsSync, readFileSync } = await import('fs')
    const { getWorkspacePermissionsPath } = await import('@craft-agent/shared/agent')
    const path = getWorkspacePermissionsPath(workspace.rootPath)

    if (!existsSync(path)) return null

    try {
      const content = readFileSync(path, 'utf-8')
      return safeJsonParse(content)
    } catch (error) {
      log.error('Error reading workspace permissions config:', error)
      return null
    }
  })

  // Get default permissions from ~/.craft-agent/permissions/default.json
  server.handle(RPC_CHANNELS.permissions.GET_DEFAULTS, async () => {
    const { existsSync, readFileSync } = await import('fs')
    const { getAppPermissionsDir } = await import('@craft-agent/shared/agent')
    const { join } = await import('path')

    const defaultPath = join(getAppPermissionsDir(), 'default.json')
    if (!existsSync(defaultPath)) return { config: null, path: defaultPath }

    try {
      const content = readFileSync(defaultPath, 'utf-8')
      return { config: safeJsonParse(content), path: defaultPath }
    } catch (error) {
      log.error('Error reading default permissions config:', error)
      return { config: null, path: defaultPath }
    }
  })

  // Load the OpenConnector administration overview in one backend request.
  // This avoids fanning multiple RPCs out over the same remote workspace
  // WebSocket and then proxying each one separately to a localhost runtime.
  server.handle(RPC_CHANNELS.sources.GET_OPENCONNECTOR_RUNTIME_SNAPSHOT, async (ctx, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(ctx.workspaceId ?? workspaceId)
    if (!workspace) return { success: false, error: 'Workspace not found' }

    try {
      const sources = await loadWorkspaceSources(workspace.rootPath)
      const source = sources.find(s => s.config.slug === sourceSlug)
      if (!source) return { success: false, error: 'Source not found' }
      if (!isOpenConnectorGatewaySource(source.config)) return { success: false, error: 'Source is not an OpenConnector gateway' }
      if (!source.config.mcp?.url) return { success: false, error: 'OpenConnector gateway MCP URL is missing' }

      const baseUrl = resolveOpenConnectorRuntimeBaseUrl(source)
      if (!baseUrl) return { success: false, error: 'Could not resolve OpenConnector runtime URL' }

      const response = await fetch(new URL('/api/admin/snapshot', baseUrl), {
        headers: await openConnectorRuntimeHeaders(source),
        signal: AbortSignal.timeout(OPENCONNECTOR_SNAPSHOT_TIMEOUT_MS),
      })
      const data = await response.json().catch(() => undefined)
      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          error: openConnectorErrorMessage(data) ?? `OpenConnector snapshot request failed with ${response.status}`,
        }
      }
      return { success: true, status: response.status, data }
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      const message = timedOut
        ? `OpenConnector snapshot request timed out after ${OPENCONNECTOR_SNAPSHOT_TIMEOUT_MS}ms`
        : error instanceof Error ? error.message : 'Failed to fetch OpenConnector runtime snapshot'
      log.error('Failed to fetch OpenConnector runtime snapshot:', error)
      return { success: false, status: timedOut ? 504 : undefined, error: message }
    }
  })

  // Get OpenConnector runtime JSON through the workspace/backend side.
  // Renderer-side fetches to localhost break for remote workspaces and may hit
  // CORS. Keep this intentionally constrained to OpenConnector gateway sources
  // and a small readonly endpoint allowlist so it does not become a generic
  // arbitrary URL proxy.
  server.handle(RPC_CHANNELS.sources.GET_OPENCONNECTOR_RUNTIME_JSON, async (ctx, workspaceId: string, sourceSlug: string, path: string) => {
    // LoadedSource.workspaceId is derived from the workspace folder basename,
    // which may differ from the configured workspace ID/name on remote servers.
    // The authenticated connection context is authoritative for this
    // workspace-scoped endpoint; retain the argument as a compatibility fallback.
    const workspace = getWorkspaceByNameOrId(ctx.workspaceId ?? workspaceId)
    if (!workspace) return { success: false, error: 'Workspace not found' }

    try {
      const sources = await loadWorkspaceSources(workspace.rootPath)
      const source = sources.find(s => s.config.slug === sourceSlug)
      if (!source) return { success: false, error: 'Source not found' }
      if (!isOpenConnectorGatewaySource(source.config)) return { success: false, error: 'Source is not an OpenConnector gateway' }
      if (!source.config.mcp?.url) return { success: false, error: 'OpenConnector gateway MCP URL is missing' }
      if (!isAllowedOpenConnectorRuntimePath(path)) return { success: false, error: 'OpenConnector runtime path is not allowed' }

      const baseUrl = resolveOpenConnectorRuntimeBaseUrl(source)
      if (!baseUrl) return { success: false, error: 'Could not resolve OpenConnector runtime URL' }

      const url = new URL(path, baseUrl)
      const response = await fetch(url, { headers: await openConnectorRuntimeHeaders(source) })
      const data = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }))
      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          error: openConnectorErrorMessage(data) ?? `OpenConnector request failed with ${response.status}`,
          data,
        }
      }
      return { success: true, status: response.status, data }
    } catch (error) {
      log.error('Failed to fetch OpenConnector runtime JSON:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch OpenConnector runtime JSON' }
    }
  })

  // Get MCP tools for a source with permission status
  server.handle(RPC_CHANNELS.sources.GET_MCP_TOOLS, async (_ctx, workspaceId: string, sourceSlug: string) => {
    const workspace = getWorkspaceByNameOrId(workspaceId)
    if (!workspace) return { success: false, error: 'Workspace not found' }

    try {
      const sources = await loadWorkspaceSources(workspace.rootPath)
      const source = sources.find(s => s.config.slug === sourceSlug)
      if (!source) return { success: false, error: 'Source not found' }
      if (source.config.type !== 'mcp') return { success: false, error: 'Source is not an MCP server' }
      if (!source.config.mcp) return { success: false, error: 'MCP config not found' }

      if (source.config.connectionStatus === 'needs_auth') {
        return { success: false, error: 'Source requires authentication' }
      }
      if (source.config.connectionStatus === 'failed') {
        return { success: false, error: source.config.connectionError || 'Connection failed' }
      }
      if (source.config.connectionStatus === 'untested') {
        return { success: false, error: 'Source has not been tested yet' }
      }

      const { CraftMcpClient } = await import('@craft-agent/shared/mcp')
      let client: InstanceType<typeof CraftMcpClient>

      if (source.config.mcp.transport === 'stdio') {
        if (!source.config.mcp.command) {
          return { success: false, error: 'Stdio MCP source is missing required "command" field' }
        }
        log.info(`Fetching MCP tools via stdio: ${source.config.mcp.command}`)
        client = new CraftMcpClient({
          transport: 'stdio',
          command: source.config.mcp.command,
          args: source.config.mcp.args,
          env: source.config.mcp.env,
        })
      } else {
        if (!source.config.mcp.url) {
          return { success: false, error: 'MCP source URL is required for HTTP/SSE transport' }
        }

        let accessToken: string | undefined
        if (source.config.mcp.authType === 'oauth' || source.config.mcp.authType === 'bearer') {
          const credentialManager = getCredentialManager()
          const credentialId = source.config.mcp.authType === 'oauth'
            ? { type: 'source_oauth' as const, workspaceId: source.workspaceId, sourceId: sourceSlug }
            : { type: 'source_bearer' as const, workspaceId: source.workspaceId, sourceId: sourceSlug }
          const credential = await credentialManager.get(credentialId)
          accessToken = credential?.value
        }

        log.info(`Fetching MCP tools from ${source.config.mcp.url}`)
        client = new CraftMcpClient({
          transport: 'http',
          url: source.config.mcp.url,
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        })
      }

      const tools = await client.listTools()
      await client.close()

      const { loadSourcePermissionsConfig, permissionsConfigCache } = await import('@craft-agent/shared/agent')
      const permissionsConfig = loadSourcePermissionsConfig(workspace.rootPath, sourceSlug)

      const mergedConfig = permissionsConfigCache.getMergedConfig({
        workspaceRootPath: workspace.rootPath,
        activeSourceSlugs: [sourceSlug],
      })

      const toolsWithPermission = tools.map(tool => {
        const allowed = mergedConfig.readOnlyMcpPatterns.some((pattern: RegExp) => pattern.test(tool.name))
        return {
          name: tool.name,
          description: tool.description,
          allowed,
        }
      })

      return { success: true, tools: toolsWithPermission }
    } catch (error) {
      log.error('Failed to get MCP tools:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tools'
      if (errorMessage.includes('404')) {
        return { success: false, error: 'MCP server endpoint not found. The server may be offline or the URL may be incorrect.' }
      }
      if (errorMessage.includes('401') || errorMessage.includes('403')) {
        return { success: false, error: 'Authentication failed. Please re-authenticate with this source.' }
      }
      return { success: false, error: errorMessage }
    }
  })
}

const OPENCONNECTOR_SNAPSHOT_TIMEOUT_MS = 10_000

const OPENCONNECTOR_RUNTIME_ALLOWED_PATHS = new Set([
  '/api/auth/session',
  '/api/providers',
  '/api/connections',
  '/api/oauth/configs',
  '/api/runtime-tokens',
  '/api/runs',
  '/api/actions',
  '/api/actions/search',
  '/v1/health',
])

function isAllowedOpenConnectorRuntimePath(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false
  let parsed: URL
  try {
    parsed = new URL(path, 'http://openconnector.local')
  } catch {
    return false
  }
  if (parsed.origin !== 'http://openconnector.local') return false
  if (parsed.pathname.includes('..')) return false
  if (OPENCONNECTOR_RUNTIME_ALLOWED_PATHS.has(parsed.pathname)) return true
  if (/^\/api\/actions\/[^/]+$/.test(parsed.pathname)) return true
  if (/^\/api\/actions\/[^/]+\/agent\.md$/.test(parsed.pathname)) return true
  return false
}

function resolveOpenConnectorRuntimeBaseUrl(source: LoadedSource): string | null {
  const rawUrl = source.config.mcp?.url?.trim()
  if (!rawUrl) return null
  try {
    const parsed = new URL(rawUrl)
    const pathname = parsed.pathname.replace(/\/+$/, '')
    if (pathname.endsWith('/mcp')) {
      parsed.pathname = pathname.slice(0, -'/mcp'.length) || '/'
    }
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return rawUrl.replace(/\/mcp\/?$/, '').replace(/\/+$/, '')
  }
}

async function openConnectorRuntimeHeaders(source: LoadedSource): Promise<Headers> {
  const headers = new Headers()
  if (source.config.mcp?.authType === 'oauth' || source.config.mcp?.authType === 'bearer') {
    const credentialManager = getCredentialManager()
    const credentialId = source.config.mcp.authType === 'oauth'
      ? { type: 'source_oauth' as const, workspaceId: source.workspaceId, sourceId: source.config.slug }
      : { type: 'source_bearer' as const, workspaceId: source.workspaceId, sourceId: source.config.slug }
    const credential = await credentialManager.get(credentialId)
    if (credential?.value) headers.set('authorization', `Bearer ${credential.value}`)
  }
  return headers
}

function openConnectorErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  if ('errorMessage' in payload && typeof payload.errorMessage === 'string') return payload.errorMessage
  if ('message' in payload && typeof payload.message === 'string') return payload.message
  if ('error' in payload && payload.error && typeof payload.error === 'object') {
    const error = payload.error as { message?: unknown }
    return typeof error.message === 'string' ? error.message : undefined
  }
  return undefined
}
