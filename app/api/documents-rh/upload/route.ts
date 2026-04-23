/**
 * POST /api/documents-rh/upload (multipart/form-data) — sprint DOC1.
 *
 * Authentifié. Comportement selon rôle :
 *   - employé : force employe_id = son propre id, direction = 'employe_vers_rh'
 *   - rh/admin : direction libre, choix employe_id libre
 *
 * Validation serveur : taille ≤ 10 MB, mime-type whitelist.
 * Upload Storage + insert DB atomique (rollback Storage si insert échoue).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  uploadDocument,
  validerFichier,
  TAILLE_MAX_OCTETS,
  type DocumentCategorie,
  type DocumentDirection,
  type UploaderRole,
} from '@/lib/rh/documents-rh'

export const dynamic = 'force-dynamic'
// Next.js App Router : route dynamique multipart, désactive le body parser implicite.
export const runtime = 'nodejs'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    // Profil + rôle
    const { data: prof } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    const isRH = ['admin', 'rh'].includes(role)

    // Parse form-data
    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })

    let employeId = String(form.get('employe_id') || '').trim()
    const categorie = String(form.get('categorie') || '').trim() as DocumentCategorie
    const sousCategorie = (form.get('sous_categorie') as string) || null
    const description = (form.get('description') as string) || null
    let direction = String(form.get('direction') || 'employe_vers_rh') as DocumentDirection
    const lienDemandeId = (form.get('lien_demande_conge_id') as string) || null
    const lienBulletinId = (form.get('lien_bulletin_id') as string) || null
    const lienGrossesseId = (form.get('lien_grossesse_id') as string) || null
    const confidentielRaw = String(form.get('confidentiel') || 'false').toLowerCase()
    const confidentiel = confidentielRaw === 'true' || confidentielRaw === '1'

    if (!categorie) {
      return NextResponse.json({ error: 'categorie requis' }, { status: 400 })
    }

    // Résolution employé self pour un employé non-RH.
    if (!isRH) {
      // Trouver l'id de l'employé associé au user (auth_user_id ou email).
      const { data: selfEmp } = await supabase
        .from('employes')
        .select('id, societe_id, email')
        .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
        .limit(1)
        .maybeSingle()
      if (!selfEmp) {
        return NextResponse.json(
          { error: 'Profil employé non trouvé pour cet utilisateur.' },
          { status: 403 },
        )
      }
      employeId = (selfEmp as any).id
      direction = 'employe_vers_rh' // employé ne peut pas envoyer "depuis RH"
    }

    if (!employeId) {
      return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    }

    // Récupère la societe_id depuis l'employé (pour le path Storage).
    const { data: emp } = await supabase
      .from('employes').select('id, societe_id').eq('id', employeId).maybeSingle()
    if (!emp?.societe_id) {
      return NextResponse.json({ error: 'Employé introuvable ou sans société' }, { status: 404 })
    }

    // Validation fichier côté serveur (défense en profondeur).
    const validation = validerFichier(file)
    if (!validation.valide) {
      return NextResponse.json({ error: validation.erreur }, { status: 422 })
    }

    const uploadeParRole: UploaderRole = isRH ? (role === 'admin' ? 'admin' : 'rh') : 'employe'

    const result = await uploadDocument(supabase, {
      file: file as any,
      nomFichierOriginal: file.name,
      mimeType: file.type,
      tailleOctets: file.size,
      employeId,
      societeId: (emp as any).societe_id,
      categorie,
      sousCategorie,
      description,
      direction,
      lienDemandeId,
      lienBulletinId,
      lienGrossesseId,
      confidentiel: confidentiel && isRH, // employé ne peut pas créer confidentiel
      uploadeParId: user.id,
      uploadeParRole,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.erreur }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: result.document })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur', max_taille_mb: TAILLE_MAX_OCTETS / 1024 / 1024 },
      { status: 500 },
    )
  }
}
