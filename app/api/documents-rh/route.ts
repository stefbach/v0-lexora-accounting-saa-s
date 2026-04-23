/**
 * GET /api/documents-rh — liste les documents accessibles.
 *
 * Query params :
 *   employe_id (requis côté RH, ignoré côté employé qui voit les siens)
 *   categorie, direction, archive, lien_demande_conge_id : filtres facultatifs
 *
 * RLS filtre automatiquement les docs visibles :
 *   - employé : ses propres docs (sauf confidentiel_rh_only)
 *   - rh/admin : tous
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getDocumentsEmploye, type DocumentCategorie, type DocumentDirection } from '@/lib/rh/documents-rh'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    const isRH = ['admin', 'rh'].includes(role)

    const url = new URL(request.url)
    let employeId = url.searchParams.get('employe_id') || ''

    // Si non-RH : forcer l'employe_id = son propre id employé.
    if (!isRH) {
      const { data: selfEmp } = await supabase
        .from('employes')
        .select('id')
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
        .limit(1)
        .maybeSingle()
      if (!selfEmp) {
        return NextResponse.json({ documents: [], error: 'Profil employé non trouvé' }, { status: 403 })
      }
      employeId = (selfEmp as any).id
    }

    if (!employeId) {
      return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    }

    const options: {
      categorie?: DocumentCategorie
      direction?: DocumentDirection
      archive?: boolean
      lienDemandeId?: string
    } = {}
    const cat = url.searchParams.get('categorie')
    if (cat) options.categorie = cat as DocumentCategorie
    const dir = url.searchParams.get('direction')
    if (dir) options.direction = dir as DocumentDirection
    const arch = url.searchParams.get('archive')
    if (arch !== null) options.archive = arch === 'true'
    const lien = url.searchParams.get('lien_demande_conge_id')
    if (lien) options.lienDemandeId = lien

    const documents = await getDocumentsEmploye(supabase, employeId, options)

    // Pour les employés non-RH : filtre supplémentaire côté API (défense en
    // profondeur) pour cacher les docs confidentiel_rh_only.
    const filtered = isRH
      ? documents
      : documents.filter(d => !d.confidentiel_rh_only)

    return NextResponse.json({ documents: filtered, total: filtered.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
