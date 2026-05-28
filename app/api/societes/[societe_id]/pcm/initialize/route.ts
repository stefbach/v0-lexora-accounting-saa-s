/**
 * POST /api/societes/{societe_id}/pcm/initialize
 *
 * Applique un template CORE + modules optionnels au PCM d'une société.
 * Idempotent : ré-appel = même état final, pas de doublon.
 *
 * Body : { template_code?: string, modules?: string[] }
 *   template_code défaut 'core_maurice'
 */

import { NextResponse } from 'next/server'
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
  template_code: z.string().min(1).default('core_maurice'),
  modules: z.array(z.string().min(1)).default([]),
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

    const result = await initializePCM(admin, {
      societeId: societe_id,
      coreTemplateCode: parsed.data.template_code,
      moduleCodes: parsed.data.modules,
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
