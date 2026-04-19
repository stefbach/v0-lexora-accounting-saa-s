import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertFactureAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

type WorkflowAction = 'soumettre' | 'valider' | 'refuser'

interface WorkflowBody {
  action: WorkflowAction
  refus_raison?: string
  commentaire?: string
}

/**
 * State-machine des transitions autorisées (statut_workflow migration 148).
 * On garde ça minimaliste et rétro-compatible : on ne touche PAS aux
 * factures qui sont déjà en `envoyee`, `paye`, etc. (pas de transition back).
 */
const TRANSITIONS: Record<WorkflowAction, { from: string[]; to: string }> = {
  soumettre: { from: ['brouillon', 'refusee'], to: 'a_valider' },
  valider: { from: ['a_valider'], to: 'validee' },
  refuser: { from: ['a_valider'], to: 'refusee' },
}

/**
 * POST /api/client/factures/[id]/workflow
 *
 * Body : { action: 'soumettre' | 'valider' | 'refuser', refus_raison?, commentaire? }
 *
 * Transitions autorisées :
 *   brouillon  -> a_valider (soumettre)
 *   refusee    -> a_valider (soumettre après correction, retour pour re-validation)
 *   a_valider  -> validee   (valider)
 *   a_valider  -> refusee   (refuser, refus_raison requis)
 *
 * Champs maintenus :
 *   - statut_workflow
 *   - validee_par / validee_at (sur 'valider')
 *   - refus_raison (sur 'refuser')
 *
 * L'historique (`factures_approbations_historique`) est alimenté automatiquement
 * par le trigger SQL (migration 148) dès qu'on UPDATE statut_workflow. On insère
 * aussi explicitement une ligne pour attacher user_id + commentaire métier
 * (le trigger met user_id=auth.uid() qui est NULL côté service_role).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const body = (await request.json()) as Partial<WorkflowBody>
    const action = body.action
    const refusRaison = typeof body.refus_raison === 'string' ? body.refus_raison.trim() : ''
    const commentaire = typeof body.commentaire === 'string' ? body.commentaire.trim() : ''

    if (!action || !(action in TRANSITIONS)) {
      return NextResponse.json(
        { error: "action invalide — attendu : 'soumettre' | 'valider' | 'refuser'" },
        { status: 400 },
      )
    }

    if (action === 'refuser' && !refusRaison) {
      return NextResponse.json(
        { error: "Le motif de refus est obligatoire pour l'action 'refuser'." },
        { status: 400 },
      )
    }

    // Vérifie accès société + existence de la facture
    await assertFactureAccess(supabase, user.id, id)

    // Fetch facture pour contrôler la transition
    const { data: facture, error: fetchErr } = await supabase
      .from('factures')
      .select('id, societe_id, statut_workflow')
      .eq('id', id)
      .single()
    if (fetchErr || !facture) {
      return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })
    }

    const current: string = facture.statut_workflow || 'brouillon'
    const rule = TRANSITIONS[action]
    if (!rule.from.includes(current)) {
      return NextResponse.json(
        {
          error: `Transition non autorisée : '${current}' -> '${rule.to}' via '${action}'. Autorisé depuis : ${rule.from.join(', ')}`,
        },
        { status: 409 },
      )
    }

    // Role check : on s'appuie sur assertFactureAccess pour la société, plus une
    // vérif supplémentaire du role dans `user_societes` (si la ligne existe).
    // admin/super_admin passent toujours.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const globalRole = profile?.role ?? ''
    const isGlobalAdmin = ['admin', 'super_admin'].includes(globalRole)

    if (!isGlobalAdmin) {
      const { data: us } = await supabase
        .from('user_societes')
        .select('role')
        .eq('user_id', user.id)
        .eq('societe_id', facture.societe_id)
        .maybeSingle()
      const societeRole = us?.role ?? ''

      // Seuls les rôles "valideur" peuvent valider/refuser.
      // 'soumettre' est plus permissif (tout accès sur la société suffit).
      if (action === 'valider' || action === 'refuser') {
        const canApprove = ['owner', 'admin', 'manager', 'valideur', 'comptable'].includes(
          societeRole,
        )
        if (!canApprove) {
          return NextResponse.json(
            {
              error:
                "Vous n'avez pas le droit d'approuver ou de refuser cette facture (rôle insuffisant sur la société).",
            },
            { status: 403 },
          )
        }
      }
    }

    // Construit le patch
    const updates: Record<string, unknown> = {
      statut_workflow: rule.to,
      updated_at: new Date().toISOString(),
    }
    if (action === 'valider') {
      updates.validee_par = user.id
      updates.validee_at = new Date().toISOString()
      // On efface toute ancienne raison de refus
      updates.refus_raison = null
    } else if (action === 'refuser') {
      updates.refus_raison = refusRaison
      updates.validee_par = null
      updates.validee_at = null
    } else if (action === 'soumettre') {
      updates.refus_raison = null
    }

    const { data: updated, error: updErr } = await supabase
      .from('factures')
      .update(updates)
      .eq('id', id)
      .select('id, statut_workflow, validee_par, validee_at, refus_raison, approbation_niveau')
      .single()
    if (updErr) throw updErr

    // Log explicite (le trigger crée déjà une ligne mais sans user_id / commentaire)
    try {
      await supabase.from('factures_approbations_historique').insert({
        facture_id: id,
        ancien_statut: current,
        nouveau_statut: rule.to,
        action,
        user_id: user.id,
        commentaire: commentaire || (action === 'refuser' ? refusRaison : null),
      })
    } catch (logErr) {
      // Non bloquant : le trigger aura fait le minimum si la table existe.
      console.warn('[factures/workflow] historique insert failed:', logErr)
    }

    return NextResponse.json({ facture: updated })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
