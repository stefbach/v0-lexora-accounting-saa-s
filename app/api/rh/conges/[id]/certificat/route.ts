import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
])
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const BUCKET = 'conges-certificats'
const SIGNED_URL_TTL = 60 * 10 // 10 minutes

async function checkAccess(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  userEmail: string | undefined,
  congeId: string,
): Promise<{ ok: boolean; conge?: any; isManager?: boolean; isSelf?: boolean; status?: number; error?: string }> {
  const { data: conge } = await admin
    .from('demandes_conges')
    .select('id, employe_id, type_conge, certificat_url, statut')
    .eq('id', congeId)
    .maybeSingle()
  if (!conge) return { ok: false, status: 404, error: 'Demande non trouvée' }

  const { data: emp } = await admin
    .from('employes')
    .select('id, societe_id, auth_user_id, email')
    .eq('id', conge.employe_id)
    .maybeSingle()
  if (!emp) return { ok: false, status: 404, error: 'Employé non trouvé' }

  const accessibleIds = await getUserSocieteIds(userId)
  const isManager = accessibleIds.includes(emp.societe_id)
  const isSelf = emp.auth_user_id === userId
    || (!!userEmail && !!emp.email && emp.email.toLowerCase().trim() === userEmail.toLowerCase().trim())
  if (!isManager && !isSelf) return { ok: false, status: 403, error: 'Accès non autorisé' }

  return { ok: true, conge, isManager, isSelf }
}

// POST /api/rh/conges/:id/certificat — multipart/form-data, champ 'file'
// Upload d'un certificat médical (SL > 3j). Seul l'employé ou un manager
// de sa société peut uploader. Stocké dans bucket privé 'conges-certificats'.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    const chk = await checkAccess(admin, user.id, user.email || undefined, id)
    if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier requis (champ "file")' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Type non supporté : ${file.type}. Formats acceptés : PDF, JPEG, PNG, WEBP` }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `Fichier trop volumineux. Maximum 10 Mo.` }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
    const storagePath = `${chk.conge!.employe_id}/${id}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })
    if (upErr) {
      console.error('[conges/certificat POST] upload error:', upErr.message)
      return NextResponse.json({ error: `Upload échoué : ${upErr.message}` }, { status: 500 })
    }

    const { error: updErr } = await admin
      .from('demandes_conges')
      .update({ certificat_url: storagePath })
      .eq('id', id)
    if (updErr) {
      console.error('[conges/certificat POST] update error:', updErr.message)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ certificat_url: storagePath })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur'
    console.error('[conges/certificat POST] exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET /api/rh/conges/:id/certificat — URL signée (10 min) pour consultation RH/employé.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    const chk = await checkAccess(admin, user.id, user.email || undefined, id)
    if (!chk.ok) return NextResponse.json({ error: chk.error }, { status: chk.status })

    const path = chk.conge?.certificat_url
    if (!path) return NextResponse.json({ error: 'Aucun certificat attaché à cette demande' }, { status: 404 })

    // Rétrocompatibilité : d'anciens enregistrements stockent directement une
    // URL publique (bucket legacy public). Dans ce cas, on la renvoie telle
    // quelle au lieu de tenter une createSignedUrl qui échouerait.
    if (/^https?:\/\//i.test(path)) {
      return NextResponse.json({ signed_url: path, expires_in: 0, legacy: true })
    }

    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
    if (error || !data?.signedUrl) {
      console.error('[conges/certificat GET] signed url error:', error?.message)
      return NextResponse.json({ error: error?.message || 'URL signée indisponible' }, { status: 500 })
    }

    return NextResponse.json({ signed_url: data.signedUrl, expires_in: SIGNED_URL_TTL })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur'
    console.error('[conges/certificat GET] exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
