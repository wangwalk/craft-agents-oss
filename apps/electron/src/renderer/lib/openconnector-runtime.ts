import type { LoadedSource } from '../../shared/types'
import { isOpenConnectorGatewaySource } from '@craft-agent/shared/connectors/openconnector'

export type OpenConnectorAuthDefinition =
  | { type: 'no_auth' }
  | {
      type: 'api_key'
      label?: string
      placeholder?: string
      description?: string
      extraFields?: OpenConnectorCredentialField[]
    }
  | { type: 'custom_credential'; fields: OpenConnectorCredentialField[] }
  | {
      type: 'oauth2'
      scopes: string[]
      clientConfigFields?: OpenConnectorCredentialField[]
    }

export interface OpenConnectorCredentialField {
  key: string
  label: string
  inputType: 'text' | 'password' | 'textarea' | 'json'
  required: boolean
  secret: boolean
  placeholder?: string
  description?: string
}

export type OpenConnectorJsonSchema = Record<string, unknown>

export interface OpenConnectorActionDefinition {
  id: string
  service: string
  name: string
  description: string
  requiredScopes: string[]
  inputSchema: OpenConnectorJsonSchema
  outputSchema: OpenConnectorJsonSchema
  execution: {
    locallyExecutable: boolean
    catalogOnly: boolean
    requiredAuthTypes: string[]
    noAuthRunnable: boolean
    needsCredential: boolean
  }
}

export interface OpenConnectorProviderDefinition {
  service: string
  displayName: string
  categories: string[]
  authTypes: string[]
  auth: OpenConnectorAuthDefinition[]
  homepageUrl?: string
  iconUrl?: string
  actions: OpenConnectorActionDefinition[]
}

export interface OpenConnectorConnectionRecord {
  id?: string
  service: string
  connectionName?: string
  authType: string
  configured?: boolean
  virtual?: boolean
  default?: boolean
  profile?: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

export interface OpenConnectorOAuthConfig {
  service: string
  configured: boolean
  clientId: string | null
  expectedRedirectUri?: string
  auth?: Extract<OpenConnectorAuthDefinition, { type: 'oauth2' }>
}

export interface OpenConnectorRuntimeTokenSummary {
  id: string
  name: string
  createdAt: string
  lastUsedAt?: string
}

export interface OpenConnectorRunLog {
  id: string
  actionId: string
  caller: 'http' | 'mcp' | 'web'
  startedAt: string
  completedAt: string
  durationMs: number
  ok: boolean
  inputSummary?: unknown
  errorCode?: string
  errorMessage?: string
}

export interface OpenConnectorRunLogPage {
  items: OpenConnectorRunLog[]
  nextCursor?: string
}

export interface OpenConnectorAuthSession {
  authenticated: boolean
  adminAuthConfigured: boolean
}

export interface OpenConnectorAppData {
  providers: OpenConnectorProviderDefinition[]
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

  const [providers, connections, oauthConfigs, runtimeTokens, runPage, healthOk] = await Promise.all([
    openConnectorGet<OpenConnectorProviderDefinition[]>(gatewaySource, '/api/providers', options),
    openConnectorGet<OpenConnectorConnectionRecord[]>(gatewaySource, '/api/connections', options),
    openConnectorGet<OpenConnectorOAuthConfig[]>(gatewaySource, '/api/oauth/configs', options),
    openConnectorGet<OpenConnectorRuntimeTokenSummary[]>(gatewaySource, '/api/runtime-tokens', options),
    openConnectorGet<OpenConnectorRunLogPage>(gatewaySource, '/api/runs', options),
    probeOpenConnectorHealth(gatewaySource, options),
  ])

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
  const result = await window.electronAPI.getOpenConnectorRuntimeJson(
    gatewaySource.workspaceId,
    gatewaySource.config.slug,
    path,
  )
  if (!result.success) {
    throw new OpenConnectorApiError(result.status ?? 0, result.error ?? 'OpenConnector request failed')
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
  provider: OpenConnectorProviderDefinition,
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

export function isNoAuthOnlyOpenConnectorProvider(provider: OpenConnectorProviderDefinition): boolean {
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

function providerHasOAuth(provider: OpenConnectorProviderDefinition): boolean {
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
