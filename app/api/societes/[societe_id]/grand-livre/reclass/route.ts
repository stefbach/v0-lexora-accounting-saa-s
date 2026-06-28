/**
 * POST /api/societes/{societe_id}/grand-livre/reclass
 *
 * Reclasse des écritures d'un compte vers un autre. dry_run obligatoire en
 * premier (preview), puis exécution avec dry_run=false.
 *
 * Body : {
 *   from_compte, to_compte,
 *   filter?: { date_debut, date_fin, libelle_contains, journal },
 *   dry_run: boolean,
 *   reason: string
 * }
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { z } from 'zod'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { reclassEcritures } from '@/lib/pcm/reclass'
import { writeAuditLog } from '@/lib/pcm/audit-log'
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
  from_compte: z.string().min(1),
  to_compte: z.string().min(1),
  filter: z.object({
    date_debut: z.string().optional(),
    date_fin: z.string().optional(),
    libelle_contains: z.string().optional(),
    journal: z.string().optional(),
  }).optional(),
  dry_run: z.boolean().default(true),
  reason: z.string().min(1, 'reason requis'),
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
    const b = parsed.data

    const result = await reclassEcritures(admin, {
      societeId: societe_id,
      fromCompte: b.from_compte,
      toCompte: b.to_compte,
      filter: b.filter,
      dryRun: b.dry_run,
    })

    // Audit uniquement si exécution réelle
    if (!b.dry_run) {
      await writeAuditLog(admin, {
        societe_id, action: 'reclass_ecritures', entity_type: 'ecriture',
        entity_id: `${b.from_compte}->${b.to_compte}`,
        after_state: { from: b.from_compte, to: b.to_compte, executed: result.executed, filter: b.filter },
        actor_id: user.id, actor_type: user.source === 'api_key' ? 'mcp_llm' : 'user',
        reason: b.reason,
      })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (e: any) {
    if (isPCMError(e)) return NextResponse.json(e.toJSON(), { status: e.httpStatus })
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
