import { atom } from 'jotai'
import type { OpenConnectorVirtualSourceItem } from '@/lib/openconnector'

export const openConnectorSourceItemsAtom = atom<OpenConnectorVirtualSourceItem[]>([])
