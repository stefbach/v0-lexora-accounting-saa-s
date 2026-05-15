import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole, type TelegramContext } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  extraireParametresFacture,
  type ContexteFactureIA,
  type MessageFactureIA,
} from '@/lib/factures/ia-assistant'

/**
 * POST /api/telegram/internal/recurring-invoice-create
 *
 * Tool agent — crée un MODÈLE de facture récurrente (template) qui sera
 * automatiquement cloné par le cron quotidien aux périodes configurées.
 *
 * Rôles autorisés : direction, comptable, comptable_dedie, client_admin
 * (admin/super_admin via hiérarchie). Identique à invoice.create.
 *
 * Body :
 *   - chat_id      (résolu par l'auth wrapper)
 *   - prompt       : string — description libre incluant fréquence + dates
 *                    (ex: "Loyer ACME 50 000 MUR tous les mois à partir du 1er juin 2026")
 *   - frequence?   : 'mensuel' | 'trimestriel' | 'annuel'  (override clarification)
 *   - date_debut?  : YYYY-MM-DD                            (override clarification)
 *   - date_fin?    : YYYY-MM-DD                            (optionnel)
 *   - jour_emission? : 1..28                                (optionnel)
 *
 * Stratégie :
 *   1. Réutilise `extraireParametresFacture` pour parser tiers + lignes
 *      (même contexte société que invoice.create).
 *   2. Détermine la fréquence depuis params.recurrence_periodicite
 *      (hebdomadaire mappée sur mensuel — non supporté côté cron) ou body override.
 *   3. Si fréquence ou date_debut manquante → retourne needs_clarification
 *      pour que l'agent re-pose la question via boutons inline.
 *   4. INSERT dans public.factures avec :
 *        recurrent=true
 *        statut='modele'                   (cf. migration 241)
 *        recurrent_frequence              ('mensuel'|'trimestriel'|'annuel')
 *        recurrence_date_debut            (DATE)
 *        recurrence_date_fin?             (DATE | NULL)
 *        recurrence_jour_du_mois?         (1..28)
 *
 * Le cron quotidien (lib/recurrences/recurrences-factures.ts) prendra le relais
 * et générera les factures réelles aux échéances.
 *
 * Retour : { facture_id, numero, frequence, date_debut, ... }
 */

const ROLES_ALLOWED = ['direction', 'comptable', 'comptable_dedie', 'client_admin']

function roleAllowed(ctx: TelegramContext): boolean {
  return ROLES_ALLOWED.includes(ctx.role) || hasRole(ctx, 'admin')
}

type FrequenceDb = 'mensuel' | 'trimestriel' | 'annuel'

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

async function generateNumero(societe_id: string): Promise<string> {
  const admin = getAdminClient()
  try {
    const { data } = await admin
      .from('societes')
      .select('facture_prefixe, facture_prochain_numero')
      .eq('id', societe_id)
      .maybeSingle()
    const row = data as any
    if (row && (row.facture_prefixe || row.facture_prochain_numero)) {
      const prefixe = (row.facture_prefixe as string) || 'INV-'
      const prochain = Number(row.facture_prochain_numero) || 1
      await admin
        .from('societes')
        .update({ facture_prochain_numero: prochain + 1 })
        .eq('id', societe_id)
      return `${prefixe}REC-${String(prochain).padStart(4, '0')}`
    }
  } catch {}
  return `REC-${Date.now().toString().slice(-6)}`
}

export async function POST(req: NextRequest) {
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

    // 4) date_debut : body override > extraction IA > aujourd'hui (si frequence est claire)
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

    // 6) Calculs totaux (identique à invoice.create) pour stocker les valeurs
    const lignes = (params.lignes as any[]).filter(l => l && l.description)
    if (lignes.length === 0) {
      return { result: null, status: 'error', error_msg: 'Aucune ligne valide' }
    }
    let montant_ht = 0
    let montant_tva = 0
    const lignesNorm = lignes.map(l => {
      const q = Number(l.quantite) || 0
      const pu = Number(l.prix_unitaire) || 0
      const tva = Number(l.taux_tva ?? contexte.tva_defaut ?? 15)
      const lht = q * pu
      const ltva = lht * (tva / 100)
      montant_ht += lht
      montant_tva += ltva
      return {
        description: String(l.description || '').trim(),
        quantite: q,
        prix_unitaire: pu,
        taux_tva: tva,
        unite: l.unite || undefined,
        total: lht + ltva,
      }
    })
    const remise_pct = Number(params.remise_pct) || 0
    const remise_montant = Number(params.remise_montant) || 0
    const remise = remise_pct > 0 ? montant_ht * (remise_pct / 100) : remise_montant
    const montant_ttc = montant_ht + montant_tva - remise

    const devise = String(params.devise || contexte.societe?.devise_defaut || 'MUR').toUpperCase()
    const taux_change = Number(params.taux_change) || (devise === 'MUR' ? 1 : 0)
    if (devise !== 'MUR' && taux_change <= 1.0001) {
      return {
        result: null,
        status: 'error',
        error_msg: `Taux de change manquant pour ${devise}. Précisez-le dans le prompt.`,
      }
    }

    const numero = await generateNumero(ctx.societe_id)
    const mur = devise === 'MUR' ? montant_ttc : montant_ttc * taux_change

    // 7) Insert MODÈLE (recurrent=true, statut='modele')
    const admin = getAdminClient()
    const { data: created, error } = await admin
      .from('factures')
      .insert({
        societe_id: ctx.societe_id,
        type_facture: 'client',
        numero_facture: numero,
        tiers: String(params.tiers).trim(),
        contact_id: params.contact_id || null,
        description: params.description || null,
        date_facture: date_debut,
        date_echeance: date_debut, // template — sera recalculé à la génération
        conditions_paiement: Number(params.conditions_paiement) || contexte.conditions_paiement_defaut || 30,
        devise,
        taux_change: devise === 'MUR' ? 1 : taux_change,
        montant_ht: Math.round(montant_ht * 100) / 100,
        montant_tva: Math.round(montant_tva * 100) / 100,
        montant_ttc: Math.round(montant_ttc * 100) / 100,
        montant_mur: Math.round(mur * 100) / 100,
        remise_pct,
        remise_montant: remise_pct > 0 ? 0 : remise_montant,
        client_offshore: !!params.client_offshore,
        mode_paiement: params.mode_paiement || 'banque',
        template: 'standard',
        lignes: lignesNorm,
        notes_internes:
          params.notes_internes ||
          `Modèle récurrence créé via Telegram bot (chat ${ctx.chat_id}) — fréquence ${frequence}`,
        termes: params.termes || null,
        statut: 'modele',
        type_document: 'facture',
        recurrent: true,
        recurrent_frequence: frequence,
        recurrence_date_debut: date_debut,
        recurrence_date_fin: date_fin,
        recurrence_jour_du_mois: jour_emission,
      })
      .select(
        'id, numero_facture, recurrent_frequence, recurrence_date_debut, recurrence_date_fin, recurrence_jour_du_mois, montant_ttc, devise, statut',
      )
      .single()

    if (error || !created) {
      return {
        result: null,
        status: 'error',
        error_msg: `Erreur création modèle: ${error?.message || 'inconnue'}`,
      }
    }

    return {
      result: {
        facture_id: created.id,
        numero: created.numero_facture,
        frequence: created.recurrent_frequence,
        date_debut: created.recurrence_date_debut,
        date_fin: created.recurrence_date_fin,
        jour_emission: created.recurrence_jour_du_mois,
        montant_ttc: Number(created.montant_ttc),
        devise: created.devise,
        statut: created.statut,
        tiers: params.tiers,
        nb_lignes: lignesNorm.length,
        note:
          'Modèle récurrent créé. Le cron quotidien générera automatiquement une nouvelle facture en attente à chaque échéance.',
      },
    }
  })
}
