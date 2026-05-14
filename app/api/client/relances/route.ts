/**
 * /api/client/relances
 *
 * GET  : preview — liste les factures à relancer pour une société
 *        (sans rien envoyer, juste la liste + niveau dû + contact résolu)
 * POST : exécute les relances (option dry_run pour simuler)
 *
 * Tenant isolation : exige societe_id et vérifie l'accès du caller.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  findFacturesARelancer,
  loadSocieteConfig,
  runRelancesQuotidiennes,
  type CanalRelance,
} from '@/lib/relances/relances-factures'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseCanauxBody(raw: any): CanalRelance[] | null {
  if (!Array.isArray(raw)) return null
  const out: CanalRelance[] = []
  for (const c of raw) {
    if (c === 'email' || c === 'whatsapp') out.push(c)
  }
  return out.length > 0 ? out : null
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await assertSocieteAccess(supabase, user.id, societe_id)

    const config = await loadSocieteConfig(supabase, societe_id)
    const factures = await findFacturesARelancer(supabase, societe_id, { config })

    return NextResponse.json({ config, factures })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const societe_id = String(body.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await assertSocieteAccess(supabase, user.id, societe_id)

    const dry_run = body.dry_run === true
    const canauxOverride = parseCanauxBody(body.canaux)
    const facture_ids = Array.isArray(body.facture_ids)
      ? body.facture_ids.filter((s: any) => typeof s === 'string')
      : null

    const summary = await runRelancesQuotidiennes(supabase, {
      societe_id,
      facture_ids,
      canaux: canauxOverride,
      dry_run,
      source: 'manuel',
      created_by: user.id,
    })

    return NextResponse.json({ ok: true, dry_run, summary })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
