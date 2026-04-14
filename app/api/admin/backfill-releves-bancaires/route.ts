/**
 * POST /api/admin/backfill-releves-bancaires
 *
 * One-shot admin utility to repair documents that were OCR-processed as
 * `releve_bancaire` (statut='traite') but whose transactions never made it
 * into the `releves_bancaires` table. Root cause: earlier versions of
 * app/api/documents/upload/route.ts and [id]/reanalyze/route.ts silently
 * skipped the insert when the OCR failed to extract a clean bank name
 * (common with OCC statements that use a logo image instead of text).
 *
 * This endpoint:
 *   1. Finds every `documents` row where type_document='releve_bancaire'
 *      and no `releves_bancaires` row has document_id = documents.id.
 *   2. Rebuilds the releve from `documents.n8n_result.extraction` —
 *      normalises `lignes[]` / `transactions[]` the same way the routes
 *      do, auto-creates a fallback bank account when none exists, writes
 *      the releve.
 *   3. Returns a per-doc diff with {applied, skipped, errors[]}.
 *
 * Safe to run multiple times — it SKIPS any document that already has a
 * releve row, so no duplicates. Dry-run by default; pass ?apply=1 to
 * persist.
 *
 * Auth: admin / super_admin.
 */
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isBankName } from '@/lib/utils/bank-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type Diff = {
  document_id: string
  nom_fichier: string
  societe_id: string | null
  action: 'created' | 'skipped_no_transactions' | 'skipped_no_societe' | 'error'
  nb_transactions?: number
  compte_bancaire_id?: string | null
  periode?: string | null
  reason?: string
}

export async function POST(request: Request) {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAuth
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const apply = url.searchParams.get('apply') === '1'
  const societeFilter = url.searchParams.get('societe_id')
  const docIdFilter = url.searchParams.get('document_id')

  const supabase = getAdminClient()

  // 1. Identify candidate documents.
  let q = supabase
    .from('documents')
    .select('id, nom_fichier, dossier_id, type_document, statut, n8n_result, dossiers(societe_id, client_id)')
    .eq('type_document', 'releve_bancaire')
    .eq('statut', 'traite')
  if (docIdFilter) q = q.eq('id', docIdFilter)
  const { data: docs, error: docsErr } = await q
  if (docsErr) return NextResponse.json({ error: `Documents: ${docsErr.message}` }, { status: 500 })

  // Pre-filter to docs that have NO releve yet.
  const docIds = (docs || []).map((d: any) => d.id)
  const { data: existingReleves } = await supabase
    .from('releves_bancaires').select('document_id').in('document_id', docIds)
  const alreadyStored = new Set((existingReleves || []).map((r: any) => r.document_id))

  const candidates = (docs || []).filter((d: any) => !alreadyStored.has(d.id))

  const diffs: Diff[] = []

  for (const doc of candidates) {
    const dossier: any = doc.dossiers
    const bankSocieteId: string | null = dossier?.societe_id || null
    const extraction = doc.n8n_result?.extraction || doc.n8n_result || {}

    if (societeFilter && bankSocieteId !== societeFilter) continue

    if (!bankSocieteId) {
      diffs.push({
        document_id: doc.id, nom_fichier: doc.nom_fichier,
        societe_id: null, action: 'skipped_no_societe',
        reason: 'No societe_id resolved from dossier',
      })
      continue
    }

    // Normalize transactions (same logic as upload + reanalyze routes).
    const rawTransactions: any[] = extraction.transactions || []
    const rawLignes: any[] = extraction.lignes || []
    const lignesAsTransactions = rawLignes.map((l: any) => ({
      date: l.date || '', libelle: l.libelle || '',
      debit: l.sens === 'debit' ? (Number(l.montant) || 0) : 0,
      credit: l.sens === 'credit' ? (Number(l.montant) || 0) : 0,
      solde_apres: l.solde_apres ?? null,
      tiers_detecte: l.tiers_detecte || null,
      compte_comptable: l.sens === 'debit' ? (l.compte_debit || null) : (l.compte_credit || null),
      statut: (l.confiance || 0) >= 70 ? 'identifie' : ((l.confiance || 0) >= 40 ? 'a_verifier' : 'non_identifie'),
    }))
    const normalizedTransactions = rawTransactions.length > 0 ? rawTransactions : lignesAsTransactions

    if (normalizedTransactions.length === 0) {
      diffs.push({
        document_id: doc.id, nom_fichier: doc.nom_fichier,
        societe_id: bankSocieteId, action: 'skipped_no_transactions',
        reason: 'OCR extraction has 0 transactions — run reanalyze with force_ocr=true first',
      })
      continue
    }

    // Resolve or create the bank account.
    const ibanCurrency = extraction.iban?.match(/[A-Z]{3}$/)?.[0] || null
    const bankDevise = (extraction.devise || ibanCurrency || 'MUR').toUpperCase().replace(/[^A-Z]/g, '') || 'MUR'
    const rawBankName = extraction.banque || extraction.compte_bancaire || null
    const bankName = rawBankName && !isBankName(rawBankName) ? rawBankName : rawBankName
    const extractedIBAN: string | null = extraction.iban || null
    const normNumeroCompte: string | null = extraction.numero_compte || extraction.compte_bancaire || null

    let bankAccount: { id: string; societe_id: string } | null = null

    if (extractedIBAN) {
      const { data } = await supabase.from('comptes_bancaires')
        .select('id, societe_id').eq('societe_id', bankSocieteId).eq('iban', extractedIBAN).limit(1).maybeSingle()
      if (data) bankAccount = data as any
    }
    if (!bankAccount && normNumeroCompte) {
      const { data } = await supabase.from('comptes_bancaires')
        .select('id, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
      if (data) bankAccount = data as any
    }
    if (!bankAccount && bankName) {
      const { data } = await supabase.from('comptes_bancaires')
        .select('id, societe_id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
      if (data) bankAccount = data as any
    }
    // Last-resort fallback: any account of this société with matching devise.
    if (!bankAccount) {
      const { data } = await supabase.from('comptes_bancaires')
        .select('id, societe_id').eq('societe_id', bankSocieteId).eq('devise', bankDevise)
        .order('date_dernier_releve', { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle()
      if (data) bankAccount = data as any
    }

    if (!bankAccount && apply) {
      // Create a minimal account so the releve has a home.
      const finalBankName =
        bankName
        || (extractedIBAN ? `Banque (${extractedIBAN.slice(0, 4)}…)` : null)
        || 'Banque non identifiée'
      const { data: created, error: accErr } = await supabase.from('comptes_bancaires').insert({
        societe_id: bankSocieteId, banque: finalBankName,
        nom_compte: normNumeroCompte || null,
        numero_compte: normNumeroCompte, iban: extractedIBAN,
        devise: bankDevise, actif: true,
      }).select('id, societe_id').maybeSingle()
      if (accErr) {
        diffs.push({
          document_id: doc.id, nom_fichier: doc.nom_fichier,
          societe_id: bankSocieteId, action: 'error',
          reason: `comptes_bancaires insert failed: ${accErr.message}`,
        })
        continue
      }
      bankAccount = created as any
    }

    if (!bankAccount) {
      // Dry run: count this as "would create account".
      diffs.push({
        document_id: doc.id, nom_fichier: doc.nom_fichier,
        societe_id: bankSocieteId, action: 'created',
        nb_transactions: normalizedTransactions.length,
        compte_bancaire_id: null,
        periode: extraction.periode_fin || extraction.periode || null,
        reason: 'Would create fallback bank account + releve (dry run)',
      })
      continue
    }

    // Normalise dates.
    let normPeriodeFin: string | null = extraction.periode_fin || extraction.date_fin || null
    if (!normPeriodeFin && extraction.periode && /^\d{4}-\d{2}$/.test(extraction.periode)) {
      const [y, m] = extraction.periode.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      normPeriodeFin = `${extraction.periode}-${String(lastDay).padStart(2, '0')}`
    }
    let normPeriodeDebut: string | null = extraction.periode_debut || extraction.date_debut || null
    if (!normPeriodeDebut && extraction.periode && /^\d{4}-\d{2}$/.test(extraction.periode)) {
      normPeriodeDebut = `${extraction.periode}-01`
    }
    if (!normPeriodeDebut) normPeriodeDebut = normPeriodeFin

    const totalDebits = Number(extraction.total_debits) ||
      normalizedTransactions.reduce((s: number, t: any) => s + (Number(t.debit) || 0), 0)
    const totalCredits = Number(extraction.total_credits) ||
      normalizedTransactions.reduce((s: number, t: any) => s + (Number(t.credit) || 0), 0)
    const soldeOuverture = Number(extraction.solde_ouverture) || Number(extraction.solde_debut) || 0
    const soldeCloture = Number(extraction.solde_cloture) || Number(extraction.solde_fin) || 0
    const ecartSolde = Math.abs((soldeOuverture + totalCredits - totalDebits) - soldeCloture)

    if (!apply) {
      diffs.push({
        document_id: doc.id, nom_fichier: doc.nom_fichier,
        societe_id: bankSocieteId, action: 'created',
        nb_transactions: normalizedTransactions.length,
        compte_bancaire_id: bankAccount.id,
        periode: normPeriodeFin,
        reason: 'Would insert releve (dry run)',
      })
      continue
    }

    const { error: releveErr } = await supabase.from('releves_bancaires').insert({
      compte_bancaire_id: bankAccount.id,
      societe_id: bankSocieteId,
      periode: normPeriodeFin ? normPeriodeFin.substring(0, 7) : null,
      date_debut: normPeriodeDebut,
      date_fin: normPeriodeFin,
      solde_ouverture: soldeOuverture,
      solde_cloture: soldeCloture,
      total_debits: totalDebits,
      total_credits: totalCredits,
      document_id: doc.id,
      transactions_json: normalizedTransactions,
      statut_rapprochement: ecartSolde > 1 ? 'ecart_detecte' : 'en_attente',
    })

    if (releveErr) {
      diffs.push({
        document_id: doc.id, nom_fichier: doc.nom_fichier,
        societe_id: bankSocieteId, action: 'error',
        reason: `releves_bancaires insert failed: ${releveErr.message}`,
      })
    } else {
      diffs.push({
        document_id: doc.id, nom_fichier: doc.nom_fichier,
        societe_id: bankSocieteId, action: 'created',
        nb_transactions: normalizedTransactions.length,
        compte_bancaire_id: bankAccount.id,
        periode: normPeriodeFin,
      })
    }
  }

  const summary = {
    scanned: docs?.length || 0,
    already_had_releve: alreadyStored.size,
    candidates: candidates.length,
    created: diffs.filter(d => d.action === 'created').length,
    skipped_no_transactions: diffs.filter(d => d.action === 'skipped_no_transactions').length,
    skipped_no_societe: diffs.filter(d => d.action === 'skipped_no_societe').length,
    errors: diffs.filter(d => d.action === 'error').length,
  }

  return NextResponse.json({ ok: true, apply, summary, diffs })
}
