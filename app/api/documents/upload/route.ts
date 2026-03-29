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

export const maxDuration = 300

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

    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream', // certains xlsx envoyés avec ce type
    ]
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const isXlsx = ext === 'xlsx' || ext === 'xls'
    if (!allowedTypes.includes(file.type) && !isXlsx) {
      return NextResponse.json({ error: `Type non supporté: ${file.type} (.${ext})` }, { status: 400 })
    }
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'Fichier trop volumineux (max 20MB)' }, { status: 400 })

    // Détection doublons par nom + taille
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id, nom_fichier, statut')
      .eq('nom_fichier', file.name)
      .eq('taille_fichier', file.size)
      .limit(1)
      .maybeSingle()
    if (existingDoc && existingDoc.statut === 'traite') {
      return NextResponse.json({
        error: `Doublon détecté : "${file.name}" a déjà été uploadé (ID: ${existingDoc.id}). Utilisez "Réanalyser" pour retraiter ce document.`,
        doublon: true,
        doc_id: existingDoc.id
      }, { status: 409 })
    }
    // Si le document existe mais en erreur ou en_attente, supprimer l'ancien pour permettre le re-upload
    if (existingDoc && existingDoc.statut !== 'traite') {
      await supabase.from('ecritures_comptables').delete().eq('piece_justificative', existingDoc.id).catch(() => {})
      await supabase.from('releves_bancaires').delete().eq('document_id', existingDoc.id).catch(() => {})
      await supabase.from('documents').delete().eq('id', existingDoc.id).catch(() => {})
    }

    // Resolve dossier_id
    let resolvedDossierId = dossierId
    if (!resolvedDossierId) {
      // 1. Si societe_id fourni, chercher un dossier pour cette société (peu importe le client)
      if (societeId) {
        const { data: d } = await supabase.from('dossiers').select('id').eq('societe_id', societeId).limit(1).maybeSingle()
        if (d) { resolvedDossierId = d.id }
      }
      // 2. Sinon chercher un dossier du user (en tant que client)
      if (!resolvedDossierId) {
        const { data: d } = await supabase.from('dossiers').select('id').eq('client_id', user.id).limit(1).maybeSingle()
        if (d) { resolvedDossierId = d.id }
      }
      // 3. Si le user est comptable, chercher un dossier où il est assigné
      if (!resolvedDossierId) {
        const { data: d } = await supabase.from('dossiers').select('id').eq('comptable_id', user.id).limit(1).maybeSingle()
        if (d) { resolvedDossierId = d.id }
      }
      // 4. Dernier recours : créer un dossier personnel
      if (!resolvedDossierId) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
        const { data: newSoc } = await supabase.from('societes')
          .insert({ nom: `${profile?.full_name || user.email} — Personnel`, statut_tva: false }).select('id').single()
        if (newSoc) {
          const { data: nd } = await supabase.from('dossiers')
            .insert({ client_id: user.id, societe_id: newSoc.id, comptable_id: null }).select('id').single()
          resolvedDossierId = nd?.id || null
        }
      }
      if (!resolvedDossierId) return NextResponse.json({ error: 'Impossible de créer un dossier' }, { status: 400 })
    }

    // Read file ONCE
    const fileArrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(fileArrayBuffer).toString('base64')
    const ext2 = file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const typeFichier = ext2 === 'jpg' ? 'jpeg' : ext2 as 'pdf' | 'jpeg' | 'png' | 'xlsx'
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${Date.now()}_${safeFileName}`

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
    const isExcel = ext === 'xlsx' || ext === 'xls'

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
    } else if (isExcel) {
      // Extraire le contenu texte du fichier Excel pour l'envoyer à Claude
      let xlsxText = ''
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(fileArrayBuffer, { type: 'array', cellText: true, cellDates: true })
        for (const sheetName of wb.SheetNames.slice(0, 3)) {
          const ws = wb.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
          xlsxText += `\n=== Feuille: ${sheetName} ===\n${csv.substring(0, 3000)}\n`
        }
      } catch {
        xlsxText = Buffer.from(fileArrayBuffer).toString('utf-8', 0, 5000)
      }
      messageContent = `Analyse ce document Excel comptable et extrais toutes les informations (facture, montants, TVA, dates, fournisseur, client, numéro de facture):\n\n${xlsxText}`
    } else {
      messageContent = 'Analyse ce document:\n' + Buffer.from(fileArrayBuffer).toString('utf-8').substring(0, 5000)
    }

    // Pour les PDFs : détection rapide du type en 1 seul appel si possible
    // Si PDF → tenter détection rapide d'abord (512 tokens)
    let isLikelyBankStatement = false
    if (isPdf && typeof messageContent !== 'string') {
      try {
        const quickDetect = await anthropic.messages.create({
          model: CLAUDE_CONFIG.model,
          max_tokens: 256,
          temperature: 0,
          messages: [{ role: 'user', content: [...(messageContent as any[]), { type: 'text', text: 'Réponds en 1 mot : facture_client, facture_fournisseur, releve_bancaire, fiche_paie, ou autre ?' }] }],
        })
        const quickText = quickDetect.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').toLowerCase()
        isLikelyBankStatement = quickText.includes('releve_bancaire') || quickText.includes('relevé') || quickText.includes('bank')
      } catch { /* continue */ }
    }

    // Si relevé bancaire détecté → aller directement au prompt spécialisé (évite double appel)
    let aiResponse: any
    let parsed: any = {}

    if (isLikelyBankStatement && isPdf) {
      const bankSystemPrompt = getSystemPrompt('releve_bancaire', tauxChange)
      aiResponse = await anthropic.messages.create({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.max_tokens_releve_bancaire,
        temperature: CLAUDE_CONFIG.temperature,
        system: bankSystemPrompt,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Analyse ce releve bancaire complet. Lis TOUTES les lignes sans exception.' },
        ]}],
      })
      const bankText = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      const bankCleaned = bankText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      try {
        const bankParsed = JSON.parse(bankCleaned)
        parsed = { routing: { type_document: 'releve_bancaire', societe: bankParsed.banque || 'MCB', confiance_type: 95 }, extraction: bankParsed }
      } catch { parsed = { routing: { type_document: 'releve_bancaire', confiance_type: 50 }, extraction: {} } }
    } else {
      aiResponse = await anthropic.messages.create({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.max_tokens,
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
      try { parsed = JSON.parse(cleaned) } catch { parsed = { routing: { type_document: 'autre', societe: 'INCONNU' }, extraction: {} } }
    }

    const typeDocument = parsed.routing?.type_document || 'autre'
    const detectedSociete = parsed.routing?.societe || 'INCONNU'
    const confianceType = parsed.routing?.confiance_type || null
    let extraction = parsed.extraction || {}

    // Si le prompt générique a détecté un relevé bancaire mais n'a pas utilisé le prompt spécialisé
    // (isLikelyBankStatement était false), on relance avec le prompt spécialisé pour avoir les transactions
    if (typeDocument === 'releve_bancaire' && !isLikelyBankStatement && isPdf) {
      console.log('[upload] Relevé bancaire détecté via prompt générique → retraitement spécialisé')
      try {
        const bankSystemPrompt = getSystemPrompt('releve_bancaire', tauxChange)
        const bankResponse = await anthropic.messages.create({
          model: CLAUDE_CONFIG.model,
          max_tokens: CLAUDE_CONFIG.max_tokens_releve_bancaire,
          temperature: CLAUDE_CONFIG.temperature,
          system: bankSystemPrompt,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Analyse ce releve bancaire complet. Lis TOUTES les lignes sans exception.' },
          ]}],
        })
        const bankText = bankResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
        const bankCleaned = bankText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        const bankParsed = JSON.parse(bankCleaned)
        // Merge: garder le routing du premier appel, remplacer l'extraction par la version spécialisée
        extraction = bankParsed
        if (!extraction.banque && detectedSociete !== 'INCONNU') extraction.banque = detectedSociete
      } catch (e) {
        console.warn('[upload] Retraitement spécialisé relevé bancaire échoué, on garde extraction générique:', e)
      }
    }

    // Relevé bancaire : si transactions[] est vide mais lignes[] existe, convertir
    if (typeDocument === 'releve_bancaire') {
      const rawLignes: any[] = extraction.lignes || []
      const rawTransactions: any[] = extraction.transactions || []
      if (rawTransactions.length === 0 && rawLignes.length > 0) {
        extraction.transactions = rawLignes.map((l: any) => ({
          date: l.date || '',
          libelle: l.libelle || '',
          debit: l.sens === 'debit' ? (Number(l.montant) || 0) : 0,
          credit: l.sens === 'credit' ? (Number(l.montant) || 0) : 0,
          solde_apres: null,
          tiers_detecte: l.tiers_detecte || null,
          compte_comptable: l.sens === 'debit' ? (l.compte_debit || null) : (l.compte_credit || null),
          statut: (l.confiance || 0) >= 70 ? 'identifie' : ((l.confiance || 0) >= 40 ? 'a_verifier' : 'non_identifie'),
        }))
      }
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
    if (typeDocument === 'releve_bancaire') {
      // Ensure we have at least a bank name (fallback to detected société name)
      if (!extraction.banque && !extraction.compte_bancaire) {
        extraction.banque = detectedSociete !== 'INCONNU' ? detectedSociete : 'Banque'
      }
      const bankDevise = extraction.devise || 'MUR'
      const bankName = extraction.banque || extraction.compte_bancaire || 'Banque'
      // Support both field names: solde_cloture (prompt inline) and solde_fin (SYSTEM_PROMPT_RELEVE_BANCAIRE)
      const solde = Number(extraction.solde_cloture) || Number(extraction.solde_fin) || 0

      // Get the societe_id: prefer explicit societeId from form, then from dossier
      let bankSocieteId = societeId || null
      if (!bankSocieteId) {
        const { data: dossierData } = await supabase.from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
        bankSocieteId = dossierData?.societe_id || null
      }
      console.log(`[upload] Bank statement: bankName=${bankName}, bankSocieteId=${bankSocieteId}, devise=${bankDevise}, solde=${solde}`)

      if (bankSocieteId) {
        // Normalize date fields: support all naming variants from both prompts
        // periode_fin (inline) | date_fin | periode (YYYY-MM → YYYY-MM-last_day)
        let normPeriodeFin = extraction.periode_fin || extraction.date_fin || null
        if (!normPeriodeFin && extraction.periode) {
          // Convert YYYY-MM → YYYY-MM-28 (safe last day approximation)
          const p = extraction.periode
          if (/^\d{4}-\d{2}$/.test(p)) {
            const [y, m] = p.split('-').map(Number)
            const lastDay = new Date(y, m, 0).getDate()
            normPeriodeFin = `${p}-${String(lastDay).padStart(2, '0')}`
          } else {
            normPeriodeFin = p
          }
        }
        if (!normPeriodeFin) normPeriodeFin = new Date().toISOString().split('T')[0]

        let normPeriodeDebut = extraction.periode_debut || extraction.date_debut || null
        if (!normPeriodeDebut && extraction.periode) {
          if (/^\d{4}-\d{2}$/.test(extraction.periode)) {
            normPeriodeDebut = `${extraction.periode}-01`
          }
        }
        if (!normPeriodeDebut) normPeriodeDebut = normPeriodeFin

        const normNumeroCompte = extraction.numero_compte || extraction.compte_bancaire || null

        // Check if bank account exists
        const { data: existingBank } = await supabase.from('comptes_bancaires')
          .select('id').eq('societe_id', bankSocieteId).eq('banque', bankName).limit(1).maybeSingle()

        if (existingBank) {
          // Update balance
          console.log(`[upload] Updating existing bank account ${existingBank.id}: solde=${solde}, date=${normPeriodeFin}`)
          await supabase.from('comptes_bancaires').update({
            solde_actuel: solde,
            date_dernier_releve: normPeriodeFin,
          }).eq('id', existingBank.id)
        } else {
          // Create new bank account
          console.log(`[upload] Creating new bank account: ${bankName} for societe=${bankSocieteId}`)
          const { error: bankInsertError } = await supabase.from('comptes_bancaires').insert({
            societe_id: bankSocieteId,
            banque: bankName,
            nom_compte: normNumeroCompte || bankName,
            numero_compte: normNumeroCompte,
            devise: bankDevise,
            solde_actuel: solde,
            solde_dernier_releve: solde,
            date_dernier_releve: normPeriodeFin,
            actif: true,
          })
          if (bankInsertError) {
            console.error('[upload] comptes_bancaires insert FAILED:', bankInsertError.message)
          }
        }

        // Store bank statement record
        const { data: bankAccount } = await supabase.from('comptes_bancaires')
          .select('id').eq('societe_id', bankSocieteId).eq('banque', bankName).limit(1).maybeSingle()

        if (bankAccount) {
          // Normalize transactions: support both "transactions[]" (prompt inline)
          // and "lignes[]" (SYSTEM_PROMPT_RELEVE_BANCAIRE from getSystemPrompt)
          const rawTransactions: any[] = extraction.transactions || []
          const rawLignes: any[] = extraction.lignes || []

          // Convert lignes[] format → transactions[] format
          const lignesAsTransactions = rawLignes.map((l: any) => ({
            date: l.date || '',
            libelle: l.libelle || '',
            debit: l.sens === 'debit' ? (Number(l.montant) || 0) : 0,
            credit: l.sens === 'credit' ? (Number(l.montant) || 0) : 0,
            solde_apres: null,
            tiers_detecte: l.tiers_detecte || null,
            compte_comptable: l.sens === 'debit' ? (l.compte_debit || null) : (l.compte_credit || null),
            statut: l.confiance >= 70 ? 'identifie' : (l.confiance >= 40 ? 'a_verifier' : 'non_identifie'),
          }))

          // Merge: prefer explicit transactions[], fall back to converted lignes[]
          const normalizedTransactions = rawTransactions.length > 0
            ? rawTransactions
            : lignesAsTransactions

          // Compute totals if missing
          const totalDebits = Number(extraction.total_debits) ||
            normalizedTransactions.reduce((s: number, t: any) => s + (Number(t.debit) || 0), 0)
          const totalCredits = Number(extraction.total_credits) ||
            normalizedTransactions.reduce((s: number, t: any) => s + (Number(t.credit) || 0), 0)

          // Detect ecart
          const soldeOuverture = Number(extraction.solde_ouverture) || Number(extraction.solde_debut) || 0
          const soldeCloture = solde || Number(extraction.solde_fin) || 0
          const ecartSolde = Math.abs((soldeOuverture + totalCredits - totalDebits) - soldeCloture)
          const statutRapprochement = ecartSolde > 1 ? 'ecart_detecte' : 'en_attente'

          const { error: releveError } = await supabase.from('releves_bancaires').insert({
            compte_bancaire_id: bankAccount.id,
            societe_id: bankSocieteId,
            periode: normPeriodeFin.substring(0, 7),
            date_debut: normPeriodeDebut,
            date_fin: normPeriodeFin,
            solde_ouverture: soldeOuverture,
            solde_cloture: soldeCloture,
            total_debits: totalDebits,
            total_credits: totalCredits,
            document_id: doc.id,
            transactions_json: normalizedTransactions,
            statut_rapprochement: statutRapprochement,
          })
          if (releveError) {
            console.error('[upload] releves_bancaires insert FAILED:', releveError.message, releveError.details)
          } else {
            console.log(`[upload] releve_bancaire stored: ${normalizedTransactions.length} transactions, societe=${bankSocieteId}`)
          }
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
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: errMsg } }).eq('id', docId).catch(() => {})
    }

    return NextResponse.json({ error: errMsg, processing_error: errMsg }, { status: 500 })
  }
}
