// =============================================================================
// lib/crm/connectors/index.ts — Registry des connecteurs
// =============================================================================

import { cbrdConnector } from './cbrd'
import { yellowPagesMuConnector } from './yellowpages-mu'
import { apolloConnector } from './apollo'
import { coresignalConnector } from './coresignal'
import type { Connector } from './types'

export const CONNECTORS: Record<string, Connector> = {
  coresignal: coresignalConnector,   // prioritaire : données LinkedIn enrichies
  cbrd: cbrdConnector,
  yellowpages_mu: yellowPagesMuConnector,
  apollo: apolloConnector,
}

export function getConnector(name: string): Connector | undefined {
  return CONNECTORS[name]
}

export function listConnectorNames(): string[] {
  return Object.keys(CONNECTORS)
}

export type { Connector, ConnectorSearchOptions, ConnectorSearchResult } from './types'
