import * as React from 'react'
import { Activity, AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, Copy, KeyRound, Loader2, PlayCircle, RefreshCw, Search, ShieldAlert, TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { navigate, routes } from '@/lib/navigate'
import { useOpenConnectorRuntime } from '@/hooks/useOpenConnectorRuntime'
import { useActiveWorkspace } from '@/context/AppShellContext'
import {
  compactOpenConnectorJson,
  createOpenConnectorOverviewSummary,
  openConnectorGet,
  formatOpenConnectorDate,
  formatOpenConnectorDuration,
  resolveOpenConnectorProviderConnectionStatus,
  type OpenConnectorActionDefinition,
  type OpenConnectorActionSummary,
  type OpenConnectorAppData,
  type OpenConnectorProviderSummary,
  type OpenConnectorRunLog,
  type OpenConnectorRuntimeTokenSummary,
} from '@/lib/openconnector-runtime'
import type { LoadedSource, OpenConnectorDetail, OpenConnectorSection } from '../../../shared/types'

export interface OpenConnectorConsolePageProps {
  section: OpenConnectorSection
  details: OpenConnectorDetail | null
}

export function OpenConnectorConsolePage({ section, details }: OpenConnectorConsolePageProps) {
  const runtime = useOpenConnectorRuntime()
  const activeWorkspace = useActiveWorkspace()
  const data = runtime.data
  const summary = createOpenConnectorOverviewSummary(data)
  const isRemoteRuntime = Boolean(activeWorkspace?.remoteServer)
  const canOpenConsole = Boolean(runtime.baseUrl && (!isRemoteRuntime || !isLoopbackUrl(runtime.baseUrl)))
  const externalBaseUrl = canOpenConsole ? runtime.baseUrl : null
  const runtimeLabel = isRemoteRuntime
    ? `Remote runtime · ${activeWorkspace?.name ?? 'workspace'}`
    : 'Local runtime'

  const openRuntimeUrl = React.useCallback((path = '') => {
    if (!runtime.baseUrl || !canOpenConsole) return
    void window.electronAPI.openUrl(`${runtime.baseUrl}${path}`)
  }, [canOpenConsole, runtime.baseUrl])

  const headerTitle = sectionTitle(section)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">{headerTitle}</h1>
            {runtime.loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${runtime.error ? 'bg-destructive' : runtime.healthOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="truncate">{runtime.gatewaySource ? runtimeLabel : 'Gateway not configured'}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void runtime.refresh()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canOpenConsole}
            title={runtime.baseUrl && !canOpenConsole ? 'The console is bound to the remote host and is not directly reachable from this Mac.' : undefined}
            onClick={() => openRuntimeUrl()}
          >
            <ArrowUpRight className="h-4 w-4" />
            {isRemoteRuntime && !canOpenConsole ? 'Console on VPS' : 'Open Console'}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {!runtime.gatewaySource ? (
          <SetupEmptyState />
        ) : runtime.authSession && !runtime.authSession.authenticated ? (
          <LockedState baseUrl={externalBaseUrl} />
        ) : runtime.error ? (
          <RuntimeError message={runtime.error} baseUrl={externalBaseUrl} onOpen={() => openRuntimeUrl()} />
        ) : (
          <>
            {section === 'overview' ? <OverviewSection data={data} summary={summary} healthOk={runtime.healthOk} baseUrl={externalBaseUrl} onOpen={openRuntimeUrl} /> : null}
            {section === 'providers' ? <ProvidersSection data={data} selectedService={details?.type === 'provider' ? details.service : null} baseUrl={externalBaseUrl} /> : null}
            {section === 'actions' ? <ActionsSection data={data} selectedActionId={details?.type === 'action' ? details.actionId : null} baseUrl={externalBaseUrl} gatewaySource={runtime.gatewaySource} /> : null}
            {section === 'runs' ? <RunsSection runs={data.runs} /> : null}
            {section === 'api-keys' ? <ApiKeysSection tokens={data.runtimeTokens} baseUrl={externalBaseUrl} /> : null}
            {section === 'docs' ? <DocsSection baseUrl={externalBaseUrl} onOpen={openRuntimeUrl} /> : null}
          </>
        )}
      </div>
    </div>
  )
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
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
            <p className="mt-1 text-sm text-muted-foreground">
              {healthOk ? 'Catalog and admin APIs are reachable through Craft Server.' : 'Check the gateway and runtime process.'}
            </p>
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

type ProviderStatusFilter = 'all' | 'connected' | 'no-setup' | 'needs-setup'
type ProviderSort = 'recommended' | 'name' | 'actions'

const PROVIDER_PAGE_SIZE = 60

function ProvidersSection({ data, selectedService, baseUrl }: { data: OpenConnectorAppData; selectedService: string | null; baseUrl: string | null }) {
  const [query, setQuery] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<ProviderStatusFilter>('all')
  const [category, setCategory] = React.useState('all')
  const [sort, setSort] = React.useState<ProviderSort>('recommended')
  const [visibleCount, setVisibleCount] = React.useState(PROVIDER_PAGE_SIZE)
  const selected = selectedService ? data.providers.find((provider) => provider.service === selectedService) : null

  const categories = React.useMemo(() => Array.from(
    new Set(data.providers.flatMap((provider) => provider.categories)),
  ).sort((a, b) => a.localeCompare(b)), [data.providers])

  const providers = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return data.providers
      .filter((provider) => {
        const status = resolveOpenConnectorProviderConnectionStatus(provider, data.connections, data.oauthConfigs)
        if (needle && ![provider.service, provider.displayName, provider.categories.join(' ')].join(' ').toLowerCase().includes(needle)) return false
        if (category !== 'all' && !provider.categories.includes(category)) return false
        if (statusFilter === 'connected' && !status.connected) return false
        if (statusFilter === 'no-setup' && !status.noSetupRequired) return false
        if (statusFilter === 'needs-setup' && (status.connected || status.noSetupRequired)) return false
        return true
      })
      .sort((a, b) => {
        if (sort === 'actions') return b.actions.length - a.actions.length || a.displayName.localeCompare(b.displayName)
        if (sort === 'recommended') {
          const aStatus = resolveOpenConnectorProviderConnectionStatus(a, data.connections, data.oauthConfigs)
          const bStatus = resolveOpenConnectorProviderConnectionStatus(b, data.connections, data.oauthConfigs)
          const score = (status: typeof aStatus) => status.connected ? 2 : status.noSetupRequired ? 1 : 0
          const statusOrder = score(bStatus) - score(aStatus)
          if (statusOrder !== 0) return statusOrder
        }
        return a.displayName.localeCompare(b.displayName)
      })
  }, [category, data.connections, data.oauthConfigs, data.providers, query, sort, statusFilter])

  React.useEffect(() => {
    setVisibleCount(PROVIDER_PAGE_SIZE)
  }, [category, query, sort, statusFilter])

  if (selected) {
    return <ProviderDetail provider={selected} data={data} baseUrl={baseUrl} />
  }

  const visibleProviders = providers.slice(0, visibleCount)

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 space-y-3 bg-background/95 px-1 pb-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-64 flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder={`Search ${data.providers.length.toLocaleString()} providers`} />
          </div>
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none hover:bg-foreground/[0.025]"
          >
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select
            aria-label="Sort providers"
            value={sort}
            onChange={(event) => setSort(event.target.value as ProviderSort)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground outline-none hover:bg-foreground/[0.025]"
          >
            <option value="recommended">Recommended</option>
            <option value="name">Name</option>
            <option value="actions">Most actions</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <ProviderFilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</ProviderFilterChip>
            <ProviderFilterChip active={statusFilter === 'connected'} onClick={() => setStatusFilter('connected')}>Connected</ProviderFilterChip>
            <ProviderFilterChip active={statusFilter === 'no-setup'} onClick={() => setStatusFilter('no-setup')}>No setup</ProviderFilterChip>
            <ProviderFilterChip active={statusFilter === 'needs-setup'} onClick={() => setStatusFilter('needs-setup')}>Needs setup</ProviderFilterChip>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{providers.length.toLocaleString()} providers</span>
        </div>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {visibleProviders.map((provider) => {
          const status = resolveOpenConnectorProviderConnectionStatus(provider, data.connections, data.oauthConfigs)
          return (
            <button
              key={provider.service}
              type="button"
              onClick={() => navigate(routes.view.openConnector({ providerService: provider.service }))}
              className="group rounded-xl border border-border/55 bg-card p-3 text-left transition-all hover:border-border hover:bg-foreground/[0.025] hover:shadow-sm"
            >
              <div className="flex items-start gap-3">
                <ProviderIcon provider={provider} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-sm font-medium">{provider.displayName}</h3>
                    <ProviderStatusBadge status={status} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{provider.service}</p>
                  <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-1.5">
                    <span className="text-[11px] tabular-nums text-muted-foreground">{provider.actions.length} actions</span>
                    {provider.categories.slice(0, 2).map((item) => (
                      <span key={item} className="rounded-md bg-foreground/[0.045] px-1.5 py-0.5 text-[10px] text-muted-foreground">{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {visibleProviders.length < providers.length ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + PROVIDER_PAGE_SIZE)}>
            Load {Math.min(PROVIDER_PAGE_SIZE, providers.length - visibleProviders.length)} more
          </Button>
        </div>
      ) : null}
      {providers.length === 0 ? <MutedEmpty text="No providers match these filters." /> : null}
    </div>
  )
}

function ProviderFilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${active ? 'bg-foreground text-background' : 'bg-foreground/[0.045] text-muted-foreground hover:bg-foreground/[0.075] hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

function ProviderDetail({ provider, data, baseUrl }: { provider: OpenConnectorProviderSummary; data: OpenConnectorAppData; baseUrl: string | null }) {
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

function ActionsSection({ data, selectedActionId, baseUrl, gatewaySource }: { data: OpenConnectorAppData; selectedActionId: string | null; baseUrl: string | null; gatewaySource: LoadedSource | null }) {
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
    return <ActionDetail action={selected} baseUrl={baseUrl} gatewaySource={gatewaySource} />
  }

  return (
    <div className="space-y-4">
      <SearchBox value={query} onChange={setQuery} placeholder="Search actions" />
      <ActionList actions={filtered} />
      {filtered.length === 0 ? <MutedEmpty text="No actions match your search." /> : null}
    </div>
  )
}

function ActionList({ actions, compact = false }: { actions: OpenConnectorActionSummary[]; compact?: boolean }) {
  const pageSize = compact ? 24 : 100
  const [visibleCount, setVisibleCount] = React.useState(pageSize)
  const visibleActions = actions.slice(0, visibleCount)

  React.useEffect(() => {
    setVisibleCount(pageSize)
  }, [actions, pageSize])

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
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
          {visibleActions.map((action) => (
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
      {visibleActions.length < actions.length ? (
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            Showing {visibleActions.length.toLocaleString()} of {actions.length.toLocaleString()}
          </span>
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + pageSize)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ActionDetail({ action, baseUrl, gatewaySource }: { action: OpenConnectorActionSummary; baseUrl: string | null; gatewaySource: LoadedSource | null }) {
  const [definition, setDefinition] = React.useState<OpenConnectorActionDefinition | null>(null)
  const [definitionError, setDefinitionError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    setDefinition(null)
    setDefinitionError(null)
    if (!gatewaySource) return () => { active = false }

    void openConnectorGet<OpenConnectorActionDefinition>(
      gatewaySource,
      `/api/actions/${encodeURIComponent(action.id)}`,
    ).then((value) => {
      if (active) setDefinition(value)
    }).catch((error) => {
      if (active) setDefinitionError(error instanceof Error ? error.message : String(error))
    })

    return () => { active = false }
  }, [action.id, gatewaySource])

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
      {definition ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SchemaPanel title="Input schema" schema={definition.inputSchema} />
          <SchemaPanel title="Output schema" schema={definition.outputSchema} />
        </div>
      ) : definitionError ? (
        <SectionCard title="Action schemas"><p className="text-sm text-destructive">{definitionError}</p></SectionCard>
      ) : (
        <SectionCard title="Action schemas"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading schemas…</div></SectionCard>
      )}
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
    <label className="relative block w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-9" />
    </label>
  )
}

const providerLogoCache = new Map<string, string | null>()
const providerLogoRequests = new Map<string, Promise<string | null>>()

function resolveProviderLogo(cacheKey: string, provider: OpenConnectorProviderSummary): Promise<string | null> {
  const existing = providerLogoRequests.get(cacheKey)
  if (existing) return existing
  const request = window.electronAPI.getLogoUrl(provider.homepageUrl!, provider.service)
    .catch(() => null)
    .then((resolved) => {
      providerLogoCache.set(cacheKey, resolved)
      return resolved
    })
    .finally(() => providerLogoRequests.delete(cacheKey))
  providerLogoRequests.set(cacheKey, request)
  return request
}

function useProviderLogo(provider: OpenConnectorProviderSummary): string | null {
  const cacheKey = provider.iconUrl ?? provider.homepageUrl ?? provider.service
  const [logoUrl, setLogoUrl] = React.useState<string | null>(() => provider.iconUrl ?? providerLogoCache.get(cacheKey) ?? null)

  React.useEffect(() => {
    if (provider.iconUrl) {
      providerLogoCache.set(cacheKey, provider.iconUrl)
      setLogoUrl(provider.iconUrl)
      return
    }
    if (!provider.homepageUrl) {
      providerLogoCache.set(cacheKey, null)
      setLogoUrl(null)
      return
    }
    const cached = providerLogoCache.get(cacheKey)
    if (cached !== undefined) {
      setLogoUrl(cached)
      return
    }

    let cancelled = false
    void resolveProviderLogo(cacheKey, provider).then((resolved) => {
      if (!cancelled) setLogoUrl(resolved)
    })
    return () => { cancelled = true }
  }, [cacheKey, provider.homepageUrl, provider.iconUrl, provider.service])

  return logoUrl
}

function ProviderIcon({ provider, size = 'md' }: { provider: OpenConnectorProviderSummary; size?: 'md' | 'lg' }) {
  const resolvedLogo = useProviderLogo(provider)
  const [imageFailed, setImageFailed] = React.useState(false)
  const className = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-10 w-10 rounded-xl'

  React.useEffect(() => setImageFailed(false), [resolvedLogo])

  return (
    <div className={`${className} flex shrink-0 items-center justify-center overflow-hidden border border-border/40 bg-foreground/[0.04] text-xs font-semibold text-muted-foreground`}>
      {resolvedLogo && !imageFailed ? (
        <img src={resolvedLogo} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
      ) : provider.displayName.slice(0, 2).toUpperCase()}
    </div>
  )
}

function ProviderStatusBadge({ status }: { status: ReturnType<typeof resolveOpenConnectorProviderConnectionStatus> }) {
  if (status.connected) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Connected</span>
  if (status.noSetupRequired) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />No setup</span>
  if (status.oauthClientRequired) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />OAuth setup</span>
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />Needs setup</span>
}

function ExecutionBadge({ action }: { action: OpenConnectorActionSummary }) {
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
