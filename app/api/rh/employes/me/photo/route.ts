import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

async function resolveEmploye(admin: ReturnType<typeof getAdminClient>, userId: string, userEmail: string | undefined) {
  const { data: byAuth } = await admin
    .from('employes')
    .select('id, auth_user_id, email, photo_url')
    .eq('auth_user_id', userId)
    .is('date_depart', null)
    .maybeSingle()
  if (byAuth) return byAuth

  const { data: profile } = await admin.from('profiles').select('employe_id').eq('id', userId).maybeSingle()
  if (profile?.employe_id) {
    const { data: byProfile } = await admin
      .from('employes')
      .select('id, auth_user_id, email, photo_url')
      .eq('id', profile.employe_id)
      .is('date_depart', null)
      .maybeSingle()
    if (byProfile) return byProfile
  }

  if (userEmail) {
    const { data: byEmail } = await admin
      .from('employes')
      .select('id, auth_user_id, email, photo_url')
      .ilike('email', userEmail)
      .is('date_depart', null)
      .maybeSingle()
    if (byEmail) return byEmail
  }

  return null
}

// POST /api/rh/employes/me/photo — multipart/form-data, champ 'file'
// Seul l'employé connecté modifie sa propre photo.
export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const admin = getAdminClient()
    const employe = await resolveEmploye(admin, user.id, user.email || undefined)
    if (!employe) return NextResponse.json({ error: 'Aucun profil employé lié' }, { status: 404 })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier requis (champ "file")' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Type non supporté : ${file.type}. Formats acceptés : JPEG, PNG, WEBP` }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: `Fichier trop volumineux (${Math.round(file.size / 1024)} Ko). Maximum 2 Mo.` }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const storagePath = `${employe.id}/${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await admin.storage
      .from('avatars')
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })
    if (upErr) {
      console.error('[employes/me/photo] upload error:', upErr.message)
      return NextResponse.json({ error: `Upload échoué : ${upErr.message}` }, { status: 500 })
    }

    const { data: pub } = admin.storage.from('avatars').getPublicUrl(storagePath)
    const photoUrl = pub?.publicUrl || null

    const { error: updErr } = await admin
      .from('employes')
      .update({ photo_url: photoUrl })
      .eq('id', employe.id)
    if (updErr) {
      console.error('[employes/me/photo] update error:', updErr.message)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ photo_url: photoUrl, storage_path: storagePath })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur'
    console.error('[employes/me/photo] exception:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
