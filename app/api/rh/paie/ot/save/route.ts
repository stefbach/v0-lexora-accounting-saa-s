import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getActiveSocieteIdFromCookies } from '@/lib/client/active-societe'
import {
  preparerLignesPourSave,
  saveOvertimeMois,
  type LigneFront,
  type SaisieJourOT,
} from '@/lib/rh/overtime'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rh/paie/ot/save
 *
 * Body (mode saisie détaillée libre par date, depuis STEP 4.0.2) :
 *   {
 *     periode: 'YYYY-MM-01',
 *     societe_id?: string,         // optionnel, fallback cookie
 *     lignes: Array<{
 *       employe_id: string,
 *       jours: Array<{
 *         date: 'YYYY-MM-DD',
 *         heures_ot_1_5?: number,   // ≥ 0, défaut 0 si absent
 *         heures_ot_2?: number,     // ≥ 0, défaut 0 si absent
 *         motif?: string,           // optionnel, info UI éphémère (non DB V1)
 *       }>,
 *     }>,
 *   }
 *
 * Auth : identique à /api/rh/paie/ot/preview. Société active résolue
 * par body.societe_id prioritaire, fallback cookie. Le check
 * user_societes vérifie l'accès en même temps que le rôle.
 *
 * Sécurité : la route ne fait JAMAIS confiance aux taux, montants ou
 * statut_jour envoyés par le front. preparerLignesPourSave recharge la
 * vérité serveur (paramètres taux, fenêtre période cycle, employés
 * actifs de la société, jours fériés), valide chaque ligne (employé
 * appartenant à la société, jours dans la fenêtre, heures ≥ 0) et
 * reconstruit les OvertimeLigneEmploye propres avant écriture par
 * saveOvertimeMois.
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

interface BodyValidationError {
  path: string                  // ex: "lignes[0].jours[2].date"
  error: string
}

const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valide la forme de body.lignes — pas la sémantique métier (employé
 * existe, date dans la fenêtre, etc., c'est preparerLignesPourSave).
 *
 * Règles :
 *   - chaque ligne est un objet avec employe_id (string non-vide) et
 *     jours (array, peut être vide → ligne validée à 0)
 *   - chaque jour est un objet avec date (ISO YYYY-MM-DD)
 *   - heures_ot_1_5 / heures_ot_2 : si présent, number fini ≥ 0 ;
 *     si absent, défaut 0 (tolérance REST sur l'absence, erreur
 *     dure sur la malformation)
 *   - motif : si présent, string ; sinon ignoré
 *
 * Collecte toutes les erreurs avec leur path (ex.
 * "lignes[0].jours[2].date") plutôt que bail-au-premier — meilleure
 * UX côté UI.
 */
function validateBodyLignes(
  raw: unknown,
): { ok: true; lignes: LigneFront[] } | { ok: false; errors: BodyValidationError[] } {
  if (!Array.isArray(raw)) {
    return { ok: false, errors: [{ path: 'lignes', error: 'array attendu' }] }
  }
  const errors: BodyValidationError[] = []
  const lignes: LigneFront[] = []

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      errors.push({ path: `lignes[${i}]`, error: 'objet attendu' })
      continue
    }
    const obj = item as Record<string, unknown>
    let lineHasError = false

    if (typeof obj.employe_id !== 'string' || obj.employe_id.length === 0) {
      errors.push({
        path: `lignes[${i}].employe_id`,
        error: 'string non-vide requis',
      })
      lineHasError = true
    }
    if (!Array.isArray(obj.jours)) {
      errors.push({
        path: `lignes[${i}].jours`,
        error: 'array attendu',
      })
      lineHasError = true
    }
    if (lineHasError) continue

    const employe_id = obj.employe_id as string
    const rawJours = obj.jours as unknown[]
    const jours: SaisieJourOT[] = []

    for (let j = 0; j < rawJours.length; j++) {
      const jourItem = rawJours[j]
      if (!jourItem || typeof jourItem !== 'object') {
        errors.push({
          path: `lignes[${i}].jours[${j}]`,
          error: 'objet attendu',
        })
        lineHasError = true
        continue
      }
      const jourObj = jourItem as Record<string, unknown>
      let jourHasError = false

      if (typeof jourObj.date !== 'string' || !DATE_ISO_REGEX.test(jourObj.date)) {
        errors.push({
          path: `lignes[${i}].jours[${j}].date`,
          error: 'format ISO YYYY-MM-DD attendu',
        })
        jourHasError = true
      }

      let ot15 = 0
      if (Object.prototype.hasOwnProperty.call(jourObj, 'heures_ot_1_5')) {
        const v = jourObj.heures_ot_1_5
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          errors.push({
            path: `lignes[${i}].jours[${j}].heures_ot_1_5`,
            error: 'numérique ≥ 0 attendu',
          })
          jourHasError = true
        } else {
          ot15 = v
        }
      }

      let ot2 = 0
      if (Object.prototype.hasOwnProperty.call(jourObj, 'heures_ot_2')) {
        const v = jourObj.heures_ot_2
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          errors.push({
            path: `lignes[${i}].jours[${j}].heures_ot_2`,
            error: 'numérique ≥ 0 attendu',
          })
          jourHasError = true
        } else {
          ot2 = v
        }
      }

      let motif: string | undefined
      if (Object.prototype.hasOwnProperty.call(jourObj, 'motif')
        && jourObj.motif !== undefined) {
        const v = jourObj.motif
        if (typeof v !== 'string') {
          errors.push({
            path: `lignes[${i}].jours[${j}].motif`,
            error: 'string attendu',
          })
          jourHasError = true
        } else {
          motif = v
        }
      }

      if (jourHasError) {
        lineHasError = true
        continue
      }
      jours.push({
        date: jourObj.date as string,
        heures_ot_1_5: ot15,
        heures_ot_2: ot2,
        ...(motif !== undefined ? { motif } : {}),
      })
    }

    if (lineHasError) continue
    lignes.push({ employe_id, jours })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, lignes }
}

export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return apiError('not_authenticated', 401)
    }

    // 2. Parse body — fait avant le role check pour pouvoir extraire le
    //    societe_id éventuellement passé en body (pattern /rh).
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('invalid_request_format', 400)
    }
    if (!body || typeof body !== 'object') {
      return apiError('invalid_request_format', 400)
    }
    const { periode, lignes: rawLignes, societe_id: societeIdFromBody } = body as {
      periode?: unknown
      lignes?: unknown
      societe_id?: unknown
    }

    // 3. Société active : body.societe_id prioritaire (pattern /rh),
    //    fallback cookie active_societe_id (pattern /client).
    const explicitSocieteId =
      typeof societeIdFromBody === 'string' && societeIdFromBody.length > 0
        ? societeIdFromBody
        : null
    if (explicitSocieteId && !UUID_REGEX.test(explicitSocieteId)) {
      return NextResponse.json({ error: 'societe_id invalide' }, { status: 400 })
    }
    const societeId = explicitSocieteId ?? await getActiveSocieteIdFromCookies()
    if (!societeId) {
      return NextResponse.json({ error: 'Aucune société sélectionnée' }, { status: 400 })
    }

    // 4. Vérification rôle sur user_societes (couvre AUSSI le check
    //    d'accès : si l'user n'a pas de ligne pour ce societe_id, link
    //    est null et on retourne 403).
    const supabase = getAdminClient()
    const { data: link } = await supabase
      .from('user_societes')
      .select('role')
      .eq('user_id', user.id)
      .eq('societe_id', societeId)
      .maybeSingle()
    const role = (link?.role ?? '') as string
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return apiError('access_denied', 403)
    }

    // 5. Validation forme du body (periode + lignes).
    if (typeof periode !== 'string' || !PERIODE_REGEX.test(periode)) {
      return NextResponse.json(
        { error: 'Période invalide (format attendu: YYYY-MM-01)' },
        { status: 400 },
      )
    }
    const validation = validateBodyLignes(rawLignes)
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'Format de la requête invalide', details: validation.errors },
        { status: 400 },
      )
    }

    // 6. Court-circuit si rien à sauver — évite un audit_log "ot_save
    //    avec 0 employés" et un round-trip DB inutile.
    if (validation.lignes.length === 0) {
      return NextResponse.json({
        success: true,
        nb_lignes_upsert: 0,
        nb_bulletins_maj: 0,
        bulletins_bloques: [],
        erreurs: [],
        warnings: [],
      })
    }

    // 7. Validation métier serveur (employé société + dates fenêtre) +
    //    recompute taux DB + reconstruction OvertimeLigneEmploye.
    const { lignes_validees, erreurs_validation } = await preparerLignesPourSave(
      supabase,
      societeId,
      periode,
      validation.lignes,
    )
    if (erreurs_validation.length > 0) {
      return NextResponse.json(
        { error: 'Validation échouée', erreurs_validation },
        { status: 400 },
      )
    }

    // 8. Écriture DB (heures_travaillees + bulletins_paie + audit_log).
    const result = await saveOvertimeMois(
      supabase,
      societeId,
      periode,
      lignes_validees,
      { id: user.id, email: user.email ?? user.id },
    )

    return NextResponse.json(result)
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : ''
    // Stack et détail DB restent côté serveur (Vercel logs).
    console.error('[ot/save] CRASH:', msg, stack)
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement des heures supplémentaires" },
      { status: 500 },
    )
  }
}
