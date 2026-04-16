"use client"
import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Building2, TrendingUp, Plus, Loader2, Banknote, Receipt,
  ChevronLeft, ChevronRight, Calendar, Bell, Users, Pencil,
  AlertTriangle, Info, ExternalLink, FileText,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts"

interface Societe { id: string; nom: string; brn: string; statut: string }
interface Alerte { id: string; niveau: 'danger' | 'warning' | 'info'; titre: string; description: string; montant?: number; echeance?: string; lien?: string }

interface DashboardPayload {
  societes: Societe[]
  selected_societe_id: string | null
  mois: string
  currentMonth: {
    ca: number; depenses: number; benefice: number
    tva_nette: number; salaires: number; echeances_30j: number
  }
  exercice: { label: string; ca: number; depenses: number; resultat: number }
  chart: { mois_key: string; mois: string; CA: number; Depenses: number; Resultat: number }[]
  tresorerie: { total_mur: number; nb_comptes: number; comptes: { banque: string; devise: string; solde: number }[] }
  alertes: Alerte[]
  documents: { id: string; nom: string; date: string; statut: string }[]
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " MUR"
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")} M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)} K`
  return `${n}`
}

function formatMoisLabel(mois: string): string {
  const [y, m] = mois.split("-").map(Number)
  return new Date(y, m - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

function shiftMonth(mois: string, delta: number): string {
  const [y, m] = mois.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function TableauDeBord() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()

  const now = new Date()
  const currentMoisDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [selected, setSelected] = useState<string>("")
  const [mois, setMois] = useState<string>(currentMoisDefault)
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isCurrentMonth = mois === currentMoisDefault

  // Single fetch — one API call does everything.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams()
    if (selected && selected !== "all") qs.set("societe_id", selected)
    qs.set("mois", mois)

    // Abort after 55s (matches server maxDuration=60) to show a friendly error
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 55_000)

    fetch(`/api/client/dashboard?${qs.toString()}`, { signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DashboardPayload>
      })
      .then(d => {
        if (cancelled) return
        setData(d)
        // Pick the first société automatically if not yet selected
        if (!selected && d.societes?.length > 0) {
          setSelected(d.societes[0].id)
        }
      })
      .catch(e => {
        if (cancelled || e.name === 'AbortError') return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
      .finally(() => {
        clearTimeout(timer)
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true; clearTimeout(timer); controller.abort() }
  }, [selected, mois])

  // Redirect assistant
  useEffect(() => {
    if (!profileLoading && profile?.role === "client_assistant") {
      router.replace("/client/assistant")
    }
  }, [profileLoading, profile?.role, router])

  const nbAlertesDanger = useMemo(() => data?.alertes.filter(a => a.niveau === 'danger').length ?? 0, [data])
  const nbAlertesWarning = useMemo(() => data?.alertes.filter(a => a.niveau === 'warning').length ?? 0, [data])
  const nbAlertesTotal = nbAlertesDanger + nbAlertesWarning

  if (profileLoading || profile?.role === "client_assistant") return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" />
    </div>
  )

  const societes = data?.societes ?? []
  const monthly = data?.currentMonth
  const exerciseData = data?.exercice
  const tresorerie = data?.tresorerie
  const chartData = data?.chart ?? []
  const alertes = data?.alertes ?? []

  function KpiCard({ label, value, valueStr, icon: Icon, color, bg, hint }: { label: string; value?: number; valueStr?: string; icon: any; color: string; bg: string; hint?: string }) {
    return (
      <Card className="border-gray-100 hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`text-lg font-bold ${color} mt-0.5`}>
            {valueStr ? valueStr : value != null && value !== 0 ? fmt(value) : <span className="text-sm text-gray-400 font-normal">—</span>}
          </p>
          {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
        </CardContent>
      </Card>
    )
  }

  const skeleton = (count: number) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}><CardContent className="p-4">
          <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse mb-2" />
          <div className="h-3 bg-gray-100 rounded animate-pulse mb-2 w-2/3" />
          <div className="h-5 bg-gray-100 rounded animate-pulse w-full" />
        </CardContent></Card>
      ))}
    </div>
  )

  return (
    <div className="p-3 pt-12 sm:p-4 md:pt-6 md:p-6 space-y-4 sm:space-y-6 bg-gradient-to-br from-gray-50 via-white to-[#D4AF37]/5 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">
            Bonjour <span className="text-[#D4AF37]">{profile?.full_name?.split(" ")[0] || ""}</span>
          </h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">{formatMoisLabel(mois)}</p>
        </div>
        {societes.length > 1 && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full sm:w-56 border-[#0B0F2E]/10"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              <SelectItem value="all">Toutes mes sociétés</SelectItem>
            </SelectContent>
          </Select>
        )}
        {societes.length === 1 && (
          <div className="text-right">
            <p className="font-semibold text-[#0B0F2E]">{societes[0].nom}</p>
            {societes[0].brn && <p className="text-xs text-gray-400">BRN : {societes[0].brn}</p>}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && !loading && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Impossible de charger le tableau de bord</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setMois(m => m); setSelected(s => s) /* retrigger */ }}>Réessayer</Button>
          </CardContent>
        </Card>
      )}

      {/* Onboarding */}
      {!loading && societes.length === 0 && !error && (
        <Card className="border-2 border-dashed border-[#D4AF37]/40 bg-[#D4AF37]/5">
          <CardContent className="p-8 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-[#D4AF37]" />
            <div>
              <p className="text-lg font-bold text-[#0B0F2E]">Bienvenue sur LEXORA</p>
              <p className="text-sm text-gray-500 mt-1">Commencez par créer votre société pour accéder à tous les modules.</p>
            </div>
            <Link href="/client/societes"><Button className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90"><Plus className="w-4 h-4 mr-2" /> Créer ma société</Button></Link>
          </CardContent>
        </Card>
      )}

      {(societes.length > 0 || loading) && (
        <>
          {/* ROW 1: Ce mois — 7 KPIs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B0F2E]">Ce mois</h2>
                <Badge variant="outline" className="text-xs capitalize border-[#D4AF37]/40 text-[#D4AF37]">{formatMoisLabel(mois)}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMois(shiftMonth(mois, -1))}><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setMois(currentMoisDefault)}>Aujourd&apos;hui</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMois(shiftMonth(mois, 1))}><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
            {loading ? skeleton(7) : monthly ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                <KpiCard label="CA du mois" value={monthly.ca} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
                <KpiCard label="Dépenses du mois" value={monthly.depenses} icon={Receipt} color="text-red-500" bg="bg-red-50" />
                <KpiCard label="Bénéfice du mois" value={monthly.benefice} icon={TrendingUp} color={monthly.benefice >= 0 ? "text-green-600" : "text-red-500"} bg={monthly.benefice >= 0 ? "bg-green-50" : "bg-red-50"} />
                <Card className="border-gray-100">
                  <CardContent className="p-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
                      <Banknote className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-xs text-gray-500">Trésorerie</p>
                    <p className="text-lg font-bold text-blue-600 mt-0.5">
                      {tresorerie && tresorerie.total_mur !== 0 ? fmt(tresorerie.total_mur) : <span className="text-sm text-gray-400 font-normal">—</span>}
                    </p>
                    {tresorerie && tresorerie.comptes.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {tresorerie.comptes.slice(0, 3).map((c, i) => (
                          <p key={i} className="text-[10px] text-gray-400 truncate">{c.banque} {c.devise}: {c.solde.toLocaleString('fr-FR')} {c.devise}</p>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                <KpiCard label="TVA nette" value={monthly.tva_nette} icon={Receipt} color="text-purple-600" bg="bg-purple-50" />
                <KpiCard label="Masse salariale" valueStr={isCurrentMonth ? "Mois en cours" : undefined} value={isCurrentMonth ? undefined : monthly.salaires} icon={Users} color="text-orange-600" bg="bg-orange-50" />
                <Card className="cursor-pointer border-gray-100 hover:shadow-md transition-shadow" onClick={() => document.getElementById('alertes-section')?.scrollIntoView({ behavior: 'smooth' })}>
                  <CardContent className="p-4">
                    {(() => {
                      const bg = nbAlertesDanger > 0 ? "bg-red-50" : nbAlertesWarning > 0 ? "bg-orange-50" : "bg-green-50"
                      const iconColor = nbAlertesDanger > 0 ? "text-red-600" : nbAlertesWarning > 0 ? "text-orange-600" : "text-green-600"
                      const textColor = nbAlertesDanger > 0 ? "text-red-600" : nbAlertesWarning > 0 ? "text-orange-600" : "text-green-600"
                      return <>
                        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                          <Bell className={`w-4 h-4 ${iconColor}`} />
                        </div>
                        <p className="text-xs text-gray-500">Alertes</p>
                        <p className={`text-lg font-bold mt-0.5 ${textColor}`}>
                          {nbAlertesTotal > 0 ? `${nbAlertesTotal} alerte${nbAlertesTotal > 1 ? 's' : ''}` : "Aucune"}
                        </p>
                      </>
                    })()}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="p-4 text-center text-sm text-gray-400">Aucune donnée pour ce mois</CardContent></Card>
            )}
          </div>

          {/* ROW 2: Exercice fiscal */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[#0B0F2E]">Exercice fiscal</h2>
                {exerciseData && (
                  <Badge variant="outline" className="text-xs border-[#D4AF37]/40 text-[#D4AF37]">
                    Juil. {exerciseData.label.split("-")[0]} → Juin {exerciseData.label.split("-")[1]}
                  </Badge>
                )}
              </div>
            </div>
            {loading ? skeleton(4) : exerciseData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="CA exercice" value={exerciseData.ca} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
                <KpiCard label="Dépenses exercice" value={exerciseData.depenses} icon={Receipt} color="text-red-500" bg="bg-red-50" />
                <KpiCard label="Résultat net" value={exerciseData.resultat} icon={TrendingUp} color={exerciseData.resultat >= 0 ? "text-green-600" : "text-red-500"} bg={exerciseData.resultat >= 0 ? "bg-green-50" : "bg-red-50"} />
                <Card className="border-gray-100">
                  <CardContent className="p-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
                      <Banknote className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-xs text-gray-500">Trésorerie</p>
                    <p className="text-lg font-bold text-blue-600 mt-0.5">
                      {tresorerie && tresorerie.total_mur !== 0 ? fmt(tresorerie.total_mur) : <span className="text-sm text-gray-400 font-normal">—</span>}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="p-4 text-center text-sm text-gray-400">Aucune donnée pour cet exercice</CardContent></Card>
            )}
          </div>

          {/* Bar chart: last 6 months */}
          {!loading && chartData.length > 0 && (
            <Card className="border-gray-100">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-[#0B0F2E]">Évolution — 6 derniers mois</h2>
                  <Calendar className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="mois" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCompact(Number(v))} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="CA" name="CA" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Depenses" name="Dépenses" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Resultat" name="Résultat" fill="#D4AF37" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Alertes & Rappels */}
          <div id="alertes-section">
            <h2 className="font-bold text-[#0B0F2E] mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#D4AF37]" /> Alertes & Rappels
            </h2>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-3">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-1/2 mb-1" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                  </CardContent></Card>
                ))}
              </div>
            ) : alertes.length === 0 ? (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4 text-center text-sm text-green-700">
                  Aucune alerte — tout est en ordre
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {alertes.slice(0, 5).map(a => {
                  const borderColor = a.niveau === 'danger' ? 'border-l-red-500' : a.niveau === 'warning' ? 'border-l-orange-400' : 'border-l-blue-400'
                  const bgColor = a.niveau === 'danger' ? 'bg-red-50/50' : a.niveau === 'warning' ? 'bg-orange-50/50' : 'bg-blue-50/50'
                  const Icon = a.niveau === 'danger' ? AlertTriangle : a.niveau === 'warning' ? Bell : Info
                  const iconColor = a.niveau === 'danger' ? 'text-red-500' : a.niveau === 'warning' ? 'text-orange-500' : 'text-blue-500'
                  return (
                    <Card key={a.id} className={`border-l-4 ${borderColor} ${bgColor}`}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-start gap-3">
                          <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
                          <div>
                            <p className="text-sm font-semibold text-[#0B0F2E]">{a.titre}</p>
                            <p className="text-xs text-gray-500">{a.description}</p>
                            {a.montant ? <p className="text-xs font-mono text-gray-600 mt-0.5">{fmt(a.montant)}</p> : null}
                          </div>
                        </div>
                        {a.lien && (
                          <Link href={a.lien}>
                            <Button variant="ghost" size="sm" className="text-xs gap-1">
                              <ExternalLink className="w-3 h-3" /> Voir
                            </Button>
                          </Link>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
                {alertes.length > 5 && (
                  <Link href="/client/alertes">
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      Voir toutes les alertes ({alertes.length})
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Documents récents */}
          {!loading && data?.documents && data.documents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-[#0B0F2E] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#D4AF37]" /> Documents récents
                </h2>
                <Link href="/client/documents">
                  <Button variant="ghost" size="sm" className="text-xs">Tous <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </Link>
              </div>
              <div className="space-y-2">
                {data.documents.slice(0, 5).map(d => (
                  <Card key={d.id} className="border-gray-100">
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0B0F2E] truncate">{d.nom}</p>
                          <p className="text-xs text-gray-400">{new Date(d.date).toLocaleDateString('fr-FR')}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">{d.statut}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Mes sociétés */}
          {societes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-[#0B0F2E]">Mes Sociétés</h2>
                <Link href="/client/societes">
                  <Button variant="ghost" size="sm" className="text-xs">Gérer <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {societes.map(s => (
                  <Card key={s.id} className="border-l-4 border-l-[#0B0F2E] hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{s.nom}</p>
                        {s.brn && <p className="text-xs text-gray-400">BRN : {s.brn}</p>}
                        <Badge variant="outline" className="text-xs mt-1">{s.statut || 'active'}</Badge>
                      </div>
                      <Link href={`/client/societe?id=${s.id}`}>
                        <Button variant="ghost" size="icon" title="Fiche société"><Pencil className="w-4 h-4 text-gray-400" /></Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
                <Link href="/client/societes">
                  <Card className="border-dashed border-2 border-gray-200 hover:border-[#D4AF37] transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-2 text-gray-400 hover:text-[#D4AF37]">
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">Ajouter une société</span>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
