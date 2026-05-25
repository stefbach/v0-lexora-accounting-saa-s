"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Building2, Users, TrendingUp, AlertTriangle, Download, Brain } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import dynamic from "next/dynamic"
import { t, getLocale } from "@/lib/i18n"

const CerveauTIBOK = dynamic(() => import("@/components/CerveauTIBOK"), { ssr: false })

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

export default function DirectionPage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exercice, setExercice] = useState("2024-2025")
  const [cerveauOpen, setCerveauOpen] = useState(false)
  const [consolidation, setConsolidation] = useState<any>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const socRes = await fetch("/api/comptable/societes")
      const socData = await socRes.json()
      const socs = socData.societes || []
      setSocietes(socs)

      // Charger les données consolidées pour toutes les sociétés
      // First, detect the latest period that has bulletins (across all sociétés)
      let latestPeriode = ""
      try {
        const allPaieRes = await fetch(`/api/rh/paie`).then(r => r.json())
        const allBulletins = allPaieRes.bulletins || []
        if (allBulletins.length > 0) {
          latestPeriode = (allBulletins[0].periode || "").slice(0, 7)
        }
      } catch { /* noop */ }
      if (!latestPeriode) {
        latestPeriode = new Date().toISOString().slice(0, 7)
      }

      const results = await Promise.all(
        socs.map(async (s: any) => {
          const [paieRes, empRes, facRes] = await Promise.all([
            fetch(`/api/rh/paie?societe_id=${s.id}&periode=${latestPeriode}`).then(r => r.json()),
            fetch(`/api/rh/employes?societe_id=${s.id}`).then(r => r.json()),
            fetch(`/api/comptable/factures?societe_id=${s.id}&type=client`).then(r => r.json()),
          ])
          return {
            id: s.id, nom: s.nom, code: s.code,
            nb_employes: empRes.total || 0,
            masse_salariale: paieRes.totaux?.cout_total_employeur || 0,
            ca_mur: facRes.totaux?.total_mur || 0,
            nb_factures: facRes.totaux?.nb_factures || 0,
            nb_retard: facRes.totaux?.nb_retard || 0,
          }
        })
      )
      const total = {
        nb_employes: results.reduce((s, r) => s + r.nb_employes, 0),
        masse_salariale: results.reduce((s, r) => s + r.masse_salariale, 0),
        ca_mur: results.reduce((s, r) => s + r.ca_mur, 0),
        nb_retard: results.reduce((s, r) => s + r.nb_retard, 0),
      }
      setConsolidation({ societes: results, total })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [exercice])

  useEffect(() => { load() }, [load])

  const exportMgmtAccounts = async (societe_id: string) => {
    window.open(`/api/export/management-accounts?societe_id=${societe_id}&exercice=${exercice}`, '_blank')
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="min-h-screen bg-gray-50">
      {/* Header Direction */}
      <div className="bg-[#0B0F2E] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Building2 className="w-5 h-5 text-[#D4AF37]"/>{t('adm.dir.title', locale)}</h1>
          <p className="text-white/60 text-sm">{t('adm.dir.subtitle', locale)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={exercice} onValueChange={setExercice}>
            <SelectTrigger className="w-36 bg-white/10 border-white/20 text-white"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="2024-2025">2024–2025</SelectItem>
              <SelectItem value="2023-2024">2023–2024</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setCerveauOpen(true)} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#b8973a]">
            <Brain className="w-4 h-4 mr-2"/>{t('adm.dir.assistant', locale)}
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* KPIs Consolidés */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t('adm.dir.active_companies', locale), value: societes.length, icon: Building2, color: "text-blue-600" },
            { label: t('adm.dir.total_headcount', locale), value: consolidation.total?.nb_employes || 0, icon: Users, color: "text-green-600" },
            { label: t('adm.dir.total_employer_cost', locale), value: fmt(consolidation.total?.masse_salariale || 0), icon: TrendingUp, color: "text-purple-600" },
            { label: t('adm.dir.overdue_receivables', locale), value: consolidation.total?.nb_retard || 0, icon: AlertTriangle, color: "text-red-600" },
          ].map(k => (
            <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-8 h-8 ${k.color}`}/>
              <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-[#0B0F2E]">{loading ? "..." : k.value}</p></div>
            </CardContent></Card>
          ))}
        </div>

        {/* Vue par société */}
        <div className="grid gap-4">
          {(consolidation.societes || []).map((s: any) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#0B0F2E] rounded-lg flex items-center justify-center text-[#D4AF37] font-bold text-sm">{s.code?.slice(0,3) || "?"}</div>
                    <div>
                      <p className="font-semibold text-[#0B0F2E]">{s.nom}</p>
                      <p className="text-xs text-gray-500">{s.nb_employes} {t('adm.dir.employees_suffix', locale)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center"><p className="text-xs text-gray-500">{t('adm.dir.revenue', locale)}</p><p className="font-semibold">{fmt(s.ca_mur)}</p></div>
                    <div className="text-center"><p className="text-xs text-gray-500">{t('adm.dir.employer_cost', locale)}</p><p className="font-semibold text-purple-600">{fmt(s.masse_salariale)}</p></div>
                    {s.nb_retard > 0 && <div className="text-center"><p className="text-xs text-gray-500">{t('adm.dir.overdue', locale)}</p><p className="font-semibold text-red-600">{s.nb_retard}</p></div>}
                    <Button size="sm" variant="outline" onClick={() => exportMgmtAccounts(s.id)} className="gap-1">
                      <Download className="w-3 h-3"/>{t('adm.dir.mgmt_accounts', locale)}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Raccourcis */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {href:"/comptable", label:t('adm.dir.shortcut_accounting', locale), icon:"📊"},
            {href:"/rh", label:t('adm.dir.shortcut_hr', locale), icon:"👥"},
            {href:"/rh/juridique", label:t('adm.dir.shortcut_legal', locale), icon:"⚖️"},
            {href:"/rh/chat", label:t('adm.dir.shortcut_clara', locale), icon:"🤖"},
          ].map(a => (
            <a key={a.href} href={a.href}>
              <Card className="hover:shadow-md cursor-pointer transition-shadow">
                <CardContent className="p-4 text-center"><div className="text-2xl mb-1">{a.icon}</div><p className="text-sm font-medium text-[#0B0F2E]">{a.label}</p></CardContent>
              </Card>
            </a>
          ))}
        </div>
      </div>

      {/* Cerveau TIBOK flottant */}
      {cerveauOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-bold text-[#0B0F2E] flex items-center gap-2"><Brain className="w-4 h-4 text-[#D4AF37]"/>{t('adm.dir.assistant', locale)}</h2>
              <Button variant="ghost" size="sm" onClick={() => setCerveauOpen(false)}>✕</Button>
            </div>
            <CerveauTIBOK mode="panel" />
          </div>
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
