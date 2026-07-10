import * as React from 'react'
import { Activity, BookOpen, KeyRound, LayoutDashboard, ListChecks, Plug, ServerCog } from 'lucide-react'
import { EntityPanel } from '@/components/ui/entity-panel'
import { EntityListBadge } from '@/components/ui/entity-list-badge'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { sourceSelection } from '@/hooks/useEntitySelection'
import { useOpenConnectorRuntime } from '@/hooks/useOpenConnectorRuntime'
import { createOpenConnectorOverviewSummary } from '@/lib/openconnector-runtime'
import type { OpenConnectorSection } from '../../../shared/types'

interface OpenConnectorNavItem {
  id: OpenConnectorSection
  title: string
  description: string
  countLabel?: string
  icon: React.ReactNode
}

export interface OpenConnectorListPanelProps {
  selectedSection: OpenConnectorSection
  onSectionClick: (section: OpenConnectorSection) => void
  onAddGateway?: () => void
  className?: string
}

export function OpenConnectorListPanel({
  selectedSection,
  onSectionClick,
  onAddGateway,
  className,
}: OpenConnectorListPanelProps) {
  const { clearMultiSelect } = sourceSelection.useSelection()
  const runtime = useOpenConnectorRuntime()
  const summary = createOpenConnectorOverviewSummary(runtime.data)

  React.useEffect(() => {
    clearMultiSelect()
  }, [clearMultiSelect])

  const items = React.useMemo<OpenConnectorNavItem[]>(() => [
    {
      id: 'overview',
      title: 'Overview',
      description: runtime.healthOk ? 'Runtime is reachable' : 'Runtime status and setup',
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      id: 'providers',
      title: 'Providers',
      description: `${summary.connectedCount} connected`,
      countLabel: String(summary.providerCount),
      icon: <ServerCog className="h-4 w-4" />,
    },
    {
      id: 'actions',
      title: 'Actions',
      description: `${summary.locallyExecutableActionCount} locally executable`,
      countLabel: String(summary.actionCount),
      icon: <ListChecks className="h-4 w-4" />,
    },
    {
      id: 'runs',
      title: 'Runs',
      description: summary.failedRunCount > 0 ? `${summary.failedRunCount} recent failures` : 'Recent execution history',
      countLabel: String(runtime.data.runs.length),
      icon: <Activity className="h-4 w-4" />,
    },
    {
      id: 'api-keys',
      title: 'API Keys',
      description: 'Runtime access tokens',
      countLabel: String(summary.activeTokenCount),
      icon: <KeyRound className="h-4 w-4" />,
    },
    {
      id: 'docs',
      title: 'Docs',
      description: 'Console, OpenAPI and MCP metadata',
      icon: <BookOpen className="h-4 w-4" />,
    },
  ], [runtime.data.runs.length, runtime.healthOk, summary.actionCount, summary.activeTokenCount, summary.connectedCount, summary.failedRunCount, summary.locallyExecutableActionCount, summary.providerCount])

  return (
    <EntityPanel<OpenConnectorNavItem>
      items={items}
      getId={(item) => item.id}
      selection={sourceSelection}
      selectedId={selectedSection}
      onItemClick={(item) => onSectionClick(item.id)}
      className={className}
      multiSelect={false}
      containerProps={{ 'data-list-role': 'openconnector' }}
      emptyState={
        <EntityListEmptyScreen
          icon={<Plug />}
          title="OpenConnector runtime"
          description="Add or enable the OpenConnector gateway source to browse providers, actions, runs, and runtime API keys."
          docKey="sources"
        >
          {onAddGateway && (
            <button
              onClick={onAddGateway}
              className="inline-flex items-center h-7 px-3 text-xs font-medium rounded-[8px] bg-background shadow-minimal hover:bg-foreground/[0.03] transition-colors"
            >
              Add gateway
            </button>
          )}
        </EntityListEmptyScreen>
      }
      mapItem={(item) => ({
        icon: (
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-foreground/[0.05] text-muted-foreground">
            {item.icon}
          </div>
        ),
        title: item.title,
        badges: (
          <>
            <EntityListBadge colorClass={runtime.error ? 'bg-destructive/10 text-destructive' : 'bg-accent/10 text-accent'}>
              {item.id === 'overview' ? (runtime.error ? 'Offline' : 'Runtime') : 'OpenConnector'}
            </EntityListBadge>
            <span className="truncate">{item.description}</span>
          </>
        ),
        trailing: item.countLabel ? (
          <span className="truncate text-xs text-muted-foreground">{item.countLabel}</span>
        ) : null,
      })}
    />
  )
}
