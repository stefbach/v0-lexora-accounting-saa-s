/**
 * /api/mcp/query — Endpoint universel SELECT pour le serveur MCP Lexora.
 *
 * Permet à Claude (via le tool `query_lexora`) d'interroger en lecture toute
 * table whitelistée de la base Lexora. SELECT-only, scope `societe_id` forcé
 * pour les tables sensibles.
 *
 * Auth : via `resolveUserAuth` — accepte session web OU `X-Lexora-Api-Key`.
 *
 * Body :
 *   {
 *     table: string                         // doit être dans WHITELIST_TABLES
 *     societe_id?: string                   // requis pour tables avec societe_id
 *     filters?: Record<string, any>         // ex: { statut: 'paye', tiers: 'X' }
 *     filters_in?: Record<string, any[]>    // ex: { statut: ['paye','retard'] }
 *     filters_gte?: Record<string, any>     // ex: { date_facture: '2026-01-01' }
 *     filters_lte?: Record<string, any>
 *     filters_ilike?: Record<string, string>// ex: { tiers: '%apple%' }
 *     columns?: string[]                    // défaut : '*'
 *     order_by?: string
 *     order_dir?: 'asc' | 'desc'
 *     limit?: number                        // max 500
 *   }
 *
 * Réponse : { rows: any[], count: number, truncated: boolean, table: string }
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { MCP_TABLE_WHITELIST, isTableScopedBySociete } from '@/lib/mcp/whitelist'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100

export async function POST(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const body = await request.json()
    const {
      table, societe_id, filters, filters_in, filters_gte, filters_lte, filters_ilike,
      columns, order_by, order_dir, limit,
    } = body as Record<string, any>

    // 1. Validation table
    if (!table || typeof table !== 'string') {
      return NextResponse.json({ error: 'table requis' }, { status: 400 })
    }
    const tableConfig = MCP_TABLE_WHITELIST[table]
    if (!tableConfig) {
      return NextResponse.json({
        error: `Table "${table}" non whitelistée. Tables autorisées : ${Object.keys(MCP_TABLE_WHITELIST).join(', ')}`,
      }, { status: 403 })
    }

    const supabase = getAdminClient()

    // 2. Scope societe_id obligatoire pour tables sensibles
    if (isTableScopedBySociete(table)) {
      if (!societe_id) {
        return NextResponse.json({
          error: `societe_id requis pour la table "${table}"`,
        }, { status: 400 })
      }
      await assertSocieteAccess(supabase, user.id, societe_id)
    }

    // 3. Build query
    // Colonnes JSONB volumineuses interdites via MCP : leur renvoi en masse
    // dépasse la taille max d'un résultat d'outil (« result too large »).
    // Les mouvements détaillés passent par /api/mcp/transactions-bancaires.
    const HEAVY_COLUMNS = new Set(['transactions_json', 'raw_extraction', 'raw_json'])
    let selectCols: string
    if (Array.isArray(columns) && columns.length > 0) {
      const safe = columns.filter((c) => typeof c === 'string' && !HEAVY_COLUMNS.has(c.trim()))
      selectCols = safe.length > 0 ? safe.join(',') : (tableConfig.default_columns || '*')
    } else if (tableConfig.default_columns) {
      // Le default_columns whitelisté exclut déjà les colonnes lourdes.
      selectCols = tableConfig.default_columns
    } else {
      // Pas de default → '*' SAUF pour les tables connues à colonne lourde,
      // où on impose une projection sûre.
      selectCols = table === 'releves_bancaires'
        ? 'id, compte_bancaire_id, periode, date_debut, date_fin, solde_ouverture, solde_cloture, nb_transactions, superseded_by_id, created_at'
        : '*'
    }

    let q = supabase.from(table).select(selectCols, { count: 'exact' })

    if (isTableScopedBySociete(table)) {
      q = q.eq('societe_id', societe_id)
    }

    // 4. Filtres égalité
    if (filters && typeof filters === 'object') {
      for (const [col, val] of Object.entries(filters)) {
        if (val === null) q = q.is(col, null)
        else q = q.eq(col, val)
      }
    }
    if (filters_in && typeof filters_in === 'object') {
      for (const [col, vals] of Object.entries(filters_in)) {
        if (Array.isArray(vals) && vals.length > 0) q = q.in(col, vals)
      }
    }
    if (filters_gte && typeof filters_gte === 'object') {
      for (const [col, val] of Object.entries(filters_gte)) q = q.gte(col, val)
    }
    if (filters_lte && typeof filters_lte === 'object') {
      for (const [col, val] of Object.entries(filters_lte)) q = q.lte(col, val)
    }
    if (filters_ilike && typeof filters_ilike === 'object') {
      for (const [col, pattern] of Object.entries(filters_ilike)) {
        if (typeof pattern === 'string') q = q.ilike(col, pattern)
      }
    }

    // 5. Order + limit
    if (order_by && typeof order_by === 'string') {
      q = q.order(order_by, { ascending: order_dir !== 'desc' })
    } else if (tableConfig.default_order_by) {
      q = q.order(tableConfig.default_order_by, { ascending: false })
    }

    const requestedLimit = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT)
    q = q.range(0, requestedLimit - 1)

    const { data, error, count } = await q
    if (error) {
      return NextResponse.json({ error: error.message, hint: error.hint }, { status: 500 })
    }

    return NextResponse.json({
      table,
      rows: data || [],
      count: count ?? (data?.length || 0),
      returned: data?.length || 0,
      truncated: typeof count === 'number' && count > requestedLimit,
      limit: requestedLimit,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

// GET : retourne la whitelist + schémas (utile pour Claude de découvrir les tables)
export async function GET(request: Request) {
  const user = await resolveUserAuth(request)
  if (!user) return apiError('unauthorized', 401)

  return NextResponse.json({
    tables: Object.entries(MCP_TABLE_WHITELIST).map(([name, cfg]) => ({
      name,
      domain: cfg.domain,
      description: cfg.description,
      scoped_by_societe: isTableScopedBySociete(name),
      default_columns: cfg.default_columns || '*',
      default_order_by: cfg.default_order_by,
    })),
    max_limit: MAX_LIMIT,
    default_limit: DEFAULT_LIMIT,
  })
}
