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
    if (!body.nom) return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })

    const admin = getAdmin()

    // Build insert object with core fields
    const coreData: Record<string, unknown> = {
      nom: body.nom,
      brn: body.brn || null,
      numero_tva_mra: body.numero_tva_mra || null,
      statut_tva: body.statut_tva || false,
      adresse: body.adresse || null,
      telephone: body.telephone || null,
      email: body.email || null,
    }

    // Try with extended fields first (created_by, ern, secteur_activite)
    const extendedData = {
      ...coreData,
      created_by: user.id,
      ...(body.ern ? { ern: body.ern } : {}),
      ...(body.secteur_activite ? { secteur_activite: body.secteur_activite } : {}),
    }

    let { data, error } = await admin.from('societes').insert(extendedData).select().single()

    // If it fails (possibly due to missing columns), retry with core fields only
    if (error) {
      console.error('[client/societes] POST extended insert failed, retrying core:', error.message)
      const retry = await admin.from('societes').insert(coreData).select().single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('[client/societes] POST error:', error.message, error.details, error.hint)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Auto-créer un dossier pour lier le client à sa nouvelle société
    if (data?.id) {
      const { error: dossierError } = await admin.from('dossiers').insert({
        client_id: user.id,
        societe_id: data.id,
        comptable_id: null,
      })
      if (dossierError) {
        console.error('[client/societes] dossier creation error:', dossierError.message)
      }
    }

    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    console.error('[client/societes] POST fatal:', e)
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
    const updateData: Record<string, unknown> = {}
    if (body.nom !== undefined) updateData.nom = body.nom
    if (body.brn !== undefined) updateData.brn = body.brn || null
    if (body.ern !== undefined) updateData.ern = body.ern || null
    if (body.numero_tva_mra !== undefined) updateData.numero_tva_mra = body.numero_tva_mra || null
    if (body.statut_tva !== undefined) updateData.statut_tva = body.statut_tva
    if (body.secteur_activite !== undefined) updateData.secteur_activite = body.secteur_activite || null
    if (body.adresse !== undefined) updateData.adresse = body.adresse || null
    if (body.telephone !== undefined) updateData.telephone = body.telephone || null
    if (body.email !== undefined) updateData.email = body.email || null
    const { data, error } = await admin.from('societes').update(updateData).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ societe: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
