/**
 * POST /api/societes/{societe_id}/pcm/audit
 *
 * Lance l'audit de conformité du PCM. Retourne { ok, errors, warnings,
 * suggestions, stats }. Lecture seule (n'écrit rien sauf l'audit log).
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { auditPCM } from '@/lib/pcm/audit'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const report = await auditPCM(admin, societe_id)
    return NextResponse.json(report)
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

// GET = même chose (pratique pour MCP lecture)
export const GET = POST
