/**
 * /api/client/societes/[id]/logo
 *
 * POST   : upload (multipart/form-data, champ "file") du logo société.
 *          → écrit dans bucket `societes-logos` + met à jour societes.logo_url
 * DELETE : supprime le logo (bucket + colonne logo_url = NULL)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { uploadLogo, deleteLogo, MAX_BYTES, ALLOWED_MIME } from '@/lib/storage/societe-logo'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await assertSocieteAccess(supabase, user.id, id)

    const form = await request.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'multipart/form-data requis' }, { status: 400 })
    const file = form.get('file') as File | null
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Champ "file" manquant' }, { status: 400 })
    }

    const res = await uploadLogo(supabase, id, file)
    if (!res.ok || !res.url) {
      return NextResponse.json({ error: res.error }, { status: 400 })
    }

    // Persiste l'URL dans societes.logo_url (la colonne existait déjà)
    const { error: updErr } = await supabase
      .from('societes')
      .update({ logo_url: res.url })
      .eq('id', id)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, logo_url: res.url, path: res.path })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await assertSocieteAccess(supabase, user.id, id)

    const res = await deleteLogo(supabase, id)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 })

    const { error: updErr } = await supabase
      .from('societes')
      .update({ logo_url: null })
      .eq('id', id)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    await assertSocieteAccess(supabase, user.id, id)

    const { data } = await supabase
      .from('societes')
      .select('logo_url')
      .eq('id', id)
      .maybeSingle()

    return NextResponse.json({
      logo_url: data?.logo_url || null,
      limits: { max_bytes: MAX_BYTES, allowed_mime: ALLOWED_MIME },
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
