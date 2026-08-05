import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RHSidebarDedicated } from "@/components/layout/RHSidebarDedicated"
import CommandSearch from "@/components/CommandSearch"
import { FloatingPageHelp } from "@/components/help/FloatingPageHelp"
import { APP_SPACES, appSpaceMetadata, appSpaceViewport } from "@/lib/pwa-spaces"

/**
 * Installable comme application distincte : le navigateur retient le manifeste
 * de la page affichée, donc une installation lancée depuis cet espace produit
 * « Lexora RH » et non l'application publique. Voir lib/pwa-spaces.ts.
 */
export const metadata = appSpaceMetadata(APP_SPACES.rh)
export const viewport = appSpaceViewport()

const ALLOWED_ROLES = ['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin', 'client_user', 'rh', 'rh_manager', 'manager', 'team_leader', 'direction']

export default async function RHLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!ALLOWED_ROLES.includes(role)) redirect('/redirect')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <RHSidebarDedicated />
      <main className="flex-1 overflow-auto md:ml-60">{children}</main>
      <CommandSearch />
      <FloatingPageHelp />
    </div>
  )
}
