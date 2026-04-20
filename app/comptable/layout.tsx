import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ComptableSidebarNew } from "@/components/layout/ComptableSidebarNew"

const ALLOWED_ROLES = ['comptable', 'comptable_dedie', 'admin', 'super_admin']

export default async function ComptableLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!ALLOWED_ROLES.includes(role)) redirect('/redirect')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <ComptableSidebarNew />
      <main className="flex-1 overflow-auto md:ml-64">{children}</main>
    </div>
  )
}
