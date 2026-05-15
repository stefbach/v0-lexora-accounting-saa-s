/**
 * /api/admin/demandes-inscription
 *
 * GET — Liste des demandes d'inscription (filtrable par statut).
 *   Query : ?statut=en_attente|validee|refusee (défaut : en_attente)
 *
 * Admin/super_admin uniquement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function requireAdmin() {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const supabase = getAdminClient()
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

export async function GET(request: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const statut = searchParams.get('statut') || 'en_attente'

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('demandes_inscription')
    .select(`
      id, type_demandeur, prenom, nom, email, telephone, poste,
      societe_data, cabinet_data, plan_id, periodicite,
      accept_cgu, accept_cgv, accept_marketing, message,
      statut, plan_attribue_id, modules_attribues, tarif_final_mur,
      validated_at, validated_by, rejected_reason,
      created_user_id, created_societe_id,
      created_at,
      plan:plans!plan_id(id, code, nom, prix_mensuel_mur, prix_annuel_mur)
    `)
    .eq('statut', statut)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ demandes: data || [] })
}
