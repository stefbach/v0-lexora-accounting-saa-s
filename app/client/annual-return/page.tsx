"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, Save, FileDown, Building2, Users, Briefcase,
  DollarSign, BarChart3, CheckCircle, AlertTriangle, AlertCircle, Upload, FileText
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Societe {
  id: string
  nom: string
  brn?: string
  adresse?: string
  registered_office?: string
  date_incorporation?: string
  nature_activite?: string
  capital_social?: number
  nb_actions_total?: number
}

interface Director {
  id: string
  nom: string
  prenom?: string
  type: string
  nationalite?: string
  adresse?: string
  nic?: string
  date_nomination?: string
  actif: boolean
}

interface Shareholder {
  id: string
  nom: string
  prenom?: string
  type_personne: string
  nationalite?: string
  nb_actions: number
  type_actions: string
  valeur_nominale: number
  pourcentage?: number
  actif: boolean
}

interface AnnualReturnData {
  // Company Info (Sheet 1)
  company_name: string
  company_number: string
  company_type: string
  listed_on_exchange: boolean
  date_agm: string
  date_annual_return: string
  registered_office: string
  postal_address: string
  // Shares (Sheet 2)
  par_value_shares: {
    class: string; number: number; consideration: string; paid_up: number; currency: string
  }[]
  no_par_value_shares: {
    class: string; number: number; consideration: string; paid_up: number; currency: string
  }[]
  amount_received_on_issue: string
  stated_capital: string
  // Capital Details (Sheet 3)
  shares_forfeited: number
  shares_purchased: number
  treasury_shares: number
  shares_redeemed: number
  total_indebtedness: string
  // Directors & Secretary (Sheet 4)
  directors: {
    name: string; nationality: string; resident: boolean; citizen: boolean;
    occupation: string; other_directorship: string
  }[]
  secretary: { name: string; address: string }
  // Financial Summary (Sheet 5)
  total_revenue: number
  total_expenses: number
  net_profit: number
  total_assets: number
  total_liabilities: number
}

interface PriorYearFinancials {
  total_revenue: number
  total_expenses: number
  net_profit: number
  total_assets: number
  total_liabilities: number
}

const DEFAULT_DATA: AnnualReturnData = {
  company_name: "",
  company_number: "",
  company_type: "Small Private Company",
  listed_on_exchange: false,
  date_agm: "",
  date_annual_return: new Date().toISOString().split("T")[0],
  registered_office: "",
  postal_address: "",
  par_value_shares: [],
  no_par_value_shares: [],
  amount_received_on_issue: "0.00",
  stated_capital: "0.00",
  shares_forfeited: 0,
  shares_purchased: 0,
  treasury_shares: 0,
  shares_redeemed: 0,
  total_indebtedness: "0.00",
  directors: [],
  secretary: {
    name: "",
    address: ""
  },
  total_revenue: 0,
  total_expenses: 0,
  net_profit: 0,
  total_assets: 0,
  total_liabilities: 0,
}

export default function AnnualReturnPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState<string>("")
  const [annee, setAnnee] = useState<number>(new Date().getFullYear())
  const [data, setData] = useState<AnnualReturnData>({ ...DEFAULT_DATA })
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importingPdf, setImportingPdf] = useState(false)
  const [importMessage, setImportMessage] = useState("")
  const [priorYear, setPriorYear] = useState<PriorYearFinancials | null>(null)

  const handleImportPdf = async (file: File) => {
    setImportingPdf(true)
    setImportMessage("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      if (selectedSociete) formData.append("societe_id", selectedSociete)
      formData.append("hint", "Annual Return - Companies Act - Registrar of Companies Mauritius")
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
      if (res.ok) {
        const result = await res.json()
        const parsed = result?.n8n_result || result?.data || result
        if (parsed) {
          setData(prev => ({
            ...prev,
            ...(parsed.company_name && { company_name: parsed.company_name }),
            ...(parsed.company_number && { company_number: parsed.company_number }),
            ...(parsed.company_type && { company_type: parsed.company_type }),
            ...(parsed.registered_office && { registered_office: parsed.registered_office }),
            ...(parsed.postal_address && { postal_address: parsed.postal_address }),
            ...(parsed.date_agm && { date_agm: parsed.date_agm }),
            ...(parsed.date_annual_return && { date_annual_return: parsed.date_annual_return }),
            ...(parsed.stated_capital && { stated_capital: parsed.stated_capital }),
            ...(parsed.amount_received_on_issue && { amount_received_on_issue: parsed.amount_received_on_issue }),
            ...(parsed.total_indebtedness && { total_indebtedness: parsed.total_indebtedness }),
            ...(parsed.listed_on_exchange !== undefined && { listed_on_exchange: Boolean(parsed.listed_on_exchange) }),
            ...(parsed.par_value_shares && Array.isArray(parsed.par_value_shares) && { par_value_shares: parsed.par_value_shares }),
            ...(parsed.no_par_value_shares && Array.isArray(parsed.no_par_value_shares) && { no_par_value_shares: parsed.no_par_value_shares }),
            ...(parsed.total_revenue !== undefined && { total_revenue: Number(parsed.total_revenue) || 0 }),
            ...(parsed.total_expenses !== undefined && { total_expenses: Number(parsed.total_expenses) || 0 }),
            ...(parsed.net_profit !== undefined && { net_profit: Number(parsed.net_profit) || 0 }),
            ...(parsed.total_assets !== undefined && { total_assets: Number(parsed.total_assets) || 0 }),
            ...(parsed.total_liabilities !== undefined && { total_liabilities: Number(parsed.total_liabilities) || 0 }),
            ...(parsed.directors && Array.isArray(parsed.directors) && { directors: parsed.directors }),
            ...(parsed.secretary && { secretary: parsed.secretary }),
          }))
          // Also set as prior year data for comparative display
          if (parsed.total_revenue !== undefined || parsed.total_assets !== undefined) {
            setPriorYear({
              total_revenue: Number(parsed.total_revenue) || 0,
              total_expenses: Number(parsed.total_expenses) || 0,
              net_profit: Number(parsed.net_profit) || 0,
              total_assets: Number(parsed.total_assets) || 0,
              total_liabilities: Number(parsed.total_liabilities) || 0,
            })
          }
        }
        setImportMessage("PDF importe avec succes. Verifiez les champs pre-remplis.")
      } else {
        setImportMessage("Erreur lors de l'import du PDF.")
      }
    } catch {
      setImportMessage("Erreur lors de l'import du PDF.")
    } finally {
      setImportingPdf(false)
    }
  }

  // Fetch societes
  useEffect(() => {
    fetch("/api/client/societes")
      .then(r => r.json())
      .then(json => {
        const list = json.societes || []
        setSocietes(list)
        if (list.length === 1) setSelectedSociete(list[0].id)
        else if (list.length > 1) setSelectedSociete(list[0].id)
      })
      .catch(() => setSocietes([]))
      .finally(() => setFetching(false))
  }, [])

  // Fetch data when societe is selected
  const fetchAllData = useCallback(async () => {
    if (!selectedSociete) return
    setFetching(true)
    setError(null)

    try {
      // Determine exercice for this annual return year
      const exercice = `${annee - 1}-${annee}`
      const prevExercice = `${annee - 2}-${annee - 1}`

      const [arRes, dirRes, shRes, finRes, prevFinRes, prevArRes] = await Promise.all([
        fetch(`/api/comptable/roc/annual-return?societe_id=${selectedSociete}&annee=${annee}`).then(r => r.json()),
        fetch(`/api/comptable/roc/administrateurs?societe_id=${selectedSociete}&actif=true`).then(r => r.json()),
        fetch(`/api/comptable/roc/actionnaires?societe_id=${selectedSociete}&actif=true`).then(r => r.json()),
        fetch(`/api/client/financial?societe_id=${selectedSociete}&exercice=${exercice}`).then(r => r.json()).catch(() => ({ financial: null })),
        fetch(`/api/client/financial?societe_id=${selectedSociete}&exercice=${prevExercice}`).then(r => r.json()).catch(() => ({ financial: null })),
        fetch(`/api/comptable/roc/annual-return?societe_id=${selectedSociete}&annee=${annee - 1}`).then(r => r.json()).catch(() => ({})),
      ])

      // Set prior year financials for comparative display
      const prevFin = prevFinRes.financial
      const prevAr = prevArRes.annual_returns?.[0]
      if (prevFin || prevAr) {
        setPriorYear({
          total_revenue: prevAr?.chiffre_affaires || prevFin?.totalRevenue || 0,
          total_expenses: prevFin?.totalExpenses || 0,
          net_profit: prevAr?.resultat_net || (prevFin ? (prevFin.totalRevenue || 0) - (prevFin.totalExpenses || 0) : 0),
          total_assets: prevAr?.actif_total || prevFin?.totalAssets || 0,
          total_liabilities: prevAr?.passif_total || prevFin?.totalLiabilities || 0,
        })
      } else {
        setPriorYear(null)
      }

      const soc = societes.find(s => s.id === selectedSociete)
      const ar = arRes.annual_returns?.[0]
      const directors: Director[] = dirRes.administrateurs || []
      const shareholders: Shareholder[] = shRes.actionnaires || []
      const fin = finRes.financial

      // Build no-par-value shares from shareholders
      const shareMap = new Map<string, { class: string; number: number; consideration: string; paid_up: number; currency: string }>()
      shareholders.forEach(sh => {
        const cls = sh.type_actions === "ordinaires" ? "Ordinary" :
          sh.type_actions === "preferentielles" ? "Preference" : "Redeemable"
        const existing = shareMap.get(cls)
        if (existing) {
          existing.number += sh.nb_actions
          existing.paid_up += sh.nb_actions
        } else {
          shareMap.set(cls, {
            class: cls, number: sh.nb_actions,
            consideration: "0.00", paid_up: sh.nb_actions, currency: "MUR"
          })
        }
      })

      const noParShares = Array.from(shareMap.values())

      // Map directors
      const mappedDirectors = directors
        .filter(d => d.type === "director")
        .map(d => ({
          name: [d.nom, d.prenom].filter(Boolean).join(" "),
          nationality: d.nationalite || "MU",
          resident: true,
          citizen: d.nationalite === "mauricienne" || d.nationalite === "MU",
          occupation: "Director",
          other_directorship: "No",
        }))

      // Find secretary
      const sec = directors.find(d => d.type === "secretary")

      setData({
        company_name: soc?.nom || "",
        company_number: soc?.brn || "",
        company_type: "Small Private Company",
        listed_on_exchange: false,
        date_agm: ar?.date_agm || "",
        date_annual_return: ar?.date_soumission || new Date().toISOString().split("T")[0],
        registered_office: soc?.registered_office || soc?.adresse || "",
        postal_address: soc?.registered_office || soc?.adresse || "",
        par_value_shares: [],
        no_par_value_shares: noParShares,
        amount_received_on_issue: soc?.capital_social ? formatMUR(soc.capital_social) : "0.00",
        stated_capital: soc?.capital_social ? formatMUR(soc.capital_social) : "0.00",
        shares_forfeited: 0,
        shares_purchased: 0,
        treasury_shares: 0,
        shares_redeemed: 0,
        total_indebtedness: "0.00",
        directors: mappedDirectors,
        secretary: sec
          ? { name: [sec.nom, sec.prenom].filter(Boolean).join(" "), address: sec.adresse || "" }
          : { name: "", address: "" },
        total_revenue: ar?.chiffre_affaires || fin?.totalRevenue || 0,
        total_expenses: fin?.totalExpenses || 0,
        net_profit: ar?.resultat_net || fin?.netProfit || 0,
        total_assets: ar?.actif_total || fin?.totalAssets || 0,
        total_liabilities: ar?.passif_total || fin?.totalLiabilities || 0,
      })
    } catch (err) {
      console.error("Failed to fetch annual return data:", err)
      // Keep defaults
    } finally {
      setFetching(false)
    }
  }, [selectedSociete, annee, societes])

  useEffect(() => {
    if (selectedSociete) fetchAllData()
  }, [selectedSociete, annee, fetchAllData])

  // Save handler
  const handleSave = async () => {
    if (!selectedSociete) return
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const res = await fetch("/api/comptable/roc/annual-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: selectedSociete,
          annee,
          date_agm: data.date_agm || null,
          date_soumission: data.date_annual_return || null,
          statut: "en_cours",
          actif_total: data.total_assets,
          passif_total: data.total_liabilities,
          chiffre_affaires: data.total_revenue,
          resultat_net: data.net_profit,
          notes: JSON.stringify({
            company_type: data.company_type,
            registered_office: data.registered_office,
            postal_address: data.postal_address,
            par_value_shares: data.par_value_shares,
            no_par_value_shares: data.no_par_value_shares,
            stated_capital: data.stated_capital,
            amount_received_on_issue: data.amount_received_on_issue,
            shares_forfeited: data.shares_forfeited,
            shares_purchased: data.shares_purchased,
            treasury_shares: data.treasury_shares,
            shares_redeemed: data.shares_redeemed,
            total_indebtedness: data.total_indebtedness,
            directors: data.directors,
            secretary: data.secretary,
          }),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erreur lors de la sauvegarde")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  // Export PDF
  const handleExportPDF = () => {
    window.print()
  }

  // Update helpers
  const updateField = (field: keyof AnnualReturnData, value: unknown) => {
    setData(prev => ({ ...prev, [field]: value }))
  }

  const updateDirector = (index: number, field: string, value: unknown) => {
    setData(prev => {
      const dirs = [...prev.directors]
      dirs[index] = { ...dirs[index], [field]: value }
      return { ...prev, directors: dirs }
    })
  }

  const updateNoParShare = (index: number, field: string, value: unknown) => {
    setData(prev => {
      const shares = [...prev.no_par_value_shares]
      shares[index] = { ...shares[index], [field]: value }
      return { ...prev, no_par_value_shares: shares }
    })
  }

  // Loading state
  if (profileLoading || (fetching && societes.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  // Access control
  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>
          Vous n&apos;avez pas acc&egrave;s &agrave; cette section
        </h1>
        <Link href="/client" className="text-sm underline" style={{ color: GOLD }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto print:p-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Annual Return (ROC)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Companies Act - Registrar of Companies, Mauritius
          </p>
        </div>
        <div className="flex items-center gap-3">
          {societes.length > 1 && (
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Choisir une societe" />
              </SelectTrigger>
              <SelectContent>
                {societes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={String(annee)} onValueChange={v => setAnnee(Number(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSave}
            disabled={saving || !selectedSociete}
            style={{ backgroundColor: NAVY }}
            className="text-white hover:opacity-90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Sauvegarder
          </Button>
          <Button
            onClick={handleExportPDF}
            variant="outline"
            style={{ borderColor: GOLD, color: GOLD }}
            className="hover:bg-[#D4AF37]/10"
          >
            <FileDown className="h-4 w-4 mr-2" />
            Exporter PDF
          </Button>
        </div>
      </div>

      {/* PDF Import Section */}
      <Card className="border-2 border-dashed print:hidden" style={{ borderColor: GOLD }}>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" style={{ color: GOLD }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>Importer PDF officiel</p>
                <p className="text-xs text-gray-500">Importez votre Annual Return officiel (PDF) pour pre-remplir automatiquement le formulaire</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".pdf"
                id="pdf-import-annual-return"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleImportPdf(file)
                  e.target.value = ""
                }}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("pdf-import-annual-return")?.click()}
                disabled={importingPdf}
                style={{ borderColor: GOLD, color: NAVY }}
                className="flex items-center gap-2"
              >
                {importingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importingPdf ? "Import en cours..." : "Choisir un PDF"}
              </Button>
            </div>
          </div>
          {importMessage && (
            <div className={`flex items-center gap-2 text-sm mt-3 ${importMessage.includes("Erreur") ? "text-red-600" : "text-green-700"}`}>
              {importMessage.includes("Erreur") ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{importMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status messages */}
      {saved && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle className="h-4 w-4" />
          Annual Return sauvegarde avec succes
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Print header */}
      <div className="hidden print:block text-center mb-6">
        <h1 className="text-xl font-bold">ANNUAL RETURN</h1>
        <p className="text-sm">Companies Act 2001 - Registrar of Companies, Mauritius</p>
        <p className="text-sm mt-1">Year: {annee} | {data.company_name} ({data.company_number})</p>
      </div>

      {fetching ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
        </div>
      ) : (
        <Tabs defaultValue="company-info" className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto gap-1 print:hidden">
            <TabsTrigger value="company-info" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Building2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Infos</span> Societe
            </TabsTrigger>
            <TabsTrigger value="shares" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <DollarSign className="h-3.5 w-3.5" />
              Actions & Capital
            </TabsTrigger>
            <TabsTrigger value="capital-details" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Briefcase className="h-3.5 w-3.5" />
              Details Capital
            </TabsTrigger>
            <TabsTrigger value="directors" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" />
              Dirigeants
            </TabsTrigger>
            <TabsTrigger value="financial" className="flex items-center gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5" />
              Financier
            </TabsTrigger>
          </TabsList>

          {/* ==================== TAB 1: Company Info ==================== */}
          <TabsContent value="company-info" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                  <Building2 className="h-5 w-5" style={{ color: GOLD }} />
                  Sheet 1 - Company Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Company Name</label>
                    <Input
                      value={data.company_name}
                      onChange={e => updateField("company_name", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Company Number</label>
                    <Input
                      value={data.company_number}
                      onChange={e => updateField("company_number", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Type of Company</label>
                    <Select
                      value={data.company_type}
                      onValueChange={v => updateField("company_type", v)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Small Private Company">Small Private Company</SelectItem>
                        <SelectItem value="Private Company">Private Company</SelectItem>
                        <SelectItem value="Public Company">Public Company</SelectItem>
                        <SelectItem value="GBC1">GBC1</SelectItem>
                        <SelectItem value="GBC2">GBC2</SelectItem>
                        <SelectItem value="Foreign Company">Foreign Company</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Listed on Securities Exchange</label>
                    <Select
                      value={data.listed_on_exchange ? "yes" : "no"}
                      onValueChange={v => updateField("listed_on_exchange", v === "yes")}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Date of AGM</label>
                    <Input
                      type="date"
                      value={data.date_agm}
                      onChange={e => updateField("date_agm", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Date of Annual Return</label>
                    <Input
                      type="date"
                      value={data.date_annual_return}
                      onChange={e => updateField("date_annual_return", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Registered Office</h3>
                  <Input
                    value={data.registered_office}
                    onChange={e => updateField("registered_office", e.target.value)}
                  />
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Postal Address</h3>
                  <Input
                    value={data.postal_address}
                    onChange={e => updateField("postal_address", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 2: Shares & Stated Capital ==================== */}
          <TabsContent value="shares" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                  <DollarSign className="h-5 w-5" style={{ color: GOLD }} />
                  Sheet 2 - Summary of Shares &amp; Stated Capital
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Par Value Shares */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    Par Value Shares
                    <Badge variant="secondary" className="text-xs">Section A</Badge>
                  </h3>
                  {data.par_value_shares.length === 0 ? (
                    <div className="text-sm text-gray-400 italic p-4 border border-dashed rounded-lg text-center">
                      No par value shares issued
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Class</TableHead>
                          <TableHead>Number</TableHead>
                          <TableHead>Par Value</TableHead>
                          <TableHead>Paid Up</TableHead>
                          <TableHead>Currency</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.par_value_shares.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell>{s.class}</TableCell>
                            <TableCell>{s.number}</TableCell>
                            <TableCell>{s.consideration}</TableCell>
                            <TableCell>{s.paid_up}</TableCell>
                            <TableCell>{s.currency}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {/* No Par Value Shares */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: NAVY }}>
                    No Par Value Shares
                    <Badge variant="secondary" className="text-xs">Section B</Badge>
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Class of Shares</TableHead>
                        <TableHead>Number of Shares</TableHead>
                        <TableHead>Consideration (other than cash)</TableHead>
                        <TableHead>Number Paid Up</TableHead>
                        <TableHead>Currency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.no_par_value_shares.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Input
                              value={s.class}
                              onChange={e => updateNoParShare(i, "class", e.target.value)}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={s.number}
                              onChange={e => updateNoParShare(i, "number", Number(e.target.value))}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={s.consideration}
                              onChange={e => updateNoParShare(i, "consideration", e.target.value)}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={s.paid_up}
                              onChange={e => updateNoParShare(i, "paid_up", Number(e.target.value))}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={s.currency}
                              onChange={e => updateNoParShare(i, "currency", e.target.value)}
                              className="w-20"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() =>
                      setData(prev => ({
                        ...prev,
                        no_par_value_shares: [
                          ...prev.no_par_value_shares,
                          { class: "Ordinary", number: 0, consideration: "0.00", paid_up: 0, currency: "MUR" }
                        ],
                      }))
                    }
                  >
                    + Ajouter une classe
                  </Button>
                </div>

                {/* Amount & Stated Capital */}
                <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Amount Received on Issue of Shares (MUR)</label>
                    <Input
                      value={data.amount_received_on_issue}
                      onChange={e => updateField("amount_received_on_issue", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Stated Capital (MUR)</label>
                    <Input
                      value={data.stated_capital}
                      onChange={e => updateField("stated_capital", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 3: Capital Details ==================== */}
          <TabsContent value="capital-details" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                  <Briefcase className="h-5 w-5" style={{ color: GOLD }} />
                  Sheet 3 - Capital Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: NAVY }}>
                    Shares Status
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Shares Forfeited</label>
                      <Input
                        type="number"
                        value={data.shares_forfeited}
                        onChange={e => updateField("shares_forfeited", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Shares Purchased by Company</label>
                      <Input
                        type="number"
                        value={data.shares_purchased}
                        onChange={e => updateField("shares_purchased", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Treasury Shares</label>
                      <Input
                        type="number"
                        value={data.treasury_shares}
                        onChange={e => updateField("treasury_shares", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Shares Redeemed</label>
                      <Input
                        type="number"
                        value={data.shares_redeemed}
                        onChange={e => updateField("shares_redeemed", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: NAVY }}>
                    Indebtedness
                  </h3>
                  <div className="max-w-md">
                    <label className="text-sm font-medium text-gray-700">Total Indebtedness (MUR)</label>
                    <Input
                      value={data.total_indebtedness}
                      onChange={e => updateField("total_indebtedness", e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Summary card */}
                <div className="border-t pt-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold mb-2" style={{ color: NAVY }}>Summary</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Forfeited</span>
                        <p className="font-semibold">{data.shares_forfeited}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Purchased</span>
                        <p className="font-semibold">{data.shares_purchased}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Treasury</span>
                        <p className="font-semibold">{data.treasury_shares}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Redeemed</span>
                        <p className="font-semibold">{data.shares_redeemed}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 4: Directors & Secretary ==================== */}
          <TabsContent value="directors" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                  <Users className="h-5 w-5" style={{ color: GOLD }} />
                  Sheet 4 - Directors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Full Name</TableHead>
                        <TableHead>Nationality</TableHead>
                        <TableHead>Resident</TableHead>
                        <TableHead>Citizen</TableHead>
                        <TableHead>Occupation</TableHead>
                        <TableHead>Other Directorship</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.directors.map((dir, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Input
                              value={dir.name}
                              onChange={e => updateDirector(i, "name", e.target.value)}
                              className="min-w-[200px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={dir.nationality}
                              onChange={e => updateDirector(i, "nationality", e.target.value)}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={dir.resident ? "yes" : "no"}
                              onValueChange={v => updateDirector(i, "resident", v === "yes")}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={dir.citizen ? "yes" : "no"}
                              onValueChange={v => updateDirector(i, "citizen", v === "yes")}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="yes">Yes</SelectItem>
                                <SelectItem value="no">No</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={dir.occupation}
                              onChange={e => updateDirector(i, "occupation", e.target.value)}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={dir.other_directorship}
                              onChange={e => updateDirector(i, "other_directorship", e.target.value)}
                              className="w-24"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    setData(prev => ({
                      ...prev,
                      directors: [
                        ...prev.directors,
                        { name: "", nationality: "MU", resident: true, citizen: true, occupation: "Director", other_directorship: "No" }
                      ],
                    }))
                  }
                >
                  + Ajouter un directeur
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                  <Briefcase className="h-5 w-5" style={{ color: GOLD }} />
                  Secretary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Name</label>
                    <Input
                      value={data.secretary.name}
                      onChange={e => setData(prev => ({
                        ...prev,
                        secretary: { ...prev.secretary, name: e.target.value }
                      }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Address</label>
                    <Input
                      value={data.secretary.address}
                      onChange={e => setData(prev => ({
                        ...prev,
                        secretary: { ...prev.secretary, address: e.target.value }
                      }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB 5: Financial Summary ==================== */}
          <TabsContent value="financial" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color: NAVY }}>
                  <BarChart3 className="h-5 w-5" style={{ color: GOLD }} />
                  Sheet 5 - Financial Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Revenue & Expenses */}
                <div>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: NAVY }}>
                    Income Statement
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Revenue (MUR)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={data.total_revenue}
                        onChange={e => updateField("total_revenue", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Expenses (MUR)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={data.total_expenses}
                        onChange={e => updateField("total_expenses", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Net Profit / (Loss) (MUR)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={data.net_profit}
                        onChange={e => updateField("net_profit", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Balance Sheet */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: NAVY }}>
                    Balance Sheet
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Assets (MUR)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={data.total_assets}
                        onChange={e => updateField("total_assets", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Liabilities (MUR)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={data.total_liabilities}
                        onChange={e => updateField("total_liabilities", Number(e.target.value))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Summary Cards with comparative figures */}
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                      { label: "Revenue", value: data.total_revenue, prev: priorYear?.total_revenue, color: "#16a34a" },
                      { label: "Expenses", value: data.total_expenses, prev: priorYear?.total_expenses, color: "#dc2626" },
                      { label: "Net Profit", value: data.net_profit, prev: priorYear?.net_profit, color: data.net_profit >= 0 ? "#16a34a" : "#dc2626" },
                      { label: "Assets", value: data.total_assets, prev: priorYear?.total_assets, color: NAVY },
                      { label: "Liabilities", value: data.total_liabilities, prev: priorYear?.total_liabilities, color: "#9333ea" },
                    ].map(item => {
                      const variance = (item.prev !== undefined && item.prev !== 0)
                        ? ((item.value - item.prev) / Math.abs(item.prev)) * 100
                        : null
                      return (
                        <div key={item.label} className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-xs text-gray-500">{item.label}</p>
                          <p className="text-sm font-bold mt-1" style={{ color: item.color }}>
                            {formatMUR(item.value)} MUR
                          </p>
                          {item.prev !== undefined && (
                            <div className="mt-1">
                              <p className="text-xs text-gray-400">Prior: {formatMUR(item.prev)}</p>
                              {variance !== null && (
                                <p className="text-xs font-mono" style={{ color: variance >= 0 ? "#16a34a" : "#dc2626" }}>
                                  {variance >= 0 ? "+" : ""}{variance.toFixed(1)}%
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
