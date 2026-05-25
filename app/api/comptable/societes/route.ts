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
      const { data: dossiers } = await admin.from('dossiers').select('societe_id').eq('comptable_id', user.id)
      if (dossiers && dossiers.length > 0) {
        const sIds = dossiers.map(d => d.societe_id).filter(Boolean)
        if (sIds.length > 0) {
          const { data: linked } = await admin.from('societes').select('*').in('id', sIds)
          ;(linked || []).forEach((s: any) => societeMap.set(s.id, s))
        }
      }
      // Via comptable_societes (table may not exist)
      try {
        const { data: viaCS, error: csErr } = await admin.from('comptable_societes').select('societe_id').eq('comptable_id', user.id).eq('actif', true)
        if (!csErr && viaCS && viaCS.length > 0) {
          const csIds = viaCS.map((r: any) => r.societe_id).filter(Boolean)
          if (csIds.length > 0) {
            const { data: csSocietes } = await admin.from('societes').select('*').in('id', csIds)
            ;(csSocietes || []).forEach((s: any) => societeMap.set(s.id, s))
          }
        }
      } catch { /* table may not exist */ }

    } else if (['client_admin', 'client_user'].includes(role)) {
      // Sociétés créées par le client + via dossiers
      const { data: owned } = await admin.from('societes').select('*').eq('created_by', user.id)
      ;(owned || []).forEach((s: any) => societeMap.set(s.id, s))

      const { data: dossiers } = await admin.from('dossiers').select('societe_id').eq('client_id', user.id)
      if (dossiers && dossiers.length > 0) {
        const societeIds = dossiers.map(d => d.societe_id).filter(Boolean)
        if (societeIds.length > 0) {
          const { data: linkedSocietes } = await admin.from('societes').select('*').in('id', societeIds)
          ;(linkedSocietes || []).forEach((s: any) => societeMap.set(s.id, s))
        }
      }

    } else if (['rh', 'rh_manager', 'juridique', 'employe', 'manager', 'direction'].includes(role)) {
      if (profile?.societe_id) {
        const { data } = await admin.from('societes').select('*').eq('id', profile.societe_id)
        ;(data || []).forEach((s: any) => societeMap.set(s.id, s))
      }
    }

    // Pour TOUS les rôles: ajouter les sociétés via user_societes
    const { data: userSocietes } = await admin.from('user_societes').select('societe_id').eq('user_id', user.id)
    console.log(`[comptable/societes] user=${user.id} role=${role} before_us=${societeMap.size} user_societes=${(userSocietes||[]).length}`)
    if (userSocietes && userSocietes.length > 0) {
      const usIds = userSocietes.map(us => us.societe_id).filter(Boolean)
      if (usIds.length > 0) {
        const { data: usSocietes } = await admin.from('societes').select('*').in('id', usIds)
        ;(usSocietes || []).forEach((s: any) => societeMap.set(s.id, s))
      }
    }

    const result = Array.from(societeMap.values())
    console.log(`[comptable/societes] returning ${result.length} societes for user ${user.id}`)
    return NextResponse.json({ societes: result })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur inconnue' }, { status: 500 })
  }
}
