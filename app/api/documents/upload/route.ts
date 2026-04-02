import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSystemPrompt, injectTauxChange, CLAUDE_CONFIG } from '@/lib/ai/prompts'
import { createHash } from 'crypto'

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

    // Détection doublons par nom + taille, scopé par utilisateur
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id, nom_fichier, statut')
      .eq('nom_fichier', file.name)
      .eq('taille_fichier', file.size)
      .eq('uploaded_by', user.id)
      .limit(1)
      .maybeSingle()
    if (existingDoc && existingDoc.statut === 'traite') {
      return NextResponse.json({
        error: `Doublon détecté : "${file.name}" a déjà été uploadé (ID: ${existingDoc.id}). Utilisez "Réanalyser" pour retraiter ce document.`,
        doublon: true,
        doc_id: existingDoc.id
      }, { status: 409 })
    }
    // Si le document existe mais en erreur ou en_attente, demander confirmation
    if (existingDoc && existingDoc.statut !== 'traite') {
      return NextResponse.json({
        doublon: true,
        statut: existingDoc.statut,
        message: "Un document identique existe déjà avec des erreurs de traitement. Voulez-vous le retraiter ?",
        existingId: existingDoc.id,
      }, { status: 409 })
    }

    // Resolve dossier_id — IMPORTANT: use the société's dossier, not the user's personal dossier
    let resolvedDossierId = dossierId
    if (!resolvedDossierId) {
      // 1. Si societe_id fourni, chercher un dossier pour cette société
      if (societeId) {
        const { data: d } = await supabase.from('dossiers').select('id').eq('societe_id', societeId).limit(1).maybeSingle()
        if (d) { resolvedDossierId = d.id }
      }
      // 2. Trouver la société du user (via profile.societe_id ou user_societes)
      if (!resolvedDossierId) {
        const { data: profile } = await supabase.from('profiles').select('societe_id').eq('id', user.id).maybeSingle()
        if (profile?.societe_id) {
          // Chercher un dossier existant pour CETTE société (peu importe le client_id)
          const { data: d } = await supabase.from('dossiers').select('id').eq('societe_id', profile.societe_id).limit(1).maybeSingle()
          if (d) { resolvedDossierId = d.id }
        }
      }
      // 3. Via user_societes
      if (!resolvedDossierId) {
        const { data: us } = await supabase.from('user_societes').select('societe_id').eq('user_id', user.id).limit(1).maybeSingle()
        if (us?.societe_id) {
          const { data: d } = await supabase.from('dossiers').select('id').eq('societe_id', us.societe_id).limit(1).maybeSingle()
          if (d) { resolvedDossierId = d.id }
        }
      }
      // 4. Chercher un dossier du user (en tant que client)
      if (!resolvedDossierId) {
        const { data: d } = await supabase.from('dossiers').select('id').eq('client_id', user.id).limit(1).maybeSingle()
        if (d) { resolvedDossierId = d.id }
      }
      // 5. Si le user est comptable
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
    const fileBuffer = Buffer.from(fileArrayBuffer)
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex')
    const base64 = fileBuffer.toString('base64')

    // Hash-based dedup: check if identical content already exists in same dossier
    const { data: hashDup } = await supabase
      .from('documents')
      .select('id, nom_fichier, statut')
      .eq('file_hash', fileHash)
      .eq('uploaded_by', user.id)
      .limit(1)
      .maybeSingle()
    if (hashDup) {
      if (hashDup.statut === 'traite') {
        return NextResponse.json({
          error: `Doublon détecté : un fichier identique existe déjà ("${hashDup.nom_fichier}").`,
          doublon: true,
          doc_id: hashDup.id,
        }, { status: 409 })
      } else {
        return NextResponse.json({
          doublon: true,
          statut: hashDup.statut,
          message: "Un fichier identique existe déjà avec des erreurs de traitement. Voulez-vous le retraiter ?",
          existingId: hashDup.id,
        }, { status: 409 })
      }
    }
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
      file_hash: fileHash,
    }).select().single()
    if (docError) return NextResponse.json({ error: `DB insert: ${docError.message}` }, { status: 500 })
    docId = doc.id

    // === AI PROCESSING ===
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 3 })

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

    let typeDocument = ''
    let extraction: any = {}
    let parsed: any = {}
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
      // Extraire le contenu du fichier Excel
      let xlsxText = ''
      let xlsxRows: any[][] = []
      let xlsxHeaders: string[] = []
      let isPayrollDetected = false

      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(fileArrayBuffer, { type: 'array', cellText: true, cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
        xlsxText = csv

        // Parse rows for direct processing
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
        xlsxRows = jsonData

        // Detect payroll report by headers
        const headerRow = jsonData.slice(0, 5).find(row =>
          row.some((c: any) => String(c).toLowerCase().match(/salary|salaire|net pay|basic|csg|paye|nsf|payroll/))
        )
        if (headerRow) {
          xlsxHeaders = headerRow.map((c: any) => String(c).trim())
          isPayrollDetected = true
          console.log(`[upload] Excel payroll detected locally. Headers: ${xlsxHeaders.slice(0, 10).join(', ')}`)
        }

        if (xlsxText.length > 15000) xlsxText = xlsxText.substring(0, 15000)
      } catch {
        xlsxText = Buffer.from(fileArrayBuffer).toString('utf-8', 0, 5000)
      }

      // If payroll detected, process locally without heavy AI call
      if (isPayrollDetected && xlsxRows.length > 3) {
        console.log(`[upload] Processing payroll Excel locally: ${xlsxRows.length} rows`)

        // Find header row index
        const hIdx = xlsxRows.findIndex(row =>
          row.some((c: any) => String(c).toLowerCase().match(/salary|salaire|basic|net pay/))
        )
        const headers = xlsxRows[hIdx]?.map((c: any) => String(c).toLowerCase().trim()) || []
        const dataRows = xlsxRows.slice(hIdx + 1).filter(row => row.some((c: any) => c !== '' && c !== null))

        // Map column indices
        const col = (patterns: string[]) => headers.findIndex(h => patterns.some(p => h.includes(p)))
        const iCode = col(['code'])
        const iNom = col(['last name', 'nom', 'name'])
        const iPrenom = col(['first name', 'prenom', 'prénom'])
        const iPoste = col(['job', 'poste', 'fonction', 'position'])
        const iDept = col(['department', 'departement', 'département'])
        const iArrDate = col(['arr. date', 'arr date', 'date arrivee', 'date embauche', 'hire date'])
        const iDepDate = col(['dep. date', 'dep date', 'date depart', 'departure'])
        const iBasic = col(['basic salary', 'salaire base', 'basic', '1000'])
        const iOT15 = col(['overtime', 'ot', '@1.5', '1100'])
        const iOT2 = col(['@2x', 'overtime @2', '1150'])
        const iSpecial = col(['special', 'allowance', '3010'])
        const iInternet = col(['internet', '3170'])
        const iPrime = col(['prime', 'production', '3200'])
        const iElec = col(['electricity', 'electricite', '3250'])
        const iMeal = col(['meal', 'repas', '3510'])
        const iTotalPay = col(['total payments', 'total pay', 'brut'])
        const iAbsence = col(['absence', 'deductions', '3900'])
        const iCSG = col(['csg', '4010'])
        const iNSF = col(['nsf', '4100'])
        const iPAYE = col(['paye', '5000'])
        const iTotalDed = col(['total deductions', 'total ded'])
        const iERCSG = col(['er] csg', 'er csg', '[er] 4010'])
        const iERNSF = col(['er] nsf', 'er nsf', '[er] 4100'])
        const iERLevy = col(['er] 4200', 'er levy', 'levy', '[er] levy'])
        const iERPRGF = col(['er] 7900', 'er prgf', 'prgf', '[er] 7900'])
        const iTotalER = col(['total er', 'total employer'])
        const iNetPay = col(['net pay', 'net', 'salaire net'])

        const getVal = (row: any[], idx: number) => idx >= 0 && idx < row.length ? Number(String(row[idx]).replace(/[^\d.-]/g, '')) || 0 : 0
        const getStr = (row: any[], idx: number) => idx >= 0 && idx < row.length ? String(row[idx] || '').trim() : ''

        const employes = dataRows
          .filter(row => getStr(row, iNom) || getStr(row, iPrenom))
          .filter(row => getStr(row, iNom).toLowerCase() !== 'total')
          .map(row => ({
            code: getStr(row, iCode),
            nom: getStr(row, iNom),
            prenom: getStr(row, iPrenom),
            poste: getStr(row, iPoste),
            departement: getStr(row, iDept),
            date_arrivee: getStr(row, iArrDate),
            date_depart: getStr(row, iDepDate),
            salaire_base: getVal(row, iBasic),
            overtime_1_5x: getVal(row, iOT15),
            overtime_2x: getVal(row, iOT2),
            special_allowance: getVal(row, iSpecial),
            internet_allowance: getVal(row, iInternet),
            prime_production: getVal(row, iPrime),
            electricity_allowance: getVal(row, iElec),
            meal_allowance: getVal(row, iMeal),
            total_payments: getVal(row, iTotalPay),
            absence_deductions: getVal(row, iAbsence),
            csg: getVal(row, iCSG),
            nsf: getVal(row, iNSF),
            paye: getVal(row, iPAYE),
            total_deductions: getVal(row, iTotalDed),
            er_csg: getVal(row, iERCSG),
            er_nsf: getVal(row, iERNSF),
            er_levy: getVal(row, iERLevy),
            er_prgf: getVal(row, iERPRGF),
            total_er_contributions: getVal(row, iTotalER),
            net_pay: getVal(row, iNetPay),
          }))

        // Detect period from filename or content
        const periodMatch = file.name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{4})/i)
          || xlsxText.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{4})/i)
        const monthMap: Record<string, string> = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' }
        const detectedPeriode = periodMatch
          ? `${periodMatch[2]}-${monthMap[periodMatch[1].toLowerCase().slice(0,3)] || '01'}`
          : new Date().toISOString().slice(0, 7)

        // Detect employer from content
        const employerMatch = xlsxText.match(/^([A-Z][A-Za-z\s]+(?:Ltd|Limited|Sarl|SAS)?)/m)
        const detectedEmployer = employerMatch?.[1]?.trim() || detectedSociete || 'INCONNU'

        parsed = {
          routing: { type_document: 'payroll_report', societe: detectedEmployer, confiance_type: 95 },
          extraction: { employeur: detectedEmployer, periode: detectedPeriode, employes },
        }
        typeDocument = 'payroll_report'
        extraction = parsed.extraction
        console.log(`[upload] Payroll parsed locally: ${employes.length} employees, period ${detectedPeriode}`)

        messageContent = null // Skip AI call
      } else {
        messageContent = `Analyse ce document Excel comptable. Si c'est un Payroll Report avec PLUSIEURS employés, retourne type_document="payroll_report".\n\nContenu (premiers 15K):\n${xlsxText}`
      }
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
    if (!parsed.routing) parsed = {}

    // Skip AI if already parsed locally (e.g., Excel payroll)
    if (messageContent === null) {
      console.log('[upload] Skipping AI call — already parsed locally')
    } else if (isLikelyBankStatement && isPdf) {
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
        parsed = { routing: { type_document: 'releve_bancaire', societe: bankParsed.banque || 'INCONNU', confiance_type: 95 }, extraction: bankParsed }
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
Determine d'abord le type: facture_fournisseur, facture_client, releve_bancaire, fiche_paie, payroll_report, charges_sociales, contrat, ou autre.
IMPORTANT: Si le document contient un TABLEAU avec PLUSIEURS employes (Payroll Report, etat de salaire, bulk salary), le type est "payroll_report" (PAS "fiche_paie").

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

REGLE ECRITURES FACTURE FOURNISSEUR:
Generer EXACTEMENT 2 ecritures (ou 3 si TVA):
- 1 ecriture debit 6xx = montant_ht TOTAL (pas les sous-lignes)
- Si TVA applicable: 1 ecriture debit 4456 = montant_tva TOTAL
- 1 ecriture credit 401 = montant_ttc TOTAL
NE PAS generer une ecriture par ligne de detail de la facture.

--- FACTURE CLIENT ---
Format: {"routing":{"societe":"<nom>","type_document":"facture_client","confiance_type":0-100},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"EUR|USD|GBP|MUR|AUD","montant_ht":0,"montant_tva":0,"montant_ttc":0,"taux_tva":15,"tva_applicable":true,"tva_exonere":false,"type_client":"B2B|B2C","analyse_tva":"","lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"7xx","libelle":"","debit":0,"credit":0}]}}
Comptes de produits:
- 706: Prestations de services (telemedicine, BPO, consulting)
- 707: Ventes de marchandises
- 753: Commissions et courtages (NHS S2 referrals)
- 701: Ventes de produits finis

REGLE ECRITURES FACTURE CLIENT:
Generer EXACTEMENT 2 ecritures (ou 3 si TVA):
- 1 ecriture debit 411 = montant_ttc TOTAL (pas les sous-lignes)
- 1 ecriture credit 7xx = montant_ht TOTAL
- Si TVA applicable: 1 ecriture credit 4457 = montant_tva TOTAL
NE PAS generer une ecriture par ligne de detail de la facture.

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
Format: {"routing":{"societe":"<employeur>","type_document":"fiche_paie","confiance_type":0-100},"extraction":{"employe":"<NOM COMPLET>","employeur":"","date_document":"YYYY-MM-DD","periode":"YYYY-MM","poste":"","fonction":"","nic":"","npf":"","date_embauche":"YYYY-MM-DD","salaire_base":0,"salaire_brut":0,"salaire_net":0,"transport_allowance":0,"heures_sup_montant":0,"csg_salarie":0,"csg_patronal":0,"npf_salarie_3pct":0,"npf_patronal_6pct":0,"hrdc_1pct":0,"training_levy":0,"paye":0,"nps_salarie":0,"nps_employeur":0,"nsf_salarie":0,"nsf_patronal":0,"cotisations_salariales":0,"cotisations_patronales":0,"compte_bancaire_employe":"","banque_employe":"","ecritures_comptables":[{"compte":"641|421|431|444|432|645","libelle":"","debit":0,"credit":0}]}}
IMPORTANT FICHE PAIE: Extraire NOM COMPLET employe, NIC, NPF, date embauche, poste, banque — alimente automatiquement le module RH.
Si le document est un TABLEAU DE PAIE (Payroll Report) avec PLUSIEURS employes, retourner type_document="payroll_report" avec:
Format: {"routing":{"societe":"<employeur>","type_document":"payroll_report","confiance_type":0-100},"extraction":{"employeur":"","periode":"YYYY-MM","employes":[{"code":"","nom":"","prenom":"","poste":"","departement":"","date_arrivee":"","date_depart":"","salaire_base":0,"overtime_1_5x":0,"overtime_2x":0,"special_allowance":0,"internet_allowance":0,"prime_production":0,"on_call_allowance":0,"prime_tl":0,"electricity_allowance":0,"meal_allowance":0,"total_payments":0,"absence_deductions":0,"csg":0,"nsf":0,"paye":0,"total_deductions":0,"er_csg":0,"er_nsf":0,"er_levy":0,"er_prgf":0,"total_er_contributions":0,"net_pay":0}],"totaux":{"total_basic":0,"total_payments":0,"total_deductions":0,"total_er_contributions":0,"total_net_pay":0}}}
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

    if (!typeDocument) typeDocument = parsed.routing?.type_document || 'autre'
    const detectedSociete = parsed.routing?.societe || 'INCONNU'
    const confianceType = parsed.routing?.confiance_type || null
    if (!extraction || Object.keys(extraction).length === 0) extraction = parsed.extraction || {}

    // Force reclassification: if Excel with salary keywords but classified as 'autre', force to payroll_report
    if (isExcel && (typeDocument === 'autre' || typeDocument === 'fiche_paie')) {
      const xlsxContent = typeof messageContent === 'string' ? messageContent.toLowerCase() : ''
      const hasMultipleEmployees = extraction.employes?.length > 1 ||
        xlsxContent.includes('payroll') || xlsxContent.includes('net pay') ||
        (xlsxContent.match(/\d{3,6}\.\d{2}/g) || []).length > 10

      if (hasMultipleEmployees) {
        console.log(`[upload] Excel reclassified: ${typeDocument} → payroll_report (detected multiple employees)`)
        typeDocument = 'payroll_report'
        parsed.routing = { ...parsed.routing, type_document: 'payroll_report' }

        // If extraction doesn't have employes array, re-process with specific prompt
        if (!extraction.employes || extraction.employes.length === 0) {
          console.log('[upload] Re-processing Excel as payroll_report with specific prompt')
          try {
            const payrollStream = anthropic.messages.stream({
              model: CLAUDE_CONFIG.model,
              max_tokens: 16384,
              temperature: 0,
              messages: [{ role: 'user', content: `Ce document Excel est un PAYROLL REPORT (tableau de paie multi-employés).
Extrais CHAQUE LIGNE employé. Retourne UNIQUEMENT un JSON valide:
{"routing":{"type_document":"payroll_report","societe":"<nom>","confiance_type":95},"extraction":{"employeur":"","periode":"YYYY-MM","employes":[{"code":"","nom":"","prenom":"","poste":"","departement":"","date_arrivee":"","salaire_base":0,"overtime_1_5x":0,"overtime_2x":0,"special_allowance":0,"internet_allowance":0,"prime_production":0,"electricity_allowance":0,"meal_allowance":0,"total_payments":0,"absence_deductions":0,"csg":0,"nsf":0,"paye":0,"total_deductions":0,"er_csg":0,"er_nsf":0,"er_levy":0,"er_prgf":0,"total_er_contributions":0,"net_pay":0}]}}

Contenu du fichier:
${typeof messageContent === 'string' ? messageContent : ''}` }],
            })
            const prMsg = await payrollStream.finalMessage()
            const prText = prMsg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
            const prCleaned = prText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
            const prParsed = JSON.parse(prCleaned.match(/\{[\s\S]*\}/)?.[0] || '{}')
            if (prParsed.extraction?.employes?.length > 0) {
              extraction = prParsed.extraction
              parsed = prParsed
              console.log(`[upload] Payroll re-parse OK: ${extraction.employes.length} employees`)
            }
          } catch (e) {
            console.warn('[upload] Payroll re-parse failed:', e)
          }
        }
      }
    }

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

    // ──── AFFECTATION COMPTABLE AUTOMATIQUE (facture fournisseur) ────
    // If this is a supplier invoice, look up automatic accounting assignment
    if (typeDocument === 'facture_fournisseur') {
      const fournisseurName = extraction.emetteur || extraction.fournisseur || ''
      // Resolve societe_id for affectation lookup
      let affSocieteId = societeId
      if (!affSocieteId && finalDossierId) {
        const { data: dossierAff } = await supabase.from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
        affSocieteId = dossierAff?.societe_id
      }

      if (fournisseurName && affSocieteId) {
        try {
          // Normalize fournisseur name for matching
          const normalizedFournisseur = fournisseurName
            .toUpperCase()
            .replace(/\b(LTD|LIMITED|SARL|SAS|SA|EURL|SNC|GIE|INC|CORP|LLC|PLC|CO\.?\s*LTD)\b/gi, '')
            .replace(/[.,;:!?]/g, '')
            .replace(/\s+/g, ' ')
            .trim()

          // 1. Exact match
          let affectation: any = null
          const { data: exactMatch } = await supabase
            .from('affectations_comptables')
            .select('*')
            .eq('societe_id', affSocieteId)
            .eq('fournisseur', normalizedFournisseur)
            .limit(1)
            .maybeSingle()

          if (exactMatch) {
            affectation = exactMatch
          } else {
            // 2. Pattern match
            const { data: allAff } = await supabase
              .from('affectations_comptables')
              .select('*')
              .eq('societe_id', affSocieteId)

            if (allAff && allAff.length > 0) {
              for (const aff of allAff) {
                if (normalizedFournisseur.includes(aff.fournisseur) || aff.fournisseur.includes(normalizedFournisseur)) {
                  affectation = aff
                  break
                }
                if (Array.isArray(aff.fournisseur_patterns)) {
                  for (const pattern of aff.fournisseur_patterns) {
                    const p = pattern.toUpperCase().trim()
                    if (p && normalizedFournisseur.includes(p)) {
                      affectation = aff
                      break
                    }
                  }
                  if (affectation) break
                }
              }
            }
          }

          if (affectation) {
            console.log(`[upload] Affectation auto: ${fournisseurName} → compte ${affectation.compte} (${affectation.libelle_compte || ''})`)

            // Override the 6xx charge account in ecritures_comptables with the affectation compte
            if (Array.isArray(extraction.ecritures_comptables)) {
              extraction.ecritures_comptables = extraction.ecritures_comptables.map((e: any) => {
                // Replace 6xx charge accounts (not 401 fournisseur, not 4456 TVA)
                if (String(e.compte).startsWith('6')) {
                  return { ...e, compte: affectation.compte, libelle: affectation.libelle_compte || e.libelle }
                }
                return e
              })
            }

            // Override journal if specified
            if (affectation.journal) {
              extraction._affectation_journal = affectation.journal
            }

            // Mark as auto-lettrée if configured
            if (affectation.auto_lettrage) {
              extraction._auto_lettrage = true
            }

            // Update usage stats on affectation
            await supabase
              .from('affectations_comptables')
              .update({
                nb_utilisations: (affectation.nb_utilisations || 0) + 1,
                derniere_utilisation: new Date().toISOString(),
              })
              .eq('id', affectation.id)
          }
        } catch (affErr: any) {
          console.warn('[upload] Affectation lookup failed:', affErr.message)
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
      // Use affectation journal override if available
      const effectiveJournal = extraction._affectation_journal || journalMap[typeDocument] || 'OD'

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
          journal: effectiveJournal,
          numero_piece: e.reference || extraction.numero_reference || null,
          compte: String(e.compte), libelle: e.libelle || file.name,
          debit: Number(e.debit) || 0, credit: Number(e.credit) || 0, piece_justificative: doc.id,
          // Mark as auto-lettrée if affectation says so
          ...(extraction._auto_lettrage ? { lettrage: 'AUTO' } : {}),
        }))
      if (entries.length > 0) await supabase.from('ecritures_comptables').insert(entries)
    }

    // ──── AUTO-FEED RH from PAYROLL REPORT (Excel multi-employés) ────
    if (typeDocument === 'payroll_report' && finalDossierId) {
      const { data: dossierPR } = await supabase.from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
      const prSocieteId = societeId || dossierPR?.societe_id
      const empList = extraction.employes || []
      const periodeStr = extraction.periode || new Date().toISOString().slice(0, 7)
      let created = 0, updated = 0

      if (prSocieteId && empList.length > 0) {
        console.log(`[upload] Payroll Report: ${empList.length} employés, période ${periodeStr}, société ${prSocieteId}`)

        for (const emp of empList) {
          const nom = (emp.nom || emp.last_name || '').toUpperCase().trim()
          const prenom = (emp.prenom || emp.first_name || '').trim()
          if (!nom) continue

          // Find or create employee
          let employeId: string | null = null
          const { data: existingEmp } = await supabase.from('employes')
            .select('id, salaire_base')
            .eq('societe_id', prSocieteId)
            .ilike('nom', `%${nom}%`)
            .limit(1).maybeSingle()

          if (existingEmp) {
            employeId = existingEmp.id
            // Update salary if changed
            const newBase = Number(emp.salaire_base || emp.basic_salary) || 0
            if (newBase > 0 && newBase !== Number(existingEmp.salaire_base)) {
              await supabase.from('employes').update({ salaire_base: newBase }).eq('id', existingEmp.id)
            }
            updated++
          } else {
            const { data: newEmp } = await supabase.from('employes').insert({
              societe_id: prSocieteId,
              nom, prenom,
              code_employe: emp.code || null,
              poste: emp.poste || emp.job || null,
              departement: emp.departement || emp.department || null,
              salaire_base: Number(emp.salaire_base || emp.basic_salary) || 0,
              date_arrivee: emp.date_arrivee || emp.arr_date || null,
              date_depart: emp.date_depart || emp.dep_date || null,
            }).select('id').single()
            if (newEmp) { employeId = newEmp.id; created++ }
          }

          // Create bulletin de paie
          if (employeId) {
            const periodeDate = `${periodeStr}-01`
            const bulletinData: Record<string, unknown> = {
              employe_id: employeId,
              societe_id: prSocieteId,
              periode: periodeDate,
              salaire_base: Number(emp.salaire_base || emp.basic_salary) || 0,
              heures_sup_montant: (Number(emp.overtime_1_5x) || 0) + (Number(emp.overtime_2x) || 0),
              transport_allowance: 0,
              special_allowance_1: Number(emp.special_allowance) || 0,
              special_allowance_2: Number(emp.internet_allowance) || 0,
              special_allowance_3: Number(emp.meal_allowance) || 0,
              salaire_net: Number(emp.net_pay) || 0,
              csg_salarie: Number(emp.csg) || 0,
              csg_patronal: Number(emp.er_csg) || 0,
              nsf_salarie: Number(emp.nsf) || 0,
              nsf_patronal: Number(emp.er_nsf) || 0,
              paye: Number(emp.paye) || 0,
              training_levy: Number(emp.er_levy) || 0,
              prgf: Number(emp.er_prgf) || 0,
              total_deductions: Number(emp.total_deductions) || 0,
              total_charges_patronales: Number(emp.total_er_contributions) || 0,
              statut: 'valide',
              source: 'ocr_payroll_report',
              document_id: doc.id,
            }
            await supabase.from('bulletins_paie').upsert(bulletinData, { onConflict: 'employe_id,periode' }).catch(() => {
              supabase.from('bulletins_paie').insert(bulletinData).catch(() => {})
            })
          }
        }

        console.log(`[upload] Payroll Report processed: ${created} created, ${updated} updated, ${empList.length} total`)

        // Update document metadata
        await supabase.from('documents').update({
          n8n_result: {
            ...updateData.n8n_result,
            rh_import: { employes_crees: created, employes_maj: updated, total: empList.length, periode: periodeStr },
          }
        }).eq('id', doc.id)
      }
    }

    // ──── AUTO-FEED RH MODULE from scanned payslips (individual) ────
    if (typeDocument === 'fiche_paie' && finalDossierId) {
      const { data: dossierRH } = await supabase.from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
      const rhSocieteId = societeId || dossierRH?.societe_id

      if (rhSocieteId) {
        const empNom = extraction.employe || extraction.nom_employe || ''
        const employeur = extraction.employeur || ''
        const periodeStr = extraction.periode || extraction.date_document?.slice(0, 7) || new Date().toISOString().slice(0, 7)

        // 1. Find or create employee
        let employeId: string | null = null
        if (empNom) {
          const parts = empNom.trim().split(/\s+/)
          const nom = parts.length > 1 ? parts.slice(1).join(' ') : parts[0]
          const prenom = parts.length > 1 ? parts[0] : ''

          // Search by name in this société
          const { data: existingEmp } = await supabase.from('employes')
            .select('id').eq('societe_id', rhSocieteId)
            .or(`nom.ilike.%${nom}%,prenom.ilike.%${prenom}%`)
            .limit(1).maybeSingle()

          if (existingEmp) {
            employeId = existingEmp.id
            // Update salary if higher than current (in case of raise)
            if (extraction.salaire_brut) {
              await supabase.from('employes').update({
                salaire_base: Number(extraction.salaire_brut) || undefined,
              }).eq('id', existingEmp.id).lt('salaire_base', Number(extraction.salaire_brut) || 0)
            }
          } else {
            // Create employee from payslip data
            const { data: newEmp } = await supabase.from('employes').insert({
              societe_id: rhSocieteId,
              nom: nom.toUpperCase(),
              prenom,
              salaire_base: Number(extraction.salaire_brut) || 0,
              date_arrivee: extraction.date_embauche || null,
              poste: extraction.poste || extraction.fonction || null,
              nic_number: extraction.nic || extraction.numero_nic || null,
              npf_number: extraction.npf || extraction.numero_npf || null,
              bank_account: extraction.compte_bancaire_employe || extraction.rib || null,
              bank_name: extraction.banque_employe || null,
            }).select('id').single()
            if (newEmp) employeId = newEmp.id
            console.log(`[upload] Created employee from payslip: ${prenom} ${nom} → ${employeId}`)
          }
        }

        // 2. Create historical bulletin de paie
        if (employeId) {
          const periodeDate = periodeStr.length === 7 ? `${periodeStr}-01` : periodeStr
          const bulletinData: Record<string, unknown> = {
            employe_id: employeId,
            societe_id: rhSocieteId,
            periode: periodeDate,
            salaire_base: Number(extraction.salaire_brut) || Number(extraction.salaire_base) || 0,
            salaire_net: Number(extraction.salaire_net) || 0,
            csg_salarie: Number(extraction.npf_salarie_3pct) || Number(extraction.csg_salarie) || 0,
            csg_patronal: Number(extraction.npf_patronal_6pct) || Number(extraction.csg_patronal) || 0,
            paye: Number(extraction.paye) || 0,
            nsf_salarie: Number(extraction.nps_salarie) || Number(extraction.nsf_salarie) || 0,
            nsf_patronal: Number(extraction.nps_employeur) || Number(extraction.nsf_patronal) || 0,
            training_levy: Number(extraction.hrdc_1pct) || Number(extraction.training_levy) || 0,
            total_deductions: Number(extraction.cotisations_salariales) || Number(extraction.total_retenues) || 0,
            total_charges_patronales: Number(extraction.cotisations_patronales) || 0,
            transport_allowance: Number(extraction.transport_allowance) || 0,
            heures_sup_montant: Number(extraction.heures_sup_montant) || Number(extraction.overtime) || 0,
            statut: 'valide',
            source: 'ocr',
            document_id: doc.id,
          }

          // Upsert by employe_id + periode (avoid duplicates)
          const { error: bulErr } = await supabase.from('bulletins_paie')
            .upsert(bulletinData, { onConflict: 'employe_id,periode' })
          if (bulErr) {
            // If upsert fails (constraint might not exist), try insert
            await supabase.from('bulletins_paie').insert(bulletinData).catch(e => {
              console.warn('[upload] bulletin insert fallback:', e)
            })
          }
          console.log(`[upload] Bulletin RH créé: ${empNom} période ${periodeStr}`)
        }
      }
    }

    // ──── AUTO-FEED CHARGES SOCIALES from scanned documents ────
    if (typeDocument === 'charges_sociales' && finalDossierId) {
      const { data: dossierCS } = await supabase.from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
      const csSocieteId = societeId || dossierCS?.societe_id

      if (csSocieteId) {
        const periodeStr = extraction.periode || extraction.date_document?.slice(0, 7) || new Date().toISOString().slice(0, 7)
        const organisme = extraction.organisme || 'MRA'
        const details = extraction.detail || []

        // Create declaration records
        for (const d of details) {
          const type = d.type || ''
          const montant = Number(d.montant) || 0
          if (montant <= 0) continue

          if (type.includes('CSG') || type.includes('NPF')) {
            await supabase.from('declarations_csg_mensuelle').upsert({
              societe_id: csSocieteId,
              periode: periodeStr.length === 7 ? `${periodeStr}-01` : periodeStr,
              montant_csg_salarie: type.includes('salarie') ? montant : 0,
              montant_csg_patronal: type.includes('patronal') ? montant : 0,
              source: 'ocr',
              document_id: doc.id,
            }, { onConflict: 'societe_id,periode' }).catch(() => {})
          }

          if (type.includes('PAYE')) {
            await supabase.from('declarations_paye_mensuelle').upsert({
              societe_id: csSocieteId,
              periode: periodeStr.length === 7 ? `${periodeStr}-01` : periodeStr,
              montant_paye: montant,
              source: 'ocr',
              document_id: doc.id,
            }, { onConflict: 'societe_id,periode' }).catch(() => {})
          }
        }

        console.log(`[upload] Charges sociales RH: ${organisme} période ${periodeStr}, ${details.length} lignes`)
      }
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

    // Handle bank statement: auto-detect société + create/update bank account + store statement
    if (typeDocument === 'releve_bancaire') {
      if (!extraction.banque && !extraction.compte_bancaire && detectedSociete !== 'INCONNU') {
        extraction.banque = detectedSociete
      }
      const bankDevise = extraction.devise || 'MUR'
      const bankName = extraction.banque || extraction.compte_bancaire || null
      const rawSolde = parseFloat(extraction.solde_cloture) || parseFloat(extraction.solde_fin) || NaN
      const solde = isNaN(rawSolde) ? null : rawSolde
      const extractedIBAN = extraction.iban || null
      const extractedNumeroCompte = extraction.numero_compte || extraction.compte_bancaire || null
      const extractedBRN = extraction.brn || null
      const extractedNomSociete = extraction.nom_societe || extraction.titulaire || detectedSociete || null

      // ──── AUTO-DETECT SOCIÉTÉ from PDF (BRN, IBAN, numéro compte, nom) ────
      let bankSocieteId = societeId || null

      if (!bankSocieteId) {
        // 1. Match by BRN
        if (extractedBRN) {
          const { data: byBRN } = await supabase.from('societes').select('id, nom').eq('brn', extractedBRN).limit(1).maybeSingle()
          if (byBRN) { bankSocieteId = byBRN.id; console.log(`[upload] Société by BRN ${extractedBRN} → ${byBRN.nom}`) }
        }
        // 2. Match by IBAN on existing bank accounts
        if (!bankSocieteId && extractedIBAN) {
          const { data: byIBAN } = await supabase.from('comptes_bancaires').select('id, societe_id').eq('iban', extractedIBAN).limit(1).maybeSingle()
          if (byIBAN) { bankSocieteId = byIBAN.societe_id; console.log(`[upload] Société by IBAN`) }
        }
        // 3. Match by account number
        if (!bankSocieteId && extractedNumeroCompte) {
          const { data: byNum } = await supabase.from('comptes_bancaires').select('id, societe_id').eq('numero_compte', extractedNumeroCompte).limit(1).maybeSingle()
          if (byNum) { bankSocieteId = byNum.societe_id; console.log(`[upload] Société by account number ${extractedNumeroCompte}`) }
        }
        // 4. Match by société name (fuzzy)
        if (!bankSocieteId && extractedNomSociete && extractedNomSociete !== 'INCONNU') {
          const sn = extractedNomSociete.toLowerCase().replace(/ ltd| limited| sarl| sas/gi, '').trim()
          const { data: allSoc } = await supabase.from('societes').select('id, nom')
          const matched = (allSoc || []).find(s => {
            const n = (s.nom || '').toLowerCase().replace(/ ltd| limited| sarl| sas/gi, '').trim()
            return n === sn || n.includes(sn) || sn.includes(n)
          })
          if (matched) { bankSocieteId = matched.id; console.log(`[upload] Société by name "${extractedNomSociete}" → ${matched.nom}`) }
        }
        // 5. Fallback: user's dossier
        if (!bankSocieteId) {
          const { data: dd } = await supabase.from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
          bankSocieteId = dd?.societe_id || null
        }
      }

      // Re-route document to correct société dossier
      if (bankSocieteId) {
        const { data: correctDossier } = await supabase.from('dossiers').select('id').eq('societe_id', bankSocieteId).eq('client_id', user.id).limit(1).maybeSingle()
        if (correctDossier && correctDossier.id !== finalDossierId) {
          finalDossierId = correctDossier.id
          await supabase.from('documents').update({ dossier_id: correctDossier.id }).eq('id', doc.id)
          console.log(`[upload] Rerouted to dossier ${correctDossier.id} for société ${bankSocieteId}`)
        }
      }

      console.log(`[upload] Bank: name=${bankName}, societe=${bankSocieteId}, devise=${bankDevise}, solde=${solde}, IBAN=${extractedIBAN}, BRN=${extractedBRN}`)

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
        if (!normPeriodeFin) normPeriodeFin = null

        let normPeriodeDebut = extraction.periode_debut || extraction.date_debut || null
        if (!normPeriodeDebut && extraction.periode) {
          if (/^\d{4}-\d{2}$/.test(extraction.periode)) {
            normPeriodeDebut = `${extraction.periode}-01`
          }
        }
        if (!normPeriodeDebut) normPeriodeDebut = normPeriodeFin

        const normNumeroCompte = extraction.numero_compte || extraction.compte_bancaire || null

        // Check if bank account exists — match by IBAN, numero_compte, or banque+devise
        let existingBank: any = null
        if (extractedIBAN) {
          const { data: byIBAN } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('iban', extractedIBAN).limit(1).maybeSingle()
          existingBank = byIBAN
        }
        if (!existingBank && normNumeroCompte) {
          const { data: byNum } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
          existingBank = byNum
        }
        // Only match by banque+devise if bankName is known (avoid "null" collisions)
        if (!existingBank && bankName) {
          const { data: byName } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
          existingBank = byName
        }

        if (existingBank) {
          // Update balance
          console.log(`[upload] Updating existing bank account ${existingBank.id}: solde=${solde}, date=${normPeriodeFin}`)
          const bankUpdate: Record<string, unknown> = {}
          if (solde !== null) bankUpdate.solde_actuel = solde
          if (normPeriodeFin) bankUpdate.date_dernier_releve = normPeriodeFin
          if (extractedIBAN) bankUpdate.iban = extractedIBAN
          if (normNumeroCompte) bankUpdate.numero_compte = normNumeroCompte
          if (Object.keys(bankUpdate).length > 0) {
            await supabase.from('comptes_bancaires').update(bankUpdate).eq('id', existingBank.id)
          }
        } else if (bankName) {
          // Create new bank account only if bank name was identified
          console.log(`[upload] Creating new bank account: ${bankName} for societe=${bankSocieteId}`)
          const { error: bankInsertError } = await supabase.from('comptes_bancaires').insert({
            societe_id: bankSocieteId,
            banque: bankName,
            nom_compte: normNumeroCompte || null,
            numero_compte: normNumeroCompte,
            iban: extractedIBAN,
            devise: bankDevise,
            solde_actuel: solde,
            solde_dernier_releve: solde,
            date_dernier_releve: normPeriodeFin,
            actif: true,
          })
          if (bankInsertError) {
            console.error('[upload] comptes_bancaires insert FAILED:', bankInsertError.message)
          }
        } else {
          // Bank name not identified — skip account creation, add warning
          console.warn('[upload] Banque non identifiée — compte bancaire non créé. Document:', doc.id)
        }

        // Store bank statement record — find the account we just created/updated
        let bankAccount: any = null
        if (normNumeroCompte) {
          const { data: byNum } = await supabase.from('comptes_bancaires')
            .select('id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
          bankAccount = byNum
        }
        if (!bankAccount && bankName) {
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
