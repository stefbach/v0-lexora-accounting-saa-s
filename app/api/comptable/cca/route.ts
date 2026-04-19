/**
 * API Comptes Courants Associés — côté comptable
 *
 * Ce handler ré-utilise la logique métier de
 * `/api/comptable/compte-courant` mais ajoute :
 *   - vérification du rôle (comptable / comptable_dedie / admin / super_admin /
 *     client_admin)
 *   - contrôle multi-tenant via `assertSocieteAccess`
 *   - suggestion d'écriture comptable (non persistée)
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'comptable',
  'comptable_dedie',
  'admin',
  'super_admin',
  'client_admin',
]

type CcaRow = {
  id: string
  societe_id: string
  nom: string
  type: string
  solde: number | string | null
  updated_at: string | null
  created_at: string | null
}

type MouvementRow = {
  id: string
  compte_courant_id: string
  societe_id: string
  date_mouvement: string
  type: string
  montant: number | string
  description: string | null
  facture_id: string | null
  lettre: string | null
  created_at: string | null
}

async function requireUserWithRole() {
  const supabaseAuth = await createServerClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const admin = getAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = (profile?.role as string) ?? ''
  if (!ALLOWED_ROLES.includes(role)) {
    return { error: NextResponse.json({ error: 'Rôle non autorisé' }, { status: 403 }) }
  }
  return { user, admin, role }
}

function suggestionEcriture(params: {
  type: 'avance' | 'remboursement'
  cca: CcaRow
  montant: number
  description?: string | null
}) {
  const { type, cca, montant, description } = params
  const compteTiers = cca.type === 'associe' ? '455001' : '467001'
  if (type === 'avance') {
    // L'associé a avancé du cash : la société doit à l'associé
    // Débit 6xx (charge) / Crédit 455
    return {
      debit: '6',
      credit: compteTiers,
      montant,
      libelle: `Avance ${cca.nom}${description ? ' — ' + description : ''}`,
    }
  }
  // remboursement : la société rend l'argent via banque
  // Débit 455 / Crédit 512
  return {
    debit: compteTiers,
    credit: '512100',
    montant,
    libelle: `Remboursement ${cca.nom}${description ? ' — ' + description : ''}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET : liste des CCA + soldes + alertes légales
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const ctx = await requireUserWithRole()
    if ('error' in ctx) return ctx.error
    const { user, admin } = ctx

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (err) {
      const mapped = mapSocieteAccessError(err)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw err
    }

    const { data: comptes, error: comptesErr } = await admin
      .from('comptes_courants_associes')
      .select('*')
      .eq('societe_id', societe_id)
      .order('nom', { ascending: true })
    if (comptesErr) throw comptesErr

    const { data: mouvements, error: mvErr } = await admin
      .from('mouvements_compte_courant')
      .select('*')
      .eq('societe_id', societe_id)
      .order('date_mouvement', { ascending: false })
      .limit(100)
    if (mvErr) throw mvErr

    const comptesList = (comptes ?? []) as CcaRow[]
    const mouvementsList = (mouvements ?? []) as MouvementRow[]

    // KPIs
    const totalCrediteur = comptesList
      .filter((c) => Number(c.solde) > 0)
      .reduce((s, c) => s + Number(c.solde), 0)
    const totalDebiteur = comptesList
      .filter((c) => Number(c.solde) < 0)
      .reduce((s, c) => s + Number(c.solde), 0)
    const totalSolde = comptesList.reduce((s, c) => s + Number(c.solde ?? 0), 0)

    // Alertes légales — Companies Act Mauritius
    const debiteurs = comptesList.filter(
      (c) => Number(c.solde) < 0 && c.type === 'associe',
    )
    const legal_alerts = debiteurs.map((c) => ({
      compte_id: c.id,
      nom: c.nom,
      solde: Number(c.solde),
      message: `Convention de prêt obligatoire (Companies Act 2001) — ${c.nom} doit ${Math.abs(
        Number(c.solde),
      ).toFixed(2)} MUR à la société. Sans convention signée, risque de requalification fiscale.`,
    }))

    // Nombre de mouvements par compte
    const mouvCountByCca: Record<string, number> = {}
    for (const m of mouvementsList) {
      mouvCountByCca[m.compte_courant_id] = (mouvCountByCca[m.compte_courant_id] ?? 0) + 1
    }

    const comptesEnriched = comptesList.map((c) => ({
      ...c,
      nb_mouvements: mouvCountByCca[c.id] ?? 0,
      dernier_mouvement:
        mouvementsList.find((m) => m.compte_courant_id === c.id)?.date_mouvement ?? null,
    }))

    return NextResponse.json({
      comptes: comptesEnriched,
      mouvements: mouvementsList,
      kpis: {
        nb_ccas_actifs: comptesList.length,
        total_crediteur: totalCrediteur,
        total_debiteur: totalDebiteur,
        total_solde: totalSolde,
        nb_alertes: legal_alerts.length,
      },
      legal_alerts,
    })
  } catch (e: unknown) {
    console.error('[comptable/cca GET]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST : actions
//   - action === 'creer_compte'   : créer un CCA
//   - action === 'avance'         : saisir une avance
//   - action === 'remboursement'  : saisir un remboursement
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const ctx = await requireUserWithRole()
    if ('error' in ctx) return ctx.error
    const { user, admin } = ctx

    const body = await request.json()
    const { action, societe_id } = body ?? {}
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (err) {
      const mapped = mapSocieteAccessError(err)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw err
    }

    // === CRÉATION D'UN CCA ===
    if (action === 'creer_compte') {
      const { nom, type = 'associe' } = body
      if (!nom) return NextResponse.json({ error: 'nom requis' }, { status: 400 })
      if (!['associe', 'collaborateur'].includes(type)) {
        return NextResponse.json({ error: 'type invalide' }, { status: 400 })
      }
      const { data, error } = await admin
        .from('comptes_courants_associes')
        .insert({ societe_id, nom, type, solde: 0 })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ compte: data }, { status: 201 })
    }

    // === AVANCE ou REMBOURSEMENT ===
    if (action === 'avance' || action === 'remboursement') {
      const { compte_courant_id, montant, description, facture_id, date_mouvement } = body
      if (!compte_courant_id || !montant) {
        return NextResponse.json(
          { error: 'compte_courant_id et montant requis' },
          { status: 400 },
        )
      }
      const montantNum = Number(montant)
      if (!Number.isFinite(montantNum) || montantNum <= 0) {
        return NextResponse.json({ error: 'montant doit être > 0' }, { status: 400 })
      }
      const today = new Date().toISOString().split('T')[0]
      const dateMvt = (date_mouvement as string) || today
      if (dateMvt > today) {
        return NextResponse.json({ error: 'date_mouvement ne peut pas être future' }, { status: 400 })
      }

      const { data: cca } = await admin
        .from('comptes_courants_associes')
        .select('*')
        .eq('id', compte_courant_id)
        .eq('societe_id', societe_id)
        .maybeSingle()
      if (!cca) {
        return NextResponse.json({ error: 'CCA introuvable' }, { status: 404 })
      }
      const ccaTyped = cca as CcaRow

      const signedMontant = action === 'avance' ? montantNum : -montantNum
      const { data: mouvement, error: mvErr } = await admin
        .from('mouvements_compte_courant')
        .insert({
          compte_courant_id,
          societe_id,
          date_mouvement: dateMvt,
          type: action,
          montant: signedMontant,
          description: description ?? null,
          facture_id: facture_id || null,
        })
        .select()
        .single()
      if (mvErr) throw mvErr

      const newSolde = Number(ccaTyped.solde ?? 0) + signedMontant
      await admin
        .from('comptes_courants_associes')
        .update({ solde: newSolde, updated_at: new Date().toISOString() })
        .eq('id', compte_courant_id)

      return NextResponse.json({
        mouvement,
        newSolde,
        ecriture_suggestion: suggestionEcriture({
          type: action,
          cca: ccaTyped,
          montant: montantNum,
          description,
        }),
      })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    console.error('[comptable/cca POST]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH : mise à jour d'un CCA (nom, type)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const ctx = await requireUserWithRole()
    if ('error' in ctx) return ctx.error
    const { user, admin } = ctx

    const body = await request.json()
    const { cca_id, societe_id, nom, type } = body ?? {}
    if (!cca_id || !societe_id) {
      return NextResponse.json({ error: 'cca_id et societe_id requis' }, { status: 400 })
    }
    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (err) {
      const mapped = mapSocieteAccessError(err)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw err
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (nom) patch.nom = nom
    if (type && ['associe', 'collaborateur'].includes(type)) patch.type = type

    const { data, error } = await admin
      .from('comptes_courants_associes')
      .update(patch)
      .eq('id', cca_id)
      .eq('societe_id', societe_id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ compte: data })
  } catch (e: unknown) {
    console.error('[comptable/cca PATCH]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
