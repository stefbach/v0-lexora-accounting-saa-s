// =============================================================================
// POST /api/crm/internal/connectors-search
// Lance une recherche sur un connecteur (CBRD / Yellow Pages MU / Apollo)
// et ingère immédiatement les résultats.
//
// Auth : utilisateur connecté avec rôle CRM (PAS de HMAC ici car c'est un
// endpoint déclenché depuis l'UI Lexora — donc session web).
//
// Body : { connector: 'cbrd'|'yellowpages_mu'|'apollo', query?: string,
//          industrie?: string, region?: string, limit?: number,
//          dry_run?: boolean }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireCrmAccess } from '@/lib/crm/auth'
import { getConnector, listConnectorNames } from '@/lib/crm/connectors'
import { ingestPayloads } from '@/lib/crm/ingest'

export async function POST(req: NextRequest) {
  const auth = await requireCrmAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'body invalide' }, { status: 400 })

  const name = String(body.connector ?? '')
  const connector = getConnector(name)
  if (!connector) {
    return NextResponse.json(
      { error: 'connector inconnu', available: listConnectorNames() },
      { status: 400 },
    )
  }

  const searchResult = await connector.search({
    query: body.query,
    industrie: body.industrie,
    region: body.region,
    limit: body.limit,
  })

  if (body.dry_run) {
    return NextResponse.json({ data: { search: searchResult, ingested: null } })
  }

  let ingest: unknown = null
  if (searchResult.payloads.length > 0) {
    ingest = await ingestPayloads(searchResult.payloads, auth.user.id)
  }

  return NextResponse.json({ data: { search: { ...searchResult, payloads: undefined }, ingested: ingest } })
}

export async function GET() {
  return NextResponse.json({ available: listConnectorNames() })
}
