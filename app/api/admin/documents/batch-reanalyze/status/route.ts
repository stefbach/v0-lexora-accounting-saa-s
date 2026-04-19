/**
 * Status endpoint pour les jobs batch-reanalyze.
 * GET ?job_id=<uuid>  → état courant du job
 * GET (sans job_id)   → liste des 10 derniers jobs (pour la UI admin)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function requireAdmin(): Promise<boolean> {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = profile?.role
  return !!role && ['admin', 'super_admin'].includes(role)
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const supabase = getAdminClient()
    const url = new URL(req.url)
    const jobId = url.searchParams.get('job_id')

    if (jobId) {
      const { data, error } = await supabase
        .from('batch_reanalyze_jobs')
        .select(`
          id, initiated_by, societe_id, filters,
          total_documents, processed_count, success_count, error_count,
          status, stats, errors,
          started_at, completed_at, created_at
        `)
        .eq('id', jobId)
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      return NextResponse.json({ ok: true, job: data })
    }

    const { data, error } = await supabase
      .from('batch_reanalyze_jobs')
      .select(`
        id, initiated_by, societe_id,
        total_documents, processed_count, success_count, error_count,
        status, stats, started_at, completed_at, created_at
      `)
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, jobs: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
