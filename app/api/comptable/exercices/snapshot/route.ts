/**
 * /api/comptable/exercices/snapshot
 *
 * GET ?societe_id=xxx&limit=50&offset=0&type=bilan|compte_resultat|all
 *     Liste paginée des snapshots figés pour une société.
 *
 * Ordonné du plus récent au plus ancien (generated_at desc).
 * Renvoie aussi `total` pour faciliter la pagination côté UI.
 *
 * Auth : user authentifié + assertSocieteAccess.
 *
 * Source de vérité = table `exercice_snapshots` (CLO-A/CLO-B mig 422).
 * Colonnes : id, societe_id, exercice, snapshot_type, generated_at,
 *            generated_by, is_active, cloture_id, notes,
 *            soldes_json, totaux_json, ratios_json.
 *
 * Cette liste ne renvoie PAS les payloads JSON volumineux (soldes_json
 * peut faire plusieurs Mo) — l'UI doit appeler /[exercice] pour les détails.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  SocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')
    const typeFilter = searchParams.get('type')
    const activeOnly = searchParams.get('active_only') === '1'

    if (!societeId) {
      return NextResponse.json(
        { error: 'societe_id requis (?societe_id=…)' },
        { status: 400 },
      )
    }

    const limitRaw = parseInt(searchParams.get('limit') ?? '', 10)
    const offsetRaw = parseInt(searchParams.get('offset') ?? '', 10)
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, MAX_LIMIT)
        : DEFAULT_LIMIT
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0

    const authClient = await createServerClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return apiError('not_authenticated', 401)
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

    // Projection légère : on n'expose pas soldes_json/totaux_json/ratios_json
    // (potentiellement plusieurs Mo). L'UI peut récupérer les détails via
    // /api/comptable/exercices/snapshot/[exercice].
    const VALID_TYPES = ['bilan', 'compte_resultat', 'grand_livre', 'balance', 'all']
    let query = admin
      .from('exercice_snapshots')
      .select(
        'id, societe_id, exercice, snapshot_type, generated_at, generated_by, is_active, cloture_id, notes',
        { count: 'exact' },
      )
      .eq('societe_id', societeId)
      .order('generated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (typeFilter && VALID_TYPES.includes(typeFilter)) {
      query = query.eq('snapshot_type', typeFilter)
    }
    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, count, error } = await query
    if (error) {
      // Si la table n'existe pas encore (mig 422 pas déployée), on renvoie
      // une liste vide plutôt qu'une 500 pour ne pas casser l'UI.
      const msg = String(error.message || '')
      if (
        msg.includes('relation "exercice_snapshots" does not exist') ||
        (error as { code?: string }).code === '42P01'
      ) {
        return NextResponse.json({
          ok: true,
          societe_id: societeId,
          snapshots: [],
          total: 0,
          limit,
          offset,
          warning: 'Table exercice_snapshots non déployée',
        })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      societe_id: societeId,
      snapshots: data ?? [],
      total: count ?? (data?.length ?? 0),
      limit,
      offset,
    })
  } catch (e: unknown) {
    console.error('GET /exercices/snapshot error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur inconnue' },
      { status: 500 },
    )
  }
}
