/**
 * GET /api/documents-rh — liste les documents accessibles.
 *
 * Query params (tous optionnels, combinables) :
 *   employe_id              : filtre par employé
 *   categorie               : filtre par catégorie
 *   direction               : 'employe_vers_rh' | 'rh_vers_employe'
 *   archive                 : 'true' | 'false' (défaut : tous)
 *   lien_demande_conge_id   : filtre par demande de congé liée
 *   lien_bulletin_id        : filtre par bulletin lié
 *   lien_grossesse_id       : filtre par grossesse liée
 *
 * Au moins un filtre est requis côté RH, sauf si 'archive=false' (liste
 * globale des docs actifs pour le dashboard widget). Côté employé,
 * employe_id est forcé sur son propre id.
 *
 * RLS filtre automatiquement les docs visibles :
 *   - employé : ses propres docs (sauf confidentiel_rh_only)
 *   - rh/admin : tous
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import type { DocumentRH } from '@/lib/rh/documents-rh'

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
    const role = (prof as { role?: string } | null)?.role || ''
    const isRH = ['admin', 'rh'].includes(role)

    const params = new URL(request.url).searchParams
    const employeIdRaw = params.get('employe_id')
    const categorie = params.get('categorie')
    const direction = params.get('direction')
    const archive = params.get('archive')
    const lienDemandeId = params.get('lien_demande_conge_id')
    const lienBulletinId = params.get('lien_bulletin_id')
    const lienGrossesseId = params.get('lien_grossesse_id')

    // Côté employé : forcer employe_id = son propre id, quelles que soient
    // les autres clauses (les RLS feraient filtrer mais on assure aussi ici).
    let employeId = employeIdRaw || ''
    if (!isRH) {
      const { data: selfEmp } = await supabase
        .from('employes')
        .select('id')
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
        .limit(1)
        .maybeSingle()
      if (!selfEmp) {
        return NextResponse.json(
          { documents: [], total: 0, error: 'Profil employé non trouvé' },
          { status: 403 },
        )
      }
      employeId = (selfEmp as { id: string }).id
    }

    // Construire la query avec tous les filtres optionnels. Au moins un
    // doit être fourni côté RH pour éviter un SELECT * global imprudent
    // (hormis archive=false pour les widgets).
    let query = supabase
      .from('documents_rh')
      .select('*')
      .order('created_at', { ascending: false })

    if (employeId) query = query.eq('employe_id', employeId)
    if (categorie) query = query.eq('categorie', categorie)
    if (direction) query = query.eq('direction', direction)
    if (archive !== null) query = query.eq('archive', archive === 'true')
    if (lienDemandeId) query = query.eq('lien_demande_conge_id', lienDemandeId)
    if (lienBulletinId) query = query.eq('lien_bulletin_id', lienBulletinId)
    if (lienGrossesseId) query = query.eq('lien_grossesse_id', lienGrossesseId)

    // Guard côté RH : au moins UN filtre. 'archive=false' seul est
    // acceptable (widget dashboard). Sinon on refuse pour limiter la
    // surface des données retournées.
    const hasAnyFilter = Boolean(
      employeId || categorie || direction || archive !== null
        || lienDemandeId || lienBulletinId || lienGrossesseId,
    )
    if (!hasAnyFilter) {
      return NextResponse.json(
        { error: 'Au moins un filtre requis (employe_id, lien_demande_conge_id, …)' },
        { status: 400 },
      )
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data || []) as DocumentRH[]
    // Défense en profondeur côté employé : cacher les docs confidentiel_rh_only.
    const filtered = isRH ? rows : rows.filter(d => !d.confidentiel_rh_only)

    return NextResponse.json({ documents: filtered, total: filtered.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
