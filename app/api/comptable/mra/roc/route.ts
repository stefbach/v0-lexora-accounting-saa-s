import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { validateRocBoardComposition } from '@/lib/mra/roc-validation'

export const dynamic = 'force-dynamic'

/** GET — ROC Annual Return */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice   = searchParams.get('exercice')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase.from('roc_annual_returns').select('*').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ roc: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const contentType = request.headers.get('content-type') || ''

    // ── Branche multipart : soumission manuelle ROC + upload PDF accusé ────
    // Le ROC se dépose via le portail CBRD (Companies and Business Registration
    // Department) — pas d'API ni d'endpoint MRA e-services automatisable. Le
    // comptable soumet manuellement sur le portail, récupère un accusé PDF +
    // une référence de dépôt, et les remonte ici pour preuve et clôture.
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const societe_id = String(form.get('societe_id') || '')
      const exercice   = String(form.get('exercice') || '')
      const action     = String(form.get('action') || '')
      const ack_ref    = String(form.get('mra_ack_ref') || '').trim()
      const file       = form.get('ack_pdf') as File | null

      if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })
      if (action !== 'submit_manual') return NextResponse.json({ error: 'action invalide' }, { status: 400 })
      if (!ack_ref) return NextResponse.json({ error: 'Référence MRA/CBRD requise' }, { status: 400 })
      if (!file) return NextResponse.json({ error: 'PDF accusé de réception requis' }, { status: 400 })
      if (file.type !== 'application/pdf') return NextResponse.json({ error: 'Le fichier doit être un PDF' }, { status: 400 })
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'PDF trop volumineux (max 10MB)' }, { status: 400 })

      const supabase = getAdminClient()

      // Lecture état courant pour merger notes JSON sans écraser.
      const { data: current } = await supabase.from('roc_annual_returns')
        .select('notes, statut').eq('societe_id', societe_id).eq('exercice', exercice).maybeSingle()
      if (!current) return NextResponse.json({ error: 'ROC non initialisé pour cet exercice' }, { status: 400 })

      const safeName = (file.name || 'ack.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `mra-acks/${societe_id}/roc/${exercice}/${Date.now()}_${safeName}`
      const buf = Buffer.from(await file.arrayBuffer())
      const up = await supabase.storage.from('documents').upload(storagePath, buf, {
        contentType: 'application/pdf', upsert: false,
      })
      if (up.error) return NextResponse.json({ error: `Upload storage: ${up.error.message}` }, { status: 500 })

      // Merge metadata dans notes (JSON inline, fallback texte si legacy).
      let notesObj: Record<string, any> = {}
      if (current.notes) {
        try { notesObj = JSON.parse(current.notes) } catch { notesObj = { _legacy_notes: current.notes } }
      }
      notesObj.manual_submission = {
        submitted_at: new Date().toISOString(),
        submitted_by: user.id,
        ack_ref,
        ack_pdf_path: storagePath,
        status: 'submitted_manual',
      }

      // CHECK constraint sur statut = draft|review|approved|submitted|accepted.
      // 'submitted_manual' n'y figure pas — on persiste donc 'submitted' au
      // niveau SQL + on retourne 'submitted_manual' au client. Le flag réel
      // est conservé dans notes.manual_submission.status pour l'audit.
      const { error } = await supabase.from('roc_annual_returns').update({
        statut: 'submitted',
        filing_ref: ack_ref,
        date_filing: new Date().toISOString().slice(0, 10),
        notes: JSON.stringify(notesObj),
        updated_at: new Date().toISOString(),
      }).eq('societe_id', societe_id).eq('exercice', exercice)
      if (error) {
        await supabase.storage.from('documents').remove([storagePath]).catch(() => {})
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, statut: 'submitted_manual', ack_ref, ack_pdf_path: storagePath })
    }

    const body = await request.json()
    const { societe_id, exercice, action, payload } = body
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const supabase = getAdminClient()
    if (action === 'save') {
      const { data, error } = await supabase.from('roc_annual_returns').upsert({
        societe_id, exercice, ...payload, updated_at: new Date().toISOString(),
      }, { onConflict: 'societe_id,exercice' }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, roc: data })
    }

    if (['submit_review', 'approve', 'submit_mra'].includes(action)) {
      // Companies Act 2001 s.223 — bloquer le passage si directors/shareholders absents
      // ou si la répartition d'actionnariat ne fait pas 100%.
      if (action === 'submit_review') {
        const { data: rocRow } = await supabase.from('roc_annual_returns')
          .select('directors, shareholders').eq('societe_id', societe_id).eq('exercice', exercice).single()
        const check = validateRocBoardComposition(rocRow?.directors, rocRow?.shareholders)
        if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
      }
      const updateFields: any = { updated_at: new Date().toISOString() }
      if (action === 'submit_review') { updateFields.statut = 'review'; updateFields.reviewer_id = user.id }
      if (action === 'approve')       { updateFields.statut = 'approved'; updateFields.approver_id = user.id }
      if (action === 'submit_mra')    { updateFields.statut = 'submitted'; updateFields.date_filing = new Date().toISOString().slice(0, 10) }
      const { error } = await supabase.from('roc_annual_returns').update(updateFields).eq('societe_id', societe_id).eq('exercice', exercice)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, statut: updateFields.statut })
    }
    return NextResponse.json({ error: 'action invalide' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
