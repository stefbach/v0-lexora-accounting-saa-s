"use client"

import { useState, useCallback, useEffect } from "react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Upload,
  FileText,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Lightbulb,
  BarChart3,
  Wallet,
  CircleDollarSign,
  Banknote,
  ArrowRight,
  Clock,
  Check,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertData {
  id: string
  niveau: "red" | "orange" | "blue"
  message: string
}

interface ActionData {
  quoi: string
  pourQuand: string
  combien: string
  fait: boolean
}

interface DocumentData {
  id: string
  nom: string
  date: string
  statut: string
}

interface UploadData {
  id: string
  nom: string
  date: string
  statut: string
}

interface KpiData {
  chiffreAffaires: number | null
  depenses: number | null
  benefice: number | null
  tresorerie: number | null
  tendanceCA: string | null
}

interface BriefData {
  resume_texte: string | null
  conseil_texte: string | null
}

// ---------------------------------------------------------------------------
// Doc status badge
// ---------------------------------------------------------------------------

function DocStatutBadge({ statut }: { statut: string }) {
  switch (statut) {
    case "Classe":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" /> Classe
        </Badge>
      )
    case "Analyse en cours":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Analyse en cours
        </Badge>
      )
    case "Question du comptable":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Question
        </Badge>
      )
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

function UploadStatutBadge({ statut }: { statut: string }) {
  switch (statut) {
    case "Recu":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Recu</Badge>
    case "En cours":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> En cours
        </Badge>
      )
    case "Traite":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Traite</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Client User -- simple view
// ---------------------------------------------------------------------------

function ClientUserDashboard({ firstName }: { firstName: string }) {
  const [dragOver, setDragOver] = useState(false)
  const [recentUploads, setRecentUploads] = useState<UploadData[]>([])
  const [loadingUploads, setLoadingUploads] = useState(true)

  useEffect(() => {
    fetch("/api/client/societes")
      .then((r) => r.json())
      .then(() => {
        // No upload-list endpoint yet -- show empty state
        setRecentUploads([])
      })
      .catch(() => setRecentUploads([]))
      .finally(() => setLoadingUploads(false))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
        Bonjour {firstName}
      </h1>
      <p className="text-muted-foreground">
        Deposez vos documents ci-dessous, votre comptable s{"'"}en occupe.
      </p>

      {/* Upload zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
          ${dragOver
            ? "border-[#D4AF37] bg-[#D4AF37]/10"
            : "border-gray-300 hover:border-[#D4AF37] hover:bg-[#D4AF37]/5"
          }
        `}
      >
        <Upload
          className="h-12 w-12 mx-auto mb-4"
          style={{ color: dragOver ? "#D4AF37" : "#0B0F2E" }}
        />
        <p className="text-lg font-semibold" style={{ color: "#0B0F2E" }}>
          Deposez vos fichiers ici
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          ou cliquez pour choisir un fichier
        </p>
        <Button className="mt-4 text-white" style={{ backgroundColor: "#D4AF37" }}>
          <Upload className="h-4 w-4 mr-2" />
          Choisir un fichier
        </Button>
      </div>

      {/* Recent uploads */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#0B0F2E" }}>
          Mes envois recents
        </h2>
        <Card>
          <CardContent className="p-0">
            {loadingUploads ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
              </div>
            ) : recentUploads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Aucun envoi recent. Deposez vos premiers documents ci-dessus.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fichier</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUploads.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          {u.nom}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.date}</TableCell>
                      <TableCell>
                        <UploadStatutBadge statut={u.statut} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Client Admin -- full dashboard with 6 sections
// ---------------------------------------------------------------------------

function ClientAdminDashboard({ firstName, societe }: { firstName: string; societe: string }) {
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [actions, setActions] = useState<ActionData[]>([])
  const [documents, setDocuments] = useState<DocumentData[]>([])
  const [kpis, setKpis] = useState<KpiData>({
    chiffreAffaires: null,
    depenses: null,
    benefice: null,
    tresorerie: null,
    tendanceCA: null,
  })
  const [brief, setBrief] = useState<BriefData>({ resume_texte: null, conseil_texte: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Fetch societes to get dossier context
        const socRes = await fetch("/api/client/societes")
        const socData = await socRes.json()
        const societes = socData.societes || []

        if (societes.length > 0) {
          const firstSociete = societes[0]
          const societeId = firstSociete.id

          // Fetch brief/summary data and financial data in parallel
          const now = new Date()
          const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

          const [briefResult, financialResult] = await Promise.allSettled([
            fetch("/api/brief-client", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: firstSociete.comptable?.id || "",
                societe_id: societeId,
                periode,
              }),
            }).then((r) => r.json()),
            fetch("/api/client/financial").then((r) => r.json()),
          ])

          // Process brief data
          if (briefResult.status === "fulfilled") {
            const briefData = briefResult.value
            if (briefData.success) {
              setBrief({
                resume_texte: briefData.resume_texte || null,
                conseil_texte: briefData.conseil_texte || null,
              })
              if (briefData.alertes && Array.isArray(briefData.alertes)) {
                setAlerts(
                  briefData.alertes.map((msg: string, i: number) => ({
                    id: `ba-${i}`,
                    niveau: i === 0 ? "red" as const : i === 1 ? "orange" as const : "blue" as const,
                    message: msg,
                  }))
                )
              }
            }
          }

          // Process financial data for KPIs
          if (financialResult.status === "fulfilled") {
            const finData = financialResult.value.financial
            if (finData) {
              setKpis({
                chiffreAffaires: finData.totalRevenue ?? null,
                depenses: finData.totalExpenses ?? null,
                benefice: finData.resultat ?? null,
                tresorerie: finData.totalBankMUR ?? null,
                tendanceCA: finData.lastMonthRevenue && finData.totalRevenue
                  ? `${finData.lastMonthRevenue > 0 ? "+" : ""}${Math.round(((finData.monthlyRevenue - finData.lastMonthRevenue) / finData.lastMonthRevenue) * 100)}% vs mois dernier`
                  : null,
              })
            }
          }
        }
      } catch {
        // API errors -- leave defaults
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  const currentMonth = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* ================================================================== */}
      {/* Section 1 -- Resume du mois */}
      {/* ================================================================== */}
      <Card className="overflow-hidden border-0 shadow-md">
        <CardHeader className="py-5 px-6" style={{ backgroundColor: "#0B0F2E" }}>
          <CardTitle className="text-white text-2xl">
            Bonjour {firstName}
          </CardTitle>
          <p className="text-white/70 text-sm mt-1">
            {societe} | {currentMonth}
          </p>
        </CardHeader>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold mb-2" style={{ color: "#D4AF37" }}>
            Resume du mois
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {brief.resume_texte
              ? brief.resume_texte
              : "Les donnees de votre tableau de bord seront disponibles une fois vos documents traites par votre comptable."}
          </p>
        </CardContent>
      </Card>

      {/* ================================================================== */}
      {/* Section 2 -- Mes 4 chiffres cles */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#0B0F2E" }}>
          Mes 4 chiffres cles
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" style={{ color: "#D4AF37" }} />
                Chiffre d{"'"}Affaires
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
                {kpis.chiffreAffaires !== null ? fmtMUR(kpis.chiffreAffaires) : "\u2014"}
              </div>
              {kpis.tendanceCA ? (
                <div className="flex items-center gap-1 mt-1 text-sm text-green-600">
                  <TrendingUp className="h-4 w-4" />
                  {kpis.tendanceCA}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Pas encore de donnees</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" style={{ color: "#D4AF37" }} />
                Depenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
                {kpis.depenses !== null ? fmtMUR(kpis.depenses) : "\u2014"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpis.depenses !== null ? "" : "Pas encore de donnees"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4" style={{ color: "#D4AF37" }} />
                Benefice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
                {kpis.benefice !== null ? fmtMUR(kpis.benefice) : "\u2014"}
              </div>
              {kpis.benefice !== null ? (
                <Badge className={`text-xs mt-1 ${kpis.benefice >= 0 ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                  {kpis.benefice >= 0 ? "Positif" : "Negatif"}
                </Badge>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Pas encore de donnees</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Banknote className="h-4 w-4" style={{ color: "#D4AF37" }} />
                Tresorerie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
                {kpis.tresorerie !== null ? fmtMUR(kpis.tresorerie) : "\u2014"}
              </div>
              {kpis.tresorerie !== null ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs mt-1">
                  Sain
                </Badge>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Pas encore de donnees</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ================================================================== */}
      {/* Section 3 -- Mes actions ce mois */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#0B0F2E" }}>
          Mes actions ce mois
        </h2>
        <Card>
          <CardContent className="p-0">
            {actions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Aucune action requise pour le moment.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Quoi faire</TableHead>
                    <TableHead className="font-semibold">Pour quand</TableHead>
                    <TableHead className="font-semibold">Combien</TableHead>
                    <TableHead className="font-semibold">Fait ?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actions.map((action, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium" style={{ color: "#0B0F2E" }}>
                        {action.quoi}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{action.pourQuand}</TableCell>
                      <TableCell className="font-medium">{action.combien}</TableCell>
                      <TableCell>
                        {action.fait ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 flex items-center gap-1 w-fit">
                            <Check className="h-3 w-3" /> Fait
                          </Badge>
                        ) : (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-1 w-fit">
                            <Clock className="h-3 w-3" /> A faire
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Section 4 -- Mes alertes */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#0B0F2E" }}>
          Mes alertes
        </h2>
        {alerts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Aucune alerte pour le moment.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const colors = {
                red: { border: "border-red-300", bg: "bg-red-50", dot: "bg-red-500" },
                orange: { border: "border-orange-300", bg: "bg-orange-50", dot: "bg-orange-500" },
                blue: { border: "border-blue-300", bg: "bg-blue-50", dot: "bg-blue-500" },
              }
              const c = colors[alert.niveau]
              return (
                <Card key={alert.id} className={`${c.border} ${c.bg}`}>
                  <CardContent className="py-4 flex items-center gap-3">
                    <span className={`inline-block h-3 w-3 rounded-full shrink-0 ${c.dot}`} />
                    <p className="text-sm">{alert.message}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* Section 5 -- Conseil du mois */}
      {/* ================================================================== */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#0B0F2E" }}>
          Conseil du mois
        </h2>
        <Card className="border-[#D4AF37]/30 bg-[#D4AF37]/5">
          <CardContent className="py-6 flex gap-4">
            <Lightbulb className="h-6 w-6 shrink-0 mt-0.5" style={{ color: "#D4AF37" }} />
            <div>
              {brief.conseil_texte ? (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {brief.conseil_texte}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Les conseils personnalises apparaitront ici une fois vos donnees analysees par votre comptable.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ================================================================== */}
      {/* Section 6 -- Documents recents */}
      {/* ================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: "#0B0F2E" }}>
            Documents recents
          </h2>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-sm"
            style={{ color: "#D4AF37" }}
          >
            <Link href="/client/documents">
              Voir tous les documents
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {documents.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Aucun document disponible pour le moment.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="font-semibold">Document</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          {doc.nom}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{doc.date}</TableCell>
                      <TableCell>
                        <DocStatutBadge statut={doc.statut} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ClientDashboard() {
  const { profile, loading } = useProfile()
  const [societe, setSociete] = useState<string>("")
  const [loadingSociete, setLoadingSociete] = useState(true)

  useEffect(() => {
    fetch("/api/client/societes")
      .then((r) => r.json())
      .then((data) => {
        const societes = data.societes || []
        if (societes.length > 0) {
          setSociete(societes[0].nom || "")
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSociete(false))
  }, [])

  if (loading || loadingSociete) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  const fullName = profile?.full_name || ""
  const firstName = fullName.split(" ")[0] || ""
  const isClientUser = profile?.role === "client_user"

  if (isClientUser) {
    return <ClientUserDashboard firstName={firstName} />
  }

  return <ClientAdminDashboard firstName={firstName} societe={societe || "Mon entreprise"} />
}
