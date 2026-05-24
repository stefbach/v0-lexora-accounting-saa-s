/**
 * POST /api/rh/exports/paco-mra
 * Body : { societe_id: string, periode: 'YYYY-MM' }
 *
 * Génère le fichier PACO MRA (Joint Statement Dec 2024) — fichier unique
 * paco<YYYYMMDD>.csv à uploader sur le portail MRA e-Services.
 *
 * Remplace les 4 CSV legacy (CSG_NSF_Detail/Recap, PAYE_Detail/Recap) qui
 * ne correspondent PAS au format MRA officiel.
 *
 * SÉCURITÉ
 * - Auth required + role check (mêmes rôles que csg-mra/paye-mra)
 * - Lock check sur la période (paie verrouillée requise)
 * - ERN/BRN validés avant génération
 *
 * RETOUR
 * - { csv, filename, warnings, totaux, ... }
 * - Le frontend télécharge directement le csv en .csv
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { lastDayOfMonth } from '@/lib/rh/period'
import {
  genererPacoMra,
  type PacoSociete,
  type PacoEmploye,
  type PacoBulletin,
} from '@/lib/rh/declarations-mra-paco'

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
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({
        error: `Accès refusé : la génération PACO MRA est réservée aux rôles ${ALLOWED_ROLES.join(', ')}. Votre rôle : ${role || 'inconnu'}.`,
      }, { status: 403 })
    }

    const { societe_id, periode } = await request.json()
    if (!societe_id || !periode) {
      return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ error: 'Format periode invalide. Attendu YYYY-MM.' }, { status: 400 })
    }

    // ── Lock check (paie verrouillée requise) ─────────────────
    const { data: unlockedBuls } = await supabase
      .from('bulletins_paie').select('id').eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`).lte('periode', lastDayOfMonth(periode))
      .or('verrouille.is.null,verrouille.eq.false')
      .limit(1)
    if (unlockedBuls && unlockedBuls.length > 0) {
      return NextResponse.json({
        error: `Periode non verrouillee pour ${periode}. Verrouillez d'abord la paie dans /rh/paie avant de générer le PACO.`,
      }, { status: 403 })
    }

    // ── Société (avec colonnes mig 210) ───────────────────────
    const { data: societeRow } = await supabase
      .from('societes').select('*').eq('id', societe_id).single()
    if (!societeRow) {
      return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    }

    const ern = (societeRow.ern || '').toString().trim()
    if (!ern || !/^\d{8}$/.test(ern)) {
      return NextResponse.json({
        error: `ERN manquant ou invalide pour "${societeRow.nom}". Format requis : 8 chiffres. À corriger dans /rh/societe.`,
      }, { status: 400 })
    }
    const brn = (societeRow.brn || '').toString().trim()
    if (!brn || !/^[A-Z0-9]{1,12}$/i.test(brn)) {
      return NextResponse.json({
        error: `BRN manquant ou invalide pour "${societeRow.nom}". Format requis : alphanumérique max 12 caractères.`,
      }, { status: 400 })
    }

    const societe: PacoSociete = {
      nom: societeRow.nom,
      ern,
      brn,
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
      .select('*')
      .eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`)
      .lte('periode', lastDayOfMonth(periode))
    if (bulErr) {
      console.error('[paco-mra] DB error bulletins:', bulErr.message)
      return NextResponse.json({ error: `Erreur DB bulletins: ${bulErr.message}` }, { status: 500 })
    }
    if (!bulletinsRows || bulletinsRows.length === 0) {
      return NextResponse.json({ error: `Aucun bulletin pour ${periode}.` }, { status: 404 })
    }

    // ── Employés concernés ────────────────────────────────────
    const empIds = [...new Set(bulletinsRows.map((b: any) => b.employe_id).filter(Boolean))]
    const { data: employesRows } = empIds.length > 0
      ? await supabase.from('employes').select('*').in('id', empIds)
      : { data: [] }

    const employes: PacoEmploye[] = (employesRows || []).map((e: any) => ({
      id: e.id,
      nom: e.nom || '',
      prenom: e.prenom || '',
      nic_number: e.nic_number ?? null,
      contribution_code: e.contribution_code ?? null,
      contrat_type: e.contrat_type ?? null,
      type_contrat: e.type_contrat ?? null,
      exclure_mra: e.exclure_mra ?? false,
    }))

    // Bug PACO #B — Charger parametres_paie_mra (mig 212 : NSF 28570,
    // Training 1.5%, etc.). Le générateur recalcule CSG/NSF à la volée
    // avec ces taux/plafonds, plutôt que de lire les valeurs des
    // bulletins (qui peuvent dater d'avant la mise à jour des taux).
    const { data: paramsRow } = await supabase
      .from('parametres_paie_mra')
      .select('*')
      .order('annee', { ascending: false })
      .limit(1)
      .maybeSingle()

    const params = paramsRow ? {
      csg_seuil_taux_reduit: Number(paramsRow.csg_seuil_taux_reduit) || 50000,
      csg_salarie_taux_reduit: Number(paramsRow.csg_salarie_taux_reduit) || 0.015,
      csg_salarie_taux_plein: Number(paramsRow.csg_salarie_taux_plein) || 0.030,
      csg_patronal: Number(paramsRow.csg_patronal) || 0.060,
      csg_patronal_taux_reduit: Number(paramsRow.csg_patronal_taux_reduit ?? 0.030),
      nsf_salarie: Number(paramsRow.nsf_salarie) || 0.010,
      nsf_patronal: Number(paramsRow.nsf_patronal) || 0.025,
      nsf_plafond_mensuel: Number(paramsRow.nsf_plafond_mensuel) || 28570,
    } : undefined

    const bulletins: PacoBulletin[] = bulletinsRows.map((b: any) => ({
      employe_id: b.employe_id,
      periode: String(b.periode).slice(0, 10),
      salaire_base: Number(b.salaire_base) || 0,
      montant_absence: Number(b.montant_absence) || 0,
      base_csg_nsf: b.base_csg_nsf != null ? Number(b.base_csg_nsf) : null,
      salaire_brut: Number(b.salaire_brut) || 0,
      csg_salarie: Number(b.csg_salarie) || 0,
      csg_patronal: Number(b.csg_patronal) || 0,
      csg_bonus: Number(b.csg_bonus) || 0,
      csg_patronal_bonus: Number(b.csg_patronal_bonus) || 0,
      nsf_salarie: Number(b.nsf_salarie) || 0,
      nsf_patronal: Number(b.nsf_patronal) || 0,
      paye: Number(b.paye) || 0,
      eoy_bonus: Number(b.eoy_bonus) || 0,
    }))

    // ── Génération ────────────────────────────────────────────
    let result
    try {
      result = genererPacoMra({ societe, employes, bulletins, periode, params })
    } catch (e: any) {
      return NextResponse.json({
        error: e?.message || 'Erreur génération PACO',
      }, { status: 422 })
    }

    return NextResponse.json({
      csv: result.csv,
      filename: result.filename,
      warnings: result.warnings,
      totaux: {
        employes_inclus: result.employes_inclus,
        employes_exclus_mra: result.employes_exclus_mra,
        total_wage_bill: result.total_wage_bill,
        total_csg: result.total_csg,
        total_nsf: result.total_nsf,
        total_paye: result.total_paye,
      },
      societe: societeRow.nom,
      periode,
    })
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : 'Erreur PACO'
    console.error('[paco-mra] CRASH:', msg)
    return NextResponse.json({
      error: 'Erreur interne lors de la génération PACO. Vérifiez les logs serveur.',
    }, { status: 500 })
  }
}
