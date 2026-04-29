import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSystemPrompt, injectTauxChange, injectSocietes, CLAUDE_CONFIG, SYSTEM_PROMPT_GENERIC_EXTRACTION } from '@/lib/ai/prompts'
import type { PromptId } from '@/lib/ai/prompts'
import { isBankName, validateAndCleanExtraction, computeConfidence, repairBankJSON } from '@/lib/utils/bank-utils'
import { extractBankStatement } from '@/lib/ai/bank-statement-extraction'

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
        storage_path, dossier_id, uploaded_by, n8n_result,
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

    // Fast-path: check if saved extraction already has usable data.
    // If yes → skip Claude call and reuse cached data (saves API costs).
    // If no → force a fresh OCR call from the file in Storage.
    // Override with body.force_ocr = true to always re-run OCR.
    const forceOcr: boolean = body.force_ocr === true || !!hint || !!body.type_force
    const savedN8n = (doc as any).n8n_result || {}
    const savedExtraction = savedN8n.extraction || {}
    const hasUsableData = (
      (Number(savedExtraction.montant_ttc) > 0 || Number(savedExtraction.montant_ht) > 0) &&
      (savedExtraction.emetteur || savedExtraction.fournisseur || savedExtraction.client || savedExtraction.destinataire)
    )
    const useSaved = !forceOcr && hasUsableData
    if (useSaved) {
      console.log(`[reanalyze] Using saved extraction for doc ${id} — tiers/montant present`)
    } else {
      console.log(`[reanalyze] Forcing fresh Claude OCR for doc ${id} — saved data empty or force_ocr=true`)
    }

    // Mark document as processing
    await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', id)

    // Fetch live exchange rates (needed by both paths for currency conversion in facture creation)
    let tauxChange: Record<string, number> = { EUR: 46.50, GBP: 54.20, USD: 44.80 }
    try {
      const tauxRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/taux-change`)
      if (tauxRes.ok) {
        const tauxData = await tauxRes.json()
        if (tauxData.rates) tauxChange = tauxData.rates
      }
    } catch { /* use defaults */ }

    let parsed: any

    if (useSaved) {
      // FAST PATH: use saved extraction — no Claude call needed
      parsed = {
        routing: savedN8n.routing || { type_document: typeForce, societe: savedExtraction.emetteur?.nom || savedExtraction.fournisseur || 'INCONNU', confiance_type: 90 },
        extraction: savedExtraction,
      }
    } else {
      // SLOW PATH: fresh OCR call to Claude

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

      // Fetch user's sociétés for dynamic prompt injection
      let societeDetailsForPrompt: { id: string; nom: string; brn?: string | null; aliases?: string[] | null }[] = []
      try {
        const { data: ownedSoc } = await supabase.from('societes').select('id, nom, brn, aliases').eq('created_by', user.id)
        const { data: dossierSoc } = await supabase.from('dossiers').select('societe_id').eq('client_id', user.id)
        const dossierSocIds = (dossierSoc || []).map(d => d.societe_id).filter(Boolean)
        if (dossierSocIds.length > 0) {
          const { data: fromDossiers } = await supabase.from('societes').select('id, nom, brn, aliases').in('id', dossierSocIds)
          const all = [...(ownedSoc || []), ...(fromDossiers || [])]
          societeDetailsForPrompt = Array.from(new Map(all.map(s => [s.id, s])).values())
        } else {
          societeDetailsForPrompt = ownedSoc || []
        }
      } catch { /* use empty list */ }

      // Build system prompt: use specialized prompt if available
      const promptId = TYPE_TO_PROMPT_ID[typeForce]
      let systemPrompt: string

      if (promptId) {
        systemPrompt = injectSocietes(getSystemPrompt(promptId, tauxChange), societeDetailsForPrompt)
      } else {
        systemPrompt = injectSocietes(injectTauxChange(SYSTEM_PROMPT_GENERIC_EXTRACTION, tauxChange), societeDetailsForPrompt)
      }

      if (hint) {
        systemPrompt = `CONTEXTE ADDITIONNEL FOURNI PAR L'UTILISATEUR: ${hint}\n\n${systemPrompt}`
      }

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

      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

      // Pour les relevés bancaires PDF : utilise l'extraction avec continuation
      // (jusqu'à 5 appels) pour gérer les longs relevés (100+ transactions).
      // Pour les autres types : appel simple comme avant.
      if (typeForce === 'releve_bancaire' && isPdf) {
        const result = await extractBankStatement(anthropic, {
          base64,
          systemPrompt,
          model: CLAUDE_CONFIG.model,
          maxTokens: maxTokensOverride,
          temperature: CLAUDE_CONFIG.temperature,
          initialUserPrompt: hint
            ? `Analyse ce relevé bancaire. Contexte: ${hint}. Retourne UNIQUEMENT un JSON valide. Lis TOUTES les lignes sans exception.`
            : 'Retourne UNIQUEMENT un JSON valide (pas de markdown). Lis TOUTES les lignes du releve sans exception.',
          maxContinuations: 5,
        })

        parsed = result.parsed
        if (!parsed || typeof parsed !== 'object') {
          // Fallback to repairBankJSON on rawText if extractBankStatement couldn't parse
          parsed = repairBankJSON(result.rawText)
        }
        if (!parsed || typeof parsed !== 'object') {
          console.warn('[reanalyze] All JSON parse strategies failed for doc', id, '— continuations done:', result.nbContinuations)
          parsed = { routing: { type_document: typeForce, societe: 'INCONNU', confiance_type: 30 }, extraction: {} }
        }
      } else {
        const stream = anthropic.messages.stream({
          model: CLAUDE_CONFIG.model,
          max_tokens: maxTokensOverride,
          temperature: CLAUDE_CONFIG.temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: messageContent }],
        })
        const aiResponse = await stream.finalMessage()

        const text = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

        parsed = repairBankJSON(text)
        if (!parsed || typeof parsed !== 'object') {
          console.warn('[reanalyze] All JSON parse strategies failed for doc', id)
          parsed = { routing: { type_document: typeForce, societe: 'INCONNU', confiance_type: 30 }, extraction: {} }
        }
      }
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

    // === OVERHAUL: Validate extraction + compute confidence ===
    const { data: userSocietesForVal } = await supabase
      .from('societes').select('id, nom, brn')
      .or(`created_by.eq.${user.id}`)
    const { data: userSocFromDossiersVal } = await supabase
      .from('dossiers').select('societe_id, societes(id, nom, brn)')
      .eq('client_id', user.id)
    const allUserSocietesVal = [
      ...(userSocietesForVal || []),
      ...(userSocFromDossiersVal || []).map((d: any) => d.societes).filter(Boolean),
    ]
    const uniqueUserSocietesVal = Array.from(new Map(allUserSocietesVal.map((s: any) => [s.id, s])).values()) as { id: string; nom: string; brn?: string }[]

    const validation = validateAndCleanExtraction(finalExtraction, finalTypeDocument, uniqueUserSocietesVal)
    console.log(`[reanalyze] Validation: société_id=${validation.societe_id}, confidence=${validation.confidence}`)

    if (validation.societe_id && !validation.needs_confirmation) {
      const matchedSoc = uniqueUserSocietesVal.find(s => s.id === validation.societe_id)
      if (matchedSoc) {
        finalSociete = matchedSoc.nom
        console.log(`[reanalyze] Société auto-matched: ${finalSociete}`)
      }
    }

    const extractionConfidence = computeConfidence(finalExtraction, finalTypeDocument)
    console.log(`[reanalyze] Confidence score: ${extractionConfidence}/100`)

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
      confiance_type: extractionConfidence || finalConfiance,
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

    const { error: docUpdateErr } = await supabase.from('documents').update(updateFields).eq('id', id)
    if (docUpdateErr) console.error('[reanalyze] document update FAILED:', docUpdateErr.message)

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
      // Always resolve societe_id from the FINAL dossier (post-routing), not the original
      const { data: dossierForFacture } = await supabase
        .from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
      const factureSocieteId = dossierForFacture?.societe_id || dossier?.societe_id || null
      if (factureSocieteId) {
        // Detect devise: explicit field → totaux EUR presence → default MUR
        const totaux = finalExtraction.totaux || {}
        const devise =
          finalExtraction.devise ||
          finalExtraction.currency ||
          (Number(totaux.total_ttc_eur) > 0 ? 'EUR' : null) ||
          'MUR'
        // Prefer explicit taux_change from totaux when available
        const fxRate =
          devise !== 'MUR'
            ? (Number(totaux.taux_change?.EUR_to_MUR) ||
               Number(totaux.taux_change?.[`${devise}_to_MUR`]) ||
               tauxChange[devise] ||
               1)
            : 1
        const montantHT = devise === 'EUR'
          ? (Number(totaux.montant_ht_eur) ||
             Number(finalExtraction.montant_ht) ||
             Number(finalExtraction.total_ht) ||
             Number(finalExtraction.subtotal) ||
             0)
          : (Number(finalExtraction.montant_ht) ||
             Number(totaux.montant_ht_mur) ||
             Number(finalExtraction.montant_ht_mur) ||
             Number(finalExtraction.total_ht) ||
             Number(finalExtraction.subtotal) ||
             0)
        const montantTVA = devise === 'EUR'
          ? (Number(totaux.tva_eur) ||
             Number(finalExtraction.montant_tva) ||
             Number(finalExtraction.tva) ||
             0)
          : (Number(finalExtraction.montant_tva) ||
             Number(totaux.tva_mur) ||
             Number(finalExtraction.tva_mur) ||
             Number(finalExtraction.tva) ||
             0)
        let montantTTC = devise === 'EUR'
          ? (Number(totaux.total_ttc_eur) ||
             Number(totaux.net_a_payer_eur) ||
             Number(finalExtraction.montant_ttc) ||
             Number(finalExtraction.total_ttc) ||
             Number(finalExtraction.total) ||
             Number(finalExtraction.amount) ||
             0)
          : (Number(finalExtraction.montant_ttc) ||
             Number(totaux.total_ttc_mur) ||
             Number(totaux.net_a_payer_mur) ||
             Number(finalExtraction.total_ttc) ||
             Number(finalExtraction.total) ||
             Number(finalExtraction.amount) ||
             0)
        if (montantTTC === 0 && montantHT > 0) montantTTC = montantHT + montantTVA

        const tvaApplicable = finalExtraction.tva_applicable !== false && !finalExtraction.tva_exonere
        const tauxTva = tvaApplicable ? (Number(finalExtraction.taux_tva) || 15) : 0
        let finalTVA = montantTVA
        if (tvaApplicable && finalTVA === 0 && montantHT > 0) {
          finalTVA = Math.round(montantHT * tauxTva / 100 * 100) / 100
        }
        if (!tvaApplicable) finalTVA = 0

        const rawTiers =
          finalExtraction.emetteur ||
          finalExtraction.fournisseur ||
          finalExtraction.client?.nom ||
          finalExtraction.client ||
          finalExtraction.destinataire?.nom ||
          finalExtraction.destinataire ||
          finalExtraction.tiers ||
          ''
        const factureTiers = typeof rawTiers === 'object' && rawTiers !== null
          ? (rawTiers.nom || rawTiers.name || JSON.stringify(rawTiers))
          : String(rawTiers || '')
        const typeFact = finalTypeDocument === 'facture_fournisseur' ? 'fournisseur' : 'client'

        // Skip facture creation if amounts are empty AND no existing facture to update
        // Prevents empty factures (tiers="" or montant=0) from polluting the DB
        if (montantTTC <= 0 && montantHT <= 0) {
          console.warn(`[reanalyze] Skipping facture creation for document ${id} — both montant_ttc and montant_ht are 0 (extraction may have failed; tiers="${factureTiers}")`)
        } else {
          // Check if facture already exists for this document
          const { data: existingFacture } = await supabase
            .from('factures').select('id').eq('document_id', id).maybeSingle()

          const factureData = {
            societe_id: factureSocieteId,
            dossier_id: finalDossierId,
            numero_facture: finalExtraction.numero_reference || finalExtraction.numero_facture || null,
            type_facture: typeFact,
            tiers: factureTiers,
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

          let factureIdForLink: string | null = existingFacture?.id || null
          if (existingFacture) {
            await supabase.from('factures').update(factureData).eq('id', existingFacture.id)
            console.log(`[reanalyze] Updated facture ${existingFacture.id}`)
          } else {
            const { data: inserted, error: factErr } = await supabase.from('factures').insert(factureData).select('id').maybeSingle()
            if (factErr) console.error('[reanalyze] facture insert error:', factErr.message)
            else {
              factureIdForLink = inserted?.id || null
              console.log(`[reanalyze] Created facture ${factureIdForLink} for document ${id} — tiers="${factureTiers}", ttc=${montantTTC} ${devise}`)
            }
          }

          // Migration 133 link: stamp ecritures just (re)created for this
          // document with facture_id so auto-letterage finds them without
          // having to parse libelle text.
          if (factureIdForLink && finalDossierId) {
            await supabase.from('ecritures_comptables')
              .update({ facture_id: factureIdForLink })
              .eq('dossier_id', finalDossierId)
              .eq('piece_justificative', id)
              .is('facture_id', null)
          }
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
        // Prefer matching with IBAN-derived devise first
        const ibanDev = extractedIBAN?.match(/[A-Z]{3}$/)?.[0] || null
        if (ibanDev) {
          const { data } = await supabase.from('comptes_bancaires')
            .select('id, numero_compte, devise, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).eq('devise', ibanDev).limit(1).maybeSingle()
          existingBank = data
        }
        if (!existingBank) {
          const { data } = await supabase.from('comptes_bancaires')
            .select('id, numero_compte, devise, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
          existingBank = data
        }
      }
      if (!existingBank && bankName) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, numero_compte, devise, societe_id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
        existingBank = data
      }

      if (existingBank) {
        // HARD GUARD: verify société matches before ANY update
        const { data: guardCheck } = await supabase.from('comptes_bancaires')
          .select('id, societe_id, numero_compte').eq('id', existingBank.id).single()

        if (guardCheck && guardCheck.societe_id !== bankSocieteId) {
          console.error(`[reanalyze] HARD GUARD BLOCKED: attempt to update compte ${existingBank.id} from société ${guardCheck.societe_id} with data for société ${bankSocieteId}`)
          existingBank = null // Force creation of new account instead
        } else {
          // SAFE UPDATE: never overwrite numero_compte or societe_id if already set
          const safeUpdate: Record<string, unknown> = {}
          if (solde !== null) safeUpdate.solde_actuel = solde
          if (normPeriodeFin) safeUpdate.date_dernier_releve = normPeriodeFin
          if (bankName) safeUpdate.banque = bankName
          if (!guardCheck?.numero_compte && normNumeroCompte) safeUpdate.numero_compte = normNumeroCompte
          if (!existingBank.devise && bankDevise) safeUpdate.devise = bankDevise
          if (extractedIBAN) safeUpdate.iban = extractedIBAN
          if (Object.keys(safeUpdate).length > 0) {
            await supabase.from('comptes_bancaires').update(safeUpdate).eq('id', existingBank.id)
          }
        }
      }

      if (!existingBank) {
        // FIX: was `if (!existingBank && bankName)` — silently skipped when
        // OCR missed the bank name. Mirror of upload/route.ts fallback.
        const accountHolder = finalExtraction.nom_societe || finalExtraction.titulaire || null
        const finalBankName =
          bankName
          || (accountHolder && !isBankName(accountHolder) ? null : accountHolder)
          || (extractedIBAN ? `Banque (${extractedIBAN.slice(0, 4)}…)` : null)
          || 'Banque non identifiée'
        console.log(`[reanalyze] Creating bank account (fallback): ${finalBankName} for societe=${bankSocieteId}`)
        const { error: bankInsertErr } = await supabase.from('comptes_bancaires').insert({
          societe_id: bankSocieteId, banque: finalBankName,
          nom_compte: normNumeroCompte || null,
          numero_compte: normNumeroCompte, iban: extractedIBAN,
          devise: bankDevise,
          solde_actuel: solde, solde_dernier_releve: solde,
          date_dernier_releve: normPeriodeFin, actif: true,
        })
        if (bankInsertErr) console.error('[reanalyze] comptes_bancaires insert FAILED:', bankInsertErr.message)
        if (!bankName) {
          console.warn('[reanalyze] Banque non identifiée — compte créé avec libellé de secours. Document:', id)
        }
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

      // Get bank account ID — strict societe_id match + IBAN-based devise routing
      const ibanDevise = extractedIBAN?.match(/[A-Z]{3}$/)?.[0] || null
      let bankAccount: any = null
      // Strategy 1: exact IBAN match
      if (extractedIBAN) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, societe_id').eq('societe_id', bankSocieteId).eq('iban', extractedIBAN).limit(1).maybeSingle()
        if (data && data.societe_id === bankSocieteId) bankAccount = data
      }
      // Strategy 2: numero_compte + devise (from IBAN suffix)
      if (!bankAccount && normNumeroCompte) {
        let q = supabase.from('comptes_bancaires')
          .select('id, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte)
        if (ibanDevise) q = q.eq('devise', ibanDevise)
        const { data } = await q.limit(1).maybeSingle()
        if (data && data.societe_id === bankSocieteId) bankAccount = data
      }
      // Strategy 3: numero_compte without devise filter
      if (!bankAccount && normNumeroCompte) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
        if (data && data.societe_id === bankSocieteId) bankAccount = data
      }
      // Strategy 4: banque + devise
      if (!bankAccount && bankName) {
        const { data } = await supabase.from('comptes_bancaires')
          .select('id, societe_id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
        if (data && data.societe_id === bankSocieteId) bankAccount = data
      }

      // FIX: last-resort fallback — same as upload/route.ts — so a missed
      // strict match doesn't drop the releve on the floor.
      if (!bankAccount) {
        const { data: anySocieteAcc } = await supabase.from('comptes_bancaires')
          .select('id, societe_id').eq('societe_id', bankSocieteId).eq('devise', bankDevise)
          .order('date_dernier_releve', { ascending: false, nullsFirst: false })
          .limit(1).maybeSingle()
        if (anySocieteAcc && anySocieteAcc.societe_id === bankSocieteId) {
          bankAccount = anySocieteAcc
          console.log(`[reanalyze] Fallback account ${bankAccount.id} for societe ${bankSocieteId} (devise ${bankDevise})`)
        }
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
      } else if (!bankAccount) {
        console.error(`[reanalyze] releve NOT stored — no bank account found/created for société ${bankSocieteId}, doc ${id}`)
      } else if (normalizedTransactions.length === 0) {
        console.warn(`[reanalyze] releve NOT stored — 0 transactions extracted from doc ${id} (OCR may have failed; retry with force_ocr=true)`)
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
