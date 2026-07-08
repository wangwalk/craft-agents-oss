import type { CreateSourceInput, FolderSourceConfig, McpSourceConfig, SourceType } from './types.ts';

export type SourceTemplateSetupMode = 'local' | 'remote';

export interface SourceTemplateSetupField {
  key: string;
  label: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}

export interface SourceTemplate {
  id: string;
  name: string;
  provider: string;
  type: SourceType;
  icon: string;
  tagline: string;
  description: string;
  category: 'built-in' | 'custom';
  setupFields: SourceTemplateSetupField[];
}

export interface BuildSourceTemplateInput {
  templateId: string;
  url?: string;
  setupMode?: SourceTemplateSetupMode;
}

export interface OpenConnectorProviderApp {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  commonActions: string[];
}

export const OPENCONNECTOR_TEMPLATE_ID = 'openconnector';
export const DEFAULT_OPENCONNECTOR_MCP_URL = 'http://localhost:3001/mcp';

export const OPENCONNECTOR_PROVIDER_APPS: OpenConnectorProviderApp[] = [
  {
    id: 'umami',
    name: 'Umami',
    icon: '📊',
    tagline: 'Website analytics, pageviews, visitors, realtime traffic, and event metrics',
    commonActions: ['list_websites', 'get_website_stats', 'get_website_metrics', 'get_realtime'],
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

export const SOURCE_TEMPLATES: SourceTemplate[] = [
  {
    id: OPENCONNECTOR_TEMPLATE_ID,
    name: 'OpenConnector',
    provider: 'openconnector',
    type: 'mcp',
    icon: '🔌',
    tagline: 'Connector gateway for SaaS and self-hosted tools through MCP',
    description:
      'Connect Craft Agent to OpenConnector once, then access provider apps such as Umami, Beszel, Dokploy, and other OpenConnector actions.',
    category: 'built-in',
    setupFields: [
      {
        key: 'url',
        label: 'MCP URL',
        description: 'Use localhost when OpenConnector runs on this Mac or through an SSH tunnel. Use HTTPS for a remote deployment.',
        placeholder: DEFAULT_OPENCONNECTOR_MCP_URL,
        defaultValue: DEFAULT_OPENCONNECTOR_MCP_URL,
        required: true,
      },
    ],
  },
];

export function getSourceTemplates(): SourceTemplate[] {
  return SOURCE_TEMPLATES;
}

export function getSourceTemplate(templateId: string): SourceTemplate | undefined {
  return SOURCE_TEMPLATES.find((template) => template.id === templateId);
}

export function buildSourceConfigFromTemplate(input: BuildSourceTemplateInput): CreateSourceInput {
  if (input.templateId !== OPENCONNECTOR_TEMPLATE_ID) {
    throw new Error(`Unknown source template: ${input.templateId}`);
  }

  const url = normalizeOpenConnectorMcpUrl(input.url || DEFAULT_OPENCONNECTOR_MCP_URL);
  const mcp: McpSourceConfig = {
    transport: 'http',
    url,
    authType: 'none',
  };

  return {
    name: 'OpenConnector',
    provider: 'openconnector',
    type: 'mcp',
    enabled: true,
    icon: '🔌',
    tagline: 'Connector gateway for SaaS and self-hosted tools through MCP',
    mcp,
  };
}

export function isOpenConnectorSource(config: Pick<FolderSourceConfig, 'provider' | 'slug' | 'name'>): boolean {
  return config.provider === 'openconnector' || config.slug === 'openconnector' || config.name.toLowerCase() === 'openconnector';
}

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

Use this source when the user wants to work with tools exposed by OpenConnector, including provider apps such as Umami, Beszel, and Dokploy. Provider apps may appear as OpenConnector sub-integrations in the UI even though there is one underlying Craft Agent source.

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
