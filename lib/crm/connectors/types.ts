// =============================================================================
// lib/crm/connectors/types.ts — Interface commune des connecteurs
// =============================================================================

import type { CrmIngestPayload } from '../types'

export interface ConnectorSearchOptions {
  query?: string                    // mot-clé activité ("hotel", "construction")
  region?: string
  industrie?: string
  limit?: number
}

export interface ConnectorSearchResult {
  source: string
  total: number
  payloads: CrmIngestPayload[]
  errors: string[]
}

export interface Connector {
  name: string
  search(opts: ConnectorSearchOptions): Promise<ConnectorSearchResult>
}
