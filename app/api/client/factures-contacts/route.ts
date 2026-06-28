/**
 * /api/client/factures-contacts
 *
 * GET    : liste des contacts d'une société (filtre actif facultatif, recherche q)
 * POST   : crée un contact (mode bulk via { items: [...] } supporté)
 *
 * Tenant isolation via assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { validateContactPayload } from '@/lib/contacts/validate'

export const dynamic = 'force-dynamic'

const SELECT_COLS =
  'id, nom, entreprise, adresse, code_postal, ville, pays, email, telephone, mobile, fax, vat_number, brn, kbis, site_web, devise, conditions_paiement, offshore, actif, created_at, updated_at'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const includeInactifs = searchParams.get('include_inactifs') === '1'
    const q = (searchParams.get('q') || '').trim()
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    // FIX MCP : resolveUserAuth pour outil MCP `list_tiers` (annuaire contacts).
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    let query = supabase
      .from('factures_contacts')
      .select(SELECT_COLS)
      .eq('societe_id', societe_id)
      .order('nom', { ascending: true })
      .limit(500)
    if (!includeInactifs) query = query.eq('actif', true)
    if (q) {
      // Recherche par nom ou entreprise (ilike). Échappe les caractères wildcard.
      const safe = q.replace(/[%_]/g, '\\$&')
      query = query.or(`nom.ilike.%${safe}%,entreprise.ilike.%${safe}%`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    }
    const societe_id = String(body.societe_id || '')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    // Mode bulk pour import legacy localStorage
    if (Array.isArray(body.items)) {
      const itemsRaw = body.items as any[]
      if (itemsRaw.length === 0) return NextResponse.json({ inserted: 0 })
      if (itemsRaw.length > 500) {
        return NextResponse.json({ error: 'Maximum 500 items par import' }, { status: 400 })
      }
      const toInsert: any[] = []
      const errors: string[] = []
      itemsRaw.forEach((it, i) => {
        const v = validateContactPayload(it)
        if (!v.ok) {
          errors.push(`Ligne ${i + 1}: ${v.error}`)
          return
        }
        toInsert.push({ ...v.data, societe_id })
      })
      if (errors.length > 0 && toInsert.length === 0) {
        return NextResponse.json({ error: errors.join(' · ') }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('factures_contacts')
        .insert(toInsert)
        .select('id, nom')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({
        inserted: data?.length || 0,
        skipped: errors.length,
        errors,
      })
    }

    const v = validateContactPayload(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const { data, error } = await supabase
      .from('factures_contacts')
      .insert({ ...v.data, societe_id })
      .select(SELECT_COLS)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ item: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
