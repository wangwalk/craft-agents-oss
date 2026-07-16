import type { FolderSourceConfig } from '../sources/types.ts';

export const OPENCONNECTOR_TEMPLATE_ID = 'openconnector';
export const DEFAULT_OPENCONNECTOR_MCP_URL = 'http://localhost:3001/mcp';

export function isOpenConnectorGatewaySource(config: Pick<FolderSourceConfig, 'provider' | 'slug' | 'name'>): boolean {
  return config.provider === 'openconnector' || config.slug === 'openconnector' || config.name.toLowerCase() === 'openconnector';
}

/** Backward-compatible alias for callers that still operate in the Sources layer. */
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

export function getOpenConnectorGuide(): string {
  return `# OpenConnector

OpenConnector is a connector gateway that exposes SaaS and self-hosted provider actions to Craft Agent through MCP.

## Scope

Use this source when the user wants to work with tools exposed by OpenConnector. Provider management and authentication live in the official OpenConnector Web Console.

## Guidelines

- Read this guide before using OpenConnector tools.
- Treat OpenConnector as a gateway: tools are grouped by provider app/action names.
- Prefer read-only list/get/search/query actions in Explore mode.
- For self-hosted deployments on another machine, remember that \`localhost\` means the machine running Craft Agent. Use an SSH tunnel or a remote HTTPS URL when needed.
- Configure provider credentials inside OpenConnector rather than storing provider secrets directly in this source.
`;
}
