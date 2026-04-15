import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import {
  genererVirementBanque,
  genererVirementMCB_BPV1,
  grouperParBanque,
  BANQUES_MAURITIUS,
  type LigneBulletin
} from '@/lib/rh/banques-mauritius'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * POST /api/rh/exports/virement
 * Génère les fichiers de virement salaires pour toutes les banques bénéficiaires
 * groupées depuis le compte émetteur de l'employeur
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    const {
      societe_id,
      periode,               // YYYY-MM
      compte_emetteur_id,    // UUID du compte bancaire employeur (optionnel)
      banque_emettrice,      // code banque émettrice (MCB, SBM...) si pas de compte_emetteur_id
      format = 'json',       // 'json' = retourner tous les fichiers | 'single' = un seul banque
      exclude_employe_ids,   // Array of employee IDs to exclude (espèces, individuel)
      banque_filter,         // si format=single, quelle banque générer
    } = await request.json()

    if (!societe_id || !periode) {
      return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })
    }

    // LOCK CHECK: only allow export if period is locked
    const periodeStr = periode.length === 7 ? periode : periode.slice(0, 7)
    const { data: unlockedBuls } = await supabase.from('bulletins_paie')
      .select('id').eq('societe_id', societe_id)
      .gte('periode', `${periodeStr}-01`).lte('periode', `${periodeStr}-31`)
      .or('verrouille.is.null,verrouille.eq.false')
      .limit(1)
    if (unlockedBuls && unlockedBuls.length > 0) {
      return NextResponse.json({ error: 'Periode non verrouillee. Verrouillez la paie avant de generer les virements.' }, { status: 403 })
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

    // --- 2. Récupérer les bulletins de la période ---
    const periodeDate = `${periode}-01`
    let allBulletins: any[] = []

    try {
      // Try validated first
      const { data: validated } = await supabase
        .from('bulletins_paie')
        .select('*')
        .eq('societe_id', societe_id)
        .gte('periode', `${periode}-01`)
        .lte('periode', `${periode}-31`)
        .in('statut', ['valide', 'paye'])

      if (validated && validated.length > 0) {
        allBulletins = validated
      } else {
        // Fallback: any status
        const { data: anyStatus } = await supabase
          .from('bulletins_paie')
          .select('*')
          .eq('societe_id', societe_id)
          .gte('periode', `${periode}-01`)
          .lte('periode', `${periode}-31`)
        allBulletins = anyStatus || []
      }
    } catch (dbErr: any) {
      console.error('[virement] DB bulletins error:', dbErr.message, dbErr.stack?.split('\n').slice(0, 3).join(' | '))
      return NextResponse.json({ error: 'Erreur DB lors de la récupération des bulletins.' }, { status: 500 })
    }

    // Filter out excluded employees (espèces, individuel)
    if (exclude_employe_ids && Array.isArray(exclude_employe_ids) && exclude_employe_ids.length > 0) {
      const excludeSet = new Set(exclude_employe_ids)
      allBulletins = allBulletins.filter((b: any) => !excludeSet.has(b.employe_id))
    }

    if (allBulletins.length === 0) {
      return NextResponse.json({
        error: `Aucun bulletin pour ${periode}. Importez ou calculez les bulletins d'abord.`,
        code: 'NO_BULLETINS'
      }, { status: 404 })
    }

    // Récupérer les employés
    const empIds = [...new Set(allBulletins.map((b: any) => b.employe_id).filter(Boolean))]
    let employes: any[] = []
    try {
      if (empIds.length > 0) {
        const { data } = await supabase.from('employes').select('*').in('id', empIds)
        employes = data || []
      }
    } catch (empErr: any) {
      return NextResponse.json({ error: `Erreur DB employes: ${empErr.message}` }, { status: 500 })
    }
    const empMap = new Map(employes.map((e: any) => [e.id, e]))

    const date = new Date().toISOString().split('T')[0]

    // --- 3. Construire les lignes de virement ---
    const lignes: LigneBulletin[] = allBulletins.map((b: any) => {
      const emp = empMap.get(b.employe_id)
      return {
        employe_code: emp?.code || '',
        nom: emp?.nom || '',
        prenom: emp?.prenom || '',
        bank_account: emp?.bank_account || '',
        bank_iban: emp?.bank_iban || '',
        bank_swift: emp?.bank_swift || '',
        bank_branch: emp?.bank_branch || '',
        bank_account_name: emp?.bank_account_name || `${emp?.prenom} ${emp?.nom}`,
        bank_name: emp?.bank_name || emp?.bank_code || '',
        bank_code: emp?.bank_code || '',
        salaire_net: Number(b.salaire_net),
        devise_salaire: b.devise_salaire || emp?.devise || 'MUR',
        periode,
      }
    })

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
      banque: compteEmetteur?.bank_code || compteEmetteur?.banque || banque_emettrice || 'MCB',
      numero_compte: compteEmetteur?.numero_compte || compteEmetteur?.iban || '000000000000',
      iban: compteEmetteur?.iban || '',
      swift: compteEmetteur?.swift || '',
      nom_compte: compteEmetteur?.nom_compte || '',
    }

    // MCB → utiliser le format officiel BP-V1 (default if no specific emitter configured)
    if (infoEmetteur.banque === 'MCB' || !compteEmetteur) {
      // Générer UN SEUL fichier BP-V1 qui contient lignes 1 (MCB interne) + lignes 2 (inter-bancaire)
      const { content, extension, filename_suggestion } = genererVirementMCB_BPV1(
        lignesMUR,
        infoEmetteur.numero_compte,
        date,
        `SALARY ${periode.slice(0,4)}-${periode.slice(5,7)}`
          .replace(/(\d{4})-(\d{2})/, (_, y, m) => {
            const mois = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            return `SALARY ${mois[parseInt(m)-1]} ${y}`
          })
      )
      const total = lignesMUR.reduce((s, l) => s + l.salaire_net, 0)
      fichiersGeneres.push({
        banque: 'MCB',
        nom_banque: 'Mauritius Commercial Bank (BP-V1)',
        devise: 'MUR',
        nb_employes: lignesMUR.length,
        montant_total: Math.round(total * 100) / 100,
        filename: filename_suggestion,
        content,
        employes: lignesMUR.map(l => `${l.prenom} ${l.nom} (${l.bank_account || 'N/A'})`),
      })
    } else {
      // Autres banques émettrices — grouper par banque bénéficiaire
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
          employes: lgnes.map((l: any) => `${l.prenom} ${l.nom} (${l.bank_account || 'N/A'})`),
        })
      }
    }

    // Générer fichiers EUR
    for (const [banqueCode, lgnes] of groupesEUR.entries()) {
      const nomBanque = BANQUES_MAURITIUS.find(b => b.code === banqueCode)?.nom || banqueCode
      const { content, extension } = genererVirementBanque(lgnes, banqueCode, date, infoEmetteur, 'EUR')
      const total = lgnes.reduce((s: any, l: any) => s + l.salaire_net, 0)
      const filename = `virement_salaires_${periode}_${banqueCode}_EUR.${extension}`

      fichiersGeneres.push({
        banque: banqueCode,
        nom_banque: nomBanque,
        devise: 'EUR',
        nb_employes: lgnes.length,
        montant_total: Math.round(total * 100) / 100,
        filename,
        content,
        employes: lgnes.map((l: any) => `${l.prenom} ${l.nom} (${l.bank_account || 'N/A'})`),
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
      nb_bulletins_total: allBulletins.length,
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
        nb_beneficiaires: allBulletins.length,
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
    const msg = e instanceof Error ? e.message : 'Erreur génération virement'
    const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : ''
    // Sécurité : la stack reste côté serveur (Vercel logs), JAMAIS exposée
    // dans la réponse HTTP — fuites d'info évitées (chemins fichiers,
    // versions de libs, etc.).
    console.error('[virement] CRASH:', msg, stack)
    return NextResponse.json({
      error: 'Erreur interne lors de la génération du virement. Vérifiez les logs serveur.',
    }, { status: 500 })
  }
}

/**
 * GET /api/rh/exports/virement
 * Historique des virements générés
 */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode')

    const supabase = getAdminClient()
    let query = supabase
      .from('virements_salaires')
      .select('*')
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
