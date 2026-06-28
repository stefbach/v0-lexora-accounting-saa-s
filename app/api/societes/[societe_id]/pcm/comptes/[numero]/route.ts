/**
 * GET   /api/societes/{societe_id}/pcm/comptes/{numero}  — détail + balance
 * PATCH /api/societes/{societe_id}/pcm/comptes/{numero}  — update intitulé/tags/metadata
 *
 * Le numéro NE peut PAS être modifié (créer un nouveau compte + reclasser).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { z } from 'zod'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { writeAuditLog } from '@/lib/pcm/audit-log'
import { PCMError, isPCMError } from '@/lib/pcm/errors'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const SELECT_COLS =
  'id, numero, numero_parent, intitule, intitule_custom, classe, type, nature, sens_normal, lettrable, obligatoire, archive, archive_reason, archive_target, template_source, tags, metadata, created_at, updated_at'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ societe_id: string; numero: string }> },
) {
  try {
    const { societe_id, numero } = await params
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { data: compte, error } = await admin
      .from('comptes_societes').select(SELECT_COLS)
      .eq('societe_id', societe_id).eq('numero', decodeURIComponent(numero)).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!compte) throw new PCMError('PCM_004', `Compte ${numero} introuvable`)

    // Balance du compte (via vue)
    const { data: balance } = await admin
      .from('v_balance_compte_societe')
      .select('total_debit, total_credit, solde, nb_ecritures')
      .eq('societe_id', societe_id).eq('numero', decodeURIComponent(numero)).maybeSingle()

    return NextResponse.json({ compte, balance: balance || { total_debit: 0, total_credit: 0, solde: 0, nb_ecritures: 0 } })
  } catch (e: any) {
    if (isPCMError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus })
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

const patchSchema = z.object({
  intitule: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  nature: z.string().optional(),
  lettrable: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(o => Object.keys(o).length > 0, { message: 'Aucun champ à mettre à jour' })

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ societe_id: string; numero: string }> },
) {
  try {
    const { societe_id, numero } = await params
    const decodedNumero = decodeURIComponent(numero)
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const raw = await request.json().catch(() => ({}))
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalide', details: parsed.error.issues }, { status: 400 })
    }

    const { data: before } = await admin
      .from('comptes_societes').select(SELECT_COLS)
      .eq('societe_id', societe_id).eq('numero', decodedNumero).maybeSingle()
    if (!before) throw new PCMError('PCM_004', `Compte ${decodedNumero} introuvable`)

    const patch: Record<string, unknown> = { updated_by: user.id }
    if (parsed.data.intitule !== undefined) {
      patch.intitule = parsed.data.intitule
      patch.intitule_custom = true
    }
    if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags
    if (parsed.data.nature !== undefined) patch.nature = parsed.data.nature
    if (parsed.data.lettrable !== undefined) patch.lettrable = parsed.data.lettrable
    if (parsed.data.metadata !== undefined) patch.metadata = parsed.data.metadata

    const { data: updated, error } = await admin
      .from('comptes_societes').update(patch)
      .eq('societe_id', societe_id).eq('numero', decodedNumero)
      .select(SELECT_COLS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog(admin, {
      societe_id, action: 'update_compte', entity_type: 'compte', entity_id: decodedNumero,
      before_state: before, after_state: updated, actor_id: user.id,
      actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
      reason: 'Mise à jour compte',
    })

    return NextResponse.json({ success: true, compte: updated })
  } catch (e: any) {
    if (isPCMError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus })
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
