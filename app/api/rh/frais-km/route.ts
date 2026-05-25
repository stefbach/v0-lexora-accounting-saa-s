import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// GET /api/rh/frais-km?societe_id=...&employe_id=...&periode=YYYY-MM
// GET /api/rh/frais-km?action=list_trajets&employe_id=...&periode=YYYY-MM
//   → liste détail des trajets (table frais_km_trajets, mig 426)
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const employe_id = searchParams.get('employe_id')
    const periode = searchParams.get('periode')
    const action = searchParams.get('action')

    // ── Liste détail des trajets pour un employé/mois ──────────────────────
    // Mig 426 — chaque trajet est une ligne distincte ; l'agrégat reste
    // dans frais_km_mois (synchronisé par trigger).
    if (action === 'list_trajets') {
      if (!employe_id || !periode) {
        return NextResponse.json({ error: 'employe_id et periode requis' }, { status: 400 })
      }
      const periodeDate = `${periode}-01`
      const { data: trajets, error } = await supabase
        .from('frais_km_trajets')
        .select('*')
        .eq('employe_id', employe_id)
        .eq('periode', periodeDate)
        .order('date_trajet', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) {
        console.error('[frais-km list_trajets] error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ trajets: trajets || [] })
    }

    // Multi-tenant : si pas de societe_id, on étend la recherche à TOUTES
    // les sociétés accessibles. Avant : on prenait juste la première, ce
    // qui faisait que les frais saisis pour une autre société accessible
    // n'apparaissaient pas dans la liste — bug "liste ne se rafraîchit
    // pas après ajout" quand le sélecteur de société est sur "all".
    let accessibleSocieteIds: string[] = []
    if (!societe_id) {
      accessibleSocieteIds = await getUserSocieteIds(user.id)
      if (accessibleSocieteIds.length === 0) {
        return NextResponse.json({ rule: null, frais: [], tarif_km: 7, entries: [], total: 0 })
      }
    }

    // Fetch km rule — try both table names (frais_km_rules or frais_km_regles).
    // En mode multi-société (no societe_id), on prend la règle de la 1re
    // société accessible juste pour exposer un tarif par défaut côté UI.
    const ruleSocieteId = societe_id || accessibleSocieteIds[0]
    let rule: any = null
    const { data: r1, error: e1 } = await supabase
      .from('frais_km_rules')
      .select('*')
      .eq('societe_id', ruleSocieteId)
      .eq('actif', true)
      .order('date_effet', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!e1) {
      rule = r1
    } else {
      const { data: r2 } = await supabase
        .from('frais_km_regles')
        .select('*')
        .eq('societe_id', ruleSocieteId)
        .eq('actif', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      rule = r2
    }

    // Fetch monthly entries — pas de FK join (peut crasher RLS)
    let entryQuery = supabase
      .from('frais_km_mois')
      .select('*')
      .order('periode', { ascending: false })

    // Filter by employees of the relevant société(s).
    // Sprint 5 FIX 1 — on exclut les employés partis (date_depart not null)
    // des frais km courants. Les frais historiques restent accessibles via
    // l'employe_id direct.
    if (employe_id) {
      entryQuery = entryQuery.eq('employe_id', employe_id)
    } else {
      let empsQuery = supabase
        .from('employes')
        .select('id')
        .eq('actif', true)
        .is('date_depart', null)
      if (societe_id) {
        empsQuery = empsQuery.eq('societe_id', societe_id)
      } else {
        empsQuery = empsQuery.in('societe_id', accessibleSocieteIds)
      }
      const { data: emps } = await empsQuery
      const ids = emps?.map(e => e.id) || []
      if (ids.length > 0) {
        entryQuery = entryQuery.in('employe_id', ids)
      } else {
        // FIX — toujours retourner `frais: []` (pas seulement entries) pour
        // que le client puisse setFrais(fraisRes.frais || []) sans casser.
        return NextResponse.json({
          rule,
          frais: [],
          tarif_km: Number(rule?.tarif_par_km) || 7,
          entries: [],
          total: 0,
        })
      }
    }

    if (periode) {
      entryQuery = entryQuery.eq('periode', `${periode}-01`)
    }

    const { data: entries, error: entErr } = await entryQuery

    // Enrich entries with employee names (avoid FK join)
    const empIds = [...new Set((entries || []).map((e: any) => e.employe_id))]
    let empMap: Record<string, any> = {}
    if (empIds.length > 0) {
      const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste').in('id', empIds)
      for (const e of emps || []) empMap[e.id] = e
    }

    const frais = (entries || []).map((e: any) => {
      const emp = empMap[e.employe_id] || e.employe || {}
      // Sprint 11 BUG 5 — statut dérivé de la colonne approuve BOOLEAN.
      // Fallback sur e.statut pour envs legacy qui auraient gardé l'ancien schéma.
      const statutDerive = e.statut
        ?? (e.approuve === true ? 'approuve' : 'en_attente')
      return {
        id: e.id,
        employe_id: e.employe_id,
        employe_nom: emp.nom || '',
        employe_prenom: emp.prenom || '',
        employe_poste: emp.poste || '',
        periode: e.periode,
        km: Number(e.km_parcourus) || 0,
        tarif: Number(e.tarif_applique || e.tarif_par_km) || Number(rule?.tarif_par_km) || 7,
        montant: Number(e.montant) || 0,
        statut: statutDerive,
        approuve: e.approuve === true,
        justificatif: e.justificatif || null,
      }
    })

    return NextResponse.json({
      rule,
      frais,
      tarif_km: Number(rule?.tarif_par_km) || 7,
      entries: entries || [],
      total: (entries || []).length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// POST /api/rh/frais-km
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ── Set km tariff rule for a société ─────────────────────────────────────
    if (action === 'set_rule' || action === 'update_tarif') {
      const societe_id = body.societe_id
      const tarifValue = Number(body.tarif_par_km || body.tarif_km)
      if (!societe_id || !tarifValue) {
        return NextResponse.json({ error: 'societe_id et tarif requis' }, { status: 400 })
      }

      // FIX BUG 1 — vérification explicite du rôle AVANT toute écriture.
      // Sans ça, RLS policy `rh_full_fkr` rejette silencieusement et le
      // front pensait que la sauvegarde avait fonctionné (pas de feedback).
      const ALLOWED_ROLES = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (profErr) {
        console.error('[frais-km update_tarif] profile lookup error:', profErr.message)
      }
      const userRole = prof?.role || null
      if (!userRole || !ALLOWED_ROLES.includes(userRole)) {
        return NextResponse.json(
          { error: 'Rôle insuffisant pour modifier le tarif km', role: userRole },
          { status: 403 }
        )
      }

      // Try frais_km_rules first, fallback to frais_km_regles
      let tableName = 'frais_km_rules'
      const r1 = await supabase.from('frais_km_rules').update({ actif: false }).eq('societe_id', societe_id)
      if (r1.error) {
        console.error('[frais-km update_tarif] deactivate frais_km_rules error:', r1.error.message)
        tableName = 'frais_km_regles'
        const r2 = await supabase.from('frais_km_regles').update({ actif: false }).eq('societe_id', societe_id)
        if (r2.error) {
          console.error('[frais-km update_tarif] deactivate frais_km_regles error:', r2.error.message)
        }
      }

      const { data, error } = await supabase
        .from(tableName)
        .insert({
          societe_id,
          tarif_par_km: tarifValue,
          vehicule_type: body.vehicule_type || 'voiture',
          plafond_mensuel: body.plafond_mensuel ? Number(body.plafond_mensuel) : null,
          actif: true,
          date_effet: new Date().toISOString().split('T')[0],
        })
        .select()
        .single()

      if (error) {
        console.error('[frais-km update_tarif] insert error:', error.message, error.code, error.details)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, rule: data, tarif_km: tarifValue })
    }

    // ── Mig 426 — Création d'un trajet détail ───────────────────────────────
    // Plusieurs trajets par employé/mois sont autorisés. Le trigger
    // sync_frais_km_mois_from_trajets met à jour automatiquement
    // frais_km_mois (somme des km validés × tarif actif).
    if (action === 'create_trajet') {
      const {
        employe_id,
        periode,
        date_trajet,
        depart_adresse,
        arrivee_adresse,
        km,
        motif,
        aller_retour,
        societe_id: bodySocieteId,
      } = body
      if (!employe_id || !periode || km === undefined || km === null) {
        return NextResponse.json({ error: 'employe_id, periode, km requis' }, { status: 400 })
      }
      const kmNum = Number(km)
      if (!Number.isFinite(kmNum) || kmNum < 0) {
        return NextResponse.json({ error: 'km invalide' }, { status: 400 })
      }

      // Résoudre societe_id si non fourni (via employes)
      let sid = bodySocieteId
      if (!sid) {
        const { data: emp } = await supabase
          .from('employes')
          .select('societe_id')
          .eq('id', employe_id)
          .single()
        sid = emp?.societe_id
      }
      if (!sid) {
        return NextResponse.json({ error: 'societe_id introuvable' }, { status: 400 })
      }

      const periodeDate = `${periode}-01`
      const insertRow = {
        societe_id: sid,
        employe_id,
        periode: periodeDate,
        date_trajet: date_trajet || null,
        depart_adresse: depart_adresse || null,
        arrivee_adresse: arrivee_adresse || null,
        km: kmNum,
        motif: motif || null,
        aller_retour: Boolean(aller_retour),
        statut: 'en_attente' as const,
        created_by: user.id,
      }

      const { data, error } = await supabase
        .from('frais_km_trajets')
        .insert(insertRow)
        .select()
        .single()

      if (error) {
        console.error('[frais-km create_trajet] insert error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ trajet: data })
    }

    // ── Mig 426 — Validation/rejet d'un trajet ──────────────────────────────
    if (action === 'validate_trajet') {
      const { id, statut, rejected_reason } = body
      if (!id || !statut) {
        return NextResponse.json({ error: 'id et statut requis' }, { status: 400 })
      }
      const allowed = ['en_attente', 'valide', 'rejete', 'paye']
      if (!allowed.includes(statut)) {
        return NextResponse.json({ error: 'statut invalide' }, { status: 400 })
      }
      const update: Record<string, unknown> = { statut }
      if (statut === 'valide' || statut === 'paye') {
        update.validated_by = user.id
        update.validated_at = new Date().toISOString()
        update.rejected_reason = null
      } else if (statut === 'rejete') {
        update.rejected_reason = rejected_reason || null
      }
      const { data, error } = await supabase
        .from('frais_km_trajets')
        .update(update)
        .eq('id', id)
        .select()
        .single()
      if (error) {
        console.error('[frais-km validate_trajet] error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ trajet: data })
    }

    // ── Mig 426 — Suppression d'un trajet ───────────────────────────────────
    // Le trigger AFTER DELETE recalcule l'agrégat frais_km_mois.
    if (action === 'delete_trajet') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
      const { error } = await supabase.from('frais_km_trajets').delete().eq('id', id)
      if (error) {
        console.error('[frais-km delete_trajet] error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // ── Enter km for an employee for a period ────────────────────────────────
    // Sprint 11 BUG 5 — aligner l'INSERT sur le schéma réel (mig 037) :
    //   - colonne TARIF : tarif_applique (pas tarif_par_km)
    //   - colonne MONTANT : GENERATED ALWAYS AS (km_parcourus * tarif_applique)
    //     STORED — NE JAMAIS envoyer dans l'INSERT, sinon 42601/erreur PG.
    //   - colonne TEXTE : justificatif (pas motif)
    //   - colonne STATUT : approuve BOOLEAN (pas statut 'en_attente')
    //   - PAS de colonnes saisi_par/approuve_at/created_at sur frais_km_mois.
    // Le plafond mensuel est appliqué en capant km_parcourus (puisque
    // montant est dérivé) au lieu de capper le montant seul.
    if (action === 'saisir') {
      const { employe_id, periode, km_parcourus, justificatif, motif, societe_id } = body
      // Accepter aussi un tarif explicite depuis le body (sinon dérivé de saisieRule).
      const tarifBody = body.tarif_applique !== undefined ? Number(body.tarif_applique) : undefined
      if (!employe_id || !periode || km_parcourus === undefined) {
        return NextResponse.json({ error: 'employe_id, periode et km_parcourus requis' }, { status: 400 })
      }

      // Get the active tariff for the société
      let sid = societe_id
      if (!sid) {
        const { data: emp } = await supabase
          .from('employes')
          .select('societe_id')
          .eq('id', employe_id)
          .single()
        sid = emp?.societe_id
      }

      // Try both table names (legacy fallback)
      let saisieRule: any = null
      const { data: sr1 } = await supabase.from('frais_km_rules').select('tarif_par_km, plafond_mensuel').eq('societe_id', sid).eq('actif', true).order('date_effet', { ascending: false }).limit(1).maybeSingle()
      if (sr1) { saisieRule = sr1 } else {
        const { data: sr2 } = await supabase.from('frais_km_regles').select('tarif_par_km, plafond_mensuel').eq('societe_id', sid).eq('actif', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
        saisieRule = sr2
      }

      // Priorité : body.tarif_applique > règle société > défaut 7
      // (défaut aligné sur parametres_km.taux_voiture / coût réel Maurice).
      const tarif = (tarifBody && tarifBody > 0) ? tarifBody : (Number(saisieRule?.tarif_par_km) || 7)
      let kmEffectifs = Number(km_parcourus)
      // Apply monthly cap on km (puisque montant est GENERATED)
      const plafond = Number(saisieRule?.plafond_mensuel) || 0
      if (plafond > 0 && kmEffectifs * tarif > plafond) {
        kmEffectifs = Math.floor((plafond / tarif) * 100) / 100
      }

      const periodeDate = `${periode}-01`
      // frais_km_mois.montant est GENERATED ALWAYS AS (km_parcourus * tarif_applique)
      // STORED en prod → ne JAMAIS l'inclure dans l'INSERT, sinon Postgres
      // renvoie 428C9 / 42601 et l'API répond 400. Le montant est calculé
      // automatiquement par la base. Même règle pour `approuve` : default
      // côté DB (false). Payload strict aux 5 champs requis.
      //
      // SAFETY NET — on construit l'objet de manière ultra-explicite et on
      // delete defensivement toute occurrence de `montant` ou `approuve` qui
      // pourrait avoir été ajoutée par un middleware ou un caller fantôme.
      const insertRow: Record<string, unknown> = {
        employe_id,
        periode: periodeDate,
        km_parcourus: kmEffectifs,
        tarif_applique: tarif,
        justificatif: justificatif || motif || null,
      }
      delete (insertRow as any).montant
      delete (insertRow as any).approuve

      // Log explicite des clés envoyées — facilite le diagnostic Vercel
      // quand on retombe sur une erreur 428C9 / "cannot insert into column".
      console.log('[frais-km saisir] payload keys:', Object.keys(insertRow).join(','), 'periode:', periodeDate)

      const { data, error } = await supabase
        .from('frais_km_mois')
        .upsert(insertRow, { onConflict: 'employe_id,periode' })
        .select()
        .single()

      if (error) {
        console.error('[frais-km saisir] insert error:', {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details,
          payload_keys: Object.keys(insertRow),
        })
        return NextResponse.json({
          error: `Erreur saisie frais km : ${error.message}${error.hint ? ` (${error.hint})` : ''}`,
          code: error.code,
          payload_keys: Object.keys(insertRow),
        }, { status: 500 })
      }
      return NextResponse.json({
        frais_km: data,
        tarif_applique: tarif,
        km_retenus: kmEffectifs,
        montant_calcule: Number(data?.montant) || Math.round(kmEffectifs * tarif * 100) / 100,
      })
    }

    // ── Approve km expense ───────────────────────────────────────────────────
    // Sprint 11 BUG 5 — colonne approuve BOOLEAN (pas statut). approuve_par
    // doit pointer sur employes(id) ou null (schéma permissif : UUID sans FK
    // explicite mais des anciens envs ont la FK vers employes).
    if (action === 'approuver') {
      const { id } = body
      if (!id) {
        return NextResponse.json({ error: 'id requis' }, { status: 400 })
      }

      // Résolution auth_user → employe_id (même pattern que BUG 2)
      let approuveParEmpId: string | null = null
      try {
        const { data: profile } = await supabase
          .from('profiles').select('employe_id').eq('id', user.id).maybeSingle()
        approuveParEmpId = profile?.employe_id || null
      } catch { /* noop */ }

      const { data, error } = await supabase
        .from('frais_km_mois')
        .update({
          approuve: true,
          approuve_par: approuveParEmpId,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[frais-km approuver] update error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ frais_km: data, message: 'Frais kilométriques approuvés' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
