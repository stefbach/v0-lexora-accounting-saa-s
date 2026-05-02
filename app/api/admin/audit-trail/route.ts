/**
 * GET /api/admin/audit-trail
 *
 * Lit les actions critiques (clôture, reset, paie verrouillage, etc.) depuis
 *   - public.app_audit_log  (table unifiée — migration 229)
 *   - public.paie_audit_log (legacy — périmètre paie uniquement)
 *
 * Fusionne, normalise au même schéma, trie par created_at desc.
 *
 * Query params :
 *   - limit       (default 100, max 500)
 *   - societe_id  (filtre optionnel)
 *   - action      (préfixe ex: paie. — filtre optionnel)
 *   - source      ('app' | 'paie' | 'all', default 'all')
 *
 * Auth : admin / super_admin uniquement.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface AuditEntry {
  id: string
  source: 'app' | 'paie'
  action: string
  user_id: string | null
  user_email: string | null
  societe_id: string | null
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Non autorisé' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!['admin', 'super_admin'].includes(role)) {
    return { ok: false as const, status: 403, error: 'Forbidden' }
  }
  return { ok: true as const, user }
}

export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 1), 500)
  const societeFilter = searchParams.get('societe_id')
  const actionFilter = searchParams.get('action')
  const source = (searchParams.get('source') || 'all') as 'app' | 'paie' | 'all'

  const supabase = getAdminClient()
  const entries: AuditEntry[] = []

  try {
    if (source === 'all' || source === 'app') {
      let q = supabase
        .from('app_audit_log')
        .select('id, action, user_id, user_email, societe_id, target_type, target_id, details, ip_address, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (societeFilter) q = q.eq('societe_id', societeFilter)
      if (actionFilter) q = q.like('action', `${actionFilter}%`)
      const { data, error } = await q
      if (error) throw error
      type AppRow = {
        id: string; action: string; user_id: string | null; user_email: string | null;
        societe_id: string | null; target_type: string | null; target_id: string | null;
        details: Record<string, unknown> | null; ip_address: string | null; created_at: string
      }
      for (const r of ((data || []) as AppRow[])) {
        entries.push({
          id: r.id,
          source: 'app',
          action: r.action,
          user_id: r.user_id,
          user_email: r.user_email,
          societe_id: r.societe_id,
          target_type: r.target_type,
          target_id: r.target_id,
          details: r.details || {},
          ip_address: r.ip_address,
          created_at: r.created_at,
        })
      }
    }

    if (source === 'all' || source === 'paie') {
      let q = supabase
        .from('paie_audit_log')
        .select('id, action, user_id, user_email, societe_id, periode, details, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (societeFilter) q = q.eq('societe_id', societeFilter)
      if (actionFilter) q = q.like('action', `${actionFilter}%`)
      const { data, error } = await q
      if (error) throw error
      type PaieRow = {
        id: string; action: string; user_id: string | null; user_email: string | null;
        societe_id: string | null; periode: string | null;
        details: Record<string, unknown> | null; created_at: string
      }
      for (const r of ((data || []) as PaieRow[])) {
        entries.push({
          id: r.id,
          source: 'paie',
          action: `paie.${r.action}`,
          user_id: r.user_id,
          user_email: r.user_email,
          societe_id: r.societe_id,
          target_type: 'paie_periode',
          target_id: r.periode,
          details: r.details || {},
          ip_address: null,
          created_at: r.created_at,
        })
      }
    }
  } catch (e) {
    logError(e, { route: '/api/admin/audit-trail' })
    return NextResponse.json({ error: 'audit_trail_query_failed' }, { status: 500 })
  }

  entries.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const sliced = entries.slice(0, limit)

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    count: sliced.length,
    entries: sliced,
  })
}
