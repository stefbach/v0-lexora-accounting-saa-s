import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { createEcrituresForFacture as createEcrituresShared } from '@/lib/accounting/ecritures-factures'
import {
  assertSocieteAccess,
  getAccessibleSocieteIds,
  mapSocieteAccessError,
  ResourceNotFoundError,
} from '@/lib/supabase/assert-societe-access'
import { resolveInternalAuth } from '@/lib/lexora-internal-auth'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = getAdminClient()
    // FIX MCP : utiliser resolveUserAuth pour accepter aussi les clés API
    // (header X-Lexora-Api-Key) + token interne, pas seulement session web.
    // Sinon l'outil MCP `list_factures` exposé à Claude retourne 401.
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const factureId = searchParams.get('id')

    // Tenant isolation — verify user has access to the requested societe_id
    // (unified helper, includes user_societes + dossiers + created_by branches)
    if (societe_id) {
      await assertSocieteAccess(supabase, user.id, societe_id)
    }

    // Mode "fetch single facture by id" : utilisé par /client/facture-preview
    // pour rouvrir une facture déjà enregistrée. Sans ce filtre id, l'API
    // renvoyait toute la liste et la page preview chargeait factures[0]
    // (la facture la plus récente) au lieu de celle demandée → bug observé :
    // l'aperçu et le PDF montraient les infos d'une autre facture.
    if (factureId) {
      const { data: row, error } = await supabase
        .from('factures')
        .select('*')
        .eq('id', factureId)
        .maybeSingle()
      if (error) throw error
      if (!row) return NextResponse.json({ factures: [] })
      // Tenant isolation après lecture : la facture peut appartenir à
      // une autre société que celle active.
      if (row.societe_id) {
        await assertSocieteAccess(supabase, user.id, row.societe_id)
      }
      return NextResponse.json({ factures: [row] })
    }

    const statut = searchParams.get('statut')
    const client = searchParams.get('client')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const limit = parseInt(searchParams.get('limit') || '200')

    // FIX MCP : support de tous les types de documents (client, fournisseur,
    // devis, avoir, note_debit). Avant ce fix la route ne retournait QUE les
    // factures clients (.eq('type_facture', 'client')), ce qui empêchait les
    // outils MCP `list_factures_fournisseurs`, `list_devis`, `list_avoirs`
    // de fonctionner. Si type_facture non fourni → tout retourner (paginé).
    // type_facture distingue client/fournisseur ; type_document distingue
    // facture/devis/avoir/note_debit.
    const type_facture = searchParams.get('type_facture') || searchParams.get('type')
    const type_document = searchParams.get('type_document')

    let query = supabase
      .from('factures')
      .select('*')
      .order('date_facture', { ascending: false })
      .limit(limit)

    if (type_facture && ['client', 'fournisseur'].includes(type_facture)) {
      query = query.eq('type_facture', type_facture)
    }
    if (type_document && ['facture', 'devis', 'avoir', 'note_debit'].includes(type_document)) {
      query = query.eq('type_document', type_document)
    }

    if (societe_id) {
      query = query.eq('societe_id', societe_id)
    } else {
      // Pas de filtre explicite → on restreint aux sociétés accessibles du caller
      // (admin/super_admin voient tout)
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      const role = profile?.role ?? ''
      if (!['admin', 'super_admin'].includes(role)) {
        const accessible = await getAccessibleSocieteIds(supabase, user.id)
        if (accessible.length === 0) {
          return NextResponse.json({ factures: [], totaux: { total_ht: 0, total_tva: 0, total_ttc: 0, total_mur: 0, nb_factures: 0, nb_en_attente: 0, nb_retard: 0 } })
        }
        query = query.in('societe_id', accessible)
      }
    }
    if (statut && statut !== 'all') query = query.eq('statut', statut)
    if (client) query = query.ilike('tiers', `%${client}%`)
    if (date_debut) query = query.gte('date_facture', date_debut)
    if (date_fin) query = query.lte('date_facture', date_fin)

    const { data, error } = await query
    if (error) throw error

    const totaux = {
      total_ht: data?.reduce((s, f) => s + (f.montant_ht || 0), 0) || 0,
      total_tva: data?.reduce((s, f) => s + (f.montant_tva || 0), 0) || 0,
      total_ttc: data?.reduce((s, f) => s + (f.montant_ttc || 0), 0) || 0,
      total_mur: data?.reduce((s, f) => s + (f.montant_mur || f.montant_ttc || 0), 0) || 0,
      nb_factures: data?.length || 0,
      nb_en_attente: data?.filter(f => f.statut === 'en_attente').length || 0,
      nb_retard: data?.filter(f => f.statut === 'retard').length || 0,
    }

    return NextResponse.json({ factures: data || [], totaux })
  } catch (e: any) {
    // Diagnostic enrichi : on injecte societe_id + user_id dans le 403 pour
    // que le caller MCP voie immédiatement le bon couple (user, société) à
    // corriger dans user_societes — cas typique signalé : `list_factures`
    // marche pour OCC et échoue pour DDS, le diff étant l'absence d'entrée
    // user_societes pour DDS côté la clé API utilisée.
    let userIdForLog: string | null = null
    try {
      const u = await resolveUserAuth(request)
      userIdForLog = u?.id ?? null
    } catch { /* ignore */ }
    const societeIdForLog = new URL(request.url).searchParams.get('societe_id')
    const mapped = mapSocieteAccessError(e, {
      societe_id: societeIdForLog,
      user_id: userIdForLog,
    })
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient()
    // Auth : session web OU X-Internal-Token (bot Telegram, n8n)
    const internal = resolveInternalAuth(request)
    let user: { id: string; email?: string }
    if (internal) {
      user = { id: internal.user_id, email: internal.user_email || 'system' }
    } else {
      const authClient = await createClient()
      const { data: { user: u }, error: authError } = await authClient.auth.getUser()
      if (authError || !u) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
      user = { id: u.id, email: u.email }
    }

    const body = await request.json()
    const {
      societe_id, numero_facture, tiers, description,
      date_facture, date_echeance, devise = 'MUR', taux_change = 1,
      montant_ht = 0, montant_tva = 0, montant_ttc,
      taux_tva = 0, statut: statutIn = 'brouillon', notes, notes_internes,
      lignes = [], conditions_paiement = 30, termes, template = 'standard', template_id = null,
      client_offshore = false, remise_pct = 0, remise_montant = 0,
      recurrent = false, recurrent_frequence, logo_url,
      mode_paiement = 'banque', paye_par, contact_id,
      type_document = 'facture', facture_reference_id,
      recurrence_jour_du_mois, recurrence_date_debut, recurrence_date_fin,
    } = body

    if (!societe_id || !date_facture) {
      return NextResponse.json({ error: 'societe_id et date_facture requis' }, { status: 400 })
    }

    // Garde-fou conversion devise : si la facture est en devise étrangère mais
    // que le taux est ≈1, le montant_mur sera identique au TTC en devise — bug
    // de saisie classique. On rejette pour forcer l'utilisateur à fournir un
    // vrai taux (ou laisser l'auto-fetch côté UI le remplir depuis taux-change).
    if (devise && devise !== 'MUR') {
      const t = Number(taux_change) || 0
      if (t <= 1.0001) {
        return NextResponse.json({
          error: `Taux de change invalide pour ${devise} (${t}). Renseignez le taux ${devise} → MUR — laissez le champ se remplir automatiquement ou saisissez la valeur réelle.`
        }, { status: 400 })
      }
    }

    await assertSocieteAccess(supabase, user.id, societe_id)

    // For devis: force statut='devis' (not en_attente) — no GL entries
    const statut: string = type_document === 'devis'
      ? (statutIn === 'converti' ? 'converti' : 'devis')
      : statutIn

    // Generate sequential invoice number if not provided.
    // Source de vérité = societes.<type>_prefixe + <type>_prochain_numero
    // (mig 243 pour facture + mig 247 pour devis/avoir/note_debit).
    // L'utilisateur paramètre une fois ses préfixes + compteurs dans
    // /client/facturation-settings, ensuite tout est auto.
    let finalNumero = numero_facture
    const filterDoc = type_document || 'facture'

    // Mapping type_document → colonnes (préfixe + compteur) sur societes
    const colMap: Record<string, { prefCol: string; numCol: string; defaultPrefix: string }> = {
      facture:    { prefCol: 'facture_prefixe',    numCol: 'facture_prochain_numero',    defaultPrefix: 'INV-' },
      devis:      { prefCol: 'devis_prefixe',      numCol: 'devis_prochain_numero',      defaultPrefix: 'DEV-' },
      avoir:      { prefCol: 'avoir_prefixe',      numCol: 'avoir_prochain_numero',      defaultPrefix: 'AV-'  },
      note_debit: { prefCol: 'note_debit_prefixe', numCol: 'note_debit_prochain_numero', defaultPrefix: 'ND-'  },
    }
    const cfg = colMap[filterDoc] || colMap.facture

    if (!finalNumero) {
      // Lit le compteur + le préfixe dans societes. Si la requête échoue
      // (mig 247 non appliquée → colonne devis/avoir manquante), on
      // retombe sur la logique legacy parse-dernier-numéro.
      let prefixe = cfg.defaultPrefix
      let prochain = 0
      let dbCounterAvailable = false
      const counterRes = await supabase
        .from('societes')
        .select(`${cfg.prefCol}, ${cfg.numCol}`)
        .eq('id', societe_id)
        .maybeSingle()
      if (!counterRes.error && counterRes.data) {
        const row = counterRes.data as Record<string, any>
        if (row[cfg.prefCol] || row[cfg.numCol]) {
          prefixe = (row[cfg.prefCol] as string) || cfg.defaultPrefix
          prochain = Number(row[cfg.numCol]) || 1
          dbCounterAvailable = true
        }
      }

      if (dbCounterAvailable) {
        finalNumero = `${prefixe}${String(prochain).padStart(4, '0')}`
        // Incrémente le compteur en base — best-effort, sans atomicité
        // parfaite. Risque de collision faible dans contexte SME mono-user.
        await supabase
          .from('societes')
          .update({ [cfg.numCol]: prochain + 1 })
          .eq('id', societe_id)
      } else {
        // Fallback : mig pas appliquée → parse du dernier numéro existant
        const { data: lastInvoice } = await supabase
          .from('factures')
          .select('numero_facture')
          .eq('societe_id', societe_id)
          .eq('type_facture', 'client')
          .eq('type_document', filterDoc)
          .not('numero_facture', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        let nextNum = 1
        if (lastInvoice?.numero_facture) {
          const match = lastInvoice.numero_facture.match(/(\d+)$/)
          if (match) nextNum = parseInt(match[1]) + 1
        }
        finalNumero = `${cfg.defaultPrefix}${String(nextNum).padStart(3, '0')}`
      }
    } else {
      // Numéro fourni par l'utilisateur (souvent une valeur pré-remplie
      // côté front à partir du compteur DB). Deux risques :
      //  1) le numéro existe déjà en DB (compteur désynchronisé, legacy
      //     non comptabilisé, plusieurs onglets ouverts en parallèle…)
      //     → on régénère automatiquement plutôt que de renvoyer 409.
      //  2) on avance le compteur DB pour que le PROCHAIN appel ne
      //     réutilise pas le même numéro.
      const checkRes = await supabase
        .from('factures')
        .select('id')
        .eq('societe_id', societe_id)
        .eq('numero_facture', finalNumero)
        .eq('type_facture', 'client')
        .limit(1)
        .maybeSingle()
      if (checkRes.data) {
        // Collision détectée → trouver le prochain numéro libre en
        // s'appuyant sur le compteur DB s'il est dispo, sinon en
        // parsant le dernier numéro existant.
        const counterRes = await supabase
          .from('societes')
          .select(`${cfg.prefCol}, ${cfg.numCol}`)
          .eq('id', societe_id)
          .maybeSingle()
        const row = (counterRes.data as Record<string, any> | null) || {}
        const prefixe = (row[cfg.prefCol] as string) || cfg.defaultPrefix
        const matchUser = String(finalNumero).match(/(\d+)$/)
        const usedNum = matchUser ? parseInt(matchUser[1], 10) : 0
        let next = Math.max(Number(row[cfg.numCol]) || 0, usedNum + 1)
        // Avance jusqu'à trouver un numéro non utilisé (au cas où plusieurs
        // numéros consécutifs seraient déjà en DB).
        for (let i = 0; i < 50; i++) {
          const candidate = `${prefixe}${String(next).padStart(4, '0')}`
          const exists = await supabase
            .from('factures')
            .select('id')
            .eq('societe_id', societe_id)
            .eq('numero_facture', candidate)
            .eq('type_facture', 'client')
            .limit(1)
            .maybeSingle()
          if (!exists.data) { finalNumero = candidate; break }
          next++
        }
        await supabase
          .from('societes')
          .update({ [cfg.numCol]: next + 1 })
          .eq('id', societe_id)
      } else {
        // Pas de collision → on avance simplement le compteur si besoin.
        const match = String(finalNumero).match(/(\d+)$/)
        if (match) {
          const used = parseInt(match[1], 10)
          if (!Number.isNaN(used)) {
            const counterRes = await supabase
              .from('societes')
              .select(cfg.numCol)
              .eq('id', societe_id)
              .maybeSingle()
            const current = Number((counterRes.data as Record<string, any> | null)?.[cfg.numCol]) || 0
            if (used + 1 > current) {
              await supabase
                .from('societes')
                .update({ [cfg.numCol]: used + 1 })
                .eq('id', societe_id)
            }
          }
        }
      }
    }

    const ttc = montant_ttc ?? (montant_ht + montant_tva)
    const mur = devise === 'MUR' ? ttc : ttc * (taux_change || 1)

    // Si l'utilisateur active la récurrence, on force statut='modele' :
    // le modèle ne doit jamais devenir une facture comptabilisée. Le cron
    // /api/cron/factures-recurrentes clonera ce modèle pour générer les
    // vraies factures au fil du temps.
    const finalStatut = recurrent === true ? 'modele' : statut

    const insertData: Record<string, unknown> = {
      societe_id, type_facture: 'client',
      numero_facture: finalNumero, tiers, description,
      date_facture, date_echeance, devise, taux_change,
      montant_ht, montant_tva, montant_ttc: ttc,
      taux_tva, montant_mur: mur, statut: finalStatut, notes,
      notes_internes, lignes, conditions_paiement, termes,
      template, template_id, client_offshore, remise_pct, remise_montant,
      recurrent, recurrent_frequence, logo_url,
      mode_paiement, paye_par, contact_id,
      type_document,
    }
    if (recurrent === true) {
      insertData.recurrence_jour_du_mois = recurrence_jour_du_mois || null
      insertData.recurrence_date_debut = recurrence_date_debut || date_facture
      insertData.recurrence_date_fin = recurrence_date_fin || null
    }
    if (facture_reference_id) {
      insertData.facture_reference_id = facture_reference_id
    }

    // Insert robuste : si une colonne récente (ex: template_id mig 286)
    // manque dans la DB de la cible, on retire le champ fautif et on
    // retente plutôt que de faire échouer toute la création de facture.
    let data, error
    const tryInsert = async (payload: typeof insertData) =>
      supabase.from('factures').insert(payload).select().single()
    ;({ data, error } = await tryInsert(insertData))
    if (error) {
      const code = (error as { code?: string }).code
      const msg = error.message || ''
      const isSchemaError = code === '42703' || /column.*(not exist|schema cache)/i.test(msg)
      const missingCol = msg.match(/'([a-zA-Z_]+)'/)?.[1]
      if (isSchemaError && missingCol && missingCol in insertData) {
        console.warn(`[factures POST] colonne "${missingCol}" manquante en DB, retrait et retry. Lance la migration correspondante.`)
        delete (insertData as Record<string, unknown>)[missingCol]
        ;({ data, error } = await tryInsert(insertData))
      }
    }

    if (error) {
      // Erreur 23505 = violation unique (societe_id, numero_facture, type_facture).
      // Cause typique : compteur DB pas à jour vs numéros déjà saisis →
      // l'utilisateur recevait juste "duplicate key value violates...".
      // On renvoie un message clair avec le numéro fautif.
      const code = (error as { code?: string }).code
      if (code === '23505' && /numero/i.test(error.message || '')) {
        return NextResponse.json({
          error: `Le numéro "${finalNumero}" existe déjà pour cette société. Modifiez le numéro manuellement ou mettez à jour le compteur dans Paramètres facturation.`,
          code: 'DUPLICATE_INVOICE_NUMBER',
          numero: finalNumero,
        }, { status: 409 })
      }
      throw error
    }

    // Auto-create a "documents" record so the invoice appears in "Documents numérisés"
    // (links the invoice to the documents folder for consistency)
    try {
      const { data: dossier } = await supabase
        .from('dossiers')
        .select('id')
        .eq('societe_id', societe_id)
        .limit(1)
        .maybeSingle()

      if (dossier?.id) {
        // Check if a document already exists for this invoice
        const { data: existingDoc } = await supabase
          .from('documents')
          .select('id')
          .eq('dossier_id', dossier.id)
          .like('nom_fichier', `%${finalNumero}%`)
          .maybeSingle()

        if (!existingDoc) {
          // Get société name for proper societe_detectee
          const { data: socData } = await supabase
            .from('societes')
            .select('nom')
            .eq('id', societe_id)
            .maybeSingle()

          await supabase.from('documents').insert({
            dossier_id: dossier.id,
            uploaded_by: user.id,
            nom_fichier: `${finalNumero} - ${tiers || 'Client'}.pdf`,
            type_fichier: 'pdf',
            type_document: type_document === 'avoir' ? 'avoir_client' : 'facture_client',
            statut: 'traite',
            storage_path: null,
            societe_detectee: socData?.nom || null,
            n8n_result: {
              source: 'facture_client_api',
              facture_id: data.id,
              numero_facture: finalNumero,
              extraction: {
                numero: finalNumero,
                tiers,
                date_facture,
                montant_ht,
                montant_tva,
                montant_ttc: ttc,
              },
            },
          })
          console.log(`[factures] Document record created for invoice ${finalNumero} (société: ${socData?.nom})`)
        }
      }
    } catch (docErr: any) {
      console.warn('[factures] Failed to create document record:', docErr.message)
      // Don't fail the invoice creation if document creation fails
    }

    // Auto-create ecritures comptables when invoice is finalized
    // Skip for devis — quotes don't hit the GL until converted to facture
    if (statut === 'en_attente' && type_document !== 'devis' && data) {
      await createEcrituresShared(supabase, {
        id: data.id,
        societe_id,
        numero_facture: finalNumero,
        tiers: tiers || '',
        date_facture,
        montant_ht: Number(montant_ht) || 0,
        montant_tva: Number(montant_tva) || 0,
        montant_ttc: Number(ttc) || 0,
        type_facture: 'client',
        devise,
        taux_change,
        montant_mur: mur,
      })
    }

    return NextResponse.json({ facture: data }, { status: 201 })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    // Extraction robuste du message — couvre les Error JS, les objets
    // Supabase { code, message, details, hint } et les rejects génériques.
    // Sans ça, le client recevait juste { error: undefined } → "Erreur"
    // affiché sans contexte impossible à debugger.
    const err = e as any
    const message =
      err?.message
      || err?.error_description
      || err?.error
      || err?.hint
      || err?.details
      || (typeof err === 'string' ? err : null)
      || 'Erreur inattendue'
    const code = err?.code
    console.error('[factures POST] erreur:', { code, message, details: err?.details, hint: err?.hint })
    return NextResponse.json({ error: message, code, details: err?.details, hint: err?.hint }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Fetch existing invoice for status transition check + access verification
    const { data: existing } = await supabase
      .from('factures')
      .select('*')
      .eq('id', id)
      .single()
    if (!existing) throw new ResourceNotFoundError('Facture introuvable')

    // Tenant isolation: le caller doit avoir accès à la société de la facture
    await assertSocieteAccess(supabase, user.id, existing.societe_id)

    if (existing.statut !== 'brouillon' && existing.statut !== 'en_attente') {
      // Sur une facture finalisée, seuls certains champs métier (non comptables) peuvent changer.
      // societe_id RETIRÉ de allowedUpdates : le changer sans déplacer les écritures liées
      // crée des écritures orphelines et pollue la balance de la société d'origine.
      const allowedUpdates = ['statut', 'mode_paiement', 'paye_par', 'notes']
      const keys = Object.keys(updates)
      const hasDisallowed = keys.some(k => !allowedUpdates.includes(k))
      if (hasDisallowed) {
        return NextResponse.json({ error: 'Seules les factures brouillon peuvent etre modifiees (sauf statut/mode_paiement/notes)' }, { status: 400 })
      }
    }

    // Déplacement de facture entre sociétés : autorisé UNIQUEMENT si la facture
    // n'a pas encore d'écritures comptables liées. Sinon on laisserait des écritures
    // orphelines sur la société d'origine → déséquilibre + contamination visuelle
    // d'une société par les factures d'une autre.
    if (updates.societe_id && updates.societe_id !== existing.societe_id) {
      // Tenant isolation sur la société CIBLE aussi
      await assertSocieteAccess(supabase, user.id, updates.societe_id)

      const { count: ecrituresLiees } = await supabase
        .from('ecritures_comptables_v2')
        .select('id', { count: 'exact', head: true })
        .eq('societe_id', existing.societe_id)
        .like('ref_folio', `FAC-${id}%`)
      if ((ecrituresLiees || 0) > 0) {
        return NextResponse.json({
          error: `Impossible de déplacer cette facture : ${ecrituresLiees} écriture(s) comptable(s) déjà enregistrée(s). Annulez puis recréez la facture sous la bonne société.`,
        }, { status: 409 })
      }
    }

    // If societe_id is changed (et la vérification ci-dessus a passé),
    // also update the linked document record
    if (updates.societe_id && updates.societe_id !== existing.societe_id) {
      try {
        // Find old and new dossier
        const { data: newDossier } = await supabase
          .from('dossiers').select('id').eq('societe_id', updates.societe_id).limit(1).maybeSingle()
        const { data: newSoc } = await supabase
          .from('societes').select('nom').eq('id', updates.societe_id).maybeSingle()
        if (newDossier?.id) {
          // Find the linked document by n8n_result.facture_id
          const { data: linkedDocs } = await supabase
            .from('documents')
            .select('id, n8n_result')
            .contains('n8n_result', { facture_id: id })
          for (const doc of linkedDocs || []) {
            await supabase.from('documents').update({
              dossier_id: newDossier.id,
              societe_detectee: newSoc?.nom || null,
            }).eq('id', doc.id)
          }
          console.log(`[factures PATCH] Reassigned facture ${id} and ${linkedDocs?.length || 0} linked document(s) to societe ${updates.societe_id}`)
        }
      } catch (e: any) {
        console.warn('[factures PATCH] Failed to update linked document societe:', e.message)
      }
    }

    // Garde-fou conversion devise sur PATCH — sinon création MUR puis PATCH
    // EUR/taux=1 contournait le check du POST. Lit la valeur effective après
    // merge des updates pour cohérence.
    const finalDevise = updates.devise ?? existing.devise
    const finalTaux = updates.taux_change ?? existing.taux_change
    if (finalDevise && finalDevise !== 'MUR') {
      const t = Number(finalTaux) || 0
      if (t <= 1.0001) {
        return NextResponse.json({
          error: `Taux de change invalide pour ${finalDevise} (${t}). Saisissez le taux réel ${finalDevise} → MUR.`
        }, { status: 400 })
      }
    }

    // Recalculate MUR if needed
    if (updates.montant_ttc !== undefined && updates.devise) {
      updates.montant_mur = updates.devise === 'MUR'
        ? updates.montant_ttc
        : updates.montant_ttc * (updates.taux_change || 1)
    }

    updates.updated_at = new Date().toISOString()

    // Update résilient — calqué sur la logique POST : si une colonne envoyée
    // par le client n'existe pas en DB (cas typique : accent_color,
    // contre_valeur_mur, ou champs récents pas encore migrés sur cet env),
    // on la retire et on retente. Évite que tout le PATCH échoue à cause
    // d'un champ optionnel inconnu.
    const tryUpdate = async (payload: Record<string, any>) =>
      supabase.from('factures').update(payload).eq('id', id).select().single()
    let updateResult = await tryUpdate(updates)
    // Boucle de retry — jusqu'à 5 colonnes inconnues retirées avant
    // d'abandonner (évite une boucle infinie sur une vraie erreur).
    for (let i = 0; i < 5 && updateResult.error; i++) {
      const code = (updateResult.error as { code?: string }).code
      const msg = updateResult.error.message || ''
      const isSchemaError = code === '42703' || /column.*(not exist|schema cache|not found)/i.test(msg)
      if (!isSchemaError) break
      const missingCol = msg.match(/'([a-zA-Z_]+)'/)?.[1]
      if (!missingCol || !(missingCol in updates)) break
      console.warn(`[factures PATCH] colonne "${missingCol}" manquante en DB, retrait et retry.`)
      delete updates[missingCol]
      updateResult = await tryUpdate(updates)
    }
    const { data, error } = updateResult
    if (error) throw error

    // Auto-create ecritures when transitioning from brouillon to en_attente
    // Skip for devis — quotes don't hit the GL until converted
    if (
      existing &&
      existing.statut === 'brouillon' &&
      updates.statut === 'en_attente' &&
      data &&
      data.type_document !== 'devis'
    ) {
      await createEcrituresShared(supabase, {
        id: data.id,
        societe_id: data.societe_id,
        numero_facture: data.numero_facture || '',
        tiers: data.tiers || '',
        date_facture: data.date_facture,
        montant_ht: Number(data.montant_ht) || 0,
        montant_tva: Number(data.montant_tva) || 0,
        montant_ttc: Number(data.montant_ttc) || 0,
        type_facture: data.type_facture || 'client',
        devise: data.devise || 'MUR',
        taux_change: Number(data.taux_change) || 1,
        montant_mur: Number(data.montant_mur) || undefined,
      })
    }

    // Symétrique : quand on repasse une facture en brouillon (depuis n'importe
    // quel statut comptable), on nettoie les écritures qu'elle avait générées.
    // Sinon le grand livre garderait des lignes orphelines et le bilan serait
    // faussé. Idem que le DELETE cascade (filtre par facture_id, mig 133).
    if (
      existing &&
      existing.statut !== 'brouillon' &&
      updates.statut === 'brouillon'
    ) {
      try {
        await supabase.from('ecritures_comptables_v2').delete().eq('facture_id', id)
      } catch (e: any) {
        console.warn('[factures PATCH] Failed to clean ecritures on revert-to-draft:', e.message)
      }
    }

    return NextResponse.json({ facture: data })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    // Extraction du vrai message (Supabase, Postgres, ou Error JS) pour
    // que le client voie quelque chose d'actionnable plutôt qu'un 'Erreur'
    // opaque (même logique que POST).
    const err = e as any
    const message = err?.message || err?.error_description || err?.error || err?.hint || err?.details || (typeof err === 'string' ? err : null) || 'Erreur inattendue'
    const code = err?.code
    console.error('[factures PATCH] erreur:', { code, message, details: err?.details, hint: err?.hint })
    return NextResponse.json({ error: message, code, details: err?.details, hint: err?.hint }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = getAdminClient()
    const authClient = await createClient()
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const force = searchParams.get('force') === '1'
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const { data: existing } = await supabase
      .from('factures')
      .select('statut, societe_id, numero_facture')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Facture introuvable' }, { status: 404 })

    // Tenant isolation avant toute suppression
    await assertSocieteAccess(supabase, user.id, existing.societe_id)

    // Non-drafts require force=1 (confirmed delete with cascade)
    if (existing.statut !== 'brouillon' && !force) {
      return NextResponse.json({ error: `Facture en statut "${existing.statut}". Utilisez force=1 pour supprimer avec les ecritures associees.` }, { status: 400 })
    }

    // Cascade: delete linked documents (n8n_result contains facture_id)
    try {
      const { data: linkedDocs } = await supabase
        .from('documents').select('id').contains('n8n_result', { facture_id: id })
      for (const doc of linkedDocs || []) {
        await supabase.from('documents').delete().eq('id', doc.id)
      }
      if (linkedDocs && linkedDocs.length > 0) {
        console.log(`[factures DELETE] Removed ${linkedDocs.length} linked document(s) for facture ${id}`)
      }
    } catch (e: any) {
      console.warn('[factures DELETE] Failed to remove linked documents:', e.message)
    }

    // Cascade: delete accounting entries linked to this specific facture.
    // ⚠️ V2 ONLY (mig 230) + filtre par facture_id (FK depuis mig 133) UNIQUEMENT.
    //
    // ⚠️ FIX (2026-05-03) : avant ce fix le DELETE filtrait par
    // `libelle LIKE 'Facture <numero>%'`. C'était dangereux car si 2 factures
    // partagent le même numero (collision OCR rare mais possible avant le fix
    // de suffixage anti-collision), supprimer une facture aurait supprimé les
    // écritures de l'autre. On utilise maintenant `facture_id = id` qui est
    // strictement spécifique à cette facture.
    try {
      await supabase.from('ecritures_comptables_v2')
        .delete()
        .eq('facture_id', id)
    } catch (e: any) {
      console.warn('[factures DELETE] Failed to remove ecritures:', e.message)
    }

    const { error } = await supabase
      .from('factures')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
