import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { sourcesAtom } from '@/atoms/sources'
import {
  emptyOpenConnectorAppData,
  findOpenConnectorGatewaySource,
  loadOpenConnectorRuntimeSnapshot,
  resolveOpenConnectorRuntimeBaseUrl,
  type OpenConnectorRuntimeSnapshot,
} from '@/lib/openconnector-runtime'
import type { LoadedSource } from '../../shared/types'

const snapshotCache = new Map<string, OpenConnectorRuntimeSnapshot>()
const snapshotRequests = new Map<string, Promise<OpenConnectorRuntimeSnapshot>>()
const snapshotListeners = new Map<string, Set<(snapshot: OpenConnectorRuntimeSnapshot) => void>>()

function runtimeCacheKey(gatewaySource: LoadedSource | null): string {
  if (!gatewaySource) return 'unconfigured'
  // Include the source config so URL/auth edits cannot reuse a stale snapshot.
  return `${gatewaySource.workspaceId}:${JSON.stringify(gatewaySource.config)}`
}

async function loadSharedSnapshot(gatewaySource: LoadedSource | null): Promise<OpenConnectorRuntimeSnapshot> {
  const key = runtimeCacheKey(gatewaySource)
  const existing = snapshotRequests.get(key)
  if (existing) return existing

  const request = loadOpenConnectorRuntimeSnapshot(gatewaySource)
    .then((snapshot) => {
      snapshotCache.set(key, snapshot)
      for (const listener of snapshotListeners.get(key) ?? []) listener(snapshot)
      return snapshot
    })
    .finally(() => snapshotRequests.delete(key))
  snapshotRequests.set(key, request)
  return request
}

function subscribeToSnapshot(key: string, listener: (snapshot: OpenConnectorRuntimeSnapshot) => void): () => void {
  const listeners = snapshotListeners.get(key) ?? new Set()
  listeners.add(listener)
  snapshotListeners.set(key, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) snapshotListeners.delete(key)
  }
}

export interface UseOpenConnectorRuntimeResult extends OpenConnectorRuntimeSnapshot {
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useOpenConnectorRuntime(): UseOpenConnectorRuntimeResult {
  const sources = useAtomValue(sourcesAtom)
  const gatewaySource = useMemo(() => findOpenConnectorGatewaySource(sources), [sources])
  const baseUrl = useMemo(() => resolveOpenConnectorRuntimeBaseUrl(gatewaySource), [gatewaySource])
  const cacheKey = runtimeCacheKey(gatewaySource)
  const activeCacheKeyRef = useRef(cacheKey)
  activeCacheKeyRef.current = cacheKey
  const [snapshot, setSnapshot] = useState<OpenConnectorRuntimeSnapshot>(() => snapshotCache.get(cacheKey) ?? {
    baseUrl,
    gatewaySource,
    authSession: null,
    data: emptyOpenConnectorAppData,
    healthOk: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const requestKey = runtimeCacheKey(gatewaySource)
    setLoading(true)
    setError(null)
    try {
      const nextSnapshot = await loadSharedSnapshot(gatewaySource)
      if (activeCacheKeyRef.current === requestKey) setSnapshot(nextSnapshot)
    } catch (caught) {
      if (activeCacheKeyRef.current !== requestKey) return
      setSnapshot({
        baseUrl,
        gatewaySource,
        authSession: null,
        data: emptyOpenConnectorAppData,
        healthOk: false,
      })
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      if (activeCacheKeyRef.current === requestKey) setLoading(false)
    }
  }, [baseUrl, gatewaySource])

  useEffect(() => subscribeToSnapshot(cacheKey, setSnapshot), [cacheKey])

  useEffect(() => {
    const cached = snapshotCache.get(cacheKey)
    if (cached) {
      setSnapshot(cached)
      setError(null)
      setLoading(false)
      return
    }
    setSnapshot({
      baseUrl,
      gatewaySource,
      authSession: null,
      data: emptyOpenConnectorAppData,
      healthOk: false,
    })
    void refresh()
  }, [baseUrl, cacheKey, gatewaySource, refresh])

  return {
    ...snapshot,
    baseUrl: snapshot.baseUrl ?? baseUrl,
    gatewaySource: snapshot.gatewaySource ?? gatewaySource,
    loading,
    error,
    refresh,
  }
}
