"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export interface ModulesUtilisateur {
  documents?: boolean
  comptabilite?: boolean
  facturation?: boolean
  rh?: boolean
  fiscal?: boolean
  etats_financiers?: boolean
  employe_portal?: boolean
}

interface Profile {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  client_category?: string | null
  modules_utilisateur?: ModulesUtilisateur | null
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProfile() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // Try from profiles table
          const { data } = await supabase
            .from("profiles")
            .select("id, email, full_name, role, phone, client_category, modules_utilisateur")
            .eq("id", user.id)
            .single()

          if (data) {
            setProfile(data)
          } else {
            // Fallback to user metadata
            setProfile({
              id: user.id,
              email: user.email || "",
              full_name: user.user_metadata?.full_name || user.email || "",
              role: user.user_metadata?.role || "client",
              phone: null,
            })
          }
        }
      } catch {
        console.error("Failed to fetch profile")
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [])

  return { profile, loading }
}
