import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * GET /api/auth/api-keys
 * List all API keys for the current user
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('id,name,description,key_preview,created_at,last_used_at,expires_at,is_active,scopes')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      keys: apiKeys || [],
      message: `${apiKeys?.length || 0} clé(s) API trouvée(s)`
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/auth/api-keys
 * Create a new API key for the current user
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name, description, societe_id, expires_at, scopes = ['read:all', 'write:entries'] } = body

    if (!name || name.length < 3 || name.length > 100) {
      return NextResponse.json(
        { error: 'Le nom de la clé doit faire entre 3 et 100 caractères' },
        { status: 400 }
      )
    }

    // Generate secure API key
    const apiKey = 'sk_live_' + crypto.randomBytes(24).toString('hex')
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
    const keyPreview = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4)

    // Insert into database
    const { data: newKey, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        societe_id,
        name,
        description,
        key_hash: keyHash,
        key_preview: keyPreview,
        expires_at,
        scopes,
        is_active: true
      })
      .select('id,name,key_preview,created_at')
      .single()

    if (error) throw error

    // Log creation in audit
    await supabase
      .from('api_keys_audit')
      .insert({
        api_key_id: newKey.id,
        action: 'created',
        ip_address: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent')
      })

    return NextResponse.json({
      message: 'Clé API créée avec succès',
      key: apiKey, // Only returned once at creation
      preview: keyPreview,
      id: newKey.id,
      name: newKey.name,
      warning: '⚠️ Sauvegarde cette clé immédiatement. Tu ne pourras pas la voir à nouveau pour des raisons de sécurité.'
    }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
