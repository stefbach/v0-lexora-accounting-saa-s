/**
 * /api/admin/comptables/profil
 * GET  ?id=… — récupère le profil comptable étendu (mig 137)
 * PATCH      — met à jour type_comptable / employe_id / societe_cabinet / notes
 *
 * Réservé aux admin/super_admin (les comptables existants ne peuvent pas
 * modifier leur propre type — c'est une décision RH/admin).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'super_admin']

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getUserRole(supabase: ReturnType<typeof getAdminClient>, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role || ''
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const role = await getUserRole(supabase, user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const id = url.searchParams.get('id')
    const user_id = url.searchParams.get('user_id')
    if (!id && !user_id) {
      return NextResponse.json({ error: 'id ou user_id requis' }, { status: 400 })
    }

    // Sprint 4 TÂCHE 5 — lookup par comptables.id OU par auth.users.id.
    // L'UI /admin/comptables liste les users (role=comptable), le user_id
    // est plus pratique que de d'abord résoudre comptables.id.
    let query = supabase
      .from('comptables')
      .select('id, user_id, nom_complet, email, type, type_comptable, employe_id, societe_cabinet, notes, actif')
    if (id) query = query.eq('id', id)
    else if (user_id) query = query.eq('user_id', user_id)
    const { data, error } = await query.maybeSingle()
    if (error) {
      // Si la mig 137 n'est pas appliquée, retombons sur les colonnes legacy
      if (/type_comptable|employe_id|societe_cabinet/.test(error.message)) {
        let fb = supabase.from('comptables').select('id, user_id, nom_complet, email, type, actif')
        if (id) fb = fb.eq('id', id)
        else if (user_id) fb = fb.eq('user_id', user_id)
        const fallback = await fb.maybeSingle()
        if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
        return NextResponse.json({ comptable: fallback.data, schema_fallback: true })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ comptable: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const role = await getUserRole(supabase, user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, user_id, type_comptable, employe_id, societe_cabinet, notes } = body
    if (!id && !user_id) return NextResponse.json({ error: 'id ou user_id requis' }, { status: 400 })

    // Whitelist defensive — on n'accepte que les valeurs prévues
    const allowedTypes = ['interne', 'externe', 'dedie']
    if (type_comptable !== undefined && !allowedTypes.includes(type_comptable)) {
      return NextResponse.json({
        error: `type_comptable invalide. Valeurs autorisées : ${allowedTypes.join(', ')}`,
      }, { status: 400 })
    }

    // Cohérence : si interne → employe_id requis ; si externe → societe_cabinet
    // recommandé. On ne bloque pas (souple) mais on warn dans la réponse.
    const warnings: string[] = []
    if (type_comptable === 'interne' && !employe_id) {
      warnings.push('type=interne sans employe_id : pensez à lier la fiche employé')
    }
    if (type_comptable === 'externe' && !societe_cabinet) {
      warnings.push('type=externe sans societe_cabinet : pensez à renseigner le nom du cabinet')
    }

    const updates: Record<string, unknown> = {}
    if (type_comptable !== undefined) updates.type_comptable = type_comptable
    if (employe_id !== undefined) updates.employe_id = employe_id || null
    if (societe_cabinet !== undefined) updates.societe_cabinet = societe_cabinet || null
    if (notes !== undefined) updates.notes = notes || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'aucun champ à mettre à jour' }, { status: 400 })
    }

    // Sprint 4 TÂCHE 5 — si user_id fourni et pas de row comptables
    // existante, on UPSERT (cas d'un user role=comptable jamais injecté
    // dans la table legacy comptables). Pour `id` on suppose que la row
    // existe déjà.
    let data: any = null
    let error: any = null
    if (id) {
      const res = await supabase.from('comptables').update(updates).eq('id', id)
        .select('id, user_id, nom_complet, email, type, type_comptable, employe_id, societe_cabinet, notes')
        .maybeSingle()
      data = res.data; error = res.error
    } else if (user_id) {
      // Vérifie existence
      const existing = await supabase.from('comptables').select('id').eq('user_id', user_id).maybeSingle()
      if (existing.data) {
        const res = await supabase.from('comptables').update(updates).eq('user_id', user_id)
          .select('id, user_id, nom_complet, email, type, type_comptable, employe_id, societe_cabinet, notes')
          .maybeSingle()
        data = res.data; error = res.error
      } else {
        // Insert minimal row (nom_complet/email récupérés depuis profiles).
        const { data: prof } = await supabase.from('profiles')
          .select('full_name, email').eq('id', user_id).maybeSingle()
        const res = await supabase.from('comptables')
          .insert({
            user_id,
            nom_complet: prof?.full_name || 'Comptable',
            email: prof?.email || '',
            actif: true,
            ...updates,
          })
          .select('id, user_id, nom_complet, email, type, type_comptable, employe_id, societe_cabinet, notes')
          .maybeSingle()
        data = res.data; error = res.error
      }
    }
    if (error) {
      // Si mig 137 pas déployée, message clair
      if (/type_comptable|employe_id|societe_cabinet/.test(error.message)) {
        return NextResponse.json({
          error: 'Migration 137 non appliquée — exécutez supabase/migrations/137_comptables_type_employe_link.sql',
        }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ comptable: data, warnings })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
