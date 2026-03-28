"use client"
import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

// Mapping rôle → route dashboard
const ROLE_DASHBOARD: Record<string, string> = {
  admin:             '/admin',
  direction:         '/direction',
  comptable:         '/comptable',
  comptable_dedie:   '/comptable',
  rh_manager:        '/rh',
  juridique:         '/rh/juridique',
  client_admin:      '/client/tableau-de-bord',
  client_user:       '/client/tableau-de-bord',
  salarie:           '/salarie',
}

export default function RedirectPage() {
  useEffect(() => {
    async function redirect() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login'; return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const role = profile?.role || 'client_user'
      const destination = ROLE_DASHBOARD[role] || '/client/tableau-de-bord'
      window.location.href = destination
    }
    redirect()
  }, [])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]"/>
        <p className="text-sm text-gray-500">Chargement de votre espace...</p>
      </div>
    </div>
  )
}
