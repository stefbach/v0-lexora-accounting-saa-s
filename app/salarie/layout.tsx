import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SalarieSidebar } from "@/components/layout/SalarieSidebar"

/**
 * Layout for the Espace Salarié (employee self-service portal).
 *
 * Role gate (server-side, runs before the page):
 *   - Primary roles allowed: 'employe', 'salarie'.
 *   - Admins and HR (admin, super_admin, rh, rh_manager, manager, direction,
 *     client_admin) are also allowed so they can "view as employee" for
 *     support — they just need the employe_id back-link on their profile to
 *     see anything meaningful.
 *   - If the role is empty but profiles.employe_id IS populated (migration
 *     108/109 linked the employee back-reference but the role column was
 *     never stamped), we still allow access — matches the fallback in
 *     app/redirect/page.tsx and the middleware.
 *
 * Unauthenticated users are bounced to /auth/login by the middleware;
 * anyone who slips past with no usable profile is bounced to /redirect
 * (which routes them to their own dashboard).
 */
const ALLOWED_ROLES = new Set([
  "employe",
  "salarie",
  "rh",
  "rh_manager",
  "manager",
  "admin",
  "super_admin",
  "direction",
  "client_admin",
  // client_assistant is admitted too — a client's assistant (e.g. Daril) may
  // also be a regular employee (Daril has an employes row linked via
  // profiles.employe_id). She/he keeps the client_assistant role for
  // /client/* access while the hasEmployeLink fallback grants /salarie.
  "client_assistant",
])

export default async function SalarieLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, employe_id")
    .eq("id", user.id)
    .maybeSingle()

  const role = profile?.role || ""
  const hasEmployeLink = !!profile?.employe_id

  if (!ALLOWED_ROLES.has(role) && !hasEmployeLink) {
    redirect("/redirect")
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SalarieSidebar />
      <main className="flex-1 overflow-auto md:ml-60">{children}</main>
    </div>
  )
}
