import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/client/factures/next-number?societe_id=...&exercice=...
 *
 * Retourne le prochain numéro de facture client généré par la fonction
 * PL/pgSQL `get_next_facture_number(societe_id, exercice)` (migration 146).
 *
 * Réponse : { numero: 'FV-2026-000001', sequence: 1, exercice: 2026 }
 *
 * NOTE : cette fonction INCRÉMENTE la séquence à chaque appel. L'appelant
 * doit passer sequence + exercice dans le POST /api/client/factures pour que
 * la facture soit enregistrée avec les bonnes colonnes (UNIQUE partiel).
 */
export async function GET(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')
    const exerciceStr = searchParams.get('exercice')

    if (!societeId) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Defaut : année courante si exercice non fourni
    const exercice = exerciceStr ? parseInt(exerciceStr, 10) : new Date().getFullYear()
    if (!Number.isFinite(exercice) || exercice < 1900 || exercice > 9999) {
      return NextResponse.json({ error: 'exercice invalide' }, { status: 400 })
    }

    await assertSocieteAccess(supabase, user.id, societeId)

    const { data, error } = await supabase.rpc('get_next_facture_number', {
      p_societe_id: societeId,
      p_exercice: exercice,
    })

    if (error) {
      // Migration 146 pas appliquée ou autre souci RPC
      console.error('[factures/next-number] RPC error:', error.message)
      return NextResponse.json(
        {
          error:
            "Impossible de générer le numéro automatique (la fonction SQL get_next_facture_number n'est peut-être pas installée). Saisissez le numéro manuellement.",
        },
        { status: 500 },
      )
    }

    const numero = typeof data === 'string' ? data : String(data ?? '')
    // Format attendu : FV-YYYY-NNNNNN
    const match = numero.match(/^FV-(\d{4})-(\d+)$/)
    if (!match) {
      return NextResponse.json(
        { error: `Numéro inattendu retourné par la RPC : ${numero}` },
        { status: 500 },
      )
    }
    const sequence = parseInt(match[2], 10)

    return NextResponse.json({ numero, sequence, exercice })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
