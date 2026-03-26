"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Loader2 } from "lucide-react"

export default function RedirectPage() {
  useEffect(() => {
    async function redirect() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = "/auth/login"
        return
      }

      // Try to get role from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      let role = profile?.role

      // Fallback to API if RLS blocks
      if (!role) {
        try {
          const res = await fetch("/api/me")
          const data = await res.json()
          role = data.role
        } catch {
          // default
        }
      }

      if (role === "admin") window.location.href = "/admin"
      else if (role === "comptable") window.location.href = "/comptable"
      else window.location.href = "/client"
    }

    redirect()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
        <p className="text-muted-foreground">Redirection en cours...</p>
      </div>
    </div>
  )
}
