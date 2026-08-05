import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { APP_SPACES, appSpaceMetadata, appSpaceViewport } from "@/lib/pwa-spaces"

/**
 * Installable comme application distincte : le navigateur retient le manifeste
 * de la page affichée, donc une installation lancée depuis cet espace produit
 * « Lexora Administration » et non l'application publique. Voir lib/pwa-spaces.ts.
 */
export const metadata = appSpaceMetadata(APP_SPACES.admin)
export const viewport = appSpaceViewport()

const ALLOWED_ROLES = ['admin', 'super_admin']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!ALLOWED_ROLES.includes(role)) redirect('/redirect')

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-auto bg-gray-50/50 md:ml-64">
        {children}
      </main>
    </div>
  )
}
