import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole, type TelegramContext } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'
import {
import { verifyHmac } from '@/lib/security/hmac-auth'
  extraireParametresFacture,
  type ContexteFactureIA,
  type MessageFactureIA,
} from '@/lib/factures/ia-assistant'

/**
 * POST /api/telegram/internal/invoice-create
 *
 * Rôles autorisés : direction, comptable, comptable_dedie, client_admin
 * (admin/super_admin via hiérarchie).
 *
 * Body :
 *   - chat_id  (résolu par l'auth wrapper)
 *   - prompt   : string — description libre de la facture (ex: "Facture
 *                Aloha Trading 150 000 Rs pour consulting septembre, 15% TVA")
 *
 * Stratégie : on charge le contexte société (contacts + catalogue + factures
 * récentes), on demande à l'IA Factures Lexora d'extraire les paramètres
 * en un seul tour, puis on délègue à /api/client/factures-ia/generer
 * via fetch interne (X-Internal-Token). Le serveur web s'occupe de la
 * numérotation, calcul totaux, écritures comptables et conversion MUR.
 *
 * NB : la route web crée la facture en 'en_attente' (déclenche les
 * écritures comptables). Le bot peut basculer en 'brouillon' depuis l'UI
 * si besoin. Ce comportement est plus conforme au workflow web que
 * l'ancienne version qui créait en 'brouillon'.
 *
 * Retour : { facture_id, numero, montant_ttc, devise, statut,
 *            preview_url, params_used, missing? }
 */

const ROLES_INVOICE = ['direction', 'comptable', 'comptable_dedie', 'client_admin']

function roleAllowed(ctx: TelegramContext): boolean {
  return ROLES_INVOICE.includes(ctx.role) || hasRole(ctx, 'admin')
}

async function buildContexte(societe_id: string): Promise<ContexteFactureIA> {
  const admin = getAdminClient()
  const [societeRes, contactsRes, catalogueRes, facturesRes, settingsRes] = await Promise.all([
    admin
      .from('societes')
      .select('id, nom, brn, numero_tva_mra, adresse, devise_principale, banque_swift, mra_fiscalisation_active')
      .eq('id', societe_id)
      .maybeSingle(),
    admin
      .from('factures_contacts')
      .select('id, nom, entreprise, email, telephone, vat_number, brn, adresse, offshore')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('updated_at', { ascending: false })
      .limit(100),
    admin
      .from('catalogue_services')
      .select('id, designation, description, prix_ht_mur, prix_ht_eur, taux_tva, unite, categorie')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('designation')
      .limit(100),
    admin
      .from('factures')
      .select('id, numero_facture, tiers, montant_ttc, devise, date_facture, type_document')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'client')
      .order('date_facture', { ascending: false })
      .limit(20),
    admin
      .from('factures_settings')
      .select('tva_defaut, conditions_paiement_defaut')
      .eq('societe_id', societe_id)
      .maybeSingle(),
  ])

  return {
    societe: (societeRes.data as any) || { id: societe_id, nom: '' },
    profile: { id: '', full_name: 'Telegram bot', email: null },
    contacts: (contactsRes.data as any) || [],
    catalogue: (catalogueRes.data as any) || [],
    factures_recentes: (facturesRes.data as any) || [],
    tva_defaut: (settingsRes.data as any)?.tva_defaut ?? 15,
    conditions_paiement_defaut: (settingsRes.data as any)?.conditions_paiement_defaut ?? 30,
  } as unknown as ContexteFactureIA
}

export async function POST(req: NextRequest) {
  const _hmac = await verifyHmac(req)
  if (!_hmac.ok) return new Response(JSON.stringify({ error: _hmac.reason }), { status: 401, headers: { 'content-type': 'application/json' } })

  return withTelegramAuth(req, 'invoice.create', async (ctx, body) => {
    if (!roleAllowed(ctx)) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Création de facture réservée à direction / comptable / client_admin',
      }
    }
    const prompt = String(body?.prompt || '').trim()
    if (!prompt) {
      return { result: null, status: 'error', error_msg: 'prompt requis (description libre de la facture)' }
    }

    // 1) Contexte société
    const contexte = await buildContexte(ctx.societe_id)

    // 2) Extraction IA en un seul tour
    const historique: MessageFactureIA[] = [{ role: 'user', content: prompt } as MessageFactureIA]
    let analyse
    try {
      analyse = await extraireParametresFacture({ contexte, historique })
    } catch (e: any) {
      return { result: null, status: 'error', error_msg: `Erreur IA extraction: ${e?.message || String(e)}` }
    }

    const params: any = analyse?.parametres_extraits || {}
    if (!analyse?.pret_a_generer || !params?.tiers || !Array.isArray(params?.lignes) || params.lignes.length === 0) {
      return {
        result: {
          missing: analyse?.informations_manquantes || ['Informations insuffisantes'],
          prochaine_question: analyse?.prochaine_question || 'Précisez le client et au moins une ligne (description, quantité, prix)',
          params_extracted: params,
        },
        status: 'success',
      }
    }

    // Garde-fou taux change minimal côté Telegram pour message d'erreur clair —
    // la route web fait le même check mais on évite un round-trip si évident.
    const devise = String(params.devise || contexte.societe?.devise_defaut || 'MUR').toUpperCase()
    const taux_change = Number(params.taux_change) || (devise === 'MUR' ? 1 : 0)
    if (devise !== 'MUR' && taux_change <= 1.0001) {
      return {
        result: null,
        status: 'error',
        error_msg: `Taux de change manquant ou invalide pour ${devise}. Précisez-le dans votre prompt.`,
      }
    }

    // 3) Délégation à la route web canonique. Elle gère :
    //    - numérotation auto par type (societes.<type>_prefixe + compteur)
    //    - calcul HT/TVA/TTC + remise + conversion MUR
    //    - écritures comptables (statut='en_attente' déclenche createEcrituresShared)
    const baseUrl = getLexoraBaseUrl()
    const res = await fetch(`${baseUrl}/api/client/factures-ia/generer`, {
      method: 'POST',
      headers: callLexoraHeaders(ctx.user_id),
      body: JSON.stringify({
        societe_id: ctx.societe_id,
        parametres: {
          ...params,
          devise,
          taux_change,
          notes_internes:
            params.notes_internes || `Créée via Telegram bot (chat ${ctx.chat_id})`,
        },
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        result: null,
        status: 'error',
        error_msg: `Erreur création facture: ${j?.error || `HTTP ${res.status}`}`,
      }
    }

    const fac = j?.facture || {}
    return {
      result: {
        facture_id: fac.id || null,
        numero: fac.numero_facture || null,
        montant_ttc: Number(fac.montant_ttc || 0),
        devise: fac.devise || devise,
        statut: fac.statut || 'en_attente',
        preview_url: fac.id ? `/client/facture-preview?facture_id=${fac.id}` : null,
        params_used: {
          tiers: params.tiers,
          nb_lignes: Array.isArray(params.lignes) ? params.lignes.length : 0,
          devise,
          type_document: params.type_document || 'facture',
        },
        note: 'Facture créée. Visualisez-la dans Lexora pour finaliser/imprimer.',
      },
    }
  })
}
