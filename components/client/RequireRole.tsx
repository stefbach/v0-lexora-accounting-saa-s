"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { useProfile } from "@/hooks/use-profile"
import { Loader2 } from "lucide-react"

/** Roles allowed on pages that previously blocked only `client_user`. */
export const NON_CLIENT_USER_ROLES = [
  "client_admin",
  "client_assistant",
  "admin",
  "super_admin",
  "comptable",
  "comptable_dedie",
  "direction",
] as const

/**
 * RequireRole — gate a client-space page by profile role.
 *
 * Usage:
 *   <RequireRole roles={NON_CLIENT_USER_ROLES}>
 *     {pageContent}
 *   </RequireRole>
 *
 * - If the profile is still loading: renders a skeleton.
 * - If the profile's role is NOT in `roles`: renders an "access denied" card
 *   with a link back to the dashboard.
 * - Otherwise: renders children.
 *
 * Replaces the 12+ inline `if (profile?.role === "client_user") return <...>`
 * blocks listed in Section 1 of AUDIT_CLIENT_ESPACE.md.
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly string[]
  children: React.ReactNode
}) {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  if (!profile || !roles.includes(profile.role)) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-muted-foreground">
              Vous n&apos;avez pas accès à cette section.
            </p>
            <Link
              href="/client/tableau-de-bord"
              className="text-sm underline mt-4 inline-block"
              style={{ color: "#D4AF37" }}
            >
              Retour au tableau de bord
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
