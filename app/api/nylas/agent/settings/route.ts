import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { getAgentSettings, upsertAgentSettings, type AgentSettings } from '@/lib/nylas/agent-settings'

export const dynamic = 'force-dynamic'

/** GET /api/nylas/agent/settings?societe_id= — consignes de l'agent. */
export async function GET(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const admin = getAdminClient()
  const settings = await getAgentSettings(admin, user.id, req.nextUrl.searchParams.get('societe_id'))
  return NextResponse.json({ settings })
}

/** PUT /api/nylas/agent/settings — enregistre les consignes. */
export async function PUT(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const b = await req.json().catch(() => null) as (Partial<AgentSettings> & { societe_id?: string | null }) | null
  if (!b) return NextResponse.json({ error: 'Corps invalide' }, { status: 400 })

  const patch: Partial<AgentSettings> = {}
  if (typeof b.instructions === 'string') patch.instructions = b.instructions.slice(0, 8000)
  if (Array.isArray(b.categories)) patch.categories = b.categories.map((c) => String(c).slice(0, 60)).filter(Boolean).slice(0, 30)
  if (typeof b.signature === 'string') patch.signature = b.signature.slice(0, 2000)
  if (typeof b.tone === 'string') patch.tone = b.tone.slice(0, 120)
  if (typeof b.auto_triage === 'boolean') patch.auto_triage = b.auto_triage

  const admin = getAdminClient()
  await upsertAgentSettings(admin, user.id, b.societe_id ?? null, patch)
  const settings = await getAgentSettings(admin, user.id, b.societe_id ?? null)
  return NextResponse.json({ ok: true, settings })
}
