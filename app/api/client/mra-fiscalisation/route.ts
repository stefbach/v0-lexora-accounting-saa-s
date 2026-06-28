/**
 * /api/client/mra-fiscalisation
 *
 * GET : retourne pour la société active
 *   - stats : compteurs (fiscalisées / en attente / échec / total éligible)
 *   - failed : factures avec mra_status = 'erreur' + dernier message
 *   - pending : factures clients non encore fiscalisées (hors devis)
 *   - logs : 50 dernières tentatives (succès + échecs)
 *
 * Utilisé par /client/mra-fiscalisation pour donner un dashboard de
 * supervision et permettre un retry manuel par lot.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data: factures, error: fErr } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, date_facture, montant_ttc, devise, statut, mra_status, irn, fiscalisation_date, type_document, created_at')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'client')
      .neq('type_document', 'devis')
      .order('date_facture', { ascending: false })
      .limit(500)
    if (fErr) throw fErr

    const list = factures || []
    const fiscalised = list.filter(f => f.mra_status === 'fiscalise' && f.irn)
    const failed = list.filter(f => f.mra_status === 'erreur')
    const pending = list.filter(f => !f.mra_status || (f.mra_status !== 'fiscalise' && f.mra_status !== 'erreur'))

    const { data: logs, error: lErr } = await supabase
      .from('mra_fiscalisation_logs')
      .select('id, facture_id, action, success, irn, http_status, duration_ms, error_code, error_message, source, environment, created_at')
      .eq('societe_id', societe_id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (lErr) throw lErr

    return NextResponse.json({
      stats: {
        total_eligible: list.length,
        fiscalised: fiscalised.length,
        failed: failed.length,
        pending: pending.length,
      },
      failed: failed.map(f => ({
        id: f.id,
        numero_facture: f.numero_facture,
        tiers: f.tiers,
        date_facture: f.date_facture,
        montant_ttc: f.montant_ttc,
        devise: f.devise,
        type_document: f.type_document,
        last_error: (logs || []).find(l => l.facture_id === f.id && !l.success)?.error_message || null,
      })),
      pending: pending.map(f => ({
        id: f.id,
        numero_facture: f.numero_facture,
        tiers: f.tiers,
        date_facture: f.date_facture,
        montant_ttc: f.montant_ttc,
        devise: f.devise,
        type_document: f.type_document,
      })),
      logs: logs || [],
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
