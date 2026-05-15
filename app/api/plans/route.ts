/**
 * /api/plans
 *
 * GET — Liste publique des plans d'abonnement actifs.
 *   Aucune auth requise (consultable depuis le formulaire d'inscription
 *   anonyme).
 *
 * Query params :
 *   - type : 'dirigeant' | 'comptable' (optionnel) — filtre
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const typeFilter = searchParams.get('type')

    const supabase = getAdminClient()
    let query = supabase
      .from('plans')
      .select('id, code, nom, description, type_cible, prix_mensuel_mur, prix_annuel_mur, devise, modules_inclus, limites, populaire, ordre')
      .eq('actif', true)
      .order('ordre', { ascending: true })

    if (typeFilter && ['dirigeant', 'comptable'].includes(typeFilter)) {
      query = query.or(`type_cible.eq.${typeFilter},type_cible.eq.tous`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ plans: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
