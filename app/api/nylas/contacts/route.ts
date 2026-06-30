import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { listNylasContacts, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

type Contact = { name: string; email: string; company?: string | null; source: 'carnet' | 'nylas' }

/**
 * GET /api/nylas/contacts?q=&societe_id=&account_id=
 * Autocomplétion PAR BOÎTE : contacts enregistrés de la boîte active
 * (nylas_account_contacts) + carnet d'adresses Gmail/Nylas de cette boîte.
 * Dédupliqués par email.
 */
export async function GET(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim().toLowerCase()
  const admin = getAdminClient()
  const byEmail = new Map<string, Contact>()

  if (!isNylasConfigured()) return NextResponse.json({ contacts: [] })
  const acc = await resolveNylasAccount(admin, user.id, sp.get('societe_id'), sp.get('account_id'))
  if (!acc) return NextResponse.json({ contacts: [] })

  // 1. Contacts enregistrés dans cette boîte (cartes de visite, etc.).
  {
    let query = admin
      .from('nylas_account_contacts')
      .select('name, company, email')
      .eq('account_id', acc.id)
      .not('email', 'is', null)
      .limit(50)
    if (q) query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`)
    const { data } = await query
    for (const c of (data || []) as Array<{ name: string | null; company: string | null; email: string | null }>) {
      const email = (c.email || '').toLowerCase()
      if (!email || byEmail.has(email)) continue
      byEmail.set(email, { name: c.name || c.company || email, email, company: c.company, source: 'carnet' })
    }
  }

  // 2. Carnet d'adresses Gmail/Outlook de cette boîte (Nylas).
  try {
    const nylasContacts = await listNylasContacts(acc.grantId, { limit: 200 })
    for (const c of nylasContacts) {
      const email = c.email.toLowerCase()
      if (!email || byEmail.has(email)) continue
      if (q && !email.includes(q) && !(c.name || '').toLowerCase().includes(q)) continue
      byEmail.set(email, { name: c.name || email, email, source: 'nylas' })
    }
  } catch { /* carnet optionnel (scope contacts non accordé) */ }

  return NextResponse.json({ contacts: Array.from(byEmail.values()).slice(0, 30), account_email: acc.account_email })
}
