import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getTauxChange } from '@/lib/taux-change'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { computeAlerteKey, type AlerteType } from '@/lib/alertes/key'

function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  if (!devise || devise === 'MUR') return amount
  const key = devise.toUpperCase()
  const rate = rates[key]
  if (rate) return amount * rate
  return amount
}

export interface Alerte {
  id: string
  type: 'urgent' | 'attention' | 'info'
  titre: string
  description: string
  montant: number | null
  echeance: string | null
  action_requise: string
  // Clé stable pour persister l'état user (lue/archivée/acknowledged).
  // Calculée côté API via lib/alertes/key.ts — le frontend ne la recalcule pas.
  alerte_key: string
  // Type métier de l'alerte (pour filtrage côté DB).
  alerte_type: AlerteType
}

// GET — Generate financial alerts for a client (rule-based, no AI call)
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })

    const supabase = getAdminClient()
    const rates = await getTauxChange()

    // Determine target client
    const { searchParams } = new URL(request.url)
    const requestedClientId = searchParams.get('client_id')

    let targetClientId = user.id

    if (requestedClientId && requestedClientId !== user.id) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !['comptable', 'comptable_dedie', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Acces non autorise' }, { status: 403 })
      }
      targetClientId = requestedClientId
    }

    // Get client's dossiers, optionally filtered by société
    const requestedSocieteId = searchParams.get('societe_id')
    if (requestedSocieteId) {
      await assertSocieteAccess(supabase, user.id, requestedSocieteId)
    }
    let dossierQuery = supabase
      .from('dossiers').select('id, societe_id').eq('client_id', targetClientId)
    if (requestedSocieteId) dossierQuery = dossierQuery.eq('societe_id', requestedSocieteId)
    const { data: dossiers } = await dossierQuery

    if (!dossiers || dossiers.length === 0) {
      return NextResponse.json({ alertes: [] })
    }

    const dossierIds = dossiers.map(d => d.id)
    const societeIds = [...new Set(dossiers.map(d => d.societe_id))]

    // Fetch data in parallel
    const [ecrituresRes, documentsRes, comptesRes] = await Promise.all([
      supabase.from('ecritures_comptables').select('*').in('dossier_id', dossierIds)
        .order('date_ecriture', { ascending: false }),
      supabase.from('documents').select('id, nom_fichier, type_document, statut, n8n_result, created_at, societe_detectee')
        .in('dossier_id', dossierIds)
        .order('created_at', { ascending: false }),
      supabase.from('comptes_bancaires').select('*').in('societe_id', societeIds).eq('actif', true),
    ])

    const ecritures = ecrituresRes.data || []
    const documents = documentsRes.data || []
    const comptes = comptesRes.data || []

    const alertes: Alerte[] = []
    let alerteIdx = 0

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // ---------------------------------------------------------------
    // 1. Unpaid invoices (factures with montant_restant_du > 0)
    // ---------------------------------------------------------------
    const facturesDocs = documents.filter(
      d => (d.type_document === 'facture_fournisseur' || d.type_document === 'facture_client')
        && d.statut === 'traite'
    )

    for (const doc of facturesDocs) {
      const ext = doc.n8n_result?.extraction || {}
      const montantRestant = Number(ext.montant_restant_du) || 0
      const montantTTC = Number(ext.montant_ttc) || 0
      const devise = (ext.devise || 'MUR').replace(/[^A-Za-z]/g, '').toUpperCase() || 'MUR'
      const dateEcheance = ext.date_echeance || null

      // Check if there's an outstanding amount
      if (montantRestant > 0) {
        const montantMUR = convertToMUR(montantRestant, devise, rates)
        const isOverdue = dateEcheance && new Date(dateEcheance) < now
        const alerte_type: AlerteType = isOverdue ? 'facture_retard' : 'facture_en_attente'
        const detail = `${doc.id}-${ext.numero_reference || doc.nom_fichier || ''}`

        alertes.push({
          id: `alerte-${++alerteIdx}`,
          type: isOverdue ? 'urgent' : 'attention',
          titre: isOverdue
            ? `Facture impayee en retard - ${ext.emetteur || ext.destinataire || doc.nom_fichier}`
            : `Facture en attente de paiement - ${ext.emetteur || ext.destinataire || doc.nom_fichier}`,
          description: `Facture ${ext.numero_reference || doc.nom_fichier}: ${montantRestant.toLocaleString('fr-FR')} ${devise} restant du${dateEcheance ? `, echeance ${dateEcheance}` : ''}`,
          montant: Math.round(montantMUR * 100) / 100,
          echeance: dateEcheance,
          action_requise: isOverdue ? 'Relancer le paiement immediatement' : 'Suivre le paiement avant echeance',
          alerte_type,
          alerte_key: computeAlerteKey({
            type: alerte_type,
            societeId: doc.societe_detectee ?? requestedSocieteId ?? null,
            periode: currentMonth,
            detail,
          }),
        })
      }
    }

    // ---------------------------------------------------------------
    // 2. TVA deadline approaching (20th of next month)
    // ---------------------------------------------------------------
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const tvaDeadline = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20)
    const daysUntilTVA = Math.ceil((tvaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilTVA <= 30) {
      // Calculate TVA amount from ecritures
      const tvaCollectee = ecritures
        .filter(e => e.compte?.startsWith('4457') && e.date_ecriture?.startsWith(currentMonth))
        .reduce((sum: number, e: any) => sum + (Number(e.credit) || 0) - (Number(e.debit) || 0), 0)

      const tvaDeductible = ecritures
        .filter(e => e.compte?.startsWith('4456') && e.date_ecriture?.startsWith(currentMonth))
        .reduce((sum: number, e: any) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0)

      const tvaNette = tvaCollectee - tvaDeductible

      const tvaPeriode = tvaDeadline.toISOString().split('T')[0]
      alertes.push({
        id: `alerte-${++alerteIdx}`,
        type: daysUntilTVA <= 7 ? 'urgent' : 'attention',
        titre: `Declaration TVA - Echeance dans ${daysUntilTVA} jours`,
        description: `TVA nette estimee: ${Math.round(tvaNette).toLocaleString('fr-FR')} MUR (collectee: ${Math.round(tvaCollectee).toLocaleString('fr-FR')}, deductible: ${Math.round(tvaDeductible).toLocaleString('fr-FR')}). Date limite: ${tvaPeriode}`,
        montant: Math.round(tvaNette * 100) / 100,
        echeance: tvaPeriode,
        action_requise: tvaNette > 0
          ? 'Preparer et soumettre la declaration TVA au MRA'
          : 'Preparer la declaration TVA (credit a reporter)',
        alerte_type: 'tva_deadline',
        alerte_key: computeAlerteKey({
          type: 'tva_deadline',
          societeId: requestedSocieteId ?? societeIds[0] ?? null,
          periode: tvaPeriode,
          detail: 'mra-tva',
        }),
      })
    }

    // ---------------------------------------------------------------
    // 3. Documents with errors
    // ---------------------------------------------------------------
    const errorDocs = documents.filter(d => d.statut === 'erreur' || d.statut === 'error')
    if (errorDocs.length > 0) {
      // Clé indépendante du nombre exact de docs en erreur : on veut que
      // l'utilisateur puisse "acquitter" cette alerte pour la journée.
      const errorIds = errorDocs.map(d => d.id).sort().join(',')
      alertes.push({
        id: `alerte-${++alerteIdx}`,
        type: 'attention',
        titre: `${errorDocs.length} document(s) en erreur`,
        description: `Documents non traites: ${errorDocs.map(d => d.nom_fichier).slice(0, 3).join(', ')}${errorDocs.length > 3 ? ` et ${errorDocs.length - 3} autre(s)` : ''}`,
        montant: null,
        echeance: null,
        action_requise: 'Verifier et re-soumettre les documents en erreur',
        alerte_type: 'document_erreur',
        alerte_key: computeAlerteKey({
          type: 'document_erreur',
          societeId: requestedSocieteId ?? societeIds[0] ?? null,
          periode: currentMonth,
          detail: errorIds,
        }),
      })
    }

    // ---------------------------------------------------------------
    // 4. Low treasury warning
    // ---------------------------------------------------------------
    const totalBankMUR = comptes.reduce((sum, c) => {
      return sum + convertToMUR(Number(c.solde_actuel) || 0, c.devise, rates)
    }, 0)

    if (totalBankMUR < 200_000) {
      alertes.push({
        id: `alerte-${++alerteIdx}`,
        type: 'urgent',
        titre: 'Tresorerie critique',
        description: `Solde bancaire consolide: ${Math.round(totalBankMUR).toLocaleString('fr-FR')} MUR. Seuil critique: 200 000 MUR.`,
        montant: Math.round(totalBankMUR * 100) / 100,
        echeance: null,
        action_requise: 'Action immediate requise: securiser la tresorerie, accelerer les encaissements',
        alerte_type: 'tresorerie_critique',
        alerte_key: computeAlerteKey({
          type: 'tresorerie_critique',
          societeId: requestedSocieteId ?? societeIds[0] ?? null,
          periode: currentMonth,
          detail: 'solde-consolide',
        }),
      })
    } else if (totalBankMUR < 500_000) {
      alertes.push({
        id: `alerte-${++alerteIdx}`,
        type: 'attention',
        titre: 'Tresorerie sous surveillance',
        description: `Solde bancaire consolide: ${Math.round(totalBankMUR).toLocaleString('fr-FR')} MUR. En-dessous du seuil de confort (500 000 MUR).`,
        montant: Math.round(totalBankMUR * 100) / 100,
        echeance: null,
        action_requise: 'Surveiller les decaissements a venir et planifier la tresorerie',
        alerte_type: 'tresorerie_surveillance',
        alerte_key: computeAlerteKey({
          type: 'tresorerie_surveillance',
          societeId: requestedSocieteId ?? societeIds[0] ?? null,
          periode: currentMonth,
          detail: 'solde-consolide',
        }),
      })
    }

    // ---------------------------------------------------------------
    // 5. Missing documents for the current month
    // ---------------------------------------------------------------
    const currentMonthDocs = documents.filter(d => d.created_at?.startsWith(currentMonth))
    const expectedTypes = ['facture_fournisseur', 'facture_client', 'releve_bancaire']
    const presentTypes = new Set(currentMonthDocs.map(d => d.type_document))
    const missingTypes = expectedTypes.filter(t => !presentTypes.has(t))

    if (missingTypes.length > 0) {
      const typeLabels: Record<string, string> = {
        facture_fournisseur: 'Factures fournisseurs',
        facture_client: 'Factures clients',
        releve_bancaire: 'Releves bancaires',
      }
      alertes.push({
        id: `alerte-${++alerteIdx}`,
        type: 'info',
        titre: `Documents manquants pour ${currentMonth}`,
        description: `Types manquants: ${missingTypes.map(t => typeLabels[t] || t).join(', ')}`,
        montant: null,
        echeance: null,
        action_requise: 'Telecharger les documents manquants pour completer la comptabilite du mois',
        alerte_type: 'doc_manquant',
        alerte_key: computeAlerteKey({
          type: 'doc_manquant',
          societeId: requestedSocieteId ?? societeIds[0] ?? null,
          periode: currentMonth,
          detail: missingTypes.slice().sort().join('-'),
        }),
      })
    }

    // Sort: urgent first, then attention, then info
    const typeOrder: Record<string, number> = { urgent: 0, attention: 1, info: 2 }
    alertes.sort((a, b) => (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3))

    return NextResponse.json({ alertes })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('Alertes API error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
