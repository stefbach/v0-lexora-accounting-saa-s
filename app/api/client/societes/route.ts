import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getAdmin() {
  return adminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = getAdmin()
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    const role = profile?.role || ''

    let societes = []

    if (['admin', 'super_admin'].includes(role)) {
      // Admin : toutes les sociétés
      const { data } = await admin.from('societes').select('id, nom, brn, ern, statut_tva, secteur_activite, created_by').order('nom')
      societes = data || []
    } else if (['comptable', 'comptable_dedie'].includes(role)) {
      // Comptable : ses sociétés assignées
      const { data } = await admin.from('comptable_societes').select('societe_id, societes(id, nom, brn, ern, statut_tva, secteur_activite)').eq('comptable_id', user.id).eq('actif', true)
      societes = (data || []).map((r: { societes: unknown }) => r.societes).filter(Boolean)
    } else if (['client_admin', 'client_user'].includes(role)) {
      // Client : ses propres sociétés (créées par lui) + via dossiers
      const [{ data: owned }, { data: viaDossiers }] = await Promise.all([
        admin.from('societes').select('id, nom, brn, ern, statut_tva, secteur_activite').eq('created_by', user.id),
        admin.from('dossiers').select('societe_id, societes(id, nom, brn, ern, statut_tva, secteur_activite)').eq('client_id', user.id).eq('statut', 'actif')
      ])
      const map = new Map()
      ;(owned || []).forEach((s: { id: string }) => map.set(s.id, s))
      ;(viaDossiers || []).forEach((d: { societes: { id: string } | null }) => { if (d.societes) map.set(d.societes.id, d.societes) })
      societes = Array.from(map.values())
    } else if (['rh', 'juridique', 'employe'].includes(role)) {
      // RH/Juridique/Employé : leur société principale
      const { data: p } = await admin.from('profiles').select('societe_id').eq('id', user.id).single()
      if (p?.societe_id) {
        const { data } = await admin.from('societes').select('id, nom, brn, ern, statut_tva').eq('id', p.societe_id)
        societes = data || []
      }
    }

    return NextResponse.json({ societes })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const body = await request.json()
    const admin = getAdmin()
    const { data, error } = await admin.from('societes').insert({
      ...body,
      created_by: user.id
    }).select().single()

    if (error) throw error
    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
    const body = await request.json()
    const admin = getAdmin()
    const { data, error } = await admin.from('societes').update(body).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
