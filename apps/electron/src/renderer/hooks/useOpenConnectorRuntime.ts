import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { sourcesAtom } from '@/atoms/sources'
import {
  emptyOpenConnectorAppData,
  findOpenConnectorGatewaySource,
  loadOpenConnectorRuntimeSnapshot,
  resolveOpenConnectorRuntimeBaseUrl,
  type OpenConnectorRuntimeSnapshot,
} from '@/lib/openconnector-runtime'

export interface UseOpenConnectorRuntimeResult extends OpenConnectorRuntimeSnapshot {
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useOpenConnectorRuntime(): UseOpenConnectorRuntimeResult {
  const sources = useAtomValue(sourcesAtom)
  const gatewaySource = useMemo(() => findOpenConnectorGatewaySource(sources), [sources])
  const baseUrl = useMemo(() => resolveOpenConnectorRuntimeBaseUrl(gatewaySource), [gatewaySource])
  const [snapshot, setSnapshot] = useState<OpenConnectorRuntimeSnapshot>({
    baseUrl,
    gatewaySource,
    authSession: null,
    data: emptyOpenConnectorAppData,
    healthOk: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nextSnapshot = await loadOpenConnectorRuntimeSnapshot(gatewaySource)
      setSnapshot(nextSnapshot)
    } catch (caught) {
      setSnapshot({
        baseUrl,
        gatewaySource,
        authSession: null,
        data: emptyOpenConnectorAppData,
        healthOk: false,
      })
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [baseUrl, gatewaySource])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    ...snapshot,
    baseUrl: snapshot.baseUrl ?? baseUrl,
    gatewaySource: snapshot.gatewaySource ?? gatewaySource,
    loading,
    error,
    refresh,
  }
}
