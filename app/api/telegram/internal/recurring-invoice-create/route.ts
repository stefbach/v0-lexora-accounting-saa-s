import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth, hasRole, type TelegramContext } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'
import {
  extraireParametresFacture,
  type ContexteFactureIA,
  type MessageFactureIA,
} from '@/lib/factures/ia-assistant'
import { prochaineDateGeneration, type Frequence } from '@/lib/recurrences/recurrences-factures'

/**
 * POST /api/telegram/internal/recurring-invoice-create
 *
 * Tool agent — crée un MODÈLE de facture récurrente (statut='modele'). Le
 * cron quotidien (lib/recurrences/recurrences-factures.ts) génère ensuite
 * les vraies factures à chaque échéance.
 *
 * Rôles autorisés : direction, comptable, comptable_dedie, client_admin
 * (admin/super_admin via hiérarchie).
 *
 * Body :
 *   - chat_id      (résolu par l'auth wrapper)
 *   - prompt       : string — description libre (ex: "Loyer ACME 50 000 MUR
 *                    tous les mois à partir du 1er juin 2026")
 *   - frequence?   : 'mensuel' | 'trimestriel' | 'annuel'  (override clarification)
 *   - date_debut?  : YYYY-MM-DD                            (override clarification)
 *   - date_fin?    : YYYY-MM-DD                            (optionnel)
 *   - jour_emission? : 1..28                                (optionnel)
 *
 * Stratégie : extraction IA → délégation à /api/client/factures-ia/generer
 * avec parametres.recurrent=true (la route web force alors statut='modele'
 * et stocke recurrent_frequence / recurrence_date_debut / etc.).
 *
 * Retour : { facture_id, numero, frequence, date_debut, prochaine_emission, ... }
 */

const ROLES_ALLOWED = ['direction', 'comptable', 'comptable_dedie', 'client_admin']

function roleAllowed(ctx: TelegramContext): boolean {
  return ROLES_ALLOWED.includes(ctx.role) || hasRole(ctx, 'admin')
}

type FrequenceDb = Frequence

function normalizeFrequence(input: unknown): FrequenceDb | null {
  if (!input) return null
  const s = String(input).toLowerCase().trim()
  // Mappings tolérants depuis l'IA (qui peut produire mensuelle/trimestrielle/annuelle)
  if (s === 'mensuel' || s === 'mensuelle' || s === 'monthly' || s === 'mois') return 'mensuel'
  if (s === 'trimestriel' || s === 'trimestrielle' || s === 'quarterly' || s === 'trimestre') return 'trimestriel'
  if (s === 'annuel' || s === 'annuelle' || s === 'yearly' || s === 'annual' || s === 'an' || s === 'année') return 'annuel'
  return null
}

function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

async function buildContexte(societe_id: string): Promise<ContexteFactureIA> {
  const admin = getAdminClient()
  const [societeRes, contactsRes, catalogueRes, facturesRes, settingsRes] = await Promise.all([
    admin
      .from('societes')
      .select('id, nom, brn, vat_number, numero_tva_mra, adresse, devise_defaut, banque_iban, banque_swift, mra_fiscalisation_active')
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
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'recurring_invoice.create', async (ctx, body) => {
    if (!roleAllowed(ctx)) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Création de facture récurrente réservée à direction / comptable / client_admin',
      }
    }

    const prompt = String(body?.prompt || '').trim()
    if (!prompt) {
      return { result: null, status: 'error', error_msg: 'prompt requis (description de la récurrence)' }
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
    if (!params?.tiers || !Array.isArray(params?.lignes) || params.lignes.length === 0) {
      return {
        result: {
          needs_clarification: true,
          missing: ['tiers', 'lignes'],
          prochaine_question:
            analyse?.prochaine_question ||
            'Précisez le client et au moins une ligne (description, quantité, prix) pour cette facture récurrente',
          params_extracted: params,
        },
      }
    }

    // 3) Fréquence : body override > extraction IA
    const frequenceFromBody = normalizeFrequence(body?.frequence)
    const frequenceFromIA = normalizeFrequence(params?.recurrence_periodicite)
    const frequence = frequenceFromBody || frequenceFromIA

    // 4) date_debut : body override > extraction IA
    const today = new Date().toISOString().slice(0, 10)
    const date_debut_body = isIsoDate(body?.date_debut) ? (body.date_debut as string) : null
    const date_debut_ia = isIsoDate(params?.date_facture) ? (params.date_facture as string) : null
    const date_debut = date_debut_body || date_debut_ia || null

    const date_fin_body = isIsoDate(body?.date_fin) ? (body.date_fin as string) : null
    const date_fin_ia = isIsoDate(params?.recurrence_date_fin) ? (params.recurrence_date_fin as string) : null
    const date_fin = date_fin_body || date_fin_ia || null

    const jour_emission_raw = Number(body?.jour_emission)
    const jour_emission =
      Number.isFinite(jour_emission_raw) && jour_emission_raw >= 1 && jour_emission_raw <= 28
        ? Math.round(jour_emission_raw)
        : null

    // 5) Clarification si fréquence ou date_debut manquante
    if (!frequence || !date_debut) {
      const missing: string[] = []
      if (!frequence) missing.push('frequence')
      if (!date_debut) missing.push('date_debut')
      return {
        result: {
          needs_clarification: true,
          missing,
          suggested_values: {
            frequence: frequence || 'mensuel',
            date_debut: date_debut || today,
            jour_emission: jour_emission || 1,
          },
          prochaine_question:
            !frequence
              ? 'À quelle fréquence faut-il générer cette facture ? (mensuel / trimestriel / annuel)'
              : 'À partir de quelle date démarre la récurrence ?',
          params_extracted: {
            tiers: params.tiers,
            nb_lignes: params.lignes.length,
            devise: params.devise || contexte.societe?.devise_defaut || 'MUR',
            frequence_detectee: frequence,
            date_debut_detectee: date_debut,
          },
        },
      }
    }

    // Garde-fou taux change minimal côté Telegram pour erreur claire
    const devise = String(params.devise || contexte.societe?.devise_defaut || 'MUR').toUpperCase()
    const taux_change = Number(params.taux_change) || (devise === 'MUR' ? 1 : 0)
    if (devise !== 'MUR' && taux_change <= 1.0001) {
      return {
        result: null,
        status: 'error',
        error_msg: `Taux de change manquant pour ${devise}. Précisez-le dans le prompt.`,
      }
    }

    // 6) Délégation à /api/client/factures-ia/generer avec champs récurrence.
    //    /factures-ia/generer forward les recurrent_* à /factures qui force
    //    alors statut='modele' (cf. ligne 203 factures/route.ts).
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
          date_facture: date_debut,
          notes_internes:
            params.notes_internes ||
            `Modèle récurrence créé via Telegram bot (chat ${ctx.chat_id}) — fréquence ${frequence}`,
          // Drapeaux récurrence (forward par /factures-ia/generer → /factures)
          recurrent: true,
          recurrent_frequence: frequence,
          recurrence_date_debut: date_debut,
          recurrence_date_fin: date_fin,
          recurrence_jour_du_mois: jour_emission,
        },
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        result: null,
        status: 'error',
        error_msg: `Erreur création modèle: ${j?.error || `HTTP ${res.status}`}`,
      }
    }

    const fac = j?.facture || {}
    // Prochaine émission théorique (même règle que le cron quotidien).
    let prochaine_emission: string | null
    try {
      prochaine_emission = prochaineDateGeneration(date_debut, frequence, jour_emission)
    } catch {
      prochaine_emission = null
    }

    return {
      result: {
        facture_id: fac.id || null,
        numero: fac.numero_facture || null,
        frequence: fac.recurrent_frequence || frequence,
        date_debut: fac.recurrence_date_debut || date_debut,
        date_fin: fac.recurrence_date_fin || date_fin,
        jour_emission: fac.recurrence_jour_du_mois ?? jour_emission,
        montant_ttc: Number(fac.montant_ttc || 0),
        devise: fac.devise || devise,
        statut: fac.statut || 'modele',
        tiers: params.tiers,
        nb_lignes: Array.isArray(params.lignes) ? params.lignes.length : 0,
        prochaine_emission,
        note:
          'Modèle récurrent créé. Le cron quotidien générera automatiquement une nouvelle facture en attente à chaque échéance.',
      },
    }
  })
}
