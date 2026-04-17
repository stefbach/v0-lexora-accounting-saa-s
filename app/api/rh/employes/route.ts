import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const search = searchParams.get('search')

    // Build query
    let query = supabase.from('employes').select('*').order('nom')

    if (societe_id) {
      // Filter by specific société
      query = query.eq('societe_id', societe_id)
    } else {
      // Use shared access control that handles all roles (admin, client_admin, comptable, rh, etc.)
      const accessibleIds = await getUserSocieteIds(user.id)
      if (accessibleIds.length > 0) {
        query = query.in('societe_id', accessibleIds)
      }
    }
    // Filter by departure status
    // Par défaut : n'afficher QUE les employés actifs non-partis.
    // Les employés avec actif=false OU date_depart!=null ne doivent
    // PAS apparaître dans les listes opérationnelles (conges, paie,
    // pointage, planning, exports courants). Ils restent visibles via :
    //   - statut=sortis        → UNIQUEMENT les employés partis
    //   - statut=tous / statut=all → les deux (ex. vue RH /rh/employes)
    const statut = searchParams.get('statut')
    if (statut === 'sortis') {
      query = query.not('date_depart', 'is', null)
    } else if (statut === 'tous' || statut === 'all') {
      // Pas de filtre — usage réservé aux vues historiques/admin.
    } else {
      // Default (inclut statut='presents' pour rétrocompat) :
      // actifs=true ET date_depart IS NULL.
      query = query.eq('actif', true).is('date_depart', null)
    }

    if (search) query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,poste.ilike.%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ employes: data, total: data?.length || 0 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  // Logs étape par étape pour tracer les 500 en prod (Vercel Functions logs).
  const step = (label: string, extra?: any) =>
    console.log(`[employes POST] ${label}`, extra !== undefined ? extra : '')
  try {
    step('START')
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    step('auth OK', { userId: user.id })
    const supabase = getAdminClient()

    const body = await request.json()
    step('body parsed', { keys: Object.keys(body), societe_id: body.societe_id, nom: body.nom })
    if (!body.societe_id || !body.nom || !body.prenom || !body.salaire_base)
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

    // Renommer body.role → body.role_rh (colonne réelle employes.role_rh en
    // prod, cf. mig 017_pointage_conges_chat). La colonne "role" existe dans
    // certains envs (mig 015/017_pointeuse) mais pas partout — le renommage
    // évite la 42703 et garantit que le rôle RH est stocké au bon endroit.
    // profiles.role (rôle Lexora auth) est un champ différent géré par
    // /api/admin/create-user-employee, pas ici.
    if (body.role && !body.role_rh) {
      body.role_rh = body.role
    }
    delete body.role

    // Générer code employé
    const { count, error: countErr } = await supabase.from('employes')
      .select('*', { count: 'exact', head: true }).eq('societe_id', body.societe_id)
    if (countErr) {
      console.error('[employes POST] count error:', countErr.message, countErr.code, countErr.details)
      return NextResponse.json({ error: `Erreur comptage employés: ${countErr.message}`, code: countErr.code }, { status: 500 })
    }
    body.code = String((count || 0) + 1).padStart(6, '0')
    step('code generated', { code: body.code })

    // Sprint — INSERT résilient au schéma : si une colonne n'existe pas en
    // prod (mig 040 / 117 non appliquée), on strip la colonne mentionnée
    // dans le message d'erreur et on retry. Permet au formulaire d'envoyer
    // toutes les colonnes nouvelles (phone_allowance, daily_bus_fare,
    // prime_fixe_*, etc.) sans casser la création sur des envs en retard.
    //
    // Pattern identique à l'approche retry 42703 déjà utilisée dans
    // jours-feries et frais-km. On garde un compteur max pour éviter les
    // boucles infinies si l'erreur n'est pas stripp-able.
    let insertBody = { ...body }
    let data: any = null
    let insertError: any = null
    const strippedCols: string[] = []
    for (let attempt = 0; attempt < 10; attempt++) {
      step(`insert attempt ${attempt + 1}`, { cols: Object.keys(insertBody).length })
      const res = await supabase.from('employes').insert(insertBody).select().single()
      if (!res.error) { data = res.data; insertError = null; break }
      insertError = res.error
      console.error('[employes POST] insert error:', {
        attempt: attempt + 1,
        message: res.error.message,
        code: res.error.code,
        hint: res.error.hint,
        details: res.error.details,
      })
      // 42703 = undefined_column — strip la colonne mentionnée et retry
      if (res.error.code === '42703') {
        // Postgres message typique : "column \"phone_allowance\" of relation \"employes\" does not exist"
        const match = res.error.message.match(/column "([^"]+)" of relation/)
          || res.error.message.match(/column ([a-z_]+) does not exist/i)
        const col = match?.[1]
        if (col && col in insertBody) {
          delete insertBody[col]
          strippedCols.push(col)
          continue
        }
      }
      break // autre erreur non récupérable
    }
    if (insertError) {
      return NextResponse.json({
        error: `Erreur création employé: ${insertError.message}${insertError.hint ? ` (${insertError.hint})` : ''}`,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
        stripped_columns: strippedCols,
      }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'INSERT a réussi mais aucune ligne retournée (anomalie)' }, { status: 500 })
    }
    step('insert OK', { id: data.id, code: data.code, stripped: strippedCols })

    // Sprint 3 BUG 2 — Initialiser soldes congés année en cours AVEC les
    // valeurs WRA 2019. Auparavant on insérait juste {employe_id, annee}
    // → al_droit / sl_droit NULL en DB → cassait les rapports SQL et
    // exports analytics. La page /rh/conges recalcule à la volée donc le
    // bug était invisible côté UI.
    //
    // Calcul prorata si embauche en cours d'année :
    //   • mois >= 12 → 22 j AL, 15 j SL (droit plein)
    //   • sinon       → mois × 22/12 (resp. 15/12), arrondi à l'entier
    const dateArrivee = data.date_arrivee ? new Date(String(data.date_arrivee)) : new Date()
    const now = new Date()
    const moisAnciennete = Math.max(0,
      (now.getFullYear() - dateArrivee.getFullYear()) * 12
      + (now.getMonth() - dateArrivee.getMonth())
    )
    const alDroit = moisAnciennete >= 12 ? 22 : Math.max(0, Math.round(moisAnciennete * 22 / 12))
    const slDroit = moisAnciennete >= 12 ? 15 : Math.max(0, Math.round(moisAnciennete * 15 / 12))

    // Sprint — soldes_conges insert en best-effort. Un échec ne doit pas
    // faire 500 la création d'employé (les rapports recalculent à la
    // volée côté /rh/conges). On log et on continue.
    try {
      const { error: soldesErr } = await supabase.from('soldes_conges').insert({
        employe_id: data.id,
        annee: now.getFullYear(),
        al_droit: alDroit,
        al_pris: 0,
        sl_droit: slDroit,
        sl_pris: 0,
      })
      if (soldesErr) {
        console.warn('[employes POST] soldes_conges insert échec (non bloquant):', soldesErr.message, soldesErr.code)
      } else {
        step('soldes_conges OK')
      }
    } catch (e: any) {
      console.warn('[employes POST] soldes_conges exception (non bloquant):', e?.message || e)
    }

    // Sprint 4 TÂCHE 6 — Contrat brouillon auto à l'embauche.
    // Cherche un template dans contrat_templates qui matche le type_contrat
    // de l'employé (CDI, CDD, …). Si trouvé → crée un contrats_employes
    // statut='brouillon'. Si non trouvé → on n'échoue PAS la création de
    // l'employé, on retourne juste un flag no_template pour que l'UI
    // affiche le bon toast.
    //
    // Le template substitution (remplacer {{nom}}, {{date_debut}} etc.
    // dans contenu_html) n'est PAS fait ici — c'est le job de
    // /rh/juridique où le RH peut personnaliser. On copie juste le
    // contenu brut comme point de départ.
    let contratStatus: 'created' | 'no_template' | 'failed' = 'no_template'
    let contratId: string | null = null
    try {
      const typeContrat = String(data.type_contrat || body.type_contrat || 'CDI')
      const { data: template } = await supabase
        .from('contrat_templates')
        .select('id, nom, contenu_html, contenu_markdown')
        .eq('type_contrat', typeContrat)
        .eq('actif', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (template) {
        const { data: contrat, error: contratErr } = await supabase
          .from('contrats_employes')
          .insert({
            employe_id: data.id,
            societe_id: data.societe_id,
            type_contrat: typeContrat,
            secteur: 'general',
            poste: data.poste || null,
            date_debut: data.date_arrivee,
            salaire_brut: Number(data.salaire_base) || null,
            html_content: template.contenu_html || null,
            statut: 'brouillon',
            notes: `Généré automatiquement depuis le template « ${template.nom} » à la création de l'employé. À personnaliser via /rh/juridique.`,
            created_by: user.id,
          })
          .select('id')
          .maybeSingle()
        if (contratErr) {
          console.warn('[employes POST] contrat brouillon échec:', contratErr.message)
          contratStatus = 'failed'
        } else if (contrat) {
          contratStatus = 'created'
          contratId = contrat.id
        }
      }
    } catch (e: any) {
      // Best-effort — on ne bloque jamais la création d'employé pour un
      // problème de contrat
      console.warn('[employes POST] contrat brouillon exception:', e?.message || e)
      contratStatus = 'failed'
    }
    step('DONE', { id: data.id, contrat_status: contratStatus, stripped: strippedCols })

    return NextResponse.json({
      employe: data,
      contrat_status: contratStatus, // 'created' | 'no_template' | 'failed'
      contrat_id: contratId,
      stripped_columns: strippedCols, // info debug : colonnes absentes en prod stripp-ées
    }, { status: 201 })
  } catch (e: unknown) {
    console.error('[employes POST] UNCAUGHT:', e)
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Erreur',
      stack: e instanceof Error ? e.stack?.split('\n').slice(0, 5).join('\n') : undefined,
    }, { status: 500 })
  }
}
