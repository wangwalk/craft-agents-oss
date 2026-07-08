import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Server, Terminal, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DEFAULT_OPENCONNECTOR_MCP_URL,
  OPENCONNECTOR_TEMPLATE_ID,
  buildSourceConfigFromTemplate,
  getSourceTemplates,
  normalizeOpenConnectorMcpUrl,
} from '@craft-agent/shared/sources/source-templates'
import type { FolderSourceConfig } from '@craft-agent/shared/sources/types'

interface SourceTemplateDialogProps {
  open: boolean
  workspaceId: string | null | undefined
  onOpenChange: (open: boolean) => void
  onCreated?: (source: FolderSourceConfig) => void
  onCustomSource?: () => void
}

export function SourceTemplateDialog({ open, workspaceId, onOpenChange, onCreated, onCustomSource }: SourceTemplateDialogProps) {
  const { t } = useTranslation()
  const templates = React.useMemo(() => getSourceTemplates(), [])
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(OPENCONNECTOR_TEMPLATE_ID)
  const [mode, setMode] = React.useState<'local' | 'remote'>('local')
  const [url, setUrl] = React.useState(DEFAULT_OPENCONNECTOR_MCP_URL)
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setSelectedTemplateId(OPENCONNECTOR_TEMPLATE_ID)
    setMode('local')
    setUrl(DEFAULT_OPENCONNECTOR_MCP_URL)
    setCreating(false)
  }, [open])

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0]
  const normalizedUrl = normalizeOpenConnectorMcpUrl(url)

  const createSource = async () => {
    if (!workspaceId || !selectedTemplate) return
    setCreating(true)
    try {
      const input = buildSourceConfigFromTemplate({
        templateId: selectedTemplate.id,
        url: normalizedUrl,
        setupMode: mode,
      })
      const source = await window.electronAPI.createSource(workspaceId, input)
      toast.success(t('sourceTemplates.created', { name: source.name }))
      onCreated?.(source)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('sourceTemplates.createFailed')
      toast.error(message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('sourceTemplates.title')}</DialogTitle>
          <DialogDescription>{t('sourceTemplates.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {templates.map((template) => {
              const selected = template.id === selectedTemplateId
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={cn(
                    'w-full rounded-[10px] border border-border/60 bg-background/70 p-3 text-left transition-colors hover:bg-foreground/[0.03]',
                    selected && 'border-accent/60 bg-accent/5',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-foreground/[0.04] text-lg">{template.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>{template.name}</span>
                        {selected && <Check className="h-3.5 w-3.5 text-accent" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.tagline}</p>
                    </div>
                  </div>
                </button>
              )
            })}

            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onCustomSource?.()
              }}
              className="w-full rounded-[10px] border border-dashed border-border/70 p-3 text-left text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.03]"
            >
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Wand2 className="h-3.5 w-3.5" />
                {t('sourceTemplates.customTitle')}
              </div>
              <p className="mt-1">{t('sourceTemplates.customDescription')}</p>
            </button>
          </div>

          <div className="space-y-4 rounded-[12px] border border-border/60 bg-foreground/[0.02] p-4">
            {selectedTemplate && (
              <>
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="text-lg">{selectedTemplate.icon}</span>
                    {selectedTemplate.name}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedTemplate.description}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('local')
                      setUrl(DEFAULT_OPENCONNECTOR_MCP_URL)
                    }}
                    className={cn(
                      'rounded-[10px] border p-3 text-left transition-colors',
                      mode === 'local' ? 'border-accent/60 bg-accent/5' : 'border-border/60 bg-background/70 hover:bg-foreground/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium"><Terminal className="h-4 w-4" />{t('sourceTemplates.localTunnel')}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{t('sourceTemplates.localTunnelDescription')}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('remote')}
                    className={cn(
                      'rounded-[10px] border p-3 text-left transition-colors',
                      mode === 'remote' ? 'border-accent/60 bg-accent/5' : 'border-border/60 bg-background/70 hover:bg-foreground/[0.03]',
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium"><Server className="h-4 w-4" />{t('sourceTemplates.remoteHttps')}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{t('sourceTemplates.remoteHttpsDescription')}</p>
                  </button>
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">{t('sourceTemplates.mcpUrl')}</span>
                  <input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder={DEFAULT_OPENCONNECTOR_MCP_URL}
                    className="h-9 w-full rounded-[8px] border border-border/70 bg-background px-3 text-sm outline-none transition-colors focus:border-accent/70"
                  />
                </label>

                <div className="rounded-[10px] bg-background/70 p-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{t('sourceTemplates.macHintTitle')}</div>
                  <p className="mt-1">{t('sourceTemplates.macHintDescription')}</p>
                  <code className="mt-2 block overflow-x-auto rounded bg-foreground/[0.05] px-2 py-1 text-[11px]">
                    ssh -N -L 3001:127.0.0.1:3001 user@server
                  </code>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={creating}>{t('common.cancel')}</Button>
          <Button onClick={createSource} disabled={creating || !workspaceId || !selectedTemplate}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('sourceTemplates.addButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
