/**
 * POST /api/societes/{societe_id}/grand-livre/lettrage
 *
 * Lettre un ensemble d'écritures avec un code commun. Vérifie que la somme
 * des débits = somme des crédits des écritures lettrées (lettrage équilibré).
 *
 * Body : { ecritures_ids: string[], code_lettre?: string }
 *   code_lettre auto-généré (Lxxxx) si absent.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { writeAuditLog } from '@/lib/pcm/audit-log'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const bodySchema = z.object({
  ecritures_ids: z.array(z.string().uuid()).min(2, 'au moins 2 écritures'),
  code_lettre: z.string().min(1).optional(),
  force_desequilibre: z.boolean().default(false),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const raw = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalide', details: parsed.error.issues }, { status: 400 })
    }
    const { ecritures_ids, force_desequilibre } = parsed.data

    // Charger les écritures + vérifier appartenance société
    const { data: ecritures, error: loadErr } = await admin
      .from('ecritures_comptables_v2')
      .select('id, societe_id, numero_compte, debit_mur, credit_mur, lettre')
      .in('id', ecritures_ids)
    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
    if (!ecritures || ecritures.length !== ecritures_ids.length) {
      return NextResponse.json({ error: 'Certaines écritures sont introuvables' }, { status: 404 })
    }
    if (ecritures.some(e => e.societe_id !== societe_id)) {
      return NextResponse.json({ error: 'Écriture hors société' }, { status: 403 })
    }
    const dejaLettrees = ecritures.filter(e => e.lettre)
    if (dejaLettrees.length > 0) {
      return NextResponse.json({
        error: `${dejaLettrees.length} écriture(s) déjà lettrée(s)`,
        details: dejaLettrees.map(e => e.id),
      }, { status: 409 })
    }

    // Équilibre
    const totalDebit = ecritures.reduce((s, e) => s + (+e.debit_mur || 0), 0)
    const totalCredit = ecritures.reduce((s, e) => s + (+e.credit_mur || 0), 0)
    const equilibre = Math.abs(totalDebit - totalCredit) < 0.01
    if (!equilibre && !force_desequilibre) {
      return NextResponse.json({
        error: `Lettrage déséquilibré : débit ${totalDebit.toFixed(2)} ≠ crédit ${totalCredit.toFixed(2)}. Utiliser force_desequilibre pour forcer.`,
        ecart: Math.round((totalDebit - totalCredit) * 100) / 100,
      }, { status: 400 })
    }

    const code = parsed.data.code_lettre || `L${String(Date.now()).slice(-5)}`
    const dateLettrage = new Date().toISOString().slice(0, 10)

    const { error: updErr, count } = await admin
      .from('ecritures_comptables_v2')
      .update({ lettre: code, date_lettrage: dateLettrage }, { count: 'exact' })
      .in('id', ecritures_ids)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    await writeAuditLog(admin, {
      societe_id, action: 'lettrer_ecritures', entity_type: 'ecriture', entity_id: code,
      after_state: { code, nb: count, equilibre, total_debit: totalDebit, total_credit: totalCredit },
      actor_id: user.id, actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
      reason: `Lettrage manuel ${code}`,
    })

    return NextResponse.json({
      success: true, code_lettre: code, nb_ecritures: count ?? 0,
      equilibre, total_debit: Math.round(totalDebit * 100) / 100, total_credit: Math.round(totalCredit * 100) / 100,
    })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
