"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, CreditCard, Clock, Calendar, TrendingUp, AlertTriangle, BarChart3, Target, Settings } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

type Tab = "dashboard" | "pointages" | "absences" | "primes" | "paie" | "parametres"

export default function RHDashboard() {
  const [tab, setTab] = useState<Tab>("dashboard")
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [stats, setStats] = useState({ nb_employes: 0, masse_salariale: 0, conges_attente: 0, absences_today: 0, primes_mois: 0 })
  const [loading, setLoading] = useState(true)
  const periode = new Date().toISOString().slice(0, 7)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = societe !== "all" ? `?societe_id=${societe}` : ""
        const [empRes, paieRes, congesRes] = await Promise.all([
          fetch(`/api/rh/employes${params}`),
          fetch(`/api/rh/paie?periode=${periode}${societe !== "all" ? `&societe_id=${societe}` : ""}`),
          fetch(`/api/rh/conges?statut=en_attente${societe !== "all" ? `&societe_id=${societe}` : ""}`),
        ])
        const [emp, paie, conges] = await Promise.all([empRes.json(), paieRes.json(), congesRes.json()])
        setStats({
          nb_employes: emp.total || 0,
          masse_salariale: paie.totaux?.cout_total_employeur || 0,
          conges_attente: conges.conges?.length || 0,
          absences_today: 0,
          primes_mois: 0,
        })
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [societe, periode])

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "dashboard", label: "Tableau de bord", icon: "📊" },
    { id: "pointages", label: "Pointages", icon: "⏰" },
    { id: "absences", label: "Absences & Congés", icon: "🏖️" },
    { id: "primes", label: "Primes", icon: "🎯" },
    { id: "paie", label: "Paie", icon: "💰" },
    { id: "parametres", label: "Paramètres", icon: "⚙️" },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Tableau de bord RH Manager</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Toutes sociétés" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les sociétés</SelectItem>
            {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-[#1E2A4A] text-[#1E2A4A]"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "dashboard" && (
        <DashboardTab stats={stats} loading={loading} />
      )}
      {tab === "pointages" && <PointagesTab />}
      {tab === "absences" && <AbsencesTab />}
      {tab === "primes" && <PrimesTab />}
      {tab === "paie" && <PaieTab />}
      {tab === "parametres" && <ParametresTab />}
    </div>
  )
}

function DashboardTab({ stats, loading }: { stats: any; loading: boolean }) {
  const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Employés actifs", value: stats.nb_employes, icon: Users, color: "text-blue-600", href: "/rh/employes" },
          { label: "Coût employeur (mois)", value: fmt(stats.masse_salariale), icon: CreditCard, color: "text-green-600", href: "/rh/paie" },
          { label: "Congés en attente", value: stats.conges_attente, icon: Calendar, color: "text-yellow-600", href: "/rh/conges" },
          { label: "Pointage aujourd'hui", value: "—", icon: Clock, color: "text-purple-600", href: "/rh/pointage" },
          { label: "Primes ce mois", value: fmt(stats.primes_mois), icon: Target, color: "text-orange-600", href: "/rh/paie/primes" },
        ].map(k => (
          <a key={k.label} href={k.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <k.icon className={`w-9 h-9 ${k.color}`} />
                <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-[#1E2A4A]">{loading ? "..." : k.value}</p></div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Accès rapides</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {[
              { href: "/rh/pointage", label: "Pointage temps réel", icon: "⏰", desc: "Présences du jour" },
              { href: "/rh/pointage/mensuel", label: "Pointage mensuel", icon: "📅", desc: "OT + corrections" },
              { href: "/rh/paie", label: "Calculer la paie", icon: "💰", desc: "Bulletins du mois" },
              { href: "/rh/paie/primes", label: "Saisir primes", icon: "🎯", desc: "Primes variables" },
              { href: "/rh/conges", label: "Absences & Congés", icon: "🏖️", desc: "Demandes en cours" },
              { href: "/rh/paie/exports-mra", label: "Exports MRA", icon: "🏛️", desc: "CSG/NSF/PAYE" },
              { href: "/rh/employes", label: "Gestion employés", icon: "👥", desc: "Dossiers RH" },
              { href: "/rh/chat", label: "Chat CLARA", icon: "🤖", desc: "Assistant RH IA" },
            ].map(a => (
              <a key={a.href} href={a.href} className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <span className="text-2xl">{a.icon}</span>
                <div><p className="text-sm font-medium text-[#1E2A4A]">{a.label}</p><p className="text-xs text-gray-400">{a.desc}</p></div>
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-yellow-500" /> Rappels légaux Maurice</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { label: "CSG mensuelle", date: "15 du mois suivant", statut: "info" },
              { label: "PAYE mensuel", date: "20 du mois suivant", statut: "info" },
              { label: "NSF mensuel", date: "Fin du mois", statut: "info" },
              { label: "Training Levy", date: "Fin du mois", statut: "info" },
              { label: "PRGF", date: "Fin du mois", statut: "info" },
              { label: "13ème mois (75%)", date: "25 décembre", statut: "warning" },
              { label: "13ème mois (25%)", date: "31 décembre", statut: "warning" },
              { label: "Déclaration EDF annuelle", date: "30 septembre", statut: "info" },
            ].map(r => (
              <div key={r.label} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                <span className="text-gray-700">{r.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.statut === "warning" ? "bg-yellow-100 text-yellow-800" : "bg-blue-50 text-blue-700"}`}>{r.date}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PointagesTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Raccourcis vers la gestion des pointages :</p>
      <div className="grid grid-cols-2 gap-4">
        <a href="/rh/pointage">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
            <CardContent className="p-6 flex items-center gap-4">
              <span className="text-4xl">⏰</span>
              <div>
                <p className="font-bold text-[#1E2A4A] text-lg">Pointage temps réel</p>
                <p className="text-sm text-gray-500">Présences du jour, pointage manuel, corrections immédiates</p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="/rh/pointage/mensuel">
          <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
            <CardContent className="p-6 flex items-center gap-4">
              <span className="text-4xl">📅</span>
              <div>
                <p className="font-bold text-[#1E2A4A] text-lg">Pointage mensuel</p>
                <p className="text-sm text-gray-500">Calendrier mensuel, validation OT, absences injustifiées</p>
              </div>
            </CardContent>
          </Card>
        </a>
      </div>
    </div>
  )
}

function AbsencesTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Gestion complète des absences et congés :</p>
      <a href="/rh/conges">
        <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
          <CardContent className="p-6 flex items-center gap-4">
            <span className="text-4xl">🏖️</span>
            <div>
              <p className="font-bold text-[#1E2A4A] text-lg">Absences & Congés</p>
              <p className="text-sm text-gray-500">Demandes en attente, planning, absences non planifiées — validation + impact paie</p>
            </div>
          </CardContent>
        </Card>
      </a>
    </div>
  )
}

function PrimesTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Catalogue et saisie mensuelle des primes :</p>
      <a href="/rh/paie/primes">
        <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
          <CardContent className="p-6 flex items-center gap-4">
            <span className="text-4xl">🎯</span>
            <div>
              <p className="font-bold text-[#1E2A4A] text-lg">Primes paramétrables</p>
              <p className="text-sm text-gray-500">Catalogue primes, saisie mensuelle variable, approbation, intégration automatique dans la paie</p>
            </div>
          </CardContent>
        </Card>
      </a>
    </div>
  )
}

function PaieTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Module paie complet :</p>
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: "/rh/paie", icon: "💰", label: "Bulletins de paie", desc: "Calcul batch, validation, PDF individuel" },
          { href: "/rh/paie/exports-mra", icon: "🏛️", label: "Exports MRA", desc: "CSG/NSF, PAYE, PRGF, virements bancaires" },
          { href: "/rh/paie/primes", icon: "🎯", label: "Primes du mois", desc: "Saisie et approbation des primes variables" },
          { href: "/rh/paie/parametres", icon: "⚙️", label: "Paramètres paie", desc: "Taux MRA, OT, jours fériés" },
        ].map(a => (
          <a key={a.href} href={a.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
              <CardContent className="p-5 flex items-center gap-4">
                <span className="text-3xl">{a.icon}</span>
                <div>
                  <p className="font-bold text-[#1E2A4A]">{a.label}</p>
                  <p className="text-xs text-gray-500">{a.desc}</p>
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  )
}

function ParametresTab() {
  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-sm">Configuration de l'environnement RH :</p>
      <a href="/rh/paie/parametres">
        <Card className="hover:shadow-md transition-shadow cursor-pointer border-2 hover:border-[#1E2A4A]">
          <CardContent className="p-6 flex items-center gap-4">
            <span className="text-4xl">⚙️</span>
            <div>
              <p className="font-bold text-[#1E2A4A] text-lg">Paramètres paie & RH</p>
              <p className="text-sm text-gray-500">Taux MRA 2024/25, calcul OT (1.5x / 2x), jours fériés Maurice, taux change EUR/MUR</p>
            </div>
          </CardContent>
        </Card>
      </a>
    </div>
  )
}
