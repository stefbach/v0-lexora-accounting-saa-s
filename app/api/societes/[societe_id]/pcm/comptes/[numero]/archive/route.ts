/**
 * POST /api/societes/{societe_id}/pcm/comptes/{numero}/archive
 *
 * Archive un compte (jamais DELETE). Si le compte a des écritures :
 *   • soit `target_compte` est fourni → reclassement automatique des écritures
 *   • soit refus PCM_006 (reclasser d'abord)
 *
 * Body : { reason: string, target_compte?: string }
 */

import { NextResponse } from 'next/server'
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

const bodySchema = z.object({
  reason: z.string().min(1, 'reason requis'),
  target_compte: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ societe_id: string; numero: string }> },
) {
  try {
    const { societe_id, numero } = await params
    const decodedNumero = decodeURIComponent(numero)
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const raw = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalide', details: parsed.error.issues }, { status: 400 })
    }
    const { reason, target_compte } = parsed.data

    // Compte existe ?
    const { data: compte } = await admin
      .from('comptes_societes').select('id, numero, intitule, archive')
      .eq('societe_id', societe_id).eq('numero', decodedNumero).maybeSingle()
    if (!compte) throw new PCMError('PCM_004', `Compte ${decodedNumero} introuvable`)
    if (compte.archive) {
      return NextResponse.json({ success: true, message: 'Compte déjà archivé' })
    }

    // Combien d'écritures sur ce compte ?
    const { count: nbEcritures } = await admin
      .from('ecritures_comptables_v2')
      .select('id', { count: 'exact', head: true })
      .eq('societe_id', societe_id).eq('numero_compte', decodedNumero)

    let reclassedCount = 0

    if (nbEcritures && nbEcritures > 0) {
      if (!target_compte) {
        throw new PCMError(
          'PCM_006',
          `Le compte ${decodedNumero} a ${nbEcritures} écriture(s). Fournir target_compte pour reclasser avant d'archiver.`,
          { nb_ecritures: nbEcritures },
        )
      }
      // Compte cible existe et actif ?
      const { data: target } = await admin
        .from('comptes_societes').select('numero, intitule, archive')
        .eq('societe_id', societe_id).eq('numero', target_compte).maybeSingle()
      if (!target) throw new PCMError('PCM_010', `Compte cible ${target_compte} introuvable`)
      if (target.archive) throw new PCMError('PCM_010', `Compte cible ${target_compte} est archivé`)

      // Reclasser les écritures (vérif période clôturée via trigger DB existant mig 421)
      const { error: reclassErr, count } = await admin
        .from('ecritures_comptables_v2')
        .update({ numero_compte: target.numero, nom_compte: target.intitule }, { count: 'exact' })
        .eq('societe_id', societe_id).eq('numero_compte', decodedNumero)
      if (reclassErr) {
        return NextResponse.json({ error: `Reclassement échoué: ${reclassErr.message}` }, { status: 500 })
      }
      reclassedCount = count || 0
    }

    // Archiver
    const { data: archived, error: archErr } = await admin
      .from('comptes_societes')
      .update({
        archive: true, archive_at: new Date().toISOString(),
        archive_reason: reason, archive_target: target_compte ?? null,
        updated_by: user.id,
      })
      .eq('societe_id', societe_id).eq('numero', decodedNumero)
      .select('id, numero, intitule, archive, archive_reason, archive_target').single()
    if (archErr) return NextResponse.json({ error: archErr.message }, { status: 500 })

    await writeAuditLog(admin, {
      societe_id, action: 'archive_compte', entity_type: 'compte', entity_id: decodedNumero,
      before_state: { numero: compte.numero, archive: false },
      after_state: { archive: true, target_compte, reclassed_ecritures: reclassedCount },
      actor_id: user.id, actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
      reason,
    })

    return NextResponse.json({
      success: true, compte: archived,
      reclassed_ecritures: reclassedCount,
      target_compte: target_compte ?? null,
    })
  } catch (e: any) {
    if (isPCMError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus })
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
