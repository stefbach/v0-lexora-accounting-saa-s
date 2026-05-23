import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * POST /api/auth/validate-api-key
 * Validates an API key (used by MCP server middleware)
 *
 * Request body: { key: "sk_live_..." }
 * Response: { valid: boolean, user_id?: string, scopes?: string[], expires_at?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { key } = await req.json()

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'API key required' },
        { status: 400 }
      )
    }

    // Hash the provided key
    const keyHash = crypto.createHash('sha256').update(key).digest('hex')

    // Query database for this key
    const supabase = await createServerClient()
    const { data: apiKey, error } = await supabase
      .from('api_keys')
      .select('id,user_id,societe_id,scopes,expires_at,is_active')
      .eq('key_hash', keyHash)
      .single()

    if (error || !apiKey) {
      return NextResponse.json({ valid: false })
    }

    // Check if key is active
    if (!apiKey.is_active) {
      return NextResponse.json({ valid: false, reason: 'Key revoked' })
    }

    // Check if key expired
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: 'Key expired' })
    }

    // Update last_used_at
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKey.id)

    return NextResponse.json({
      valid: true,
      user_id: apiKey.user_id,
      societe_id: apiKey.societe_id,
      scopes: apiKey.scopes
    })
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Validation failed' },
      { status: 500 }
    )
  }
}
