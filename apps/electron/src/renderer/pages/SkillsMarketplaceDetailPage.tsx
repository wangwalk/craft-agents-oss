import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ExternalLink, FileText, Store, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Info_Markdown, Info_Page, Info_Section, Info_Table } from '@/components/info'
import { navigate, routes } from '@/lib/navigate'
import type { MarketplaceSkillDetail, MarketplaceSkillSummary } from '../../shared/types'

interface SkillsMarketplaceDetailPageProps {
  source: string
  skillId: string
  workspaceId: string
  workingDirectory?: string
}

const GITHUB_SOURCE_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function marketplaceUrl(source: string, skillId: string): string {
  return GITHUB_SOURCE_RE.test(source)
    ? `https://skills.sh/${source}/${skillId}`
    : `https://skills.sh/site/${encodeURIComponent(source)}/${encodeURIComponent(skillId)}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function SkillsMarketplaceDetailPage({
  source,
  skillId,
  workspaceId,
  workingDirectory,
}: SkillsMarketplaceDetailPageProps) {
  const { t } = useTranslation()
  const [summary, setSummary] = React.useState<MarketplaceSkillSummary | null>(null)
  const [detail, setDetail] = React.useState<MarketplaceSkillDetail | null>(null)
  const [installed, setInstalled] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [installing, setInstalling] = React.useState(false)
  const installable = GITHUB_SOURCE_RE.test(source) && /^[a-z0-9][a-z0-9-]*$/.test(skillId)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const [results, localSkills] = await Promise.all([
          window.electronAPI.searchMarketplaceSkills(skillId),
          window.electronAPI.getSkills(workspaceId, workingDirectory),
        ])
        if (cancelled) return
        const found = results.find((item) => item.source === source && item.skillId === skillId) ?? {
          source,
          skillId,
          name: skillId,
          installs: 0,
          installable,
          marketplaceUrl: marketplaceUrl(source, skillId),
        }
        setSummary(found)
        setInstalled(localSkills.some((skill) => skill.slug === skillId))
        if (installable) {
          const nextDetail = await window.electronAPI.getMarketplaceSkillDetail(
            source,
            skillId,
            found.name,
            found.installs,
          )
          if (!cancelled) setDetail(nextDetail)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('skillsMarketplace.failedToLoad'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [source, skillId, workspaceId, workingDirectory, installable, t])

  const install = async () => {
    setInstalling(true)
    try {
      await window.electronAPI.installMarketplaceSkill(workspaceId, source, skillId, workingDirectory)
      setInstalled(true)
      setConfirmOpen(false)
      toast.success(t('skillsMarketplace.installSuccess', { name: summary?.name ?? skillId }))
      navigate(routes.view.skills(skillId))
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      const remoteServerNeedsUpdate = message.includes('No handler for: skills:marketplaceInstall')
        || message.includes('CHANNEL_NOT_FOUND')
      toast.error(t('skillsMarketplace.installFailed'), {
        description: remoteServerNeedsUpdate
          ? t('skillsMarketplace.remoteInstallRequiresUpdate')
          : message || undefined,
      })
    } finally {
      setInstalling(false)
    }
  }

  const openExternal = (url: string) => window.electronAPI.openUrl(url)
  const title = summary?.name ?? skillId

  return (
    <>
      <Info_Page loading={loading} error={error ?? undefined}>
        <Info_Page.Header title={title} />
        {!loading && !error && summary && (
          <Info_Page.Content>
            <Info_Page.Hero
              avatar={
                <span className="flex h-full w-full items-center justify-center rounded-[18px] bg-foreground/5 text-muted-foreground">
                  <Zap className="h-8 w-8" />
                </span>
              }
              title={title}
              tagline={detail?.description || t('skillsMarketplace.hostedBy', { source })}
            />

            <div className="flex flex-wrap gap-2 px-4">
              {installed ? (
                <Button onClick={() => navigate(routes.view.skills(skillId))}>
                  {t('skillsMarketplace.viewInstalled')}
                </Button>
              ) : installable ? (
                <Button onClick={() => setConfirmOpen(true)}>
                  {t('skillsMarketplace.install')}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => openExternal(summary.marketplaceUrl)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('skillsMarketplace.openOnSkillsSh')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => openExternal(summary.marketplaceUrl)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                skills.sh
              </Button>
            </div>

            <Info_Section title={t('skillsMarketplace.metadata')}>
              <Info_Table>
                <Info_Table.Row label={t('common.source')}>{source}</Info_Table.Row>
                <Info_Table.Row label={t('common.slug')}>{skillId}</Info_Table.Row>
                <Info_Table.Row label={t('skillsMarketplace.installs')}>
                  {summary.installs.toLocaleString()}
                </Info_Table.Row>
                <Info_Table.Row label={t('skillsMarketplace.installStatus')}>
                  {installed ? t('skillsMarketplace.installed') : t('skillsMarketplace.notInstalled')}
                </Info_Table.Row>
              </Info_Table>
            </Info_Section>

            {!installable && (
              <Info_Section title={t('skillsMarketplace.externalSkill')}>
                <div className="m-4 rounded-[8px] border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
                  {t('skillsMarketplace.externalSkillDescription')}
                </div>
              </Info_Section>
            )}

            {detail && (
              <>
                <Info_Section title={t('skillInfo.instructions')}>
                  <Info_Markdown maxHeight={540} fullscreen>
                    {detail.content}
                  </Info_Markdown>
                </Info_Section>

                <Info_Section title={t('skillsMarketplace.files', { count: detail.files.length })}>
                  <div className="max-h-72 overflow-y-auto px-4 py-2">
                    {detail.files.map((file) => (
                      <div key={file.path} className="flex items-center gap-2 border-b border-border/30 py-2 text-xs last:border-0">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                      </div>
                    ))}
                  </div>
                </Info_Section>
              </>
            )}
          </Info_Page.Content>
        )}
      </Info_Page>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              {t('skillsMarketplace.confirmTitle', { name: title })}
            </DialogTitle>
            <DialogDescription className="text-left">
              {t('skillsMarketplace.confirmDescription', { source })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 rounded-[8px] border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{t('skillsMarketplace.securityWarning')}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={installing} onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={installing} onClick={install}>
              {installing ? t('skillsMarketplace.installing') : t('skillsMarketplace.install')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
