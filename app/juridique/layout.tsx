import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JuridiqueSidebar } from "@/components/layout/JuridiqueSidebar"

export default async function JuridiqueLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role || ''
  if (!['juridique', 'admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(role)) {
    redirect('/redirect')
  }
  return (
    <div className="flex min-h-screen bg-gray-50">
      <JuridiqueSidebar />
      <main className="flex-1 overflow-auto md:ml-60">{children}</main>
    </div>
  )
}
