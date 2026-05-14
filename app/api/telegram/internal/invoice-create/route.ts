import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole, type TelegramContext } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import {
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
 * en un seul tour, puis on insère via getAdminClient() (bypass auth user)
 * dans `factures`. La logique d'écritures comptables / numérotation auto /
 * récurrence n'est PAS dupliquée ici — la facture est créée en statut
 * 'brouillon' et l'utilisateur la valide depuis l'UI web (le passage en
 * 'en_attente' déclenche les écritures via /api/client/factures).
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

async function generateNumero(societe_id: string, type_document: string): Promise<string> {
  const admin = getAdminClient()
  const colMap: Record<string, { prefCol: string; numCol: string; defaultPrefix: string }> = {
    facture: { prefCol: 'facture_prefixe', numCol: 'facture_prochain_numero', defaultPrefix: 'INV-' },
    devis: { prefCol: 'devis_prefixe', numCol: 'devis_prochain_numero', defaultPrefix: 'DEV-' },
    avoir: { prefCol: 'avoir_prefixe', numCol: 'avoir_prochain_numero', defaultPrefix: 'AV-' },
    note_debit: { prefCol: 'note_debit_prefixe', numCol: 'note_debit_prochain_numero', defaultPrefix: 'ND-' },
  }
  const cfg = colMap[type_document] || colMap.facture
  try {
    const { data } = await admin
      .from('societes')
      .select(`${cfg.prefCol}, ${cfg.numCol}`)
      .eq('id', societe_id)
      .maybeSingle()
    const row = data as Record<string, any> | null
    if (row && (row[cfg.prefCol] || row[cfg.numCol])) {
      const prefixe = (row[cfg.prefCol] as string) || cfg.defaultPrefix
      const prochain = Number(row[cfg.numCol]) || 1
      await admin.from('societes').update({ [cfg.numCol]: prochain + 1 }).eq('id', societe_id)
      return `${prefixe}${String(prochain).padStart(4, '0')}`
    }
  } catch {}
  // Fallback parse last
  const { data: last } = await admin
    .from('factures')
    .select('numero_facture')
    .eq('societe_id', societe_id)
    .eq('type_facture', 'client')
    .eq('type_document', type_document)
    .not('numero_facture', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let n = 1
  if (last?.numero_facture) {
    const m = String(last.numero_facture).match(/(\d+)$/)
    if (m) n = parseInt(m[1], 10) + 1
  }
  return `${cfg.defaultPrefix}${String(n).padStart(4, '0')}`
}

export async function POST(req: NextRequest) {
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

    // 3) Validation + calcul totaux (réutilisation logique de /factures-ia/generer)
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
        error_msg: `Taux de change manquant ou invalide pour ${devise}. Précisez-le dans votre prompt.`,
      }
    }

    const today = new Date().toISOString().slice(0, 10)
    const echeance = (() => {
      if (params.date_echeance) return String(params.date_echeance)
      const j = Number(params.conditions_paiement) || contexte.conditions_paiement_defaut || 30
      const d = new Date()
      d.setDate(d.getDate() + j)
      return d.toISOString().slice(0, 10)
    })()

    const type_document = String(params.type_document || 'facture')
    const numero = await generateNumero(ctx.societe_id, type_document)
    const mur = devise === 'MUR' ? montant_ttc : montant_ttc * taux_change

    const admin = getAdminClient()
    // On crée en 'brouillon' — la finalisation/validation (qui déclenche
    // les écritures comptables) se fait depuis l'UI web. Cela évite de
    // dupliquer createEcrituresShared() ici.
    const { data: created, error } = await admin
      .from('factures')
      .insert({
        societe_id: ctx.societe_id,
        type_facture: 'client',
        numero_facture: numero,
        tiers: String(params.tiers).trim(),
        contact_id: params.contact_id || null,
        description: params.description || null,
        date_facture: params.date_facture || today,
        date_echeance: echeance,
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
        notes_internes: params.notes_internes || `Créée via Telegram bot (chat ${ctx.chat_id})`,
        termes: params.termes || null,
        statut: 'brouillon',
        type_document,
      })
      .select('id, numero_facture, montant_ttc, devise, statut')
      .single()

    if (error || !created) {
      return { result: null, status: 'error', error_msg: `Erreur création facture: ${error?.message || 'inconnue'}` }
    }

    return {
      result: {
        facture_id: created.id,
        numero: created.numero_facture,
        montant_ttc: Number(created.montant_ttc),
        devise: created.devise,
        statut: created.statut,
        preview_url: `/client/facture-preview?facture_id=${created.id}`,
        params_used: {
          tiers: params.tiers,
          nb_lignes: lignesNorm.length,
          devise,
          type_document,
        },
        note: 'Facture créée en brouillon. Validez-la depuis l\'app Lexora pour générer les écritures comptables.',
      },
    }
  })
}
