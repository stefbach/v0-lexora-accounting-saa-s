/**
 * GET /api/documents-rh/[id]/url — URL signée Supabase Storage pour
 * télécharger/visualiser le document.
 *
 * Côté employé : retourne l'URL UNIQUEMENT si le doc lui appartient et
 * n'est pas confidentiel_rh_only. Marque aussi le doc comme 'vu' si
 * c'était un doc entrant (rh_vers_employe) non encore consulté.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getDocument, getSignedUrl, marquerCommeVu } from '@/lib/rh/documents-rh'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(
  request: Request,
  context: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const params = await Promise.resolve(context.params as any)
    const id = String(params.id || '')
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const supabase = getAdminClient()

    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    const isRH = ['admin', 'rh'].includes(role)

    const doc = await getDocument(supabase, id)
    if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })

    // Contrôle d'accès côté employé : doc doit lui appartenir et ne pas être confidentiel.
    if (!isRH) {
      if (doc.confidentiel_rh_only) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
      const { data: selfEmp } = await supabase
        .from('employes').select('id')
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
        .limit(1).maybeSingle()
      if (!selfEmp || (selfEmp as any).id !== doc.employe_id) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
      // Marquer comme vu (side-effect non-bloquant).
      if (doc.direction === 'rh_vers_employe' && !doc.vu_par_destinataire_le) {
        await marquerCommeVu(supabase, id).catch(() => {})
      }
    }

    const signed = await getSignedUrl(supabase, doc.storage_path, 3600)
    if (!signed) {
      return NextResponse.json({ error: 'URL signée indisponible' }, { status: 500 })
    }

    return NextResponse.json({
      url: signed,
      expire_in: 3600,
      nom_fichier: doc.nom_fichier_original,
      mime_type: doc.mime_type,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
