import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSystemPrompt, injectTauxChange, CLAUDE_CONFIG } from '@/lib/ai/prompts'
import type { PromptId } from '@/lib/ai/prompts'
import { isBankName } from '@/lib/utils/bank-utils'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

const TYPE_TO_PROMPT_ID: Record<string, PromptId> = {
  facture_fournisseur: 'facture_fournisseur',
  facture_client: 'facture_client',
  releve_bancaire: 'releve_bancaire',
  fiche_paie: 'fiche_paie',
  charges_sociales: 'charges_sociales',
}

// ---------------------------------------------------------------------------
// POST /api/documents/[id]/reanalyze
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const { id } = await params

    // Fetch document
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select(`
        id, nom_fichier, type_fichier, type_document, statut,
        storage_path, dossier_id, uploaded_by,
        dossiers(client_id, comptable_id, societe_id)
      `)
      .eq('id', id)
      .single()

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    // Access control
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    const userRole = profile?.role
    const dossier = doc.dossiers as any
    const isOwner = doc.uploaded_by === user.id || dossier?.client_id === user.id
    const isComptableOrAdmin = ['admin', 'comptable', 'comptable_dedie'].includes(userRole || '')

    if (!isOwner && !isComptableOrAdmin) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    if (!doc.storage_path) {
      return NextResponse.json({ error: 'Aucun fichier associé à ce document' }, { status: 400 })
    }

    // Parse body
    const body = await request.json().catch(() => ({}))
    const hint: string = body.hint || ''
    const typeForce: string = body.type_force || doc.type_document || 'autre'
    const maxTokensOverride: number = body.max_tokens || (typeForce === 'releve_bancaire' ? CLAUDE_CONFIG.max_tokens_releve_bancaire : CLAUDE_CONFIG.max_tokens)

    // Mark document as processing
    await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', id)

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.storage_path)

    if (downloadError || !fileData) {
      await supabase.from('documents').update({ statut: 'erreur' }).eq('id', id)
      return NextResponse.json({ error: `Erreur téléchargement: ${downloadError?.message}` }, { status: 500 })
    }

    const fileArrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(fileArrayBuffer).toString('base64')
    const ext = doc.nom_fichier.split('.').pop()?.toLowerCase() || 'pdf'
    const isPdf = ext === 'pdf'
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

    // Fetch live exchange rates
    let tauxChange: Record<string, number> = { EUR: 46.50, GBP: 54.20, USD: 44.80 }
    try {
      const tauxRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/taux-change`)
      if (tauxRes.ok) {
        const tauxData = await tauxRes.json()
        if (tauxData.rates) tauxChange = tauxData.rates
      }
    } catch { /* use defaults */ }

    // Build system prompt: use specialized prompt if available
    const promptId = TYPE_TO_PROMPT_ID[typeForce]
    let systemPrompt: string

    if (promptId) {
      systemPrompt = getSystemPrompt(promptId, tauxChange)
    } else {
      // Generic prompt for unknown types
      systemPrompt = injectTauxChange(`Tu es un expert-comptable mauricien. Analyse ce document et retourne UNIQUEMENT un JSON valide.
Format: {"routing":{"societe":"","type_document":"autre","confiance_type":0},"extraction":{"date_document":"","description":"","montant":0,"devise":"MUR"}}
Taux: EUR={{TAUX_EUR}}, GBP={{TAUX_GBP}}, USD={{TAUX_USD}}`, tauxChange)
    }

    // Inject hint into system prompt if provided
    if (hint) {
      systemPrompt = `CONTEXTE ADDITIONNEL FOURNI PAR L'UTILISATEUR: ${hint}\n\n${systemPrompt}`
    }

    // Build message content
    let messageContent: any
    if (isPdf) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: hint ? `Analyse ce document. Contexte: ${hint}` : 'Analyse ce document comptable.' },
      ]
    } else if (isImage) {
      const mt = ext === 'png' ? 'image/png' : 'image/jpeg'
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
        { type: 'text', text: hint ? `Analyse ce document. Contexte: ${hint}` : 'Analyse ce document comptable.' },
      ]
    } else {
      messageContent = `Analyse ce document:\n${Buffer.from(fileArrayBuffer).toString('utf-8').substring(0, 5000)}`
    }

    // Call Claude
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const stream = anthropic.messages.stream({
      model: CLAUDE_CONFIG.model,
      max_tokens: maxTokensOverride,
      temperature: CLAUDE_CONFIG.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    })
    const aiResponse = await stream.finalMessage()

    const text = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    let parsed: any = {}
    try { parsed = JSON.parse(cleaned) } catch {
      parsed = { routing: { type_document: typeForce, societe: 'INCONNU', confiance_type: 30 }, extraction: {} }
    }

    // For bank statements, wrap the result in routing/extraction structure
    const isReleveBancaire = typeForce === 'releve_bancaire'
    let finalRouting: any
    let finalExtraction: any

    if (isReleveBancaire && !parsed.routing) {
      // The releve bancaire prompt returns directly the extraction object
      // Use account holder (nom_societe/titulaire), NOT the bank name
      const accountHolder = parsed.nom_societe || parsed.titulaire || null
      const routingSociete = accountHolder && !isBankName(accountHolder) ? accountHolder : 'INCONNU'
      finalRouting = { type_document: 'releve_bancaire', societe: routingSociete, confiance_type: 90 }
      finalExtraction = parsed
    } else {
      finalRouting = parsed.routing || { type_document: typeForce, societe: 'INCONNU', confiance_type: 50 }
      finalExtraction = parsed.extraction || parsed
    }

    const finalTypeDocument = finalRouting.type_document || typeForce
    let finalSociete = finalRouting.societe
    const finalConfiance = finalRouting.confiance_type || null

    // Post-processing: never use bank name as société
    if (finalSociete && isBankName(finalSociete)) {
      console.warn(`[reanalyze] societe "${finalSociete}" is a bank name — clearing to INCONNU`)
      finalSociete = 'INCONNU'
    }
    if (finalExtraction?.nom_societe && isBankName(finalExtraction.nom_societe)) {
      finalExtraction.nom_societe = null
    }
    if (finalExtraction?.titulaire && isBankName(finalExtraction.titulaire)) {
      finalExtraction.titulaire = null
    }

    // Delete old accounting entries for this document
    if (doc.dossier_id) {
      await supabase.from('ecritures_comptables')
        .delete()
        .eq('dossier_id', doc.dossier_id)
        .eq('piece_justificative', id)

    }

    // Update document
    const updateFields: any = {
      type_document: finalTypeDocument,
      statut: 'traite',
      societe_detectee: finalSociete !== 'INCONNU' ? finalSociete : null,
      confiance_type: finalConfiance,
      n8n_result: {
        routing: finalRouting,
        extraction: finalExtraction,
        metadata: {
          model: CLAUDE_CONFIG.model,
          processed_at: new Date().toISOString(),
          reanalyzed: true,
          hint: hint || null,
          type_force: typeForce,
        },
      },
    }

    // Re-route to correct dossier if société changed
    if (finalSociete && finalSociete !== 'INCONNU' && dossier?.client_id) {
      const { data: clientDossiers } = await supabase
        .from('dossiers').select('id, societe_id, societes(nom)')
        .eq('client_id', dossier.client_id)

      if (clientDossiers && clientDossiers.length > 1) {
        const matched = clientDossiers.find((d: any) => {
          const socName = (d.societes as any)?.nom?.toLowerCase() || ''
          const detected = finalSociete.toLowerCase()
          return socName.includes(detected) || detected.includes(socName.replace(' — personnel', ''))
        })
        if (matched && matched.id !== doc.dossier_id) {
          updateFields.dossier_id = matched.id
        }
      }
    }

    await supabase.from('documents').update(updateFields).eq('id', id)

    // Re-create accounting entries
    const ecritures = finalExtraction.ecritures_comptables || finalExtraction.lignes
    const finalDossierId = updateFields.dossier_id || doc.dossier_id
    if (Array.isArray(ecritures) && ecritures.length > 0 && finalDossierId) {
      const journalMap: Record<string, string> = {
        facture_fournisseur: 'ACH', facture_client: 'VTE',
        releve_bancaire: 'BNQ', fiche_paie: 'OD', charges_sociales: 'OD',
      }
      const entries = ecritures
        .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
        .map((e: any) => ({
          dossier_id: finalDossierId,
          date_ecriture: finalExtraction.date_document || finalExtraction.periode_debut || new Date().toISOString().split('T')[0],
          journal: journalMap[finalTypeDocument] || 'OD',
          numero_piece: finalExtraction.numero_reference || null,
          compte: String(e.compte),
          libelle: e.libelle || doc.nom_fichier,
          debit: Number(e.debit) || 0,
          credit: Number(e.credit) || 0,
          piece_justificative: id,
        }))
      if (entries.length > 0) {
        const { error: insertErr } = await supabase.from('ecritures_comptables').insert(entries)
        if (insertErr) console.error('[reanalyze] ecritures insert error:', insertErr.message)
      }
    }

    // === FACTURE: create/update factures record if invoice type ===
    if ((finalTypeDocument === 'facture_fournisseur' || finalTypeDocument === 'facture_client') && finalDossierId) {
      const factureSocieteId = dossier?.societe_id || null
      if (factureSocieteId) {
        const devise = finalExtraction.devise || 'MUR'
        const fxRate = devise !== 'MUR' ? (tauxChange[devise] || 1) : 1
        const montantHT = Number(finalExtraction.montant_ht) || 0
        const montantTVA = Number(finalExtraction.montant_tva) || 0
        let montantTTC = Number(finalExtraction.montant_ttc) || 0
        if (montantTTC === 0 && montantHT > 0) montantTTC = montantHT + montantTVA

        const tvaApplicable = finalExtraction.tva_applicable !== false && !finalExtraction.tva_exonere
        const tauxTva = tvaApplicable ? (Number(finalExtraction.taux_tva) || 15) : 0
        let finalTVA = montantTVA
        if (tvaApplicable && finalTVA === 0 && montantHT > 0) {
          finalTVA = Math.round(montantHT * tauxTva / 100 * 100) / 100
        }
        if (!tvaApplicable) finalTVA = 0

        const factureTiers = finalExtraction.emetteur?.nom || finalExtraction.emetteur || finalExtraction.fournisseur || ''
        const typeFact = finalTypeDocument === 'facture_fournisseur' ? 'fournisseur' : 'client'

        // Check if facture already exists for this document
        const { data: existingFacture } = await supabase
          .from('factures').select('id').eq('document_id', id).maybeSingle()

        const factureData = {
          societe_id: factureSocieteId,
          dossier_id: finalDossierId,
          numero_facture: finalExtraction.numero_reference || finalExtraction.numero_facture || null,
          type_facture: typeFact,
          tiers: typeof factureTiers === 'string' ? factureTiers : JSON.stringify(factureTiers),
          description: finalExtraction.description || doc.nom_fichier,
          date_facture: finalExtraction.date_document || new Date().toISOString().split('T')[0],
          date_echeance: finalExtraction.date_echeance || null,
          devise,
          taux_change: fxRate,
          montant_ht: montantHT,
          montant_tva: finalTVA,
          montant_ttc: montantTTC || montantHT + finalTVA,
          taux_tva: tauxTva,
          montant_mur: Math.round((montantTTC || montantHT + finalTVA) * fxRate * 100) / 100,
          statut: 'en_attente',
          document_id: id,
          notes: finalExtraction.analyse_tva || null,
        }

        if (existingFacture) {
          await supabase.from('factures').update(factureData).eq('id', existingFacture.id)
          console.log(`[reanalyze] Updated facture ${existingFacture.id}`)
        } else {
          const { error: factErr } = await supabase.from('factures').insert(factureData)
          if (factErr) console.error('[reanalyze] facture insert error:', factErr.message)
          else console.log(`[reanalyze] Created facture for document ${id}`)
        }
      }
    }

    // === BANK STATEMENT: update comptes_bancaires + releves_bancaires ===
    if (finalTypeDocument === 'releve_bancaire' && dossier?.societe_id) {
      const bankSocieteId = dossier.societe_id
      const rawBankName = finalExtraction.banque || finalExtraction.compte_bancaire || null
      const bankName = rawBankName && !isBankName(rawBankName) ? rawBankName : (rawBankName || null)
      const ibanCurrency = finalExtraction.iban?.match(/[A-Z]{3}$/)?.[0] || null
      const bankDevise = (finalExtraction.devise || ibanCurrency || 'MUR').toUpperCase().replace(/[^A-Z]/g, '') || 'MUR'
      const rawSolde = parseFloat(finalExtraction.solde_cloture) || parseFloat(finalExtraction.solde_fin) || NaN
      const solde = isNaN(rawSolde) ? null : rawSolde

      // Normalize dates
      let normPeriodeFin = finalExtraction.periode_fin || finalExtraction.date_fin || null
      if (!normPeriodeFin && finalExtraction.periode) {
        const p = finalExtraction.periode
        if (/^\d{4}-\d{2}$/.test(p)) {
          const [y, m] = p.split('-').map(Number)
          const lastDay = new Date(y, m, 0).getDate()
          normPeriodeFin = `${p}-${String(lastDay).padStart(2, '0')}`
        } else {
          normPeriodeFin = p
        }
      }

      let normPeriodeDebut = finalExtraction.periode_debut || finalExtraction.date_debut || null
      if (!normPeriodeDebut && finalExtraction.periode) {
        if (/^\d{4}-\d{2}$/.test(finalExtraction.periode)) {
          normPeriodeDebut = `${finalExtraction.periode}-01`
        }
      }
      if (!normPeriodeDebut) normPeriodeDebut = normPeriodeFin

      const normNumeroCompte = finalExtraction.numero_compte || finalExtraction.compte_bancaire || null
      const extractedIBAN = finalExtraction.iban || null

      // Find existing bank account — strict by societe_id + multiple match strategies
      let existingBank: any = null
      if (extractedIBAN) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, numero_compte, devise, societe_id').eq('societe_id', bankSocieteId).eq('iban', extractedIBAN).limit(1).maybeSingle()
        existingBank = data
      }
      if (!existingBank && normNumeroCompte) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, numero_compte, devise, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
        existingBank = data
      }
      if (!existingBank && bankName) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, numero_compte, devise, societe_id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
        existingBank = data
      }

      if (existingBank) {
        // SAFE UPDATE: never overwrite numero_compte or societe_id if already set
        const safeUpdate: Record<string, unknown> = {}
        if (solde !== null) safeUpdate.solde_actuel = solde
        if (normPeriodeFin) safeUpdate.date_dernier_releve = normPeriodeFin
        if (bankName) safeUpdate.banque = bankName
        if (!existingBank.numero_compte && normNumeroCompte) safeUpdate.numero_compte = normNumeroCompte
        if (!existingBank.devise && bankDevise) safeUpdate.devise = bankDevise
        if (extractedIBAN) safeUpdate.iban = extractedIBAN
        if (Object.keys(safeUpdate).length > 0) {
          await supabase.from('comptes_bancaires').update(safeUpdate).eq('id', existingBank.id)
        }
      } else if (bankName) {
        await supabase.from('comptes_bancaires').insert({
          societe_id: bankSocieteId, banque: bankName,
          nom_compte: normNumeroCompte || null,
          numero_compte: normNumeroCompte, iban: extractedIBAN,
          devise: bankDevise,
          solde_actuel: solde, solde_dernier_releve: solde,
          date_dernier_releve: normPeriodeFin, actif: true,
        })
      }

      // Build normalized transactions
      const rawTransactions: any[] = finalExtraction.transactions || []
      const rawLignes: any[] = finalExtraction.lignes || []
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

      const totalDebits = Number(finalExtraction.total_debits) ||
        normalizedTransactions.reduce((s: number, t: any) => s + (Number(t.debit) || 0), 0)
      const totalCredits = Number(finalExtraction.total_credits) ||
        normalizedTransactions.reduce((s: number, t: any) => s + (Number(t.credit) || 0), 0)
      const soldeOuverture = Number(finalExtraction.solde_ouverture) || Number(finalExtraction.solde_debut) || 0
      const soldeCloture = solde || Number(finalExtraction.solde_fin) || 0

      // Delete old releve for this document
      await supabase.from('releves_bancaires').delete().eq('document_id', id)

      // Get bank account ID — strict societe_id match
      let bankAccount: any = null
      if (normNumeroCompte) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
        if (data && data.societe_id === bankSocieteId) bankAccount = data
      }
      if (!bankAccount && bankName) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, societe_id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
        if (data && data.societe_id === bankSocieteId) bankAccount = data
      }

      if (bankAccount && normalizedTransactions.length > 0) {
        const ecartSolde = Math.abs((soldeOuverture + totalCredits - totalDebits) - soldeCloture)
        const { error: releveError } = await supabase.from('releves_bancaires').insert({
          compte_bancaire_id: bankAccount.id,
          societe_id: bankSocieteId,
          periode: normPeriodeFin ? normPeriodeFin.substring(0, 7) : null,
          date_debut: normPeriodeDebut,
          date_fin: normPeriodeFin,
          solde_ouverture: soldeOuverture,
          solde_cloture: soldeCloture,
          total_debits: totalDebits,
          total_credits: totalCredits,
          document_id: id,
          transactions_json: normalizedTransactions,
          statut_rapprochement: ecartSolde > 1 ? 'ecart_detecte' : 'en_attente',
        })
        if (releveError) console.error('[reanalyze] releves_bancaires insert error:', releveError.message)
        else console.log(`[reanalyze] Bank statement stored: ${normalizedTransactions.length} transactions`)
      }
    }

    // Return updated document
    const { data: updatedDoc } = await supabase
      .from('documents')
      .select('id, nom_fichier, type_document, statut, societe_detectee, confiance_type, n8n_result, created_at')
      .eq('id', id)
      .single()

    return NextResponse.json({
      success: true,
      document: updatedDoc,
      type_detected: finalTypeDocument,
      confiance: finalConfiance,
      processing_time_ms: null,
    })
  } catch (e: any) {
    const errMsg = e?.message || String(e)
    console.error('[reanalyze] FATAL:', errMsg)
    // Try to mark as error
    try {
      const supabase = getAdminClient()
      try {
        const { id: resolvedId } = await params
        if (resolvedId) await supabase.from('documents').update({ statut: 'erreur' }).eq('id', resolvedId)
      } catch {}
    } catch {}
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
