import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebarUnified } from "@/components/layout/AdminSidebarUnified"
import { RHSidebarDedicated } from "@/components/layout/RHSidebarDedicated"

const RH_ONLY = ['rh']
const RH_FULL = ['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin']

export default async function RHLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || ''
  if (![...RH_ONLY, ...RH_FULL].includes(role)) redirect('/redirect')

  const isRhOnly = RH_ONLY.includes(role)

  return (
    <div className="flex min-h-screen bg-gray-50">
      {isRhOnly ? <RHSidebarDedicated /> : <AdminSidebarUnified />}
      <main className={`flex-1 overflow-auto ${isRhOnly ? 'ml-60' : 'ml-64'}`}>{children}</main>
    </div>
  )
}
