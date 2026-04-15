/**
 * /api/admin/comptables/profil
 * GET  ?id=… — récupère le profil comptable étendu (mig 137)
 * PATCH      — met à jour type_comptable / employe_id / societe_cabinet / notes
 *
 * Réservé aux admin/super_admin (les comptables existants ne peuvent pas
 * modifier leur propre type — c'est une décision RH/admin).
 */
import { NextResponse } from 'next/server'
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
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const role = await getUserRole(supabase, user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data, error } = await supabase
      .from('comptables')
      .select('id, nom_complet, email, type, type_comptable, employe_id, societe_cabinet, notes, actif')
      .eq('id', id)
      .maybeSingle()
    if (error) {
      // Si la mig 137 n'est pas appliquée, retombons sur les colonnes legacy
      if (/type_comptable|employe_id|societe_cabinet/.test(error.message)) {
        const fallback = await supabase
          .from('comptables')
          .select('id, nom_complet, email, type, actif')
          .eq('id', id)
          .maybeSingle()
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
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const role = await getUserRole(supabase, user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { id, type_comptable, employe_id, societe_cabinet, notes } = body
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

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

    const { data, error } = await supabase
      .from('comptables')
      .update(updates)
      .eq('id', id)
      .select('id, nom_complet, email, type, type_comptable, employe_id, societe_cabinet, notes')
      .maybeSingle()
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
