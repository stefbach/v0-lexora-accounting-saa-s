/**
 * /api/rh/paternite — WRA S.64 : Déclaration paternité réservée RH/admins.
 *
 * POST { action: 'declarer', employe_id, date_naissance_enfant, ... }
 * POST { action: 'retour', paternite_id }
 * GET  → liste des paternités actives
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'
import {
  declarerPaternite,
  enregistrerRetourPaternite,
} from '@/lib/rh/protection-maternite'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function checkRhAuth() {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { ok: false, error: 'Non autorisé', status: 401, user: null }
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role || '').toLowerCase()
  if (!['admin', 'super_admin', 'rh', 'rh_manager'].includes(role)) {
    return { ok: false, error: 'Déclaration paternité réservée aux RH/admins.', status: 403, user: null }
  }
  return { ok: true, error: null, status: 200, user }
}

export async function GET() {
  const auth = await checkRhAuth()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = getAdminClient()
  const accessibleIds = await getUserSocieteIds(auth.user!.id)

  const { data } = await supabase
    .from('paternites_employees')
    .select(`
      id, employe_id, date_declaration, date_naissance_enfant,
      conge_pat_debut, conge_pat_fin, conge_paye, statut,
      acte_naissance_url, commentaire, created_at,
      employes!inner(id, nom, prenom, societe_id, date_arrivee)
    `)
    .in('statut', ['declaree', 'conge_en_cours'])
    .order('date_naissance_enfant', { ascending: false })

  const filtered = ((data || []) as any[]).filter(p =>
    accessibleIds.includes(p.employes?.societe_id)
  )
  return NextResponse.json({ paternites: filtered, nb: filtered.length })
}

export async function POST(request: Request) {
  const auth = await checkRhAuth()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')
  const supabase = getAdminClient()

  if (action === 'declarer') {
    const { employe_id, date_naissance_enfant } = body
    if (!employe_id || !date_naissance_enfant) {
      return NextResponse.json({ error: 'employe_id et date_naissance_enfant requis' }, { status: 400 })
    }
    const { data: emp } = await supabase.from('employes').select('societe_id').eq('id', employe_id).maybeSingle()
    if (!emp) return apiError('employee_not_found', 404)
    const accessibleIds = await getUserSocieteIds(auth.user!.id)
    if (!accessibleIds.includes(emp.societe_id)) {
      return apiError('access_denied_employee', 403)
    }
    const r = await declarerPaternite(supabase, {
      employe_id,
      date_naissance_enfant,
      conge_pat_debut: body.conge_pat_debut,
      acte_naissance_url: body.acte_naissance_url,
      commentaire: body.commentaire,
      created_by: auth.user!.id,
    })
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({
      paternite_id: r.id,
      conge_paye: r.conge_paye,
      conge_pat_fin: r.conge_pat_fin,
    })
  }

  if (action === 'retour') {
    const { paternite_id } = body
    if (!paternite_id) return NextResponse.json({ error: 'paternite_id requis' }, { status: 400 })
    const r = await enregistrerRetourPaternite(supabase, paternite_id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 })
}
