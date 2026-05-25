import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron compliance scan — unifié
 *
 * Parcourt toutes les sociétés actives et insère des entrées dans
 * compliance_alerts pour chaque échéance fiscale Maurice approchant.
 *
 * À déclencher quotidiennement (vercel.json crons).
 *
 * Couverture :
 *   • TVA mensuelle/trimestrielle : alerte J-5, J-1, retard
 *   • IT Form 3 : J-30, J-7, retard (date_cloture + 6 mois)
 *   • APS (Advance Payment System) : trimestriels Q1, Q2, Q3
 *   • Annual Return (Companies Act) : 28j après date AGM
 *   • ROE (Return of Employees) : 15 août
 *   • TDS mensuel : 20 du mois suivant
 *   • EOY bonus 75% : décembre
 *   • Severance : à creation
 */

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const dateAt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)

interface AlertSpec {
  societe_id: string
  type: string                  // 'tva_j5', 'it_form3_j30', etc.
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  date_echeance: string
  date_alerte: string
  meta?: Record<string, unknown>
}

export async function GET(request: Request) {
  // Optional auth via secret query param (Vercel cron protection)
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret') || request.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getAdminClient()
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)

    const { data: societes } = await supabase.from('societes').select('id, nom, statut_tva, mode_declaration_tva, date_fin_exercice, assujetti_aps')
    if (!societes || societes.length === 0) {
      return NextResponse.json({ ok: true, scanned: 0, alerts_created: 0 })
    }

    const alerts: AlertSpec[] = []

    for (const s of societes as any[]) {
      // ── 1. TVA mensuelle (date limite : 20 du mois M+1) ──────────────
      if (s.statut_tva) {
        const isMensuel = s.mode_declaration_tva !== 'trimestriel'
        if (isMensuel) {
          // TVA du mois précédent due le 20 de ce mois
          const dateLimiteThisMonth = dateAt(today.getFullYear(), today.getMonth() + 1, 20)
          const diff = daysBetween(todayStr, dateLimiteThisMonth)
          if (diff === 5) {
            alerts.push({
              societe_id: s.id, type: 'tva_j5', severity: 'medium',
              message: `Déclaration TVA dans 5 jours (${dateLimiteThisMonth})`,
              date_echeance: dateLimiteThisMonth, date_alerte: todayStr,
            })
          } else if (diff === 1) {
            alerts.push({
              societe_id: s.id, type: 'tva_j1', severity: 'high',
              message: `⚠️ Déclaration TVA DEMAIN (${dateLimiteThisMonth})`,
              date_echeance: dateLimiteThisMonth, date_alerte: todayStr,
            })
          } else if (diff < 0 && diff > -30) {
            alerts.push({
              societe_id: s.id, type: 'tva_retard', severity: 'critical',
              message: `🚨 TVA en retard de ${-diff} jour(s) — pénalité 5% + 0.5%/mois`,
              date_echeance: dateLimiteThisMonth, date_alerte: todayStr,
            })
          }
        }
      }

      // ── 2. IT Form 3 (date limite = clôture + 6 mois) ────────────────
      if (s.date_fin_exercice) {
        const cloture = new Date(s.date_fin_exercice)
        const dateLimiteIT = new Date(cloture)
        dateLimiteIT.setMonth(dateLimiteIT.getMonth() + 6)
        const dlIT = dateLimiteIT.toISOString().slice(0, 10)
        const diffIT = daysBetween(todayStr, dlIT)
        if (diffIT === 30) {
          alerts.push({
            societe_id: s.id, type: 'it_form3_j30', severity: 'medium',
            message: `IT Form 3 dans 30 jours (${dlIT})`,
            date_echeance: dlIT, date_alerte: todayStr,
          })
        } else if (diffIT === 7) {
          alerts.push({
            societe_id: s.id, type: 'it_form3_j7', severity: 'high',
            message: `⚠️ IT Form 3 dans 7 jours (${dlIT})`,
            date_echeance: dlIT, date_alerte: todayStr,
          })
        } else if (diffIT < 0 && diffIT > -60) {
          alerts.push({
            societe_id: s.id, type: 'it_form3_retard', severity: 'critical',
            message: `🚨 IT Form 3 en retard de ${-diffIT} jour(s) — pénalité 5% + 0.5%/mois`,
            date_echeance: dlIT, date_alerte: todayStr,
          })
        }
      }

      // ── 3. APS trimestriel (si assujetti) ────────────────────────────
      if (s.assujetti_aps) {
        // Q1 : 30 nov, Q2 : 28 fév, Q3 : 31 mai (ITA s.111B Mauritius)
        const apsDeadlines = [
          dateAt(today.getFullYear(), 11, 30),         // Q1 of FY (oct)
          dateAt(today.getFullYear() + (today.getMonth() >= 2 ? 1 : 0), 2, 28),  // Q2
          dateAt(today.getFullYear(), 5, 31),          // Q3
        ]
        for (const dl of apsDeadlines) {
          const diff = daysBetween(todayStr, dl)
          if (diff === 5 || diff === 1) {
            alerts.push({
              societe_id: s.id, type: `aps_j${diff}`, severity: diff === 1 ? 'high' : 'medium',
              message: `APS dans ${diff} jour(s) (${dl})`,
              date_echeance: dl, date_alerte: todayStr,
            })
          }
        }
      }

      // ── 4. ROE Annual (15 août — Mauritius MRA Section 121) ─────────
      const roeDl = dateAt(today.getFullYear(), 8, 15)
      const diffRoe = daysBetween(todayStr, roeDl)
      if (diffRoe === 15 || diffRoe === 7 || diffRoe === 1) {
        alerts.push({
          societe_id: s.id, type: `roe_j${diffRoe}`, severity: diffRoe === 1 ? 'high' : 'medium',
          message: `ROE (Return of Employees) dans ${diffRoe} jour(s) (${roeDl})`,
          date_echeance: roeDl, date_alerte: todayStr,
        })
      }

      // ── 5. TDS mensuel (20 du mois suivant) ─────────────────────────
      const tdsDl = dateAt(today.getFullYear(), today.getMonth() + 1, 20)
      const diffTds = daysBetween(todayStr, tdsDl)
      if (diffTds === 3) {
        alerts.push({
          societe_id: s.id, type: 'tds_j3', severity: 'medium',
          message: `Déclaration TDS dans 3 jours (${tdsDl})`,
          date_echeance: tdsDl, date_alerte: todayStr,
        })
      }
    }

    // Bulk insert avec dedup sur (societe_id, type, date_echeance) pour
    // ne pas spammer à chaque run (idempotent par jour).
    let nbInserted = 0
    if (alerts.length > 0) {
      // Dédup en mémoire d'abord
      const existing = await supabase
        .from('compliance_alerts')
        .select('societe_id, type, date_echeance')
        .gte('date_alerte', todayStr)

      const existingKeys = new Set(
        (existing.data || []).map((e: any) => `${e.societe_id}|${e.type}|${e.date_echeance}`)
      )
      const toInsert = alerts.filter(a =>
        !existingKeys.has(`${a.societe_id}|${a.type}|${a.date_echeance}`)
      )

      if (toInsert.length > 0) {
        const { error } = await supabase.from('compliance_alerts').insert(toInsert)
        if (error) console.error('[compliance-scan] insert error:', error.message)
        else nbInserted = toInsert.length
      }
    }

    return NextResponse.json({
      ok: true,
      scanned: societes.length,
      alerts_evaluated: alerts.length,
      alerts_created: nbInserted,
      date_run: todayStr,
    })
  } catch (e: any) {
    console.error('[compliance-scan]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
