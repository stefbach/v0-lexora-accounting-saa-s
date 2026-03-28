import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Use service role key to bypass RLS and create users
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin credentials')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// GET — List all users from profiles
export async function GET() {
  try {
    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ users: data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST — Create a new user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, full_name, role, phone, comptable_id } = body

    if (!email || !password || !full_name || !role) {
      return NextResponse.json(
        { error: 'Email, mot de passe, nom complet et rôle sont requis' },
        { status: 400 }
      )
    }

    const validRoles = ['admin', 'client_admin', 'client_user', 'comptable', 'comptable_dedie']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Rôle invalide. Les rôles acceptés sont : ${validRoles.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = getAdminClient()

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
      },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Échec de la création du compte' }, { status: 500 })
    }

    // Update the profile with additional info (trigger creates it with defaults)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name,
        role,
        phone: phone || null,
        comptable_id: comptable_id || null,
      })
      .eq('id', authData.user.id)

    if (profileError) {
      // Profile might not exist yet if trigger hasn't fired, try insert
      await supabase.from('profiles').upsert({
        id: authData.user.id,
        email,
        full_name,
        role,
        phone: phone || null,
        comptable_id: comptable_id || null,
      })
    }

    return NextResponse.json({
      user: {
        id: authData.user.id,
        email,
        full_name,
        role,
        phone,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
