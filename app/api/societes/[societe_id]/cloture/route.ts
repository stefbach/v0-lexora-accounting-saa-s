/**
 * GET  /api/societes/{societe_id}/cloture          — liste des périodes + statut
 * POST /api/societes/{societe_id}/cloture          — clôturer ou déclôturer
 *      Body: { periode: 'YYYY-MM', action: 'cloturer' | 'decloturer', motif? }
 *
 * Clôture mensuelle comptable. Accès comptable + client (RLS société).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { writeAuditLog } from '@/lib/pcm/audit-log'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { data, error } = await admin
      .from('cloture_mensuelle')
      .select('periode, statut, cloture_at, cloture_par, decloture_at, decloture_motif')
      .eq('societe_id', societe_id)
      .order('periode', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ periodes: data || [] })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

const bodySchema = z.object({
  periode: z.string().regex(/^\d{4}-\d{2}$/, 'periode YYYY-MM requise'),
  action: z.enum(['cloturer', 'decloturer']),
  motif: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const raw = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalide', details: parsed.error.issues }, { status: 400 })
    }
    const { periode, action, motif } = parsed.data
    const periodeDate = `${periode}-01`
    const now = new Date().toISOString()

    if (action === 'cloturer') {
      const { error } = await admin.from('cloture_mensuelle').upsert({
        societe_id, periode: periodeDate, statut: 'cloture',
        cloture_at: now, cloture_par: user.id,
        decloture_at: null, decloture_par: null, decloture_motif: null,
      }, { onConflict: 'societe_id,periode' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      await writeAuditLog(admin, {
        societe_id, action: 'cloturer', entity_type: 'periode', entity_id: periode,
        after_state: { periode, statut: 'cloture' },
        actor_id: user.id, actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
        reason: `Clôture mensuelle ${periode}`,
      })
      return NextResponse.json({ success: true, periode, statut: 'cloture' })
    }

    // decloturer
    if (!motif) {
      return NextResponse.json({ error: 'motif requis pour déclôturer' }, { status: 400 })
    }
    const { error } = await admin.from('cloture_mensuelle').upsert({
      societe_id, periode: periodeDate, statut: 'ouvert',
      decloture_at: now, decloture_par: user.id, decloture_motif: motif,
    }, { onConflict: 'societe_id,periode' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog(admin, {
      societe_id, action: 'decloturer', entity_type: 'periode', entity_id: periode,
      after_state: { periode, statut: 'ouvert' },
      actor_id: user.id, actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
      reason: motif,
    })
    return NextResponse.json({ success: true, periode, statut: 'ouvert' })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
