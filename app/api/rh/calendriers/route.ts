// app/api/rh/calendriers/route.ts
//
// CRUD pour les calendriers de travail par société (jours+heures).
// Remplace les anciennes données localStorage `rh_calendars`.
//
// GET   ?societe_id=<uuid>             → liste des calendriers actifs
// POST  { action: 'creer'|'modifier'|'supprimer', ... }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED_ROLES = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']
const VALID_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function normalizeDays(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null
  const cleaned = input
    .map(d => typeof d === 'string' ? d.trim() : '')
    .filter(d => VALID_DAYS.includes(d))
  return cleaned.length > 0 ? cleaned : null
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('calendriers_travail')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('nom')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ calendriers: data || [] })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'creer') {
      const { societe_id, nom, jours_semaine, heures_par_jour } = body
      if (!societe_id || !nom) {
        return NextResponse.json(
          { error: 'societe_id et nom requis' },
          { status: 400 }
        )
      }
      const days = normalizeDays(jours_semaine) || ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven']
      const hpj = heures_par_jour !== undefined ? Number(heures_par_jour) : 9
      if (!Number.isFinite(hpj) || hpj <= 0 || hpj > 24) {
        return NextResponse.json(
          { error: 'heures_par_jour doit être un nombre entre 0 et 24' },
          { status: 400 }
        )
      }

      const { data, error } = await supabase
        .from('calendriers_travail')
        .insert({
          societe_id,
          nom: String(nom).trim(),
          jours_semaine: days,
          heures_par_jour: hpj,
        })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Un calendrier avec ce nom existe déjà pour cette société' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, calendrier: data })
    }

    if (action === 'modifier') {
      const { id, nom, jours_semaine, heures_par_jour } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (nom !== undefined) updates.nom = String(nom).trim()
      if (jours_semaine !== undefined) {
        const days = normalizeDays(jours_semaine)
        if (!days) {
          return NextResponse.json(
            { error: 'jours_semaine invalide (utiliser Lun/Mar/Mer/Jeu/Ven/Sam/Dim)' },
            { status: 400 }
          )
        }
        updates.jours_semaine = days
      }
      if (heures_par_jour !== undefined) {
        const hpj = Number(heures_par_jour)
        if (!Number.isFinite(hpj) || hpj <= 0 || hpj > 24) {
          return NextResponse.json(
            { error: 'heures_par_jour doit être un nombre entre 0 et 24' },
            { status: 400 }
          )
        }
        updates.heures_par_jour = hpj
      }

      const { data, error } = await supabase
        .from('calendriers_travail')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle()
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Nom déjà utilisé pour cette société' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, calendrier: data })
    }

    if (action === 'supprimer') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const { error } = await supabase
        .from('calendriers_travail')
        .update({ actif: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}
