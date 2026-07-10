import { atom } from 'jotai'
import type { OpenConnectorProviderItem } from '@/lib/openconnector'

export const openConnectorProviderItemsAtom = atom<OpenConnectorProviderItem[]>([])

/** Backward-compatible alias while OpenConnector is still rendered inside Sources. */
export const openConnectorSourceItemsAtom = openConnectorProviderItemsAtom
