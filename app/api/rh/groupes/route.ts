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

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    let query = supabase.from('groupes_employes').select('*').order('nom')
    if (societe_id) query = query.eq('societe_id', societe_id)

    const { data: groupes, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fetch manager names for groups that have a manager_id
    const managerIds = [...new Set((groupes || []).map(g => g.manager_id).filter(Boolean))]
    let managerMap: Record<string, { nom: string; prenom: string }> = {}
    if (managerIds.length > 0) {
      const { data: managers } = await supabase.from('employes').select('id, nom, prenom').in('id', managerIds)
      for (const m of managers || []) managerMap[m.id] = { nom: m.nom, prenom: m.prenom }
    }

    // Enrich with member count and member list
    const groupeIds = (groupes || []).map(g => g.id)
    let membresMap: Record<string, any[]> = {}

    if (groupeIds.length > 0) {
      const { data: membres } = await supabase
        .from('employe_groupes')
        .select('groupe_id, employe_id')
        .in('groupe_id', groupeIds)

      const empIds = [...new Set((membres || []).map(m => m.employe_id))]
      let empMap: Record<string, any> = {}
      if (empIds.length > 0) {
        const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste').in('id', empIds)
        for (const e of emps || []) empMap[e.id] = { nom: e.nom, prenom: e.prenom, poste: e.poste }
      }

      for (const m of membres || []) {
        if (!membresMap[m.groupe_id]) membresMap[m.groupe_id] = []
        membresMap[m.groupe_id].push({ employe_id: m.employe_id, ...empMap[m.employe_id] })
      }
    }

    const enriched = (groupes || []).map(g => ({
      ...g,
      membres: membresMap[g.id] || [],
      nb_membres: (membresMap[g.id] || []).length,
      manager_nom: g.manager_id && managerMap[g.manager_id]
        ? `${managerMap[g.manager_id].prenom} ${managerMap[g.manager_id].nom}`
        : null,
    }))

    return NextResponse.json({ groupes: enriched })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // Créer un groupe
    if (action === 'creer') {
      const { societe_id, nom, code, description, couleur, inclus_planning, inclus_pointage } = body
      if (!societe_id || !nom) return NextResponse.json({ error: 'societe_id et nom requis' }, { status: 400 })

      const { data, error } = await supabase.from('groupes_employes').insert({
        societe_id, nom, code: code || null, description: description || null,
        couleur: couleur || '#0B0F2E',
        inclus_planning: inclus_planning !== false,
        inclus_pointage: inclus_pointage !== false,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ groupe: data })
    }

    // Modifier un groupe
    if (action === 'modifier') {
      const { id, nom, code, description, couleur, inclus_planning, inclus_pointage, actif, manager_id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const updates: Record<string, unknown> = {}
      if (nom !== undefined) updates.nom = nom
      if (code !== undefined) updates.code = code
      if (description !== undefined) updates.description = description
      if (couleur !== undefined) updates.couleur = couleur
      if (inclus_planning !== undefined) updates.inclus_planning = inclus_planning
      if (inclus_pointage !== undefined) updates.inclus_pointage = inclus_pointage
      if (actif !== undefined) updates.actif = actif
      if (manager_id !== undefined) updates.manager_id = manager_id

      const { data, error } = await supabase.from('groupes_employes').update(updates).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ groupe: data })
    }

    // Affecter des employés à un groupe
    if (action === 'affecter') {
      const { groupe_id, employe_ids } = body
      if (!groupe_id || !employe_ids || !Array.isArray(employe_ids)) {
        return NextResponse.json({ error: 'groupe_id et employe_ids[] requis' }, { status: 400 })
      }

      // Supprimer les anciennes affectations pour ce groupe
      await supabase.from('employe_groupes').delete().eq('groupe_id', groupe_id)

      // Insérer les nouvelles
      if (employe_ids.length > 0) {
        const rows = employe_ids.map(eid => ({ employe_id: eid, groupe_id }))
        const { error } = await supabase.from('employe_groupes').insert(rows)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }

      // Mettre à jour le groupe_id principal sur chaque employé
      for (const eid of employe_ids) {
        await supabase.from('employes').update({ groupe_id }).eq('id', eid)
      }

      return NextResponse.json({ success: true, nb_affectes: employe_ids.length })
    }

    // Retirer un employé d'un groupe
    if (action === 'retirer') {
      const { groupe_id, employe_id } = body
      if (!groupe_id || !employe_id) return NextResponse.json({ error: 'groupe_id et employe_id requis' }, { status: 400 })
      await supabase.from('employe_groupes').delete().eq('groupe_id', groupe_id).eq('employe_id', employe_id)
      return NextResponse.json({ success: true })
    }

    // Supprimer un groupe
    if (action === 'supprimer') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      await supabase.from('employe_groupes').delete().eq('groupe_id', id)
      await supabase.from('groupes_employes').delete().eq('id', id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    console.error('[groupes POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
