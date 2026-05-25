import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * POST /api/telegram/internal/contacts-search
 *
 * Tool agent — recherche unifiée multi-sources de contacts pour l'envoi d'email.
 *
 * Rôle minimum : comptable.
 *
 * Body :
 *   - chat_id  (résolu par l'auth wrapper)
 *   - query    : string — texte libre (entreprise, nom, prénom, email)
 *   - type?    : 'contact' | 'profile' | 'employe' | 'all'  (default 'all')
 *
 * Recherche dans :
 *   - public.factures_contacts (LIKE entreprise + nom + email)
 *     scopée à la société active
 *   - public.profiles          (full_name + email)
 *     globale (Lexora multi-tenant : profiles non liés à une seule société)
 *   - public.employes          (prenom + nom + email)
 *     scopée à la société active
 *
 * Retour : top 10 matches normalisés :
 *   { id, type, display_name, email, telephone, societe_match }
 *
 * Workflow type côté agent : "envoie un mail au comptable d'ACME" →
 *   contacts.search { query: 'ACME' } → l'agent affiche les hits, demande
 *   confirmation via boutons inline → email.send avec contact_id retenu.
 */

type ContactType = 'contact' | 'profile' | 'employe'
type SearchType = ContactType | 'all'

interface Hit {
  id: string
  type: ContactType
  display_name: string
  email: string | null
  telephone: string | null
  societe_match: boolean
  meta?: Record<string, unknown>
}

function escapeLike(s: string): string {
  // PostgREST ilike : échappe %, _ ainsi que \
  return s.replace(/[\\%_]/g, m => '\\' + m)
}

export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'contacts.search', async (ctx, body) => {
    if (!hasRole(ctx, 'comptable')) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Recherche de contacts réservée aux comptables et plus',
      }
    }

    const query = String(body?.query || '').trim()
    if (query.length < 2) {
      return {
        result: null,
        status: 'error',
        error_msg: 'query requis (≥ 2 caractères)',
      }
    }
    const typeRaw = String(body?.type || 'all').toLowerCase() as SearchType
    const allowedTypes: SearchType[] = ['contact', 'profile', 'employe', 'all']
    const type: SearchType = allowedTypes.includes(typeRaw) ? typeRaw : 'all'

    const admin = getAdminClient()
    const like = `%${escapeLike(query)}%`
    const hits: Hit[] = []

    // 1) factures_contacts — scopée à la société
    if (type === 'all' || type === 'contact') {
      const { data: contacts } = await admin
        .from('factures_contacts')
        .select('id, nom, entreprise, email, telephone, mobile')
        .eq('societe_id', ctx.societe_id)
        .eq('actif', true)
        .or(`entreprise.ilike.${like},nom.ilike.${like},email.ilike.${like}`)
        .limit(10)

      for (const c of (contacts as any[]) || []) {
        const display = c.entreprise && c.nom
          ? `${c.entreprise} — ${c.nom}`
          : (c.entreprise || c.nom || '(sans nom)')
        hits.push({
          id: c.id,
          type: 'contact',
          display_name: display,
          email: c.email || null,
          telephone: c.telephone || c.mobile || null,
          societe_match: true,
        })
      }
    }

    // 2) profiles Lexora — global (utilisateurs internes de la plateforme)
    if (type === 'all' || type === 'profile') {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .or(`full_name.ilike.${like},email.ilike.${like}`)
        .limit(10)

      // Détermine quels profiles appartiennent à la société active (societe_match=true)
      const profileIds = (profiles as any[] | null)?.map(p => p.id) || []
      let inSociete = new Set<string>()
      if (profileIds.length > 0) {
        const { data: us } = await admin
          .from('user_societes')
          .select('user_id')
          .eq('societe_id', ctx.societe_id)
          .in('user_id', profileIds)
        inSociete = new Set((us as any[] | null)?.map(r => r.user_id) || [])
      }

      for (const p of (profiles as any[]) || []) {
        hits.push({
          id: p.id,
          type: 'profile',
          display_name: p.full_name || p.email || '(profil sans nom)',
          email: p.email || null,
          telephone: null,
          societe_match: inSociete.has(p.id),
        })
      }
    }

    // 3) employes — scopée à la société
    if (type === 'all' || type === 'employe') {
      const { data: employes } = await admin
        .from('employes')
        .select('id, prenom, nom, email, telephone, poste, date_depart')
        .eq('societe_id', ctx.societe_id)
        .is('date_depart', null)
        .or(`prenom.ilike.${like},nom.ilike.${like},email.ilike.${like}`)
        .limit(10)

      for (const e of (employes as any[]) || []) {
        const display = [e.prenom, e.nom].filter(Boolean).join(' ').trim() || '(sans nom)'
        hits.push({
          id: e.id,
          type: 'employe',
          display_name: e.poste ? `${display} (${e.poste})` : display,
          email: e.email || null,
          telephone: e.telephone || null,
          societe_match: true,
        })
      }
    }

    // Ranking : société match d'abord, puis présence d'email, puis ordre d'insertion
    hits.sort((a, b) => {
      if (a.societe_match !== b.societe_match) return a.societe_match ? -1 : 1
      if (!!a.email !== !!b.email) return a.email ? -1 : 1
      return 0
    })

    const top = hits.slice(0, 10)

    return {
      result: {
        query,
        type,
        matches: top,
        total: top.length,
        note:
          top.length === 0
            ? 'Aucun contact trouvé. Affine la requête ou crée le contact dans Lexora.'
            : 'Avant l\'envoi email, confirme avec l\'utilisateur le destinataire choisi (boutons inline).',
      },
    }
  })
}
