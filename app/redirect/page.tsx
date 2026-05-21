"use client"
import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

const ROLE_DASHBOARD: Record<string, string> = {
  admin:             '/admin',
  super_admin:       '/admin',
  comptable:         '/comptable',
  comptable_dedie:   '/comptable',
  client_admin:      '/client/tableau-de-bord',
  client_user:       '/client/tableau-de-bord',
  client_assistant:  '/client/assistant',
  rh:                '/rh',
  juridique:         '/juridique',
  manager:           '/rh',
  team_leader:       '/rh',
  employe:           '/salarie',
  direction:         '/direction',
  rh_manager:        '/rh',
  salarie:           '/salarie',
}

export default function RedirectPage() {
  useEffect(() => {
    async function go() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { window.location.href = '/auth/login'; return }

        // Use maybeSingle() — .single() throws when the profile row is missing
        // (fresh account before the trigger has run), which previously stalled
        // the redirect on a permanent loader.
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, employe_id')
          .eq('id', user.id)
          .maybeSingle()

        const role = profile?.role || 'client_user'

        // Defensive fallback: if the profile has NO role but IS linked to an
        // employe_id (migration 108/109 populated the back-link), treat the
        // user as an 'employe'. Protects new accounts whose role row hasn't
        // been stamped yet.
        const effectiveRole = (!profile?.role && profile?.employe_id) ? 'employe' : role

        // Auto-link employe on login (fire and forget — don't block redirect)
        if (['employe', 'salarie', 'rh', 'manager', 'team_leader', 'rh_manager'].includes(effectiveRole)) {
          fetch('/api/rh/employes/me').catch(() => {})
        }

        window.location.href = ROLE_DASHBOARD[effectiveRole] || '/client/tableau-de-bord'
      } catch (err) {
        console.error('[redirect] failed, defaulting to /client:', err)
        window.location.href = '/client/tableau-de-bord'
      }
    }
    go()
  }, [])

  return (
    <div className="flex items-center justify-center h-screen bg-[#0B0F2E]">
      <div className="text-center text-white">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#D4AF37]" />
        <p className="font-medium">Redirection en cours...</p>
      </div>
    </div>
  )
}
