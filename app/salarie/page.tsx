"use client"
import { useState, useEffect, useCallback } from "react"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Loader2, Clock, Calendar, TrendingUp, LogOut, User, FileText, FolderOpen,
  LayoutDashboard, MoreHorizontal, Car, HeartPulse,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

import { NAVY, GOLD, MU_TZ, KNOWN_TABS, type Tab } from "./_components/shared/constants"
import { timeMauritius, todayFR, todayISO } from "./_components/shared/helpers"

import { MaFicheTab } from "./_components/tabs/MaFicheTab"
import { CongesTab } from "./_components/tabs/CongesTab"
import { TrajetsTab } from "./_components/tabs/TrajetsTab"
import { ContratsTab } from "./_components/tabs/ContratsTab"
import { DocumentsTab } from "./_components/tabs/DocumentsTab"
import { DashboardTab } from "./_components/tabs/DashboardTab"
import { BulletinsTab } from "./_components/tabs/BulletinsTab"
import { PlanningTab } from "./_components/tabs/PlanningTab"
import { PrimesTab } from "./_components/tabs/PrimesTab"
import { SanteTab } from "./_components/tabs/SanteTab"

// Orchestrateur de l'espace salarié.
// Sprint-salarie V0.1 — découpage du monolithe précédent (2151 lignes)
// en sous-composants (app/salarie/_components/tabs/*). Aucun changement
// fonctionnel : seule la topologie du code a changé.
export default function EspaceEmployePage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("dashboard")
  const [employe, setEmploye] = useState<any>(null)
  const [pointageToday, setPointageToday] = useState<any>(null)
  const [bulletins, setBulletins] = useState<any[]>([])
  const [primes, setPrimes] = useState<any[]>([])
  const [conges, setConges] = useState<any>({ al_droit: 22, al_pris: 0, al_solde: 22, sl_droit: 15, sl_pris: 0, sl_solde: 15 })
  const [annonces, setAnnonces] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [punching, setPunching] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (feedback) { const t = setTimeout(() => setFeedback(""), 4000); return () => clearTimeout(t) } }, [feedback])

  // Sync tab with URL hash.
  // The sidebar and all in-page navigations call router.push("/salarie#X")
  // synchronously (see hotfix 438f38a), which updates the URL before the
  // next paint and re-triggers usePathname/useSearchParams, so our effect
  // re-runs and re-reads window.location.hash. The hashchange listener
  // stays as a safety net for browser back/forward and manual URL edits.
  useEffect(() => {
    const applyHash = () => {
      if (typeof window === "undefined") return
      const h = (window.location.hash || "").replace(/^#/, "") as Tab
      if (h && KNOWN_TABS.includes(h)) setTab(h)
    }
    applyHash()
    window.addEventListener("hashchange", applyHash)
    return () => window.removeEventListener("hashchange", applyHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const profileRes = await fetch("/api/rh/employes/me").then(r => r.json()).catch(() => ({}))
      const emp = profileRes.employe || null
      setEmploye(emp)
      if (emp) {
        const today = todayISO()
        // Le planning est désormais géré à l'intérieur de PlanningTab
        // (sprint V2.3 — sélecteur de mois). On ne le récupère plus ici.
        const [ptRes, bulRes, prRes, cgRes, histRes] = await Promise.all([
          fetch(`/api/rh/pointage?date=${today}&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ pointages: [] })),
          fetch(`/api/rh/paie?action=list&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
          fetch(`/api/rh/primes?type=saisie&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ primes: [] })),
          fetch(`/api/rh/conges?action=balances&employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ balances: [] })),
          fetch(`/api/rh/conges?employe_id=${emp.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
        ])
        setPointageToday(ptRes.pointages?.[0] || null)
        setBulletins(bulRes.bulletins || [])
        setPrimes(prRes.primes || [])
        const bal = cgRes.balances?.find((b: any) => b.employe_id === emp.id) || cgRes.balances?.[0]
        if (bal && bal.al_droit !== undefined) {
          setConges(bal)
        } else {
          const histConges = (histRes.conges || histRes.demandes || []).filter((c: any) => c.statut === "approuve" || c.statut === "approved")
          const alPris = histConges.filter((c: any) => c.type_conge === "AL").reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
          const slPris = histConges.filter((c: any) => c.type_conge === "SL").reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
          setConges({
            al_droit: 22, al_pris: alPris, al_solde: 22 - alPris,
            sl_droit: 15, sl_pris: slPris, sl_solde: 15 - slPris,
          })
        }
        fetch("/api/rh/annonces").then(r => r.json()).then(d => setAnnonces(d.annonces || [])).catch(() => {})
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // V2.5 — refresh ciblé côté Congés. Avant, CongesTab appelait onRefresh=load
  // qui relançait 6 fetch du dashboard pour une simple création/annulation.
  // On relit uniquement balances + liste (la liste est aussi utilisée comme
  // fallback par le calcul des soldes).
  const refreshConges = useCallback(async () => {
    if (!employe) return
    const [cgRes, histRes] = await Promise.all([
      fetch(`/api/rh/conges?action=balances&employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ balances: [] })),
      fetch(`/api/rh/conges?employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
    ])
    const bal = cgRes.balances?.find((b: any) => b.employe_id === employe.id) || cgRes.balances?.[0]
    if (bal && bal.al_droit !== undefined) {
      setConges(bal)
    } else {
      const histConges = (histRes.conges || histRes.demandes || []).filter((c: any) => c.statut === "approuve" || c.statut === "approved")
      const alPris = histConges.filter((c: any) => c.type_conge === "AL").reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
      const slPris = histConges.filter((c: any) => c.type_conge === "SL").reduce((s: number, c: any) => s + (Number(c.nb_jours) || 0), 0)
      setConges({
        al_droit: 22, al_pris: alPris, al_solde: 22 - alPris,
        sl_droit: 15, sl_pris: slPris, sl_solde: 15 - slPris,
      })
    }
  }, [employe])

  const doPunch = async (type: string) => {
    if (!employe) return
    setPunching(true)
    try {
      // PO1 — route vers l'API sessions. Mapping des noms legacy :
      //   entree -> entree | pause_debut -> pause | pause_fin -> fin-pause
      const actionMap: Record<string, string> = {
        entree: 'entree',
        pause_debut: 'pause',
        pause_fin: 'fin-pause',
        sortie: 'sortie',
      }
      const action = actionMap[type] || type
      const res = await fetch(`/api/rh/pointage/session?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employe_id: employe.id, heure: timeMauritius(), date: todayISO() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setFeedback(data.error || `Erreur ${res.status}`)
      else { setFeedback(`${type} enregistré`); load() }
    } catch { setFeedback("Erreur réseau") }
    setPunching(false)
  }

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!employe) return (
    <div className="flex flex-col items-center justify-center h-screen text-gray-500 p-6 text-center">
      <User className="h-16 w-16 mb-4 text-gray-300" />
      <h2 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Profil employé non trouvé</h2>
      <p className="text-sm text-gray-400 mb-4 max-w-sm">
        Votre compte n&apos;est pas encore lié à une fiche employé.
        Contactez votre responsable RH pour activer votre accès.
      </p>
      <Button onClick={async () => {
        const { createClient } = await import("@/lib/supabase/client")
        const supabase = createClient()
        await supabase.auth.signOut()
        window.location.href = "/auth/login"
      }} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
        <LogOut className="h-4 w-4 mr-2" /> Se déconnecter
      </Button>
    </div>
  )

  return (
    <ClientPageShell hideHero disableParticles>
      <div>
        {/* Header */}
        <div className="p-4 md:p-6" style={{ backgroundColor: NAVY }}>
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3 md:gap-3">
              <Avatar className="h-16 w-16 md:h-12 md:w-12 border-2 transition-all duration-200" style={{ borderColor: GOLD }}>
                {employe.photo_url ? <AvatarImage src={employe.photo_url} alt={employe.prenom} /> : null}
                <AvatarFallback className="text-base md:text-sm font-bold" style={{ backgroundColor: GOLD, color: NAVY }}>
                  {(employe.prenom?.[0] || "").toUpperCase()}{(employe.nom?.[0] || "").toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl md:text-xl font-bold text-white">Bonjour, {employe.prenom} {"👋"}</h1>
                <p className="text-white/60 text-xs md:text-sm">{employe.entreprise_nom || employe.poste || "—"} &middot; {todayFR()}</p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <div className="text-right">
                <p className="text-3xl font-mono font-bold text-white">{now.toLocaleTimeString("fr-FR", { timeZone: MU_TZ, hour: "2-digit", minute: "2-digit" })}</p>
                <p className="text-white/40 text-xs">Maurice (UTC+4)</p>
              </div>
              <button onClick={async () => {
                const { createClient } = await import("@/lib/supabase/client")
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.href = "/auth/login"
              }} className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/10 hover:bg-red-500/20 transition-colors" title="Déconnexion">
                <LogOut className="h-4 w-4 text-white/60 hover:text-red-400" />
              </button>
            </div>
            <div className="text-right md:hidden">
              <p className="text-2xl font-mono font-bold text-white">{now.toLocaleTimeString("fr-FR", { timeZone: MU_TZ, hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4 md:p-6 pb-24 md:pb-6 space-y-6">
          {/* Desktop Tabs — wrap on narrow viewports, truncate long labels
              to keep the bar readable between 1024px and 1920px. */}
          <div className="hidden md:flex flex-wrap gap-1 bg-white rounded-xl p-1.5 border shadow-sm">
            {([
              { id: "dashboard" as Tab, label: "Pointage", icon: LayoutDashboard },
              { id: "profil" as Tab, label: "Ma fiche", icon: User },
              { id: "bulletins" as Tab, label: "Bulletins", icon: FileText },
              { id: "planning" as Tab, label: "Planning", icon: Clock },
              { id: "primes" as Tab, label: "Primes", icon: TrendingUp },
              { id: "conges" as Tab, label: "Congés", icon: Calendar },
              { id: "sante" as Tab, label: "Santé TIBOK", icon: HeartPulse },
              { id: "trajets" as Tab, label: "Trajets", icon: Car },
              { id: "contrats" as Tab, label: "Contrats", icon: FileText },
              { id: "documents" as Tab, label: "Documents", icon: FolderOpen },
            ]).map(t => (
              <button key={t.id} onClick={() => router.push(`/salarie#${t.id}`)}
                className={`flex-1 min-w-[96px] flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 whitespace-nowrap ${tab === t.id ? "text-white font-medium shadow-md" : "text-gray-500 hover:bg-gray-50"}`}
                style={tab === t.id ? { backgroundColor: NAVY } : {}}>
                <t.icon className="h-4 w-4 flex-shrink-0" />{t.label}
              </button>
            ))}
          </div>

          {tab === "dashboard" && (
            <DashboardTab
              bulletins={bulletins}
              conges={conges}
              pointageToday={pointageToday}
              annonces={annonces}
              feedback={feedback}
              punching={punching}
              doPunch={doPunch}
              router={router}
            />
          )}

          {tab === "profil" && employe && (
            <MaFicheTab employe={employe} onUpdated={load} />
          )}

          {tab === "bulletins" && (
            <BulletinsTab bulletins={bulletins} employe={employe} onMarkRead={load} />
          )}

          {tab === "planning" && employe && (
            <PlanningTab employe={employe} />
          )}

          {tab === "primes" && (
            <PrimesTab bulletins={bulletins} primes={primes} />
          )}

          {tab === "conges" && employe && (
            <CongesTab employe={employe} onRefresh={refreshConges} />
          )}

          {tab === "trajets" && employe && (
            <TrajetsTab employe={employe} />
          )}

          {tab === "sante" && (
            <SanteTab employe={employe} />
          )}

          {tab === "contrats" && employe && (
            <ContratsTab employe={employe} />
          )}

          {tab === "documents" && employe && (
            <DocumentsTab employe={employe} />
          )}
        </div>

        {/* Mobile "More" menu overlay */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileMenuOpen(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute bottom-[72px] left-0 right-0 bg-white rounded-t-2xl shadow-xl p-4 space-y-1 animate-in slide-in-from-bottom" onClick={e => e.stopPropagation()}>
              <p className="text-xs text-gray-400 uppercase tracking-wider px-3 pb-2">Plus</p>
              {([
                { id: "profil" as Tab, label: "Ma fiche", icon: User },
                { id: "planning" as Tab, label: "Planning", icon: Clock },
                { id: "primes" as Tab, label: "Primes & OT", icon: TrendingUp },
                { id: "trajets" as Tab, label: "Trajets km", icon: Car },
                { id: "documents" as Tab, label: "Documents", icon: FolderOpen },
              ]).map(t => (
                <button key={t.id} onClick={() => { router.push(`/salarie#${t.id}`); setMobileMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left transition-all duration-200 active:scale-[0.98]"
                  style={tab === t.id ? { backgroundColor: `${NAVY}08`, color: NAVY } : { color: "#6b7280" }}>
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: tab === t.id ? `${GOLD}15` : "#f3f4f6" }}>
                    <t.icon className="h-5 w-5" style={{ color: tab === t.id ? GOLD : "#9ca3af" }} />
                  </div>
                  <span className="font-medium text-sm">{t.label}</span>
                </button>
              ))}
              <div className="border-t border-gray-200 mt-2 pt-2">
                <button onClick={async () => {
                  const { createClient } = await import("@/lib/supabase/client")
                  const supabase = createClient()
                  await supabase.auth.signOut()
                  window.location.href = "/auth/login"
                }}
                  className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left text-red-600 transition-all duration-200 active:scale-[0.98]">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-red-50">
                    <LogOut className="h-5 w-5 text-red-500" />
                  </div>
                  <span className="font-medium text-sm">Déconnexion</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t" style={{ borderColor: "#E2E5F0", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="flex items-center justify-around px-2 h-[68px]">
            {([
              { id: "dashboard" as Tab, label: "Home", icon: LayoutDashboard },
              { id: "bulletins" as Tab, label: "Bulletins", icon: FileText },
              { id: "sante" as Tab, label: "Ma Sante", icon: HeartPulse },
              { id: "conges" as Tab, label: "Conges", icon: Calendar },
              { id: "more" as const, label: "Plus", icon: MoreHorizontal },
            ]).map(t => {
              const isMore = t.id === "more"
              const isActive = isMore ? (mobileMenuOpen || ["profil", "primes", "documents"].includes(tab)) : tab === t.id
              return (
                <button key={t.id}
                  onClick={() => {
                    if (isMore) { setMobileMenuOpen(v => !v) }
                    else { router.push(`/salarie#${t.id}`); setMobileMenuOpen(false) }
                  }}
                  className="flex flex-col items-center justify-center gap-1 min-w-[56px] py-1.5 transition-all duration-200 active:scale-95"
                >
                  <div className="relative">
                    {isActive && <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-full" style={{ backgroundColor: GOLD }} />}
                    <t.icon className="h-6 w-6 transition-colors duration-200" style={{ color: isActive ? GOLD : "#9ca3af" }} />
                  </div>
                  <span className="text-[10px] font-medium transition-colors duration-200" style={{ color: isActive ? GOLD : "#9ca3af" }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </ClientPageShell>
  )
}
