import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebarUnified } from "@/components/layout/AdminSidebarUnified"

export default async function RHLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebarUnified />
      <main className="flex-1 overflow-auto ml-64">{children}</main>
    </div>
  )
}
