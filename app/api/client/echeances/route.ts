import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { CLAUDE_CONFIG } from '@/lib/ai/prompts'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// POST /api/client/echeances/extract-batch
// Extracts date_echeance from PDFs for factures that don't have one
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({}))
    const { societe_id, action } = body

    // Action: apply +30 days to all factures without date_echeance
    if (action === 'apply_30_days') {
      if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

      const { data: factures } = await supabase
        .from('factures')
        .select('id, date_facture')
        .eq('societe_id', societe_id)
        .is('date_echeance', null)
        .not('statut', 'in', '("paye","annule")')

      let updated = 0
      for (const f of factures || []) {
        if (!f.date_facture) continue
        const dueDate = new Date(new Date(f.date_facture).getTime() + 30 * 86400000).toISOString().slice(0, 10)
        await supabase.from('factures').update({ date_echeance: dueDate }).eq('id', f.id)
        updated++
      }

      return NextResponse.json({ success: true, updated })
    }

    // Action: extract date_echeance from PDFs via Claude
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Get factures without date_echeance that have a linked document
    const { data: factures } = await supabase
      .from('factures')
      .select('id, document_id, tiers, montant_ttc')
      .eq('societe_id', societe_id)
      .is('date_echeance', null)
      .not('statut', 'in', '("paye","annule")')
      .not('document_id', 'is', null)
      .limit(20)

    if (!factures || factures.length === 0) {
      return NextResponse.json({ total: 0, processed: 0, found: 0, not_found: 0, errors: 0 })
    }

    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    let found = 0, notFound = 0, errors = 0

    for (const facture of factures) {
      try {
        // Get document storage path
        const { data: doc } = await supabase
          .from('documents')
          .select('storage_path, type_fichier')
          .eq('id', facture.document_id)
          .single()

        if (!doc?.storage_path) { notFound++; continue }

        // Download file
        const { data: fileData } = await supabase.storage.from('documents').download(doc.storage_path)
        if (!fileData) { errors++; continue }

        const buffer = Buffer.from(await fileData.arrayBuffer())
        const base64 = buffer.toString('base64')
        const isPdf = doc.type_fichier === 'pdf'
        const isImage = ['jpeg', 'jpg', 'png'].includes(doc.type_fichier || '')

        let messageContent: any
        if (isPdf) {
          messageContent = [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Find ONLY the due date or payment deadline on this invoice. Return ONLY JSON: {"date_echeance": "YYYY-MM-DD"} or {"date_echeance": null} if not found.' },
          ]
        } else if (isImage) {
          const mt = doc.type_fichier === 'png' ? 'image/png' : 'image/jpeg'
          messageContent = [
            { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
            { type: 'text', text: 'Find ONLY the due date or payment deadline on this invoice. Return ONLY JSON: {"date_echeance": "YYYY-MM-DD"} or {"date_echeance": null} if not found.' },
          ]
        } else {
          notFound++; continue
        }

        const stream = anthropic.messages.stream({
          model: CLAUDE_CONFIG.model,
          max_tokens: 256,
          temperature: 0,
          messages: [{ role: 'user', content: messageContent }],
        })
        const response = await stream.finalMessage()
        const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

        // Parse JSON response
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        let parsed: any = null
        try { parsed = JSON.parse(cleaned) } catch {
          const match = cleaned.match(/\{[\s\S]*\}/)
          if (match) try { parsed = JSON.parse(match[0]) } catch {}
        }

        if (parsed?.date_echeance) {
          await supabase.from('factures').update({ date_echeance: parsed.date_echeance }).eq('id', facture.id)
          found++
        } else {
          notFound++
        }
      } catch {
        errors++
      }
    }

    return NextResponse.json({
      total: factures.length,
      processed: factures.length,
      found,
      not_found: notFound,
      errors,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
