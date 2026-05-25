import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rh/paie/decomptabilisation-log
 *
 * FIX-DECOMPTA — Lecture du journal d'audit WORM des décomptabilisations.
 *
 * Accessible aux mêmes rôles que la décomptabilisation (transparence) :
 *   admin, super_admin, rh, rh_manager, direction, client_admin.
 *
 * Query params :
 *   - bulletin_id?: UUID — filtrer sur un bulletin précis
 *   - user_id?:    UUID — filtrer sur un auteur
 *   - date_from?:  YYYY-MM-DD
 *   - date_to?:    YYYY-MM-DD
 *   - limit?:      1..200 (défaut 50)
 *   - offset?:     >= 0   (défaut 0)
 *
 * Retour :
 *   {
 *     entries: Array<{
 *       id, bulletin_id, ecriture_id_avant, action, user_id, raison,
 *       metadata, created_at,
 *       auteur: { id, nom, prenom, role } | null,
 *       bulletin: { id, periode, employe: { id, prenom, nom } } | null
 *     }>,
 *     total: number,        // total ligne après filtres
 *     limit, offset
 *   }
 */

const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'direction',
  'client_admin',
] as const

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const supabase = getAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const role = (profile as any)?.role as string | null | undefined
    if (!role || !ALLOWED_ROLES.includes(role as any)) {
      return NextResponse.json(
        {
          error:
            'Accès réservé aux rôles RH, direction ou admin (transparence audit).',
          role_actuel: role || 'inconnu',
        },
        { status: 403 },
      )
    }

    const url = new URL(request.url)
    const bulletinId = url.searchParams.get('bulletin_id')
    const userId = url.searchParams.get('user_id')
    const dateFrom = url.searchParams.get('date_from')
    const dateTo = url.searchParams.get('date_to')
    const limit = Math.min(
      200,
      Math.max(1, Number(url.searchParams.get('limit')) || 50),
    )
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)

    // 1. Query principale + count
    let q = supabase
      .from('bulletin_decomptabilisation_log')
      .select(
        'id, bulletin_id, ecriture_id_avant, action, user_id, raison, metadata, created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })

    if (bulletinId) q = q.eq('bulletin_id', bulletinId)
    if (userId) q = q.eq('user_id', userId)
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
    if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59`)

    q = q.range(offset, offset + limit - 1)

    const { data: rows, error, count } = await q
    if (error) {
      console.error('[decomptabilisation-log] query error:', error.message)
      return NextResponse.json(
        { error: 'Erreur lecture audit', details: error.message },
        { status: 500 },
      )
    }

    const entries = (rows || []) as any[]
    const userIds = Array.from(
      new Set(entries.map((e) => e.user_id).filter(Boolean)),
    )
    const bulletinIds = Array.from(
      new Set(entries.map((e) => e.bulletin_id).filter(Boolean)),
    )

    // 2. Lookup auteurs (profiles) — schéma profiles : id, full_name, email, role
    const auteursMap = new Map<string, any>()
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', userIds)
      for (const p of (profs || []) as any[]) {
        auteursMap.set(p.id, {
          id: p.id,
          nom: p.full_name || p.email || '—',
          email: p.email,
          role: p.role,
        })
      }
    }

    // 3. Lookup bulletins + employes
    const bulletinsMap = new Map<string, any>()
    if (bulletinIds.length > 0) {
      const { data: bulls } = await supabase
        .from('bulletins_paie')
        .select(
          'id, periode, employe_id, employes:employe_id(id, prenom, nom)',
        )
        .in('id', bulletinIds)
      for (const b of (bulls || []) as any[]) {
        bulletinsMap.set(b.id, {
          id: b.id,
          periode: b.periode,
          employe: b.employes || null,
        })
      }
    }

    const enriched = entries.map((e) => ({
      ...e,
      auteur: auteursMap.get(e.user_id) || null,
      bulletin: bulletinsMap.get(e.bulletin_id) || null,
    }))

    return NextResponse.json({
      entries: enriched,
      total: count ?? enriched.length,
      limit,
      offset,
    })
  } catch (e: any) {
    console.error('[decomptabilisation-log] EXCEPTION:', e?.message)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
