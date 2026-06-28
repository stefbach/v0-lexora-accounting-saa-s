/**
 * POST /api/client/mra/suggest-match
 *   body : { societe_id, montant, libelle?, date? }
 *   → Propose les déclarations MRA en attente dont le montant correspond
 *     (écart ≤ 1% ou ≤ 100 MUR) à un débit bancaire "MRA". Semi-auto : on
 *     SUGGÈRE, l'utilisateur confirme via /api/client/mra/declaration/[id].
 *
 * POST /api/client/mra/suggest-match  body : { ..., declaration_id, ecriture_id, action:'confirm' }
 *   → Clôt la boucle : marque la déclaration PAYÉE + lie l'écriture (lettrage).
 *
 * Sert le rapprochement bancaire (un débit MRA peut être PAYE/CSG/NSF/TDS/TVA ;
 * sans le justificatif l'agent ne peut pas deviner — ici on propose le bon
 * candidat à partir du montant dû).
 *
 * Auth multi-mode (session / API key / token interne → agent Telegram).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const TYPE_LABEL: Record<string, string> = {
  PAYE: 'PAYE', CSG: 'CSG', NSF: 'NSF', TDS: 'TDS', TVA: 'TVA',
}

export async function POST(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({}))
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    // ── Mode confirmation : clôt la boucle ──────────────────────────
    if (body?.action === 'confirm' && body?.declaration_id) {
      const patch: Record<string, any> = {
        statut: 'paye',
        date_paiement: body?.date || new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }
      if (body?.ecriture_id) patch.ecriture_id = String(body.ecriture_id)
      if (body?.montant != null) patch.montant_paye = Number(body.montant)
      // Sécurité : la déclaration doit appartenir à la société
      const { data: decl } = await admin
        .from('mra_declarations').select('societe_id, date_declaration')
        .eq('id', body.declaration_id).maybeSingle()
      if (!decl || decl.societe_id !== societe_id) {
        return NextResponse.json({ error: 'Déclaration introuvable pour cette société' }, { status: 404 })
      }
      if (!decl.date_declaration) patch.date_declaration = patch.date_paiement
      const { data: updated, error } = await admin
        .from('mra_declarations').update(patch).eq('id', body.declaration_id).select('*').maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, declaration: updated })
    }

    // ── Mode suggestion : trouve les candidats par montant ──────────
    const montant = Math.abs(Number(body?.montant) || 0)
    if (!montant) return NextResponse.json({ error: 'montant requis' }, { status: 400 })

    const { data: pending } = await admin
      .from('mra_declarations')
      .select('id, type, periode, date_echeance, montant_du, statut')
      .eq('societe_id', societe_id)
      .in('statut', ['a_faire', 'declare', 'retard'])
      .gt('montant_du', 0)

    const tol = Math.max(100, montant * 0.01) // tolérance 1% ou 100 MUR
    const candidats = (pending || [])
      .map((d: any) => ({ ...d, ecart: Math.abs(Number(d.montant_du) - montant) }))
      .filter((d: any) => d.ecart <= tol)
      .sort((a: any, b: any) => a.ecart - b.ecart)
      .slice(0, 5)
      .map((d: any) => ({
        declaration_id: d.id,
        type: d.type,
        label: `${TYPE_LABEL[d.type] || d.type} ${d.periode}`,
        periode: d.periode,
        montant_du: Number(d.montant_du),
        ecart: Math.round(d.ecart * 100) / 100,
        echeance: d.date_echeance,
        statut: d.statut,
        match_exact: d.ecart < 0.01,
      }))

    return NextResponse.json({
      montant,
      nb_candidats: candidats.length,
      suggestions: candidats,
      message: candidats.length === 0
        ? 'Aucune déclaration MRA en attente ne correspond à ce montant.'
        : `${candidats.length} déclaration(s) MRA possible(s) pour ${montant} MUR.`,
    })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
