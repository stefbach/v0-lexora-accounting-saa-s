import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * DELETE /api/auth/api-keys/[id]
 * Revoke/delete an API key
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Verify ownership
    const { data: apiKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('id,user_id,name')
      .eq('id', id)
      .single()

    if (fetchError || !apiKey) {
      return NextResponse.json({ error: 'Clé API non trouvée' }, { status: 404 })
    }

    if (apiKey.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez supprimer que vos propres clés API' },
        { status: 403 }
      )
    }

    // Delete the key
    const { error: deleteError } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    // Log revocation in audit
    await supabase
      .from('api_keys_audit')
      .insert({
        api_key_id: id,
        action: 'revoked',
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent')
      })

    return NextResponse.json({
      message: `Clé API "${apiKey.name}" révoquée avec succès`
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * PATCH /api/auth/api-keys/[id]
 * Update API key metadata (name, description, etc)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await req.json()

    // Verify ownership
    const { data: apiKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('user_id')
      .eq('id', id)
      .single()

    if (fetchError || !apiKey) {
      return NextResponse.json({ error: 'Clé API non trouvée' }, { status: 404 })
    }

    if (apiKey.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez modifier que vos propres clés API' },
        { status: 403 }
      )
    }

    const updateData: any = {}
    if (body.name) updateData.name = body.name
    if (body.description) updateData.description = body.description
    if (body.expires_at) updateData.expires_at = body.expires_at

    const { data: updated, error: updateError } = await supabase
      .from('api_keys')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({
      message: 'Clé API mise à jour',
      key: updated
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
