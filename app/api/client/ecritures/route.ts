import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkPeriodLock } from '@/lib/accounting/period-lock'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * CRUD écritures comptables côté CLIENT (accès tenant-isolé).
 *
 * L'API /api/comptable/ecritures existe déjà et offre PATCH/DELETE/POST,
 * mais elle n'était PAS exposée sur les pages /client/ecritures et
 * /client/grand-livre — l'utilisateur ne pouvait donc ni corriger ni
 * supprimer une écriture en doublon (ex: paie générée 3 fois pour le
 * même salarié lors d'essais). Cette route reproduit les mêmes verbes
 * avec un contrôle d'accès via assertSocieteAccess pour les profils
 * client_admin / client_user.
 *
 * PATCH /api/client/ecritures
 *   body: { id, numero_compte?, libelle?, debit_mur?, credit_mur?, date_ecriture?, lettre? }
 *
 * DELETE /api/client/ecritures?id=<uuid>          — supprime UNE écriture
 * DELETE /api/client/ecritures?folio=<ref_folio>  — supprime TOUT un batch
 *   (utile pour annuler en une fois un essai de paie / facture qui a
 *    généré plusieurs lignes ecritures_comptables_v2 avec le même ref_folio)
 *
 * GET /api/client/ecritures?societe_id=<uuid>&compte=<num>&limit=
 *   — lecture (proxy lecture seule).
 */

export async function GET(request: Request) {
  try {
    // FIX MCP : resolveUserAuth accepte session + X-Lexora-Api-Key (outil MCP `list_ecritures`).
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const compte = searchParams.get('compte')
    const mois = searchParams.get('mois')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const journal = searchParams.get('journal')
    const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 1000)

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    await assertSocieteAccess(supabase, user.id, societe_id)

    let query = supabase
      .from('ecritures_comptables_v2')
      .select('*')
      .eq('societe_id', societe_id)
      .order('date_ecriture', { ascending: false })
      .limit(limit)

    if (compte) query = query.eq('numero_compte', compte)
    if (journal) query = query.eq('journal', journal)
    if (date_debut) query = query.gte('date_ecriture', date_debut)
    if (date_fin) query = query.lte('date_ecriture', date_fin)
    if (mois && !date_debut && !date_fin) {
      const [y, m] = mois.split('-').map(Number)
      const debut = `${y}-${String(m).padStart(2, '0')}-01`
      const finMois = new Date(y, m, 0).getDate()
      const fin = `${y}-${String(m).padStart(2, '0')}-${String(finMois).padStart(2, '0')}`
      query = query.gte('date_ecriture', debut).lte('date_ecriture', fin)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ecritures: data || [] })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { id, numero_compte, libelle, debit_mur, credit_mur, date_ecriture, lettre } = body
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Lit l'écriture pour récupérer societe_id (contrôle d'accès) +
    // date_ecriture (verrouillage de période).
    const { data: ecr } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, date_ecriture, societe_id')
      .eq('id', id)
      .single()
    if (!ecr) return NextResponse.json({ error: 'Écriture non trouvée' }, { status: 404 })

    await assertSocieteAccess(supabase, user.id, ecr.societe_id)

    // Période verrouillée (clôture mensuelle/annuelle) → refus.
    const dateForLock = date_ecriture || ecr.date_ecriture
    if (dateForLock) {
      const lockStatus = await checkPeriodLock(supabase, ecr.societe_id, dateForLock)
      if (lockStatus.locked) {
        return NextResponse.json({
          error: `Période verrouillée — ${lockStatus.reason}`,
        }, { status: 403 })
      }
    }

    const updates: Record<string, any> = {}
    if (numero_compte !== undefined) updates.numero_compte = String(numero_compte).trim()
    if (libelle !== undefined) updates.libelle = String(libelle).substring(0, 200)
    if (debit_mur !== undefined) updates.debit_mur = Math.round((Number(debit_mur) || 0) * 100) / 100
    if (credit_mur !== undefined) updates.credit_mur = Math.round((Number(credit_mur) || 0) * 100) / 100
    if (date_ecriture !== undefined) updates.date_ecriture = date_ecriture
    if (lettre !== undefined) updates.lettre = lettre || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ecritures_comptables_v2')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, ecriture: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const folio = searchParams.get('folio')

    if (!id && !folio) {
      return NextResponse.json({ error: 'id ou folio requis' }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Mode batch (folio) — supprime toutes les écritures d'un même
    // ref_folio. Cas d'usage : la paie d'un salarié génère 8-10 lignes
    // partageant le même folio (PAIE-emp-XXX-YYYY-MM). Pour annuler un
    // essai en doublon, l'utilisateur a besoin de supprimer le batch
    // complet en une fois.
    if (folio) {
      // Récupère les écritures concernées pour contrôler tenant + période.
      const { data: ecritures } = await supabase
        .from('ecritures_comptables_v2')
        .select('id, date_ecriture, societe_id')
        .eq('ref_folio', folio)
      if (!ecritures || ecritures.length === 0) {
        return NextResponse.json({ error: 'Aucune écriture trouvée pour ce folio' }, { status: 404 })
      }
      const societe_id = ecritures[0].societe_id
      await assertSocieteAccess(supabase, user.id, societe_id)
      // Période verrouillée sur AU MOINS UNE écriture → refus global.
      for (const e of ecritures) {
        if (e.date_ecriture && e.societe_id) {
          const lockStatus = await checkPeriodLock(supabase, e.societe_id, e.date_ecriture)
          if (lockStatus.locked) {
            return NextResponse.json({
              error: `Période verrouillée — ${lockStatus.reason}`,
            }, { status: 403 })
          }
        }
      }
      const { error, count } = await supabase
        .from('ecritures_comptables_v2')
        .delete({ count: 'exact' })
        .eq('ref_folio', folio)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, deleted: count || 0, folio })
    }

    // Mode single (id)
    const { data: ecr } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, date_ecriture, societe_id, ref_folio')
      .eq('id', id!)
      .single()
    if (!ecr) return NextResponse.json({ error: 'Écriture non trouvée' }, { status: 404 })

    await assertSocieteAccess(supabase, user.id, ecr.societe_id)

    if (ecr.date_ecriture) {
      const lockStatus = await checkPeriodLock(supabase, ecr.societe_id, ecr.date_ecriture)
      if (lockStatus.locked) {
        return NextResponse.json({
          error: `Période verrouillée — ${lockStatus.reason}`,
        }, { status: 403 })
      }
    }

    const { error } = await supabase
      .from('ecritures_comptables_v2')
      .delete()
      .eq('id', id!)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, deleted_id: id })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
