import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  genererVirementBanque,
  grouperParBanque,
  BANQUES_MAURITIUS,
  type LigneBulletin
} from '@/lib/rh/banques-mauritius'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rh/exports/virement
 * Génère les fichiers de virement salaires pour toutes les banques bénéficiaires
 * groupées depuis le compte émetteur de l'employeur
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const {
      societe_id,
      periode,               // YYYY-MM
      compte_emetteur_id,    // UUID du compte bancaire employeur (optionnel)
      banque_emettrice,      // code banque émettrice (MCB, SBM...) si pas de compte_emetteur_id
      format = 'json',       // 'json' = retourner tous les fichiers | 'single' = un seul banque
      banque_filter,         // si format=single, quelle banque générer
    } = await request.json()

    if (!societe_id || !periode) {
      return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
    }

    // --- 1. Récupérer le compte émetteur employeur ---
    let compteEmetteur: any = null
    if (compte_emetteur_id) {
      const { data } = await supabase
        .from('comptes_bancaires')
        .select('*')
        .eq('id', compte_emetteur_id)
        .single()
      compteEmetteur = data
    } else {
      // Prendre le compte paie principal de la société
      const { data } = await supabase
        .from('comptes_bancaires')
        .select('*')
        .eq('societe_id', societe_id)
        .eq('usage_paie', true)
        .eq('devise', 'MUR')
        .eq('actif', true)
        .order('compte_principal', { ascending: false })
        .limit(1)
        .maybeSingle()
      compteEmetteur = data

      // Fallback : compte principal MUR
      if (!compteEmetteur) {
        const { data: fallback } = await supabase
          .from('comptes_bancaires')
          .select('*')
          .eq('societe_id', societe_id)
          .eq('devise', 'MUR')
          .eq('actif', true)
          .eq('compte_principal', true)
          .maybeSingle()
        compteEmetteur = fallback
      }
    }

    // --- 2. Récupérer les bulletins validés de la période ---
    const periodeDate = `${periode}-01`
    const { data: bulletins, error: bullErr } = await supabase
      .from('bulletins_paie')
      .select(`
        id, salaire_net, statut, devise_salaire,
        employe:employes(
          id, code, nom, prenom, poste,
          bank_account, bank_name, bank_code, bank_iban,
          bank_swift, bank_branch, bank_account_name,
          devise
        )
      `)
      .eq('societe_id', societe_id)
      .ilike('periode', `${periode}%`)
      .eq('statut', 'valide')

    if (bullErr) throw bullErr

    if (!bulletins?.length) {
      return NextResponse.json({
        error: 'Aucun bulletin validé pour cette période. Calculez et validez les bulletins d\'abord.',
        code: 'NO_VALIDATED_BULLETINS'
      }, { status: 404 })
    }

    const date = new Date().toISOString().split('T')[0]

    // --- 3. Construire les lignes de virement ---
    const lignes: LigneBulletin[] = bulletins.map((b: any) => ({
      employe_code: b.employe?.code || '',
      nom: b.employe?.nom || '',
      prenom: b.employe?.prenom || '',
      bank_account: b.employe?.bank_account || '',
      bank_iban: b.employe?.bank_iban || '',
      bank_swift: b.employe?.bank_swift || '',
      bank_branch: b.employe?.bank_branch || '',
      bank_account_name: b.employe?.bank_account_name || `${b.employe?.prenom} ${b.employe?.nom}`,
      bank_name: b.employe?.bank_name || b.employe?.bank_code || '',
      bank_code: b.employe?.bank_code || '',
      salaire_net: Number(b.salaire_net),
      devise_salaire: b.devise_salaire || b.employe?.devise || 'MUR',
      periode,
    }))

    // Séparer MUR et EUR
    const lignesMUR = lignes.filter(l => l.devise_salaire !== 'EUR')
    const lignesEUR = lignes.filter(l => l.devise_salaire === 'EUR')

    // --- 4. Grouper par banque bénéficiaire ---
    const groupesMUR = grouperParBanque(lignesMUR)
    const groupesEUR = lignesEUR.length > 0 ? grouperParBanque(lignesEUR) : new Map()

    // --- 5. Générer les fichiers ---
    const fichiersGeneres: Array<{
      banque: string
      nom_banque: string
      devise: string
      nb_employes: number
      montant_total: number
      filename: string
      content: string
      employes: string[]  // liste des noms pour affichage
    }> = []

    // Infos compte émetteur pour l'en-tête
    const infoEmetteur = {
      banque: compteEmetteur?.bank_code || banque_emettrice || 'NON_DEFINI',
      numero_compte: compteEmetteur?.numero_compte || '',
      iban: compteEmetteur?.iban || '',
      swift: compteEmetteur?.swift || '',
      nom_compte: compteEmetteur?.nom_compte || '',
    }

    // Générer fichiers MUR
    for (const [banqueCode, lgnes] of groupesMUR.entries()) {
      const nomBanque = BANQUES_MAURITIUS.find(b => b.code === banqueCode)?.nom || banqueCode
      const { content, extension } = genererVirementBanque(lgnes, banqueCode, date, infoEmetteur)
      const total = lgnes.reduce((s, l) => s + l.salaire_net, 0)
      const filename = `virement_salaires_${periode}_${banqueCode}_MUR.${extension}`

      fichiersGeneres.push({
        banque: banqueCode,
        nom_banque: nomBanque,
        devise: 'MUR',
        nb_employes: lgnes.length,
        montant_total: Math.round(total * 100) / 100,
        filename,
        content,
        employes: lgnes.map(l => `${l.prenom} ${l.nom} (${l.bank_account || 'N/A'})`),
      })
    }

    // Générer fichiers EUR
    for (const [banqueCode, lgnes] of groupesEUR.entries()) {
      const nomBanque = BANQUES_MAURITIUS.find(b => b.code === banqueCode)?.nom || banqueCode
      const { content, extension } = genererVirementBanque(lgnes, banqueCode, date, infoEmetteur, 'EUR')
      const total = lgnes.reduce((s, l) => s + l.salaire_net, 0)
      const filename = `virement_salaires_${periode}_${banqueCode}_EUR.${extension}`

      fichiersGeneres.push({
        banque: banqueCode,
        nom_banque: nomBanque,
        devise: 'EUR',
        nb_employes: lgnes.length,
        montant_total: Math.round(total * 100) / 100,
        filename,
        content,
        employes: lgnes.map(l => `${l.prenom} ${l.nom} (${l.bank_account || 'N/A'})`),
      })
    }

    // Employés sans compte renseigné
    const sansBanque = lignes.filter(l => !l.bank_account || !l.bank_code)
    if (sansBanque.length > 0) {
      fichiersGeneres.push({
        banque: 'SANS_BANQUE',
        nom_banque: 'À compléter — Coordonnées bancaires manquantes',
        devise: 'MUR',
        nb_employes: sansBanque.length,
        montant_total: sansBanque.reduce((s, l) => s + l.salaire_net, 0),
        filename: `virement_salaires_${periode}_SANS_BANQUE_A_COMPLETER.csv`,
        content: `Employe_Code,Nom,Prenom,Montant_MUR,Probleme\n` +
          sansBanque.map(l => `${l.employe_code},"${l.nom}","${l.prenom}",${l.salaire_net},"Banque ou numéro de compte non renseigné"`).join('\n'),
        employes: sansBanque.map(l => `${l.prenom} ${l.nom}`),
      })
    }

    // --- 6. Récap global ---
    const recap = {
      periode,
      compte_emetteur: infoEmetteur,
      nb_bulletins_total: bulletins.length,
      montant_total_mur: lignesMUR.reduce((s, l) => s + l.salaire_net, 0),
      montant_total_eur: lignesEUR.reduce((s, l) => s + l.salaire_net, 0),
      nb_banques: fichiersGeneres.filter(f => f.banque !== 'SANS_BANQUE').length,
      nb_employes_sans_banque: sansBanque.length,
      fichiers: fichiersGeneres.map(f => ({
        banque: f.banque,
        nom_banque: f.nom_banque,
        devise: f.devise,
        nb_employes: f.nb_employes,
        montant_total: f.montant_total,
        filename: f.filename,
        employes: f.employes,
      })),
    }

    // --- 7. Si format=single, retourner un seul fichier ---
    if (format === 'single' && banque_filter) {
      const fichier = fichiersGeneres.find(f => f.banque === banque_filter)
      if (!fichier) {
        return NextResponse.json({ error: `Aucun employé avec la banque ${banque_filter}` }, { status: 404 })
      }
      return NextResponse.json({
        content: fichier.content,
        filename: fichier.filename,
        nb_beneficiaires: fichier.nb_employes,
        montant_total: fichier.montant_total,
        banque: fichier.banque,
        compte_emetteur: infoEmetteur,
      })
    }

    // --- 8. Enregistrer dans l'historique ---
    try {
      await supabase.from('virements_salaires').insert({
        societe_id,
        periode,
        compte_emetteur_id: compteEmetteur?.id || null,
        banque_emettrice: infoEmetteur.banque,
        numero_compte_emetteur: infoEmetteur.numero_compte,
        iban_emetteur: infoEmetteur.iban,
        swift_emetteur: infoEmetteur.swift,
        nb_beneficiaires: bulletins.length,
        montant_total_mur: recap.montant_total_mur,
        montant_total_eur: recap.montant_total_eur,
        fichier_genere: `${fichiersGeneres.length} fichiers générés`,
        statut: 'genere',
        created_by: user.id,
      })
    } catch (_) { /* non bloquant */ }

    // --- 9. Retourner tous les fichiers ---
    return NextResponse.json({
      recap,
      fichiers: fichiersGeneres,
    })

  } catch (e: unknown) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Erreur génération virement'
    }, { status: 500 })
  }
}

/**
 * GET /api/rh/exports/virement
 * Historique des virements générés
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode')

    let query = supabase
      .from('virements_salaires')
      .select('*, compte_emetteur:comptes_bancaires(banque, numero_compte, nom_compte)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (societe_id) query = query.eq('societe_id', societe_id)
    if (periode) query = query.eq('periode', periode)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ virements: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
