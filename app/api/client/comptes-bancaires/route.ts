/**
 * /api/client/comptes-bancaires
 *
 * GET : liste les comptes bancaires d'une société (mig 010 + 043).
 *
 * Pendant client de la route /api/comptable/banque (qui est protégée
 * par rôle comptable). Cette route accepte tout utilisateur ayant accès
 * à la société (client_admin, client_user, etc.) via assertSocieteAccess.
 *
 * Utilisée par /client/facturation-settings pour pré-remplir les
 * coordonnées bancaires de facturation depuis les comptes déjà saisis.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

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
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

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
