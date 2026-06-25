"use client"
import type { useRouter } from "next/navigation"
import { getUpcomingHolidays } from "@/lib/rh/mauritius-holidays"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Bell, CreditCard, Calendar, CalendarPlus, Coffee, FileText, HeartPulse, LogIn, LogOut } from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN, MONTH_NAMES_FR } from "../shared/constants"
import { fmt, lastDayOfMonth } from "../shared/helpers"
import {
  EligibiliteBadge,
  VacationLeaveCard,
  formatPeriodeFR,
  formatDateFR,
  computeDatePlus6Months,
  type EligibilityStatus,
  type VlEligibilityStatus,
} from "../shared/conges-eligibilite"
import { useEffect, useState } from "react"

type Router = ReturnType<typeof useRouter>

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel : seul changement, on passe en props ce qui était
// state du parent.
export function DashboardTab({
  bulletins, conges, pointageToday, annonces, feedback, punching,
  doPunch, router,
}: {
  bulletins: any[]
  conges: any
  pointageToday: any
  annonces: any[]
  feedback: string
  punching: boolean
  doPunch: (type: string) => void
  router: Router
}) {
  const lastBulletin = bulletins.length > 0 ? bulletins[0] : null
  const estimatedNet = lastBulletin?.salaire_net || 0
  const estimatedBase = lastBulletin?.salaire_base || 0
  const estimatedBrut = lastBulletin?.salaire_brut || 0

  // F5 — Soldes congés : source de vérité = API /api/rh/conges?action=balances
  // qui lit soldes_conges. PAS de fallback silencieux `|| 22` / `|| 15` :
  // si la row n'existe pas, on affiche un état d'erreur explicite.
  const soldesMissing = !conges
    || conges._missing_solde === true
    || conges.al_droit == null
    || conges.al_pris == null
    || conges.al_solde == null
    || conges.sl_droit == null
    || conges.sl_pris == null
    || conges.sl_solde == null

  const alTotal = soldesMissing ? 0 : Number(conges.al_droit)
  const slTotal = soldesMissing ? 0 : Number(conges.sl_droit)
  const alPris = soldesMissing ? 0 : Number(conges.al_pris)
  const slPris = soldesMissing ? 0 : Number(conges.sl_pris)
  const alRemaining = soldesMissing ? 0 : Number(conges.al_solde)
  const slRemaining = soldesMissing ? 0 : Number(conges.sl_solde)
  const alPct = alTotal > 0 ? Math.round((alRemaining / alTotal) * 100) : 0
  const slPct = slTotal > 0 ? Math.round((slRemaining / slTotal) * 100) : 0

  // B.2 — Période anniversaire + statut d'éligibilité (API B.1)
  const eligibilityStatus: EligibilityStatus = (conges?.eligibility_status as EligibilityStatus) || "eligible"
  const periodeLabel = formatPeriodeFR(conges?.periode_debut, conges?.periode_fin)
  const notEligibleMessage = eligibilityStatus === "not_eligible"
    ? `Éligibilité le ${formatDateFR(computeDatePlus6Months(conges?.date_arrivee))} (6 mois d'ancienneté)`
    : null

  // PO1 — résumé sessions du jour (timeline + session en cours pour
  // activer/désactiver les bons boutons). Rafraîchi après chaque punch.
  const [sessionsData, setSessionsData] = useState<{
    sessions: any[]
    total_travail_minutes: number
    total_pause_minutes: number
    session_en_cours: any | null
  }>({ sessions: [], total_travail_minutes: 0, total_pause_minutes: 0, session_en_cours: null })
  useEffect(() => {
    let cancelled = false
    fetch("/api/rh/pointage/session")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled && d && !d.error) {
          setSessionsData({
            sessions: d.sessions || [],
            total_travail_minutes: Number(d.total_travail_minutes) || 0,
            total_pause_minutes: Number(d.total_pause_minutes) || 0,
            session_en_cours: d.session_en_cours || null,
          })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
    // Dépendance `punching` : re-fetch dès qu'un clic s'est terminé.
  }, [punching, feedback])

  const sessionEnCours = sessionsData.session_en_cours
  const isEnTravail = sessionEnCours?.type_session === 'travail'
  const isEnPause = sessionEnCours?.type_session === 'pause'
  const hasAnySession = sessionsData.sessions.length > 0
  const formatMin = (m: number) => {
    const h = Math.floor(m / 60), r = m % 60
    return h > 0 ? `${h}h${r > 0 ? ` ${String(r).padStart(2, '0')}min` : ''}` : `${r}min`
  }
  const fmtTime = (t?: string | null) => (t ? String(t).slice(0, 5) : '—')

  // V3.5 — bannière "contrat à signer" tirée du même endpoint
  // que la sidebar pour cohérence.
  const [contratsASigner, setContratsASigner] = useState(0)
  useEffect(() => {
    let cancelled = false
    fetch("/api/salarie/notifications")
      .then(r => r.ok ? r.json() : { contrats_a_signer: 0 })
      .then(d => { if (!cancelled) setContratsASigner(Number(d.contrats_a_signer) || 0) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // G7 — carte grossesse/paternité read-only (RLS SELECT_SELF garantit
  // que l'employé(e) ne voit que SES données).
  const [protection, setProtection] = useState<{
    grossesse: any | null
    paternite: any | null
  }>({ grossesse: null, paternite: null })
  useEffect(() => {
    let cancelled = false
    fetch("/api/salarie/protection-legale")
      .then(r => r.ok ? r.json() : { grossesse: null, paternite: null })
      .then(d => { if (!cancelled) setProtection({ grossesse: d.grossesse, paternite: d.paternite }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const notifications: { icon: typeof Bell; text: string; time: string }[] = []
  if (lastBulletin) {
    const per = lastBulletin.periode || ""
    const mIdx = parseInt(per.slice(5, 7), 10) - 1
    const yr = per.slice(0, 4)
    notifications.push({ icon: Bell, text: `Bulletin ${MONTH_NAMES_FR[mIdx] || ""} ${yr} disponible`, time: lastBulletin.created_at ? new Date(lastBulletin.created_at).toLocaleDateString("fr-FR") : "" })
  }

  return (
    <div className="space-y-4">
      {contratsASigner > 0 && (
        <Card className="overflow-hidden rounded-xl shadow-sm border-0" style={{ background: `linear-gradient(135deg, ${GOLD}15, ${GOLD}08)`, borderLeft: `4px solid ${GOLD}` }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${GOLD}25` }}>
              <FileText className="h-5 w-5" style={{ color: GOLD }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: NAVY }}>
                {contratsASigner === 1 ? "Un contrat vous attend" : `${contratsASigner} contrats vous attendent`}
              </p>
              <p className="text-xs text-gray-500">Merci de le{contratsASigner > 1 ? "s" : ""} relire et signer depuis l&apos;onglet « Contrats ».</p>
            </div>
            <Button size="sm" onClick={() => router.push("/salarie#contrats")} style={{ backgroundColor: GOLD, color: NAVY }} className="shrink-0 h-9 font-semibold">
              Signer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* G7 — Carte grossesse active (read-only, transparence WRA S.52/S.64) */}
      {protection.grossesse && (() => {
        const g = protection.grossesse
        const fmt = (iso: string | null) => iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "—"
        return (
          <Card className="overflow-hidden rounded-xl shadow-sm border-0"
            style={{ background: "linear-gradient(135deg, #fce7f3, #fdf2f8)", borderLeft: "4px solid #ec4899" }}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-pink-200 shrink-0">
                  <span className="text-xl">🤱</span>
                </div>
                <div className="flex-1 space-y-1 text-sm">
                  <p className="font-semibold text-pink-900">
                    {g.statut === 'declaree' && 'Grossesse enregistrée'}
                    {g.statut === 'conge_en_cours' && 'Congé maternité en cours'}
                    {g.statut === 'retour_effectue' && 'Congé maternité terminé'}
                  </p>
                  <div className="text-xs text-pink-800 space-y-0.5">
                    {g.date_presume_accouchement && (
                      <p>Date prévue : <strong>{fmt(g.date_presume_accouchement)}</strong></p>
                    )}
                    {g.conge_mat_debut && g.conge_mat_fin && (
                      <p>Congé maternité : <strong>{fmt(g.conge_mat_debut)} → {fmt(g.conge_mat_fin)}</strong></p>
                    )}
                    {g.allocation_naissance_payee && (
                      <p className="text-emerald-700">✓ Allocation naissance 3 000 MUR versée</p>
                    )}
                  </div>
                  <p className="text-[10px] text-pink-600 pt-1">
                    Protection WRA 2019 Sections 52 &amp; 64. Pour toute modification, contactez le RH.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* G7 — Carte paternité active (read-only) */}
      {protection.paternite && (() => {
        const p = protection.paternite
        const fmt = (iso: string | null) => iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : "—"
        return (
          <Card className="overflow-hidden rounded-xl shadow-sm border-0"
            style={{ background: "linear-gradient(135deg, #dbeafe, #eff6ff)", borderLeft: "4px solid #2563eb" }}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-200 shrink-0">
                  <span className="text-xl">👶</span>
                </div>
                <div className="flex-1 space-y-1 text-sm">
                  <p className="font-semibold text-blue-900">
                    Congé paternité ({p.conge_paye ? '4 semaines payées' : '4 semaines non payées'})
                  </p>
                  <div className="text-xs text-blue-800 space-y-0.5">
                    <p>Naissance : <strong>{fmt(p.date_naissance_enfant)}</strong></p>
                    {p.conge_pat_debut && p.conge_pat_fin && (
                      <p>Congé : <strong>{fmt(p.conge_pat_debut)} → {fmt(p.conge_pat_fin)}</strong></p>
                    )}
                  </div>
                  <p className="text-[10px] text-blue-600 pt-1">WRA 2019 Section 53.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {estimatedNet > 0 && (
        <Card className="overflow-hidden rounded-xl shadow-sm" style={{ border: `2px solid ${GOLD}30` }}>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500">Prochain salaire estimé</p>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${GOLD}15` }}>
                <CreditCard className="h-4 w-4" style={{ color: GOLD }} />
              </div>
            </div>
            <p className="text-3xl md:text-2xl font-bold font-mono mb-1" style={{ color: NAVY }}>~MRs {fmt(estimatedNet)}</p>
            {estimatedBase > 0 && (
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-1">
                <span>Base: {fmt(estimatedBase)}</span>
                {estimatedBrut > estimatedBase && <span>| Brut: {fmt(estimatedBrut)}</span>}
              </div>
            )}
            <p className="text-xs" style={{ color: GOLD }}>Versement le {lastDayOfMonth()}</p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-4 space-y-4">
          {/* PO1 — 3 boutons contextuels + timeline.
             - aucune session en cours -> seule [Entrée] est active
             - session travail en cours -> [Pause] + [Sortie] actives
             - session pause en cours   -> seule [Reprendre] active
             Les pointages multiples dans la même journée (intervention
             tardive, pauses fractionnées) sont autorisés. */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={() => doPunch("entree")}
              disabled={punching || !!sessionEnCours}
              className="h-12 md:h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm md:text-base disabled:opacity-40"
            >
              <LogIn className="h-5 w-5 mr-2" /> Entrée
            </Button>
            {isEnPause ? (
              <Button
                onClick={() => doPunch("pause_fin")}
                disabled={punching}
                className="h-12 md:h-14 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm md:text-base"
              >
                <Coffee className="h-5 w-5 mr-2" /> Reprendre
              </Button>
            ) : (
              <Button
                onClick={() => doPunch("pause_debut")}
                disabled={punching || !isEnTravail}
                className="h-12 md:h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm md:text-base disabled:opacity-40"
              >
                <Coffee className="h-5 w-5 mr-2" /> Pause
              </Button>
            )}
            <Button
              onClick={() => doPunch("sortie")}
              disabled={punching || !isEnTravail}
              className="h-12 md:h-14 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm md:text-base disabled:opacity-40"
            >
              <LogOut className="h-5 w-5 mr-2" /> Sortie
            </Button>
          </div>

          {/* Timeline des sessions du jour. Affichée dès qu'il y a au moins
              une session (même encore ouverte). */}
          {hasAnySession && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Journée en cours
              </p>
              <div className="space-y-1.5">
                {sessionsData.sessions.map((s: any) => {
                  const isTravail = s.type_session === 'travail'
                  const isOuverte = s.heure_fin == null
                  const duree = s.duree_minutes != null ? formatMin(s.duree_minutes) : null
                  return (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className={`inline-block h-2 w-2 rounded-full ${isTravail ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="font-mono text-gray-700">{fmtTime(s.heure_debut)}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-mono text-gray-700">
                        {isOuverte ? <span className="italic text-blue-600">en cours</span> : fmtTime(s.heure_fin)}
                      </span>
                      <span className="ml-auto text-xs text-gray-500">
                        {isTravail ? 'Travail' : 'Pause'}
                        {duree ? ` · ${duree}` : isOuverte ? ' · …' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-2 border-t border-gray-200 flex gap-4 text-xs text-gray-600">
                <span>
                  <span className="font-semibold" style={{ color: NAVY }}>Travaillé :</span>{' '}
                  <span className="font-mono">{formatMin(sessionsData.total_travail_minutes)}</span>
                  {isEnTravail ? <span className="italic text-blue-600"> (+ en cours)</span> : null}
                </span>
                <span>
                  <span className="font-semibold" style={{ color: NAVY }}>Pauses :</span>{' '}
                  <span className="font-mono">{formatMin(sessionsData.total_pause_minutes)}</span>
                </span>
              </div>
            </div>
          )}

          {!hasAnySession && (
            <p className="text-xs text-center text-gray-400 italic">
              Aucune session aujourd&apos;hui — cliquez sur <span className="font-semibold text-emerald-700">Entrée</span> pour commencer.
            </p>
          )}

          {feedback && <p className="text-sm text-center p-2.5 rounded-xl bg-blue-50 text-blue-700">{feedback}</p>}
        </CardContent>
      </Card>

      {soldesMissing ? (
        // F5 — État d'erreur explicite. Pas de valeurs par défaut (22/15)
        // qui masqueraient un vrai problème DB.
        <Card className="rounded-xl shadow-sm border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">
            Impossible de charger vos soldes de congés. Contactez votre RH.
          </CardContent>
        </Card>
      ) : (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <Card className={`rounded-xl shadow-sm ${eligibilityStatus === "not_eligible" ? "opacity-60" : ""}`}>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className="relative h-20 w-20 mb-3">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke={`${GREEN}20`} strokeWidth="8" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={GREEN} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - alPct / 100)}`}
                    className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold" style={{ color: NAVY }}>{alRemaining}j</span>
                </div>
              </div>
              <p className="font-medium text-sm" style={{ color: NAVY }}>Conges annuels</p>
              <p className="text-xs text-gray-400">sur {alTotal}j</p>
              <div className="mt-2"><EligibiliteBadge status={eligibilityStatus} /></div>
            </CardContent>
          </Card>
          <Card className={`rounded-xl shadow-sm ${eligibilityStatus === "not_eligible" ? "opacity-60" : ""}`}>
            <CardContent className="p-4 flex flex-col items-center text-center">
              <div className="relative h-20 w-20 mb-3">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#f9731620" strokeWidth="8" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#f97316" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - slPct / 100)}`}
                    className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold" style={{ color: NAVY }}>{slRemaining}j</span>
                </div>
              </div>
              <p className="font-medium text-sm" style={{ color: NAVY }}>Sick Leave</p>
              <p className="text-xs text-gray-400">sur {slTotal}j</p>
              <div className="mt-2"><EligibiliteBadge status={eligibilityStatus} /></div>
            </CardContent>
          </Card>
        </div>
        <p className="text-[11px] text-center text-gray-500">Période : {periodeLabel}</p>
        {notEligibleMessage && (
          <p className="text-[11px] text-center text-gray-500 italic">{notEligibleMessage}</p>
        )}
        <VacationLeaveCard
          vl_droit={conges?.vl_droit ?? null}
          vl_pris={conges?.vl_pris ?? null}
          vl_solde={conges?.vl_solde ?? null}
          vl_cycle_debut={conges?.vl_cycle_debut ?? null}
          vl_cycle_fin={conges?.vl_cycle_fin ?? null}
          vl_eligibility_status={(conges?.vl_eligibility_status as VlEligibilityStatus) || "no_date_arrivee"}
          vl_eligibility_date={conges?.vl_eligibility_date ?? null}
        />
      </div>
      )}

      {annonces.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Communications</p>
          {annonces.slice(0, 3).map((a: any) => {
            const typeStyles: Record<string, { bg: string; border: string; icon: string; text: string }> = {
              urgent: { bg: "#dc262608", border: "#dc2626", icon: "🚨", text: "#dc2626" },
              rh: { bg: `${BLUE}08`, border: BLUE, icon: "📋", text: BLUE },
              celebration: { bg: `${GOLD}08`, border: GOLD, icon: "🎉", text: GOLD },
              rappel: { bg: "#ea580c08", border: "#ea580c", icon: "⏰", text: "#ea580c" },
              info: { bg: "#05966908", border: "#059669", icon: "ℹ️", text: "#059669" },
            }
            const s = typeStyles[a.type] || typeStyles.info
            return (
              <div key={a.id} className="p-4 rounded-2xl transition-all duration-200" style={{ backgroundColor: s.bg, borderLeft: `4px solid ${s.border}` }}>
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: s.text }}>{a.titre}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{a.contenu}</p>
                    <p className="text-[10px] text-gray-400 mt-1.5">{new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  {a.priorite >= 2 && <Badge className="bg-red-100 text-red-700 text-[10px] flex-shrink-0">Urgent</Badge>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(() => {
        const today = new Date().toISOString().split("T")[0]
        const upcoming = getUpcomingHolidays(today, 3)
        if (upcoming.length === 0) return null
        return (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Prochains jours fériés</p>
            {upcoming.map((h, i) => {
              const d = new Date(h.date + "T12:00:00")
              const daysUntil = Math.ceil((d.getTime() - new Date().getTime()) / 86400000)
              const dayNum = d.getDate()
              const monthShort = d.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase()
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "#f8f9fc", border: "1px solid #e8eaef" }}>
                  <div className="flex flex-col items-center justify-center w-11 h-11 rounded-lg flex-shrink-0" style={{ backgroundColor: daysUntil <= 7 ? `${GOLD}12` : "#eef0f4" }}>
                    <span className="text-[10px] font-semibold leading-none" style={{ color: daysUntil <= 7 ? GOLD : "#9ca3af" }}>{monthShort}</span>
                    <span className="text-base font-bold leading-none" style={{ color: daysUntil <= 7 ? NAVY : "#6b7280" }}>{dayNum}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{h.name}</p>
                    <p className="text-xs text-gray-400">{d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: daysUntil <= 7 ? `${GOLD}15` : "#f3f4f6", color: daysUntil <= 7 ? GOLD : "#9ca3af" }}>
                    {daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? "Demain" : `J-${daysUntil}`}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })()}

      <div className="grid grid-cols-2 gap-3">
        {([
          { icon: FileText, label: "Mes bulletins", onClick: () => router.push("/salarie#bulletins"), color: BLUE, bg: `linear-gradient(135deg, ${BLUE}08, ${BLUE}15)` },
          { icon: CalendarPlus, label: "Demander un conge", onClick: () => router.push("/salarie#conges"), color: GREEN, bg: `linear-gradient(135deg, ${GREEN}08, ${GREEN}15)` },
          { icon: HeartPulse, label: "Mon Espace Sante", onClick: () => router.push("/salarie#sante"), color: "#7c3aed", bg: "linear-gradient(135deg, #7c3aed08, #7c3aed15)" },
          { icon: Calendar, label: "Mon planning", onClick: () => router.push("/salarie#planning"), color: GOLD, bg: `linear-gradient(135deg, ${GOLD}08, ${GOLD}15)` },
        ] as const).map((action, i) => (
          <Card key={i}
            className="cursor-pointer rounded-xl shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.97] border-0"
            onClick={action.onClick}
            style={{ background: action.bg }}>
            <CardContent className="p-4 md:p-5 flex flex-col items-center gap-2.5 text-center">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${action.color}15` }}>
                <action.icon className="h-6 w-6" style={{ color: action.color }} />
              </div>
              <p className="text-sm font-medium" style={{ color: NAVY }}>{action.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {notifications.length > 0 && (
        <Card className="hidden md:block rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: NAVY }}>
              <Bell className="h-4 w-4" /> Notifications récentes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {notifications.map((n, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BLUE}15` }}>
                  <n.icon className="h-4 w-4" style={{ color: BLUE }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{n.text}</p>
                  {n.time && <p className="text-xs text-gray-400">{n.time}</p>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
