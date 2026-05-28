// =============================================================================
// lib/crm/connectors/index.ts — Registry des connecteurs
// =============================================================================

import { apolloConnector } from './apollo'
import type { Connector } from './types'

export const CONNECTORS: Record<string, Connector> = {
  apollo: apolloConnector,
}

export function getConnector(name: string): Connector | undefined {
  return CONNECTORS[name]
}

export function listConnectorNames(): string[] {
  return Object.keys(CONNECTORS)
}

export type { Connector, ConnectorSearchOptions, ConnectorSearchResult } from './types'
