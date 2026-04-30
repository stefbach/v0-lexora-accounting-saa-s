/**
 * POST /api/comptable/reset-complet
 *
 * Reset NUCLÉAIRE de la comptabilité d'une société.
 * Conçu pour sortir d'un état corrompu (écritures orphelines, comptes dupliqués,
 * factures mélangées entre sociétés, rapprochements cassés).
 *
 * Ce que ça efface pour la société visée :
 *   - TOUTES les écritures comptables (ecritures_comptables_v2) — pas seulement FAC/BANK/PAY
 *   - TOUTES les factures (facturation + fournisseurs)
 *   - TOUTES les lignes d'audit rapprochement (rapprochement_audit_log)
 *   - TOUS les relevés bancaires importés (releves_bancaires) — optionnel
 *   - TOUS les documents uploadés (documents) + fichiers storage — optionnel
 *   - TVA mensuelle (tva_mensuelle) — optionnel
 *   - Bulletins de paie (bulletins_paie) — optionnel
 *   - Plan comptable client (plan_comptable_client) — optionnel (laisse par défaut)
 *
 * Ce que ça garde :
 *   - La société elle-même (societes)
 *   - Les utilisateurs / profils / rôles
 *   - Les comptes bancaires (comptes_bancaires) — on ne supprime que les relevés
 *   - Les paramètres (taux_change, parametres_paie_*, jours_feries, etc.)
 *
 * Confirmation triple pour éviter une fausse manœuvre :
 *   {
 *     societe_id: "<uuid>",
 *     confirm: "RESET_COMPLET",
 *     confirm_nom_societe: "<nom exact de la société>",
 *     options: { // tous optionnels, false par défaut sauf les 3 obligatoires
 *       documents: false,        // effacer documents + storage
 *       releves: false,          // effacer releves_bancaires (recommandé)
 *       tva: false,              // effacer tva_mensuelle
 *       bulletins: false,        // effacer bulletins_paie
 *       plan_comptable: false,   // effacer plan_comptable_client
 *     }
 *   }
 */

import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function deleteWithCount(
  supabase: any,
  table: string,
  match: Record<string, any>
): Promise<number> {
  let q = supabase.from(table).delete({ count: 'exact' })
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { count, error } = await q
  if (error) {
    // On ne jette pas : si la table n'existe pas, on log et on continue.
    console.warn(`[reset-complet] delete ${table} error:`, error.message)
    return 0
  }
  return count || 0
}

export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    // Vérifier que l'utilisateur est admin ou comptable (refuse les clients)
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = profile?.role || ''
    if (!['admin', 'super_admin', 'comptable', 'comptable_dedie'].includes(role)) {
      return NextResponse.json({ error: 'Rôle insuffisant pour un reset complet' }, { status: 403 })
    }

    const body = await request.json()
    const { societe_id, confirm, confirm_nom_societe, options = {} } = body

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    if (confirm !== 'RESET_COMPLET') {
      return NextResponse.json({
        error: 'Confirmation manquante. Envoyer confirm="RESET_COMPLET"',
      }, { status: 400 })
    }

    // Multi-tenant guard P0 — sinon un comptable peut wiper la compta d'un
    // autre cabinet. Le check de rôle au-dessus n'est pas suffisant.
    {
      const { assertSocieteAccess, SocieteAccessError } = await import('@/lib/supabase/assert-societe-access')
      try {
        await assertSocieteAccess(supabase, user.id, societe_id as string)
      } catch (e) {
        if (e instanceof SocieteAccessError) return NextResponse.json({ error: e.message }, { status: 403 })
        throw e
      }
    }

    // Vérifier le nom de la société pour éviter un reset sur la mauvaise cible
    const { data: societe } = await supabase
      .from('societes').select('id, nom').eq('id', societe_id).maybeSingle()
    if (!societe) {
      return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    }
    if (!confirm_nom_societe || confirm_nom_societe.trim() !== societe.nom) {
      return NextResponse.json({
        error: `Vérification échouée. Renvoyez confirm_nom_societe="${societe.nom}"`,
        expected: societe.nom,
      }, { status: 400 })
    }

    const stats: Record<string, number> = {}

    // Collecter tous les dossier_id de cette société → permet de rattraper les
    // écritures orphelines où societe_id est NULL mais dossier_id pointe bien vers
    // un dossier de la société (cas legacy avant le fix du trigger v1→v2).
    const { data: dossiers } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds: string[] = (dossiers || []).map((d: any) => d.id)

    // 1. ÉCRITURES COMPTABLES — suppression en 2 passes pour attraper
    //    a) celles avec societe_id correct
    //    b) celles avec societe_id NULL mais dossier_id de cette société
    stats.ecritures = await deleteWithCount(supabase, 'ecritures_comptables_v2', { societe_id })
    if (dossierIds.length > 0) {
      const { count: orphelines, error: orphErr } = await supabase
        .from('ecritures_comptables_v2')
        .delete({ count: 'exact' })
        .in('dossier_id', dossierIds)
      if (!orphErr) stats.ecritures += (orphelines || 0)
    }

    // 2. FACTURES (clients + fournisseurs + avoirs)
    stats.factures = await deleteWithCount(supabase, 'factures', { societe_id })

    // 3. AUDIT LOG rapprochement
    stats.audit_log = await deleteWithCount(supabase, 'rapprochement_audit_log', { societe_id })

    // 4. RAPPROCHEMENTS bancaires (enregistrements de synthèse)
    stats.rapprochements = await deleteWithCount(supabase, 'rapprochements_bancaires', { societe_id })

    // 5. OPTIONS

    // 5a. Relevés bancaires (supprime les transactions importées)
    if (options.releves) {
      stats.releves = await deleteWithCount(supabase, 'releves_bancaires', { societe_id })
    }

    // 5b. Documents + storage (cascade societe_id ET dossier_id pour rattraper
    //    les documents avec societe_id NULL)
    if (options.documents) {
      // Lister les storage_path (via societe_id OU dossier_id de cette société)
      let docsQuery = supabase.from('documents').select('id, storage_path')
      if (dossierIds.length > 0) {
        docsQuery = docsQuery.or(`societe_id.eq.${societe_id},dossier_id.in.(${dossierIds.join(',')})`)
      } else {
        docsQuery = docsQuery.eq('societe_id', societe_id)
      }
      const { data: docsToDelete } = await docsQuery
      if (docsToDelete && docsToDelete.length > 0) {
        const paths = docsToDelete.map((d: any) => d.storage_path).filter(Boolean) as string[]
        if (paths.length > 0) {
          await supabase.storage.from('documents').remove(paths).catch((e: any) => {
            console.warn('[reset-complet] storage.remove error:', e?.message)
          })
        }
      }
      // Supprimer en 2 passes (mêmes critères)
      stats.documents = await deleteWithCount(supabase, 'documents', { societe_id })
      if (dossierIds.length > 0) {
        const { count: orphanDocs } = await supabase
          .from('documents').delete({ count: 'exact' }).in('dossier_id', dossierIds)
        stats.documents += (orphanDocs || 0)
      }
    }

    // 5c. TVA mensuelle
    if (options.tva) {
      stats.tva_mensuelle = await deleteWithCount(supabase, 'tva_mensuelle', { societe_id })
    }

    // 5d. Bulletins de paie + lignes associées
    if (options.bulletins) {
      // Supprimer les lignes d'abord si la table existe (FK)
      await deleteWithCount(supabase, 'bulletins_paie_lignes', { societe_id })
      stats.bulletins = await deleteWithCount(supabase, 'bulletins_paie', { societe_id })
    }

    // 5e. Plan comptable client (attention : le recréer ensuite)
    if (options.plan_comptable) {
      stats.plan_comptable_client = await deleteWithCount(supabase, 'plan_comptable_client', { societe_id })
    }

    // 6. Comptes courants associés (liés à la société mais utilisés seulement si rapprochement)
    stats.comptes_courants_associes = await deleteWithCount(supabase, 'comptes_courants_associes', { societe_id })

    // 7. Remettre les soldes bancaires à zéro (sinon la page Banque affiche
    //    un solde fantôme même si toutes les transactions ont été supprimées).
    //    On GARDE les comptes bancaires (config: banque, numéro, devise) mais
    //    on remet solde_actuel = 0 pour un redémarrage propre.
    const { count: nbComptesReset } = await supabase
      .from('comptes_bancaires')
      .update({ solde_actuel: 0 })
      .eq('societe_id', societe_id)
      .neq('solde_actuel', 0)
    stats.comptes_bancaires_solde_reset = nbComptesReset || 0

    // 8. Immobilisations — garde par défaut (ne touche que si demandé)
    if (options.immobilisations) {
      stats.immobilisations = await deleteWithCount(supabase, 'immobilisations', { societe_id })
    }

    return NextResponse.json({
      ok: true,
      societe: { id: societe.id, nom: societe.nom },
      message: `Reset complet effectué pour la société "${societe.nom}".`,
      stats,
      next_steps: [
        'La société est maintenant vide côté comptabilité.',
        options.plan_comptable
          ? 'Recréer le plan comptable client si nécessaire.'
          : 'Le plan comptable client a été conservé.',
        'Réimporter les relevés bancaires et/ou les factures pour redémarrer proprement.',
      ],
    })
  } catch (e: any) {
    console.error('[reset-complet]', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
