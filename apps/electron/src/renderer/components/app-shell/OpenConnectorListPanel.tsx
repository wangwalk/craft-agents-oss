import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Plug } from 'lucide-react'
import { deriveConnectionStatus } from '@/components/ui/source-status-indicator'
import { EntityPanel } from '@/components/ui/entity-panel'
import { EntityListBadge } from '@/components/ui/entity-list-badge'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { sourceSelection } from '@/hooks/useEntitySelection'
import type { OpenConnectorProviderItem } from '@/lib/openconnector'

const SOURCE_STATUS_CONFIG: Record<string, { labelKey: string; colorClass: string } | null> = {
  connected: null,
  needs_auth: { labelKey: 'sourcesList.statusAuthRequired', colorClass: 'bg-warning/10 text-warning' },
  failed: { labelKey: 'sourcesList.statusDisconnected', colorClass: 'bg-destructive/10 text-destructive' },
  untested: { labelKey: 'sourcesList.statusNotTested', colorClass: 'bg-foreground/10 text-foreground/50' },
  local_disabled: { labelKey: 'sourcesList.statusDisabled', colorClass: 'bg-foreground/10 text-foreground/50' },
}

export interface OpenConnectorListPanelProps {
  providerItems: OpenConnectorProviderItem[]
  selectedProviderItemId?: string | null
  onProviderClick: (providerItemId: string) => void
  onAddGateway?: () => void
  localMcpEnabled?: boolean
  className?: string
}

export function OpenConnectorListPanel({
  providerItems,
  selectedProviderItemId,
  onProviderClick,
  onAddGateway,
  localMcpEnabled = true,
  className,
}: OpenConnectorListPanelProps) {
  const { t } = useTranslation()
  const { clearMultiSelect } = sourceSelection.useSelection()

  React.useEffect(() => {
    clearMultiSelect()
  }, [clearMultiSelect])

  return (
    <EntityPanel<OpenConnectorProviderItem>
      items={providerItems}
      getId={(item) => item.id}
      selection={sourceSelection}
      selectedId={selectedProviderItemId}
      onItemClick={(item) => onProviderClick(item.id)}
      className={className}
      multiSelect={false}
      containerProps={{ 'data-list-role': 'openconnector' }}
      emptyState={
        <EntityListEmptyScreen
          icon={<Plug />}
          title={t('openConnector.emptyTitle')}
          description={t('openConnector.emptyDescription')}
          docKey="sources"
        >
          {onAddGateway && (
            <button
              onClick={onAddGateway}
              className="inline-flex items-center h-7 px-3 text-xs font-medium rounded-[8px] bg-background shadow-minimal hover:bg-foreground/[0.03] transition-colors"
            >
              {t('openConnector.addGateway')}
            </button>
          )}
        </EntityListEmptyScreen>
      }
      mapItem={(provider) => {
        const connectionStatus = deriveConnectionStatus(provider.source, localMcpEnabled)
        const statusConfig = SOURCE_STATUS_CONFIG[connectionStatus]
        return {
          icon: (
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-foreground/[0.05] text-lg">
              {provider.providerApp.icon}
            </div>
          ),
          title: provider.providerApp.name,
          badges: (
            <>
              <EntityListBadge colorClass="bg-accent/10 text-accent">{t('sourcesList.typeOpenConnectorApp')}</EntityListBadge>
              {statusConfig && (
                <EntityListBadge colorClass={statusConfig.colorClass} tooltip={provider.source.config.connectionError || undefined} className="cursor-default">
                  {t(statusConfig.labelKey)}
                </EntityListBadge>
              )}
              <span className="truncate">
                {provider.providerApp.tagline}
              </span>
            </>
          ),
          trailing: (
            <span className="truncate text-xs text-muted-foreground">
              {t('sourceInfo.openConnectorActionCount', { count: provider.actionCount })}
            </span>
          ),
        }
      }}
    />
  )
}
