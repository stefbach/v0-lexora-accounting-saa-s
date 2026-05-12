/**
 * /api/client/factures-contacts/import-existing
 *
 * POST : importe automatiquement dans factures_contacts les clients déjà
 *        connus du système, depuis plusieurs sources :
 *   1. tiers_annuaire (mig 128) — base normalisée alimentée par OCR
 *      + saisie manuelle (où type_tiers IN ('client','prospect'))
 *   2. factures.tiers distincts (où type_facture='client') — historique
 *      des clients facturés mais jamais saisis dans le carnet
 *
 * Déduplication : on évite d'insérer un contact si le nom (case-insensitive
 * trimmed) existe déjà dans factures_contacts pour la société.
 *
 * Tenant isolation via assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CandidatContact {
  nom: string
  entreprise: string | null
  email: string | null
  telephone: string | null
  adresse: string | null
  vat_number: string | null
  source: string
}

function normalizeName(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const societe_id = String(body?.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    // Filtre sources : par défaut on prend tout
    const sources: string[] = Array.isArray(body?.sources)
      ? body.sources.filter((s: any) => typeof s === 'string')
      : ['tiers_annuaire', 'factures']

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await assertSocieteAccess(supabase, user.id, societe_id)

    // ── 1. Liste les noms déjà présents dans factures_contacts (déduplication)
    const { data: existing } = await supabase
      .from('factures_contacts')
      .select('nom')
      .eq('societe_id', societe_id)
    const seen = new Set<string>(
      (existing || []).map((c: any) => normalizeName(String(c.nom || ''))).filter(Boolean),
    )

    // ── 2. Construction des candidats à partir des sources demandées
    const candidats = new Map<string, CandidatContact>() // clé = normalizeName(nom)

    if (sources.includes('tiers_annuaire')) {
      // tiers_annuaire (mig 128) est une table GLOBALE (pas de societe_id).
      // On filtre seulement sur type_tiers — on récupère les tiers
      // identifiés comme clients par l'OCR ou la saisie manuelle.
      // Mig 244 ajoute email/telephone/adresse → on récupère tous les
      // champs pertinents pour pré-remplir factures_contacts complet.
      try {
        const { data } = await supabase
          .from('tiers_annuaire')
          .select('nom, brn, vat_number, type_tiers, pays, email, telephone, adresse')
          .in('type_tiers', ['client', 'both'])
        for (const t of data || []) {
          const key = normalizeName(String(t.nom || ''))
          if (!key || seen.has(key) || candidats.has(key)) continue
          candidats.set(key, {
            nom: String(t.nom),
            entreprise: null,
            email: t.email || null,
            telephone: t.telephone || null,
            adresse: t.adresse || t.pays || null,
            vat_number: t.vat_number || null,
            source: 'tiers_annuaire',
          })
        }
      } catch {
        /* table peut ne pas exister sur env legacy → on continue */
      }
    }

    if (sources.includes('factures')) {
      // Noms distincts de tiers des factures clients de la société
      const { data: facs } = await supabase
        .from('factures')
        .select('tiers')
        .eq('societe_id', societe_id)
        .eq('type_facture', 'client')
        .not('tiers', 'is', null)
      const tiersDistincts = new Set<string>()
      for (const f of facs || []) {
        const t = String(f.tiers || '').trim()
        if (t) tiersDistincts.add(t)
      }
      for (const t of tiersDistincts) {
        const key = normalizeName(t)
        if (!key || seen.has(key) || candidats.has(key)) continue
        candidats.set(key, {
          nom: t,
          entreprise: null,
          email: null,
          telephone: null,
          adresse: null,
          vat_number: null,
          source: 'factures_historique',
        })
      }
    }

    if (candidats.size === 0) {
      return NextResponse.json({ inserted: 0, candidats: 0, message: 'Aucun nouveau client à importer.' })
    }

    // ── 3. Insertion en lot dans factures_contacts
    const toInsert = Array.from(candidats.values()).map((c) => ({
      societe_id,
      nom: c.nom,
      entreprise: c.entreprise,
      email: c.email,
      telephone: c.telephone,
      adresse: c.adresse,
      vat_number: c.vat_number,
      devise: 'MUR',
      conditions_paiement: 30,
      offshore: false,
      actif: true,
    }))

    const { data: inserted, error } = await supabase
      .from('factures_contacts')
      .insert(toInsert)
      .select('id, nom')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      inserted: inserted?.length || 0,
      candidats: candidats.size,
      sources_utilisees: sources,
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
