import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getActiveSocieteIdFromCookies } from '@/lib/client/active-societe'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rh/paie/ot/historique?societe_id=X&periode=YYYY-MM-01
 *
 * Liste les OT déjà enregistrées pour le bulletin cible donné (toutes
 * les lignes `heures_travaillees` dont `periode_paiement = periode`),
 * pour la société active de l'utilisateur.
 *
 * Depuis mig 435, `periode_paiement` représente le mois du bulletin
 * où l'OT est payée, indépendamment de la `date` réelle de l'OT — donc
 * ce listing inclut potentiellement des OT dont la date est dans un
 * autre mois. C'est le comportement attendu : afficher tout ce qui
 * sera payé sur ce bulletin.
 *
 * Auth : même pattern que /api/rh/paie/ot/preview.
 */

const ALLOWED_ROLES = ['rh', 'manager', 'team_leader', 'client_admin'] as const
const PERIODE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-01$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export interface OTHistoriqueLigne {
  id: string
  employe_id: string
  employe_nom: string
  date: string
  heures_ot_1_5: number
  heures_ot_2: number
  montant_ot: number
  statut_jour: string | null
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const societeIdFromQuery = searchParams.get('societe_id')
    if (societeIdFromQuery && !UUID_REGEX.test(societeIdFromQuery)) {
      return NextResponse.json({ error: 'societe_id invalide' }, { status: 400 })
    }
    const societeId = societeIdFromQuery ?? await getActiveSocieteIdFromCookies()
    if (!societeId) {
      return NextResponse.json({ error: 'Aucune société sélectionnée' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data: link } = await supabase
      .from('user_societes')
      .select('role')
      .eq('user_id', user.id)
      .eq('societe_id', societeId)
      .maybeSingle()

    const role = (link?.role ?? '') as string
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const periode = searchParams.get('periode') ?? ''
    if (!PERIODE_REGEX.test(periode)) {
      return NextResponse.json(
        { error: 'Période invalide (format attendu: YYYY-MM-01)' },
        { status: 400 },
      )
    }

    // Liste des employés actifs de la société pour scoper la requête.
    const { data: employes } = await supabase
      .from('employes')
      .select('id, nom, prenom')
      .eq('societe_id', societeId)

    const employesMap = new Map<string, { nom: string; prenom: string }>()
    for (const e of (employes ?? []) as Array<{ id: string; nom: string | null; prenom: string | null }>) {
      employesMap.set(e.id, { nom: e.nom ?? '', prenom: e.prenom ?? '' })
    }
    const employeIds = Array.from(employesMap.keys())

    if (employeIds.length === 0) {
      return NextResponse.json({ lignes: [] })
    }

    // Lecture des heures_travaillees pour ce bulletin cible.
    const { data: rows, error } = await supabase
      .from('heures_travaillees')
      .select('id, employe_id, date, heures_ot_1_5, heures_ot_2, montant_ot, statut_jour')
      .in('employe_id', employeIds)
      .eq('periode_paiement', periode)
      .order('date', { ascending: true })

    if (error) {
      // Migration 435 non appliquée : la colonne periode_paiement n'existe pas.
      // On renvoie un payload explicite plutôt qu'un fallback silencieux
      // (règle Alicia du CLAUDE.md).
      if (/periode_paiement/i.test(error.message)) {
        return NextResponse.json(
          {
            error: 'Migration 435 non appliquée (heures_travaillees.periode_paiement manquante)',
            code: 'MIGRATION_MISSING',
            migration: '435_heures_travaillees_periode_paiement',
          },
          { status: 500 },
        )
      }
      console.error('[ot/historique] DB error:', error.message)
      return NextResponse.json(
        { error: 'Erreur lecture historique OT' },
        { status: 500 },
      )
    }

    const lignes: OTHistoriqueLigne[] = ((rows ?? []) as Array<{
      id: string
      employe_id: string
      date: string
      heures_ot_1_5: number | string | null
      heures_ot_2: number | string | null
      montant_ot: number | string | null
      statut_jour: string | null
    }>)
      .filter(r => (Number(r.heures_ot_1_5) || 0) > 0 || (Number(r.heures_ot_2) || 0) > 0)
      .map(r => {
        const emp = employesMap.get(r.employe_id)
        return {
          id: r.id,
          employe_id: r.employe_id,
          employe_nom: emp ? `${emp.prenom} ${emp.nom}`.trim() : r.employe_id,
          date: String(r.date).slice(0, 10),
          heures_ot_1_5: Number(r.heures_ot_1_5) || 0,
          heures_ot_2: Number(r.heures_ot_2) || 0,
          montant_ot: Number(r.montant_ot) || 0,
          statut_jour: r.statut_jour,
        }
      })

    return NextResponse.json({ lignes })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ot/historique] CRASH:', msg)
    return NextResponse.json(
      { error: 'Erreur lors de la lecture de l\'historique OT' },
      { status: 500 },
    )
  }
}
