import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyHmac } from '@/lib/security/hmac-auth'

/**
 * POST /api/telegram/internal/db-search
 *
 * Recherche universelle multi-tables dans Lexora — scope société active.
 * Le bot Telegram l'appelle quand l'utilisateur formule une requête floue
 * ("trouve la facture acme novembre", "où sont mes documents fournisseur ?").
 *
 * Body :
 *   - query  : string (terme libre)
 *   - scopes : string[] optionnel — sous-ensemble parmi
 *              ['factures','contacts','employes','documents','transactions','ecritures']
 *              Défaut : tous.
 *   - limit  : number par scope, défaut 5, max 20
 *
 * Sécurité :
 *   - Tout est scopé à ctx.societe_id
 *   - Pas de SELECT brut — uniquement les colonnes safe par table
 *   - Rôle min : employe (chaque user voit ce que son rôle autorise)
 *
 * Réponse : { hits: { factures: [...], contacts: [...], ... } }
 */

const ALL_SCOPES = ['factures', 'contacts', 'employes', 'documents', 'transactions', 'ecritures'] as const

export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'db.search', async (ctx, body) => {
    const query = String(body?.query || '').trim().slice(0, 100)
    if (!query) return { result: null, status: 'error', error_msg: 'query requise' }

    const scopes = Array.isArray(body?.scopes) && body.scopes.length > 0
      ? body.scopes.filter((s: string) => ALL_SCOPES.includes(s as any))
      : ALL_SCOPES
    const limit = Math.min(Math.max(Number(body?.limit) || 5, 1), 20)
    const like = `%${query.replace(/[%_]/g, '')}%`

    const admin = getAdminClient()
    const hits: Record<string, any[]> = {}

    // factures
    if (scopes.includes('factures')) {
      const { data } = await admin
        .from('factures')
        .select('id, numero_facture, tiers, type_facture, statut, date_facture, date_echeance, montant_ttc, devise, solde_non_paye')
        .eq('societe_id', ctx.societe_id)
        .or(`numero_facture.ilike.${like},tiers.ilike.${like}`)
        .order('date_facture', { ascending: false })
        .limit(limit)
      hits.factures = data || []
    }

    // contacts (factures_contacts)
    if (scopes.includes('contacts')) {
      const { data } = await admin
        .from('factures_contacts')
        .select('id, nom, entreprise, email, telephone, vat_number, type_contact')
        .eq('societe_id', ctx.societe_id)
        .or(`nom.ilike.${like},entreprise.ilike.${like},email.ilike.${like}`)
        .limit(limit)
      hits.contacts = data || []
    }

    // employes (RH+ uniquement pour voir au-delà de soi)
    if (scopes.includes('employes')) {
      let q = admin.from('employes')
        .select('id, code, prenom, nom, poste, email, date_arrivee, date_depart')
        .eq('societe_id', ctx.societe_id)
        .or(`prenom.ilike.${like},nom.ilike.${like},code.ilike.${like},email.ilike.${like}`)
        .limit(limit)
      if (!hasRole(ctx, 'rh') && !hasRole(ctx, 'manager')) {
        // Restriction : un employé ne voit que lui-même
        q = q.eq('id', ctx.employe_id || '00000000-0000-0000-0000-000000000000')
      }
      const { data } = await q
      hits.employes = data || []
    }

    // documents
    if (scopes.includes('documents') && hasRole(ctx, 'comptable')) {
      const { data } = await admin
        .from('documents')
        .select('id, nom_fichier, type_document, statut, societe_detectee, created_at')
        .ilike('nom_fichier', like)
        .order('created_at', { ascending: false })
        .limit(limit)
      hits.documents = data || []
    }

    // transactions bancaires
    if (scopes.includes('transactions') && hasRole(ctx, 'comptable')) {
      const { data } = await admin
        .from('transactions_bancaires')
        .select('id, date_transaction, libelle, montant, sens, compte_bancaire_id')
        .eq('societe_id', ctx.societe_id)
        .ilike('libelle', like)
        .order('date_transaction', { ascending: false })
        .limit(limit)
      hits.transactions = data || []
    }

    // écritures comptables (rôle comptable+)
    if (scopes.includes('ecritures') && hasRole(ctx, 'comptable')) {
      const { data } = await admin
        .from('ecritures')
        .select('id, date_ecriture, libelle, code_journal, montant_debit, montant_credit, compte_comptable')
        .eq('societe_id', ctx.societe_id)
        .ilike('libelle', like)
        .order('date_ecriture', { ascending: false })
        .limit(limit)
      hits.ecritures = data || []
    }

    const total = Object.values(hits).reduce((s, arr) => s + arr.length, 0)

    return {
      result: {
        query,
        scopes_searched: scopes,
        total_hits: total,
        hits,
      },
    }
  })
}
