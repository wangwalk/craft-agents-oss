import type { FolderSourceConfig } from '../sources/types.ts';

export interface OpenConnectorProviderApp {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  commonActions: string[];
}

export type OpenConnectorAuthDefinition =
  | { type: 'no_auth' }
  | {
      type: 'api_key';
      label?: string;
      placeholder?: string;
      description?: string;
      extraFields?: OpenConnectorCredentialField[];
    }
  | { type: 'custom_credential'; fields: OpenConnectorCredentialField[] }
  | {
      type: 'oauth2';
      scopes: string[];
      clientConfigFields?: OpenConnectorCredentialField[];
    };

export interface OpenConnectorCredentialField {
  key: string;
  label: string;
  inputType: 'text' | 'password' | 'textarea' | 'json';
  required: boolean;
  secret: boolean;
  placeholder?: string;
  description?: string;
}

export type OpenConnectorJsonSchema = Record<string, unknown>;

export interface OpenConnectorActionDefinition {
  id: string;
  service: string;
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: OpenConnectorJsonSchema;
  outputSchema: OpenConnectorJsonSchema;
  execution: {
    locallyExecutable: boolean;
    catalogOnly: boolean;
    requiredAuthTypes: string[];
    noAuthRunnable: boolean;
    needsCredential: boolean;
  };
}

export type OpenConnectorActionSummary = Omit<OpenConnectorActionDefinition, 'inputSchema' | 'outputSchema'>;

export interface OpenConnectorProviderDefinition {
  service: string;
  displayName: string;
  categories: string[];
  authTypes: string[];
  auth: OpenConnectorAuthDefinition[];
  homepageUrl?: string;
  iconUrl?: string;
  actions: OpenConnectorActionDefinition[];
}

export type OpenConnectorProviderSummary = Omit<OpenConnectorProviderDefinition, 'actions'> & {
  actions: OpenConnectorActionSummary[];
};

export interface OpenConnectorConnectionRecord {
  id?: string;
  service: string;
  connectionName?: string;
  authType: string;
  configured?: boolean;
  virtual?: boolean;
  default?: boolean;
  profile?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface OpenConnectorOAuthConfig {
  service: string;
  configured: boolean;
  clientId: string | null;
  expectedRedirectUri?: string;
  auth?: Extract<OpenConnectorAuthDefinition, { type: 'oauth2' }>;
}

export interface OpenConnectorRuntimeTokenSummary {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface OpenConnectorRunLog {
  id: string;
  actionId: string;
  caller: 'http' | 'mcp' | 'web';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  inputSummary?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

export interface OpenConnectorRunLogPage {
  items: OpenConnectorRunLog[];
  nextCursor?: string;
}

export interface OpenConnectorAuthSession {
  authenticated: boolean;
  adminAuthConfigured: boolean;
}

export interface OpenConnectorAdminSnapshot {
  authSession: OpenConnectorAuthSession;
  providers: OpenConnectorProviderSummary[];
  connections: OpenConnectorConnectionRecord[];
  oauthConfigs: OpenConnectorOAuthConfig[];
  runtimeTokens: OpenConnectorRuntimeTokenSummary[];
  runs: OpenConnectorRunLogPage;
  healthOk: boolean;
}

export interface OpenConnectorRuntimeSnapshotRpcResult {
  success: boolean;
  data?: OpenConnectorAdminSnapshot;
  status?: number;
  error?: string;
}

export const OPENCONNECTOR_TEMPLATE_ID = 'openconnector';
export const DEFAULT_OPENCONNECTOR_MCP_URL = 'http://localhost:3001/mcp';

export const OPENCONNECTOR_PROVIDER_APPS: OpenConnectorProviderApp[] = [
  {
    id: 'umami',
    name: 'Umami',
    icon: '📊',
    tagline: 'Website analytics, pageviews, visitors, realtime traffic, and event metrics',
    commonActions: ['list_websites', 'get_website_stats', 'get_metrics', 'get_realtime'],
  },
  {
    id: 'beszel',
    name: 'Beszel',
    icon: '📈',
    tagline: 'Self-hosted systems, containers, and infrastructure monitoring data',
    commonActions: ['list_systems', 'get_system', 'list_containers', 'get_metrics'],
  },
  {
    id: 'dokploy',
    name: 'Dokploy',
    icon: '🚀',
    tagline: 'Self-hosted application deployments, projects, services, and runtime status',
    commonActions: ['list_projects', 'list_applications', 'get_application', 'get_deployments'],
  },
];

export function isOpenConnectorGatewaySource(config: Pick<FolderSourceConfig, 'provider' | 'slug' | 'name'>): boolean {
  return config.provider === 'openconnector' || config.slug === 'openconnector' || config.name.toLowerCase() === 'openconnector';
}

/**
 * Backward-compatible alias for callers that still operate in the Sources layer.
 * Prefer `isOpenConnectorGatewaySource` in new connector/gateway code.
 */
export const isOpenConnectorSource = isOpenConnectorGatewaySource;

export function normalizeOpenConnectorMcpUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_OPENCONNECTOR_MCP_URL;

  try {
    const url = new URL(trimmed);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/mcp';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

export function inferOpenConnectorProviderIdsFromToolNames(toolNames: string[]): string[] {
  const found = new Set<string>();

  for (const toolName of toolNames) {
    const normalized = toolName.toLowerCase();
    for (const app of OPENCONNECTOR_PROVIDER_APPS) {
      if (normalized === app.id || normalized.startsWith(`${app.id}.`) || normalized.startsWith(`${app.id}_`) || normalized.includes(`__${app.id}__`)) {
        found.add(app.id);
      }
    }
  }

  return Array.from(found);
}

export function getOpenConnectorGuide(): string {
  return `# OpenConnector

OpenConnector is a connector gateway that exposes SaaS and self-hosted provider actions to Craft Agent through MCP.

## Scope

Use this source when the user wants to work with tools exposed by OpenConnector, including provider apps such as Umami, Beszel, and Dokploy. Provider apps may appear as OpenConnector gateway-backed provider apps in the UI even though there is one underlying Craft Agent source.

## Guidelines

- Read this guide before using OpenConnector tools.
- Treat OpenConnector as a gateway: tools are grouped by provider app/action names.
- Prefer read-only list/get/search/query actions in Explore mode.
- For self-hosted deployments on another machine, remember that \`localhost\` means the machine running Craft Agent. Use an SSH tunnel or a remote HTTPS URL when needed.
- If an OpenConnector provider needs credentials, configure credentials inside OpenConnector rather than storing provider secrets directly in this source.

## Common provider apps

### Umami

Website analytics, pageviews, visitors, realtime traffic, metrics, and events. Self-hosted Umami commonly uses a login token rather than a Cloud API key.

### Beszel

Self-hosted systems, containers, and infrastructure monitoring data.

### Dokploy

Self-hosted deployment platform data such as projects, applications, deployments, and status.

## Examples

- List OpenConnector provider apps/actions.
- Use Umami to list websites and fetch last-7-day stats.
- Use Beszel to inspect system/container health.
- Use Dokploy to inspect deployment status.
`;
}
