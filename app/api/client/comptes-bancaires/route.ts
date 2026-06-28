/**
 * /api/client/comptes-bancaires
 *
 * GET  : liste les comptes bancaires d'une société (mig 010 + 043).
 * POST : crée un nouveau compte bancaire pour la société.
 *
 * Pendant client de la route /api/comptable/banque (qui est protégée
 * par rôle comptable). Cette route accepte tout utilisateur ayant accès
 * à la société (client_admin, client_user, etc.) via assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'

export const dynamic = 'force-dynamic'

const SELECT_COLS =
  'id, banque, nom_compte, numero_compte, iban, swift, devise, compte_principal, actif, ordre_affichage'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    // FIX MCP : resolveUserAuth accepte session web + X-Lexora-Api-Key —
    // requis pour l'outil MCP `list_comptes_bancaires` consommé par Claude.
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const { data, error } = await supabase
      .from('comptes_bancaires')
      .select(SELECT_COLS)
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('compte_principal', { ascending: false })
      .order('ordre_affichage', { ascending: true, nullsFirst: false })
      .order('banque', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ comptes: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const societe_id: string = body.societe_id
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    const banque = String(body.banque || '').trim()
    if (!banque) {
      return NextResponse.json({ error: 'banque requise' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    await assertSocieteAccess(supabase, user.id, societe_id)

    const payload = {
      societe_id,
      banque,
      nom_compte: body.nom_compte ? String(body.nom_compte).trim() : null,
      numero_compte: body.numero_compte ? String(body.numero_compte).trim() : null,
      iban: body.iban ? String(body.iban).trim() : null,
      swift: body.swift ? String(body.swift).trim() : null,
      devise: body.devise ? String(body.devise).trim() : 'MUR',
      compte_principal: !!body.compte_principal,
      actif: true,
    }

    const { data, error } = await supabase
      .from('comptes_bancaires')
      .insert(payload)
      .select(SELECT_COLS)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ compte: data }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
