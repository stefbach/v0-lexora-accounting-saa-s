/**
 * /api/rh/maternite — WRA S.64 : Déclaration grossesse/accouchement/retour
 * réservée aux RH/admins pour garantir la confidentialité (pas de
 * stigmatisation ni de pression sur l'employée).
 *
 * POST { action: 'declarer', employe_id, date_presume_accouchement, ... }
 * POST { action: 'accouchement', grossesse_id, date_reelle, ... }
 * POST { action: 'retour', grossesse_id }
 * POST { action: 'annuler', grossesse_id, motif }
 * GET  → liste des grossesses actives (déclarées + congé en cours)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'
import {
  declarerGrossesse,
  enregistrerAccouchement,
  enregistrerRetourMaternite,
  annulerGrossesse,
} from '@/lib/rh/protection-maternite'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Vérifie que le user connecté est RH/admin. WRA S.64 — l'employée
 * concernée NE PEUT PAS déclarer elle-même (garantit confidentialité).
 */
async function checkRhAuth() {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return { ok: false, error: 'Non autorisé', status: 401, user: null }
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role || '').toLowerCase()
  if (!['admin', 'super_admin', 'rh', 'rh_manager'].includes(role)) {
    return {
      ok: false,
      error: 'Déclaration grossesse réservée aux RH/admins (WRA S.64 confidentialité).',
      status: 403,
      user: null,
    }
  }
  return { ok: true, error: null, status: 200, user }
}

export async function GET() {
  const auth = await checkRhAuth()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = getAdminClient()
  // Filtre par sociétés accessibles au user pour multi-tenant
  const accessibleIds = await getUserSocieteIds(auth.user!.id)

  const { data } = await supabase
    .from('grossesses_employees')
    .select(`
      id, employe_id, date_declaration, date_presume_accouchement,
      date_reelle_accouchement, grossesse_multiple, naissance_prematuree,
      mortinaissance, est_adoption, statut, conge_mat_debut, conge_mat_fin,
      allocation_naissance_payee, allocation_naissance_paye_le, certificat_medical_url,
      commentaire, created_at,
      employes!inner(id, nom, prenom, societe_id, date_arrivee)
    `)
    .in('statut', ['declaree', 'conge_en_cours'])
    .order('date_presume_accouchement', { ascending: true })

  // Filtrer par sociétés accessibles
  const filtered = ((data || []) as any[]).filter(g =>
    accessibleIds.includes(g.employes?.societe_id)
  )

  return NextResponse.json({ grossesses: filtered, nb: filtered.length })
}

export async function POST(request: Request) {
  const auth = await checkRhAuth()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')
  const supabase = getAdminClient()

  if (action === 'declarer') {
    const { employe_id, date_presume_accouchement } = body
    if (!employe_id || !date_presume_accouchement) {
      return NextResponse.json({ error: 'employe_id et date_presume_accouchement requis' }, { status: 400 })
    }
    // Contrôle accès société
    const { data: emp } = await supabase.from('employes').select('societe_id').eq('id', employe_id).maybeSingle()
    if (!emp) return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 })
    const accessibleIds = await getUserSocieteIds(auth.user!.id)
    if (!accessibleIds.includes(emp.societe_id)) {
      return NextResponse.json({ error: 'Accès refusé à cet employé' }, { status: 403 })
    }
    const r = await declarerGrossesse(supabase, {
      employe_id,
      date_presume_accouchement,
      grossesse_multiple: body.grossesse_multiple,
      nb_enfants_attendus: body.nb_enfants_attendus,
      est_adoption: body.est_adoption,
      date_adoption: body.date_adoption,
      certificat_medical_url: body.certificat_medical_url,
      commentaire: body.commentaire,
      created_by: auth.user!.id,
    })
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ grossesse_id: r.id })
  }

  if (action === 'accouchement') {
    const { grossesse_id, date_reelle } = body
    if (!grossesse_id || !date_reelle) {
      return NextResponse.json({ error: 'grossesse_id et date_reelle requis' }, { status: 400 })
    }
    const r = await enregistrerAccouchement(supabase, {
      grossesse_id,
      date_reelle_accouchement: date_reelle,
      grossesse_multiple: body.grossesse_multiple,
      naissance_prematuree: body.naissance_prematuree,
      mortinaissance: body.mortinaissance,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true, conge_mat_fin: r.conge_mat_fin, demande_id: r.demande_id })
  }

  if (action === 'retour') {
    const { grossesse_id } = body
    if (!grossesse_id) return NextResponse.json({ error: 'grossesse_id requis' }, { status: 400 })
    const r = await enregistrerRetourMaternite(supabase, grossesse_id)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'annuler') {
    const { grossesse_id, motif } = body
    if (!grossesse_id || !motif) return NextResponse.json({ error: 'grossesse_id et motif requis' }, { status: 400 })
    const r = await annulerGrossesse(supabase, grossesse_id, motif)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `Action inconnue : ${action}` }, { status: 400 })
}
