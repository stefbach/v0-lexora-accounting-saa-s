import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/juridique/societe/data?societe_id=...
 * Renvoie les données « vie juridique » d'une société : identité, associés,
 * administrateurs et un résumé financier (indicatif) pour préremplir les actes
 * (PV d'AG, résolutions, registres). Lecture seule.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const societeId = url.searchParams.get('societe_id')
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    try {
      await assertSocieteAccess(supabase, user.id, societeId)
    } catch (e) {
      if (e instanceof SocieteAccessError) return apiError('access_denied', 403)
      throw e
    }

    const [societeRes, actionnairesRes, adminsRes, dsRes, boRes, balanceRes] = await Promise.all([
      supabase.from('societes').select('id, nom, brn, registered_office, adresse, ville, capital_social, nb_actions_total, devise_principale, date_incorporation, date_creation_legale, date_debut_exercice, date_fin_exercice, mois_cloture, nature_activite, type_activite, fsc_license_number, fsc_license_expiry').eq('id', societeId).single(),
      supabase.from('actionnaires').select('nom, prenom, type_personne, nationalite, nb_actions, type_actions, valeur_nominale, pourcentage, date_entree, actif').eq('societe_id', societeId).eq('actif', true),
      supabase.from('administrateurs').select('nom, prenom, type, nationalite, nic, date_nomination, actif').eq('societe_id', societeId).eq('actif', true),
      supabase.from('directors_shareholders').select('nom_complet, role, nic, date_nomination, parts_sociales, pourcentage_capital, active').eq('societe_id', societeId).eq('active', true),
      supabase.from('beneficial_owners').select('prenom, nom, nationalite, pays_residence, pct_detention, nature_controle, is_pep, effective_from, effective_to').eq('societe_id', societeId).is('effective_to', null),
      supabase.from('v_balance_compte_societe').select('classe, solde').eq('societe_id', societeId),
    ])

    if (societeRes.error || !societeRes.data) return apiError('company_not_found', 404)

    // Associés : table actionnaires en priorité, repli sur directors_shareholders.
    let associes = (actionnairesRes.data || []).map((a) => ({
      nom: [a.prenom, a.nom].filter(Boolean).join(' ').trim(),
      type_personne: a.type_personne,
      nationalite: a.nationalite,
      nb_actions: a.nb_actions,
      pourcentage: a.pourcentage,
      valeur_nominale: a.valeur_nominale,
    }))
    if (associes.length === 0 && (dsRes.data || []).length > 0) {
      associes = (dsRes.data || []).filter((d) => /actionn|associ|sharehold/i.test(d.role || '') || d.parts_sociales).map((d) => ({
        nom: d.nom_complet, type_personne: 'physique', nationalite: null,
        nb_actions: d.parts_sociales, pourcentage: d.pourcentage_capital, valeur_nominale: null,
      }))
    }

    let administrateurs = (adminsRes.data || []).map((a) => ({
      nom: [a.prenom, a.nom].filter(Boolean).join(' ').trim(),
      type: a.type, nationalite: a.nationalite, nic: a.nic, date_nomination: a.date_nomination,
    }))
    if (administrateurs.length === 0 && (dsRes.data || []).length > 0) {
      administrateurs = (dsRes.data || []).filter((d) => /director|administ|g[ée]rant/i.test(d.role || '')).map((d) => ({
        nom: d.nom_complet, type: d.role, nationalite: null, nic: d.nic, date_nomination: d.date_nomination,
      }))
    }

    // Résumé financier indicatif depuis la balance (toutes périodes confondues).
    const parClasse: Record<number, number> = {}
    for (const r of balanceRes.data || []) parClasse[r.classe] = (parClasse[r.classe] || 0) + Number(r.solde || 0)
    const charges = parClasse[6] || 0           // soldes débiteurs (classe 6)
    const produits = -(parClasse[7] || 0)        // soldes créditeurs (classe 7)
    const resultat = produits - charges
    const financials = balanceRes.data && balanceRes.data.length > 0
      ? { produits, charges, resultat, disponible: true }
      : { produits: 0, charges: 0, resultat: 0, disponible: false }

    const beneficiaires = (boRes.data || []).map((b) => ({
      nom: [b.prenom, b.nom].filter(Boolean).join(' ').trim(),
      nationalite: b.nationalite, pays_residence: b.pays_residence,
      pct_detention: b.pct_detention, nature_controle: b.nature_controle, is_pep: b.is_pep,
      effective_from: b.effective_from,
    }))

    return NextResponse.json({ societe: societeRes.data, associes, administrateurs, beneficiaires, financials })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
