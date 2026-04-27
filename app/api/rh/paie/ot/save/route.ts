import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getActiveSocieteIdFromCookies } from '@/lib/client/active-societe'
import {
  preparerLignesPourSave,
  saveOvertimeMois,
  type LigneFront,
} from '@/lib/rh/overtime'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rh/paie/ot/save
 *
 * Body :
 *   {
 *     periode: 'YYYY-MM-01',
 *     lignes: Array<{
 *       employe_id: string,
 *       total_ot_1_5_heures: number,
 *       total_ot_2_heures: number,
 *     }>
 *   }
 *
 * Auth : identique à /api/rh/paie/ot/preview (user_societes.role ∈
 * {rh, manager, client_admin}, pas profiles.role).
 *
 * Sécurité : la route ne fait JAMAIS confiance aux montants ni à la
 * distribution journalière du front. preparerLignesPourSave recharge
 * la vérité serveur (planning + paramètres + jours fériés), valide
 * chaque ligne (employé éligible, heures positives, plafond, capacité
 * physique du planning) et reconstruit les OvertimeLigneEmploye
 * propres avant l'écriture par saveOvertimeMois.
 */

const ALLOWED_ROLES = ['rh', 'manager', 'client_admin'] as const
const PERIODE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-01$/

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface BodyValidationError {
  index: number
  error: string
}

/**
 * Valide la forme de body.lignes — pas la sémantique métier (ça
 * c'est preparerLignesPourSave). Retourne soit les lignes typées
 * proprement, soit la liste de toutes les erreurs de forme.
 *
 * Règles :
 *   - chaque ligne est un objet
 *   - employe_id : string non-vide
 *   - au moins un de total_ot_1_5_heures / total_ot_2_heures présent
 *   - tout champ heures présent doit être un nombre fini >= 0
 *   - champ heures absent → défaut 0
 */
function validateBodyLignes(
  raw: unknown,
): { ok: true; lignes: LigneFront[] } | { ok: false; errors: BodyValidationError[] } {
  if (!Array.isArray(raw)) {
    return { ok: false, errors: [{ index: -1, error: 'lignes : array attendu' }] }
  }
  const errors: BodyValidationError[] = []
  const lignes: LigneFront[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i]
    if (!item || typeof item !== 'object') {
      errors.push({ index: i, error: 'objet attendu' })
      continue
    }
    const obj = item as Record<string, unknown>
    if (typeof obj.employe_id !== 'string' || obj.employe_id.length === 0) {
      errors.push({ index: i, error: 'employe_id : string non-vide requis' })
      continue
    }
    const has15 = Object.prototype.hasOwnProperty.call(obj, 'total_ot_1_5_heures')
    const has2 = Object.prototype.hasOwnProperty.call(obj, 'total_ot_2_heures')
    if (!has15 && !has2) {
      errors.push({
        index: i,
        error: 'total_ot_1_5_heures ou total_ot_2_heures requis',
      })
      continue
    }
    let ot15 = 0
    let ot2 = 0
    let lineHasError = false
    if (has15) {
      const v = obj.total_ot_1_5_heures
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        errors.push({ index: i, error: 'total_ot_1_5_heures : numérique ≥ 0 attendu' })
        lineHasError = true
      } else {
        ot15 = v
      }
    }
    if (has2) {
      const v = obj.total_ot_2_heures
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        errors.push({ index: i, error: 'total_ot_2_heures : numérique ≥ 0 attendu' })
        lineHasError = true
      } else {
        ot2 = v
      }
    }
    if (lineHasError) continue
    lignes.push({
      employe_id: obj.employe_id,
      total_ot_1_5_heures: ot15,
      total_ot_2_heures: ot2,
    })
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
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Société active depuis le cookie
    const societeId = await getActiveSocieteIdFromCookies()
    if (!societeId) {
      return NextResponse.json({ error: 'Aucune société sélectionnée' }, { status: 400 })
    }

    // 3. Vérification rôle sur user_societes
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

    // 4. Parse + validation forme du body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Format de la requête invalide' }, { status: 400 })
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Format de la requête invalide' }, { status: 400 })
    }
    const { periode, lignes: rawLignes } = body as {
      periode?: unknown
      lignes?: unknown
    }
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

    // 5. Court-circuit si rien à sauver — évite un audit_log "ot_save
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

    // 6. Validation métier serveur + recompute taux + redistribution jours.
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

    // 7. Écriture DB (heures_travaillees + bulletins_paie + audit_log).
    const result = await saveOvertimeMois(
      supabase,
      societeId,
      periode,
      lignes_validees,
      { id: user.id, email: user.email ?? user.id },
    )

    return NextResponse.json(result)
  } catch (e: unknown) {
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
