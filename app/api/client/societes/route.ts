import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

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
    const { data: profile } = await admin.from('profiles').select('role, societe_id').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''

    let societes: any[] = []

    if (['admin', 'super_admin'].includes(role)) {
      const { data } = await admin.from('societes').select('*').order('nom')
      societes = data || []

    } else if (['comptable', 'comptable_dedie'].includes(role)) {
      // Via comptable_societes + via dossiers
      const [{ data: viaCS }, { data: viaDossiers }] = await Promise.all([
        admin.from('comptable_societes').select('societe_id, societes(*)').eq('comptable_id', user.id).eq('actif', true),
        admin.from('dossiers').select('societe_id, societes(*)').eq('comptable_id', user.id).eq('statut', 'actif'),
      ])
      const map = new Map()
      ;(viaCS || []).forEach((r: any) => { if (r.societes) map.set(r.societes.id, r.societes) })
      ;(viaDossiers || []).forEach((d: any) => { if (d.societes) map.set(d.societes.id, d.societes) })
      societes = Array.from(map.values())

    } else if (['client_admin', 'client_user', 'client_assistant'].includes(role)) {
      // Via created_by + via dossiers + via user_societes
      const { data: owned } = await admin.from('societes').select('*').eq('created_by', user.id)

      const { data: dossiers } = await admin.from('dossiers').select('societe_id').eq('client_id', user.id)
      const dossierSocieteIds = (dossiers || []).map(d => d.societe_id).filter(Boolean)

      const { data: userSocietes } = await admin.from('user_societes').select('societe_id').eq('user_id', user.id)
      const userSocieteIds = (userSocietes || []).map(us => us.societe_id).filter(Boolean)

      // Combine all société IDs
      const allSocieteIds = [...new Set([
        ...(owned || []).map((s: any) => s.id),
        ...dossierSocieteIds,
        ...userSocieteIds,
      ])]

      const map = new Map()
      ;(owned || []).forEach((s: any) => map.set(s.id, s))

      // Fetch remaining sociétés by ID
      const missingIds = allSocieteIds.filter(id => !map.has(id))
      if (missingIds.length > 0) {
        const { data: extra } = await admin.from('societes').select('*').in('id', missingIds)
        ;(extra || []).forEach((s: any) => map.set(s.id, s))
      }

      societes = Array.from(map.values())

    } else if (['rh', 'juridique', 'employe', 'manager', 'direction'].includes(role)) {
      if (profile?.societe_id) {
        const { data } = await admin.from('societes').select('*').eq('id', profile.societe_id)
        societes = data || []
      }

    } else {
      // Rôle inconnu ou profil manquant — chercher via dossiers en dernier recours
      const { data: viaDossiers } = await admin.from('dossiers').select('societe_id, societes(*)').eq('client_id', user.id)
      const map = new Map()
      ;(viaDossiers || []).forEach((d: any) => { if (d.societes) map.set(d.societes.id, d.societes) })
      societes = Array.from(map.values())
    }

    return NextResponse.json({ societes }, { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' } })
  } catch (e: unknown) {
    console.error('[client/societes] GET error:', e)
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

    // Insert société — include created_by so the client can see it
    const insertData: Record<string, unknown> = {
      nom: body.nom,
      brn: body.brn || null,
      numero_tva_mra: body.numero_tva_mra || null,
      statut_tva: body.statut_tva || false,
      adresse: body.adresse || null,
      telephone: body.telephone || null,
      email: body.email || null,
      created_by: user.id,
    }
    if (body.ern) insertData.ern = body.ern
    if (body.secteur_activite) insertData.secteur_activite = body.secteur_activite

    const { data, error } = await admin.from('societes').insert(insertData).select().single()

    if (error) {
      console.error('[client/societes] POST insert error:', error.message, error.details, error.hint)
      // Retry without optional columns
      const fallbackData: Record<string, unknown> = {
        nom: body.nom,
        brn: body.brn || null,
        numero_tva_mra: body.numero_tva_mra || null,
        statut_tva: body.statut_tva || false,
        adresse: body.adresse || null,
        telephone: body.telephone || null,
        email: body.email || null,
      }
      const retry = await admin.from('societes').insert(fallbackData).select().single()
      if (retry.error) {
        console.error('[client/societes] POST fallback error:', retry.error.message)
        return NextResponse.json({ error: retry.error.message }, { status: 500 })
      }

      // Société created without created_by — create dossier to ensure visibility
      if (retry.data?.id) {
        await admin.from('dossiers').upsert({
          client_id: user.id,
          societe_id: retry.data.id,
          comptable_id: user.id, // fallback if NOT NULL
          statut: 'actif',
        }, { onConflict: 'client_id,societe_id', ignoreDuplicates: true })
      }
      return NextResponse.json({ societe: retry.data })
    }

    // Société created with created_by — also create a dossier as backup visibility path
    if (data?.id) {
      const { error: dossierError } = await admin.from('dossiers').insert({
        client_id: user.id,
        societe_id: data.id,
        comptable_id: user.id, // use self as fallback if NOT NULL required
        statut: 'actif',
      })
      if (dossierError) {
        console.error('[client/societes] dossier error:', dossierError.message)
        // Try with null comptable_id (if column is nullable)
        await admin.from('dossiers').insert({
          client_id: user.id,
          societe_id: data.id,
          comptable_id: null,
          statut: 'actif',
        })
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

    // Tenant isolation: vérifier l'accès du caller à la société
    await assertSocieteAccess(admin, user.id, id)

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
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
