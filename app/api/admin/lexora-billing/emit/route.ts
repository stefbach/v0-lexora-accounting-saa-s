/**
 * POST /api/admin/lexora-billing/emit
 *
 * Émission manuelle d'une facture Lexora pour une société existante
 * (clients pré-existants au système de demandes d'inscription, ou
 * facturation récurrente non liée à une inscription).
 *
 * Body :
 *   - societe_id        : UUID de la société cliente
 *   - plan_id           : UUID du plan (table plans) — optionnel si tarif_ht_mur fourni
 *   - periodicite       : 'mensuelle' | 'annuelle'
 *   - tarif_ht_mur      : montant HT MUR — override possible du prix du plan
 *   - designation       : libellé personnalisé (optionnel)
 *   - invoice_date      : YYYY-MM-DD — defaults à aujourd'hui
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { createLexoraInvoice } from '@/lib/lexora-billing/create-invoice'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!prof || !['admin', 'super_admin'].includes(prof.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { societe_id, plan_id, periodicite, tarif_ht_mur, designation, invoice_date } = body
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const admin = getAdminClient()

  // Société cliente
  const { data: societe } = await admin.from('societes').select('*').eq('id', societe_id).maybeSingle()
  if (!societe) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })

  // Dirigeant : profil le + ancien lié via dossiers ou created_by
  let dirigeantNom: string | null = null
  let dirigeantEmail: string | null = null
  let clientUserId: string | null = null
  if (societe.created_by) {
    const { data: p } = await admin.from('profiles').select('id, full_name, email').eq('id', societe.created_by).maybeSingle()
    if (p) { dirigeantNom = p.full_name; dirigeantEmail = p.email; clientUserId = p.id }
  }
  if (!clientUserId) {
    const { data: d } = await admin.from('dossiers').select('client_id, profiles:client_id(id, full_name, email)').eq('societe_id', societe_id).limit(1).maybeSingle()
    const p = (d as any)?.profiles
    if (p) { dirigeantNom = p.full_name; dirigeantEmail = p.email; clientUserId = p.id }
  }

  // Plan : si non fourni, utilise le plan_id de la société (abonnement actuel)
  let plan: any = null
  const effectivePlanId = plan_id || societe.plan_id
  if (effectivePlanId) {
    const { data } = await admin.from('plans').select('code,nom,prix_mensuel_mur,prix_annuel_mur').eq('id', effectivePlanId).maybeSingle()
    plan = data
  }
  // Périodicité : prefer body, fallback société, default mensuelle
  const period = ((periodicite || societe.periodicite) === 'annuelle' ? 'annuelle' : 'mensuelle') as 'mensuelle' | 'annuelle'

  // Prix par défaut : prix effectif de la société (plan + addons, calculé
  // lors de l'attribution d'abonnement). Sinon prix du plan brut.
  // Override possible via tarif_ht_mur.
  const subscriptionPrice = period === 'annuelle'
    ? Number(societe.prix_periode_effectif || 0)
    : Number(societe.prix_mensuel_effectif || 0)
  const planPrice = plan
    ? (period === 'annuelle' ? Number(plan.prix_annuel_mur || 0) : Number(plan.prix_mensuel_mur || 0))
    : 0
  const ht = tarif_ht_mur != null ? Number(tarif_ht_mur)
           : (subscriptionPrice > 0 ? subscriptionPrice : planPrice)
  if (!(ht > 0)) return NextResponse.json({ error: 'tarif_ht_mur ou plan_id avec prix > 0 requis (ou abonnement configuré sur la société)' }, { status: 400 })

  const date = invoice_date || new Date().toISOString().slice(0, 10)

  const { invoice, reused, error } = await createLexoraInvoice({
    supabaseAdmin: admin,
    demande_id: null as any,    // émission manuelle hors demande
    client_societe_id: societe_id,
    client_user_id: clientUserId,
    plan,
    periodicite: period,
    tarif_final_mur: ht,
    invoice_date: date,
    cgv_accepted_at: null,
    customer: {
      nom: societe.nom,
      brn: societe.brn || null,
      vat: societe.numero_tva_mra || null,
      adresse: societe.adresse || null,
      ville: societe.ville || null,
      dirigeant_nom: dirigeantNom,
      dirigeant_email: dirigeantEmail,
      telephone: societe.telephone || null,
    },
    created_by: user.id,
  })

  if (error || !invoice) return NextResponse.json({ error: error || 'Création échouée' }, { status: 500 })

  // Override de la désignation si fourni
  if (designation && designation.trim() && !reused) {
    await admin.from('lexora_invoices').update({
      lines: [{
        designation: designation.trim(),
        quantite: 1,
        prix_unitaire_ht: invoice.amount_ht,
        tva_rate: invoice.tva_amount > 0 ? Math.round((invoice.tva_amount / invoice.amount_ht) * 100) : 0,
        montant_ht: invoice.amount_ht,
      }],
    }).eq('id', invoice.id)
  }

  return NextResponse.json({ invoice, reused })
}
