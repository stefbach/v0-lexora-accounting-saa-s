/**
 * GET /api/salarie/protection-legale
 *
 * Retourne la grossesse/paternité active de l'employée/employé connecté(e),
 * EN LECTURE SEULE. Respecte les policies RLS SELECT_SELF sur les tables
 * grossesses_employees + paternites_employees.
 *
 * Aucune info sensible (certificat médical, commentaires RH internes) n'est
 * retournée — UI salarié = transparence sans détails confidentiels.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Récupérer l'employé via auth_user_id (pas email car plus fiable)
  const { data: emp } = await supabase
    .from('employes')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!emp) return NextResponse.json({ grossesse: null, paternite: null })

  // Les policies RLS SELECT_SELF garantissent que l'employé(e) ne voit que
  // SES données. On ne sélectionne PAS les champs confidentiels RH.
  const [gRes, pRes] = await Promise.all([
    supabase
      .from('grossesses_employees')
      .select('id, date_presume_accouchement, date_reelle_accouchement, statut, conge_mat_debut, conge_mat_fin, allocation_naissance_payee, allocation_naissance_paye_le, grossesse_multiple, naissance_prematuree')
      .eq('employe_id', emp.id)
      .in('statut', ['declaree', 'conge_en_cours', 'retour_effectue'])
      .order('date_declaration', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('paternites_employees')
      .select('id, date_naissance_enfant, conge_pat_debut, conge_pat_fin, conge_paye, statut')
      .eq('employe_id', emp.id)
      .in('statut', ['declaree', 'conge_en_cours', 'retour_effectue'])
      .order('date_declaration', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return NextResponse.json({
    grossesse: gRes.data || null,
    paternite: pRes.data || null,
  })
}
