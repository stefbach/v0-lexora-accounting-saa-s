import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientLayoutShell } from "./ClientLayoutShell"

const ALLOWED_ROLES = [
  'client_admin', 'client_assistant', 'client_user',
  'admin', 'super_admin',
  // Comptables accèdent à /client pour consulter les sociétés de leurs
  // clients (le shell leur affiche ComptableSidebarNew à la place).
  'comptable', 'comptable_dedie',
  // RH / manager / direction accèdent à /client pour les pages
  // d'administration partagées : telegram-config, telegram-permissions,
  // google-accounts, email-accounts. Le shell choisit le bon sidebar
  // selon le rôle ; les API gates protègent les actions sensibles.
  'rh', 'rh_manager', 'manager', 'team_leader', 'direction',
]

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role || ''
  if (!ALLOWED_ROLES.includes(role)) redirect('/redirect')

  return <ClientLayoutShell>{children}</ClientLayoutShell>
}
