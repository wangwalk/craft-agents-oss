import type { LoadedSource } from '../../shared/types'
import {
  isOpenConnectorGatewaySource,
  type OpenConnectorActionSummary,
  type OpenConnectorAdminSnapshot,
  type OpenConnectorAuthSession,
  type OpenConnectorConnectionRecord,
  type OpenConnectorOAuthConfig,
  type OpenConnectorProviderDefinition,
  type OpenConnectorProviderSummary,
  type OpenConnectorRunLog,
  type OpenConnectorRunLogPage,
  type OpenConnectorRuntimeSnapshotRpcResult,
  type OpenConnectorRuntimeTokenSummary,
} from '@craft-agent/shared/connectors/openconnector'

export type {
  OpenConnectorActionDefinition,
  OpenConnectorActionSummary,
  OpenConnectorAuthDefinition,
  OpenConnectorAuthSession,
  OpenConnectorConnectionRecord,
  OpenConnectorCredentialField,
  OpenConnectorJsonSchema,
  OpenConnectorOAuthConfig,
  OpenConnectorProviderDefinition,
  OpenConnectorProviderSummary,
  OpenConnectorRunLog,
  OpenConnectorRunLogPage,
  OpenConnectorRuntimeTokenSummary,
} from '@craft-agent/shared/connectors/openconnector'

export interface OpenConnectorAppData {
  providers: OpenConnectorProviderSummary[]
  connections: OpenConnectorConnectionRecord[]
  oauthConfigs: OpenConnectorOAuthConfig[]
  runtimeTokens: OpenConnectorRuntimeTokenSummary[]
  runs: OpenConnectorRunLog[]
  runsNextCursor?: string
}

export interface OpenConnectorRuntimeSnapshot {
  baseUrl: string | null
  gatewaySource: LoadedSource | null
  authSession: OpenConnectorAuthSession | null
  data: OpenConnectorAppData
  healthOk: boolean
}

export interface OpenConnectorProviderConnectionStatus {
  noSetupRequired: boolean
  connected: boolean
  oauthClientRequired: boolean
  connection?: OpenConnectorConnectionRecord
}

export const emptyOpenConnectorAppData: OpenConnectorAppData = {
  providers: [],
  connections: [],
  oauthConfigs: [],
  runtimeTokens: [],
  runs: [],
}

export function findOpenConnectorGatewaySource(sources: LoadedSource[]): LoadedSource | null {
  return sources.find((source) => isOpenConnectorGatewaySource(source.config)) ?? null
}

export function resolveOpenConnectorRuntimeBaseUrl(source: LoadedSource | null | undefined): string | null {
  const rawUrl = source?.config.mcp?.url?.trim()
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

export async function loadOpenConnectorRuntimeSnapshot(
  gatewaySource: LoadedSource | null,
  options: { adminToken?: string } = {},
): Promise<OpenConnectorRuntimeSnapshot> {
  const baseUrl = resolveOpenConnectorRuntimeBaseUrl(gatewaySource)
  if (!gatewaySource || !baseUrl) {
    return {
      baseUrl: null,
      gatewaySource,
      authSession: null,
      data: emptyOpenConnectorAppData,
      healthOk: false,
    }
  }

  let snapshot: OpenConnectorAdminSnapshot | null
  try {
    snapshot = await getOptionalAdminSnapshot(gatewaySource)
  } catch (error) {
    if (!(error instanceof OpenConnectorApiError) || error.status !== 401) throw error
    const authSession = await getOptionalAuthSession(gatewaySource, options)
    return {
      baseUrl,
      gatewaySource,
      authSession,
      data: emptyOpenConnectorAppData,
      healthOk: false,
    }
  }

  if (snapshot) {
    return {
      baseUrl,
      gatewaySource,
      authSession: snapshot.authSession,
      data: {
        providers: snapshot.providers,
        connections: snapshot.connections,
        oauthConfigs: snapshot.oauthConfigs,
        runtimeTokens: snapshot.runtimeTokens,
        runs: snapshot.runs.items,
        runsNextCursor: snapshot.runs.nextCursor,
      },
      healthOk: snapshot.healthOk,
    }
  }

  // Compatibility path for older Craft/OpenConnector backends that do not yet
  // expose the typed administration snapshot RPC.
  const authSession = await getOptionalAuthSession(gatewaySource, options)
  if (authSession && !authSession.authenticated) {
    return {
      baseUrl,
      gatewaySource,
      authSession,
      data: emptyOpenConnectorAppData,
      healthOk: false,
    }
  }

  const providers = await openConnectorGet<OpenConnectorProviderDefinition[]>(gatewaySource, '/api/providers', options)
  const connections = await openConnectorGet<OpenConnectorConnectionRecord[]>(gatewaySource, '/api/connections', options)
  const oauthConfigs = await openConnectorGet<OpenConnectorOAuthConfig[]>(gatewaySource, '/api/oauth/configs', options)
  const runtimeTokens = await openConnectorGet<OpenConnectorRuntimeTokenSummary[]>(gatewaySource, '/api/runtime-tokens', options)
  const runPage = await openConnectorGet<OpenConnectorRunLogPage>(gatewaySource, '/api/runs', options)
  const healthOk = await probeOpenConnectorHealth(gatewaySource, options)

  return {
    baseUrl,
    gatewaySource,
    authSession,
    data: {
      providers,
      connections,
      oauthConfigs,
      runtimeTokens,
      runs: runPage.items,
      runsNextCursor: runPage.nextCursor,
    },
    healthOk,
  }
}

async function getOptionalAdminSnapshot(
  gatewaySource: LoadedSource,
): Promise<OpenConnectorAdminSnapshot | null> {
  // Renderer HMR can update before Electron reloads the preload script. Treat a
  // missing method as an older backend/preload and use the compatibility path.
  if (typeof window.electronAPI.getOpenConnectorRuntimeSnapshot !== 'function') return null

  let result: OpenConnectorRuntimeSnapshotRpcResult
  try {
    result = await window.electronAPI.getOpenConnectorRuntimeSnapshot(
      gatewaySource.workspaceId,
      gatewaySource.config.slug,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No handler for: sources:getOpenConnectorRuntimeSnapshot')) return null
    throw error
  }

  if (!result.success) {
    if (result.status === 404) return null
    throw new OpenConnectorApiError(result.status ?? 0, result.error ?? 'OpenConnector snapshot request failed')
  }
  if (!result.data) {
    throw new OpenConnectorApiError(0, 'OpenConnector snapshot response did not include data')
  }
  return result.data
}

async function getOptionalAuthSession(
  gatewaySource: LoadedSource,
  options: { adminToken?: string },
): Promise<OpenConnectorAuthSession | null> {
  try {
    return await openConnectorGet<OpenConnectorAuthSession>(gatewaySource, '/api/auth/session', options)
  } catch (error) {
    // Older OpenConnector builds may not expose the auth session endpoint. Treat
    // the admin API as open and let the real data requests report any failures.
    if (error instanceof OpenConnectorApiError && error.status === 404) {
      return { authenticated: true, adminAuthConfigured: false }
    }
    throw error
  }
}

export async function openConnectorGet<T>(
  gatewaySource: LoadedSource,
  path: string,
  _options: { adminToken?: string } = {},
): Promise<T> {
  let result: { success: boolean; data?: unknown; status?: number; error?: string }
  try {
    result = await window.electronAPI.getOpenConnectorRuntimeJson(
      gatewaySource.workspaceId,
      gatewaySource.config.slug,
      path,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No handler for: sources:getOpenConnectorRuntimeJson')) {
      throw new OpenConnectorApiError(
        0,
        'Craft backend does not have the OpenConnector runtime proxy handler yet. Restart or update the workspace backend/server so it includes sources:getOpenConnectorRuntimeJson.',
      )
    }
    throw error
  }
  if (!result.success) {
    throw new OpenConnectorApiError(result.status ?? 0, result.error ?? 'OpenConnector request failed')
  }
  return result.data as T
}

export async function openConnectorRequest<T>(
  gatewaySource: LoadedSource,
  request: { method: 'PUT' | 'DELETE'; path: string; body?: unknown },
): Promise<T> {
  if (typeof window.electronAPI.requestOpenConnectorRuntimeJson !== 'function') {
    throw new OpenConnectorApiError(
      0,
      'Craft backend does not support OpenConnector connection requests yet. Restart or update the app and workspace server.',
    )
  }

  let result: { success: boolean; data?: unknown; status?: number; error?: string }
  try {
    result = await window.electronAPI.requestOpenConnectorRuntimeJson(
      gatewaySource.workspaceId,
      gatewaySource.config.slug,
      request,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('No handler for: sources:requestOpenConnectorRuntimeJson')) {
      throw new OpenConnectorApiError(
        0,
        'Craft workspace server does not support OpenConnector connection requests yet. Restart or update it first.',
      )
    }
    throw error
  }
  if (!result.success) {
    throw new OpenConnectorApiError(result.status ?? 0, result.error ?? 'OpenConnector connection request failed')
  }
  return result.data as T
}

async function probeOpenConnectorHealth(
  gatewaySource: LoadedSource,
  options: { adminToken?: string },
): Promise<boolean> {
  try {
    await openConnectorGet<unknown>(gatewaySource, '/v1/health', options)
    return true
  } catch {
    return false
  }
}

export class OpenConnectorApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function createOpenConnectorOverviewSummary(data: OpenConnectorAppData) {
  const actions = data.providers.flatMap((provider) => provider.actions)
  const failedRuns = data.runs.filter((run) => !run.ok)
  return {
    providerCount: data.providers.length,
    actionCount: actions.length,
    locallyExecutableActionCount: actions.filter((action) => action.execution.locallyExecutable).length,
    connectedCount: data.connections.filter(isUsableCredentialConnection).length,
    activeTokenCount: data.runtimeTokens.length,
    failedRunCount: failedRuns.length,
    failedRuns: failedRuns.slice(0, 5),
  }
}

export function resolveOpenConnectorProviderConnectionStatus(
  provider: OpenConnectorProviderSummary,
  connections: OpenConnectorConnectionRecord[],
  oauthConfigs: OpenConnectorOAuthConfig[],
): OpenConnectorProviderConnectionStatus {
  const noSetupRequired = isNoAuthOnlyOpenConnectorProvider(provider)
  const serviceConnections = connections.filter((connection) => connection.service === provider.service)
  const connection = noSetupRequired ? undefined : pickUsableCredentialConnection(serviceConnections)
  return {
    noSetupRequired,
    connected: connection != null,
    oauthClientRequired: providerHasOAuth(provider) && !oauthClientConfigured(provider.service, oauthConfigs),
    connection,
  }
}

export function isNoAuthOnlyOpenConnectorProvider(provider: OpenConnectorProviderSummary): boolean {
  const authTypes = provider.auth.length > 0 ? provider.auth.map((auth) => auth.type) : provider.authTypes
  return authTypes.length === 0 || authTypes.every((authType) => authType === 'no_auth')
}

function pickUsableCredentialConnection(connections: OpenConnectorConnectionRecord[]): OpenConnectorConnectionRecord | undefined {
  const usableConnections = connections.filter(isUsableCredentialConnection)
  return usableConnections.find((connection) => connection.default) ?? usableConnections[0]
}

function isUsableCredentialConnection(connection: OpenConnectorConnectionRecord | undefined): connection is OpenConnectorConnectionRecord {
  return (
    connection != null &&
    connection.authType !== 'no_auth' &&
    connection.virtual !== true &&
    connection.configured !== false
  )
}

function providerHasOAuth(provider: OpenConnectorProviderSummary): boolean {
  return provider.auth.some((auth) => auth.type === 'oauth2') || provider.authTypes.includes('oauth2')
}

function oauthClientConfigured(service: string, oauthConfigs: OpenConnectorOAuthConfig[]): boolean {
  return oauthConfigs.some((config) => config.service === service && config.configured)
}

export function formatOpenConnectorDate(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function formatOpenConnectorDuration(durationMs: number | undefined): string {
  if (durationMs == null) return '—'
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}

export function compactOpenConnectorJson(value: unknown): string {
  if (value == null) return ''
  try {
    const text = JSON.stringify(value)
    return text.length > 120 ? `${text.slice(0, 117)}…` : text
  } catch {
    return String(value)
  }
}
