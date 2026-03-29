import { createClient } from '@/lib/supabase/server'
import { createClient as adminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getAdmin() {
  return adminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

// GET — List sociétés for the current user (comptable, admin, or client)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const admin = getAdmin()
    const { data: profile } = await admin.from('profiles').select('role, societe_id').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''

    const societeMap = new Map<string, unknown>()

    if (['admin', 'super_admin'].includes(role)) {
      const { data } = await admin.from('societes').select('*').order('nom')
      ;(data || []).forEach((s: any) => societeMap.set(s.id, s))

    } else if (['comptable', 'comptable_dedie'].includes(role)) {
      // Sociétés assignées directement
      const { data: direct } = await admin.from('societes').select('*').eq('comptable_id', user.id)
      ;(direct || []).forEach((s: any) => societeMap.set(s.id, s))
      // Via dossiers
      const { data: viaDossiers } = await admin.from('dossiers').select('societe_id, societes(*)').eq('comptable_id', user.id)
      ;(viaDossiers || []).forEach((d: any) => { if (d.societes) societeMap.set(d.societes.id, d.societes) })
      // Via comptable_societes
      const { data: viaCS } = await admin.from('comptable_societes').select('societe_id, societes(*)').eq('comptable_id', user.id).eq('actif', true)
      ;(viaCS || []).forEach((r: any) => { if (r.societes) societeMap.set(r.societes.id, r.societes) })

    } else if (['client_admin', 'client_user'].includes(role)) {
      // Sociétés créées par le client + via dossiers
      const [{ data: owned }, { data: viaDossiers }] = await Promise.all([
        admin.from('societes').select('*').eq('created_by', user.id),
        admin.from('dossiers').select('societe_id, societes(*)').eq('client_id', user.id),
      ])
      ;(owned || []).forEach((s: any) => societeMap.set(s.id, s))
      ;(viaDossiers || []).forEach((d: any) => { if (d.societes) societeMap.set(d.societes.id, d.societes) })

    } else if (['rh', 'juridique', 'employe', 'manager', 'direction'].includes(role)) {
      if (profile?.societe_id) {
        const { data } = await admin.from('societes').select('*').eq('id', profile.societe_id)
        ;(data || []).forEach((s: any) => societeMap.set(s.id, s))
      }
    }

    return NextResponse.json({ societes: Array.from(societeMap.values()) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
