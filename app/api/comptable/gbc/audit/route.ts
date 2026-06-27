/**
 * GET /api/comptable/gbc/audit?societe_id=…&exercice=2025-2026
 *
 * Génère le dossier d'audit-readiness (pré-audit) : feuilles maîtresses,
 * tests de cohérence et PBC list, à partir des écritures déjà saisies.
 *
 * ⚠️ Pré-audit uniquement — aucune opinion d'audit (cf. DISCLAIMER). L'audit
 * statutaire GBC reste signé par un auditeur agréé MIPA indépendant.
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { generateAuditFile, AuditDataError } from '@/lib/accounting/audit/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const societe_id = searchParams.get('societe_id')
  const exercice = searchParams.get('exercice')
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
  if (!exercice) return NextResponse.json({ error: 'exercice requis' }, { status: 400 })

  const admin = getAdminClient()
  try {
    await assertSocieteAccess(admin, user.id, societe_id)
  } catch (err) {
    if (err instanceof SocieteAccessError) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    throw err
  }

  try {
    const { societe, file } = await generateAuditFile(admin, societe_id, exercice, new Date().toISOString())
    return NextResponse.json({ societe, ...file })
  } catch (err) {
    if (err instanceof AuditDataError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
