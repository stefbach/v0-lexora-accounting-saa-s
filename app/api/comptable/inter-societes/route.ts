import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToSociete, getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * GET /api/comptable/inter-societes
 *
 * Liste les paires d'écritures inter-sociétés générées automatiquement
 * par le rapprochement bancaire (cf PR #207 — détection DDS↔OCC) :
 *   - le MIROIR est l'écriture dans la société destinataire dont
 *     `ref_folio` commence par `MIR-` (préfixe ajouté par buildMirror())
 *   - la SOURCE est l'écriture originale dans la société émettrice dont
 *     `ref_folio` correspond au suffixe (sans le préfixe MIR-)
 *
 * Query params :
 *   - societe_id        (optional) — filtre sur la société destinataire
 *                         (où vit le miroir). Si absent, retourne tous
 *                         les miroirs des sociétés accessibles à l'user.
 *   - societe_emettrice (optional) — filtre par société émettrice
 *   - date_debut        (optional) — YYYY-MM-DD
 *   - date_fin          (optional) — YYYY-MM-DD
 *   - statut            (optional) — filtre sur ecritures.statut
 *
 * Réponse :
 *   {
 *     paires: [{
 *       miroir: { id, societe_id, ref_folio, date_ecriture, libelle,
 *                 numero_compte, debit_mur, credit_mur, statut, ... },
 *       source: { id, societe_id, ref_folio, ... } | null,
 *       date: string,
 *       montant: number,            // montant absolu (max debit/credit)
 *       libelle: string,
 *       societe_emettrice: { id, nom } | null,
 *       societe_destinataire: { id, nom },
 *       statut: 'auto' | 'valide' | 'autre',
 *     }],
 *     total: number,
 *     en_attente: number,
 *   }
 */
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const societe_emettrice = searchParams.get('societe_emettrice')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const statutFilter = searchParams.get('statut')

    const supabase = getAdminClient()

    // Résoudre le périmètre des sociétés accessibles
    let scopeSocieteIds: string[]
    if (societe_id) {
      const hasAccess = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      }
      scopeSocieteIds = [societe_id]
    } else {
      scopeSocieteIds = await getUserSocieteIds(user.id)
      if (scopeSocieteIds.length === 0) {
        return NextResponse.json({ paires: [], total: 0, en_attente: 0 })
      }
    }

    // 1) Charger les miroirs (préfixe MIR-) dans les sociétés accessibles
    let mirQuery = supabase
      .from('ecritures_comptables_v2')
      .select(
        'id, societe_id, dossier_id, date_ecriture, journal, numero_compte, libelle, debit_mur, credit_mur, lettre, ref_folio, statut, created_at',
      )
      .like('ref_folio', 'MIR-%')
      .in('societe_id', scopeSocieteIds)
      .order('date_ecriture', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1000)

    if (date_debut) mirQuery = mirQuery.gte('date_ecriture', date_debut)
    if (date_fin) mirQuery = mirQuery.lte('date_ecriture', date_fin)
    if (statutFilter) mirQuery = mirQuery.eq('statut', statutFilter)

    const { data: miroirRows, error: mirError } = await mirQuery
    if (mirError) {
      return NextResponse.json({ error: mirError.message }, { status: 500 })
    }

    if (!miroirRows || miroirRows.length === 0) {
      return NextResponse.json({ paires: [], total: 0, en_attente: 0 })
    }

    // 2) Grouper les miroirs par ref_folio (chaque paire = 2 lignes même ref_folio)
    type EcritureRow = {
      id: string
      societe_id: string
      dossier_id: string
      date_ecriture: string
      journal: string
      numero_compte: string
      libelle: string
      debit_mur: number
      credit_mur: number
      lettre: string | null
      ref_folio: string
      statut: string | null
      created_at: string
    }

    const miroirsByRefSociete = new Map<string, EcritureRow[]>()
    for (const row of miroirRows as EcritureRow[]) {
      const key = `${row.societe_id}::${row.ref_folio}`
      const arr = miroirsByRefSociete.get(key) || []
      arr.push(row)
      miroirsByRefSociete.set(key, arr)
    }

    // 3) Déduire les ref_folio sources (sans préfixe MIR-) à aller chercher
    const sourceRefFolios = new Set<string>()
    for (const row of miroirRows as EcritureRow[]) {
      if (row.ref_folio.startsWith('MIR-')) {
        sourceRefFolios.add(row.ref_folio.substring(4))
      }
    }

    // 4) Charger les écritures sources (ref_folio sans MIR-) sur tout le périmètre
    //    de l'user (pas seulement la société active), pour pouvoir afficher la société émettrice
    const allAccessibleIds = await getUserSocieteIds(user.id)
    let sourceRows: EcritureRow[] = []
    if (sourceRefFolios.size > 0 && allAccessibleIds.length > 0) {
      const refList = Array.from(sourceRefFolios)
      const { data: srcData } = await supabase
        .from('ecritures_comptables_v2')
        .select(
          'id, societe_id, dossier_id, date_ecriture, journal, numero_compte, libelle, debit_mur, credit_mur, lettre, ref_folio, statut, created_at',
        )
        .in('ref_folio', refList)
        .in('societe_id', allAccessibleIds)
        .limit(refList.length * 4)
      sourceRows = (srcData || []) as EcritureRow[]
    }

    // Filtre optionnel émettrice
    if (societe_emettrice) {
      sourceRows = sourceRows.filter((r) => r.societe_id === societe_emettrice)
    }

    // Map ref_folio source -> société émettrice (première trouvée)
    const sourceByRef = new Map<string, EcritureRow>()
    for (const r of sourceRows) {
      if (!sourceByRef.has(r.ref_folio)) sourceByRef.set(r.ref_folio, r)
    }

    // 5) Charger les noms de sociétés
    const allSocieteIds = new Set<string>()
    for (const r of miroirRows as EcritureRow[]) allSocieteIds.add(r.societe_id)
    for (const r of sourceRows) allSocieteIds.add(r.societe_id)
    const { data: societesData } = await supabase
      .from('societes')
      .select('id, nom')
      .in('id', Array.from(allSocieteIds))
    const socNameById = new Map<string, string>()
    for (const s of societesData || []) socNameById.set(s.id, s.nom)

    // 6) Construire la liste des paires (1 par ref_folio+societe_dest)
    const paires: any[] = []
    let enAttente = 0
    for (const [key, rows] of miroirsByRefSociete) {
      // Prendre le 1er row comme représentant de la paire
      const main = rows.reduce((acc, cur) =>
        Math.abs(Number(cur.debit_mur) || 0) + Math.abs(Number(cur.credit_mur) || 0) >
        Math.abs(Number(acc.debit_mur) || 0) + Math.abs(Number(acc.credit_mur) || 0)
          ? cur
          : acc,
      )
      const sourceRef = main.ref_folio.startsWith('MIR-')
        ? main.ref_folio.substring(4)
        : main.ref_folio
      const source = sourceByRef.get(sourceRef) || null

      // Si filtre émettrice actif, n'inclure que les paires dont la source matche
      if (societe_emettrice && !source) continue

      const montant = Math.max(
        Number(main.debit_mur) || 0,
        Number(main.credit_mur) || 0,
      )
      const statutNorm =
        main.statut === 'auto_genere_inter_societe'
          ? 'auto'
          : main.statut === 'valide_inter_societe'
            ? 'valide'
            : main.statut || 'auto'
      if (statutNorm === 'auto') enAttente += 1

      paires.push({
        key,
        miroir_ids: rows.map((r) => r.id),
        miroir: {
          id: main.id,
          societe_id: main.societe_id,
          ref_folio: main.ref_folio,
          date_ecriture: main.date_ecriture,
          journal: main.journal,
          numero_compte: main.numero_compte,
          libelle: main.libelle,
          debit_mur: main.debit_mur,
          credit_mur: main.credit_mur,
          statut: main.statut,
          lignes: rows.map((r) => ({
            id: r.id,
            numero_compte: r.numero_compte,
            debit_mur: r.debit_mur,
            credit_mur: r.credit_mur,
          })),
        },
        source: source
          ? {
              id: source.id,
              societe_id: source.societe_id,
              ref_folio: source.ref_folio,
              date_ecriture: source.date_ecriture,
              journal: source.journal,
              numero_compte: source.numero_compte,
              libelle: source.libelle,
              debit_mur: source.debit_mur,
              credit_mur: source.credit_mur,
              statut: source.statut,
            }
          : null,
        date: main.date_ecriture,
        montant,
        libelle: main.libelle,
        societe_emettrice: source
          ? { id: source.societe_id, nom: socNameById.get(source.societe_id) || '—' }
          : null,
        societe_destinataire: {
          id: main.societe_id,
          nom: socNameById.get(main.societe_id) || '—',
        },
        statut: statutNorm,
      })
    }

    // Tri final : date desc
    paires.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    return NextResponse.json({
      paires,
      total: paires.length,
      en_attente: enAttente,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur serveur' }, { status: 500 })
  }
}
