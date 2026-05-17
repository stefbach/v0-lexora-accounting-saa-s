/**
 * /api/client/factures-ia/generer
 *
 * POST — création de la facture en DB depuis les paramètres extraits
 * par l'IA. Délègue ensuite à /api/client/factures (POST) qui gère :
 *   - numérotation auto par type
 *   - calcul totaux + conversion MUR
 *   - écritures comptables
 *   - récurrence si applicable
 *
 * On encapsule pour valider/nettoyer les params (l'IA peut produire
 * des champs invalides) avant insert.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { resolveInternalAuth } from '@/lib/lexora-internal-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface LignePayload {
  description: string
  quantite: number
  prix_unitaire: number
  taux_tva: number
  unite?: string
  catalogue_id?: string | null
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    // Auth : soit session web, soit X-Internal-Token (bot Telegram, n8n)
    const internal = resolveInternalAuth(request)
    let user: { id: string; email?: string }
    if (internal) {
      user = { id: internal.user_id, email: internal.user_email || 'system' }
    } else {
      const authClient = await createClient()
      const { data: { user: u }, error: authError } = await authClient.auth.getUser()
      if (authError || !u) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
      user = { id: u.id, email: u.email }
    }

    const body = await request.json()
    const societe_id: string = body.societe_id
    const params: any = body.parametres || {}
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!params.tiers && !params.contact_id) {
      return NextResponse.json({ error: 'Aucun client identifié (ni tiers ni contact_id)' }, { status: 400 })
    }

    await assertSocieteAccess(supabase, user.id, societe_id)

    const lignes: LignePayload[] = Array.isArray(params.lignes) ? params.lignes : []
    if (lignes.length === 0) {
      return NextResponse.json({ error: 'Au moins une ligne est requise' }, { status: 400 })
    }

    // Si contact_id fourni, on rapatrie le nom officiel pour `tiers`
    let tiersResolu = String(params.tiers || '').trim()
    if (params.contact_id && !tiersResolu) {
      const { data: ct } = await supabase
        .from('factures_contacts')
        .select('nom, entreprise')
        .eq('id', params.contact_id)
        .eq('societe_id', societe_id)
        .maybeSingle()
      tiersResolu = ct?.nom || ct?.entreprise || ''
    }
    if (!tiersResolu) tiersResolu = 'Client'

    // Calcul des totaux
    let montant_ht = 0
    let montant_tva = 0
    const lignesNormalisees = lignes.map(l => {
      const q = Number(l.quantite) || 0
      const pu = Number(l.prix_unitaire) || 0
      const tva = Number(l.taux_tva ?? 15)
      const lht = q * pu
      const ltva = lht * (tva / 100)
      montant_ht += lht
      montant_tva += ltva
      return {
        description: String(l.description || '').trim(),
        quantite: q,
        prix_unitaire: pu,
        taux_tva: tva,
        unite: l.unite || undefined,
        total: lht + ltva,
      }
    })
    // Remise globale
    const remise_pct = Number(params.remise_pct) || 0
    const remise_montant = Number(params.remise_montant) || 0
    const remise = remise_pct > 0 ? montant_ht * (remise_pct / 100) : remise_montant
    const montant_ttc = montant_ht + montant_tva - remise

    const today = new Date().toISOString().slice(0, 10)
    const echeance = (() => {
      if (params.date_echeance) return String(params.date_echeance)
      const j = Number(params.conditions_paiement) || 30
      const d = new Date()
      d.setDate(d.getDate() + j)
      return d.toISOString().slice(0, 10)
    })()

    const devise = (params.devise || 'MUR').toUpperCase()
    const taux_change = Number(params.taux_change) || (devise === 'MUR' ? 1 : 0)
    if (devise !== 'MUR' && taux_change <= 0) {
      return NextResponse.json({
        error: `Taux de change manquant pour ${devise}. L'IA aurait dû le demander.`,
      }, { status: 400 })
    }

    const facturePayload: Record<string, unknown> = {
      societe_id,
      tiers: tiersResolu,
      contact_id: params.contact_id || null,
      description: params.description || null,
      type_facture: 'client' as const,
      type_document: params.type_document || 'facture',
      facture_reference_id: params.facture_reference_id || null,
      date_facture: params.date_facture || today,
      date_echeance: echeance,
      conditions_paiement: Number(params.conditions_paiement) || 30,
      devise,
      taux_change: devise === 'MUR' ? 1 : taux_change,
      montant_ht,
      montant_tva,
      montant_ttc,
      remise_pct,
      remise_montant: remise_pct > 0 ? 0 : remise_montant,
      client_offshore: !!params.client_offshore,
      mode_paiement: params.mode_paiement || 'banque',
      paye_par: params.paye_par || null,
      template: params.template || 'standard',
      template_id: params.template_id || null,
      lignes: lignesNormalisees,
      notes: null,
      notes_internes: params.notes_internes || null,
      termes: params.termes || null,
    }

    // Forward des champs récurrence si demandés (création modèle récurrent)
    if (params.recurrent === true) {
      facturePayload.recurrent = true
      if (params.recurrent_frequence) facturePayload.recurrent_frequence = params.recurrent_frequence
      if (params.recurrence_date_debut) facturePayload.recurrence_date_debut = params.recurrence_date_debut
      if (params.recurrence_date_fin) facturePayload.recurrence_date_fin = params.recurrence_date_fin
      if (params.recurrence_jour_du_mois) facturePayload.recurrence_jour_du_mois = params.recurrence_jour_du_mois
    }

    // POST sur l'endpoint existant — il gère numérotation auto, écritures
    // comptables et toute la logique métier sans qu'on duplique.
    // Si auth interne (Telegram bot), on forward le token + user-id ;
    // sinon on forward le cookie de session.
    const downstreamHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (internal) {
      downstreamHeaders['x-internal-token'] = request.headers.get('x-internal-token') || ''
      downstreamHeaders['x-internal-user-id'] = request.headers.get('x-internal-user-id') || ''
      const emailHdr = request.headers.get('x-internal-user-email')
      if (emailHdr) downstreamHeaders['x-internal-user-email'] = emailHdr
    } else {
      downstreamHeaders.cookie = request.headers.get('cookie') || ''
    }
    const insertRes = await fetch(`${request.url.replace(/\/factures-ia\/generer.*$/, '/factures')}`, {
      method: 'POST',
      headers: downstreamHeaders,
      body: JSON.stringify(facturePayload),
    })
    const insertJson = await insertRes.json()
    if (!insertRes.ok) {
      return NextResponse.json({
        error: insertJson?.error || 'Erreur création facture',
        details: insertJson,
      }, { status: insertRes.status })
    }

    return NextResponse.json({
      ok: true,
      facture: insertJson?.data || insertJson?.facture || insertJson,
      // Hint UI : la fiscalisation MRA est faisable depuis la preview
      preview_url: `/client/facture-preview?facture_id=${insertJson?.data?.id || insertJson?.id}`,
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur génération' }, { status: 500 })
  }
}
