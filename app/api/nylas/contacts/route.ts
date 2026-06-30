import { NextRequest, NextResponse } from 'next/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import { listNylasContacts, isNylasConfigured } from '@/lib/nylas/client'

export const dynamic = 'force-dynamic'

type Contact = { name: string; email: string; company?: string | null; source: 'lexora' | 'employe' | 'profil' | 'nylas' }

/**
 * GET /api/nylas/contacts?q=&societe_id=&account_id=
 * Autocomplétion destinataires : fusion contacts Lexora (factures_contacts)
 * + carnet d'adresses de la boîte connectée (Nylas), dédupliqués par email.
 */
export async function GET(req: NextRequest) {
  const user = await resolveUserAuth(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim().toLowerCase()
  const societeId = sp.get('societe_id')
  const admin = getAdminClient()
  const byEmail = new Map<string, Contact>()

  // 1. Contacts Lexora (clients/fournisseurs) — prioritaires.
  if (societeId) {
    let query = admin
      .from('factures_contacts')
      .select('nom, entreprise, email')
      .eq('societe_id', societeId)
      .eq('actif', true)
      .not('email', 'is', null)
      .limit(50)
    if (q) query = query.or(`nom.ilike.%${q}%,entreprise.ilike.%${q}%,email.ilike.%${q}%`)
    const { data } = await query
    for (const c of (data || []) as Array<{ nom: string | null; entreprise: string | null; email: string | null }>) {
      const email = (c.email || '').toLowerCase()
      if (!email || byEmail.has(email)) continue
      byEmail.set(email, { name: c.entreprise || c.nom || email, email, company: c.entreprise, source: 'lexora' })
    }
  }

  // 2. Employés de la société (ont souvent un email).
  if (societeId) {
    let eq = admin.from('employes').select('prenom, nom, email').eq('societe_id', societeId).not('email', 'is', null).limit(50)
    if (q) eq = eq.or(`prenom.ilike.%${q}%,nom.ilike.%${q}%,email.ilike.%${q}%`)
    const { data } = await eq
    for (const e of (data || []) as Array<{ prenom: string | null; nom: string | null; email: string | null }>) {
      const email = (e.email || '').toLowerCase()
      if (!email || byEmail.has(email)) continue
      byEmail.set(email, { name: [e.prenom, e.nom].filter(Boolean).join(' ') || email, email, source: 'employe' })
    }
  }

  // 3. Profils Lexora (utilisateurs internes).
  {
    let pq = admin.from('profiles').select('full_name, email').not('email', 'is', null).limit(30)
    if (q) pq = pq.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    const { data } = await pq
    for (const p of (data || []) as Array<{ full_name: string | null; email: string | null }>) {
      const email = (p.email || '').toLowerCase()
      if (!email || byEmail.has(email)) continue
      byEmail.set(email, { name: p.full_name || email, email, source: 'profil' })
    }
  }

  // 4. Carnet d'adresses de la boîte connectée (Nylas).
  if (isNylasConfigured()) {
    const acc = await resolveNylasAccount(admin, user.id, societeId, sp.get('account_id'))
    if (acc) {
      try {
        const nylasContacts = await listNylasContacts(acc.grantId, { limit: 200 })
        for (const c of nylasContacts) {
          const email = c.email.toLowerCase()
          if (!email || byEmail.has(email)) continue
          if (q && !email.includes(q) && !(c.name || '').toLowerCase().includes(q)) continue
          byEmail.set(email, { name: c.name || email, email, source: 'nylas' })
        }
      } catch { /* carnet optionnel */ }
    }
  }

  const contacts = Array.from(byEmail.values()).slice(0, 30)
  return NextResponse.json({ contacts })
}
