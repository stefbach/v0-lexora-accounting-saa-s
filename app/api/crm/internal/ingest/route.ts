// =============================================================================
// POST /api/crm/internal/ingest
// Endpoint d'ingestion authentifié HMAC (utilisé par N8N ou scripts internes).
// Accepte un payload normalisé { source, payloads: [...] }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { ingestPayloads } from '@/lib/crm/ingest'
import type { CrmIngestPayload } from '@/lib/crm/types'

export async function POST(req: NextRequest) {
  const hmac = await verifyHmac(req)
  if (!hmac.ok) {
    return NextResponse.json({ error: hmac.reason }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(hmac.bodyText)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const payloads = (body as { payloads?: CrmIngestPayload[] })?.payloads
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return NextResponse.json({ error: 'payloads[] requis' }, { status: 400 })
  }

  // Validation minimale
  for (const p of payloads) {
    if (!p?.source || !p?.company?.nom) {
      return NextResponse.json(
        { error: `payload invalide (source + company.nom requis)` },
        { status: 400 },
      )
    }
  }

  try {
    const result = await ingestPayloads(payloads, null)
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: `ingest_failed: ${(err as Error).message}` },
      { status: 500 },
    )
  }
}
