/**
 * /api/client/factures-ia/chat
 *
 * POST — envoie un message utilisateur à l'IA Factures et reçoit la réponse.
 *
 * Body :
 *   - societe_id  (uuid)
 *   - historique  (MessageFactureIA[])
 *   - message     (string : nouveau message utilisateur)
 *
 * Renvoie :
 *   - message     (string : réponse de l'IA)
 *   - analyse     (AnalyseFacture : paramètres extraits + pret_a_generer)
 *
 * L'analyse est recalculée à chaque tour pour piloter le bouton "Générer"
 * côté UI (visible dès que pret_a_generer = true).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'
import {
  continuerConversationFacture,
  extraireParametresFacture,
  type ContexteFactureIA,
  type MessageFactureIA,
} from '@/lib/factures/ia-assistant'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function chargerContexte(
  supabase: ReturnType<typeof getAdminClient>,
  userId: string,
  societe_id: string,
  template_id?: string | null,
): Promise<ContexteFactureIA> {
  const [societeRes, profileRes, contactsRes, catalogueRes, facturesRes, settingsRes] = await Promise.all([
    supabase
      .from('societes')
      .select('id, nom, brn, vat_number, numero_tva_mra, adresse, devise_defaut, banque_iban, banque_swift, mra_fiscalisation_active, logo_url')
      .eq('id', societe_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('factures_contacts')
      .select('id, nom, entreprise, email, telephone, vat_number, brn, adresse, offshore')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('catalogue_services')
      .select('id, designation, description, prix_ht_mur, prix_ht_eur, taux_tva, unite, categorie')
      .eq('societe_id', societe_id)
      .eq('actif', true)
      .order('designation')
      .limit(100),
    supabase
      .from('factures')
      .select('id, numero_facture, tiers, contact_id, date_facture, montant_ttc, devise, type_document, lignes')
      .eq('societe_id', societe_id)
      .eq('type_facture', 'client')
      .order('date_facture', { ascending: false })
      .limit(10),
    supabase
      .from('facture_settings')
      .select('counter_facture, counter_devis, counter_avoir, counter_note_debit, prefix_facture, prefix_devis, prefix_avoir, prefix_note_debit, tva_defaut, conditions_paiement_defaut')
      .eq('societe_id', societe_id)
      .maybeSingle(),
  ])

  const settings: any = settingsRes.data || {}
  const year = new Date().getFullYear()
  const buildNumero = (prefix: string | null | undefined, counter: number | null | undefined): string | undefined => {
    if (counter == null) return undefined
    return `${prefix || 'INV'}-${year}-${String((counter || 0) + 1).padStart(4, '0')}`
  }

  // Charge le template IA actif (le cas échéant) après les autres requêtes :
  // c'est petit et facultatif, on garde le Promise.all groupé propre pour le reste.
  let template_actif: ContexteFactureIA['template_actif']
  if (template_id) {
    const { data: tpl } = await supabase
      .from('facture_templates')
      .select('nom, devise_defaut, tva_defaut, conditions_paiement, mentions_legales, format_numero, consignes_ia, actif')
      .eq('id', template_id)
      .eq('societe_id', societe_id)
      .maybeSingle()
    if (tpl && tpl.actif !== false) {
      template_actif = {
        nom: tpl.nom,
        devise_defaut: tpl.devise_defaut || undefined,
        tva_defaut: tpl.tva_defaut ?? undefined,
        conditions_paiement: tpl.conditions_paiement || undefined,
        mentions_legales: tpl.mentions_legales || undefined,
        format_numero: tpl.format_numero || undefined,
        consignes_ia: tpl.consignes_ia || undefined,
      }
    }
  }

  return {
    societe: (societeRes.data as any) || { id: societe_id, nom: '?' },
    user: (profileRes.data as any) || {},
    contacts: (contactsRes.data as any) || [],
    catalogue: (catalogueRes.data as any) || [],
    factures_recentes: (facturesRes.data as any) || [],
    prochain_numero: {
      facture: buildNumero(settings.prefix_facture, settings.counter_facture),
      devis: buildNumero(settings.prefix_devis ?? 'DEV', settings.counter_devis),
      avoir: buildNumero(settings.prefix_avoir ?? 'AV', settings.counter_avoir),
      note_debit: buildNumero(settings.prefix_note_debit ?? 'ND', settings.counter_note_debit),
    },
    tva_defaut: settings.tva_defaut ?? 15,
    conditions_paiement_defaut: settings.conditions_paiement_defaut ?? 30,
    template_actif,
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const societe_id: string = body.societe_id
    const message: string = body.message || ''
    const historique: MessageFactureIA[] = Array.isArray(body.historique) ? body.historique : []
    const template_id: string | null = body.template_id || null
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!message.trim()) return NextResponse.json({ error: 'message requis' }, { status: 400 })

    await assertSocieteAccess(supabase, user.id, societe_id)

    const contexte = await chargerContexte(supabase, user.id, societe_id, template_id)

    const reponseIA = await continuerConversationFacture({
      contexte,
      historique,
      nouveau_message: message,
    })

    const historiqueComplet: MessageFactureIA[] = [
      ...historique,
      { role: 'user', content: message },
      { role: 'assistant', content: reponseIA },
    ]

    const analyse = await extraireParametresFacture({
      contexte,
      historique: historiqueComplet,
    })

    return NextResponse.json({ message: reponseIA, analyse })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
