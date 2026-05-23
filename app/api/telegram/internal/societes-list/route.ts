import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { getAccessibleSocieteIds } from '@/lib/supabase/assert-societe-access'

/**
 * GET  /api/telegram/internal/societes-list?chat_id=<n>
 *   → liste les sociétés accessibles au user Telegram, avec flag active
 *
 * POST /api/telegram/internal/societes-list
 *   body { chat_id, societe_id | societe_nom }
 *   → switche la société active du chat (résout par id ou par nom partiel)
 *
 * Utilise le résolveur multi-voies getAccessibleSocieteIds : user_societes,
 * dossiers (client_id et comptable_id), societes.created_by/comptable_id,
 * comptable_societes, cabinet_collaborateurs_acces, profiles.comptable_id.
 */
async function fetchAccessibleSocietes(userId: string, currentSocieteId: string) {
  const admin = getAdminClient()
  let ids: string[] = []
  try {
    ids = await getAccessibleSocieteIds(admin, userId)
  } catch {
    ids = []
  }
  // Garantie minimum : la société active du chat doit TOUJOURS être listée,
  // même si une voie du résolveur a planté silencieusement.
  if (currentSocieteId && !ids.includes(currentSocieteId)) ids.push(currentSocieteId)
  if (ids.length === 0) return []
  const { data } = await admin
    .from('societes')
    .select('id, nom, brn, devise_principale')
    .in('id', ids)
    .order('nom', { ascending: true })
  return (data || []).map((s: any) => ({
    id: s.id,
    nom: s.nom,
    brn: s.brn,
    devise: s.devise_principale || 'MUR',
    active: s.id === currentSocieteId,
  }))
}

export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'societes.list', async (ctx) => {
    const societes = await fetchAccessibleSocietes(ctx.user_id, ctx.societe_id)
    return { result: { count: societes.length, societes } }
  })
}

export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'societes.switch', async (ctx, body) => {
    const target_id = body?.societe_id ? String(body.societe_id).trim() : null
    const target_nom = body?.societe_nom ? String(body.societe_nom).trim() : null
    if (!target_id && !target_nom) {
      return { result: null, status: 'error', error_msg: 'societe_id ou societe_nom requis' }
    }
    const accessible = await fetchAccessibleSocietes(ctx.user_id, ctx.societe_id)
    if (accessible.length === 0) {
      return { result: null, status: 'error', error_msg: 'Aucune société liée à ce compte' }
    }
    let target: any = null
    if (target_id) {
      target = accessible.find((s: any) => s.id === target_id)
    } else if (target_nom) {
      const q = target_nom.toLowerCase()
      target = accessible.find((s: any) => (s.nom || '').toLowerCase().includes(q))
    }
    if (!target) {
      return {
        result: null,
        status: 'error',
        error_msg: `Société introuvable parmi : ${accessible.map((s: any) => s.nom).join(', ')}`,
      }
    }
    if (target.id === ctx.societe_id) {
      return { result: { switched: false, societe: { id: target.id, nom: target.nom }, message: 'Déjà sur cette société' } }
    }
    const admin = getAdminClient()
    await admin.from('telegram_users').update({ current_societe_id: target.id }).eq('chat_id', ctx.chat_id)
    return { result: { switched: true, societe: { id: target.id, nom: target.nom, brn: target.brn } } }
  })
}
