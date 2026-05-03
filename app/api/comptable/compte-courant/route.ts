import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// transaction_id côté UI a la forme "<releveId>-tx-<idx>" ou contient l'idx
// en suffixe. On extrait l'index numérique pour matcher source_transaction_idx
// (INTEGER) — schéma défini par migration 203.
function extractTxIdx(transaction_id: string | number | null | undefined): number | null {
  if (transaction_id == null) return null
  if (typeof transaction_id === 'number') return Number.isFinite(transaction_id) ? transaction_id : null
  const tail = String(transaction_id).split('-').pop()
  const n = parseInt(tail || '', 10)
  return Number.isFinite(n) ? n : null
}

// Marque une transaction bancaire comme rapprochée dans
// releves_bancaires.transactions_json. Utilisé après la création d'un
// mouvement CCA pour éviter que la transaction réapparaisse dans la page
// rapprochement (cause documentée du double-comptage signalé en prod).
async function markBankTransactionRapproche(
  supabase: any,
  releveId: string,
  transactionId: string,
  patch: Record<string, any>,
): Promise<void> {
  const txIdx = extractTxIdx(transactionId)
  if (txIdx == null) return
  const { data: releve } = await supabase
    .from('releves_bancaires')
    .select('id, transactions_json')
    .eq('id', releveId)
    .single()
  if (!releve) return
  const txs = [...(releve.transactions_json || [])]
  if (txIdx < 0 || txIdx >= txs.length) return
  txs[txIdx] = { ...txs[txIdx], statut: 'rapproche', ...patch }
  await supabase.from('releves_bancaires').update({ transactions_json: txs }).eq('id', releveId)
}

// GET — List comptes courants associes with balances and recent movements
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Get all comptes courants for this societe
    const { data: comptes, error: comptesErr } = await supabase
      .from('comptes_courants_associes')
      .select('*')
      .eq('societe_id', societe_id)
      .order('nom', { ascending: true })

    if (comptesErr) throw comptesErr

    // Get recent movements (last 50)
    const { data: mouvements, error: mouvErr } = await supabase
      .from('mouvements_compte_courant')
      .select('*')
      .eq('societe_id', societe_id)
      .order('date_mouvement', { ascending: false })
      .limit(50)

    if (mouvErr) throw mouvErr

    // FIX 4 — candidats associés/dirigeants : employés de la société avec
    // role='direction' qui n'ont pas encore de CCA. Permet de sélectionner
    // un associé dans un popup sans devoir saisir son nom à la main.
    const existingNames = new Set((comptes || []).map((c: any) => (c.nom || '').toLowerCase().trim()))
    let candidates: Array<{ id: string; nom: string; role: string; source: 'employes' }> = []
    try {
      const { data: employes } = await supabase
        .from('employes')
        .select('id, nom, prenom, role')
        .eq('societe_id', societe_id)
        .in('role', ['direction', 'admin'])
      candidates = (employes || [])
        .map((e: any) => {
          const fullName = [e.prenom, e.nom].filter(Boolean).join(' ').trim()
          return {
            id: String(e.id),
            nom: fullName,
            role: String(e.role || ''),
            source: 'employes' as const,
          }
        })
        .filter(c => c.nom && !existingNames.has(c.nom.toLowerCase()))
    } catch (candErr) {
      // Non-bloquant — si la table employes n'est pas dispo on continue.
      console.warn('[compte-courant GET] employes fetch skipped:', candErr)
    }

    // Compute total balance (what the company owes all associates/collaborateurs)
    const totalSolde = (comptes || []).reduce((s: number, c: any) => s + (Number(c.solde) || 0), 0)

    // FIX 4 — Alerte légale : si un CCA associé est débiteur (solde < 0),
    // la société doit avoir une convention de prêt signée conformément au
    // Companies Act Mauritius. On retourne la liste des CCA concernés pour
    // que le client affiche le banner.
    const debiteurs = (comptes || []).filter((c: any) => Number(c.solde) < 0 && c.type === 'associe')
    const legal_alerts = debiteurs.map((c: any) => ({
      compte_id: c.id,
      nom: c.nom,
      solde: Number(c.solde),
      message: `Convention de prêt obligatoire (Companies Act Mauritius) — la société doit ${Math.abs(Number(c.solde)).toFixed(2)} MUR à ${c.nom}. Sans convention signée, risque de requalification en distribution de dividende.`,
    }))

    return NextResponse.json({
      comptes: comptes || [],
      mouvements: mouvements || [],
      totalSolde,
      candidates,
      legal_alerts,
    })
  } catch (e: unknown) {
    console.error('[compte-courant GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST — Actions: creer_compte, avance, remboursement, lettrer
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // === CREER COMPTE ===
    if (action === 'creer_compte') {
      const { societe_id, nom, type = 'associe' } = body
      if (!societe_id || !nom) return NextResponse.json({ error: 'societe_id et nom requis' }, { status: 400 })

      const { data, error } = await supabase
        .from('comptes_courants_associes')
        .insert({ societe_id, nom, type, solde: 0 })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ compte: data }, { status: 201 })
    }

    // === AVANCE (associate/employee pays a company expense) ===
    if (action === 'avance') {
      const { societe_id, compte_courant_id, montant, description, facture_id, date_mouvement, releve_id, transaction_id } = body
      if (!societe_id || !compte_courant_id || !montant) {
        return NextResponse.json({ error: 'societe_id, compte_courant_id et montant requis' }, { status: 400 })
      }

      const dateMvt = date_mouvement || new Date().toISOString().split('T')[0]
      const montantNum = Math.abs(Number(montant))

      // Get compte courant details
      const { data: compte } = await supabase
        .from('comptes_courants_associes')
        .select('*')
        .eq('id', compte_courant_id)
        .single()

      if (!compte) return NextResponse.json({ error: 'Compte courant non trouve' }, { status: 404 })

      // Idempotence : si on a déjà créé un mouvement pour ce releve/tx,
      // on ne refait pas — évite les doublons quand l'utilisateur clique
      // plusieurs fois ou passe par compte-courant ET rapprochement.
      // Schéma : `source_releve_id` (UUID) + `source_transaction_idx` (INTEGER)
      // depuis migration 203, avec UNIQUE INDEX ux_mouvements_cca_source.
      const txIdx = extractTxIdx(transaction_id)
      if (releve_id && txIdx != null) {
        const { data: existingMvt } = await supabase
          .from('mouvements_compte_courant')
          .select('id')
          .eq('compte_courant_id', compte_courant_id)
          .eq('source_releve_id', releve_id)
          .eq('source_transaction_idx', txIdx)
          .limit(1).maybeSingle()
        if (existingMvt) {
          return NextResponse.json({
            error: 'Cette transaction bancaire a déjà été classée en avance CCA — pas de double-comptage.',
            duplicate: true,
            mouvement_id: existingMvt.id,
          }, { status: 409 })
        }
      }

      // Create movement
      const { data: mouvement, error: mvtErr } = await supabase
        .from('mouvements_compte_courant')
        .insert({
          compte_courant_id, societe_id, date_mouvement: dateMvt,
          type: 'avance', montant: montantNum, description,
          facture_id: facture_id || null,
          source_releve_id: releve_id || null,
          source_transaction_idx: txIdx,
          source_kind: releve_id ? 'manuel' : null,
        })
        .select()
        .single()

      if (mvtErr) throw mvtErr

      // Update balance (positive = company owes associate)
      const newSolde = Number(compte.solde || 0) + montantNum
      await supabase
        .from('comptes_courants_associes')
        .update({ solde: newSolde, updated_at: new Date().toISOString() })
        .eq('id', compte_courant_id)

      // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on insère direct dans V2.
      // V2 exige societe_id (NOT NULL) → on l'inclut explicitement (déjà disponible via le payload).
      // Create ecriture comptable: debit 6xx (expense) / credit 455 or 467
      const creditCompte = compte.type === 'associe' ? '455' : '467'
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

      if (dossiers) {
        await supabase.from('ecritures_comptables_v2').insert([
          {
            dossier_id: dossiers.id, societe_id, date_ecriture: dateMvt,
            journal: 'OD', numero_compte: '628', libelle: `Avance ${compte.nom} — ${description || ''}`,
            debit_mur: montantNum, credit_mur: 0,
          },
          {
            dossier_id: dossiers.id, societe_id, date_ecriture: dateMvt,
            journal: 'OD', numero_compte: creditCompte,
            libelle: `Compte courant ${compte.nom} — ${description || ''}`,
            debit_mur: 0, credit_mur: montantNum,
          },
        ])
      }

      // If linked to a facture, update it
      if (facture_id) {
        await supabase.from('factures').update({
          statut: 'paye',
          mode_paiement: compte.type === 'associe' ? 'associe' : 'collaborateur',
          paye_par: compte.nom,
        }).eq('id', facture_id)
      }

      // Si transaction bancaire fournie, la marquer comme rapprochée
      // pour éviter qu'elle réapparaisse dans la page rapprochement.
      if (releve_id && transaction_id) {
        await markBankTransactionRapproche(supabase, releve_id, transaction_id, {
          lettre: `CCA${String(Date.now()).slice(-4)}`,
          matched_type: 'compte_courant_associe',
          note: `Avance ${compte.nom}`,
          paye_par_associe: compte.nom,
        })
      }

      return NextResponse.json({ mouvement, newSolde })
    }

    // === REMBOURSEMENT (company reimburses associate) ===
    if (action === 'remboursement') {
      const { societe_id, compte_courant_id, montant, description, date_mouvement, releve_id, transaction_id } = body
      if (!societe_id || !compte_courant_id || !montant) {
        return NextResponse.json({ error: 'societe_id, compte_courant_id et montant requis' }, { status: 400 })
      }

      const dateMvt = date_mouvement || new Date().toISOString().split('T')[0]
      const montantNum = Math.abs(Number(montant))

      const { data: compte } = await supabase
        .from('comptes_courants_associes')
        .select('*')
        .eq('id', compte_courant_id)
        .single()

      if (!compte) return NextResponse.json({ error: 'Compte courant non trouve' }, { status: 404 })

      // Idempotence : si la même transaction bancaire a déjà été classée
      // en remboursement, on bloque.
      const txIdx = extractTxIdx(transaction_id)
      if (releve_id && txIdx != null) {
        const { data: existingMvt } = await supabase
          .from('mouvements_compte_courant')
          .select('id')
          .eq('compte_courant_id', compte_courant_id)
          .eq('source_releve_id', releve_id)
          .eq('source_transaction_idx', txIdx)
          .limit(1).maybeSingle()
        if (existingMvt) {
          return NextResponse.json({
            error: 'Cette transaction bancaire a déjà été classée en remboursement CCA — pas de double-comptage.',
            duplicate: true,
            mouvement_id: existingMvt.id,
          }, { status: 409 })
        }
      }

      // Create movement (negative = company reimburses)
      const { data: mouvement, error: mvtErr } = await supabase
        .from('mouvements_compte_courant')
        .insert({
          compte_courant_id, societe_id, date_mouvement: dateMvt,
          type: 'remboursement', montant: -montantNum, description,
          source_releve_id: releve_id || null,
          source_transaction_idx: txIdx,
          source_kind: releve_id ? 'manuel' : null,
        })
        .select()
        .single()

      if (mvtErr) throw mvtErr

      // Update balance
      const newSolde = Number(compte.solde || 0) - montantNum
      await supabase
        .from('comptes_courants_associes')
        .update({ solde: newSolde, updated_at: new Date().toISOString() })
        .eq('id', compte_courant_id)

      // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on insère direct dans V2.
      // V2 exige societe_id (NOT NULL) → on l'inclut explicitement.
      // Create ecriture: debit 455/467 / credit 512 (bank)
      const debitCompte = compte.type === 'associe' ? '455' : '467'
      const { data: dossiers } = await supabase
        .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

      if (dossiers) {
        await supabase.from('ecritures_comptables_v2').insert([
          {
            dossier_id: dossiers.id, societe_id, date_ecriture: dateMvt,
            journal: 'BNQ', numero_compte: debitCompte,
            libelle: `Remboursement ${compte.nom} — ${description || ''}`,
            debit_mur: montantNum, credit_mur: 0,
          },
          {
            dossier_id: dossiers.id, societe_id, date_ecriture: dateMvt,
            journal: 'BNQ', numero_compte: '512',
            libelle: `Remboursement ${compte.nom} — ${description || ''}`,
            debit_mur: 0, credit_mur: montantNum,
          },
        ])
      }

      // Si transaction bancaire fournie, la marquer comme rapprochée
      if (releve_id && transaction_id) {
        await markBankTransactionRapproche(supabase, releve_id, transaction_id, {
          lettre: `RMB${String(Date.now()).slice(-4)}`,
          matched_type: 'remboursement_cca',
          note: `Remboursement ${compte.nom}`,
          compensation_cca: compte.nom,
        })
      }

      return NextResponse.json({ mouvement, newSolde })
    }

    // === LETTRER (match advance with reimbursement) ===
    if (action === 'lettrer') {
      const { avance_id, remboursement_id } = body
      if (!avance_id || !remboursement_id) {
        return NextResponse.json({ error: 'avance_id et remboursement_id requis' }, { status: 400 })
      }

      const lettreCode = `CCA${String(Date.now()).slice(-4)}`

      await supabase.from('mouvements_compte_courant')
        .update({ lettre: lettreCode })
        .eq('id', avance_id)

      await supabase.from('mouvements_compte_courant')
        .update({ lettre: lettreCode })
        .eq('id', remboursement_id)

      return NextResponse.json({ success: true, lettre: lettreCode })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[compte-courant POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
