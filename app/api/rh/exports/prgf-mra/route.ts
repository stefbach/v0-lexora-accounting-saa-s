/**
 * POST /api/rh/exports/prgf-mra
 * Body : { societe_id: string, periode: 'YYYY-MM' }
 *
 * Génère le fichier PRGF Monthly Return MRA — fichier unique
 * prgf<YYYYMMDD>.csv à uploader sur https://eservices14.mra.mu/prgfcontribution
 *
 * Distinct du PACO (CSG/NSF/PAYE) : la déclaration PRGF est SÉPARÉE.
 *
 * SÉCURITÉ
 * - Auth + role check identiques aux autres exports MRA
 * - Lock check sur la période
 * - ERN/BRN validés
 *
 * RETOUR
 * - { csv, filename, warnings, totaux, bulletins_avec_ecart_potentiel, ... }
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resolveInternalAuth } from '@/lib/lexora-internal-auth'
import { lastDayOfMonth } from '@/lib/rh/period'
import {
  genererPrgfMra,
  type PrgfSociete,
  type PrgfEmploye,
  type PrgfBulletin,
} from '@/lib/rh/declarations-mra-prgf'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'client_admin',
  'direction',
  'comptable',
  'comptable_dedie',
]

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    const internal = resolveInternalAuth(request)
    let user: { id: string; email?: string }
    if (internal) {
      user = { id: internal.user_id, email: internal.user_email }
    } else {
      const supabaseAuth = await createServerClient()
      const { data: { user: sessionUser } } = await supabaseAuth.auth.getUser()
      if (!sessionUser) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
      user = { id: sessionUser.id, email: sessionUser.email }
    }

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({
        error: `Accès refusé : la génération PRGF MRA est réservée aux rôles ${ALLOWED_ROLES.join(', ')}. Votre rôle : ${role || 'inconnu'}.`,
      }, { status: 403 })
    }

    const { societe_id, periode } = await request.json()
    if (!societe_id || !periode) {
      return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ error: 'Format periode invalide. Attendu YYYY-MM.' }, { status: 400 })
    }

    // ── Lock check ────────────────────────────────────────────
    const { data: unlockedBuls } = await supabase
      .from('bulletins_paie').select('id').eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`).lte('periode', lastDayOfMonth(periode))
      .or('verrouille.is.null,verrouille.eq.false')
      .limit(1)
    if (unlockedBuls && unlockedBuls.length > 0) {
      return NextResponse.json({
        error: `Periode non verrouillee pour ${periode}. Verrouillez d'abord la paie dans /rh/paie avant de générer le PRGF.`,
      }, { status: 403 })
    }

    // ── Société ───────────────────────────────────────────────
    const { data: societeRow } = await supabase
      .from('societes').select('*').eq('id', societe_id).single()
    if (!societeRow) {
      return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    }

    const ern = (societeRow.ern || '').toString().trim()
    if (!ern || !/^\d{8}$/.test(ern)) {
      return NextResponse.json({
        error: `ERN manquant ou invalide pour "${societeRow.nom}". Format requis : 8 chiffres.`,
      }, { status: 400 })
    }

    const societe: PrgfSociete = {
      nom: societeRow.nom,
      ern,
      brn: (societeRow.brn || '').toString().trim(),
      mra_telephone: societeRow.mra_telephone ?? null,
      mra_mobile: societeRow.mra_mobile ?? null,
      mra_declarant_name: societeRow.mra_declarant_name ?? null,
      mra_email: societeRow.mra_email ?? null,
      telephone: societeRow.telephone ?? null,
      contact_name: societeRow.contact_name ?? null,
      email: societeRow.email ?? null,
    }

    // ── Bulletins de la période ───────────────────────────────
    const { data: bulletinsRows, error: bulErr } = await supabase
      .from('bulletins_paie')
      .select('employe_id, periode, salaire_base, heures_sup_montant, increment_salaire, prgf')
      .eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`)
      .lte('periode', lastDayOfMonth(periode))
    if (bulErr) {
      console.error('[prgf-mra] DB error bulletins:', bulErr.message)
      return NextResponse.json({ error: `Erreur DB bulletins: ${bulErr.message}` }, { status: 500 })
    }
    if (!bulletinsRows || bulletinsRows.length === 0) {
      return NextResponse.json({ error: `Aucun bulletin pour ${periode}.` }, { status: 404 })
    }

    // ── Employés concernés ────────────────────────────────────
    // On charge TOUS les employés de la société pour pouvoir matcher
    // (y compris ceux sans bulletin, pour les warnings)
    const empIds = [...new Set(bulletinsRows.map((b: any) => b.employe_id).filter(Boolean))]
    const { data: employesRows } = empIds.length > 0
      ? await supabase.from('employes').select(
        'id, nom, prenom, nic_number, date_arrivee, date_depart, contrat_type, type_contrat, '
        + 'is_migrant_worker, is_mauritian, inclus_prgf, prgf_motif_exemption',
      ).in('id', empIds)
      : { data: [] }

    const employes: PrgfEmploye[] = (employesRows || []).map((e: any) => ({
      id: e.id,
      nom: e.nom || '',
      prenom: e.prenom || '',
      nic_number: e.nic_number ?? null,
      date_arrivee: e.date_arrivee ?? null,
      date_depart: e.date_depart ?? null,
      contrat_type: e.contrat_type ?? null,
      type_contrat: e.type_contrat ?? null,
      is_migrant_worker: e.is_migrant_worker ?? false,
      is_mauritian: e.is_mauritian ?? true,
      inclus_prgf: e.inclus_prgf ?? true,
      prgf_motif_exemption: e.prgf_motif_exemption ?? null,
    }))

    const bulletins: PrgfBulletin[] = bulletinsRows.map((b: any) => ({
      employe_id: b.employe_id,
      periode: String(b.periode).slice(0, 10),
      salaire_base: Number(b.salaire_base) || 0,
      heures_sup_montant: Number(b.heures_sup_montant) || 0,
      increment_salaire: Number(b.increment_salaire) || 0,
      prgf: Number(b.prgf) || 0,
    }))

    // Patch PRGF — charger parametres_paie_mra (mig 212 : prgf_taux_emoluments)
    // pour recalculer col 11 PRGF Amount à la volée depuis col 10 (Total),
    // évite la sur-déclaration quand bulletin.prgf a été calculé sur le
    // salaire_brut (incluant electricity allowance) au lieu du basic.
    const { data: paramsRow } = await supabase
      .from('parametres_paie_mra')
      .select('prgf_taux_emoluments')
      .order('annee', { ascending: false })
      .limit(1)
      .maybeSingle()

    const params = paramsRow ? {
      prgf_taux_emoluments: Number(paramsRow.prgf_taux_emoluments ?? 0.045),
    } : undefined

    // ── Génération ────────────────────────────────────────────
    let result
    try {
      result = genererPrgfMra({ societe, employes, bulletins, periode, params })
    } catch (e: any) {
      return NextResponse.json({
        error: e?.message || 'Erreur génération PRGF',
      }, { status: 422 })
    }

    return NextResponse.json({
      csv: result.csv,
      filename: result.filename,
      warnings: result.warnings,
      ecart_potentiel: result.bulletins_avec_ecart_potentiel.length > 0
        ? {
          message: `${result.bulletins_avec_ecart_potentiel.length} employé(s) potentiellement sur-déclarés `
            + `(electricity allowance incluse à tort dans la base PRGF). `
            + `Recalculez la paie via "Recalculer cette période" en V2 pour aligner.`,
          employes: result.bulletins_avec_ecart_potentiel,
        }
        : null,
      totaux: {
        employes_inclus: result.employes_inclus,
        employes_exclus: result.employes_exclus,
        total_basic: result.total_basic,
        total_allowances: result.total_allowances,
        total_prgf: result.total_prgf,
      },
      societe: societeRow.nom,
      periode,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur PRGF'
    console.error('[prgf-mra] CRASH:', msg)
    return NextResponse.json({
      error: 'Erreur interne lors de la génération PRGF. Vérifiez les logs serveur.',
    }, { status: 500 })
  }
}
