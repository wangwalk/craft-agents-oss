import type { CreateSourceInput, McpSourceConfig, SourceType } from './types.ts';
import {
  DEFAULT_OPENCONNECTOR_MCP_URL,
  OPENCONNECTOR_TEMPLATE_ID,
  normalizeOpenConnectorMcpUrl,
} from '../connectors/openconnector.ts';
export {
  DEFAULT_OPENCONNECTOR_MCP_URL,
  OPENCONNECTOR_PROVIDER_APPS,
  OPENCONNECTOR_TEMPLATE_ID,
  getOpenConnectorGuide,
  inferOpenConnectorProviderIdsFromToolNames,
  isOpenConnectorGatewaySource,
  isOpenConnectorSource,
  normalizeOpenConnectorMcpUrl,
} from '../connectors/openconnector.ts';
export type { OpenConnectorProviderApp } from '../connectors/openconnector.ts';

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
