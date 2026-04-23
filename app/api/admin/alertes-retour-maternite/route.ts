/**
 * GET /api/admin/alertes-retour-maternite
 *
 * Liste les congés maternité dont la fin approche (conge_mat_fin dans les
 * N prochains jours, défaut 14). Utilisé pour préparer le retour : reprise
 * poste, réintégration, etc. Sprint G7.
 *
 * Auth : admin/super_admin/rh/rh_manager.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = String(profile?.role || '').toLowerCase()
  if (!['admin', 'super_admin', 'rh', 'rh_manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden — admin/RH only' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const joursAvance = Math.max(1, Math.min(90, parseInt(searchParams.get('jours_avance') || '14', 10)))

  const supabase = getAdminClient()
  const accessibleIds = await getUserSocieteIds(user.id)
  const today = new Date().toISOString().slice(0, 10)
  const target = new Date()
  target.setDate(target.getDate() + joursAvance)
  const targetIso = target.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('grossesses_employees')
    .select(`
      id, employe_id, conge_mat_debut, conge_mat_fin, grossesse_multiple,
      naissance_prematuree, date_reelle_accouchement, statut,
      employes!inner(id, nom, prenom, societe_id)
    `)
    .eq('statut', 'conge_en_cours')
    .gte('conge_mat_fin', today)
    .lte('conge_mat_fin', targetIso)
    .order('conge_mat_fin', { ascending: true })

  const filtered = ((data || []) as any[])
    .filter(g => accessibleIds.includes(g.employes?.societe_id))
    .map(g => {
      const fin = new Date(String(g.conge_mat_fin).slice(0, 10) + 'T12:00:00')
      const now = new Date()
      const jours = Math.ceil((fin.getTime() - now.getTime()) / 86400000)
      return {
        grossesse_id: g.id,
        employe: {
          id: g.employe_id,
          nom: g.employes?.nom,
          prenom: g.employes?.prenom,
        },
        conge_mat_debut: g.conge_mat_debut,
        conge_mat_fin: g.conge_mat_fin,
        jours_avant_retour: jours,
        grossesse_multiple: g.grossesse_multiple,
        naissance_prematuree: g.naissance_prematuree,
      }
    })

  return NextResponse.json({
    alertes: filtered,
    nb: filtered.length,
    jours_avance: joursAvance,
  })
}
