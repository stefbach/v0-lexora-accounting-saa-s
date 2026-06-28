"use client"
/**
 * MonEspacePersonnel — Composant partagé qui résume l'espace salarié
 * de l'utilisateur courant (s'il a une fiche employé liée).
 *
 * Affiché dans :
 *   • /rh/page.tsx                 — section « Mon espace personnel »
 *   • /manager/page.tsx (à venir)
 *   • /client/assistant/page.tsx (à venir)
 *
 * Pas affiché si :
 *   • L'utilisateur n'a pas de fiche employé liée
 *   • L'utilisateur est comptable type='externe' ou 'dedie'
 *     (ces deux cas n'ont pas vocation à utiliser MonEspace)
 *
 * Quatre cards : pointage du jour, congés, planning, dernier bulletin.
 * Chaque card est cliquable et redirige vers le détail dans /salarie.
 *
 * Ce composant ne gère AUCUNE mutation — read-only summary.
 * Pour les actions (pointer, demander un congé, télécharger PDF), il
 * redirige vers /salarie qui contient l'expérience complète.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, Calendar, CalendarDays, FileText, ArrowRight, User } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Employe {
  id: string
  nom?: string
  prenom?: string
  poste?: string
  societe_id?: string
}

interface PointageToday {
  heure_entree?: string | null
  heure_sortie?: string | null
  heure_pause_debut?: string | null
  heure_pause_fin?: string | null
  date_pointage?: string
}

interface CongeBalance {
  type_conge: string
  solde_restant: number
  solde_total: number
}

interface PlanningEntry {
  jour?: number
  shift?: string
  heure_debut?: string
  heure_fin?: string
  est_repos?: boolean
}

interface Bulletin {
  id: string
  periode: string
  salaire_net?: number
  statut?: string
}

function fmtTime(s: string | null | undefined): string {
  return s ? String(s).slice(0, 5) : '—'
}

function fmtMontant(n: number | null | undefined): string {
  return n ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) : '—'
}

function fmtPeriode(p: string | null | undefined): string {
  if (!p) return '—'
  // YYYY-MM-DD ou YYYY-MM → MM/YYYY
  const parts = p.slice(0, 7).split('-')
  return parts.length === 2 ? `${parts[1]}/${parts[0]}` : p
}

export default function MonEspacePersonnel() {
  const locale = getLocale()
  const [loading, setLoading] = useState(true)
  const [employe, setEmploye] = useState<Employe | null>(null)
  const [pointage, setPointage] = useState<PointageToday | null>(null)
  const [balances, setBalances] = useState<CongeBalance[]>([])
  const [shiftToday, setShiftToday] = useState<PlanningEntry | null>(null)
  const [lastBulletin, setLastBulletin] = useState<Bulletin | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        // 1. Fiche employé liée — sinon, on n'affiche rien
        const meRes = await fetch('/api/rh/employes/me').then(r => r.json()).catch(() => ({}))
        const emp = meRes?.employe as Employe | null
        if (!emp) { if (!cancelled) { setEmploye(null); setLoading(false) } ; return }
        if (cancelled) return
        setEmploye(emp)

        // 2. Données enrichies — best-effort, n'affiche que ce qui charge
        const today = new Date().toISOString().slice(0, 10)
        const periode = today.slice(0, 7)
        const [ptRes, balRes, plRes, bulRes] = await Promise.all([
          fetch(`/api/rh/pointage?date=${today}&employe_id=${emp.id}`).then(r => r.json()).catch(() => null),
          fetch(`/api/rh/conges?action=balances&employe_id=${emp.id}`).then(r => r.json()).catch(() => null),
          fetch(`/api/rh/planning?periode=${periode}&societe_id=${emp.societe_id}&employe_id=${emp.id}`).then(r => r.json()).catch(() => null),
          fetch(`/api/rh/paie?action=list&employe_id=${emp.id}`).then(r => r.json()).catch(() => null),
        ])
        if (cancelled) return

        setPointage(ptRes?.pointages?.[0] || null)
        setBalances(balRes?.balances || [])
        const todayDay = new Date().getDate()
        const todayShift = (plRes?.planning || []).find((p: any) => p.jour === todayDay && !p.est_repos) || null
        setShiftToday(todayShift)
        setLastBulletin((bulRes?.bulletins || [])[0] || null)
      } catch {
        // best-effort — pas de toast pour ne pas polluer le dashboard
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <Card className="rounded-2xl border-l-4 border-l-amber-500">
        <CardContent className="p-6 flex items-center gap-3 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('srh.espace.loading', locale)}</span>
        </CardContent>
      </Card>
    )
  }

  // Pas de fiche employé → composant masqué (cas comptable externe / dédié,
  // admin sans fiche, etc.). Le parent n'affiche rien.
  if (!employe) return null

  const alBalance = balances.find(b => b.type_conge === 'AL')
  const slBalance = balances.find(b => b.type_conge === 'SL')

  return (
    <Card className="rounded-2xl border-l-4 border-l-amber-500">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2" style={{ color: NAVY }}>
          <User className="h-5 w-5" style={{ color: GOLD }} />
          Mon espace personnel
          <span className="text-sm font-normal text-gray-500 ml-2">
            — {employe.prenom} {employe.nom}{employe.poste ? ` · ${employe.poste}` : ''}
          </span>
          <Link
            href="/salarie"
            className="ml-auto text-xs font-medium text-gray-600 hover:text-[#0B0F2E] flex items-center gap-1"
          >
            Ouvrir mon espace <ArrowRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Pointage du jour */}
          <Link href="/salarie" className="group">
            <div className="border rounded-lg p-3 hover:border-emerald-400 hover:shadow-sm transition-all h-full">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-gray-700">Pointage du jour</span>
              </div>
              <div className="text-xs text-gray-600 space-y-0.5">
                <p>Entrée : <b className="text-gray-900">{fmtTime(pointage?.heure_entree)}</b></p>
                <p>Sortie : <b className="text-gray-900">{fmtTime(pointage?.heure_sortie)}</b></p>
                {pointage?.heure_pause_debut && (
                  <p className="text-[10px] text-gray-500">Pause {fmtTime(pointage.heure_pause_debut)}–{fmtTime(pointage.heure_pause_fin)}</p>
                )}
              </div>
            </div>
          </Link>

          {/* 2. Mes congés */}
          <Link href="/salarie" className="group">
            <div className="border rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition-all h-full">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold text-gray-700">Mes congés</span>
              </div>
              <div className="text-xs text-gray-600 space-y-0.5">
                <p>AL restants : <b className="text-gray-900">{alBalance ? `${alBalance.solde_restant}/${alBalance.solde_total}` : '—'}</b></p>
                <p>SL restants : <b className="text-gray-900">{slBalance ? `${slBalance.solde_restant}/${slBalance.solde_total}` : '—'}</b></p>
                <p className="text-[10px] text-gray-500 mt-1">Cliquez pour faire une demande →</p>
              </div>
            </div>
          </Link>

          {/* 3. Mon planning */}
          <Link href="/salarie" className="group">
            <div className="border rounded-lg p-3 hover:border-violet-400 hover:shadow-sm transition-all h-full">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-semibold text-gray-700">Mon shift aujourd'hui</span>
              </div>
              {shiftToday ? (
                <div className="text-xs text-gray-600">
                  <p><b className="text-gray-900">{shiftToday.shift || 'Travail'}</b></p>
                  <p className="text-[11px]">{fmtTime(shiftToday.heure_debut)} → {fmtTime(shiftToday.heure_fin)}</p>
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic">Pas de shift planifié</div>
              )}
            </div>
          </Link>

          {/* 4. Dernier bulletin */}
          <Link href="/salarie" className="group">
            <div className="border rounded-lg p-3 hover:border-amber-400 hover:shadow-sm transition-all h-full">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-gray-700">Dernier bulletin</span>
              </div>
              {lastBulletin ? (
                <div className="text-xs text-gray-600">
                  <p>Période <b className="text-gray-900">{fmtPeriode(lastBulletin.periode)}</b></p>
                  <p>Net <b className="text-gray-900">{fmtMontant(lastBulletin.salaire_net)} MUR</b></p>
                  {lastBulletin.statut && (
                    <Badge variant="outline" className="text-[10px] mt-1">{lastBulletin.statut}</Badge>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic">{t('srh.espace.no_payslip', locale)}</div>
              )}
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
