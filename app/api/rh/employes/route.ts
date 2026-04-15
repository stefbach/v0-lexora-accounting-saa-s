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
    const actifs = searchParams.get('actifs') !== 'false'

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
    const statut = searchParams.get('statut')
    if (statut === 'presents') {
      query = query.is('date_depart', null)
    } else if (statut === 'sortis') {
      query = query.not('date_depart', 'is', null)
    }
    // Legacy: if actifs param is used (backwards compat)
    else if (actifs) {
      // Don't filter — show all by default for backwards compat
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
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const supabase = getAdminClient()

    const body = await request.json()
    if (!body.societe_id || !body.nom || !body.prenom || !body.salaire_base)
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })

    // Générer code employé
    const { count } = await supabase.from('employes').select('*', { count: 'exact', head: true }).eq('societe_id', body.societe_id)
    body.code = String((count || 0) + 1).padStart(6, '0')

    const { data, error } = await supabase.from('employes').insert(body).select().single()
    if (error) throw error

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

    await supabase.from('soldes_conges').insert({
      employe_id: data.id,
      annee: now.getFullYear(),
      al_droit: alDroit,
      al_pris: 0,
      sl_droit: slDroit,
      sl_pris: 0,
    })

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

    return NextResponse.json({
      employe: data,
      contrat_status: contratStatus, // 'created' | 'no_template' | 'failed'
      contrat_id: contratId,
    }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
