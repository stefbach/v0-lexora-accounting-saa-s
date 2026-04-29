import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getSystemPrompt, injectTauxChange, injectSocietes, CLAUDE_CONFIG, SYSTEM_PROMPT_GENERIC_EXTRACTION } from '@/lib/ai/prompts'
import { extractBankStatement } from '@/lib/ai/bank-statement-extraction'
import { findTiersInAnnuaire, incrementTiersUsage, createTiersFromOcr } from '@/lib/tiers-annuaire'
import { createHash } from 'crypto'
import { isBankName, validateAndCleanExtraction, computeConfidence } from '@/lib/utils/bank-utils'
import {
  resolveBankCurrency,
  compareCurrency,
  type Currency,
} from '@/lib/accounting/validate-bank-currency'
import { parseAmount, parseAmountSafe, ParseAmountError } from '@/lib/utils/bank-amount'

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
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (!user) {
      console.error('[upload] Auth failed:', authError?.message || 'No user in session')
      return NextResponse.json({ error: 'Non authentifié — veuillez vous reconnecter' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const societeId = formData.get('societe_id') as string
    const dossierId = formData.get('dossier_id') as string | null

    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })

    // Fetch user profile early — needed for role-scoping (BUG 3) + name validation (BUG 2)
    const { data: userProfile } = await supabaseAuth
      .from('profiles')
      .select('role, full_name, email, societe_id')
      .eq('id', user.id)
      .maybeSingle()
    const userRole: string = userProfile?.role || ''
    const uploaderName: string = (userProfile?.full_name || '').trim()
    const uploaderEmail: string = (userProfile?.email || '').trim()

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

    // Détection doublons — multi-level check
    let existingDoc: { id: string; nom_fichier: string; statut: string } | null = null

    // Level 1: filename + size (cross-user — catches same file uploaded by any user)
    const { data: nameSizeDup } = await supabase
      .from('documents')
      .select('id, nom_fichier, statut')
      .eq('nom_fichier', file.name)
      .eq('taille_fichier', file.size)
      .limit(1)
      .maybeSingle()
    if (nameSizeDup) existingDoc = nameSizeDup
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

    // Resolve dossier_id — PRIORITY 1: explicit societe_id from FormData
    let resolvedDossierId = dossierId
    let needsSocieteConfirmation = false

    // BUG 3 FIX — client_assistant must only upload to their explicitly-assigned sociétés.
    // Build allowed societe_id set for client_assistant (from profile + user_societes only)
    let allowedSocieteIds: Set<string> | null = null
    if (userRole === 'client_assistant') {
      const ids = new Set<string>()
      if (userProfile?.societe_id) ids.add(userProfile.societe_id)
      const { data: links } = await supabaseAuth.from('user_societes').select('societe_id').eq('user_id', user.id)
      for (const l of links || []) if (l.societe_id) ids.add(l.societe_id)
      allowedSocieteIds = ids
      // If client_assistant supplied societe_id/dossier_id, validate it belongs to allowed set
      if (societeId && !ids.has(societeId)) {
        return NextResponse.json({ error: 'Société non autorisée pour cet assistant' }, { status: 403 })
      }
      if (dossierId) {
        const { data: dosCheck } = await supabaseAuth.from('dossiers').select('societe_id').eq('id', dossierId).maybeSingle()
        if (!dosCheck?.societe_id || !ids.has(dosCheck.societe_id)) {
          return NextResponse.json({ error: 'Dossier non autorisé pour cet assistant' }, { status: 403 })
        }
      }
    }

    if (!resolvedDossierId && societeId) {
      const { data: d } = await supabase.from('dossiers').select('id').eq('societe_id', societeId).limit(1).maybeSingle()
      if (d) { resolvedDossierId = d.id }
    }
    // PRIORITY 2: user's profile société or user_societes
    if (!resolvedDossierId) {
      const { data: profile } = await supabase.from('profiles').select('societe_id').eq('id', user.id).maybeSingle()
      if (profile?.societe_id) {
        const { data: d } = await supabase.from('dossiers').select('id').eq('societe_id', profile.societe_id).limit(1).maybeSingle()
        if (d) { resolvedDossierId = d.id }
      }
    }
    if (!resolvedDossierId) {
      const { data: us } = await supabase.from('user_societes').select('societe_id').eq('user_id', user.id).limit(1).maybeSingle()
      if (us?.societe_id) {
        const { data: d } = await supabase.from('dossiers').select('id').eq('societe_id', us.societe_id).limit(1).maybeSingle()
        if (d) { resolvedDossierId = d.id }
      }
    }
    // PRIORITY 3: any dossier owned by user (as client or comptable)
    // BUG 3 — for client_assistant: restrict to allowed sociétés only (no broad fallback)
    if (!resolvedDossierId && userRole !== 'client_assistant') {
      const { data: d } = await supabase.from('dossiers').select('id').eq('client_id', user.id).limit(1).maybeSingle()
      if (d) { resolvedDossierId = d.id }
    }
    if (!resolvedDossierId && userRole === 'client_assistant' && allowedSocieteIds && allowedSocieteIds.size > 0) {
      const { data: d } = await supabase.from('dossiers').select('id').in('societe_id', [...allowedSocieteIds]).limit(1).maybeSingle()
      if (d) { resolvedDossierId = d.id }
    }
    if (!resolvedDossierId) {
      const { data: d } = await supabase.from('dossiers').select('id').eq('comptable_id', user.id).limit(1).maybeSingle()
      if (d) { resolvedDossierId = d.id }
    }
    // If no dossier found at all — try to use first available dossier as fallback
    if (!resolvedDossierId) {
      needsSocieteConfirmation = true
      // Use the user's first available dossier (do NOT create a new société)
      const { data: anyDossier } = await supabase.from('dossiers')
        .select('id').or(`client_id.eq.${user.id},comptable_id.eq.${user.id}`).limit(1).maybeSingle()
      if (anyDossier) {
        resolvedDossierId = anyDossier.id
      } else {
        return NextResponse.json({
          error: 'Aucune société trouvée. Veuillez créer une société avant d\'uploader des documents.',
          needs_societe: true,
        }, { status: 400 })
      }
    }

    // Read file ONCE
    const fileArrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(fileArrayBuffer)
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex')
    const base64 = fileBuffer.toString('base64')

    // Level 2: Hash-based dedup (catches renamed files with identical content)
    // Wrapped in try/catch in case file_hash column doesn't exist yet
    if (!existingDoc) {
      try {
        const { data: hashDup, error: hashErr } = await supabase
          .from('documents')
          .select('id, nom_fichier, statut')
          .eq('file_hash', fileHash)
          .limit(1)
          .maybeSingle()
        if (!hashErr && hashDup) existingDoc = hashDup
      } catch {
        console.log('[upload] file_hash column not available, skipping hash dedup')
      }
    }

    // Handle duplicate found
    if (existingDoc) {
      if (existingDoc.statut === 'traite') {
        return NextResponse.json({
          error: `Doublon détecté : "${existingDoc.nom_fichier}" existe déjà.`,
          doublon: true,
          doc_id: existingDoc.id,
        }, { status: 409 })
      } else {
        return NextResponse.json({
          doublon: true,
          statut: existingDoc.statut,
          message: "Un document identique existe déjà avec des erreurs de traitement. Voulez-vous le retraiter ?",
          existingId: existingDoc.id,
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
    // Try insert with file_hash, fall back without if column doesn't exist
    let doc: any = null
    let docError: any = null
    const docFields: Record<string, unknown> = {
      dossier_id: resolvedDossierId, uploaded_by: user.id, nom_fichier: file.name,
      type_fichier: typeFichier, statut: 'en_cours', storage_path: storagePath,
      taille_fichier: file.size, societe_detectee: null, type_document: null,
    }
    const insertWithHash = await supabase.from('documents').insert({ ...docFields, file_hash: fileHash }).select().single()
    if (insertWithHash.error?.message?.includes('file_hash')) {
      // Column doesn't exist yet — insert without it
      const insertWithout = await supabase.from('documents').insert(docFields).select().single()
      doc = insertWithout.data
      docError = insertWithout.error
    } else {
      doc = insertWithHash.data
      docError = insertWithHash.error
    }
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

    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const isPdf = ext === 'pdf'
    const isExcel = ext === 'xlsx' || ext === 'xls'

    let typeDocument = ''
    let extraction: any = {}
    let parsed: any = {}
    let detectedSociete = 'INCONNU'
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
          max_tokens: 1024,
          temperature: 0,
          system: `You are a document classifier for a Mauritius accounting system. Classify the document into EXACTLY ONE of these types:

- facture_fournisseur: Invoice FROM a supplier TO the company (bill to pay). Signs: supplier name at top, amount to pay, invoice number. Examples: Emtel bill, Google Cloud invoice, any telecom/SaaS/services invoice.
IMPORTANT: Google Cloud, AWS, Vercel, Stripe, Anthropic, OpenAI are SaaS SUPPLIERS — NOT banks. Their invoices are facture_fournisseur.

- facture_client: Invoice FROM the company TO a client (money to receive). Signs: company header at top as the ISSUER, billed TO a client.
${societeDetailsForPrompt.length > 0 ? `Company names to look for: ${societeDetailsForPrompt.map(s => s.nom).join(', ')}` : ''}

- releve_bancaire: Official bank statement from MCB, SBM, Barclays, AfrAsia, MauBank ONLY. Signs: bank logo, IBAN number starting with MU, columns: TRANS DATE, VALUE DATE, TRANSACTION DETAILS, DEBIT, CREDIT, BALANCE. NEVER classify a SaaS invoice as releve_bancaire.

- fiche_paie: Employee payslip. Signs: employee name, salary breakdown, CSG, PAYE, NSF deductions.

- autre: Everything else (contracts, reports, annual returns, etc.)

Respond with ONLY the type word. Nothing else.`,
          messages: [{ role: 'user', content: [...(messageContent as any[]), { type: 'text', text: 'Classify this document. Respond with ONLY the type word.' }] }],
        })
        const quickDetect = await quickStream.finalMessage()
        const quickText = quickDetect.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').toLowerCase().trim()
        console.log('[upload] Quick detection result:', quickText)
        isLikelyBankStatement = quickText.includes('releve_bancaire')
      } catch (e) { console.error('[upload] Quick detection error:', e) }
    }

    // Si relevé bancaire détecté → aller directement au prompt spécialisé (évite double appel)
    let aiResponse: any
    if (!parsed.routing) parsed = {}

    // Skip AI if already parsed locally (e.g., Excel payroll)
    if (messageContent === null) {
      console.log('[upload] Skipping AI call — already parsed locally')
    } else if (isLikelyBankStatement && isPdf) {
      const bankSystemPrompt = injectSocietes(getSystemPrompt('releve_bancaire', tauxChange), societeDetailsForPrompt)
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
      let bankText = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      console.log('[upload] Raw Claude bank response length:', bankText.length, 'stop_reason:', aiResponse.stop_reason, 'first 500 chars:', bankText.substring(0, 500))

      // Boucle de continuation pour les longs relevés (jusqu'à 5 itérations).
      // Chaque appel demande UNIQUEMENT les transactions manquantes en JSON
      // array — on les fusionne avec celles déjà extraites au lieu de
      // concaténer du texte brut (plus robuste, plus de doublons possibles).
      const MAX_CONTINUATIONS = 5
      let extraTransactions: any[] = []
      let lastDate: string | null = null
      let lastDescription: string | null = null
      let stopReason = aiResponse.stop_reason

      // Helper : extraire un tableau de transactions depuis du texte brut
      const tryParseTransactionsArray = (text: string): any[] | null => {
        // Essai 1 : JSON array direct
        const trimmed = text.trim()
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return parsed
          if (parsed.transactions && Array.isArray(parsed.transactions)) return parsed.transactions
          if (parsed.lignes && Array.isArray(parsed.lignes)) return parsed.lignes
        } catch {}
        // Essai 2 : trouver le premier `[` et le dernier `]`
        const first = trimmed.indexOf('[')
        const last  = trimmed.lastIndexOf(']')
        if (first !== -1 && last > first) {
          try {
            const arr = JSON.parse(trimmed.substring(first, last + 1))
            if (Array.isArray(arr)) return arr
          } catch {}
        }
        // Essai 3 : code fence
        const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (fence) {
          try {
            const parsed = JSON.parse(fence[1].trim())
            if (Array.isArray(parsed)) return parsed
            if (parsed.transactions && Array.isArray(parsed.transactions)) return parsed.transactions
          } catch {}
        }
        return null
      }

      // Compute landmark from existing parsed text (last 1000 chars likely contain
      // last extracted transaction's date + description)
      const computeLandmark = (sourceText: string): { date: string | null; desc: string | null } => {
        // Try to JSON-parse what we have to find the last transaction
        const tryParse = (txt: string): any => {
          try { return JSON.parse(txt) } catch { return null }
        }
        let parsed = tryParse(sourceText.trim())
        if (!parsed) {
          const first = sourceText.indexOf('{')
          const last  = sourceText.lastIndexOf('}')
          if (first !== -1 && last > first) parsed = tryParse(sourceText.substring(first, last + 1))
        }
        const txs: any[] = parsed?.transactions || parsed?.lignes || []
        if (txs.length === 0) return { date: null, desc: null }
        const lastTx = txs[txs.length - 1]
        return {
          date: lastTx.date || lastTx.date_operation || null,
          desc: lastTx.description || lastTx.libelle || null,
        }
      }

      let cont = 0
      while (cont < MAX_CONTINUATIONS &&
             (stopReason === 'max_tokens' ||
              (stopReason === 'end_turn' && bankText.length > 60000 && cont === 0))) {
        cont++
        const landmark = computeLandmark(bankText + (extraTransactions.length > 0 ? JSON.stringify({ transactions: extraTransactions }) : ''))
        lastDate = landmark.date
        lastDescription = landmark.desc

        const landmarkHint = lastDate && lastDescription
          ? `La dernière transaction extraite était : { date: "${lastDate}", description: "${lastDescription.slice(0, 80)}" }. Reprends les transactions APRÈS celle-ci uniquement.`
          : `Tu as déjà extrait ${extraTransactions.length} transactions supplémentaires. Reprends APRÈS la dernière.`

        console.log(`[upload] Bank continuation ${cont}/${MAX_CONTINUATIONS} — landmark: ${lastDate} / ${lastDescription?.slice(0, 50)}`)

        try {
          const contStream = anthropic.messages.stream({
            model: CLAUDE_CONFIG.model,
            max_tokens: CLAUDE_CONFIG.max_tokens_releve_bancaire,
            temperature: CLAUDE_CONFIG.temperature,
            system: 'Tu continues à extraire les transactions d\'un relevé bancaire. Retourne UNIQUEMENT un tableau JSON `[ {...}, {...} ]` avec les nouvelles transactions, sans aucune métadonnée, sans markdown, sans texte avant ou après. Si toutes les transactions sont déjà extraites, retourne `[]`.',
            messages: [
              { role: 'user', content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                { type: 'text', text: `${landmarkHint}\n\nRetourne UNIQUEMENT le tableau JSON des transactions manquantes. Format : [{"date":"YYYY-MM-DD","description":"...","debit":0,"credit":0,"solde":0}, ...].\nSi rien à ajouter : [].` },
              ]},
            ],
          })
          const contResponse = await contStream.finalMessage()
          const contText = contResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
          console.log(`[upload] Continuation ${cont} response length: ${contText.length}, stop_reason: ${contResponse.stop_reason}`)

          const newTxs = tryParseTransactionsArray(contText)
          if (!newTxs || newTxs.length === 0) {
            console.log(`[upload] Continuation ${cont}: 0 nouvelles transactions, arrêt boucle`)
            break
          }
          extraTransactions = extraTransactions.concat(newTxs)
          stopReason = contResponse.stop_reason
          console.log(`[upload] Continuation ${cont}: ${newTxs.length} nouvelles tx (total extra=${extraTransactions.length})`)
        } catch (contErr: any) {
          console.warn(`[upload] Continuation ${cont} failed:`, contErr.message)
          break
        }
      }

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
        // Fusion des continuations : ajouter les extraTransactions au tableau
        // principal (transactions[] ou lignes[]). Dédup léger sur (date+description+montant).
        if (extraTransactions.length > 0) {
          const targetKey = Array.isArray(bankParsed.transactions)
            ? 'transactions'
            : (Array.isArray(bankParsed.lignes) ? 'lignes' : 'transactions')
          const existing: any[] = bankParsed[targetKey] || []
          const seen = new Set(existing.map((t: any) =>
            `${t.date || ''}|${(t.description || t.libelle || '').slice(0, 30)}|${t.debit || 0}|${t.credit || 0}`
          ))
          let added = 0
          for (const tx of extraTransactions) {
            const key = `${tx.date || ''}|${(tx.description || tx.libelle || '').slice(0, 30)}|${tx.debit || 0}|${tx.credit || 0}`
            if (!seen.has(key)) {
              existing.push(tx)
              seen.add(key)
              added++
            }
          }
          bankParsed[targetKey] = existing
          console.log(`[upload] Merged ${added} extra transactions (skipped ${extraTransactions.length - added} doublons), total: ${existing.length}`)
        }

        console.log('[upload] Bank JSON parsed OK. Keys:', Object.keys(bankParsed).join(', '),
          'lignes:', Array.isArray(bankParsed.lignes) ? bankParsed.lignes.length : 0,
          'transactions:', Array.isArray(bankParsed.transactions) ? bankParsed.transactions.length : 0)
        // For bank statements: société = account holder (nom_societe/titulaire), NOT the bank name
        const accountHolder = bankParsed.nom_societe || bankParsed.titulaire || null
        const routingSociete = accountHolder && !isBankName(accountHolder) ? accountHolder : 'INCONNU'
        parsed = { routing: { type_document: 'releve_bancaire', societe: routingSociete, confiance_type: 95 }, extraction: bankParsed }
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
        system: injectSocietes(injectTauxChange(SYSTEM_PROMPT_GENERIC_EXTRACTION, tauxChange), societeDetailsForPrompt),
        messages: [{ role: 'user', content: messageContent }],
      })
      aiResponse = await genericStream.finalMessage()

      const text = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      try { parsed = JSON.parse(cleaned) } catch { parsed = { routing: { type_document: 'autre', societe: 'INCONNU' }, extraction: {} } }
    }

    if (!typeDocument) typeDocument = parsed.routing?.type_document || 'autre'
    detectedSociete = parsed.routing?.societe || 'INCONNU'
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
        const bankSystemPrompt = injectSocietes(getSystemPrompt('releve_bancaire', tauxChange), societeDetailsForPrompt)
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
        try {
          extraction.transactions = rawLignes.map((l: any) => {
            // Support ancien format (montant + sens) ET nouveau format (debit + credit)
            // parseAmount (throw on bad) — montant d'une tx est CRITIQUE.
            let debit = parseAmount(l.debit)
            let credit = parseAmount(l.credit)
            if (debit === 0 && credit === 0 && l.montant) {
              const montant = parseAmount(l.montant)
              if (l.sens === 'debit') debit = montant
              else credit = montant
            }
            return {
              date: l.date || '',
              libelle: l.libelle || '',
              debit,
              credit,
              solde_apres: l.solde_apres ?? null,
              tiers_detecte: l.tiers_detecte || null,
              compte_comptable: l.compte_debit || l.compte_credit || (debit > 0 ? l.compte_debit : l.compte_credit) || null,
              statut: (l.confiance || 0) >= 70 ? 'identifie' : ((l.confiance || 0) >= 40 ? 'a_verifier' : 'non_identifie'),
            }
          })
        } catch (err) {
          // F4/F5 — montant illisible sur au moins une ligne. On refuse de persister.
          const errMsg = err instanceof ParseAmountError
            ? `Montant de transaction illisible: ${err.message}. Review humaine requise.`
            : `Erreur parsing montants relevé: ${err instanceof Error ? err.message : String(err)}`
          console.error(`[upload] F4/F5 BLOCK: ${errMsg} (doc ${docId})`)
          if (docId) {
            await supabase.from('documents').update({
              statut: 'erreur_ocr',
              message_erreur: errMsg,
            }).eq('id', docId)
          }
          return NextResponse.json(
            { error: 'Montants du relevé illisibles', details: { message: errMsg } },
            { status: 400 },
          )
        }
      }
      // Log extraction stats
      const nbExtracted = (extraction.transactions || []).length
      const nbExpected = extraction.nb_transactions_releve || 0
      if (nbExpected > 0 && nbExtracted < nbExpected) {
        console.warn(`[upload] LIGNES MANQUANTES: extrait ${nbExtracted}/${nbExpected} transactions du relevé`)
        extraction.lignes_manquantes = true
      }
      console.log(`[upload] releve: ${nbExtracted} transactions extraites${nbExpected > 0 ? ` (${nbExpected} attendues)` : ''}`)
    }

    // Post-processing: validate nom_societe is NOT a bank name
    if (typeDocument === 'releve_bancaire') {
      if (extraction.nom_societe && isBankName(extraction.nom_societe)) {
        console.warn(`[upload] OCR returned bank name "${extraction.nom_societe}" as nom_societe — clearing it`)
        extraction.nom_societe = null
      }
      if (extraction.titulaire && isBankName(extraction.titulaire)) {
        extraction.titulaire = null
      }
      // Also fix detectedSociete if it's a bank name
      if (detectedSociete && isBankName(detectedSociete)) {
        detectedSociete = 'INCONNU'
      }
    }

    // F6 — lignes_manquantes is now BLOCKING. We must never persist a
    // releve_bancaire whose balance equation doesn't close, otherwise the
    // rapprochement engine feeds on corrupted data.
    if (
      typeDocument === 'releve_bancaire' &&
      (extraction.lignes_manquantes === true || Math.abs(parseAmountSafe(extraction.ecart_solde, 'ecart_solde')) > 1)
    ) {
      const ecart = parseAmountSafe(extraction.ecart_solde, 'ecart_solde')
      const errMsg =
        `Releve incoherent — lignes_manquantes=${!!extraction.lignes_manquantes}, ecart_solde=${ecart}. ` +
        `Nous ne pouvons pas persister ce releve sans revue humaine.`
      console.error(`[upload] F6 BLOCK: ${errMsg} (doc ${docId})`)

      if (docId) {
        await supabase.from('documents').update({
          statut: 'erreur_ocr',
          message_erreur: errMsg,
        }).eq('id', docId)

        // Best-effort alert creation — swallow errors if the table is missing.
        try {
          await supabase.from('alertes').insert({
            societe_id: null,
            type_alerte: 'releve_incoherent',
            niveau: 'critique',
            titre: 'Releve bancaire incoherent',
            description: errMsg,
            statut: 'active',
          })
        } catch (alertErr) {
          console.error('[upload] alertes insert failed (non-fatal):', alertErr)
        }
      }

      return NextResponse.json(
        {
          error: 'Releve bancaire incoherent',
          details: {
            lignes_manquantes: !!extraction.lignes_manquantes,
            ecart_solde: ecart,
            message: errMsg,
          },
        },
        { status: 400 },
      )
    }

    // === OVERHAUL: Validate extraction + compute confidence ===
    // Fetch user's sociétés for validation
    const { data: userSocietesForValidation } = await supabase
      .from('societes').select('id, nom, brn')
      .or(`created_by.eq.${user.id}`)
    const { data: userSocFromDossiers } = await supabase
      .from('dossiers').select('societe_id, societes(id, nom, brn)')
      .eq('client_id', user.id)
    const allUserSocietes = [
      ...(userSocietesForValidation || []),
      ...(userSocFromDossiers || []).map((d: any) => d.societes).filter(Boolean),
    ]
    const uniqueUserSocietes = Array.from(new Map(allUserSocietes.map((s: any) => [s.id, s])).values()) as { id: string; nom: string; brn?: string }[]

    // Apply validation
    const validation = validateAndCleanExtraction(extraction, typeDocument, uniqueUserSocietes)
    console.log(`[upload] Extraction validation: société_id=${validation.societe_id}, confidence=${validation.confidence}, needs_confirmation=${validation.needs_confirmation}`)

    // BUG 2 FIX — reject detectedSociete if it equals the uploader's name (OCR confused
    // the document signer/uploader with the actual société). Same for email local-part.
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
    const detectedNorm = norm(detectedSociete)
    const uploaderNorm = norm(uploaderName)
    const emailLocalNorm = norm(uploaderEmail.split('@')[0] || '')
    if (detectedNorm && (detectedNorm === uploaderNorm || (emailLocalNorm.length > 3 && detectedNorm === emailLocalNorm))) {
      console.warn(`[upload] BUG 2 GUARD — detectedSociete "${detectedSociete}" matches uploader name/email — rejecting`)
      detectedSociete = 'INCONNU'
    }

    // BUG 2 FIX — also reject if detectedSociete doesn't match ANY of the user's known
    // sociétés (after fuzzy matching). Fall back to the dossier's société name.
    if (detectedSociete && detectedSociete !== 'INCONNU' && uniqueUserSocietes.length > 0) {
      const detectedClean = norm(detectedSociete)
      const hasFuzzyMatch = uniqueUserSocietes.some(s => {
        const n = norm(s.nom)
        return n === detectedClean || n.includes(detectedClean) || detectedClean.includes(n)
      })
      if (!hasFuzzyMatch && resolvedDossierId) {
        // Try to resolve from the dossier
        const { data: dossierSoc } = await supabase
          .from('dossiers')
          .select('societe:societes(nom)')
          .eq('id', resolvedDossierId)
          .maybeSingle()
        const dossierNom = (dossierSoc?.societe as any)?.nom
        if (dossierNom) {
          console.warn(`[upload] BUG 2 GUARD — "${detectedSociete}" not in user sociétés; falling back to dossier société "${dossierNom}"`)
          detectedSociete = dossierNom
        } else {
          console.warn(`[upload] BUG 2 GUARD — "${detectedSociete}" not in user sociétés; clearing`)
          detectedSociete = 'INCONNU'
        }
      }
    }

    // If validation found a better société match, use it
    if (validation.societe_id && !validation.needs_confirmation) {
      const matchedSociete = uniqueUserSocietes.find(s => s.id === validation.societe_id)
      if (matchedSociete) {
        detectedSociete = matchedSociete.nom
        console.log(`[upload] Société auto-matched via validation: ${detectedSociete}`)
      }
    }

    // Compute extraction confidence
    const extractionConfidence = computeConfidence(extraction, typeDocument)
    console.log(`[upload] Extraction confidence score: ${extractionConfidence}/100`)

    // If confidence too low (< 50), log warning
    if (extractionConfidence < 50) {
      console.warn(`[upload] LOW CONFIDENCE (${extractionConfidence}) for doc ${docId} — type=${typeDocument}, société=${detectedSociete}`)
    }

    // Try to match detected société to client's known sociétés and re-route if needed
    let finalDossierId = resolvedDossierId
    if (detectedSociete && detectedSociete !== 'INCONNU' && !isBankName(detectedSociete)) {
      // Get all sociétés linked to this client (from dossiers + user_societes)
      const { data: clientDossiers } = await supabase
        .from('dossiers').select('id, societe_id, societe:societes(nom)')
        .eq('client_id', user.id)
      const { data: userSocDossiers } = await supabase
        .from('user_societes').select('societe_id').eq('user_id', user.id)
      const userSocIds = new Set((userSocDossiers || []).map(us => us.societe_id))

      // Only match against the user's own sociétés — never create new ones
      const allClientDossiers = (clientDossiers || []).filter((d: any) => {
        const socName = (d.societe as any)?.nom || ''
        return !socName.endsWith('— Personnel') && !socName.endsWith('— En attente')
      })

      if (allClientDossiers.length > 0) {
        const detected = detectedSociete.toLowerCase().replace(/ ltd| limited| sarl| sas| co\.?/gi, '').trim()
        // First: try exact match (case-insensitive)
        let matched = allClientDossiers.find((d: any) => {
          const socName = ((d.societe as any)?.nom || '').toLowerCase().replace(/ ltd| limited| sarl| sas| co\.?/gi, '').trim()
          return socName === detected
        })
        // Second: try tokenized match (all words of detected must be in the société name)
        if (!matched) {
          const detectedTokens = detected.split(/\s+/).filter(t => t.length > 2)
          const candidates = allClientDossiers.filter((d: any) => {
            const socName = ((d.societe as any)?.nom || '').toLowerCase().replace(/ ltd| limited| sarl| sas| co\.?/gi, '').trim()
            return detectedTokens.length > 0 && detectedTokens.every(t => socName.includes(t))
          })
          // Only accept the match if there's exactly ONE candidate (avoid ambiguity)
          if (candidates.length === 1) {
            matched = candidates[0]
          } else if (candidates.length > 1) {
            console.warn(`[upload] Ambiguous match for "${detected}" — ${candidates.length} candidates found, skipping auto-match`)
            needsSocieteConfirmation = true
          }
        }
        if (matched && matched.id !== resolvedDossierId) {
          finalDossierId = matched.id
          await supabase.from('documents').update({ dossier_id: matched.id }).eq('id', doc.id)
          console.log(`[upload] Re-routed to dossier ${matched.id} for société "${(matched.societe as any)?.nom}"`)
        }
      }
    } else if (detectedSociete && isBankName(detectedSociete)) {
      console.log(`[upload] Detected société "${detectedSociete}" is a bank name — skipping société matching, needs confirmation`)
      needsSocieteConfirmation = true
    }

    // ──── AFFECTATION COMPTABLE AUTOMATIQUE (facture fournisseur) ────
    // If this is a supplier invoice, look up automatic accounting assignment
    if (typeDocument === 'facture_fournisseur') {
      const rawFournisseur = extraction.emetteur || extraction.fournisseur || ''
      const fournisseurName: string = typeof rawFournisseur === 'object' && rawFournisseur !== null
        ? (rawFournisseur.nom || rawFournisseur.name || JSON.stringify(rawFournisseur))
        : String(rawFournisseur || '')
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
      confiance_type: extractionConfidence || confianceType,
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

      let entries: Record<string, unknown>[] = []
      try {
        entries = ecritures
          .filter((e: any) => {
            if (!e.compte) return false
            // parseAmountSafe here — the filter just checks presence of a non-zero amount.
            // The authoritative parse happens below with parseAmount (throw on bad).
            return parseAmountSafe(e.debit, 'ecriture.debit') > 0 || parseAmountSafe(e.credit, 'ecriture.credit') > 0
          })
          .map((e: any) => ({
            dossier_id: finalDossierId,
            // Use transaction-level date if available, otherwise document-level date
            date_ecriture: e.date || dateEcriture,
            journal: effectiveJournal,
            numero_piece: e.reference || extraction.numero_reference || null,
            compte: String(e.compte), libelle: e.libelle || file.name,
            debit: parseAmount(e.debit), credit: parseAmount(e.credit), piece_justificative: doc.id,
            // Mark as auto-lettrée if affectation says so
            ...(extraction._auto_lettrage ? { lettrage: 'AUTO' } : {}),
          }))
      } catch (err) {
        const errMsg = err instanceof ParseAmountError
          ? `Écriture comptable avec montant illisible: ${err.message}. Review humaine requise.`
          : `Erreur parsing écritures: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[upload] ecritures parse error: ${errMsg} (doc ${docId})`)
        if (docId) {
          await supabase.from('documents').update({
            statut: 'erreur_ocr',
            message_erreur: errMsg,
          }).eq('id', docId)
        }
        return NextResponse.json(
          { error: 'Écriture comptable illisible', details: { message: errMsg } },
          { status: 400 },
        )
      }
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
            const newBase = parseAmountSafe(emp.salaire_base ?? emp.basic_salary, 'emp.salaire_base')
            // existingEmp.salaire_base comes from the DB (already typed as number) — keep Number()
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
              salaire_base: parseAmountSafe(emp.salaire_base ?? emp.basic_salary, 'emp.salaire_base'),
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
              salaire_base: parseAmountSafe(emp.salaire_base ?? emp.basic_salary, 'emp.salaire_base'),
              heures_sup_montant: parseAmountSafe(emp.overtime_1_5x, 'emp.overtime_1_5x') + parseAmountSafe(emp.overtime_2x, 'emp.overtime_2x'),
              transport_allowance: 0,
              special_allowance_1: parseAmountSafe(emp.special_allowance, 'emp.special_allowance'),
              special_allowance_2: parseAmountSafe(emp.internet_allowance, 'emp.internet_allowance'),
              special_allowance_3: parseAmountSafe(emp.meal_allowance, 'emp.meal_allowance'),
              salaire_net: parseAmountSafe(emp.net_pay, 'emp.net_pay'),
              csg_salarie: parseAmountSafe(emp.csg, 'emp.csg'),
              csg_patronal: parseAmountSafe(emp.er_csg, 'emp.er_csg'),
              nsf_salarie: parseAmountSafe(emp.nsf, 'emp.nsf'),
              nsf_patronal: parseAmountSafe(emp.er_nsf, 'emp.er_nsf'),
              paye: parseAmountSafe(emp.paye, 'emp.paye'),
              training_levy: parseAmountSafe(emp.er_levy, 'emp.er_levy'),
              prgf: parseAmountSafe(emp.er_prgf, 'emp.er_prgf'),
              total_deductions: parseAmountSafe(emp.total_deductions, 'emp.total_deductions'),
              total_charges_patronales: parseAmountSafe(emp.total_er_contributions, 'emp.total_er_contributions'),
              statut: 'valide',
              source: 'ocr_payroll_report',
              document_id: doc.id,
            }
            const { error: upsertErr } = await supabase.from('bulletins_paie').upsert(bulletinData, { onConflict: 'employe_id,periode' })
            if (upsertErr) {
              await supabase.from('bulletins_paie').insert(bulletinData)
            }
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
              const salaireBrut = parseAmountSafe(extraction.salaire_brut, 'salaire_brut')
              await supabase.from('employes').update({
                salaire_base: salaireBrut || undefined,
              }).eq('id', existingEmp.id).lt('salaire_base', salaireBrut)
            }
          } else {
            // Create employee from payslip data
            const { data: newEmp } = await supabase.from('employes').insert({
              societe_id: rhSocieteId,
              nom: nom.toUpperCase(),
              prenom,
              salaire_base: parseAmountSafe(extraction.salaire_brut, 'salaire_brut'),
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
            salaire_base: parseAmountSafe(extraction.salaire_brut, 'salaire_brut') || parseAmountSafe(extraction.salaire_base, 'salaire_base'),
            salaire_net: parseAmountSafe(extraction.salaire_net, 'salaire_net'),
            csg_salarie: parseAmountSafe(extraction.npf_salarie_3pct, 'npf_salarie_3pct') || parseAmountSafe(extraction.csg_salarie, 'csg_salarie'),
            csg_patronal: parseAmountSafe(extraction.npf_patronal_6pct, 'npf_patronal_6pct') || parseAmountSafe(extraction.csg_patronal, 'csg_patronal'),
            paye: parseAmountSafe(extraction.paye, 'paye'),
            nsf_salarie: parseAmountSafe(extraction.nps_salarie, 'nps_salarie') || parseAmountSafe(extraction.nsf_salarie, 'nsf_salarie'),
            nsf_patronal: parseAmountSafe(extraction.nps_employeur, 'nps_employeur') || parseAmountSafe(extraction.nsf_patronal, 'nsf_patronal'),
            training_levy: parseAmountSafe(extraction.hrdc_1pct, 'hrdc_1pct') || parseAmountSafe(extraction.training_levy, 'training_levy'),
            total_deductions: parseAmountSafe(extraction.cotisations_salariales, 'cotisations_salariales') || parseAmountSafe(extraction.total_retenues, 'total_retenues'),
            total_charges_patronales: parseAmountSafe(extraction.cotisations_patronales, 'cotisations_patronales'),
            transport_allowance: parseAmountSafe(extraction.transport_allowance, 'transport_allowance'),
            heures_sup_montant: parseAmountSafe(extraction.heures_sup_montant, 'heures_sup_montant') || parseAmountSafe(extraction.overtime, 'overtime'),
            statut: 'valide',
            source: 'ocr',
            document_id: doc.id,
          }

          // Upsert by employe_id + periode (avoid duplicates)
          const { error: bulErr } = await supabase.from('bulletins_paie')
            .upsert(bulletinData, { onConflict: 'employe_id,periode' })
          if (bulErr) {
            // If upsert fails (constraint might not exist), try insert
            const { error: insertErr } = await supabase.from('bulletins_paie').insert(bulletinData)
            if (insertErr) console.warn('[upload] bulletin insert fallback:', insertErr)
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
          const montant = parseAmountSafe(d.montant, 'declaration.montant')
          if (montant <= 0) continue

          if (type.includes('CSG') || type.includes('NPF')) {
            await supabase.from('declarations_csg_mensuelle').upsert({
              societe_id: csSocieteId,
              periode: periodeStr.length === 7 ? `${periodeStr}-01` : periodeStr,
              montant_csg_salarie: type.includes('salarie') ? montant : 0,
              montant_csg_patronal: type.includes('patronal') ? montant : 0,
              source: 'ocr',
              document_id: doc.id,
            }, { onConflict: 'societe_id,periode' })
          }

          if (type.includes('PAYE')) {
            await supabase.from('declarations_paye_mensuelle').upsert({
              societe_id: csSocieteId,
              periode: periodeStr.length === 7 ? `${periodeStr}-01` : periodeStr,
              montant_paye: montant,
              source: 'ocr',
              document_id: doc.id,
            }, { onConflict: 'societe_id,periode' })
          }
        }

        console.log(`[upload] Charges sociales RH: ${organisme} période ${periodeStr}, ${details.length} lignes`)
      }
    }

    // Auto-create facture record for client/fournisseur invoices
    // BUG 1 FIX — track skip reasons so they appear in document.n8n_result
    let factureSkipReason: string | null = null
    let factureCreated = false
    let factureCreateError: string | null = null
    if ((typeDocument === 'facture_client' || typeDocument === 'facture_fournisseur') && finalDossierId) {
      const { data: dossierForFacture } = await supabase
        .from('dossiers').select('societe_id').eq('id', finalDossierId).maybeSingle()
      const factureSocieteId = dossierForFacture?.societe_id || societeId

      if (!factureSocieteId) {
        factureSkipReason = `no_societe_id (dossier=${finalDossierId} has no societe_id and no fallback)`
      }
      if (factureSocieteId) {
        // Detect devise: explicit field → totaux EUR presence → default MUR
        // NB: on utilise parseAmountSafe sur les fallback-chains — un champ
        // illisible ne doit pas bloquer un autre candidat du chaînage.
        const totaux = extraction.totaux || {}
        const devise =
          extraction.devise ||
          extraction.currency ||
          (parseAmountSafe(totaux.total_ttc_eur, 'totaux.total_ttc_eur') > 0 ? 'EUR' : null) ||
          'MUR'
        // Prefer explicit taux_change from totaux when available
        const fxRate =
          devise !== 'MUR'
            ? (parseAmountSafe(totaux.taux_change?.EUR_to_MUR, 'taux_change.EUR_to_MUR') ||
               parseAmountSafe(totaux.taux_change?.[`${devise}_to_MUR`], `taux_change.${devise}_to_MUR`) ||
               tauxChange[devise] ||
               1)
            : 1
        const montantHT = devise === 'EUR'
          ? (parseAmountSafe(totaux.montant_ht_eur, 'totaux.montant_ht_eur') ||
             parseAmountSafe(extraction.montant_ht, 'montant_ht') ||
             parseAmountSafe(extraction.total_ht, 'total_ht') ||
             parseAmountSafe(extraction.subtotal, 'subtotal') ||
             0)
          : (parseAmountSafe(extraction.montant_ht, 'montant_ht') ||
             parseAmountSafe(totaux.montant_ht_mur, 'totaux.montant_ht_mur') ||
             parseAmountSafe(extraction.montant_ht_mur, 'montant_ht_mur') ||
             parseAmountSafe(extraction.total_ht, 'total_ht') ||
             parseAmountSafe(extraction.subtotal, 'subtotal') ||
             0)
        const montantTVA = devise === 'EUR'
          ? (parseAmountSafe(totaux.tva_eur, 'totaux.tva_eur') ||
             parseAmountSafe(extraction.montant_tva, 'montant_tva') ||
             parseAmountSafe(extraction.tva, 'tva') ||
             0)
          : (parseAmountSafe(extraction.montant_tva, 'montant_tva') ||
             parseAmountSafe(totaux.tva_mur, 'totaux.tva_mur') ||
             parseAmountSafe(extraction.tva_mur, 'tva_mur') ||
             parseAmountSafe(extraction.tva, 'tva') ||
             0)
        const montantTTC = devise === 'EUR'
          ? (parseAmountSafe(totaux.total_ttc_eur, 'totaux.total_ttc_eur') ||
             parseAmountSafe(totaux.net_a_payer_eur, 'totaux.net_a_payer_eur') ||
             parseAmountSafe(extraction.montant_ttc, 'montant_ttc') ||
             parseAmountSafe(extraction.total_ttc, 'total_ttc') ||
             parseAmountSafe(extraction.total, 'total') ||
             parseAmountSafe(extraction.amount, 'amount') ||
             (montantHT + montantTVA))
          : (parseAmountSafe(extraction.montant_ttc, 'montant_ttc') ||
             parseAmountSafe(totaux.total_ttc_mur, 'totaux.total_ttc_mur') ||
             parseAmountSafe(totaux.net_a_payer_mur, 'totaux.net_a_payer_mur') ||
             parseAmountSafe(extraction.total_ttc, 'total_ttc') ||
             parseAmountSafe(extraction.total, 'total') ||
             parseAmountSafe(extraction.amount, 'amount') ||
             (montantHT + montantTVA))

        // Vérification TVA
        const tvaApplicable = extraction.tva_applicable !== false && !extraction.tva_exonere
        const tauxTva = tvaApplicable ? (parseAmountSafe(extraction.taux_tva, 'taux_tva') || 15) : 0
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

        // ── Tiers annuaire lookup — auto-classify offshore/reverse_charge ──
        // Normalize tiers: extraction may return an object {nom, brn, vat_number}
        // or a nested structure — handle all shapes.
        const rawTiers = typeDocument === 'facture_client'
          ? (extraction.destinataire?.nom || extraction.destinataire || extraction.client?.nom || extraction.client || null)
          : (extraction.emetteur?.nom || extraction.emetteur || extraction.fournisseur || null)
        const tiersName: string | null = rawTiers
          ? (typeof rawTiers === 'object'
              ? (rawTiers.nom || rawTiers.name || JSON.stringify(rawTiers))
              : String(rawTiers))
          : null
        const factureTypeForTiers = typeDocument === 'facture_client' ? 'client' : 'fournisseur'
        let clientOffshoreFlag = false
        let reverseChargeFlag = false
        if (tiersName) {
          try {
            const existingTiers = await findTiersInAnnuaire(supabase, tiersName)
            if (existingTiers) {
              clientOffshoreFlag = existingTiers.est_offshore
              reverseChargeFlag = existingTiers.reverse_charge
              await incrementTiersUsage(supabase, existingTiers.id)
              console.log(`[upload] Tiers annuaire HIT: "${tiersName}" → offshore=${clientOffshoreFlag}, reverse_charge=${reverseChargeFlag} (verifie=${existingTiers.verifie})`)
            } else {
              const created = await createTiersFromOcr(supabase, {
                nom: tiersName,
                type_tiers: factureTypeForTiers as 'client' | 'fournisseur',
                confiance: Number(extraction.confidence) || 50,
                brn: extraction.brn || null,
              })
              if (created) {
                console.log(`[upload] Tiers annuaire NEW: "${tiersName}" created (id=${created.id})`)
              }
            }
          } catch (e) {
            console.warn('[upload] Tiers annuaire lookup error (non-blocking):', e)
          }
        }

        const factureData: Record<string, unknown> = {
          societe_id: factureSocieteId,
          dossier_id: finalDossierId,
          numero_facture: extraction.numero_reference || extraction.numero_facture || null,
          type_facture: typeDocument === 'facture_client' ? 'client' : 'fournisseur',
          tiers: tiersName,
          client_offshore: clientOffshoreFlag,
          reverse_charge: reverseChargeFlag,
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

        // Anti-doublon : vérifier si une facture similaire existe déjà
        // (même fournisseur + même montant TTC ±1 + même date ±1 jour)
        const fDate = String(factureData.date_facture || '')
        const fDateObj = fDate ? new Date(fDate) : null
        const fDateMinus1 = fDateObj ? new Date(fDateObj.getTime() - 86400000).toISOString().slice(0, 10) : fDate
        const fDatePlus1 = fDateObj ? new Date(fDateObj.getTime() + 86400000).toISOString().slice(0, 10) : fDate
        const fTTC = Number(factureData.montant_ttc) || 0
        if (factureData.societe_id && factureData.tiers && fTTC > 0 && fDate) {
          const { data: existingDup } = await supabase
            .from('factures')
            .select('id, numero_facture, date_facture, montant_ttc')
            .eq('societe_id', factureData.societe_id as string)
            .ilike('tiers', String(factureData.tiers))
            .gte('date_facture', fDateMinus1)
            .lte('date_facture', fDatePlus1)
            .gte('montant_ttc', fTTC - 1)
            .lte('montant_ttc', fTTC + 1)
            .limit(1)
          if (existingDup && existingDup.length > 0) {
            const dup = existingDup[0] as any
            console.warn(`[upload] DOUBLON FACTURE détecté: ${dup.numero_facture} du ${dup.date_facture} = ${dup.montant_ttc} TTC (même tiers "${factureData.tiers}")`)
            factureCreateError = `Doublon détecté : facture ${dup.numero_facture} du ${dup.date_facture} avec le même montant (${dup.montant_ttc}) existe déjà pour ${factureData.tiers}`
          }
        }

        if (!factureCreateError) {
        const { data: insertedFacture, error: factureError } = await supabase.from('factures').insert(factureData).select('id').maybeSingle()
        if (factureError) {
          factureCreateError = factureError.message
          console.error('[upload] facture insert error:', factureError.message)
        } else {
          factureCreated = true
          // Migration 133 — link ecritures to this facture via facture_id so
          // auto-letterage can find the pair reliably. Ecritures were just
          // inserted above with piece_justificative = doc.id.
          if (insertedFacture?.id && finalDossierId) {
            await supabase.from('ecritures_comptables')
              .update({ facture_id: insertedFacture.id })
              .eq('dossier_id', finalDossierId)
              .eq('piece_justificative', doc.id)
              .is('facture_id', null)
          }
          console.log(`[upload] Facture ${typeDocument} created: ${extraction.numero_reference || 'sans numéro'} — ${montantTTC} ${devise}`)
        }
        } // close if (!factureCreateError)
      }
    } else if (typeDocument === 'facture_client' || typeDocument === 'facture_fournisseur') {
      factureSkipReason = `no_finalDossierId (typeDocument=${typeDocument})`
    } else if (finalDossierId) {
      factureSkipReason = `wrong_typeDocument (${typeDocument})`
    }

    // BUG 1 FIX — surface facture creation status into document.n8n_result so the user
    // can see WHY a facture was not created even though the document is marked traite.
    if (factureCreateError || factureSkipReason || factureCreated) {
      try {
        await supabase.from('documents').update({
          n8n_result: {
            ...(updateData.n8n_result || {}),
            facture_status: factureCreated ? 'created' : (factureCreateError ? 'error' : 'skipped'),
            facture_error: factureCreateError,
            facture_skip_reason: factureSkipReason,
          },
        }).eq('id', docId)
      } catch (e) {
        console.warn('[upload] failed to update document with facture_status:', e)
      }
    }

    // Handle bank statement: auto-detect société + create/update bank account + store statement
    if (typeDocument === 'releve_bancaire') {
      // Do NOT set banque from detectedSociete — it's the account holder, not the bank
      // F2/F3 — resolve currency with strict priority (extraction → IBAN whitelist → block).
      // NO more silent MUR fallback, NO more naive IBAN regex (which matched any trailing
      // 3 letters, including non-currency BBAN suffixes).
      const resolvedCurrency = resolveBankCurrency({
        extractedDevise: extraction.devise,
        iban: extraction.iban,
      })

      if (!resolvedCurrency.confident) {
        const errMsg = `Devise du releve non resolvable: ${resolvedCurrency.reason}`
        console.error(`[upload] F2 BLOCK: ${errMsg} (doc ${docId})`)
        if (docId) {
          await supabase.from('documents').update({
            statut: 'erreur_ocr',
            message_erreur: errMsg,
          }).eq('id', docId)
          try {
            await supabase.from('alertes').insert({
              societe_id: null,
              type_alerte: 'devise_indetermine',
              niveau: 'critique',
              titre: 'Devise du releve indetermine',
              description: errMsg,
              statut: 'active',
            })
          } catch (alertErr) {
            console.error('[upload] alertes insert failed (non-fatal):', alertErr)
          }
        }
        return NextResponse.json(
          { error: 'Devise du releve non determinee', details: { reason: resolvedCurrency.reason } },
          { status: 400 },
        )
      }

      const bankDevise: Currency = resolvedCurrency.currency
      console.log(`[upload] Bank currency resolved: ${bankDevise} (source=${resolvedCurrency.source})`)
      const bankName = extraction.banque || extraction.compte_bancaire || null
      // solde_cloture is CRITICAL (seeds rapprochement). parseAmount throws on garbage;
      // on échec, doc marqué erreur_ocr puis 400 (mêmes semantics que F6).
      let solde: number | null = null
      try {
        const rawSoldeCloture = extraction.solde_cloture
        const rawSoldeFin = extraction.solde_fin
        // Si l'OCR renvoie vide/null sur les deux → solde reste null (comportement d'origine).
        const hasCloture = rawSoldeCloture !== null && rawSoldeCloture !== undefined && rawSoldeCloture !== ''
        const hasFin = rawSoldeFin !== null && rawSoldeFin !== undefined && rawSoldeFin !== ''
        if (hasCloture) {
          solde = parseAmount(rawSoldeCloture)
        } else if (hasFin) {
          solde = parseAmount(rawSoldeFin)
        }
      } catch (err) {
        const errMsg = err instanceof ParseAmountError
          ? `Solde de clôture illisible: ${err.message}. Review humaine requise.`
          : `Erreur parsing solde: ${err instanceof Error ? err.message : String(err)}`
        console.error(`[upload] F4 BLOCK (solde_cloture): ${errMsg} (doc ${docId})`)
        if (docId) {
          await supabase.from('documents').update({
            statut: 'erreur_ocr',
            message_erreur: errMsg,
          }).eq('id', docId)
        }
        return NextResponse.json(
          { error: 'Solde de clôture illisible', details: { message: errMsg } },
          { status: 400 },
        )
      }
      const extractedIBAN = extraction.iban || null
      const extractedNumeroCompte = extraction.numero_compte || extraction.compte_bancaire || null
      const extractedBRN = extraction.brn || null
      const extractedNomSociete = extraction.nom_societe || extraction.titulaire || detectedSociete || null

      // ──── AUTO-DETECT SOCIÉTÉ from PDF (BRN, IBAN, numéro compte, nom) ────
      let bankSocieteId = societeId || null

      // Get user's société IDs for scoped matching
      const { data: userDossiersSoc } = await supabase.from('dossiers').select('societe_id').eq('client_id', user.id)
      const { data: userSocLinks } = await supabase.from('user_societes').select('societe_id').eq('user_id', user.id)
      const userSocieteIds = [...new Set([
        ...(userDossiersSoc || []).map(d => d.societe_id),
        ...(userSocLinks || []).map(us => us.societe_id),
      ].filter(Boolean))]

      if (!bankSocieteId) {
        // 1. Match by BRN — only within user's sociétés
        if (extractedBRN) {
          const { data: byBRN } = await supabase.from('societes').select('id, nom').eq('brn', extractedBRN).in('id', userSocieteIds.length > 0 ? userSocieteIds : ['_none_']).limit(1).maybeSingle()
          if (byBRN) { bankSocieteId = byBRN.id; console.log(`[upload] Société by BRN ${extractedBRN} → ${byBRN.nom}`) }
        }
        // 2. Match by IBAN on existing bank accounts — only within user's sociétés
        if (!bankSocieteId && extractedIBAN) {
          const { data: byIBAN } = await supabase.from('comptes_bancaires').select('id, societe_id').eq('iban', extractedIBAN).in('societe_id', userSocieteIds.length > 0 ? userSocieteIds : ['_none_']).limit(1).maybeSingle()
          if (byIBAN) { bankSocieteId = byIBAN.societe_id; console.log(`[upload] Société by IBAN`) }
        }
        // 3. Match by account number — only within user's sociétés
        if (!bankSocieteId && extractedNumeroCompte) {
          const { data: byNum } = await supabase.from('comptes_bancaires').select('id, societe_id').eq('numero_compte', extractedNumeroCompte).in('societe_id', userSocieteIds.length > 0 ? userSocieteIds : ['_none_']).limit(1).maybeSingle()
          if (byNum) { bankSocieteId = byNum.societe_id; console.log(`[upload] Société by account number ${extractedNumeroCompte}`) }
        }
        // 4. Match by société name (fuzzy) — only against user's own sociétés, skip bank names
        if (!bankSocieteId && extractedNomSociete && extractedNomSociete !== 'INCONNU' && !isBankName(extractedNomSociete)) {
          const sn = extractedNomSociete.toLowerCase().replace(/ ltd| limited| sarl| sas/gi, '').trim()
          const { data: userSocNames } = await supabase.from('societes').select('id, nom').in('id', userSocieteIds.length > 0 ? userSocieteIds : ['_none_'])
          const matched = (userSocNames || []).find((s: any) => {
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
        // ALL lookups MUST be scoped to bankSocieteId
        let existingBank: any = null
        if (extractedIBAN) {
          const { data: byIBAN } = await supabase.from('comptes_bancaires')
            .select('id, societe_id, numero_compte, devise').eq('societe_id', bankSocieteId).eq('iban', extractedIBAN).limit(1).maybeSingle()
          if (byIBAN && byIBAN.societe_id === bankSocieteId) existingBank = byIBAN
        }
        if (!existingBank && normNumeroCompte) {
          const { data: byNum } = await supabase.from('comptes_bancaires')
            .select('id, societe_id, numero_compte, devise').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
          if (byNum && byNum.societe_id === bankSocieteId) existingBank = byNum
        }
        // Only match by banque+devise if bankName is known (avoid "null" collisions)
        if (!existingBank && bankName) {
          const { data: byName } = await supabase.from('comptes_bancaires')
            .select('id, societe_id, numero_compte, devise').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
          if (byName && byName.societe_id === bankSocieteId) existingBank = byName
        }

        // F1 — if we matched an existing account but its currency differs from
        // the one we just extracted, DO NOT update it. The bank has either
        // opened a separate FX sub-account sharing the IBAN/numero, or the
        // current OCR is wrong. Either way, silent rewrite corrupts history.
        let currencyConflict = false
        if (existingBank) {
          const cmp = compareCurrency(existingBank.devise, bankDevise)
          if (cmp === 'conflict') {
            currencyConflict = true
            console.error(
              `[upload] F1 CURRENCY CONFLICT: account ${existingBank.id} devise=${existingBank.devise} vs releve devise=${bankDevise} — will create a NEW account instead of overwriting`,
            )
            try {
              await supabase.from('alertes').insert({
                societe_id: bankSocieteId,
                type_alerte: 'devise_conflit',
                niveau: 'important',
                titre: 'Conflit de devise sur compte bancaire',
                description: `Compte existant ${existingBank.id} en ${existingBank.devise}, releve en ${bankDevise}. Nouveau compte cree, revue humaine requise.`,
                statut: 'active',
              })
            } catch (alertErr) {
              console.error('[upload] alertes insert failed (non-fatal):', alertErr)
            }
            existingBank = null // Force the create-new branch below
          }
        }

        if (existingBank) {
          // HARD GUARD: verify société matches before ANY update
          const { data: guardCheck } = await supabase.from('comptes_bancaires')
            .select('societe_id, numero_compte, devise').eq('id', existingBank.id).single()

          if (guardCheck && guardCheck.societe_id !== bankSocieteId) {
            console.error(`[upload] BLOCKED: Attempt to update account ${existingBank.id} from société ${guardCheck.societe_id} with data for société ${bankSocieteId}`)
            existingBank = null // Force creation of new account instead
          } else {
            // SAFE UPDATE: never overwrite numero_compte if already set
            console.log(`[upload] Updating existing bank account ${existingBank.id}: solde=${solde}, date=${normPeriodeFin}`)
            const bankUpdate: Record<string, unknown> = {}
            if (solde !== null) bankUpdate.solde_actuel = solde
            if (normPeriodeFin) bankUpdate.date_dernier_releve = normPeriodeFin
            if (extractedIBAN && !existingBank.iban) bankUpdate.iban = extractedIBAN
            // NEVER overwrite numero_compte if it already has a value
            if (!guardCheck?.numero_compte && normNumeroCompte) bankUpdate.numero_compte = normNumeroCompte
            // F1 — only write devise when it MATCHES (or when no prior value existed).
            // NEVER on conflict: that branch already bailed out above.
            const deviseCmp = compareCurrency(guardCheck?.devise, bankDevise)
            if (deviseCmp === 'no_existing') {
              bankUpdate.devise = bankDevise
            }
            if (Object.keys(bankUpdate).length > 0) {
              await supabase.from('comptes_bancaires').update(bankUpdate).eq('id', existingBank.id)
            }
          }
        }

        if (!existingBank) {
          // FIX: was `if (!existingBank && bankName)` — silently dropped releves
          // when OCR didn't pull a clean bank name (e.g. OCC statements with
          // the bank logo as an image). We now always create an account when
          // we have a societe_id, falling back to a descriptive placeholder.
          const finalBankName =
            bankName
            || (extractedNomSociete && !isBankName(extractedNomSociete) ? null : extractedNomSociete)
            || (extractedIBAN ? `Banque (${extractedIBAN.slice(0, 4)}…)` : null)
            || 'Banque non identifiée'
          // F1 — when we are here because of a currency conflict with an existing
          // account, disambiguate the numero_compte and IBAN with a devise suffix
          // so future lookups don't collide with the previous account row.
          const suffixedNumero =
            currencyConflict && normNumeroCompte ? `${normNumeroCompte}-${bankDevise}` : normNumeroCompte
          const suffixedIban =
            currencyConflict && extractedIBAN ? `${extractedIBAN}-${bankDevise}` : extractedIBAN
          console.log(
            `[upload] Creating bank account (fallback${currencyConflict ? ', currency conflict' : ''}): ${finalBankName} for societe=${bankSocieteId} (devise=${bankDevise})`,
          )
          const { error: bankInsertError } = await supabase.from('comptes_bancaires').insert({
            societe_id: bankSocieteId,
            banque: finalBankName,
            nom_compte: suffixedNumero || null,
            numero_compte: suffixedNumero,
            iban: suffixedIban,
            devise: bankDevise,
            solde_actuel: solde,
            solde_dernier_releve: solde,
            date_dernier_releve: normPeriodeFin,
            actif: true,
          })
          if (bankInsertError) {
            console.error('[upload] comptes_bancaires insert FAILED:', bankInsertError.message)
          }
          if (!bankName) {
            console.warn('[upload] Banque non identifiée par OCR — compte créé avec libellé de secours. Document:', doc.id)
          }
        }

        // Store bank statement record — find the account we just created/updated
        // HARD GUARD: every lookup must verify societe_id matches
        let bankAccount: any = null
        // Strategy 1: exact IBAN match
        if (extractedIBAN) {
          const { data } = await supabase.from('comptes_bancaires')
            .select('id, societe_id').eq('societe_id', bankSocieteId).eq('iban', extractedIBAN).limit(1).maybeSingle()
          if (data && data.societe_id === bankSocieteId) bankAccount = data
        }
        // Strategy 2: numero_compte + IBAN-derived devise
        if (!bankAccount && normNumeroCompte) {
          const ibanDev = extractedIBAN?.match(/[A-Z]{3}$/)?.[0] || null
          if (ibanDev) {
            const { data } = await supabase.from('comptes_bancaires')
              .select('id, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).eq('devise', ibanDev).limit(1).maybeSingle()
            if (data && data.societe_id === bankSocieteId) bankAccount = data
          }
          if (!bankAccount) {
            const { data } = await supabase.from('comptes_bancaires')
              .select('id, societe_id').eq('societe_id', bankSocieteId).eq('numero_compte', normNumeroCompte).limit(1).maybeSingle()
            if (data && data.societe_id === bankSocieteId) bankAccount = data
          }
        }
        // Strategy 3: banque + devise
        if (!bankAccount && bankName) {
          const { data } = await supabase.from('comptes_bancaires')
            .select('id, societe_id').eq('societe_id', bankSocieteId).eq('banque', bankName).eq('devise', bankDevise).limit(1).maybeSingle()
          if (data && data.societe_id === bankSocieteId) bankAccount = data
        }
        // Final guard: verify the account belongs to the correct société
        if (bankAccount) {
          const { data: finalCheck } = await supabase.from('comptes_bancaires')
            .select('societe_id').eq('id', bankAccount.id).single()
          if (finalCheck && finalCheck.societe_id !== bankSocieteId) {
            console.error(`[upload] BLOCKED releve linking: account ${bankAccount.id} belongs to société ${finalCheck.societe_id}, not ${bankSocieteId}`)
            bankAccount = null
          }
        }
        // FIX: last-resort fallback — if no strict match worked but we DID
        // create (or have) an account for this société + devise, pick it up
        // so the releve is actually stored. Previously a silent skip left
        // docs with statut=traite but no releves_bancaires row.
        if (!bankAccount) {
          const { data: anySocieteAcc } = await supabase.from('comptes_bancaires')
            .select('id, societe_id')
            .eq('societe_id', bankSocieteId)
            .eq('devise', bankDevise)
            .order('date_dernier_releve', { ascending: false, nullsFirst: false })
            .limit(1).maybeSingle()
          if (anySocieteAcc && anySocieteAcc.societe_id === bankSocieteId) {
            bankAccount = anySocieteAcc
            console.log(`[upload] Fallback account ${bankAccount.id} for societe ${bankSocieteId} (devise ${bankDevise})`)
          } else {
            console.warn(`[upload] No bank account at all for société ${bankSocieteId} — releve will not be stored`)
          }
        }

        if (bankAccount) {
          // Normalize transactions: support both "transactions[]" (prompt inline)
          // and "lignes[]" (SYSTEM_PROMPT_RELEVE_BANCAIRE from getSystemPrompt)
          const rawTransactions: any[] = extraction.transactions || []
          const rawLignes: any[] = extraction.lignes || []

          // Convert lignes[] format → transactions[] format.
          // parseAmount (throw on bad) — le montant d'une tx est CRITIQUE.
          // Si UNE ligne échoue, le relevé entier est refusé (marqué erreur_ocr).
          let lignesAsTransactions: Array<{
            date: string
            libelle: string
            debit: number
            credit: number
            solde_apres: unknown
            tiers_detecte: unknown
            compte_comptable: unknown
            statut: string
          }> = []
          let normalizedTransactions: any[] = []
          let totalDebits = 0
          let totalCredits = 0
          let soldeOuverture = 0
          let soldeCloture = 0
          try {
            lignesAsTransactions = rawLignes.map((l: any) => {
              let debit = parseAmount(l.debit)
              let credit = parseAmount(l.credit)
              if (debit === 0 && credit === 0 && l.montant) {
                const montant = parseAmount(l.montant)
                if (l.sens === 'debit') debit = montant
                else credit = montant
              }
              return {
                date: l.date || '',
                libelle: l.libelle || '',
                debit,
                credit,
                solde_apres: l.solde_apres ?? null,
                tiers_detecte: l.tiers_detecte || null,
                compte_comptable: l.compte_debit || l.compte_credit || null,
                statut: (l.confiance || 0) >= 70 ? 'identifie' : ((l.confiance || 0) >= 40 ? 'a_verifier' : 'non_identifie'),
              }
            })

            // Merge: prefer explicit transactions[], fall back to converted lignes[]
            normalizedTransactions = rawTransactions.length > 0
              ? rawTransactions.map((t: any) => ({
                  ...t,
                  debit: parseAmount(t.debit),
                  credit: parseAmount(t.credit),
                }))
              : lignesAsTransactions

            // Compute totals if missing.
            // parseAmountSafe sur les totaux globaux (fallback vers somme recalculée).
            totalDebits = parseAmountSafe(extraction.total_debits, 'total_debits') ||
              normalizedTransactions.reduce((s: number, t: any) => s + parseAmountSafe(t.debit, 'tx.debit'), 0)
            totalCredits = parseAmountSafe(extraction.total_credits, 'total_credits') ||
              normalizedTransactions.reduce((s: number, t: any) => s + parseAmountSafe(t.credit, 'tx.credit'), 0)

            // solde_ouverture est CRITIQUE (equation bilancielle).
            soldeOuverture = parseAmount(
              extraction.solde_ouverture ?? extraction.solde_debut ?? 0,
            )
            soldeCloture = solde ?? parseAmount(extraction.solde_fin ?? 0)
          } catch (err) {
            const errMsg = err instanceof ParseAmountError
              ? `Montant relevé illisible: ${err.message}. Review humaine requise.`
              : `Erreur parsing relevé: ${err instanceof Error ? err.message : String(err)}`
            console.error(`[upload] F4/F5 BLOCK (releve lignes): ${errMsg} (doc ${docId})`)
            if (docId) {
              await supabase.from('documents').update({
                statut: 'erreur_ocr',
                message_erreur: errMsg,
              }).eq('id', docId)
            }
            return NextResponse.json(
              { error: 'Montants du relevé illisibles', details: { message: errMsg } },
              { status: 400 },
            )
          }

          // F7 — sanity check : refuse toute tx dont le montant est anormalement élevé.
          // Heuristique : si max(debit, credit) > SEUIL_ABSOLU (20M MUR équivalent) OU
          // > 50× la médiane des autres tx du relevé → flag 'montant_suspect'.
          const seuilAbsolu = 20_000_000 // 20M MUR = cap raisonnable pour 1 tx bancaire
          const lignesF7: any[] = normalizedTransactions
          if (lignesF7.length > 0) {
            const montants = lignesF7.map(l => Math.max(parseAmountSafe(l.debit, 'f7.debit'), parseAmountSafe(l.credit, 'f7.credit')))
            const sorted = [...montants].sort((a, b) => a - b)
            const median = sorted[Math.floor(sorted.length / 2)] || 0
            const suspectes = lignesF7.filter(l => {
              const m = Math.max(parseAmountSafe(l.debit, 'f7.debit'), parseAmountSafe(l.credit, 'f7.credit'))
              return m > seuilAbsolu || (median > 0 && m > 50 * median)
            })
            if (suspectes.length > 0) {
              const maxMontant = montants.length > 0 ? Math.max(...montants) : 0
              const f7Msg = `F7: ${suspectes.length} tx avec montant anormalement élevé (max=${maxMontant}, médiane=${median}). Review humaine requise.`
              console.error(`[upload] F7 BLOCK: ${f7Msg} (doc ${docId})`)
              // Marque le doc en erreur_ocr pour review humaine, ne PAS créer le relevé
              if (docId) {
                await supabase.from('documents').update({
                  statut: 'erreur_ocr',
                  message_erreur: f7Msg,
                }).eq('id', docId)
              }
              // Alerte compliance — best-effort, schema aligné sur les autres alertes du fichier
              try {
                await supabase.from('alertes').insert({
                  societe_id: bankSocieteId,
                  type_alerte: 'montant_suspect_ocr',
                  niveau: 'critique',
                  titre: 'Montants OCR anormalement élevés',
                  description: `OCR relevé bancaire: ${suspectes.length} tx > 20M MUR ou > 50× médiane. Doc ${docId}.`,
                  statut: 'active',
                })
              } catch (alertErr) {
                console.error('[upload] alertes insert failed (non-fatal):', alertErr)
              }
              return NextResponse.json(
                {
                  error: `Montants anormalement élevés détectés (${suspectes.length} tx). Review humaine requise avant import.`,
                  suspectes: suspectes.slice(0, 5).map((l: any) => ({ libelle: l.libelle, debit: l.debit, credit: l.credit })),
                },
                { status: 400 },
              )
            }
          }

          // Detect ecart
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
      .select('id, nom_fichier, type_fichier, type_document, statut, storage_path, created_at, societe_detectee, confiance_type')
      .eq('id', doc.id).single()

    // If no société was identified and the document needs confirmation
    if (needsSocieteConfirmation || (!societeId && (!finalDoc?.societe_detectee || finalDoc.societe_detectee === 'INCONNU'))) {
      // Mark as en_attente if not already processed
      if (finalDoc?.statut !== 'traite') {
        await supabase.from('documents').update({ statut: 'en_attente' }).eq('id', doc.id)
      }
      return NextResponse.json({
        document: finalDoc || doc,
        needs_confirmation: true,
        societe_detectee: finalDoc?.societe_detectee || null,
        message: 'Société non identifiée — veuillez confirmer la société',
      })
    }

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
