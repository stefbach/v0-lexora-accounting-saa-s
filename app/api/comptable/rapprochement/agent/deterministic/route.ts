import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getTauxChange, convertToMUR } from '@/lib/taux-change'
import { createEcrituresForPayment } from '@/lib/accounting/ecritures-factures'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Admin client ─────────────────────────────────────────────────────────────
function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ─── Normalisation helpers ────────────────────────────────────────────────────
function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function containsAny(text: string, keywords: string[]): boolean {
  const n = normalize(text)
  return keywords.some(k => n.includes(normalize(k)))
}

// ─── Amount matching helpers ──────────────────────────────────────────────────
const TOLERANCE = 0.08 // 8% — covers TDS 5% + rounding

function amountMatch(a: number, b: number, tol = TOLERANCE): boolean {
  if (a <= 0 || b <= 0) return false
  return Math.abs(a - b) / Math.max(a, b) <= tol
}

// Find best combination of invoices whose EUR sum ≈ txAmtEur (±tol)
// Tries 1 to maxGroup invoices (combinatorial, capped)
function findGroupedMatch(
  invoices: any[],
  txAmtEur: number,
  tol = TOLERANCE,
  maxGroup = 5
): any[] | null {
  // Sort by amount to prune early
  const sorted = [...invoices].sort((a, b) => Number(a.montant_ttc) - Number(b.montant_ttc))

  // Single-invoice match first (fast path)
  for (const f of sorted) {
    if (amountMatch(txAmtEur, Number(f.montant_ttc), tol)) return [f]
  }

  // Multi-invoice combinations (only try groups up to maxGroup)
  const n = Math.min(sorted.length, 10) // cap at 10 to avoid O(n!)
  for (let size = 2; size <= Math.min(maxGroup, n); size++) {
    const result = findCombination(sorted.slice(0, n), txAmtEur, size, 0, [], 0, tol)
    if (result) return result
  }
  return null
}

function findCombination(
  invoices: any[],
  target: number,
  size: number,
  start: number,
  current: any[],
  currentSum: number,
  tol: number
): any[] | null {
  if (current.length === size) {
    return amountMatch(currentSum, target, tol) ? current : null
  }
  for (let i = start; i < invoices.length; i++) {
    const f = invoices[i]
    const fAmt = Number(f.montant_ttc)
    const newSum = currentSum + fAmt
    // Prune: if even adding the smallest remaining won't reach target*(1-tol), skip rest
    if (newSum > target * (1 + tol)) break
    const result = findCombination(invoices, target, size, i + 1, [...current, f], newSum, tol)
    if (result) return result
  }
  return null
}

// ─── Scoring fuzzy name match ─────────────────────────────────────────────────
function nameMatchScore(bankName: string, dbName: string): number {
  const a = normalize(bankName)
  const b = normalize(dbName)
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  // Check word overlap
  const wordsA = a.split(/\s+/)
  const wordsB = b.split(/\s+/)
  const overlap = wordsA.filter(w => w.length > 2 && wordsB.includes(w)).length
  const maxWords = Math.max(wordsA.length, wordsB.length)
  return maxWords > 0 ? overlap / maxWords : 0
}

// ─── Type definitions ─────────────────────────────────────────────────────────
interface DetailItem {
  libelle: string
  tiers: string
  action: string
  status: 'ok' | 'skip' | 'error'
  reason: string
  amount?: number
  matched_invoices?: string[]
}

// ─── Main POST handler ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // Auth check
    const authClient = await createServerClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, dry_run = false, mois } = body

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Validation optionnelle du format du mois (YYYY-MM)
    const moisFilter = mois && /^\d{4}-\d{2}$/.test(mois) ? mois : null
    if (moisFilter) {
      console.warn(`[auto-classer] scope mensuel actif : ${moisFilter}`)
    }

    // ── Load exchange rates ──
    const rates = await getTauxChange()

    // ── Load all releves + their transactions ──
    const { data: releves } = await supabase
      .from('releves_bancaires')
      .select('id, transactions_json, societe_id')
      .eq('societe_id', societe_id)

    if (!releves || releves.length === 0) {
      return NextResponse.json({ processed: 0, matched: 0, unmatched: 0, details: [], message: 'Aucun relevé bancaire trouvé.' })
    }

    // ── Load unpaid invoices ──
    const { data: factures } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, type_facture, montant_ttc, montant_mur, devise, date_facture, date_echeance, statut')
      .eq('societe_id', societe_id)
      .in('statut', ['en_attente', 'retard', 'partiel'])

    const unpaidInvoices = factures || []

    // ── Load employes for salary matching ──
    const { data: employes } = await supabase
      .from('employes')
      .select('id, nom, prenom, salaire_base, societe_id')
      .eq('societe_id', societe_id)

    const employees = employes || []

    // ── Collect unmatched transactions ──
    const details: DetailItem[] = []
    let processed = 0
    let matched = 0
    let unmatched = 0

    // Track which invoice IDs we've consumed during this run (avoid double-matching)
    const consumedInvoiceIds = new Set<string>()

    for (const releve of releves) {
      const txs: any[] = [...(releve.transactions_json || [])]
      let releveModified = false

      for (let idx = 0; idx < txs.length; idx++) {
        const tx = txs[idx]

        // Filtre mois : si moisFilter actif, ne traite que les tx de ce mois
        if (moisFilter) {
          const txMois = String(tx.date || '').substring(0, 7)
          if (txMois !== moisFilter) continue
        }

        // Skip already matched
        if (tx.statut === 'rapproche' || tx.statut === 'interne') continue
        if (tx.lettre && tx.facture_id) continue

        const txAmount = Math.max(Number(tx.debit) || 0, Number(tx.credit) || 0)
        if (txAmount === 0) continue

        processed++

        const tiers = normalize(tx.tiers_detecte || tx.tiers || '')
        const libelle = normalize(tx.libelle || '')
        const isDebit = (Number(tx.debit) || 0) > 0
        const isCredit = (Number(tx.credit) || 0) > 0
        const txDate = tx.date || new Date().toISOString().split('T')[0]
        const refFolio = `BANK-${releve.id}-${idx}`

        // ── txAmtEur: use raw amount IF compte is EUR, else convert from MUR
        // We treat the raw debit/credit as EUR (transactions are in EUR for this bank)
        const txAmtEur = txAmount // raw bank amount (EUR compte)

        // ────────────────────────────────────────────────────────────────────
        // RULE 1: Frais bancaires — MCB Tax Amount Due, Service Fee, etc.
        // ────────────────────────────────────────────────────────────────────
        const isBankFeeTiers = containsAny(tiers, ['mcb', 'bom', 'sbm', 'abc banking', 'bank'])
        const isBankFeeLibelle = containsAny(libelle, [
          'tax amount due', 'service fee', 'service charge', 'commission',
          'bank charge', 'frais bancaire', 'fee', 'stamp duty', 'levy',
          'annual fee', 'monthly fee',
        ])
        if (isDebit && isBankFeeTiers && isBankFeeLibelle) {
          const amtMur = Math.round(convertToMUR(txAmtEur, 'EUR', rates) * 100) / 100
          if (!dry_run) {
            // Mark transaction as rapproche
            txs[idx] = {
              ...tx,
              statut: 'rapproche',
              matched_type: 'frais_bancaires',
              match_confidence: 'deterministic',
              rapproche_at: new Date().toISOString(),
              note: 'Frais bancaires — agent déterministe',
            }
            releveModified = true

            // BNQ entry: Débit 627 Frais bancaires / Crédit 512 Banque
            await createBankFeeEntry(supabase, {
              societe_id,
              date_payment: txDate,
              amount_mur: amtMur,
              ref_folio: refFolio,
              tiers: tx.tiers_detecte || tx.tiers || 'MCB',
              libelle: tx.libelle || 'Frais bancaires',
            })
          }
          details.push({
            libelle: tx.libelle || '',
            tiers: tx.tiers_detecte || tx.tiers || '',
            action: 'frais_bancaires',
            status: 'ok',
            reason: `Frais bancaires détectés (${txAmtEur.toFixed(2)} EUR → ${amtMur.toFixed(2)} MUR). Débit 627 / Crédit 512.`,
            amount: txAmtEur,
          })
          matched++
          continue
        }

        // ────────────────────────────────────────────────────────────────────
        // RULE 2: Factures fournisseurs — MyT / MYT MAURITIUS TELECOM
        // ────────────────────────────────────────────────────────────────────
        const isMyt = containsAny(tiers, ['myt', 'mauritius telecom', 'my.t', 'myt mauritius'])
        if (isDebit && isMyt) {
          const mytInvoices = unpaidInvoices.filter(f =>
            f.type_facture === 'fournisseur' &&
            containsAny(f.tiers || '', ['myt', 'mauritius telecom', 'my.t']) &&
            !consumedInvoiceIds.has(f.id)
          )

          const groupMatch = findGroupedMatch(mytInvoices, txAmtEur)
          if (groupMatch && groupMatch.length > 0) {
            const amtMur = Math.round(convertToMUR(txAmtEur, 'EUR', rates) * 100) / 100
            const factureIds = groupMatch.map((f: any) => f.id)

            if (!dry_run) {
              const lettre = `DET${Date.now().toString().slice(-6)}`
              txs[idx] = {
                ...tx,
                statut: 'rapproche',
                matched_type: factureIds.length > 1 ? 'facture_groupee' : 'facture_unique',
                facture_ids: factureIds,
                facture_id: factureIds[0],
                lettre,
                match_confidence: 'deterministic',
                rapproche_at: new Date().toISOString(),
                note: `MyT ${factureIds.length} facture(s) — agent déterministe`,
              }
              releveModified = true

              // Mark invoices as paid
              for (const fid of factureIds) {
                await supabase.from('factures').update({
                  statut: 'paye',
                  rapproche_releve_id: releve.id,
                  rapproche_transaction_idx: idx,
                  rapproche_date: new Date().toISOString(),
                  rapproche_source: 'deterministic',
                }).eq('id', fid)
                consumedInvoiceIds.add(fid)
              }

              // BNQ entries
              await createEcrituresForPayment(supabase, {
                societe_id,
                date_payment: txDate,
                amount_mur: amtMur,
                type: 'supplier',
                tiers: (groupMatch[0].tiers || 'MYT').substring(0, 50),
                ref_folio: refFolio,
                description: `Paiement MyT ${groupMatch.map((f: any) => f.numero_facture).join(', ')}`,
              })
            } else {
              factureIds.forEach((id: string) => consumedInvoiceIds.add(id))
            }

            details.push({
              libelle: tx.libelle || '',
              tiers: tx.tiers_detecte || tx.tiers || '',
              action: 'facture',
              status: 'ok',
              reason: `MyT: ${factureIds.length} facture(s) matchée(s) — somme ${groupMatch.reduce((s: number, f: any) => s + Number(f.montant_ttc), 0).toFixed(2)} EUR ≈ ${txAmtEur.toFixed(2)} EUR`,
              amount: txAmtEur,
              matched_invoices: groupMatch.map((f: any) => f.numero_facture),
            })
            matched++
            continue
          }

          // No match found for MyT
          details.push({
            libelle: tx.libelle || '',
            tiers: tx.tiers_detecte || tx.tiers || '',
            action: 'facture',
            status: 'skip',
            reason: `MyT: aucune facture fournisseur trouvée avec montant ≈ ${txAmtEur.toFixed(2)} EUR (${mytInvoices.length} factures dispo)`,
            amount: txAmtEur,
          })
          unmatched++
          continue
        }

        // ────────────────────────────────────────────────────────────────────
        // RULE 3: Factures clients — SKYCALL (CRÉDIT = encaissement)
        // ────────────────────────────────────────────────────────────────────
        const isSkycall = containsAny(tiers, ['skycall', 'sky call'])
        if (isCredit && isSkycall) {
          const skycallInvoices = unpaidInvoices.filter(f =>
            f.type_facture === 'client' &&
            containsAny(f.tiers || '', ['skycall', 'sky call']) &&
            !consumedInvoiceIds.has(f.id)
          )

          const groupMatch = findGroupedMatch(skycallInvoices, txAmtEur)
          if (groupMatch && groupMatch.length > 0) {
            const amtMur = Math.round(convertToMUR(txAmtEur, 'EUR', rates) * 100) / 100
            const factureIds = groupMatch.map((f: any) => f.id)

            if (!dry_run) {
              const lettre = `DET${Date.now().toString().slice(-6)}`
              txs[idx] = {
                ...tx,
                statut: 'rapproche',
                matched_type: factureIds.length > 1 ? 'facture_groupee' : 'facture_unique',
                facture_ids: factureIds,
                facture_id: factureIds[0],
                lettre,
                match_confidence: 'deterministic',
                rapproche_at: new Date().toISOString(),
                note: `SKYCALL ${factureIds.length} facture(s) — agent déterministe`,
              }
              releveModified = true

              for (const fid of factureIds) {
                await supabase.from('factures').update({
                  statut: 'paye',
                  rapproche_releve_id: releve.id,
                  rapproche_transaction_idx: idx,
                  rapproche_date: new Date().toISOString(),
                  rapproche_source: 'deterministic',
                }).eq('id', fid)
                consumedInvoiceIds.add(fid)
              }

              await createEcrituresForPayment(supabase, {
                societe_id,
                date_payment: txDate,
                amount_mur: amtMur,
                type: 'client',
                tiers: (groupMatch[0].tiers || 'SKYCALL').substring(0, 50),
                ref_folio: refFolio,
                description: `Encaissement SKYCALL ${groupMatch.map((f: any) => f.numero_facture).join(', ')}`,
              })
            } else {
              factureIds.forEach((id: string) => consumedInvoiceIds.add(id))
            }

            details.push({
              libelle: tx.libelle || '',
              tiers: tx.tiers_detecte || tx.tiers || '',
              action: 'facture',
              status: 'ok',
              reason: `SKYCALL: ${factureIds.length} facture(s) client matchée(s) — ${txAmtEur.toFixed(2)} EUR`,
              amount: txAmtEur,
              matched_invoices: groupMatch.map((f: any) => f.numero_facture),
            })
            matched++
            continue
          }

          details.push({
            libelle: tx.libelle || '',
            tiers: tx.tiers_detecte || tx.tiers || '',
            action: 'facture',
            status: 'skip',
            reason: `SKYCALL: aucune facture client trouvée avec montant ≈ ${txAmtEur.toFixed(2)} EUR (${skycallInvoices.length} factures dispo)`,
            amount: txAmtEur,
          })
          unmatched++
          continue
        }

        // ────────────────────────────────────────────────────────────────────
        // RULE 4: MRA — DÉSACTIVÉE (2026-05-03)
        // ────────────────────────────────────────────────────────────────────
        // L'auto-classification des paiements MRA est INTRINSÈQUEMENT FAUSSE :
        // un même libellé "Mauritius Revenue Authority" peut couvrir plusieurs
        // sous-types qui vont sur des comptes différents :
        //   • PAYE (retenue salaires)        → 4330
        //   • TVA collectée à reverser       → 4457
        //   • Income Tax société             → autre compte
        //   • TDS (retenue à la source)      → 4471
        //
        // Sans le détail du justificatif MRA, l'agent ne peut PAS deviner.
        // Tout choix par défaut (4471 / 4330 / 444) sera FAUX dans la majorité
        // des cas → balance comptable polluée + obligation de tout
        // reclassifier après coup. Mieux vaut laisser ces transactions à
        // "non_identifie" et que le user les classifie une par une via l'UI
        // au BON sous-compte avec le justificatif en main.
        //
        // Bug observé sur DDS : 19 paiements MRA totalisant 13M MUR finissaient
        // tous sur 4330 (via remap trigger 444→4330) ou 4471 → balance
        // aberrante.
        //
        // Si tu veux RÉACTIVER cette règle, ajoute un sélecteur de sous-type
        // dans la UI (PAYE / TVA / IT / TDS) qui pilote le compte de
        // destination, au lieu d'un mapping aveugle.

        // ────────────────────────────────────────────────────────────────────
        // RULE 5: Salaires individuels
        // ────────────────────────────────────────────────────────────────────
        const isSalary = containsAny(libelle, ['salary', 'salaire', 'wages', 'remuneration', 'payroll']) ||
                         containsAny(tiers, ['salary', 'salaire'])
        if (isDebit && (isSalary || employeeNameMatch(tiers, employees))) {
          const matchedEmp = findEmployee(tiers, employees)
          const amtMur = Math.round(convertToMUR(txAmtEur, 'EUR', rates) * 100) / 100

          if (!dry_run) {
            txs[idx] = {
              ...tx,
              statut: 'rapproche',
              matched_type: 'salaire_individuel',
              match_confidence: 'deterministic',
              rapproche_at: new Date().toISOString(),
              note: matchedEmp
                ? `Salaire ${matchedEmp.prenom} ${matchedEmp.nom} — agent déterministe`
                : 'Salaire individuel — agent déterministe',
            }
            releveModified = true

            // BNQ entry for salary: Débit 4210 (solde dette paie) / Crédit 512 (banque)
            // PAS Débit 641 — la charge est déjà créée à la génération paie via OD-PAIE.
            await createSalaryEntry(supabase, {
              societe_id,
              date_payment: txDate,
              amount_mur: amtMur,
              ref_folio: refFolio,
              tiers: matchedEmp
                ? `${matchedEmp.prenom} ${matchedEmp.nom}`.substring(0, 50)
                : (tx.tiers_detecte || tx.tiers || 'Employé').substring(0, 50),
              libelle: tx.libelle || 'Salaire',
            })
          }

          details.push({
            libelle: tx.libelle || '',
            tiers: tx.tiers_detecte || tx.tiers || '',
            action: 'salaire',
            status: 'ok',
            reason: matchedEmp
              ? `Salaire individuel: ${matchedEmp.prenom} ${matchedEmp.nom} — ${txAmtEur.toFixed(2)} EUR → ${amtMur.toFixed(2)} MUR`
              : `Salaire individuel (employé non trouvé en DB) — ${txAmtEur.toFixed(2)} EUR`,
            amount: txAmtEur,
          })
          matched++
          continue
        }

        // ────────────────────────────────────────────────────────────────────
        // RULE 6: Generic fournisseur — try any matching unpaid supplier invoice
        // ────────────────────────────────────────────────────────────────────
        if (isDebit && tiers) {
          const supplierInvoices = unpaidInvoices.filter(f =>
            f.type_facture === 'fournisseur' &&
            nameMatchScore(tiers, f.tiers || '') >= 0.7 &&
            !consumedInvoiceIds.has(f.id)
          )

          if (supplierInvoices.length > 0) {
            const groupMatch = findGroupedMatch(supplierInvoices, txAmtEur, 0.05)
            if (groupMatch && groupMatch.length > 0) {
              const amtMur = Math.round(convertToMUR(txAmtEur, 'EUR', rates) * 100) / 100
              const factureIds = groupMatch.map((f: any) => f.id)

              if (!dry_run) {
                const lettre = `DET${Date.now().toString().slice(-6)}`
                txs[idx] = {
                  ...tx,
                  statut: 'rapproche',
                  matched_type: factureIds.length > 1 ? 'facture_groupee' : 'facture_unique',
                  facture_ids: factureIds,
                  facture_id: factureIds[0],
                  lettre,
                  match_confidence: 'deterministic',
                  rapproche_at: new Date().toISOString(),
                  note: `Fournisseur ${groupMatch[0].tiers} — agent déterministe`,
                }
                releveModified = true

                for (const fid of factureIds) {
                  await supabase.from('factures').update({
                    statut: 'paye',
                    rapproche_releve_id: releve.id,
                    rapproche_transaction_idx: idx,
                    rapproche_date: new Date().toISOString(),
                    rapproche_source: 'deterministic',
                  }).eq('id', fid)
                  consumedInvoiceIds.add(fid)
                }

                await createEcrituresForPayment(supabase, {
                  societe_id,
                  date_payment: txDate,
                  amount_mur: amtMur,
                  type: 'supplier',
                  tiers: (groupMatch[0].tiers || tiers).substring(0, 50),
                  ref_folio: refFolio,
                  description: `Paiement ${groupMatch.map((f: any) => f.numero_facture).join(', ')} — ${groupMatch[0].tiers}`,
                })
              } else {
                factureIds.forEach((id: string) => consumedInvoiceIds.add(id))
              }

              details.push({
                libelle: tx.libelle || '',
                tiers: tx.tiers_detecte || tx.tiers || '',
                action: 'facture',
                status: 'ok',
                reason: `Fournisseur générique: ${factureIds.length} facture(s) matchée(s) pour ${groupMatch[0].tiers}`,
                amount: txAmtEur,
                matched_invoices: groupMatch.map((f: any) => f.numero_facture),
              })
              matched++
              continue
            }
          }
        }

        // ────────────────────────────────────────────────────────────────────
        // RULE 7: Generic client — try any matching unpaid client invoice
        // ────────────────────────────────────────────────────────────────────
        if (isCredit && tiers) {
          const clientInvoices = unpaidInvoices.filter(f =>
            f.type_facture === 'client' &&
            nameMatchScore(tiers, f.tiers || '') >= 0.7 &&
            !consumedInvoiceIds.has(f.id)
          )

          if (clientInvoices.length > 0) {
            const groupMatch = findGroupedMatch(clientInvoices, txAmtEur, 0.05)
            if (groupMatch && groupMatch.length > 0) {
              const amtMur = Math.round(convertToMUR(txAmtEur, 'EUR', rates) * 100) / 100
              const factureIds = groupMatch.map((f: any) => f.id)

              if (!dry_run) {
                const lettre = `DET${Date.now().toString().slice(-6)}`
                txs[idx] = {
                  ...tx,
                  statut: 'rapproche',
                  matched_type: factureIds.length > 1 ? 'facture_groupee' : 'facture_unique',
                  facture_ids: factureIds,
                  facture_id: factureIds[0],
                  lettre,
                  match_confidence: 'deterministic',
                  rapproche_at: new Date().toISOString(),
                  note: `Client ${groupMatch[0].tiers} — agent déterministe`,
                }
                releveModified = true

                for (const fid of factureIds) {
                  await supabase.from('factures').update({
                    statut: 'paye',
                    rapproche_releve_id: releve.id,
                    rapproche_transaction_idx: idx,
                    rapproche_date: new Date().toISOString(),
                    rapproche_source: 'deterministic',
                  }).eq('id', fid)
                  consumedInvoiceIds.add(fid)
                }

                await createEcrituresForPayment(supabase, {
                  societe_id,
                  date_payment: txDate,
                  amount_mur: amtMur,
                  type: 'client',
                  tiers: (groupMatch[0].tiers || tiers).substring(0, 50),
                  ref_folio: refFolio,
                  description: `Encaissement ${groupMatch.map((f: any) => f.numero_facture).join(', ')} — ${groupMatch[0].tiers}`,
                })
              } else {
                factureIds.forEach((id: string) => consumedInvoiceIds.add(id))
              }

              details.push({
                libelle: tx.libelle || '',
                tiers: tx.tiers_detecte || tx.tiers || '',
                action: 'facture',
                status: 'ok',
                reason: `Client générique: ${factureIds.length} facture(s) client matchée(s) pour ${groupMatch[0].tiers}`,
                amount: txAmtEur,
                matched_invoices: groupMatch.map((f: any) => f.numero_facture),
              })
              matched++
              continue
            }
          }
        }

        // ── No rule matched ──
        details.push({
          libelle: tx.libelle || '',
          tiers: tx.tiers_detecte || tx.tiers || '',
          action: 'skip',
          status: 'skip',
          reason: `Aucune règle applicable — montant ${txAmtEur.toFixed(2)} EUR, sens ${isDebit ? 'débit' : 'crédit'}`,
          amount: txAmtEur,
        })
        unmatched++
      }

      // Persist updated transactions_json
      if (releveModified && !dry_run) {
        await supabase
          .from('releves_bancaires')
          .update({ transactions_json: txs })
          .eq('id', releve.id)
      }
    }

    // ── Summary message ──
    const summary = buildSummary(details, matched, unmatched, processed)

    return NextResponse.json({
      processed,
      matched,
      unmatched,
      dry_run,
      details,
      summary,
      message: `Agent déterministe : ${matched}/${processed} transactions rapprochées${dry_run ? ' (simulation)' : ''}.`,
    })
  } catch (e: any) {
    console.error('[rapprochement/agent/deterministic] error:', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

// ─── Employee matching helpers ────────────────────────────────────────────────
function employeeNameMatch(tiers: string, employees: any[]): boolean {
  return findEmployee(tiers, employees) !== null
}

function findEmployee(tiers: string, employees: any[]): any | null {
  const t = normalize(tiers)
  if (!t) return null

  let best: any = null
  let bestScore = 0

  for (const emp of employees) {
    const fullName = normalize(`${emp.prenom || ''} ${emp.nom || ''}`)
    const revName = normalize(`${emp.nom || ''} ${emp.prenom || ''}`)

    const score = Math.max(
      nameMatchScore(t, fullName),
      nameMatchScore(t, revName),
      nameMatchScore(t, normalize(emp.nom || '')),
    )

    if (score > bestScore && score >= 0.75) {
      bestScore = score
      best = emp
    }
  }

  return best
}

// ─── Accounting entry helpers ────────────────────────────────────────────────

async function createBankFeeEntry(
  supabase: ReturnType<typeof getAdminClient>,
  opts: { societe_id: string; date_payment: string; amount_mur: number; ref_folio: string; tiers: string; libelle: string }
) {
  const { data: dossier } = await supabase
    .from('dossiers').select('id').eq('societe_id', opts.societe_id).limit(1).maybeSingle()

  const exercice = new Date(opts.date_payment).getFullYear().toString()
  const libelle = `Frais bancaires — ${opts.tiers}`.trim()

  // Delete existing entries for idempotency
  await supabase.from('ecritures_comptables_v2')
    .delete().eq('societe_id', opts.societe_id).eq('ref_folio', opts.ref_folio)

  await supabase.from('ecritures_comptables_v2').insert([
    {
      societe_id: opts.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: opts.date_payment,
      journal: 'BNQ',
      ref_folio: opts.ref_folio,
      numero_compte: '627',
      nom_compte: 'Frais bancaires et assimilés',
      libelle,
      description: libelle,
      debit_mur: opts.amount_mur,
      credit_mur: 0,
      exercice,
    },
    {
      societe_id: opts.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: opts.date_payment,
      journal: 'BNQ',
      ref_folio: opts.ref_folio,
      numero_compte: '512',
      nom_compte: 'Banque',
      libelle,
      description: libelle,
      debit_mur: 0,
      credit_mur: opts.amount_mur,
      exercice,
    },
  ])
}

async function createMraEntry(
  supabase: ReturnType<typeof getAdminClient>,
  opts: { societe_id: string; date_payment: string; amount_mur: number; ref_folio: string; tiers: string; libelle: string }
) {
  const { data: dossier } = await supabase
    .from('dossiers').select('id').eq('societe_id', opts.societe_id).limit(1).maybeSingle()

  const exercice = new Date(opts.date_payment).getFullYear().toString()
  const libelle = `Paiement MRA — ${opts.tiers}`.trim()

  await supabase.from('ecritures_comptables_v2')
    .delete().eq('societe_id', opts.societe_id).eq('ref_folio', opts.ref_folio)

  await supabase.from('ecritures_comptables_v2').insert([
    {
      societe_id: opts.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: opts.date_payment,
      journal: 'BNQ',
      ref_folio: opts.ref_folio,
      // ⚠️ FIX (2026-05-03) — bug observé en prod (DDS) : compte 4330 (PAYE)
      // gonflé à 13M au lieu de ~19K (vraie dette PAYE).
      //
      // CAUSE : ce code écrivait '444' (Etat — impôts génériques). Mais le
      // trigger BEFORE INSERT `tr_00_legacy_3digit_warn` (mig 201 ligne 65)
      // remappe SILENCIEUSEMENT 444 → 4330 (PAYE). Donc tous les paiements
      // MRA (PAYE + TVA + Income Tax + TDS + autres) atterrissaient sur 4330.
      //
      // FIX : utiliser directement 4471 "MRA — impôts et taxes divers"
      // (compte 4-digits PCM, non remappé par le trigger). C'est le bon
      // compte d'attente pour des paiements MRA dont le sous-type
      // (PAYE / TVA / IT / TDS) n'est pas distingué par l'agent
      // déterministe — le comptable peut reclassifier manuellement vers
      // 4330 (si PAYE), 4457 (si TVA collectée à reverser), etc.
      numero_compte: '4471',
      nom_compte: 'MRA — impôts et taxes divers',
      libelle,
      description: libelle,
      debit_mur: opts.amount_mur,
      credit_mur: 0,
      exercice,
    },
    {
      societe_id: opts.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: opts.date_payment,
      journal: 'BNQ',
      ref_folio: opts.ref_folio,
      numero_compte: '512',
      nom_compte: 'Banque',
      libelle,
      description: libelle,
      debit_mur: 0,
      credit_mur: opts.amount_mur,
      exercice,
    },
  ])
}

async function createSalaryEntry(
  supabase: ReturnType<typeof getAdminClient>,
  opts: { societe_id: string; date_payment: string; amount_mur: number; ref_folio: string; tiers: string; libelle: string }
) {
  const { data: dossier } = await supabase
    .from('dossiers').select('id').eq('societe_id', opts.societe_id).limit(1).maybeSingle()

  const exercice = new Date(opts.date_payment).getFullYear().toString()
  const libelle = `Salaire — ${opts.tiers}`.trim()

  await supabase.from('ecritures_comptables_v2')
    .delete().eq('societe_id', opts.societe_id).eq('ref_folio', opts.ref_folio)

  await supabase.from('ecritures_comptables_v2').insert([
    {
      societe_id: opts.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: opts.date_payment,
      journal: 'BNQ',
      ref_folio: opts.ref_folio,
      // ⚠️ FIX (2026-05-03) — bug majeur observé en prod (DDS) :
      // Avant ce fix, on débitait 641 (CHARGE) ce qui créait un DOUBLE-
      // COMPTAGE (la charge est déjà créée par la paie via OD-PAIE 6411
      // dr / 4210 cr). Compte 641 atteignait 200M+ MUR au lieu de ~6,7M.
      //
      // Bonne logique comptable : à la paie, le bulletin crée la dette
      // (4210 cr). Le paiement bancaire SOLDE cette dette : 4210 dr / 512 cr.
      // Aucune nouvelle charge à débiter (déjà fait à la génération paie).
      numero_compte: '4210',
      nom_compte: 'Personnel — Rémunérations dues',
      libelle,
      description: libelle,
      debit_mur: opts.amount_mur,
      credit_mur: 0,
      exercice,
    },
    {
      societe_id: opts.societe_id,
      dossier_id: dossier?.id || null,
      date_ecriture: opts.date_payment,
      journal: 'BNQ',
      ref_folio: opts.ref_folio,
      numero_compte: '512',
      nom_compte: 'Banque',
      libelle,
      description: libelle,
      debit_mur: 0,
      credit_mur: opts.amount_mur,
      exercice,
    },
  ])
}

// ─── Summary builder ──────────────────────────────────────────────────────────
function buildSummary(details: DetailItem[], matched: number, unmatched: number, processed: number): string {
  const byAction: Record<string, number> = {}
  for (const d of details) {
    if (d.status === 'ok') {
      byAction[d.action] = (byAction[d.action] || 0) + 1
    }
  }

  const lines = [
    `✅ **Agent déterministe terminé** — ${matched}/${processed} transactions rapprochées`,
    '',
  ]

  if (byAction['frais_bancaires']) lines.push(`🏦 ${byAction['frais_bancaires']} frais bancaires (MCB) → Débit 627`)
  if (byAction['facture']) lines.push(`📄 ${byAction['facture']} facture(s) matchée(s) (fournisseurs + clients)`)
  if (byAction['mra']) lines.push(`🏛️ ${byAction['mra']} paiement(s) MRA → Débit 4471 (à reclasser si PAYE/TVA spécifique)`)
  if (byAction['salaire']) lines.push(`👤 ${byAction['salaire']} salaire(s) individuel(s) → Débit 4210`)

  if (unmatched > 0) {
    lines.push('')
    lines.push(`⚠️ ${unmatched} transaction(s) non rapprochée(s) :`)
    const skipped = details.filter(d => d.status === 'skip')
    for (const s of skipped.slice(0, 5)) {
      lines.push(`  • ${s.tiers || s.libelle} — ${s.reason}`)
    }
    if (skipped.length > 5) lines.push(`  … et ${skipped.length - 5} autre(s)`)
  }

  return lines.join('\n')
}
