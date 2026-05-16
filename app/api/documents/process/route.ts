import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createEcrituresForFacture } from '@/lib/accounting/ecritures-factures'
import { getTauxChange } from '@/lib/taux-change'

const DEVISE_SYMBOL_MAP: Record<string, string> = {
  '€': 'EUR', 'EUR': 'EUR', 'EURO': 'EUR', 'EUROS': 'EUR',
  '$': 'USD', 'USD': 'USD', 'US$': 'USD',
  '£': 'GBP', 'GBP': 'GBP',
  'Rs': 'MUR', 'MUR': 'MUR', 'RS': 'MUR', 'RUPEES': 'MUR',
  'ZAR': 'ZAR', 'R': 'ZAR',
}

function normalizeDevise(raw: any): string {
  if (!raw) return 'MUR'
  const s = String(raw).trim().toUpperCase()
  // Match prefix/exact
  for (const [k, v] of Object.entries(DEVISE_SYMBOL_MAP)) {
    if (s === k.toUpperCase() || s.startsWith(k.toUpperCase())) return v
  }
  return s.slice(0, 5)
}

export const maxDuration = 300

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  // Auth : soit session web (auth.getUser), soit X-Internal-Token (bot Telegram, n8n)
  const internalToken = request.headers.get('x-internal-token')
  const isInternal = !!internalToken && internalToken === process.env.INTERNAL_API_TOKEN
  if (!isInternal) {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  let documentId = ''

  try {
    const body = await request.json()
    documentId = body.document_id
    const storagePath = body.storage_path
    const nomFichier = body.nom_fichier

    if (!documentId || !storagePath || !nomFichier) {
      return NextResponse.json({ error: 'Paramètres manquants', received: body }, { status: 400 })
    }

    const supabase = getSupabase()

    // Récupère le contexte société pour aider Claude à distinguer
    // facture_client (émise par MA société) vs facture_fournisseur (reçue).
    const { data: docCtx } = await supabase
      .from('documents')
      .select('dossier_id, dossiers!inner(societe_id, societes!inner(nom, brn))')
      .eq('id', documentId)
      .maybeSingle()
    const myCompany = (docCtx as any)?.dossiers?.societes?.nom || null
    const myBrn = (docCtx as any)?.dossiers?.societes?.brn || null

    // Step 1: Update status
    await supabase.from('documents').update({ statut: 'en_cours' }).eq('id', documentId)

    // Step 2: Download file
    const { data: fileData, error: dlError } = await supabase.storage.from('documents').download(storagePath)
    if (dlError || !fileData) {
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: `Download failed: ${dlError?.message}` } }).eq('id', documentId)
      return NextResponse.json({ error: 'Download failed', details: dlError?.message }, { status: 500 })
    }

    // Step 3: Prepare content
    const ext = nomFichier.split('.').pop()?.toLowerCase() || ''
    const isVisual = ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext)
    const isExcel = ['xlsx', 'xls'].includes(ext)
    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Pour les fichiers Excel, on parse le contenu en CSV/texte pour Claude
    // (vision Anthropic n'accepte pas les xlsx).
    let excelText = ''
    if (isExcel) {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' })
        const sheets = wb.SheetNames.map(name => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: ';' })
          return `=== Feuille : ${name} ===\n${csv.slice(0, 8000)}`
        })
        excelText = sheets.join('\n\n').slice(0, 30000)
      } catch (e: any) {
        await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: `Parse XLSX failed: ${e?.message}` } }).eq('id', documentId)
        return NextResponse.json({ error: 'Parse XLSX failed', details: e?.message }, { status: 500 })
      }
    }

    const mediaType = ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : 'image/jpeg'

    // Step 4: Call Anthropic
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const contentBlock = ext === 'pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png', data: base64 } }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: 0,
      system: `Tu es un expert-comptable mauricien.

CONTEXTE UTILISATEUR :
- Société active : "${myCompany || 'INCONNU'}"${myBrn ? ` (BRN ${myBrn})` : ''}

RÈGLE DE CLASSIFICATION FACTURE :
- type_document="facture_client" SI l'émetteur de la facture est "${myCompany || 'la société active'}" (= MA société émet la facture, c'est une VENTE).
- type_document="facture_fournisseur" SI le destinataire/acheteur est "${myCompany || 'la société active'}" (= MA société reçoit la facture, c'est un ACHAT).
- Si MA société ne figure ni comme émetteur ni comme destinataire identifiable → préfère facture_fournisseur par défaut (cas le plus courant : facture entrante).

Analyse ce document et retourne UN JSON (sans markdown, sans backticks) :
{
  "routing": {
    "societe": "<nom société ou INCONNU>",
    "type_document": "<facture_fournisseur|facture_client|releve_bancaire|charges_sociales|fiche_paie|contrat|autre>",
    "confiance_type": <0-100>
  },
  "extraction": {
    "emetteur": "",
    "destinataire": "",
    "date_document": "",
    "date_echeance": "",
    "numero_reference": "",
    "devise": "",
    "montant_ht": 0,
    "montant_tva": 0,
    "montant_ttc": 0,
    "lignes": [{"description": "", "montant": 0}],
    "ecritures_comptables": [{"compte": "", "libelle": "", "debit": 0, "credit": 0}]
  }
}`,
      messages: [{
        role: 'user',
        content: isVisual
          ? [contentBlock, { type: 'text' as const, text: 'Analyse ce document comptable.' }]
          : isExcel
            ? `Voici le contenu d'un fichier Excel (CSV par feuille, séparateur ;). Analyse-le comme un document comptable mauricien :\n\n${excelText}`
            : `Analyse ce document: ${await fileData.text()}`
      }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('')

    let parsed: any = {}
    try {
      parsed = JSON.parse(text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
    } catch {
      parsed = { routing: { type_document: 'autre', societe: 'INCONNU', confiance_type: 0 }, extraction: {} }
    }

    const typeDoc = parsed.routing?.type_document || 'autre'
    const societe = parsed.routing?.societe || 'INCONNU'
    const extraction = parsed.extraction || {}
    const duration = Date.now() - startTime

    // Step 5: Save results
    const updateData: any = {
      type_document: typeDoc,
      statut: 'traite',
      n8n_result: { routing: parsed.routing, extraction, metadata: { processing_time_ms: duration, model: 'claude-haiku-4-5-20251001' } },
    }
    if (societe !== 'INCONNU') updateData.societe_detectee = societe

    await supabase.from('documents').update(updateData).eq('id', documentId)

    // Step 6: Auto-create accounting entries
    // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on insère direct dans V2.
    // V2 exige societe_id (NOT NULL) → on le récupère via le dossier du document.
    // Renommage : compte → numero_compte, debit → debit_mur, credit → credit_mur.
    const ecritures = extraction.ecritures_comptables
    if (Array.isArray(ecritures) && ecritures.length > 0) {
      const { data: doc } = await supabase.from('documents').select('dossier_id').eq('id', documentId).single()
      if (doc?.dossier_id) {
        // Lookup societe_id from dossier (NOT NULL on V2).
        const { data: dossierRow } = await supabase
          .from('dossiers').select('societe_id').eq('id', doc.dossier_id).maybeSingle()
        const societeId = dossierRow?.societe_id || null

        const journalMap: Record<string, string> = { facture_fournisseur: 'ACH', facture_client: 'VTE', releve_bancaire: 'BNQ' }
        const entries = ecritures
          .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
          .map((e: any) => ({
            dossier_id: doc.dossier_id,
            societe_id: societeId,
            date_ecriture: extraction.date_document || new Date().toISOString().split('T')[0],
            journal: journalMap[typeDoc] || 'OD',
            numero_piece: extraction.numero_reference || null,
            numero_compte: String(e.compte),
            libelle: e.libelle || nomFichier,
            debit_mur: Number(e.debit) || 0,
            credit_mur: Number(e.credit) || 0,
            piece_justificative: documentId,
          }))
        if (entries.length > 0 && societeId) {
          await supabase.from('ecritures_comptables_v2').insert(entries)
        } else if (entries.length > 0 && !societeId) {
          console.warn(`[process] Skipping ecritures insert: dossier ${doc.dossier_id} has no societe_id`)
        }

        // Step 6b: Auto-create row in `factures` (table métier — alimente
        // /client/factures et le CA). On crée la facture uniquement pour les
        // types facture_client / facture_fournisseur, et seulement si on n'a
        // pas déjà créé une facture liée à ce document (idempotence).
        if (societeId && (typeDoc === 'facture_fournisseur' || typeDoc === 'facture_client')) {
          const { data: existing } = await supabase
            .from('factures')
            .select('id')
            .eq('document_id', documentId)
            .maybeSingle()
          if (!existing) {
            const tiersName = typeDoc === 'facture_fournisseur'
              ? (extraction.emetteur || extraction.fournisseur || extraction.tiers || null)
              : (extraction.destinataire || extraction.client || extraction.tiers || null)
            const tiersStr = typeof tiersName === 'string'
              ? tiersName
              : (tiersName?.nom || tiersName?.name || tiersName?.raison_sociale || null)
            const dateF = extraction.date_document || extraction.date_facture || null
            const dateValid = dateF && /^\d{4}-\d{2}-\d{2}$/.test(dateF) ? dateF : null
            const dateEcheance = extraction.date_echeance && /^\d{4}-\d{2}-\d{2}$/.test(extraction.date_echeance)
              ? extraction.date_echeance : null
            const ht = Number(extraction.montant_ht) || 0
            const tva = Number(extraction.montant_tva) || 0
            const ttc = Number(extraction.montant_ttc) || (ht + tva) || 0
            const devise = normalizeDevise(extraction.devise)
            const taux = ht > 0 && tva > 0 ? Number(((tva / ht) * 100).toFixed(2)) : 15
            // Conversion en MUR pour alimenter le CA dashboard (qui somme montant_mur)
            let tauxChange = 1
            let montantMur = ttc
            if (devise !== 'MUR') {
              try {
                const rates = await getTauxChange()
                const r = rates[devise]
                if (r && r > 0) {
                  tauxChange = r
                  montantMur = ttc * r
                }
              } catch (e: any) {
                console.warn('[process] getTauxChange failed:', e?.message)
              }
            }
            const { data: facInserted, error: facErr } = await supabase.from('factures').insert({
              societe_id: societeId,
              dossier_id: doc.dossier_id,
              numero_facture: extraction.numero_reference || extraction.numero_facture || null,
              type_facture: typeDoc === 'facture_fournisseur' ? 'fournisseur' : 'client',
              tiers: tiersStr,
              description: nomFichier,
              date_facture: dateValid,
              date_echeance: dateEcheance,
              devise,
              taux_change: tauxChange,
              montant_ht: ht,
              montant_tva: tva,
              montant_ttc: ttc,
              taux_tva: taux,
              montant_mur: montantMur,
              statut: 'en_attente',
              document_id: documentId,
            }).select('id').single()
            if (facErr) {
              console.error('[process] Insert factures failed:', facErr.message)
            } else if (facInserted && dateValid) {
              // Génère les écritures comptables au format PCM Maurice via le
              // helper canonique (411/707 pour ventes, 401/607 pour achats,
              // + 4457/4456 TVA). Sans ça, le CA dans le dashboard et les
              // états financiers ne s'incrémente pas (calcul par compte 70x).
              const ecrRes = await createEcrituresForFacture(supabase, {
                id: facInserted.id,
                societe_id: societeId,
                numero_facture: extraction.numero_reference || extraction.numero_facture || `DOC-${facInserted.id.slice(0, 8)}`,
                tiers: tiersStr || 'INCONNU',
                date_facture: dateValid,
                montant_ht: ht,
                montant_tva: tva,
                montant_ttc: ttc,
                type_facture: typeDoc === 'facture_fournisseur' ? 'fournisseur' : 'client',
                devise,
                taux_change: tauxChange,
                montant_mur: montantMur,
              })
              if (!ecrRes.ok) {
                console.error('[process] createEcrituresForFacture failed:', ecrRes.error)
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, type_document: typeDoc, societe_detectee: societe, processing_time_ms: duration })

  } catch (e: any) {
    const msg = e?.message || 'Unknown error'
    console.error(`[process] ERROR: ${msg}`, e?.stack)

    if (documentId) {
      const supabase = getSupabase()
      await supabase.from('documents').update({ statut: 'erreur', n8n_result: { error: msg } }).eq('id', documentId)
    }

    return NextResponse.json({ error: msg, stack: e?.stack?.split('\n').slice(0, 5) }, { status: 500 })
  }
}
