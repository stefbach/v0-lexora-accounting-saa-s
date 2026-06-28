/**
 * POST /api/societes/{societe_id}/pcm/modules/activate
 *   Body: { module_code: string }
 * Active un module PCM (vérifie prérequis, idempotent).
 *
 * GET /api/societes/{societe_id}/pcm/modules/activate
 *   Liste les modules actuellement activés.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { z } from 'zod'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { initializePCM } from '@/lib/pcm/initialize'
import { isPCMError } from '@/lib/pcm/errors'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const bodySchema = z.object({
  module_code: z.string().min(1),
  core_template_code: z.string().min(1).default('core_maurice'),
})

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

    const raw = await request.json().catch(() => ({}))
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalide', details: parsed.error.issues }, { status: 400 })
    }

    const result = await initializePCM(admin, {
      societeId: societe_id,
      coreTemplateCode: parsed.data.core_template_code,
      moduleCodes: [parsed.data.module_code],
      actorId: user.id,
      actorType: user.source === 'api_key' ? 'mcp_llm' : 'user',
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    if (isPCMError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus })
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ societe_id: string }> },
) {
  try {
    const { societe_id } = await params
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    const { data, error } = await admin
      .from('pcm_modules_actifs')
      .select('template_code, version_applied, activated_at')
      .eq('societe_id', societe_id)
      .order('activated_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ modules: data || [] })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
