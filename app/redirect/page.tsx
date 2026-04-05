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
  employe:           '/salarie',
  direction:         '/direction',
  rh_manager:        '/rh',
  salarie:           '/salarie',
}

export default function RedirectPage() {
  useEffect(() => {
    async function go() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }
      const { data: profile } = await supabase.from('profiles').select('role, employe_id').eq('id', user.id).single()
      const role = profile?.role || 'client_user'

      // Auto-link employe on login (fire and forget — don't block redirect)
      if (['employe', 'salarie', 'rh', 'manager', 'rh_manager'].includes(role)) {
        fetch('/api/rh/employes/me').catch(() => {})
      }

      window.location.href = ROLE_DASHBOARD[role] || '/client/tableau-de-bord'
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
