import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type SupabaseAdmin = ReturnType<typeof createClient>

type RepairStatus = 'pass' | 'fail' | 'skipped'

interface RepairResult {
  action: string
  status: RepairStatus
  affected: number
  message: string
  details?: unknown[]
}

interface RepairRequest {
  societe_id: string
  actions: string[]
  dry_run?: boolean
}

const BANK_LIKE_NAMES = /^(mcb|sbm|bom|bank of mauritius|mauritius commercial bank|state bank|absa|hsbc|barclays|afrasia|standard chartered)(\s|$)/i
const FEE_LIKE_NAMES = /^(tax amount due|service fee|outward transfer|swift charge|stamp duty|merchant|bank charge|commission)/i

function getAdmin(): SupabaseAdmin {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─────────────────────────────────────────────────────────────────────────
// ACTION 1 — backfill_factures_ecritures
// Pour chaque facture sans VTE/ACH → appelle createEcrituresForFacture
// ─────────────────────────────────────────────────────────────────────────
async function repair_backfill_factures_ecritures(
  admin: SupabaseAdmin, societeId: string, dryRun: boolean
): Promise<RepairResult> {
  const { data: factures } = await admin.from('factures')
    .select('id, numero_facture, tiers, type_facture, date_facture, montant_ht, montant_tva, montant_ttc, montant_mur, devise, taux_change, statut, dossier_id')
    .eq('societe_id', societeId)
    .not('statut', 'in', '(brouillon,annule)') as { data: Array<Record<string, unknown>> | null }

  if (!factures || factures.length === 0) {
    return { action: 'backfill_factures_ecritures', status: 'pass', affected: 0, message: 'Aucune facture à vérifier' }
  }

  const facturesSansEcriture: Record<string, unknown>[] = []
  for (const f of factures) {
    const isClient = f.type_facture === 'client'
    const expectedCompte = isClient ? '411' : '401'
    const expectedJournal = isClient ? 'VTE' : 'ACH'
    const { data: ecrs } = await admin.from('ecritures_comptables_v2')
      .select('id').eq('facture_id', f.id as string)
      .eq('journal', expectedJournal).eq('numero_compte', expectedCompte).limit(1)
    if (!ecrs || ecrs.length === 0) facturesSansEcriture.push(f)
  }

  if (dryRun) {
    return {
      action: 'backfill_factures_ecritures',
      status: 'pass', affected: facturesSansEcriture.length,
      message: `${facturesSansEcriture.length} facture(s) à backfiller (dry-run)`,
      details: facturesSansEcriture.slice(0, 10).map(f => ({
        id: f.id, numero: f.numero_facture, tiers: f.tiers, type: f.type_facture, montant_mur: f.montant_mur,
      })),
    }
  }

  let ok = 0, failed = 0
  for (const f of facturesSansEcriture) {
    const res = await createEcrituresForFacture(admin, {
      id: f.id as string,
      societe_id: societeId,
      numero_facture: (f.numero_facture as string) || '',
      tiers: (f.tiers as string) || '',
      date_facture: f.date_facture as string,
      montant_ht: Number(f.montant_ht) || 0,
      montant_tva: Number(f.montant_tva) || 0,
      montant_ttc: Number(f.montant_ttc) || 0,
      type_facture: (f.type_facture === 'fournisseur' ? 'fournisseur' : 'client'),
      devise: (f.devise as string) || 'MUR',
      taux_change: Number(f.taux_change) || 1,
      montant_mur: Number(f.montant_mur) || undefined,
    })
    if (res.ok) ok++; else failed++
  }
  return {
    action: 'backfill_factures_ecritures',
    status: failed === 0 ? 'pass' : 'fail',
    affected: ok,
    message: `${ok} écritures générées${failed > 0 ? `, ${failed} échecs` : ''}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ACTION 2 — backfill_paiements_bnq
// Factures paye avec rapproche_releve_id sans BNQ → crée la paire 401/512 ou 411/512
// ref_folio UNIQUE par facture (paiements groupés gérés)
// ─────────────────────────────────────────────────────────────────────────
async function repair_backfill_paiements_bnq(
  admin: SupabaseAdmin, societeId: string, dryRun: boolean
): Promise<RepairResult> {
  const { data: factures } = await admin.from('factures')
    .select('id, numero_facture, tiers, type_facture, montant_mur, rapproche_releve_id, rapproche_transaction_idx, rapproche_date, dossier_id')
    .eq('societe_id', societeId).eq('statut', 'paye')
    .not('rapproche_releve_id', 'is', null) as { data: Array<Record<string, unknown>> | null }

  if (!factures || factures.length === 0) {
    return { action: 'backfill_paiements_bnq', status: 'pass', affected: 0, message: 'Aucune facture paye à traiter' }
  }

  const toCreate: Array<Record<string, unknown>> = []
  for (const f of factures) {
    const tierAccount = f.type_facture === 'client' ? '411' : '401'
    const { data: bnq } = await admin.from('ecritures_comptables_v2')
      .select('id').eq('facture_id', f.id as string)
      .eq('journal', 'BNQ').eq('numero_compte', tierAccount).limit(1)
    if (!bnq || bnq.length === 0) toCreate.push(f)
  }

  if (dryRun) {
    return {
      action: 'backfill_paiements_bnq',
      status: 'pass', affected: toCreate.length,
      message: `${toCreate.length} paiement(s) BNQ à générer (dry-run)`,
      details: toCreate.slice(0, 10).map(f => ({
        numero: f.numero_facture, tiers: f.tiers, montant_mur: f.montant_mur,
      })),
    }
  }

  let ok = 0, failed = 0
  for (const f of toCreate) {
    const tierAccount = f.type_facture === 'client' ? '411' : '401'
    const tierName = f.type_facture === 'client' ? 'Clients' : 'Fournisseurs'
    const facId = f.id as string
    const shortId = facId.substring(0, 8)
    const uniqueRef = `BANK-${f.rapproche_releve_id}-${f.rapproche_transaction_idx}-${shortId}`
    const montant = Math.round((Number(f.montant_mur) || 0) * 100) / 100
    if (montant <= 0) { failed++; continue }

    // Lookup compte banque
    const { data: releveRaw } = await admin.from('releves_bancaires')
      .select('compte_bancaire_id').eq('id', f.rapproche_releve_id as string).maybeSingle()
    const releve = releveRaw as { compte_bancaire_id: string | null } | null
    let compteBanque = '512', banqueNom = 'Banque'
    if (releve?.compte_bancaire_id) {
      const { data: cbRaw } = await admin.from('comptes_bancaires')
        .select('compte_comptable, banque').eq('id', releve.compte_bancaire_id).maybeSingle()
      const cb = cbRaw as { compte_comptable: string | null; banque: string | null } | null
      if (cb?.compte_comptable) compteBanque = cb.compte_comptable
      if (cb?.banque) banqueNom = cb.banque
    }

    let dossierId = f.dossier_id as string | null
    if (!dossierId) {
      const { data: dRaw } = await admin.from('dossiers').select('id').eq('societe_id', societeId).limit(1).maybeSingle()
      const d = dRaw as { id: string } | null
      dossierId = d?.id ?? null
    }

    const isClient = f.type_facture === 'client'
    const date = (f.rapproche_date as string) || new Date().toISOString().split('T')[0]
    const libelle = `Paiement ${new Date(date).toLocaleDateString('fr-FR')} — ${f.tiers || ''}`
    const exercice = new Date(date).getFullYear().toString()

    const { error } = await admin.from('ecritures_comptables_v2').insert([
      {
        societe_id: societeId, dossier_id: dossierId,
        date_ecriture: date, journal: 'BNQ',
        ref_folio: uniqueRef, numero_piece: f.numero_facture,
        numero_compte: tierAccount, nom_compte: tierName,
        libelle, description: libelle,
        debit_mur: isClient ? 0 : montant, credit_mur: isClient ? montant : 0,
        exercice, facture_id: facId,
      },
      {
        societe_id: societeId, dossier_id: dossierId,
        date_ecriture: date, journal: 'BNQ',
        ref_folio: uniqueRef, numero_piece: f.numero_facture,
        numero_compte: compteBanque, nom_compte: banqueNom,
        libelle, description: libelle,
        debit_mur: isClient ? montant : 0, credit_mur: isClient ? 0 : montant,
        exercice, facture_id: facId,
      },
    ])
    if (error) failed++; else ok++
  }
  return {
    action: 'backfill_paiements_bnq',
    status: failed === 0 ? 'pass' : 'fail',
    affected: ok,
    message: `${ok} paire(s) BNQ créée(s)${failed > 0 ? `, ${failed} échec(s)` : ''}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ACTION 3 — purge_cca_doublons
// Dedup mouvements_compte_courant par (compte, date, montant_devise_origine)
// ─────────────────────────────────────────────────────────────────────────
async function repair_purge_cca_doublons(
  admin: SupabaseAdmin, societeId: string, dryRun: boolean
): Promise<RepairResult> {
  if (dryRun) {
    const { data: mouvements } = await admin.from('mouvements_compte_courant')
      .select('id, compte_courant_id, date_mouvement, description, created_at')
      .eq('societe_id', societeId) as { data: Array<Record<string, unknown>> | null }
    const seen = new Map<string, boolean>()
    let doublons = 0
    for (const m of mouvements || []) {
      const desc = (m.description as string) || ''
      const match = desc.match(/[\[(](\d+\.\d+) [A-Z]{3}/)
      if (!match) continue
      const key = `${m.compte_courant_id}|${m.date_mouvement}|${match[1]}`
      if (seen.has(key)) doublons++
      else seen.set(key, true)
    }
    return {
      action: 'purge_cca_doublons',
      status: 'pass', affected: doublons,
      message: `${doublons} doublon(s) CCA détecté(s) (dry-run)`,
    }
  }

  // Dedup via window function en SQL pour atomicité
  const { data: mouvements } = await admin.from('mouvements_compte_courant')
    .select('id, compte_courant_id, date_mouvement, description, created_at')
    .eq('societe_id', societeId) as { data: Array<Record<string, unknown>> | null }

  const seen = new Map<string, string>() // key → earliest id
  const toDelete: string[] = []
  const sorted = [...(mouvements || [])].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  )
  for (const m of sorted) {
    const desc = (m.description as string) || ''
    const match = desc.match(/[\[(](\d+\.\d+) [A-Z]{3}/)
    if (!match) continue
    const key = `${m.compte_courant_id}|${m.date_mouvement}|${match[1]}`
    if (seen.has(key)) toDelete.push(m.id as string)
    else seen.set(key, m.id as string)
  }

  if (toDelete.length === 0) {
    return { action: 'purge_cca_doublons', status: 'pass', affected: 0, message: 'Aucun doublon détecté' }
  }

  const { error } = await admin.from('mouvements_compte_courant').delete().in('id', toDelete)
  if (error) return { action: 'purge_cca_doublons', status: 'fail', affected: 0, message: error.message }

  // Recalc soldes
  const { data: allMvts } = await admin.from('mouvements_compte_courant')
    .select('compte_courant_id, type, montant').eq('societe_id', societeId) as { data: Array<Record<string, unknown>> | null }
  const soldes = new Map<string, number>()
  for (const m of allMvts || []) {
    const ccaId = m.compte_courant_id as string
    const sign = ['avance', 'retrait'].includes(String(m.type)) ? -1 :
                 ['apport', 'remboursement'].includes(String(m.type)) ? 1 : 0
    soldes.set(ccaId, (soldes.get(ccaId) || 0) + sign * (Number(m.montant) || 0))
  }
  for (const [ccaId, solde] of soldes) {
    await admin.from('comptes_courants_associes')
      .update({ solde: Math.round(solde * 100) / 100, updated_at: new Date().toISOString() })
      .eq('id', ccaId)
  }

  return {
    action: 'purge_cca_doublons',
    status: 'pass', affected: toDelete.length,
    message: `${toDelete.length} doublon(s) supprimé(s), soldes recalculés`,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ACTION 4 — delete_cca_banques_frais
// Supprime les CCA nommés comme une banque ou un frais bancaire
// ─────────────────────────────────────────────────────────────────────────
async function repair_delete_cca_banques_frais(
  admin: SupabaseAdmin, societeId: string, dryRun: boolean
): Promise<RepairResult> {
  const { data: ccas } = await admin.from('comptes_courants_associes')
    .select('id, nom').eq('societe_id', societeId) as { data: Array<{ id: string; nom: string }> | null }

  const faux = (ccas || []).filter(c => BANK_LIKE_NAMES.test(c.nom || '') || FEE_LIKE_NAMES.test(c.nom || ''))
  if (faux.length === 0) {
    return { action: 'delete_cca_banques_frais', status: 'pass', affected: 0, message: 'Aucun CCA bank/fee-like' }
  }

  if (dryRun) {
    return {
      action: 'delete_cca_banques_frais',
      status: 'pass', affected: faux.length,
      message: `${faux.length} CCA à supprimer (dry-run)`,
      details: faux.map(c => ({ id: c.id, nom: c.nom })),
    }
  }

  const ids = faux.map(c => c.id)
  await admin.from('mouvements_compte_courant').delete().in('compte_courant_id', ids)
  const { count } = await admin.from('comptes_courants_associes').delete({ count: 'exact' }).in('id', ids)
  return {
    action: 'delete_cca_banques_frais',
    status: 'pass', affected: count || 0,
    message: `${count} CCA supprimé(s) + mouvements associés`,
    details: faux.map(c => ({ nom: c.nom })),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ACTION 5 — remap_legacy_comptes
// 421/431/432/433/444 → PCM 4-digits par libellé
// ─────────────────────────────────────────────────────────────────────────
async function repair_remap_legacy_comptes(
  admin: SupabaseAdmin, societeId: string, dryRun: boolean
): Promise<RepairResult> {
  const rules: Array<{ from: string; to: string; libelleMatch?: RegExp; nom: string }> = [
    { from: '421', to: '4210', nom: 'Salaires nets à payer' },
    { from: '431', to: '4321', libelleMatch: /csg patronal/i, nom: 'CSG patronal à verser' },
    { from: '431', to: '4322', libelleMatch: /nsf patronal/i, nom: 'NSF patronal à verser' },
    { from: '431', to: '4311', libelleMatch: /csg salari[eé]/i, nom: 'CSG salarié à verser' },
    { from: '431', to: '4312', libelleMatch: /nsf salari[eé]/i, nom: 'NSF salarié à verser' },
    { from: '431', to: '4312', nom: 'NSF salarié à verser (fallback)' },
    { from: '432', to: '4323', libelleMatch: /prgf/i, nom: 'PRGF à verser' },
    { from: '432', to: '4324', libelleMatch: /(training|levy|hrdc)/i, nom: 'Training Levy HRDC à verser' },
    { from: '432', to: '4323', nom: 'PRGF (fallback)' },
    { from: '433', to: '4330', nom: 'PAYE à reverser à la MRA' },
    { from: '444', to: '4330', nom: 'PAYE à reverser à la MRA' },
  ]

  const { data: legacy } = await admin.from('ecritures_comptables_v2')
    .select('id, numero_compte, libelle').eq('societe_id', societeId)
    .in('numero_compte', ['421', '431', '432', '433', '444']) as { data: Array<{ id: string; numero_compte: string; libelle: string }> | null }

  if (!legacy || legacy.length === 0) {
    return { action: 'remap_legacy_comptes', status: 'pass', affected: 0, message: 'Aucun code legacy à remapper' }
  }

  const updates: Array<{ id: string; to: string; nom: string }> = []
  for (const ecr of legacy) {
    for (const rule of rules) {
      if (ecr.numero_compte !== rule.from) continue
      if (rule.libelleMatch && !rule.libelleMatch.test(ecr.libelle || '')) continue
      updates.push({ id: ecr.id, to: rule.to, nom: rule.nom })
      break
    }
  }

  if (dryRun) {
    const byTo: Record<string, number> = {}
    for (const u of updates) byTo[u.to] = (byTo[u.to] || 0) + 1
    return {
      action: 'remap_legacy_comptes',
      status: 'pass', affected: updates.length,
      message: `${updates.length} écriture(s) à remapper (dry-run)`,
      details: Object.entries(byTo).map(([to, nb]) => ({ target: to, count: nb })),
    }
  }

  let ok = 0, failed = 0
  for (const u of updates) {
    const { error } = await admin.from('ecritures_comptables_v2')
      .update({ numero_compte: u.to, nom_compte: u.nom }).eq('id', u.id)
    if (error) failed++; else ok++
  }
  return {
    action: 'remap_legacy_comptes',
    status: failed === 0 ? 'pass' : 'fail',
    affected: ok,
    message: `${ok} écriture(s) remappée(s)${failed > 0 ? `, ${failed} échec(s)` : ''}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ACTION 6 — relettrer_factures
// Pose lettre unique par facture sur les lignes 411/401 non lettrées
// ─────────────────────────────────────────────────────────────────────────
async function repair_relettrer_factures(
  admin: SupabaseAdmin, societeId: string, dryRun: boolean
): Promise<RepairResult> {
  const { data: factures } = await admin.from('factures')
    .select('id, type_facture, date_facture').eq('societe_id', societeId)
    .in('type_facture', ['client', 'fournisseur']) as { data: Array<{ id: string; type_facture: string; date_facture: string }> | null }

  if (!factures || factures.length === 0) {
    return { action: 'relettrer_factures', status: 'pass', affected: 0, message: 'Aucune facture' }
  }

  factures.sort((a, b) => String(a.date_facture).localeCompare(String(b.date_facture)))

  let cliSeq = 0, fouSeq = 0
  const toLetter: Array<{ facture_id: string; compte: string; lettre: string }> = []
  for (const f of factures) {
    const compte = f.type_facture === 'client' ? '411' : '401'
    const { data: unlettered } = await admin.from('ecritures_comptables_v2')
      .select('id').eq('facture_id', f.id).eq('numero_compte', compte).is('lettre', null).limit(1)
    if (!unlettered || unlettered.length === 0) continue
    const prefix = f.type_facture === 'client' ? 'CLI' : 'FOU'
    const seq = f.type_facture === 'client' ? ++cliSeq : ++fouSeq
    const lettre = `${prefix}-${String(seq).padStart(5, '0')}`
    toLetter.push({ facture_id: f.id, compte, lettre })
  }

  if (dryRun) {
    return {
      action: 'relettrer_factures',
      status: 'pass', affected: toLetter.length,
      message: `${toLetter.length} facture(s) à lettrer (dry-run)`,
    }
  }

  let ok = 0
  const today = new Date().toISOString().split('T')[0]
  for (const item of toLetter) {
    const { error } = await admin.from('ecritures_comptables_v2')
      .update({ lettre: item.lettre, date_lettrage: today })
      .eq('facture_id', item.facture_id).eq('numero_compte', item.compte).is('lettre', null)
    if (!error) ok++
  }
  return {
    action: 'relettrer_factures',
    status: 'pass', affected: ok,
    message: `${ok} facture(s) lettrée(s)`,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// HANDLER POST
// ─────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const start = Date.now()
  try {
    // Auth admin/super_admin only
    const server = await createServerClient()
    const { data: { user } } = await server.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: profileRaw } = await server.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const profile = profileRaw as { role: string | null } | null
    if (!profile || !['admin', 'super_admin'].includes(profile.role || '')) {
      return NextResponse.json({ error: 'Accès admin requis' }, { status: 403 })
    }

    const body = await request.json() as RepairRequest
    const { societe_id, actions, dry_run = true } = body
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json({ error: 'actions (array) requis' }, { status: 400 })
    }

    const admin = getAdmin()
    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (e) {
      if (e instanceof SocieteAccessError) {
        return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      }
      throw e
    }

    const ACTIONS: Record<string, (a: SupabaseAdmin, s: string, d: boolean) => Promise<RepairResult>> = {
      backfill_factures_ecritures: repair_backfill_factures_ecritures,
      backfill_paiements_bnq: repair_backfill_paiements_bnq,
      purge_cca_doublons: repair_purge_cca_doublons,
      delete_cca_banques_frais: repair_delete_cca_banques_frais,
      remap_legacy_comptes: repair_remap_legacy_comptes,
      relettrer_factures: repair_relettrer_factures,
    }

    const results: RepairResult[] = []
    for (const action of actions) {
      const fn = ACTIONS[action]
      if (!fn) {
        results.push({ action, status: 'fail', affected: 0, message: `Action inconnue: ${action}` })
        continue
      }
      try {
        results.push(await fn(admin, societe_id, dry_run))
      } catch (e) {
        results.push({
          action, status: 'fail', affected: 0,
          message: e instanceof Error ? e.message : 'Exception inconnue',
        })
      }
    }

    return NextResponse.json({
      societe_id, dry_run, duration_ms: Date.now() - start,
      results,
    })
  } catch (e) {
    console.error('[admin/repair]', e)
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Erreur serveur',
    }, { status: 500 })
  }
}

// GET retourne la liste des actions disponibles (pour l'UI)
export async function GET() {
  return NextResponse.json({
    actions: [
      { id: 'backfill_factures_ecritures', label: 'Régénérer les écritures VTE/ACH manquantes', severity: 'safe' },
      { id: 'backfill_paiements_bnq', label: 'Créer les paiements BNQ manquants (factures paye)', severity: 'safe' },
      { id: 'purge_cca_doublons', label: 'Purger les doublons de mouvements CCA', severity: 'destructive' },
      { id: 'delete_cca_banques_frais', label: 'Supprimer les faux CCA (noms banques/frais)', severity: 'destructive' },
      { id: 'remap_legacy_comptes', label: 'Remap 421/431/432/433/444 → PCM 4-digits', severity: 'safe' },
      { id: 'relettrer_factures', label: 'Lettrer les 411/401 par facture_id', severity: 'safe' },
    ],
  })
}
