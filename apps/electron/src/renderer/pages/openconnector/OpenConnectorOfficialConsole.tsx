import * as React from 'react'
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { sourcesAtom } from '@/atoms/sources'
import { Button } from '@/components/ui/button'
import { hasOpenOverlay } from '@/lib/overlay-detection'
import { isMac } from '@/lib/platform'
import {
  findOpenConnectorGatewaySource,
  resolveOpenConnectorConsoleUrl,
} from '@/lib/openconnector'
import type { OpenConnectorConsoleViewBounds } from '../../../shared/types'

export function OpenConnectorOfficialConsole({
  compensateForStoplight = false,
}: {
  compensateForStoplight?: boolean
}) {
  const sources = useAtomValue(sourcesAtom)
  const gatewaySource = React.useMemo(() => findOpenConnectorGatewaySource(sources), [sources])
  const consoleUrl = React.useMemo(() => resolveOpenConnectorConsoleUrl(gatewaySource), [gatewaySource])
  const hostRef = React.useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [retryKey, setRetryKey] = React.useState(0)
  const topInset = compensateForStoplight && isMac ? 44 : 0

  React.useLayoutEffect(() => {
    const host = hostRef.current
    const api = window.electronAPI
    if (!host || !consoleUrl || !api || typeof api.showOpenConnectorConsole !== 'function') {
      setLoading(false)
      return
    }

    let disposed = false
    let attached = false
    let frame = 0
    let lastBounds = ''
    let overlayHidden = false
    let syncing = false
    let syncQueued = false

    const readBounds = (): OpenConnectorConsoleViewBounds | null => {
      const rect = host.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return null
      return {
        x: Math.max(0, Math.round(rect.left)),
        y: Math.max(0, Math.round(rect.top + topInset)),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height - topInset)),
      }
    }

    const sync = async () => {
      if (disposed) return
      if (syncing) {
        syncQueued = true
        return
      }
      syncing = true

      try {
        const obscured = document.visibilityState !== 'visible' || hasOpenOverlay()
        if (obscured) {
          if (attached && !overlayHidden) {
            overlayHidden = true
            await api.hideOpenConnectorConsole()
          }
          return
        }

        const bounds = readBounds()
        if (!bounds) return
        const serialized = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`

        if (!attached || overlayHidden) {
          overlayHidden = false
          setLoading(true)
          const result = await api.showOpenConnectorConsole({ url: consoleUrl, bounds })
          if (disposed || document.visibilityState !== 'visible' || hasOpenOverlay()) {
            await api.hideOpenConnectorConsole()
            return
          }
          if (!result.success) {
            attached = false
            setLoadError(result.error ?? 'Unable to load the official OpenConnector console.')
            setLoading(false)
            return
          }
          attached = true
          lastBounds = serialized
          setLoadError(null)
          setLoading(false)
          return
        }

        if (serialized !== lastBounds) {
          lastBounds = serialized
          await api.updateOpenConnectorConsoleBounds(bounds)
        }
      } finally {
        syncing = false
        if (syncQueued && !disposed) {
          syncQueued = false
          scheduleSync()
        }
      }
    }

    const scheduleSync = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => void sync())
    }

    const resizeObserver = new ResizeObserver(scheduleSync)
    resizeObserver.observe(host)
    if (host.parentElement) resizeObserver.observe(host.parentElement)

    const mutationObserver = new MutationObserver(scheduleSync)
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    })

    window.addEventListener('resize', scheduleSync)
    document.addEventListener('visibilitychange', scheduleSync)
    scheduleSync()

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', scheduleSync)
      document.removeEventListener('visibilitychange', scheduleSync)
      void api.hideOpenConnectorConsole()
    }
  }, [consoleUrl, retryKey, topInset])

  const retry = React.useCallback(() => {
    setLoadError(null)
    setLoading(true)
    void window.electronAPI.destroyOpenConnectorConsole().finally(() => {
      setRetryKey((value) => value + 1)
    })
  }, [])

  return (
    <div ref={hostRef} className="relative h-full min-h-0 w-full overflow-hidden bg-background">
      {topInset > 0 ? (
        <div className="absolute inset-x-0 top-0 flex h-11 items-center border-b border-border/40 pl-[84px] text-xs font-medium text-muted-foreground [-webkit-app-region:drag]">
          OpenConnector
        </div>
      ) : null}
      <div className="h-full" style={topInset > 0 ? { paddingTop: topInset } : undefined}>
        {!gatewaySource ? (
          <ConsoleMessage
            icon={<AlertCircle className="h-6 w-6" />}
            title="OpenConnector gateway is not configured"
            description="Add or enable the OpenConnector MCP gateway source to open its official console."
          />
        ) : !consoleUrl ? (
          <ConsoleMessage
            icon={<AlertCircle className="h-6 w-6" />}
            title="OpenConnector console URL is unavailable"
            description="The gateway source does not contain a usable HTTP MCP URL."
          />
        ) : loadError ? (
          <ConsoleMessage
            icon={<AlertCircle className="h-6 w-6" />}
            title="Official OpenConnector console could not be loaded"
            description={loadError}
            actions={
              <>
                <Button size="sm" onClick={retry}>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
                <Button variant="outline" size="sm" onClick={() => void window.electronAPI.openUrl(consoleUrl)}>
                  <ExternalLink className="h-4 w-4" />
                  Open in browser
                </Button>
              </>
            }
          />
        ) : loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading official OpenConnector console…
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ConsoleMessage({
  icon,
  title,
  description,
  actions,
}: {
  icon: React.ReactNode
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/[0.05] text-muted-foreground">
          {icon}
        </div>
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {actions ? <div className="mt-5 flex justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
