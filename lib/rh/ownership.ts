const RH_ROLES = ['admin', 'super_admin', 'rh', 'rh_manager', 'direction', 'client_admin']

export async function resolveOwnership(
  supabase: any,
  userId: string,
): Promise<{ isRH: boolean; employe_id: string | null; role: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('employe_id, role')
    .eq('id', userId)
    .maybeSingle()

  const role = (profile as any)?.role || ''
  const isRH = RH_ROLES.includes(role)
  let employe_id = (profile as any)?.employe_id || null

  if (!employe_id) {
    const { data: emp } = await supabase
      .from('employes')
      .select('id')
      .eq('auth_user_id', userId)
      .maybeSingle()
    employe_id = (emp as any)?.id || null
  }

  return { isRH, employe_id, role }
}
