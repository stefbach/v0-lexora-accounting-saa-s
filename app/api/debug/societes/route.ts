import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  const admin = getAdmin()
  const adminId = 'a62ccf45-0f40-4148-b2bf-a4e816240748' // Stéphane Bach

  // 1. Profile
  const { data: profile } = await admin.from('profiles').select('role, societe_id, client_id').eq('id', adminId).single()

  // 2. user_societes
  const { data: userSocietes } = await admin.from('user_societes').select('societe_id').eq('user_id', adminId)

  // 3. Dossiers
  const { data: dossiers } = await admin.from('dossiers').select('societe_id').eq('client_id', adminId)

  // 4. Sociétés created_by
  const { data: owned } = await admin.from('societes').select('id, nom').eq('created_by', adminId)

  // 5. ALL societes
  const allSocIds = new Set<string>()
  if (profile?.societe_id) allSocIds.add(profile.societe_id)
  for (const us of userSocietes || []) if (us.societe_id) allSocIds.add(us.societe_id)
  for (const d of dossiers || []) if (d.societe_id) allSocIds.add(d.societe_id)
  for (const s of owned || []) allSocIds.add(s.id)

  let societes: any[] = []
  if (allSocIds.size > 0) {
    const { data } = await admin.from('societes').select('id, nom').in('id', [...allSocIds])
    societes = data || []
  }

  return NextResponse.json({
    profile,
    user_societes: (userSocietes || []).map(us => us.societe_id),
    dossiers: (dossiers || []).map(d => d.societe_id),
    owned: (owned || []).map(s => ({ id: s.id, nom: s.nom })),
    all_societe_ids: [...allSocIds],
    societes,
  })
}
