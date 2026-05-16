import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET  /api/telegram/internal/societes-list?chat_id=<n>
 *   → liste les sociétés accessibles au user Telegram, avec flag active
 *
 * POST /api/telegram/internal/societes-list
 *   body { chat_id, societe_id | societe_nom }
 *   → switche la société active du chat (résout par id ou par nom partiel)
 */
export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'societes.list', async (ctx) => {
    const admin = getAdminClient()
    const { data: links } = await admin
      .from('user_societes')
      .select('societe_id, societes(id, nom, brn, devise_defaut)')
      .eq('user_id', ctx.user_id)
    const societes = (links || [])
      .map((l: any) => l.societes)
      .filter(Boolean)
      .map((s: any) => ({
        id: s.id,
        nom: s.nom,
        brn: s.brn,
        devise: s.devise_defaut || 'MUR',
        active: s.id === ctx.societe_id,
      }))
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
    const admin = getAdminClient()
    const { data: links } = await admin
      .from('user_societes')
      .select('societe_id, societes(id, nom, brn)')
      .eq('user_id', ctx.user_id)
    const accessible = (links || []).map((l: any) => l.societes).filter(Boolean)
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
    await admin.from('telegram_users').update({ current_societe_id: target.id }).eq('chat_id', ctx.chat_id)
    return { result: { switched: true, societe: { id: target.id, nom: target.nom, brn: target.brn } } }
  })
}
