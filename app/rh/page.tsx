"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, CreditCard, Clock, Calendar, TrendingUp, AlertTriangle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

export default function RHDashboard() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [stats, setStats] = useState({ nb_employes: 0, masse_salariale: 0, conges_attente: 0, absences_today: 0 })
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
        })
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [societe, periode])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Tableau de bord RH</h1>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Employés actifs", value: stats.nb_employes, icon: Users, color: "text-blue-600", href: "/rh/employes" },
          { label: "Coût employeur (mois)", value: fmt(stats.masse_salariale), icon: CreditCard, color: "text-green-600", href: "/rh/paie" },
          { label: "Congés en attente", value: stats.conges_attente, icon: Calendar, color: "text-yellow-600", href: "/rh/conges" },
          { label: "Pointage aujourd'hui", value: "—", icon: Clock, color: "text-purple-600", href: "/rh/pointage" },
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
              { href: "/rh/paie", label: "Calculer la paie", icon: "💰", desc: "Bulletins du mois" },
              { href: "/rh/employes", label: "Gestion employés", icon: "👥", desc: "Dossiers RH" },
              { href: "/rh/conges", label: "Congés", icon: "🏖️", desc: "Demandes en cours" },
              { href: "/rh/juridique", label: "Contrats", icon: "⚖️", desc: "Générer / Vérifier" },
              { href: "/rh/exports/virement", label: "Virements", icon: "🏦", desc: "Export MCB/SBM" },
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
              { label: "13ème mois (75%)", date: "25 décembre", statut: "warning" },
              { label: "13ème mois (25%)", date: "31 décembre", statut: "warning" },
              { label: "Déclaration annuelle MRA", date: "30 septembre", statut: "info" },
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
