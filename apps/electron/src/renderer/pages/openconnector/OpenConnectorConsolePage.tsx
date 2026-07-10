import * as React from 'react'
import { Activity, AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, Copy, KeyRound, Loader2, PlayCircle, RefreshCw, Search, ShieldAlert, TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { navigate, routes } from '@/lib/navigate'
import { useOpenConnectorRuntime } from '@/hooks/useOpenConnectorRuntime'
import {
  compactOpenConnectorJson,
  createOpenConnectorOverviewSummary,
  formatOpenConnectorDate,
  formatOpenConnectorDuration,
  resolveOpenConnectorProviderConnectionStatus,
  type OpenConnectorActionDefinition,
  type OpenConnectorAppData,
  type OpenConnectorProviderDefinition,
  type OpenConnectorRunLog,
  type OpenConnectorRuntimeTokenSummary,
} from '@/lib/openconnector-runtime'
import type { OpenConnectorDetail, OpenConnectorSection } from '../../../shared/types'

export interface OpenConnectorConsolePageProps {
  section: OpenConnectorSection
  details: OpenConnectorDetail | null
}

export function OpenConnectorConsolePage({ section, details }: OpenConnectorConsolePageProps) {
  const runtime = useOpenConnectorRuntime()
  const data = runtime.data
  const summary = createOpenConnectorOverviewSummary(data)

  const openRuntimeUrl = React.useCallback((path = '') => {
    if (!runtime.baseUrl) return
    void window.electronAPI.openUrl(`${runtime.baseUrl}${path}`)
  }, [runtime.baseUrl])

  const headerTitle = sectionTitle(section)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">OpenConnector · {headerTitle}</h1>
            {runtime.loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {runtime.baseUrl ? runtime.baseUrl : 'No OpenConnector gateway source configured'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void runtime.refresh()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" disabled={!runtime.baseUrl} onClick={() => openRuntimeUrl()}>
            <ArrowUpRight className="h-4 w-4" />
            Open Console
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {!runtime.gatewaySource ? (
          <SetupEmptyState />
        ) : runtime.authSession && !runtime.authSession.authenticated ? (
          <LockedState baseUrl={runtime.baseUrl} />
        ) : runtime.error ? (
          <RuntimeError message={runtime.error} baseUrl={runtime.baseUrl} onOpen={() => openRuntimeUrl()} />
        ) : (
          <>
            {section === 'overview' ? <OverviewSection data={data} summary={summary} healthOk={runtime.healthOk} baseUrl={runtime.baseUrl} onOpen={openRuntimeUrl} /> : null}
            {section === 'providers' ? <ProvidersSection data={data} selectedService={details?.type === 'provider' ? details.service : null} baseUrl={runtime.baseUrl} /> : null}
            {section === 'actions' ? <ActionsSection data={data} selectedActionId={details?.type === 'action' ? details.actionId : null} baseUrl={runtime.baseUrl} /> : null}
            {section === 'runs' ? <RunsSection runs={data.runs} /> : null}
            {section === 'api-keys' ? <ApiKeysSection tokens={data.runtimeTokens} baseUrl={runtime.baseUrl} /> : null}
            {section === 'docs' ? <DocsSection baseUrl={runtime.baseUrl} onOpen={openRuntimeUrl} /> : null}
          </>
        )}
      </div>
    </div>
  )
}

function sectionTitle(section: OpenConnectorSection): string {
  switch (section) {
    case 'overview': return 'Overview'
    case 'providers': return 'Providers'
    case 'actions': return 'Actions'
    case 'runs': return 'Runs'
    case 'api-keys': return 'API Keys'
    case 'docs': return 'Docs'
  }
}

function SetupEmptyState() {
  return (
    <EmptyPanel
      icon={<TerminalSquare className="h-8 w-8" />}
      title="OpenConnector gateway is not configured"
      description="Add or enable the hidden OpenConnector MCP gateway source to expose the runtime console, provider catalog, action registry, runs, and API keys inside Craft."
    />
  )
}

function LockedState({ baseUrl }: { baseUrl: string | null }) {
  return (
    <EmptyPanel
      icon={<ShieldAlert className="h-8 w-8" />}
      title="OpenConnector admin console is locked"
      description="This runtime requires an admin token. Open the external console to unlock it, then refresh this Craft page. Native admin-token entry can be added in a later pass."
      action={baseUrl ? <Button onClick={() => void window.electronAPI.openUrl(baseUrl)}>Open Console</Button> : null}
    />
  )
}

function RuntimeError({ message, baseUrl, onOpen }: { message: string; baseUrl: string | null; onOpen: () => void }) {
  return (
    <EmptyPanel
      icon={<AlertCircle className="h-8 w-8" />}
      title="OpenConnector runtime is unavailable"
      description={message}
      action={baseUrl ? <Button onClick={onOpen}>Open Console</Button> : null}
    />
  )
}

function OverviewSection({
  data,
  summary,
  healthOk,
  baseUrl,
  onOpen,
}: {
  data: OpenConnectorAppData
  summary: ReturnType<typeof createOpenConnectorOverviewSummary>
  healthOk: boolean
  baseUrl: string | null
  onOpen: (path?: string) => void
}) {
  const recentRuns = data.runs.slice(0, 6)
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {healthOk ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-amber-500" />}
              <h2 className="text-base font-semibold">Runtime {healthOk ? 'ready' : 'reachable via admin API'}</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{baseUrl ?? 'No runtime URL resolved'}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!baseUrl} onClick={() => onOpen('/docs')}>Docs</Button>
            <Button variant="outline" size="sm" disabled={!baseUrl} onClick={() => onOpen('/openapi.json')}>OpenAPI</Button>
            <Button variant="outline" size="sm" disabled={!baseUrl} onClick={() => onOpen('/mcp/tools')}>MCP Tools</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Providers" value={summary.providerCount} meta={`${summary.connectedCount} connected`} />
        <MetricCard label="Actions" value={summary.actionCount} meta={`${summary.locallyExecutableActionCount} locally executable`} />
        <MetricCard label="Runs" value={data.runs.length} meta={`${summary.failedRunCount} recent failures`} />
        <MetricCard label="API Keys" value={summary.activeTokenCount} meta="runtime tokens" />
        <MetricCard label="Gateway" value={healthOk ? 'OK' : 'Check'} meta="health endpoint" />
      </div>

      <SectionCard title="Recent runs" action={<Button variant="outline" size="sm" onClick={() => navigate(routes.view.openConnector({ section: 'runs' }))}>View all</Button>}>
        {recentRuns.length === 0 ? <MutedEmpty text="No OpenConnector runs recorded yet." /> : <RunsTable runs={recentRuns} compact />}
      </SectionCard>
    </div>
  )
}

function ProvidersSection({ data, selectedService, baseUrl }: { data: OpenConnectorAppData; selectedService: string | null; baseUrl: string | null }) {
  const [query, setQuery] = React.useState('')
  const providers = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.providers
      .filter((provider) => {
        if (!needle) return true
        return [provider.service, provider.displayName, provider.categories.join(' ')].join(' ').toLowerCase().includes(needle)
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [data.providers, query])
  const selected = selectedService ? data.providers.find((provider) => provider.service === selectedService) : null

  if (selected) {
    return <ProviderDetail provider={selected} data={data} baseUrl={baseUrl} />
  }

  return (
    <div className="space-y-4">
      <SearchBox value={query} onChange={setQuery} placeholder="Search providers" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => {
          const status = resolveOpenConnectorProviderConnectionStatus(provider, data.connections, data.oauthConfigs)
          return (
            <button
              key={provider.service}
              type="button"
              onClick={() => navigate(routes.view.openConnector({ providerService: provider.service }))}
              className="rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm transition-colors hover:bg-foreground/[0.03]"
            >
              <div className="flex items-start gap-3">
                <ProviderIcon provider={provider} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold">{provider.displayName}</h3>
                    <ProviderStatusBadge status={status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{provider.service}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{provider.actions.length} actions</Badge>
                    {provider.categories.slice(0, 2).map((category) => <Badge key={category} variant="outline">{category}</Badge>)}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {providers.length === 0 ? <MutedEmpty text="No providers match your search." /> : null}
    </div>
  )
}

function ProviderDetail({ provider, data, baseUrl }: { provider: OpenConnectorProviderDefinition; data: OpenConnectorAppData; baseUrl: string | null }) {
  const status = resolveOpenConnectorProviderConnectionStatus(provider, data.connections, data.oauthConfigs)
  const oauthConfig = data.oauthConfigs.find((config) => config.service === provider.service)
  const relatedActions = provider.actions.slice().sort((a, b) => a.id.localeCompare(b.id))
  const askPrompt = `Use OpenConnector provider \`${provider.service}\`. Inspect its available actions, connection status, and suggest useful workflows for this Craft Agent workspace.`

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(routes.view.openConnector({ section: 'providers' }))}>← Providers</Button>
      <SectionCard
        title={provider.displayName}
        action={<ProviderStatusBadge status={status} />}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <ProviderIcon provider={provider} size="lg" />
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <div className="text-muted-foreground">Service: <span className="font-mono text-foreground">{provider.service}</span></div>
              <div className="text-muted-foreground">Auth: <span className="text-foreground">{provider.authTypes.join(', ') || 'no_auth'}</span></div>
              <div className="text-muted-foreground">Connection: <span className="text-foreground">{status.connection?.connectionName ?? (status.noSetupRequired ? 'No setup required' : 'Not connected')}</span></div>
              {oauthConfig ? <div className="text-muted-foreground">OAuth client: <span className="text-foreground">{oauthConfig.configured ? 'configured' : 'not configured'}</span></div> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate(routes.action.newSession({ input: askPrompt }))}>
              <PlayCircle className="h-4 w-4" />
              Ask Agent
            </Button>
            {baseUrl ? <Button variant="outline" size="sm" onClick={() => void window.electronAPI.openUrl(`${baseUrl}/providers/${provider.service}`)}>Open in Console</Button> : null}
            {provider.homepageUrl ? <Button variant="outline" size="sm" onClick={() => void window.electronAPI.openUrl(provider.homepageUrl!)}>Homepage</Button> : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Actions (${relatedActions.length})`}>
        <ActionList actions={relatedActions} compact />
      </SectionCard>
    </div>
  )
}

function ActionsSection({ data, selectedActionId, baseUrl }: { data: OpenConnectorAppData; selectedActionId: string | null; baseUrl: string | null }) {
  const [query, setQuery] = React.useState('')
  const actions = React.useMemo(() => data.providers.flatMap((provider) => provider.actions), [data.providers])
  const selected = selectedActionId ? actions.find((action) => action.id === selectedActionId) : null
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return actions
      .filter((action) => {
        if (!needle) return true
        return [action.id, action.service, action.name, action.description].join(' ').toLowerCase().includes(needle)
      })
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [actions, query])

  if (selected) {
    return <ActionDetail action={selected} baseUrl={baseUrl} />
  }

  return (
    <div className="space-y-4">
      <SearchBox value={query} onChange={setQuery} placeholder="Search actions" />
      <ActionList actions={filtered} />
      {filtered.length === 0 ? <MutedEmpty text="No actions match your search." /> : null}
    </div>
  )
}

function ActionList({ actions, compact = false }: { actions: OpenConnectorActionDefinition[]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border/60 bg-foreground/[0.02] text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Action</th>
            {!compact ? <th className="px-4 py-3 font-medium">Provider</th> : null}
            <th className="px-4 py-3 font-medium">Runtime</th>
            <th className="px-4 py-3 font-medium">Auth</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={action.id} className="border-b border-border/40 last:border-0">
              <td className="px-4 py-3">
                <button type="button" className="text-left hover:underline" onClick={() => navigate(routes.view.openConnector({ actionId: action.id }))}>
                  <div className="font-mono text-xs font-medium">{action.id}</div>
                  <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{action.description}</div>
                </button>
              </td>
              {!compact ? <td className="px-4 py-3 font-mono text-xs">{action.service}</td> : null}
              <td className="px-4 py-3"><ExecutionBadge action={action} /></td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{action.execution.noAuthRunnable ? 'No auth' : action.execution.needsCredential ? 'Credential' : action.execution.requiredAuthTypes.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActionDetail({ action, baseUrl }: { action: OpenConnectorActionDefinition; baseUrl: string | null }) {
  const askPrompt = `Use OpenConnector action \`${action.id}\`. First inspect its guide and input schema, then ask me for any missing inputs before execution.`
  const guideUrl = baseUrl ? `${baseUrl}/api/actions/${action.id}/agent.md` : null
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(routes.view.openConnector({ section: 'actions' }))}>← Actions</Button>
      <SectionCard title={action.id} action={<ExecutionBadge action={action} />}>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{action.description || 'No description provided.'}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Provider: {action.service}</Badge>
            {action.requiredScopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => navigate(routes.action.newSession({ input: askPrompt }))}>
              <PlayCircle className="h-4 w-4" />
              Ask Agent
            </Button>
            {guideUrl ? <Button variant="outline" size="sm" onClick={() => void copyText(guideUrl, 'Action guide URL copied')}> <Copy className="h-4 w-4" /> Copy guide URL</Button> : null}
            {guideUrl ? <Button variant="outline" size="sm" onClick={() => void window.electronAPI.openUrl(guideUrl)}>Open guide</Button> : null}
          </div>
        </div>
      </SectionCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <SchemaPanel title="Input schema" schema={action.inputSchema} />
        <SchemaPanel title="Output schema" schema={action.outputSchema} />
      </div>
    </div>
  )
}

function RunsSection({ runs }: { runs: OpenConnectorRunLog[] }) {
  if (runs.length === 0) return <MutedEmpty text="No OpenConnector runs recorded yet." />
  return <RunsTable runs={runs} />
}

function RunsTable({ runs, compact = false }: { runs: OpenConnectorRunLog[]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border/60 bg-foreground/[0.02] text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Action</th>
            {!compact ? <th className="px-4 py-3 font-medium">Caller</th> : null}
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Duration</th>
            {!compact ? <th className="px-4 py-3 font-medium">Input</th> : null}
            {!compact ? <th className="px-4 py-3 font-medium">Error</th> : null}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-border/40 last:border-0">
              <td className="px-4 py-3 font-mono text-xs">{run.actionId}</td>
              {!compact ? <td className="px-4 py-3 font-mono text-xs">{run.caller}</td> : null}
              <td className="px-4 py-3">{run.ok ? <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Success</Badge> : <Badge variant="destructive">Failed</Badge>}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{formatOpenConnectorDate(run.startedAt)}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{formatOpenConnectorDuration(run.durationMs)}</td>
              {!compact ? <td className="max-w-64 truncate px-4 py-3 font-mono text-xs text-muted-foreground">{compactOpenConnectorJson(run.inputSummary)}</td> : null}
              {!compact ? <td className="max-w-64 truncate px-4 py-3 text-xs text-muted-foreground">{run.errorMessage ?? run.errorCode ?? ''}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ApiKeysSection({ tokens, baseUrl }: { tokens: OpenConnectorRuntimeTokenSummary[]; baseUrl: string | null }) {
  return (
    <SectionCard
      title="Runtime API keys"
      action={baseUrl ? <Button variant="outline" size="sm" onClick={() => void window.electronAPI.openUrl(`${baseUrl}/access`)}>Manage in Console</Button> : null}
    >
      {tokens.length === 0 ? <MutedEmpty text="No runtime tokens found." /> : (
        <div className="space-y-2">
          {tokens.map((token) => (
            <div key={token.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{token.name}</div>
                <div className="text-xs text-muted-foreground">Created {formatOpenConnectorDate(token.createdAt)} · Last used {formatOpenConnectorDate(token.lastUsedAt)}</div>
              </div>
              <Badge variant="outline">{token.id}</Badge>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function DocsSection({ baseUrl, onOpen }: { baseUrl: string | null; onOpen: (path?: string) => void }) {
  const items = [
    { title: 'Web Console', description: 'Full OpenConnector console for provider setup and debugging.', path: '' },
    { title: 'Docs', description: 'Runtime API and local documentation.', path: '/docs' },
    { title: 'OpenAPI', description: 'Importable OpenAPI specification for HTTP clients.', path: '/openapi.json' },
    { title: 'MCP Tools', description: 'Discovery-oriented MCP tool metadata.', path: '/mcp/tools' },
  ]
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <button key={item.title} type="button" disabled={!baseUrl} onClick={() => onOpen(item.path)} className="rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm transition-colors hover:bg-foreground/[0.03] disabled:opacity-50">
          <div className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" />{item.title}</div>
          <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
        </button>
      ))}
    </div>
  )
}

function MetricCard({ label, value, meta }: { label: string; value: React.ReactNode; meta: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
    </div>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" />
    </label>
  )
}

function ProviderIcon({ provider, size = 'md' }: { provider: OpenConnectorProviderDefinition; size?: 'md' | 'lg' }) {
  const className = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-10 w-10 rounded-xl'
  return (
    <div className={`${className} flex shrink-0 items-center justify-center overflow-hidden bg-foreground/[0.05] text-sm font-semibold`}>
      {provider.iconUrl ? <img src={provider.iconUrl} alt="" className="h-full w-full object-cover" /> : provider.displayName.slice(0, 2).toUpperCase()}
    </div>
  )
}

function ProviderStatusBadge({ status }: { status: ReturnType<typeof resolveOpenConnectorProviderConnectionStatus> }) {
  if (status.noSetupRequired) return <Badge variant="secondary">No setup</Badge>
  if (status.connected) return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Connected</Badge>
  if (status.oauthClientRequired) return <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">OAuth client</Badge>
  return <Badge variant="outline">Connect</Badge>
}

function ExecutionBadge({ action }: { action: OpenConnectorActionDefinition }) {
  if (action.execution.locallyExecutable) return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">Local</Badge>
  if (action.execution.catalogOnly) return <Badge variant="outline">Catalog only</Badge>
  return <Badge variant="secondary">Runtime</Badge>
}

function SchemaPanel({ title, schema }: { title: string; schema: Record<string, unknown> }) {
  return (
    <SectionCard title={title}>
      <pre className="max-h-[420px] overflow-auto rounded-xl bg-foreground/[0.04] p-4 text-xs leading-relaxed">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </SectionCard>
  )
}

function EmptyPanel({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-2xl border border-border/60 bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground/[0.05] text-muted-foreground">{icon}</div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  )
}

function MutedEmpty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">{text}</div>
}

async function copyText(text: string, successMessage: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  toast.success(successMessage)
}
