/**
 * /api/comptable/exercices/snapshot/[exercice]
 *
 * GET  ?societe_id=xxx&type=bilan|compte_resultat|all
 *      Retourne le snapshot ACTIF figé pour cet exercice + type donné.
 *
 * POST { societe_id, type }
 *      Force la (re)génération d'un snapshot pour cet exercice.
 *      Réservé aux rôles admin / comptable / comptable_dedie / super_admin.
 *
 * Dépend de `lib/accounting/exercice-snapshot.ts` (créé par l'agent CLO-B) :
 *   - getActiveSnapshot(supabase, societeId, exerciceAnnee, type)
 *   - generateSnapshot(supabase, societeId, exerciceAnnee, type, userId)
 *
 * La logique d'auth utilise les helpers existants :
 *   - createServerClient() pour l'auth user
 *   - getAdminClient() pour la lecture/écriture autorisée côté serveur
 *   - assertSocieteAccess() pour le tenant isolation
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  SocieteAccessError,
} from '@/lib/supabase/assert-societe-access'
import {
  getActiveSnapshot,
  generateSnapshot,
  type SnapshotType,
} from '@/lib/accounting/exercice-snapshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_TYPES: ReadonlyArray<SnapshotType> = [
  'bilan',
  'compte_resultat',
  'grand_livre',
  'balance',
  'all',
] as const

function parseType(raw: string | null): SnapshotType | null {
  if (!raw) return 'all'
  if ((VALID_TYPES as readonly string[]).includes(raw)) {
    return raw as SnapshotType
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — lit le snapshot actif (figé) pour (societe, exercice, type)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ exercice: string }> },
) {
  try {
    const { exercice } = await params
    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')
    const type = parseType(searchParams.get('type'))

    if (!exercice) {
      return NextResponse.json({ error: 'exercice manquant' }, { status: 400 })
    }
    if (!societeId) {
      return NextResponse.json(
        { error: 'societe_id requis (?societe_id=…)' },
        { status: 400 },
      )
    }
    if (!type) {
      return NextResponse.json(
        { error: "type invalide (bilan|compte_resultat|all)" },
        { status: 400 },
      )
    }

    const authClient = await createServerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const admin = getAdminClient()

    try {
      await assertSocieteAccess(admin, user.id, societeId)
    } catch (e) {
      if (e instanceof SocieteAccessError) {
        return NextResponse.json({ error: e.message }, { status: 403 })
      }
      throw e
    }

    // NB: signature getActiveSnapshot(societeId, exercice, type, supabase?)
    const snapshot = await getActiveSnapshot(societeId, exercice, type, admin)
    if (!snapshot) {
      return NextResponse.json(
        {
          error: 'Aucun snapshot actif pour cet exercice',
          societe_id: societeId,
          exercice,
          type,
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      ok: true,
      societe_id: societeId,
      exercice,
      type,
      snapshot,
    })
  } catch (e: unknown) {
    console.error('GET /exercices/snapshot/[exercice] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur inconnue' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — force la régénération d'un snapshot
//   body : { societe_id: string, type?: 'bilan'|'compte_resultat'|'all' }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ exercice: string }> },
) {
  try {
    const { exercice } = await params
    if (!exercice) {
      return NextResponse.json({ error: 'exercice manquant' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const societeId: string | undefined = body?.societe_id
    const type = parseType(body?.type ?? 'all')

    if (!societeId) {
      return NextResponse.json(
        { error: 'societe_id requis dans le body' },
        { status: 400 },
      )
    }
    if (!type) {
      return NextResponse.json(
        { error: "type invalide (bilan|compte_resultat|all)" },
        { status: 400 },
      )
    }

    const authClient = await createServerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const admin = getAdminClient()

    // ── Role gate (snapshot generation = action lourde + signée) ─────────
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const role = (profile?.role as string | undefined) ?? ''
    const allowed = ['admin', 'super_admin', 'comptable', 'comptable_dedie']
    if (!allowed.includes(role)) {
      return NextResponse.json(
        { error: 'Réservé aux rôles admin/comptable' },
        { status: 403 },
      )
    }

    // ── Tenant isolation ─────────────────────────────────────────────────
    try {
      await assertSocieteAccess(admin, user.id, societeId)
    } catch (e) {
      if (e instanceof SocieteAccessError) {
        return NextResponse.json({ error: e.message }, { status: 403 })
      }
      throw e
    }

    // NB: signature generateSnapshot(societeId, exercice, type, options, supabase?)
    // Notes : on garde une trace de l'auteur de la regénération manuelle.
    const result = await generateSnapshot(
      societeId,
      exercice,
      type,
      { notes: `manual regen by ${user.id}` },
      admin,
    )

    // Récupère le snapshot complet juste après pour le retourner à l'UI.
    const snapshot = await getActiveSnapshot(societeId, exercice, type, admin)

    return NextResponse.json({
      ok: true,
      societe_id: societeId,
      exercice,
      type,
      snapshot_id: result.snapshot_id,
      snapshot,
    })
  } catch (e: unknown) {
    console.error('POST /exercices/snapshot/[exercice] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur inconnue' },
      { status: 500 },
    )
  }
}
