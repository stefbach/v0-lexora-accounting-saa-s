import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CrmSidebar } from "@/components/crm/CrmSidebar"

const ALLOWED_ROLES = ['admin', 'super_admin', 'commercial']

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!ALLOWED_ROLES.includes(role)) redirect('/redirect')

  return (
    <div className="flex min-h-screen">
      <CrmSidebar />
      <main className="flex-1 overflow-auto bg-gray-50/50 md:ml-64">
        {children}
      </main>
    </div>
  )
}
