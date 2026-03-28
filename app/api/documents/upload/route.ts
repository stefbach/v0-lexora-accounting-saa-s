import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSystemPrompt, injectTauxChange, CLAUDE_CONFIG } from '@/lib/ai/prompts'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = getAdminClient()
  let docId: string | null = null

  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File
    const societeId = formData.get('societe_id') as string
    const dossierId = formData.get('dossier_id') as string | null

    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: 'Type non supporté' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Fichier trop volumineux' }, { status: 400 })

    // Resolve dossier_id
    let resolvedDossierId = dossierId
    if (!resolvedDossierId) {
      let q = supabase.from('dossiers').select('id').eq('client_id', user.id)
      if (societeId) q = q.eq('societe_id', societeId)
      const { data: d } = await q.limit(1).single()
      if (d) { resolvedDossierId = d.id }
      else {
        const { data: anyD } = await supabase.from('dossiers').select('id').eq('client_id', user.id).limit(1).single()
        if (anyD) { resolvedDossierId = anyD.id }
        else {
          const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
          const { data: newSoc } = await supabase.from('societes')
            .insert({ nom: `${profile?.full_name || user.email} — Personnel`, statut_tva: false }).select('id').single()
          if (newSoc) {
            const { data: nd } = await supabase.from('dossiers')
              .insert({ client_id: user.id, societe_id: newSoc.id, comptable_id: null }).select('id').single()
            resolvedDossierId = nd?.id || null
          }
        }
      }
      if (!resolvedDossierId) return NextResponse.json({ error: 'Impossible de créer un dossier' }, { status: 400 })
    }

    // Read file ONCE
    const fileArrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(fileArrayBuffer).toString('base64')
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const typeFichier = ext === 'jpg' ? 'jpeg' : ext as 'pdf' | 'jpeg' | 'png' | 'xlsx'
    const storagePath = `${user.id}/${Date.now()}_${file.name}`

    // Upload to storage
    const { error: storageError } = await supabase.storage
      .from('documents').upload(storagePath, fileArrayBuffer, { contentType: file.type, upsert: false })
    if (storageError) return NextResponse.json({ error: `Upload storage: ${storageError.message}` }, { status: 500 })

    // Create document record
    const { data: doc, error: docError } = await supabase.from('documents').insert({
      dossier_id: resolvedDossierId, uploaded_by: user.id, nom_fichier: file.name,
      type_fichier: typeFichier, statut: 'en_cours', storage_path: storagePath,
      taille_fichier: file.size, societe_detectee: null, type_document: null,
    }).select().single()
    if (docError) return NextResponse.json({ error: `DB insert: ${docError.message}` }, { status: 500 })
    docId = doc.id

    // === AI PROCESSING ===
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    // Fetch live exchange rates for injection into prompts
    let tauxChange: Record<string, number> = { EUR: 46.50, GBP: 54.20, USD: 44.80 }
    try {
      const tauxRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/taux-change`)
      if (tauxRes.ok) {
        const tauxData = await tauxRes.json()
        if (tauxData.rates) tauxChange = tauxData.rates
      }
    } catch { /* use defaults */ }

    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const isPdf = ext === 'pdf'

    let messageContent: any
    if (isImage) {
      const mt = ext === 'png' ? 'image/png' : 'image/jpeg'
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
        { type: 'text', text: 'Analyse ce document comptable.' },
      ]
    } else if (isPdf) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Analyse ce document comptable.' },
      ]
    } else {
      messageContent = 'Analyse ce document:\n' + Buffer.from(fileArrayBuffer).toString('utf-8').substring(0, 5000)
    }

    // First pass: detect document type if not already known
    // We use the main inline prompt for the first analysis
    // For bank statements, we'll use the specialized prompt with higher max_tokens

    // Determine max_tokens based on expected document type hint
    // Default analysis uses 4096, bank statements need 16384
    const detectionMaxTokens = CLAUDE_CONFIG.max_tokens

    const aiResponse = await anthropic.messages.create({
      model: CLAUDE_CONFIG.model,
      max_tokens: detectionMaxTokens,
      temperature: CLAUDE_CONFIG.temperature,
      system: injectTauxChange(`Tu es un expert-comptable mauricien. Analyse ce document et retourne UNIQUEMENT un JSON valide (pas de markdown, pas de backticks).

=== DETECTION DU TYPE ===
Determine d'abord le type: facture_fournisseur, facture_client, releve_bancaire, fiche_paie, charges_sociales, contrat, ou autre.

=== REGLES PAR TYPE ===

--- FACTURE FOURNISSEUR ---
Format: {"routing":{"societe":"<nom>","type_document":"facture_fournisseur","confiance_type":0-100},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"EUR|USD|GBP|MUR|AUD","montant_ht":0,"montant_tva":0,"montant_ttc":0,"taux_tva":15,"tva_exonere":false,"fournisseur_vat_number":"","lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"6xx","libelle":"","debit":0,"credit":0}]}}
Comptes de charges:
- 622: Honoraires et fees (avocats, comptables, consultants, 2E2J)
- 612: Loyer et charges locatives (MWPI, MW PROP)
- 626: Telecom (internet, telephonie, CEB electricite, EMTEL, MTML, ORANGE)
- 623: Publicite, marketing (META, FACEBOOK, GOOGLE ADS)
- 651: SaaS et abonnements logiciels (OPENAI, VERCEL, SUPABASE, AWS, GITHUB, ANTHROPIC, STRIPE, ADOBE, ZOOM, SLACK, WATI, MICROSOFT 365)
- 624: Transport (UBER, BOLT, carburant)
- 616: Assurances
- 627: Frais bancaires
- 606: Fournitures de bureau
- 602: Achats pharmacie, fournitures medicales
- 611: Sous-traitance
- 628: Charges diverses
TVA: 4456 deductible. Fournisseur: 401 au credit.
Ecritures: debit compte charge + debit 4456 TVA / credit 401.
Si TVA exoneree (pas de numero TVA MRA valide sur la facture): tva_exonere=true, pas de 4456.
Verifier si le fournisseur a un numero d'enregistrement TVA MRA — si absent, TVA non deductible.

--- FACTURE CLIENT ---
Format: {"routing":{"societe":"<nom>","type_document":"facture_client","confiance_type":0-100},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"EUR|USD|GBP|MUR|AUD","montant_ht":0,"montant_tva":0,"montant_ttc":0,"taux_tva":15,"type_client":"B2B|B2C","lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"7xx","libelle":"","debit":0,"credit":0}]}}
Comptes de produits:
- 706: Prestations de services (telemedicine, BPO, consulting)
- 707: Ventes de marchandises
- 753: Commissions et courtages (NHS S2 referrals)
- 701: Ventes de produits finis
Client: 411 au debit. TVA collectee: 4457.
Ecritures: debit 411 / credit compte produit + credit 4457 TVA.
TVA export: ventes hors Maurice → TVA 0% (zero-rated).
Detecter B2B (entreprise avec BRN/VAT) vs B2C (particulier).

--- RELEVE BANCAIRE ---
Format: {"routing":{"societe":"<banque>","type_document":"releve_bancaire","confiance_type":0-100},"extraction":{"banque":"","numero_compte":"","devise":"EUR|USD|GBP|MUR","periode_debut":"YYYY-MM-DD","periode_fin":"YYYY-MM-DD","solde_ouverture":0,"solde_cloture":0,"total_debits":0,"total_credits":0,"lignes_manquantes":false,"ecart_solde":0,"transactions":[{"date":"YYYY-MM-DD","libelle":"","debit":0,"credit":0,"tiers_detecte":"","compte_comptable":"","devise_origine":null,"montant_origine":null,"taux_change_applique":null}],"ecritures_comptables":[{"compte":"51x","libelle":"","debit":0,"credit":0}]}}
INSTRUCTION CRITIQUE: Lis TOUTES les lignes du releve sans exception.
Comptes bancaires: MCB→511, SBM→512, CIC→513, Barclays→514, BOV→515.
Patterns MCB: 'IB Account Transfer'+'FT'→581 interne, 'PAIEMENT MCB-NNN'→581, 'Direct Debit Scheme MRA'→analyser, 'Forex Difference'→766/666, 'Bulk Payment SALARY'→421, 'Charge/Commission/Fee'→627.
Credits: extraire tiers depuis 'VIREMENT DE:', 'PAYMENT FROM:', 'TRANSFER FROM:'.
Verifier: solde_ouverture + total_credits - total_debits = solde_cloture (tolerance 1 MUR). Si ecart>1: lignes_manquantes=true.
TAUX EUR: {{TAUX_EUR}}, GBP: {{TAUX_GBP}}, USD: {{TAUX_USD}}.

--- FICHE DE PAIE ---
Format: {"routing":{"societe":"<employeur>","type_document":"fiche_paie","confiance_type":0-100},"extraction":{"employe":"","employeur":"","date_document":"YYYY-MM-DD","periode":"","salaire_brut":0,"salaire_net":0,"npf_salarie_3pct":0,"npf_patronal_6pct":0,"hrdc_1pct":0,"paye":0,"nps_salarie":0,"nps_employeur":0,"cotisations_salariales":0,"cotisations_patronales":0,"ecritures_comptables":[{"compte":"641|421|431|444|432|645","libelle":"","debit":0,"credit":0}]}}
Ecritures: 641 Remunerations (debit brut), 645 Charges patronales (debit CSG patron+TL+NSF patron), 421 Net a payer (credit), 444 PAYE (credit), 431 CSG (credit), 432 Training Levy (credit).

--- CHARGES SOCIALES ---
Format: {"routing":{"societe":"<nom>","type_document":"charges_sociales","confiance_type":0-100},"extraction":{"organisme":"","date_document":"YYYY-MM-DD","periode":"","montant_total":0,"detail":[{"type":"CSG_patronal_6pct|CSG_salarie_3pct|Training_Levy_1pct|NSF|PAYE","montant":0}],"ecritures_comptables":[{"compte":"431|432|433|444|645","libelle":"","debit":0,"credit":0}]}}

=== REGLES TRANSVERSALES ===
CONVERSION DEVISES: EUR/MUR: {{TAUX_EUR}}, GBP/MUR: {{TAUX_GBP}}, USD/MUR: {{TAUX_USD}}, AUD/MUR: ~29.50
REVERSE CHARGE (achat SaaS etranger): Output TVA 15% + Input TVA 15% → net=0. Ajouter ecriture debit 4456 + credit 4457.
Pour tout autre type: type_document="autre" ou "contrat".`, tauxChange),
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let parsed: any = {}
    try { parsed = JSON.parse(cleaned) } catch { parsed = { routing: { type_document: 'autre', societe: 'INCONNU' }, extraction: {} } }

    const typeDocument = parsed.routing?.type_document || 'autre'
    const detectedSociete = parsed.routing?.societe || 'INCONNU'
    const confianceType = parsed.routing?.confiance_type || null
    let extraction = parsed.extraction || {}

    // For bank statements: if initial analysis truncated, re-analyze with specialized prompt + 16384 tokens
    if (typeDocument === 'releve_bancaire' && isPdf) {
      const bankSystemPrompt = getSystemPrompt('releve_bancaire', tauxChange)
      const bankResponse = await anthropic.messages.create({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.max_tokens_releve_bancaire,
        temperature: CLAUDE_CONFIG.temperature,
        system: bankSystemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Analyse ce releve bancaire complet. Lis TOUTES les lignes sans exception.' },
            ],
          },
        ],
      })
      const bankText = bankResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      const bankCleaned = bankText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      try {
        const bankParsed = JSON.parse(bankCleaned)
        extraction = bankParsed
      } catch { /* keep initial extraction */ }
    }

    // Check bank statement coherence and create alert if needed
    if (typeDocument === 'releve_bancaire' && extraction.lignes_manquantes && Math.abs(extraction.ecart_solde || 0) > 1) {
      console.warn(`[upload] Bank statement coherence issue: ecart_solde=${extraction.ecart_solde} for doc ${docId}`)
    }

    // Try to match detected société to client's known sociétés and re-route if needed
    let finalDossierId = resolvedDossierId
    if (detectedSociete && detectedSociete !== 'INCONNU') {
      // Get all sociétés linked to this client
      const { data: clientDossiers } = await supabase
        .from('dossiers').select('id, societe_id, societe:societes(nom)')
        .eq('client_id', user.id)
      if (clientDossiers && clientDossiers.length > 1) {
        const matched = clientDossiers.find((d: any) => {
          const socName = (d.societe as any)?.nom?.toLowerCase() || ''
          const detected = detectedSociete.toLowerCase()
          return socName.includes(detected) || detected.includes(socName.replace(' — personnel', ''))
        })
        if (matched && matched.id !== resolvedDossierId) {
          finalDossierId = matched.id
          // Move document to the correct dossier
          await supabase.from('documents').update({ dossier_id: matched.id }).eq('id', doc.id)
        }
      }
    }

    // Update document as processed
    const updateData: any = {
      type_document: typeDocument, statut: 'traite',
      societe_detectee: detectedSociete !== 'INCONNU' ? detectedSociete : null,
      confiance_type: confianceType,
      n8n_result: { routing: parsed.routing, extraction, metadata: { model: CLAUDE_CONFIG.model, processed_at: new Date().toISOString() } },
    }
    const { error: updateError } = await supabase.from('documents').update(updateData).eq('id', doc.id)
    if (updateError) console.error('[upload] DB UPDATE FAILED:', updateError.message)

    // Auto-create accounting entries (use the matched dossier)
    const ecritures = extraction.ecritures_comptables
    if (Array.isArray(ecritures) && ecritures.length > 0) {
      const journalMap: Record<string, string> = { facture_fournisseur: 'ACH', facture_client: 'VTE', releve_bancaire: 'BNQ', fiche_paie: 'OD', charges_sociales: 'OD' }
      const entries = ecritures
        .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
        .map((e: any) => ({
          dossier_id: finalDossierId, date_ecriture: extraction.date_document || new Date().toISOString().split('T')[0],
          journal: journalMap[typeDocument] || 'OD', numero_piece: extraction.numero_reference || null,
          compte: String(e.compte), libelle: e.libelle || file.name,
          debit: Number(e.debit) || 0, credit: Number(e.credit) || 0, piece_justificative: doc.id,
        }))
      if (entries.length > 0) await supabase.from('ecritures_comptables').insert(entries)
    }

    // Handle bank statement: create/update bank account + store statement
    if (typeDocument === 'releve_bancaire' && extraction.banque) {
      const bankDevise = extraction.devise || 'MUR'
      const bankName = extraction.banque
      const solde = Number(extraction.solde_cloture) || 0

      // Find or create bank account
      // Get the societe_id from the dossier
      const { data: dossierData } = await supabase.from('dossiers').select('societe_id').eq('id', resolvedDossierId).single()
      const bankSocieteId = dossierData?.societe_id

      if (bankSocieteId) {
        // Check if bank account exists
        const { data: existingBank } = await supabase.from('comptes_bancaires')
          .select('id').eq('societe_id', bankSocieteId).eq('banque', bankName).limit(1).single()

        if (existingBank) {
          // Update balance
          await supabase.from('comptes_bancaires').update({
            solde_actuel: solde,
            date_dernier_releve: extraction.periode_fin || new Date().toISOString().split('T')[0],
          }).eq('id', existingBank.id)
        } else {
          // Create new bank account
          await supabase.from('comptes_bancaires').insert({
            societe_id: bankSocieteId,
            banque: bankName,
            nom_compte: extraction.numero_compte || bankName,
            numero_compte: extraction.numero_compte || null,
            devise: bankDevise,
            solde_actuel: solde,
            solde_dernier_releve: solde,
            date_dernier_releve: extraction.periode_fin || new Date().toISOString().split('T')[0],
            actif: true,
          })
        }

        // Store bank statement record
        const { data: bankAccount } = await supabase.from('comptes_bancaires')
          .select('id').eq('societe_id', bankSocieteId).eq('banque', bankName).limit(1).single()

        if (bankAccount) {
          await supabase.from('releves_bancaires').insert({
            compte_bancaire_id: bankAccount.id,
            societe_id: bankSocieteId,
            periode: extraction.periode_fin?.substring(0, 7) || new Date().toISOString().substring(0, 7),
            date_debut: extraction.periode_debut || extraction.periode_fin || new Date().toISOString().split('T')[0],
            date_fin: extraction.periode_fin || new Date().toISOString().split('T')[0],
            solde_ouverture: Number(extraction.solde_ouverture) || 0,
            solde_cloture: solde,
            total_debits: Number(extraction.total_debits) || 0,
            total_credits: Number(extraction.total_credits) || 0,
            document_id: doc.id,
            transactions_json: extraction.transactions || [],
            statut_rapprochement: 'en_attente',
          })
        }
      }
    }

    // Return final state
    const { data: finalDoc } = await supabase.from('documents')
      .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee')
      .eq('id', doc.id).single()

    return NextResponse.json({ document: finalDoc || doc, message: `Classé: ${typeDocument}` })

  } catch (e: any) {
    const errMsg = e?.message || String(e)
    console.error('[upload] FATAL:', errMsg, e?.stack)

    // Try to mark document as error
    if (docId) {
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: errMsg } }).eq('id', docId)
    }

    return NextResponse.json({ error: errMsg, processing_error: errMsg }, { status: 500 })
  }
}
