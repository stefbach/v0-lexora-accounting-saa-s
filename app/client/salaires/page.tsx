"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, Users, FileText, Building2, Calculator, Download, Upload,
  Eye, CheckCircle, DollarSign, TrendingUp, AlertCircle
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"
}

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-yellow-100 text-yellow-800",
  valide: "bg-blue-100 text-blue-800",
  paye: "bg-green-100 text-green-800",
}

const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  valide: "Valid\u00e9",
  paye: "Pay\u00e9",
}

interface Societe { id: string; nom: string }
interface Employe { id: string; code: string; nom: string; prenom: string; poste?: string }
interface Bulletin {
  id: string
  employe_id: string
  societe_id: string
  periode: string
  salaire_brut: number
  salaire_net: number
  total_charges_patronales: number
  paye: number
  csg_salarie: number
  nsf_salarie: number
  statut: string
  employe?: { code: string; nom: string; prenom: string; poste?: string }
}

export default function ClientSalairesPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState<string>("")
  const [employes, setEmployes] = useState<Employe[]>([])
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [totaux, setTotaux] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [selectedPeriode, setSelectedPeriode] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [exportLoading, setExportLoading] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("bulletins")

  // Fetch societes
  useEffect(() => {
    fetch("/api/client/societes")
      .then((r) => r.json())
      .then((json) => {
        const list = json.societes || json.data || []
        setSocietes(list)
        if (list.length > 0 && !selectedSociete) {
          setSelectedSociete(list[0].id)
        }
      })
      .catch(() => setSocietes([]))
  }, [])

  // Fetch bulletins and employees when societe or periode changes
  const fetchData = useCallback(async () => {
    if (!selectedSociete) return
    setFetching(true)
    try {
      const [bulletinsRes, employesRes] = await Promise.all([
        fetch(`/api/rh/paie?societe_id=${selectedSociete}&periode=${selectedPeriode}`),
        fetch(`/api/rh/employes?societe_id=${selectedSociete}`),
      ])
      const bulletinsJson = await bulletinsRes.json()
      const employesJson = await employesRes.json()
      setBulletins(bulletinsJson.bulletins || [])
      setTotaux(bulletinsJson.totaux || null)
      setEmployes(employesJson.employes || employesJson.data || [])
    } catch {
      setBulletins([])
      setEmployes([])
    } finally {
      setFetching(false)
    }
  }, [selectedSociete, selectedPeriode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // KPI calculations
  const masseSalariale = totaux?.masse_salariale_brute || bulletins.reduce((s, b) => s + (Number(b.salaire_brut) || 0), 0)
  const masseNette = totaux?.masse_salariale_nette || bulletins.reduce((s, b) => s + (Number(b.salaire_net) || 0), 0)
  const chargesPatronales = totaux?.total_charges_patronales || bulletins.reduce((s, b) => s + (Number(b.total_charges_patronales) || 0), 0)
  const nbEmployes = employes.length

  // Batch calculation
  async function handleCalculerPaie() {
    if (!selectedSociete || !selectedPeriode) return
    setCalculating(true)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "calculer_batch",
          societe_id: selectedSociete,
          periode: selectedPeriode,
        }),
      })
      const json = await res.json()
      if (json.error) {
        alert("Erreur: " + json.error)
      } else {
        alert(`Paie calcul\u00e9e pour ${json.nb || 0} employ\u00e9(s)`)
        fetchData()
      }
    } catch {
      alert("Erreur lors du calcul")
    } finally {
      setCalculating(false)
    }
  }

  // Validate bulletin
  async function handleValider(employe_id: string) {
    try {
      await fetch("/api/rh/paie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "valider",
          employe_id,
          periode: selectedPeriode,
        }),
      })
      fetchData()
    } catch {
      alert("Erreur lors de la validation")
    }
  }

  // Export functions
  async function handleExport(type: string) {
    if (!selectedSociete || !selectedPeriode) return
    setExportLoading(type)
    try {
      const endpoint = type === "csg" ? "/api/rh/exports/csg-mra" :
                       type === "paye" ? "/api/rh/exports/paye-mra" :
                       "/api/rh/exports/virement"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: selectedSociete, periode: selectedPeriode }),
      })
      const json = await res.json()
      if (json.error) {
        alert("Erreur: " + json.error)
        return
      }
      // Download CSV
      const csvContent = json.detail_csv || json.csv || json.recap_csv || ""
      if (csvContent) {
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = json.filename_detail || json.filename || `export_${type}_${selectedPeriode}.csv`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      alert("Erreur export")
    } finally {
      setExportLoading(null)
    }
  }

  // Import payroll
  async function handleImport() {
    if (!importFile || !selectedSociete || !selectedPeriode) return
    setImportLoading(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append("file", importFile)
      formData.append("societe_id", selectedSociete)
      formData.append("periode", selectedPeriode)
      const res = await fetch("/api/rh/paie/import", { method: "POST", body: formData })
      const json = await res.json()
      setImportResult(json)
      if (!json.error) fetchData()
    } catch {
      setImportResult({ error: "Erreur lors de l'import" })
    } finally {
      setImportLoading(false)
    }
  }

  // View PDF
  function openPDF(bulletinId: string) {
    window.open(`/api/rh/paie/pdf?bulletin_id=${bulletinId}`, "_blank")
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Vous n&apos;avez pas acc&egrave;s &agrave; cette section.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Gestion de la paie
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulletins de paie, calcul et exports MRA
          </p>
        </div>
        <div className="flex items-center gap-3">
          {societes.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9">
                  <SelectValue placeholder="S&eacute;lectionner une soci&eacute;t&eacute;" />
                </SelectTrigger>
                <SelectContent>
                  {societes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              type="month"
              value={selectedPeriode}
              onChange={(e) => setSelectedPeriode(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Masse salariale brute</CardTitle>
            <DollarSign className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#1E2A4A" }}>{fmt(masseSalariale)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Employ&eacute;s</CardTitle>
            <Users className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#1E2A4A" }}>{nbEmployes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Charges patronales</CardTitle>
            <TrendingUp className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#C9A84C" }}>{fmt(chargesPatronales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Masse nette</CardTitle>
            <FileText className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#1E2A4A" }}>{fmt(masseNette)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bulletins">Bulletins</TabsTrigger>
          <TabsTrigger value="calculer">Calculer</TabsTrigger>
          <TabsTrigger value="exports">Exports & Import</TabsTrigger>
        </TabsList>

        {/* Tab: Bulletins */}
        <TabsContent value="bulletins">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>
                Bulletins de paie &mdash; {selectedPeriode} ({bulletins.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fetching ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#C9A84C" }} />
                </div>
              ) : bulletins.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Aucun bulletin pour cette p&eacute;riode.</p>
                  <p className="text-sm mt-1">Allez dans l&apos;onglet &quot;Calculer&quot; pour g&eacute;n&eacute;rer les bulletins.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employ&eacute;</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Brut</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulletins.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          {b.employe?.nom || ""} {b.employe?.prenom || ""}
                        </TableCell>
                        <TableCell>{b.employe?.code || ""}</TableCell>
                        <TableCell className="text-right">{fmt(Number(b.salaire_brut) || 0)}</TableCell>
                        <TableCell className="text-right">{fmt(Number(b.salaire_net) || 0)}</TableCell>
                        <TableCell className="text-right">{fmt(Number(b.paye) || 0)}</TableCell>
                        <TableCell>
                          <Badge className={STATUT_COLORS[b.statut] || "bg-gray-100 text-gray-600"}>
                            {STATUT_LABELS[b.statut] || b.statut}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPDF(b.id)}
                              title="Voir PDF"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {b.statut === "brouillon" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleValider(b.employe_id)}
                                title="Valider"
                              >
                                <CheckCircle className="h-4 w-4" style={{ color: "#22c55e" }} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Calculer */}
        <TabsContent value="calculer">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Calcul de paie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Lancez le calcul de paie pour tous les employ&eacute;s actifs de la soci&eacute;t&eacute; s&eacute;lectionn&eacute;e
                pour la p&eacute;riode <strong>{selectedPeriode}</strong>.
              </p>
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Soci&eacute;t&eacute; :</span>{" "}
                  <strong>{societes.find((s) => s.id === selectedSociete)?.nom || "---"}</strong>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">P&eacute;riode :</span>{" "}
                  <strong>{selectedPeriode}</strong>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Employ&eacute;s actifs :</span>{" "}
                  <strong>{nbEmployes}</strong>
                </div>
              </div>
              <Button
                onClick={handleCalculerPaie}
                disabled={calculating || !selectedSociete}
                style={{ backgroundColor: "#1E2A4A" }}
                className="text-white"
              >
                {calculating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Calcul en cours...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Calculer paie
                  </>
                )}
              </Button>
              {bulletins.length > 0 && (
                <div className="mt-4 p-4 rounded-lg border" style={{ borderColor: "#C9A84C33" }}>
                  <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>
                    R&eacute;sultat du dernier calcul
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Bulletins</p>
                      <p className="font-semibold">{bulletins.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Masse brute</p>
                      <p className="font-semibold">{fmt(masseSalariale)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Masse nette</p>
                      <p className="font-semibold">{fmt(masseNette)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Charges patronales</p>
                      <p className="font-semibold">{fmt(chargesPatronales)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Exports & Import */}
        <TabsContent value="exports">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Exports */}
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>Exports MRA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  G&eacute;n&eacute;rez les fichiers CSV pour les d&eacute;clarations MRA.
                </p>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("csg")}
                  disabled={!!exportLoading}
                >
                  {exportLoading === "csg" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export CSG / NSF MRA
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("paye")}
                  disabled={!!exportLoading}
                >
                  {exportLoading === "paye" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export PAYE MRA
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExport("virement")}
                  disabled={!!exportLoading}
                >
                  {exportLoading === "virement" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Virement bancaire
                </Button>
              </CardContent>
            </Card>

            {/* Import */}
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>Importer paie</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  Importez des bulletins de paie pr&eacute;-calcul&eacute;s depuis un logiciel externe (CSV).
                </p>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="import-file" className="text-sm">Fichier CSV</Label>
                    <Input
                      id="import-file"
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                      className="mt-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Colonnes attendues : employe_code, periode, salaire_brut, salaire_net, csg_salarie,
                    csg_patronal, nsf_salarie, nsf_patronal, paye, training_levy
                  </p>
                  <Button
                    onClick={handleImport}
                    disabled={!importFile || importLoading || !selectedSociete}
                    style={{ backgroundColor: "#C9A84C" }}
                    className="text-white w-full"
                  >
                    {importLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Import en cours...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Importer paie
                      </>
                    )}
                  </Button>
                  {importResult && (
                    <div className={`p-3 rounded-lg text-sm ${importResult.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                      {importResult.error ? (
                        <p>{importResult.error}</p>
                      ) : (
                        <>
                          <p className="font-medium">{importResult.imported || 0} bulletin(s) import&eacute;(s)</p>
                          {importResult.errors?.length > 0 && (
                            <ul className="mt-1 list-disc list-inside">
                              {importResult.errors.map((err: string, i: number) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
