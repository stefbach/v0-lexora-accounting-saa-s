"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Rôle de l'utilisateur pour une société donnée.
 *
 * Lexora a DEUX sources de rôle :
 *  - `profiles.role`         → rôle global (multi-société, ex: super_admin)
 *  - `user_societes.role`    → rôle par société (ex: "direction" sur DDS,
 *                              "comptable" sur Acme Ltd)
 *
 * Pour les contrôles d'accès (sidebar, garde de pages, etc.) il faut
 * tenir compte des DEUX : l'utilisateur peut avoir un rôle global modeste
 * mais être "direction" sur une société précise — il doit alors voir les
 * menus Direction pour cette société.
 *
 * Ce hook fait la requête et renvoie le rôle pour la société active.
 * Null tant que pas chargé.
 */
export function useActiveSocieteRole(societeId: string | null | undefined): string | null {
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!societeId) {
      setRole(null)
      return
    }
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('user_societes')
          .select('role')
          .eq('user_id', user.id)
          .eq('societe_id', societeId)
          .maybeSingle()
        if (!cancelled) setRole((data?.role as string) || null)
      } catch {
        if (!cancelled) setRole(null)
      }
    })()
    return () => { cancelled = true }
  }, [societeId])

  return role
}
