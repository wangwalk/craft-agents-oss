import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Search, Store, Zap } from 'lucide-react'
import { EntityList } from '@/components/ui/entity-list'
import { EntityRow } from '@/components/ui/entity-row'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  LoadedSkill,
  MarketplaceSkillSummary,
  SkillsMarketplaceView,
} from '../../../shared/types'

interface SkillsMarketplacePanelProps {
  installedSkills: LoadedSkill[]
  selectedSource?: string
  selectedSkillId?: string
  onSkillClick: (skill: MarketplaceSkillSummary) => void
}

const VIEWS: SkillsMarketplaceView[] = ['all-time', 'trending', 'hot']

function formatInstalls(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function SkillsMarketplacePanel({
  installedSkills,
  selectedSource,
  selectedSkillId,
  onSkillClick,
}: SkillsMarketplacePanelProps) {
  const { t } = useTranslation()
  const [view, setView] = React.useState<SkillsMarketplaceView>('all-time')
  const [query, setQuery] = React.useState('')
  const [skills, setSkills] = React.useState<MarketplaceSkillSummary[]>([])
  const [page, setPage] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const installed = React.useMemo(() => new Set(installedSkills.map((skill) => skill.slug)), [installedSkills])
  const normalizedQuery = query.trim()

  React.useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        if (normalizedQuery.length >= 2) {
          const results = await window.electronAPI.searchMarketplaceSkills(normalizedQuery)
          if (cancelled) return
          setSkills(results)
          setHasMore(false)
        } else {
          const firstPage = await window.electronAPI.listMarketplaceSkills(view, 0)
          if (cancelled) return
          setSkills(firstPage.skills)
          setHasMore(firstPage.hasMore)
        }
        setPage(0)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('skillsMarketplace.failedToLoad'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, normalizedQuery.length >= 2 ? 250 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [normalizedQuery, view, reloadKey, t])

  const loadMore = async () => {
    if (loadingMore || !hasMore || normalizedQuery.length >= 2) return
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const result = await window.electronAPI.listMarketplaceSkills(view, nextPage)
      setSkills((current) => [...current, ...result.skills])
      setPage(nextPage)
      setHasMore(result.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('skillsMarketplace.failedToLoad'))
    } finally {
      setLoadingMore(false)
    }
  }

  const selectedId = selectedSource && selectedSkillId ? `${selectedSource}/${selectedSkillId}` : null

  return (
    <EntityList
      items={skills}
      getKey={(skill) => `${skill.source}/${skill.skillId}`}
      className="h-full"
      header={
        <div className="p-3 space-y-2 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('skillsMarketplace.searchPlaceholder')}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-[8px] bg-foreground/[0.04] p-1">
            {VIEWS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={cn(
                  'h-7 rounded-[6px] text-[11px] transition-colors',
                  view === item && normalizedQuery.length < 2
                    ? 'bg-background text-foreground shadow-minimal'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`skillsMarketplace.view.${item}`)}
              </button>
            ))}
          </div>
        </div>
      }
      emptyState={
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
          <Store className="h-7 w-7 opacity-50" />
          <p className="text-sm">{loading ? t('common.loading') : error ?? t('skillsMarketplace.noResults')}</p>
          {error && (
            <Button size="sm" variant="outline" onClick={() => setReloadKey((current) => current + 1)}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      }
      footer={hasMore ? (
        <div className="p-3 flex justify-center">
          <Button size="sm" variant="ghost" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? t('common.loading') : t('skillsMarketplace.loadMore')}
          </Button>
        </div>
      ) : undefined}
      renderItem={(skill, index) => {
        const isInstalled = installed.has(skill.skillId)
        return (
          <EntityRow
            icon={
              <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-foreground/5 text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
              </span>
            }
            title={skill.name}
            titleSuffix={skill.isOfficial ? <BadgeCheck className="h-3.5 w-3.5 text-blue-500" /> : undefined}
            badges={<span className="truncate">{skill.source}</span>}
            trailing={
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {isInstalled && <span>{t('skillsMarketplace.installed')}</span>}
                <span>{formatInstalls(skill.installs)}</span>
              </span>
            }
            isSelected={selectedId === `${skill.source}/${skill.skillId}`}
            showSeparator={index > 0}
            onClick={() => onSkillClick(skill)}
          />
        )
      }}
    />
  )
}
