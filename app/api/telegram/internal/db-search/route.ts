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

const ALL_SCOPES = [
  'factures',
  'contacts',
  'employes',
  'documents',
  'transactions',
  'ecritures',
  // Extension 2026-05 (mcp-call) : on étend la recherche aux tables comptables
  // fines pour que le bot Telegram puisse répondre à "trouve l'écriture de
  // novembre sur 401", "mon bulletin de paie d'octobre", etc.
  'ecritures_v2',
  'bulletins_paie',
  'comptes_bancaires',
  'releves_bancaires',
] as const

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
        // FIX colonne : 'type_contact' n'existe pas sur factures_contacts → retiré
        .select('id, nom, entreprise, email, telephone, vat_number')
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
        // FIX colonnes : 'libelle', 'montant', 'sens' n'existent pas sur
        // transactions_bancaires (mig 010). Les vraies colonnes sont
        // 'libelle_banque', 'debit' et 'credit'.
        .select('id, date_transaction, libelle_banque, debit, credit, compte_bancaire_id')
        .eq('societe_id', ctx.societe_id)
        .ilike('libelle_banque', like)
        .order('date_transaction', { ascending: false })
        .limit(limit)
      hits.transactions = data || []
    }

    // écritures comptables (rôle comptable+) — via la VUE ecritures_comptables
    // (mig 120) qui expose les colonnes v1 (compte, debit, credit, libelle,
    // journal, numero_piece) au-dessus de la table physique v2.
    if (scopes.includes('ecritures') && hasRole(ctx, 'comptable')) {
      const { data } = await admin
        // FIX table : 'ecritures' (sans suffixe) n'existe pas → 'ecritures_comptables' (vue).
        // FIX colonnes : 'code_journal', 'montant_debit', 'montant_credit',
        // 'compte_comptable' n'existent pas → journal, debit, credit, compte.
        .from('ecritures_comptables')
        .select('id, date_ecriture, libelle, journal, debit, credit, compte')
        .ilike('libelle', like)
        .order('date_ecriture', { ascending: false })
        .limit(limit)
      hits.ecritures = data || []
    }

    // écritures comptables v2 (table principale, mcp-call)
    if (scopes.includes('ecritures_v2') && hasRole(ctx, 'comptable')) {
      const { data } = await admin
        .from('ecritures_comptables_v2')
        // FIX colonnes : 'journal_code', 'debit', 'credit', 'compte_general',
        // 'piece_ref' n'existent pas → journal, debit_mur, credit_mur,
        // numero_compte, ref_folio (mig 007).
        .select('id, date_ecriture, libelle, journal, debit_mur, credit_mur, numero_compte, ref_folio')
        .eq('societe_id', ctx.societe_id)
        .or(`libelle.ilike.${like},ref_folio.ilike.${like},numero_compte.ilike.${like}`)
        .order('date_ecriture', { ascending: false })
        .limit(limit)
      hits.ecritures_v2 = data || []
    }

    // bulletins de paie (RH+ pour voir au-delà de soi)
    if (scopes.includes('bulletins_paie')) {
      let q = admin.from('bulletins_paie')
        .select('id, employe_id, periode, salaire_brut, salaire_net, statut, created_at')
        .eq('societe_id', ctx.societe_id)
        .ilike('periode', like)
        .order('periode', { ascending: false })
        .limit(limit)
      if (!hasRole(ctx, 'rh')) {
        q = q.eq('employe_id', ctx.employe_id || '00000000-0000-0000-0000-000000000000')
      }
      const { data } = await q
      hits.bulletins_paie = data || []
    }

    // comptes bancaires (comptable+)
    if (scopes.includes('comptes_bancaires') && hasRole(ctx, 'comptable')) {
      const { data } = await admin
        .from('comptes_bancaires')
        // FIX colonne : 'nom' n'existe pas → 'nom_compte' (mig 010).
        .select('id, nom_compte, banque, iban, devise, solde_actuel')
        .eq('societe_id', ctx.societe_id)
        .or(`nom_compte.ilike.${like},banque.ilike.${like},iban.ilike.${like}`)
        .limit(limit)
      hits.comptes_bancaires = data || []
    }

    // relevés bancaires (comptable+)
    if (scopes.includes('releves_bancaires') && hasRole(ctx, 'comptable')) {
      const { data } = await admin
        .from('releves_bancaires')
        .select('id, periode, date_debut, date_fin, statut, compte_bancaire_id, created_at')
        .eq('societe_id', ctx.societe_id)
        .ilike('periode', like)
        .order('date_debut', { ascending: false })
        .limit(limit)
      hits.releves_bancaires = data || []
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
