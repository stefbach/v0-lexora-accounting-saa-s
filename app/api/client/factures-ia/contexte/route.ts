/**
 * /api/client/factures-ia/contexte
 *
 * GET — retourne le contexte complet nécessaire à l'assistant IA Factures :
 *   - société émettrice (BRN, VAT, banque, fiscalisation MRA)
 *   - profil utilisateur connecté
 *   - 100 contacts clients (factures_contacts)
 *   - 100 articles catalogue
 *   - 10 dernières factures (toutes catégories, avec leurs lignes)
 *   - prochains numéros disponibles selon facture_settings
 *
 * Tenant isolation via assertSocieteAccess.
 */

import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    await assertSocieteAccess(supabase, user.id, societe_id)

    const [societeRes, profileRes, contactsRes, catalogueRes, facturesRes, settingsRes] = await Promise.all([
      supabase
        .from('societes')
        .select('id, nom, brn, vat_number, numero_tva_mra, adresse, devise_defaut, banque_iban, banque_swift, mra_fiscalisation_active')
        .eq('id', societe_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('factures_contacts')
        .select('id, nom, entreprise, email, telephone, vat_number, brn, adresse, code_postal, ville, pays, offshore')
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

    const settings = settingsRes.data || {}
    const year = new Date().getFullYear()
    const buildNumero = (prefix: string | null | undefined, counter: number | null | undefined): string | undefined => {
      if (!counter && counter !== 0) return undefined
      const next = (counter || 0) + 1
      return `${prefix || 'INV'}-${year}-${String(next).padStart(4, '0')}`
    }

    return NextResponse.json({
      societe: societeRes.data || { id: societe_id, nom: '?' },
      user: profileRes.data || { full_name: '', email: user.email },
      contacts: contactsRes.data || [],
      catalogue: catalogueRes.data || [],
      factures_recentes: facturesRes.data || [],
      prochain_numero: {
        facture: buildNumero((settings as any).prefix_facture, (settings as any).counter_facture),
        devis: buildNumero((settings as any).prefix_devis ?? 'DEV', (settings as any).counter_devis),
        avoir: buildNumero((settings as any).prefix_avoir ?? 'AV', (settings as any).counter_avoir),
        note_debit: buildNumero((settings as any).prefix_note_debit ?? 'ND', (settings as any).counter_note_debit),
      },
      tva_defaut: (settings as any).tva_defaut ?? 15,
      conditions_paiement_defaut: (settings as any).conditions_paiement_defaut ?? 30,
    })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
