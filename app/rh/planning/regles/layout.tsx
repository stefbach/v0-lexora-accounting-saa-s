import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Sécurité Sprint 1 — Audit RH a relevé que /rh/planning/regles n'avait
// AUCUN role-check côté page. Le RH layout (parent) laisse passer manager,
// client_user, comptable, etc. — qui n'ont aucune raison d'éditer les
// règles WRA d'une société. On gate ici à la liste explicite de l'audit :
// admin, super_admin, rh, rh_manager, client_admin, direction.
const ALLOWED_REGLES_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'client_admin',
  'direction',
]

export default async function ReglesPlanningLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = profile?.role || ''
  if (!ALLOWED_REGLES_ROLES.includes(role)) redirect('/redirect')
  return <>{children}</>
}
