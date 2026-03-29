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
      await supabase.from('ecritures_comptables').delete().eq('piece_justificative', existingDoc.id)
      await supabase.from('releves_bancaires').delete().eq('document_id', existingDoc.id)
      await supabase.from('documents').delete().eq('id', existingDoc.id)
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

    // Fetch live exchange rates — direct from lib (not via HTTP to avoid self-call issues)
    const { getTauxChange, fetchAndStoreRates } = await import('@/lib/taux-change')
    let tauxChange = await getTauxChange()
    // If we only got fallback rates (no DB data), try to fetch from API and store
    if (!tauxChange.EUR || tauxChange.EUR === 46.50) {
      const fresh = await fetchAndStoreRates()
      if (fresh.success) tauxChange = fresh.rates
    }
    console.log('[upload] Exchange rates:', JSON.stringify(tauxChange))

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
        const quickStream = anthropic.messages.stream({
          model: CLAUDE_CONFIG.model,
          max_tokens: 256,
          temperature: 0,
          messages: [{ role: 'user', content: [...(messageContent as any[]), { type: 'text', text: 'Réponds en 1 mot : facture_client, facture_fournisseur, releve_bancaire, fiche_paie, ou autre ?' }] }],
        })
        const quickDetect = await quickStream.finalMessage()
        const quickText = quickDetect.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').toLowerCase()
        isLikelyBankStatement = quickText.includes('releve_bancaire') || quickText.includes('relevé') || quickText.includes('bank')
      } catch { /* continue */ }
    }

    // Si relevé bancaire détecté → aller directement au prompt spécialisé (évite double appel)
    let aiResponse: any
    let parsed: any = {}

    if (isLikelyBankStatement && isPdf) {
      const bankSystemPrompt = getSystemPrompt('releve_bancaire', tauxChange)
      const bankStream = anthropic.messages.stream({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.max_tokens_releve_bancaire,
        temperature: CLAUDE_CONFIG.temperature,
        system: bankSystemPrompt,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Retourne UNIQUEMENT un JSON valide (pas de markdown). Lis TOUTES les lignes du releve sans exception.' },
        ]}],
      })
      aiResponse = await bankStream.finalMessage()
      const bankText = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      console.log('[upload] Raw Claude bank response length:', bankText.length, 'first 500 chars:', bankText.substring(0, 500))

      // Robust JSON extraction: try multiple strategies
      let bankParsed: any = null

      // Strategy 1: direct parse (response is pure JSON)
      try { bankParsed = JSON.parse(bankText.trim()) } catch {}

      // Strategy 2: extract from code fences ```json ... ```
      if (!bankParsed) {
        const fenceMatch = bankText.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (fenceMatch) {
          try { bankParsed = JSON.parse(fenceMatch[1].trim()) } catch {}
        }
      }

      // Strategy 3: find first { to last } in text
      if (!bankParsed) {
        const firstBrace = bankText.indexOf('{')
        const lastBrace = bankText.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try { bankParsed = JSON.parse(bankText.substring(firstBrace, lastBrace + 1)) } catch {}
        }
      }

      // Strategy 4: JSON truncated by token limit — try to repair
      if (!bankParsed) {
        const firstBrace = bankText.indexOf('{')
        if (firstBrace !== -1) {
          let jsonCandidate = bankText.substring(firstBrace)
          // Remove trailing markdown
          jsonCandidate = jsonCandidate.replace(/```\s*$/, '').trim()
          // Count open/close braces and brackets to close them
          let openBraces = 0, openBrackets = 0
          let inString = false, escaped = false
          for (const ch of jsonCandidate) {
            if (escaped) { escaped = false; continue }
            if (ch === '\\') { escaped = true; continue }
            if (ch === '"') { inString = !inString; continue }
            if (inString) continue
            if (ch === '{') openBraces++
            if (ch === '}') openBraces--
            if (ch === '[') openBrackets++
            if (ch === ']') openBrackets--
          }
          // Remove trailing incomplete value (after last comma)
          if (openBraces > 0 || openBrackets > 0) {
            jsonCandidate = jsonCandidate.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '')
            jsonCandidate = jsonCandidate.replace(/,\s*\{[^}]*$/, '')
            jsonCandidate = jsonCandidate.replace(/,\s*$/, '')
          }
          // Close unclosed brackets and braces
          for (let i = 0; i < openBrackets; i++) jsonCandidate += ']'
          for (let i = 0; i < openBraces; i++) jsonCandidate += '}'
          try {
            bankParsed = JSON.parse(jsonCandidate)
            console.log('[upload] Bank JSON repaired from truncated response')
          } catch {}
        }
      }

      if (bankParsed && typeof bankParsed === 'object') {
        console.log('[upload] Bank JSON parsed OK. Keys:', Object.keys(bankParsed).join(', '),
          'lignes:', Array.isArray(bankParsed.lignes) ? bankParsed.lignes.length : 0,
          'transactions:', Array.isArray(bankParsed.transactions) ? bankParsed.transactions.length : 0)
        parsed = { routing: { type_document: 'releve_bancaire', societe: bankParsed.banque || 'MCB', confiance_type: 95 }, extraction: bankParsed }
      } else {
        console.error('[upload] FAILED to parse bank JSON. Raw text:', bankText.substring(0, 1000))
        parsed = {
          routing: { type_document: 'releve_bancaire', confiance_type: 20 },
          extraction: {},
          _raw_response: bankText.substring(0, 2000),
        }
      }
    } else {
      const genericStream = anthropic.messages.stream({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.max_tokens,
        temperature: CLAUDE_CONFIG.temperature,
        system: injectTauxChange(`Tu es un expert-comptable mauricien. Analyse ce document et retourne UNIQUEMENT un JSON valide (pas de markdown, pas de backticks).

=== DETECTION DU TYPE ===
Determine d'abord le type: facture_fournisseur, facture_client, releve_bancaire, fiche_paie, charges_sociales, contrat, ou autre.

=== REGLES PAR TYPE ===

--- FACTURE FOURNISSEUR ---
Format: {"routing":{"societe":"<nom>","type_document":"facture_fournisseur","confiance_type":0-100},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"EUR|USD|GBP|MUR|AUD","montant_ht":0,"montant_tva":0,"montant_ttc":0,"taux_tva":15,"tva_exonere":false,"tva_applicable":true,"fournisseur_vat_number":"","analyse_tva":"","lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"6xx","libelle":"","debit":0,"credit":0}]}}
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

ANALYSE TVA FOURNISSEUR — OBLIGATOIRE:
1. Chercher sur la facture: numero TVA MRA, mention "VAT", "TVA", "Tax", taux TVA, montant TVA
2. Si numero TVA MRA present ET montant TVA > 0: tva_applicable=true, tva_exonere=false, taux_tva=15
3. Si PAS de numero TVA MRA ou TVA=0 ou mention "exempt"/"exonere"/"zero-rated": tva_applicable=false, tva_exonere=true, taux_tva=0
4. Si facture etrangere (EUR/USD/GBP) sans TVA locale: tva_exonere=true (reverse charge possible)
5. Si montant_tva=0 mais taux_tva=15: VERIFIER — probablement erreur, mettre montant_tva = montant_ht * 0.15
6. Remplir analyse_tva avec: "TVA 15% applicable — VAT Number: XXXXX" ou "Pas de TVA — fournisseur non enregistre" ou "Export — zero-rated"

Ecritures AVEC TVA: debit 6xx (charge HT) + debit 4456 (TVA deductible) / credit 401 (TTC)
Ecritures SANS TVA: debit 6xx (charge = TTC) / credit 401 (TTC). PAS de 4456.

--- FACTURE CLIENT ---
Format: {"routing":{"societe":"<nom>","type_document":"facture_client","confiance_type":0-100},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"EUR|USD|GBP|MUR|AUD","montant_ht":0,"montant_tva":0,"montant_ttc":0,"taux_tva":15,"tva_applicable":true,"tva_exonere":false,"type_client":"B2B|B2C","analyse_tva":"","lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"7xx","libelle":"","debit":0,"credit":0}]}}
Comptes de produits:
- 706: Prestations de services (telemedicine, BPO, consulting)
- 707: Ventes de marchandises
- 753: Commissions et courtages (NHS S2 referrals)
- 701: Ventes de produits finis

ANALYSE TVA CLIENT — OBLIGATOIRE:
1. Chercher sur la facture: numero TVA emetteur, mention TVA, taux, montant TVA
2. Vente locale Maurice avec TVA: tva_applicable=true, taux_tva=15, TVA collectee 4457
3. Export de services hors Maurice: tva_applicable=false, tva_exonere=true, taux_tva=0 (zero-rated)
4. Vente intra-EU depuis Malte: regles TVA EU applicables
5. Si montant_tva=0 et vente locale: SIGNALER "Attention: pas de TVA sur vente locale"
6. Remplir analyse_tva: "TVA 15% collectee" ou "Export zero-rated" ou "Exonere — service international"

Ecritures AVEC TVA: debit 411 (TTC) / credit 7xx (HT) + credit 4457 (TVA collectee)
Ecritures SANS TVA: debit 411 (TTC=HT) / credit 7xx (HT). PAS de 4457.

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
      aiResponse = await genericStream.finalMessage()

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
        const bankStream2 = anthropic.messages.stream({
          model: CLAUDE_CONFIG.model,
          max_tokens: CLAUDE_CONFIG.max_tokens_releve_bancaire,
          temperature: CLAUDE_CONFIG.temperature,
          system: bankSystemPrompt,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Retourne UNIQUEMENT un JSON valide (pas de markdown). Lis TOUTES les lignes du releve sans exception.' },
          ]}],
        })
        const bankResponse = await bankStream2.finalMessage()
        const bankText = bankResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
        let bankParsed: any = null
        const bankCleaned = bankText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        try { bankParsed = JSON.parse(bankCleaned) } catch {}
        if (!bankParsed) {
          const m = bankText.match(/\{[\s\S]*\}/)
          if (m) try { bankParsed = JSON.parse(m[0]) } catch {}
        }
        if (bankParsed) {
          extraction = bankParsed
          if (!extraction.banque && detectedSociete !== 'INCONNU') extraction.banque = detectedSociete
        }
      } catch (e) {
        console.warn('[upload] Retraitement spécialisé relevé bancaire échoué:', e)
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
      n8n_result: {
        routing: parsed.routing,
        extraction,
        metadata: { model: CLAUDE_CONFIG.model, processed_at: new Date().toISOString() },
        ...(parsed._raw_response ? { _raw_response: parsed._raw_response } : {}),
      },
    }
    const { error: updateError } = await supabase.from('documents').update(updateData).eq('id', doc.id)
    if (updateError) console.error('[upload] DB UPDATE FAILED:', updateError.message)

    // Auto-create accounting entries (use the matched dossier)
    const ecritures = extraction.ecritures_comptables
    if (Array.isArray(ecritures) && ecritures.length > 0) {
      const journalMap: Record<string, string> = { facture_fournisseur: 'ACH', facture_client: 'VTE', releve_bancaire: 'BNQ', fiche_paie: 'OD', charges_sociales: 'OD' }

      // Determine the correct date based on document type
      let dateEcriture = extraction.date_document || extraction.date_facture || null
      if (!dateEcriture && typeDocument === 'releve_bancaire') {
        dateEcriture = extraction.periode_fin || extraction.date_fin || extraction.periode_debut || extraction.date_debut || null
      }
      if (!dateEcriture) dateEcriture = new Date().toISOString().split('T')[0]

      const entries = ecritures
        .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
        .map((e: any) => ({
          dossier_id: finalDossierId,
          // Use transaction-level date if available, otherwise document-level date
          date_ecriture: e.date || dateEcriture,
          journal: journalMap[typeDocument] || 'OD',
          numero_piece: e.reference || extraction.numero_reference || null,
          compte: String(e.compte), libelle: e.libelle || file.name,
          debit: Number(e.debit) || 0, credit: Number(e.credit) || 0, piece_justificative: doc.id,
        }))
      if (entries.length > 0) await supabase.from('ecritures_comptables').insert(entries)
    }

    // Auto-create facture record for client/fournisseur invoices
    if ((typeDocument === 'facture_client' || typeDocument === 'facture_fournisseur') && finalDossierId) {
      const { data: dossierForFacture } = await supabase
        .from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
      const factureSocieteId = societeId || dossierForFacture?.societe_id

      if (factureSocieteId) {
        const montantHT = Number(extraction.montant_ht) || 0
        const montantTVA = Number(extraction.montant_tva) || 0
        const montantTTC = Number(extraction.montant_ttc) || montantHT + montantTVA
        const devise = extraction.devise || 'MUR'
        const fxRate = (devise !== 'MUR') ? (tauxChange[devise] || 1) : 1

        // Vérification TVA
        const tvaApplicable = extraction.tva_applicable !== false && !extraction.tva_exonere
        const tauxTva = tvaApplicable ? (Number(extraction.taux_tva) || 15) : 0
        let montantTVAFinal = montantTVA

        // Si TVA applicable mais montant_tva=0, recalculer
        if (tvaApplicable && montantTVA === 0 && montantHT > 0) {
          montantTVAFinal = Math.round(montantHT * tauxTva / 100 * 100) / 100
          console.log(`[upload] TVA recalculée: ${montantHT} × ${tauxTva}% = ${montantTVAFinal}`)
        }
        // Si TVA non applicable, forcer à 0
        if (!tvaApplicable) {
          montantTVAFinal = 0
        }

        const montantTTCFinal = montantTVAFinal > 0 ? montantHT + montantTVAFinal : montantTTC

        console.log(`[upload] Facture TVA: applicable=${tvaApplicable}, taux=${tauxTva}%, HT=${montantHT}, TVA=${montantTVAFinal}, TTC=${montantTTCFinal}, devise=${devise}, analyse="${extraction.analyse_tva || 'non fournie'}"`)

        const factureData: Record<string, unknown> = {
          societe_id: factureSocieteId,
          dossier_id: finalDossierId,
          numero_facture: extraction.numero_reference || extraction.numero_facture || null,
          type_facture: typeDocument === 'facture_client' ? 'client' : 'fournisseur',
          tiers: typeDocument === 'facture_client'
            ? (extraction.destinataire || extraction.client || null)
            : (extraction.emetteur || extraction.fournisseur || null),
          description: extraction.description || extraction.objet || file.name,
          date_facture: extraction.date_document || extraction.date_facture || new Date().toISOString().split('T')[0],
          date_echeance: extraction.date_echeance || null,
          devise,
          taux_change: fxRate,
          montant_ht: montantHT,
          montant_tva: montantTVAFinal,
          montant_ttc: montantTTCFinal,
          taux_tva: tauxTva,
          montant_mur: Math.round(montantTTCFinal * fxRate * 100) / 100,
          statut: 'en_attente',
          document_id: doc.id,
          notes: extraction.analyse_tva || (tvaApplicable ? `TVA ${tauxTva}% applicable` : 'Pas de TVA'),
        }

        const { error: factureError } = await supabase.from('factures').insert(factureData)
        if (factureError) {
          console.error('[upload] facture insert error:', factureError.message)
        } else {
          console.log(`[upload] Facture ${typeDocument} created: ${extraction.numero_reference || 'sans numéro'} — ${montantTTC} ${devise}`)
        }
      }
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

        // Check if bank account exists — match by numero_compte first, then by banque+devise
        let existingBank: any = null
        if (normNumeroCompte) {
          const { data: byNum } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
          existingBank = byNum
        }
        if (!existingBank) {
          const { data: byName } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
          existingBank = byName
        }

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

        // Store bank statement record — find the account we just created/updated
        let bankAccount: any = null
        if (normNumeroCompte) {
          const { data: byNum } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
          bankAccount = byNum
        }
        if (!bankAccount) {
          const { data: byName } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
          bankAccount = byName
        }

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
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: errMsg } }).eq('id', docId)
    }

    return NextResponse.json({ error: errMsg, processing_error: errMsg }, { status: 500 })
  }
}
