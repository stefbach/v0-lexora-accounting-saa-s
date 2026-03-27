import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
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

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0,
      system: `Tu es un expert-comptable. Analyse ce document et retourne UNIQUEMENT un JSON valide (pas de markdown, pas de backticks).

Si c'est une FACTURE (fournisseur ou client):
{"routing":{"societe":"<nom>","type_document":"facture_fournisseur|facture_client","confiance_type":0},"extraction":{"emetteur":"","destinataire":"","date_document":"YYYY-MM-DD","numero_reference":"","devise":"EUR|USD|GBP|MUR|AUD","montant_ht":0,"montant_tva":0,"montant_ttc":0,"lignes":[{"description":"","montant":0}],"ecritures_comptables":[{"compte":"6xx ou 7xx","libelle":"","debit":0,"credit":0}]}}

Si c'est un RELEVE BANCAIRE:
{"routing":{"societe":"<banque>","type_document":"releve_bancaire","confiance_type":0},"extraction":{"banque":"<nom de la banque>","numero_compte":"","devise":"EUR|USD|GBP|MUR","periode_debut":"YYYY-MM-DD","periode_fin":"YYYY-MM-DD","solde_ouverture":0,"solde_cloture":0,"total_debits":0,"total_credits":0,"transactions":[{"date":"YYYY-MM-DD","libelle":"","debit":0,"credit":0}],"ecritures_comptables":[{"compte":"512","libelle":"","debit":0,"credit":0}]}}

Si c'est une FICHE DE PAIE:
{"routing":{"societe":"<employeur>","type_document":"fiche_paie","confiance_type":0},"extraction":{"employe":"","employeur":"","date_document":"YYYY-MM-DD","periode":"","salaire_brut":0,"salaire_net":0,"cotisations_salariales":0,"cotisations_patronales":0,"ecritures_comptables":[{"compte":"421","libelle":"","debit":0,"credit":0}]}}

Si c'est un document de CHARGES SOCIALES:
{"routing":{"societe":"<nom>","type_document":"charges_sociales","confiance_type":0},"extraction":{"organisme":"","date_document":"YYYY-MM-DD","periode":"","montant_total":0,"detail":[{"type":"","montant":0}],"ecritures_comptables":[{"compte":"43x","libelle":"","debit":0,"credit":0}]}}

Pour tout autre type: utilise type_document="autre" ou "contrat".`,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = aiResponse.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let parsed: any = {}
    try { parsed = JSON.parse(cleaned) } catch { parsed = { routing: { type_document: 'autre', societe: 'INCONNU' }, extraction: {} } }

    const typeDocument = parsed.routing?.type_document || 'autre'
    const detectedSociete = parsed.routing?.societe || 'INCONNU'
    const extraction = parsed.extraction || {}

    // Update document as processed (don't set societe_detectee — it has a CHECK constraint for now)
    const updateData: any = {
      type_document: typeDocument, statut: 'traite',
      n8n_result: { routing: parsed.routing, extraction, metadata: { model: 'claude-sonnet-4-6', processed_at: new Date().toISOString() } },
    }
    // Only set societe_detectee if it matches the old CHECK constraint values, otherwise skip
    const allowedSocietes = ['TIBOK', 'BPO', 'OBESITY_CARE', 'NHS_S2']
    if (detectedSociete !== 'INCONNU' && allowedSocietes.includes(detectedSociete)) {
      updateData.societe_detectee = detectedSociete
    }
    const { error: updateError } = await supabase.from('documents').update(updateData).eq('id', doc.id)
    if (updateError) console.error('[upload] DB UPDATE FAILED:', updateError.message)

    // Auto-create accounting entries
    const ecritures = extraction.ecritures_comptables
    if (Array.isArray(ecritures) && ecritures.length > 0) {
      const journalMap: Record<string, string> = { facture_fournisseur: 'ACH', facture_client: 'VTE', releve_bancaire: 'BNQ', fiche_paie: 'OD', charges_sociales: 'OD' }
      const entries = ecritures
        .filter((e: any) => e.compte && (e.debit > 0 || e.credit > 0))
        .map((e: any) => ({
          dossier_id: resolvedDossierId, date_ecriture: extraction.date_document || new Date().toISOString().split('T')[0],
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
          }).catch(e => console.error('[upload] releves_bancaires insert error:', e))
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
