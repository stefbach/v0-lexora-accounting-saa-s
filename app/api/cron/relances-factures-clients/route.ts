import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { envoyerNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ---------------------------------------------------------------------------
// Templates de relance (stockés en dur — à externaliser en Wave 2 dans une
// table `relances_templates`).
// Placeholders supportés : {numero}, {date_echeance}, {montant}, {devise}, {tiers}
// ---------------------------------------------------------------------------
type NiveauRelance = 0 | 1 | 2 | 3

interface TemplateRelance {
  niveau: NiveauRelance
  libelle: string
  titre: (f: FactureRow) => string
  message: (f: FactureRow) => string
  canaux: ('app' | 'email' | 'whatsapp')[]
}

interface FactureRow {
  id: string
  societe_id: string
  numero_facture: string | null
  tiers: string | null
  date_echeance: string
  montant_ttc: number | null
  devise: string | null
}

function formatFr(d: string | null | undefined): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Indian/Mauritius' })
  } catch {
    return d
  }
}

function fmtMontant(f: FactureRow): string {
  const m = Number(f.montant_ttc ?? 0)
  return `${m.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${f.devise || 'MUR'}`
}

const TEMPLATES: Record<NiveauRelance, TemplateRelance> = {
  0: {
    niveau: 0,
    libelle: 'rappel_amical',
    titre: (f) => `Rappel amical — Facture ${f.numero_facture || f.id.slice(0, 8)}`,
    message: (f) =>
      `Votre facture ${f.numero_facture || ''} arrive à échéance le ${formatFr(f.date_echeance)} (${fmtMontant(f)}).`,
    canaux: ['app', 'email'],
  },
  1: {
    niveau: 1,
    libelle: 'premiere_relance',
    titre: (f) => `Première relance — Facture ${f.numero_facture || f.id.slice(0, 8)}`,
    message: (f) =>
      `Rappel : facture ${f.numero_facture || ''} en retard de 7 jours. Merci de régulariser.`,
    canaux: ['app', 'email'],
  },
  2: {
    niveau: 2,
    libelle: 'seconde_relance',
    titre: (f) => `Seconde relance — Facture ${f.numero_facture || f.id.slice(0, 8)}`,
    message: (f) =>
      `2ème relance : facture ${f.numero_facture || ''} en retard de 15 jours.`,
    canaux: ['app', 'email', 'whatsapp'],
  },
  3: {
    niveau: 3,
    libelle: 'mise_en_demeure',
    titre: (f) => `Mise en demeure — Facture ${f.numero_facture || f.id.slice(0, 8)}`,
    message: (f) =>
      `Mise en demeure : facture ${f.numero_facture || ''} en retard de 30 jours. Un contentieux sera engagé sans règlement sous 8 jours.`,
    canaux: ['app', 'email', 'whatsapp'],
  },
}

// Détermine le niveau de relance à déclencher en fonction de l'écart entre
// aujourd'hui et la date d'échéance. Retourne null si aucune relance à faire
// aujourd'hui (hors fenêtre J-7, J+7, J+15, J+30 ± 0j).
function determinerNiveau(dateEcheanceIso: string, nowIso: string): NiveauRelance | null {
  const ech = new Date(dateEcheanceIso + 'T00:00:00Z').getTime()
  const now = new Date(nowIso).getTime()
  const diffDays = Math.floor((now - ech) / (1000 * 60 * 60 * 24))

  // Plages pour absorber les décalages horaires / exécutions tardives
  if (diffDays >= -8 && diffDays <= -6) return 0   // J-7 ±1j (rappel amical)
  if (diffDays >= 6 && diffDays <= 8) return 1     // J+7 ±1j
  if (diffDays >= 14 && diffDays <= 16) return 2   // J+15 ±1j
  if (diffDays >= 29 && diffDays <= 31) return 3   // J+30 ±1j
  return null
}

// Cron quotidien (09:00) — Relances automatiques factures clients impayées
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'relances-factures-clients'
  const nowIso = new Date().toISOString()

  try {
    console.log('[relances-factures-clients] start', { at: nowIso })

    // 1. Récupérer les sociétés (filtrer sur statut='actif' si la colonne existe)
    let societesQuery = supabase.from('societes').select('id, nom, client_id, comptable_id, statut')
    const { data: societesRaw, error: societesError } = await societesQuery
    if (societesError) throw societesError

    const societes = (societesRaw || []).filter(
      (s: any) => s.statut == null || s.statut === 'actif' || s.statut === 'active'
    )

    let processed = 0
    let relancesEnvoyees = 0
    const erreurs: Array<{ facture_id: string; message: string }> = []

    for (const societe of societes) {
      // 2. Récupérer factures clients non soldées, avec échéance
      const { data: factures, error: facturesError } = await supabase
        .from('factures')
        .select('id, societe_id, numero_facture, tiers, date_echeance, montant_ttc, devise, statut')
        .eq('societe_id', societe.id)
        .eq('type_facture', 'client')
        .not('date_echeance', 'is', null)
        .not('statut', 'in', '(paye,annulee,comptabilisee,annule)')

      if (facturesError) {
        console.log('[relances-factures-clients] factures fetch error', {
          societe_id: societe.id,
          error: facturesError.message,
        })
        continue
      }

      for (const f of (factures || []) as FactureRow[]) {
        processed++

        if (!f.date_echeance) continue

        const niveau = determinerNiveau(f.date_echeance, nowIso)
        if (niveau === null) continue

        const tpl = TEMPLATES[niveau]

        try {
          // 3. Vérifier idempotence : relance déjà envoyée pour ce niveau ?
          const { data: existing } = await supabase
            .from('relances_factures')
            .select('id')
            .eq('facture_id', f.id)
            .eq('niveau', niveau)
            .maybeSingle()

          if (existing) continue

          // 4. INSERT avec gestion du conflit (unique facture_id + niveau)
          const canal = tpl.canaux.join(',')
          const { error: insertErr } = await supabase.from('relances_factures').insert({
            facture_id: f.id,
            niveau,
            canal,
            template: tpl.libelle,
            sent_at: nowIso,
            statut: 'envoye_simule',
          })

          if (insertErr) {
            // Si c'est un conflit d'unicité (déjà envoyé en race), on skip silencieusement
            if (insertErr.code === '23505') continue
            throw insertErr
          }

          // 5. Notifier le client (si on connait son id)
          if (societe.client_id) {
            await envoyerNotification({
              destinataire_id: societe.client_id,
              destinataire_type: 'client',
              societe_id: societe.id,
              type: 'relance_facture',
              titre: tpl.titre(f),
              message: tpl.message(f),
              niveau: niveau >= 2 ? 'critique' : niveau === 1 ? 'important' : 'info',
              canaux: tpl.canaux,
              cron_name: cronName,
            })
          }

          // 6. Copie au comptable pour suivi (canal app uniquement)
          if (societe.comptable_id) {
            await envoyerNotification({
              destinataire_id: societe.comptable_id,
              destinataire_type: 'comptable',
              societe_id: societe.id,
              type: 'relance_facture',
              titre: `${tpl.titre(f)} — ${societe.nom}`,
              message: `Relance niveau ${niveau} (${tpl.libelle}) envoyée pour facture ${f.numero_facture || f.id.slice(0, 8)} (${f.tiers || 'client'}).`,
              niveau: 'info',
              canaux: ['app'],
              cron_name: cronName,
            })
          }

          relancesEnvoyees++
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Erreur inconnue'
          console.log('[relances-factures-clients] facture error', {
            facture_id: f.id,
            niveau,
            error: msg,
          })
          erreurs.push({ facture_id: f.id, message: msg })
        }
      }
    }

    // 7. Log cron_logs (structure tolérante — cf. pattern alerte-csg-mensuelle)
    try {
      await supabase.from('cron_logs').insert({
        cron_name: cronName,
        statut: 'success',
        details: {
          societes_traitees: societes.length,
          factures_analysees: processed,
          relances_envoyees: relancesEnvoyees,
          erreurs_count: erreurs.length,
        },
        executed_at: nowIso,
      })
    } catch (logErr) {
      console.log('[relances-factures-clients] cron_logs insert failed', {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }

    console.log('[relances-factures-clients] done', {
      societes: societes.length,
      processed,
      relancesEnvoyees,
      erreurs: erreurs.length,
    })

    return NextResponse.json({
      ok: true,
      timestamp: nowIso,
      processed,
      relances_envoyees: relancesEnvoyees,
      erreurs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.log('[relances-factures-clients] fatal', { error: message })

    try {
      await supabase.from('cron_logs').insert({
        cron_name: cronName,
        statut: 'error',
        details: { error: message },
        executed_at: nowIso,
      })
    } catch {
      // swallow
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
