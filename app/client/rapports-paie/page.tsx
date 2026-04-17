"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  Loader2, Building2, Download, Printer, CheckCircle, FileSpreadsheet,
  AlertTriangle, Banknote, Users, DollarSign
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
import { calculerPRGF, calculerNIT, PARAMS_MRA_DEFAUT } from "@/lib/rh/paie"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
}

interface Societe { id: string; nom: string }

interface BulletinData {
  id: string
  employe_id: string
  societe_id: string
  periode: string
  salaire_base: number
  salaire_brut: number
  salaire_net: number
  total_charges_patronales: number
  paye: number
  csg_salarie: number
  csg_patronal: number
  nsf_salarie: number
  nsf_patronal: number
  training_levy: number
  prgf: number
  total_emoluments?: number
  total_deductions: number
  heures_sup_montant: number
  transport_allowance: number
  petrol_allowance: number
  special_allowance_1: number
  special_allowance_2: number
  special_allowance_3: number
  salary_compensation_montant?: number
  statut: string
  employe?: {
    code: string
    nom: string
    prenom: string
    poste?: string
    nic?: string
    nid?: string
    banque?: string
    num_compte_banque?: string
    groupe?: string
    departement?: string
  }
}

const MOIS_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre"
]

const BANKS_MU = ["MCB", "SBM", "ABSA", "AfrAsia", "Bank One", "HSBC", "Barclays", "BCP", "MauBank", "Standard Chartered"]

function getPeriodeLabel(periode: string): string {
  const [y, m] = periode.split("-").map(Number)
  return `${MOIS_FR[m - 1]} ${y}`
}

export default function RapportsStatutairesPage() {
  const { profile, loading: profileLoading } = useProfile()
  const { societeId } = useSocieteActive()
  const [selectedPeriode, setSelectedPeriode] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [bulletins, setBulletins] = useState<BulletinData[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [fetching, setFetching] = useState(true)
  const [activeTab, setActiveTab] = useState("paye")

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!societeId) return
    setFetching(true)
    try {
      const [bulletinsRes, employesRes] = await Promise.all([
        fetch(`/api/rh/paie?societe_id=${societeId}&periode=${selectedPeriode}`),
        fetch(`/api/rh/employes?societe_id=${societeId}`),
      ])
      const bulletinsJson = await bulletinsRes.json()
      const employesJson = await employesRes.json()
      setBulletins(bulletinsJson.bulletins || [])
      setEmployes(employesJson.employes || employesJson.data || [])
    } catch {
      setBulletins([])
      setEmployes([])
    } finally {
      setFetching(false)
    }
  }, [societeId, selectedPeriode])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ===== PAYE Tab Data =====
  const payeData = bulletins.map((b) => ({
    code: b.employe?.code || "",
    nic: b.employe?.nic || "",
    nom: b.employe?.nom || "",
    prenom: b.employe?.prenom || "",
    contributions: Number(b.csg_salarie || 0) + Number(b.nsf_salarie || 0),
    wages: Number(b.salaire_brut || 0),
    taxable: Number(b.salaire_brut || 0) - Number(b.csg_salarie || 0) - Number(b.nsf_salarie || 0),
    paye: Number(b.paye || 0),
  }))
  const payeTotals = {
    contributions: payeData.reduce((s, r) => s + r.contributions, 0),
    wages: payeData.reduce((s, r) => s + r.wages, 0),
    taxable: payeData.reduce((s, r) => s + r.taxable, 0),
    paye: payeData.reduce((s, r) => s + r.paye, 0),
  }

  // ===== PRGF Tab Data =====
  const prgfData = bulletins.map((b) => {
    const wages = Number(b.salaire_base || 0)
    const allowances = Number(b.transport_allowance || 0) + Number(b.petrol_allowance || 0) +
      Number(b.special_allowance_1 || 0) + Number(b.special_allowance_2 || 0) +
      Number(b.special_allowance_3 || 0) + Number(b.salary_compensation_montant || 0)
    const commission = 0 // from bulletin if available
    const total = wages + allowances + commission
    const prgfCalc = calculerPRGF(total)
    return {
      nid: b.employe?.nid || b.employe?.nic || "",
      nom: b.employe?.nom || "",
      prenom: b.employe?.prenom || "",
      wages,
      allowances,
      commission,
      total,
      prgf: Number(b.prgf || prgfCalc.prgf),
    }
  })
  const prgfTotals = {
    wages: prgfData.reduce((s, r) => s + r.wages, 0),
    allowances: prgfData.reduce((s, r) => s + r.allowances, 0),
    commission: prgfData.reduce((s, r) => s + r.commission, 0),
    total: prgfData.reduce((s, r) => s + r.total, 0),
    prgf: prgfData.reduce((s, r) => s + r.prgf, 0),
  }

  // ===== Emoluments Tab Data =====
  const emolumentsData = bulletins.map((b) => ({
    code: b.employe?.code || "",
    nid: b.employe?.nid || b.employe?.nic || "",
    nom: b.employe?.nom || "",
    prenom: b.employe?.prenom || "",
    basic: Number(b.salaire_base || 0),
    overtime: Number(b.heures_sup_montant || 0),
    allowances: Number(b.transport_allowance || 0) + Number(b.petrol_allowance || 0) +
      Number(b.special_allowance_1 || 0) + Number(b.special_allowance_2 || 0) +
      Number(b.special_allowance_3 || 0) + Number(b.salary_compensation_montant || 0),
    total: Number(b.salaire_brut || 0),
  }))
  const emolumentsTotals = {
    basic: emolumentsData.reduce((s, r) => s + r.basic, 0),
    overtime: emolumentsData.reduce((s, r) => s + r.overtime, 0),
    allowances: emolumentsData.reduce((s, r) => s + r.allowances, 0),
    total: emolumentsData.reduce((s, r) => s + r.total, 0),
  }

  // ===== Bank Report Tab Data =====
  const bankData = bulletins.map((b) => {
    const emp = employes.find((e) => e.id === b.employe_id) || b.employe || {}
    return {
      code: b.employe?.code || emp.code || "",
      nid: b.employe?.nid || emp.nid || emp.nic || "",
      nom: b.employe?.nom || emp.nom || "",
      prenom: b.employe?.prenom || emp.prenom || "",
      groupe: emp.groupe || emp.group || "",
      departement: emp.departement || emp.department || "",
      banque: emp.banque || emp.bank || "",
      compte: emp.num_compte_banque || emp.account_no || "",
      netpay: Number(b.salaire_net || 0),
    }
  })

  const bankEmployees = bankData.filter((e) => e.banque && e.banque.trim() !== "")
  const cashEmployees = bankData.filter((e) => !e.banque || e.banque.trim() === "")

  // Group by bank
  const bankGroups: Record<string, typeof bankData> = {}
  bankEmployees.forEach((e) => {
    const bank = e.banque.toUpperCase().trim()
    if (!bankGroups[bank]) bankGroups[bank] = []
    bankGroups[bank].push(e)
  })

  const totalBankAmount = bankEmployees.reduce((s, e) => s + e.netpay, 0)
  const totalCashAmount = cashEmployees.reduce((s, e) => s + e.netpay, 0)

  // ===== NIT Tab Data =====
  const nitData = bulletins
    .map((b) => {
      const nit = calculerNIT(Number(b.salaire_brut || 0))
      return {
        code: b.employe?.code || "",
        nom: `${b.employe?.prenom || ""} ${b.employe?.nom || ""}`.trim(),
        basic: Number(b.salaire_base || 0),
        nit_amount: nit.montant,
        eligible: nit.eligible,
      }
    })
    .filter((r) => r.eligible)

  // ===== Export CSV =====
  function exportCSV(headers: string[], rows: string[][], filename: string) {
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPAYE() {
    exportCSV(
      ["Code", "NIC", "Nom", "Prenom", "Contributions", "Wages", "Taxable", "PAYE"],
      payeData.map((r) => [r.code, r.nic, r.nom, r.prenom, r.contributions.toFixed(2), r.wages.toFixed(2), r.taxable.toFixed(2), r.paye.toFixed(2)]),
      `PAYE_${selectedPeriode}.csv`
    )
  }

  function exportPRGF() {
    exportCSV(
      ["NID", "Nom", "Prenom", "Wages", "Allowances", "Commission", "Total", "PRGF"],
      prgfData.map((r) => [r.nid, r.nom, r.prenom, r.wages.toFixed(2), r.allowances.toFixed(2), r.commission.toFixed(2), r.total.toFixed(2), r.prgf.toFixed(2)]),
      `PRGF_${selectedPeriode}.csv`
    )
  }

  function exportEmoluments() {
    exportCSV(
      ["Code", "NID", "Nom", "Prenom", "Basic Salary", "Overtime", "Allowances", "Total Emoluments"],
      emolumentsData.map((r) => [r.code, r.nid, r.nom, r.prenom, r.basic.toFixed(2), r.overtime.toFixed(2), r.allowances.toFixed(2), r.total.toFixed(2)]),
      `Emoluments_${selectedPeriode}.csv`
    )
  }

  function exportBankReport() {
    const rows = bankEmployees.map((e) => [e.code, e.nid, e.nom, e.prenom, e.groupe, e.departement, e.banque, e.compte, e.netpay.toFixed(2)])
    exportCSV(
      ["Code", "NID", "Nom", "Prenom", "Group", "Department", "Bank", "Account No", "Net Pay"],
      rows,
      `Bank_Report_${selectedPeriode}.csv`
    )
  }

  function handlePrint() {
    window.print()
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return <RequireRole roles={NON_CLIENT_USER_ROLES}>{null}</RequireRole>
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
            Rapports Statutaires
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            PAYE, PRGF, Emoluments, Bank Report, NIT -- conforme MRA Mauritius
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={selectedPeriode}
            onChange={(e) => setSelectedPeriode(e.target.value)}
            className="h-9 w-[160px]"
          />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4" style={{ borderLeftColor: "#0B0F2E" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Employes</CardTitle>
            <Users className="h-5 w-5" style={{ color: "#0B0F2E" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#0B0F2E" }}>{bulletins.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: "#D4AF37" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total PAYE</CardTitle>
            <DollarSign className="h-5 w-5" style={{ color: "#D4AF37" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#D4AF37" }}>{fmt(payeTotals.paye)} MUR</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: "#0B0F2E" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total PRGF</CardTitle>
            <FileSpreadsheet className="h-5 w-5" style={{ color: "#0B0F2E" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#0B0F2E" }}>{fmt(prgfTotals.prgf)} MUR</p>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: "#D4AF37" }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Masse salariale brute</CardTitle>
            <Banknote className="h-5 w-5" style={{ color: "#D4AF37" }} />
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold" style={{ color: "#D4AF37" }}>{fmt(payeTotals.wages)} MUR</p>
          </CardContent>
        </Card>
      </div>

      {fetching ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
        </div>
      ) : bulletins.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-40" style={{ color: "#0B0F2E" }} />
            <p className="text-muted-foreground">Aucun bulletin pour la periode {getPeriodeLabel(selectedPeriode)}.</p>
            <p className="text-sm text-muted-foreground mt-1">Calculez d&apos;abord la paie dans la section Paie &amp; Bulletins.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="paye">PAYE</TabsTrigger>
            <TabsTrigger value="prgf">PRGF</TabsTrigger>
            <TabsTrigger value="emoluments">Emoluments</TabsTrigger>
            <TabsTrigger value="bank">Bank Report</TabsTrigger>
            <TabsTrigger value="nit">Negative Income Tax</TabsTrigger>
          </TabsList>

          {/* ===== PAYE TAB ===== */}
          <TabsContent value="paye">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle style={{ color: "#0B0F2E" }}>
                    PAYE Report -- {getPeriodeLabel(selectedPeriode)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Pay As You Earn -- MRA Declaration</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportPAYE}>
                    <Download className="h-4 w-4 mr-1" /> Export CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-1" /> Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#0B0F2E]/5">
                        <TableHead>Code</TableHead>
                        <TableHead>NIC</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Prenom</TableHead>
                        <TableHead className="text-right">Contributions</TableHead>
                        <TableHead className="text-right">Wages</TableHead>
                        <TableHead className="text-right">Taxable</TableHead>
                        <TableHead className="text-right">PAYE</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payeData.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{r.code}</TableCell>
                          <TableCell className="font-mono text-sm">{r.nic}</TableCell>
                          <TableCell className="font-medium">{r.nom}</TableCell>
                          <TableCell>{r.prenom}</TableCell>
                          <TableCell className="text-right">{fmt(r.contributions)}</TableCell>
                          <TableCell className="text-right">{fmt(r.wages)}</TableCell>
                          <TableCell className="text-right">{fmt(r.taxable)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(r.paye)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-[#0B0F2E]/10 font-bold">
                        <TableCell colSpan={4} className="font-bold" style={{ color: "#0B0F2E" }}>TOTAUX</TableCell>
                        <TableCell className="text-right font-bold">{fmt(payeTotals.contributions)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(payeTotals.wages)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(payeTotals.taxable)}</TableCell>
                        <TableCell className="text-right font-bold" style={{ color: "#D4AF37" }}>{fmt(payeTotals.paye)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== PRGF TAB ===== */}
          <TabsContent value="prgf">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle style={{ color: "#0B0F2E" }}>
                    PRGF Report -- {getPeriodeLabel(selectedPeriode)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Portable Retirement Gratuity Fund -- 4.5% of total emoluments</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportPRGF}>
                    <Download className="h-4 w-4 mr-1" /> Export CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-1" /> Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* PRGF Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg border" style={{ borderColor: "#D4AF3733", background: "#D4AF3708" }}>
                  <div>
                    <p className="text-xs text-muted-foreground">Number of Employees</p>
                    <p className="text-lg font-bold" style={{ color: "#0B0F2E" }}>{prgfData.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Wages</p>
                    <p className="text-lg font-bold" style={{ color: "#0B0F2E" }}>{fmt(prgfTotals.wages)} MUR</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Emoluments</p>
                    <p className="text-lg font-bold" style={{ color: "#0B0F2E" }}>{fmt(prgfTotals.total)} MUR</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total PRGF Payable</p>
                    <p className="text-lg font-bold" style={{ color: "#D4AF37" }}>{fmt(prgfTotals.prgf)} MUR</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#0B0F2E]/5">
                        <TableHead>NID</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Prenom</TableHead>
                        <TableHead className="text-right">Wages</TableHead>
                        <TableHead className="text-right">Allowances</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">PRGF (4.5%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prgfData.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{r.nid}</TableCell>
                          <TableCell className="font-medium">{r.nom}</TableCell>
                          <TableCell>{r.prenom}</TableCell>
                          <TableCell className="text-right">{fmt(r.wages)}</TableCell>
                          <TableCell className="text-right">{fmt(r.allowances)}</TableCell>
                          <TableCell className="text-right">{fmt(r.commission)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(r.total)}</TableCell>
                          <TableCell className="text-right font-bold" style={{ color: "#D4AF37" }}>{fmt(r.prgf)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-[#0B0F2E]/10 font-bold">
                        <TableCell colSpan={3} className="font-bold" style={{ color: "#0B0F2E" }}>TOTAUX</TableCell>
                        <TableCell className="text-right font-bold">{fmt(prgfTotals.wages)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(prgfTotals.allowances)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(prgfTotals.commission)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(prgfTotals.total)}</TableCell>
                        <TableCell className="text-right font-bold" style={{ color: "#D4AF37" }}>{fmt(prgfTotals.prgf)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== EMOLUMENTS TAB ===== */}
          <TabsContent value="emoluments">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle style={{ color: "#0B0F2E" }}>
                    Emoluments Report -- {getPeriodeLabel(selectedPeriode)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Detail of all emoluments per employee</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportEmoluments}>
                    <Download className="h-4 w-4 mr-1" /> Export CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="h-4 w-4 mr-1" /> Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#0B0F2E]/5">
                        <TableHead>Code</TableHead>
                        <TableHead>NID</TableHead>
                        <TableHead>Nom</TableHead>
                        <TableHead>Prenom</TableHead>
                        <TableHead className="text-right">Basic Salary</TableHead>
                        <TableHead className="text-right">Overtime</TableHead>
                        <TableHead className="text-right">Allowances</TableHead>
                        <TableHead className="text-right">Total Emoluments</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emolumentsData.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{r.code}</TableCell>
                          <TableCell className="font-mono text-sm">{r.nid}</TableCell>
                          <TableCell className="font-medium">{r.nom}</TableCell>
                          <TableCell>{r.prenom}</TableCell>
                          <TableCell className="text-right">{fmt(r.basic)}</TableCell>
                          <TableCell className="text-right">{fmt(r.overtime)}</TableCell>
                          <TableCell className="text-right">{fmt(r.allowances)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(r.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-[#0B0F2E]/10 font-bold">
                        <TableCell colSpan={4} className="font-bold" style={{ color: "#0B0F2E" }}>TOTAUX</TableCell>
                        <TableCell className="text-right font-bold">{fmt(emolumentsTotals.basic)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(emolumentsTotals.overtime)}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(emolumentsTotals.allowances)}</TableCell>
                        <TableCell className="text-right font-bold" style={{ color: "#D4AF37" }}>{fmt(emolumentsTotals.total)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== BANK REPORT TAB ===== */}
          <TabsContent value="bank">
            <div className="space-y-4">
              {/* Bank Amount Summary */}
              <div className="flex items-center gap-4 flex-wrap">
                <Card className="flex-1 min-w-[200px] border-l-4" style={{ borderLeftColor: "#0B0F2E" }}>
                  <CardContent className="py-4">
                    <p className="text-xs text-muted-foreground">Total Bank Amount</p>
                    <p className="text-xl font-bold" style={{ color: "#0B0F2E" }}>{fmt(totalBankAmount)} MUR</p>
                  </CardContent>
                </Card>
                {cashEmployees.length > 0 && (
                  <Card className="flex-1 min-w-[200px] border-l-4 border-l-amber-500">
                    <CardContent className="py-4 flex items-center gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Cash Payments</p>
                        <p className="text-xl font-bold text-amber-600">{fmt(totalCashAmount)} MUR</p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {cashEmployees.length} employee{cashEmployees.length > 1 ? "s" : ""} paid by Cash
                      </Badge>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle style={{ color: "#0B0F2E" }}>
                      Bank Report -- {getPeriodeLabel(selectedPeriode)}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">Employees grouped by bank for payment processing</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={exportBankReport}>
                      <Download className="h-4 w-4 mr-1" /> Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                      <Printer className="h-4 w-4 mr-1" /> Print
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 overflow-x-auto">
                  {Object.entries(bankGroups).sort(([a], [b]) => a.localeCompare(b)).map(([bank, employees]) => {
                    const bankTotal = employees.reduce((s, e) => s + e.netpay, 0)
                    return (
                      <div key={bank}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: "#0B0F2E" }}>
                            <Banknote className="h-4 w-4" />
                            {bank}
                            <Badge variant="secondary" className="ml-2">{employees.length}</Badge>
                          </h3>
                          <span className="text-sm font-bold" style={{ color: "#D4AF37" }}>Subtotal: {fmt(bankTotal)} MUR</span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-[#0B0F2E]/5">
                              <TableHead>Code</TableHead>
                              <TableHead>NID</TableHead>
                              <TableHead>Nom</TableHead>
                              <TableHead>Prenom</TableHead>
                              <TableHead>Group</TableHead>
                              <TableHead>Department</TableHead>
                              <TableHead>Account No</TableHead>
                              <TableHead className="text-right">Net Pay</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {employees.map((e, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-sm">{e.code}</TableCell>
                                <TableCell className="font-mono text-sm">{e.nid}</TableCell>
                                <TableCell className="font-medium">{e.nom}</TableCell>
                                <TableCell>{e.prenom}</TableCell>
                                <TableCell>{e.groupe}</TableCell>
                                <TableCell>{e.departement}</TableCell>
                                <TableCell className="font-mono text-sm">{e.compte}</TableCell>
                                <TableCell className="text-right font-semibold">{fmt(e.netpay)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  })}

                  {/* Cash Payment Report */}
                  {cashEmployees.length > 0 && (
                    <div className="border-t-2 pt-4" style={{ borderTopColor: "#D4AF37" }}>
                      <h3 className="text-sm font-bold flex items-center gap-2 mb-2 text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                        Cash Payment Report
                        <Badge className="bg-amber-100 text-amber-800">{cashEmployees.length}</Badge>
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-amber-50">
                            <TableHead>Code</TableHead>
                            <TableHead>NID</TableHead>
                            <TableHead>Nom</TableHead>
                            <TableHead>Prenom</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead className="text-right">Net Pay</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cashEmployees.map((e, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-sm">{e.code}</TableCell>
                              <TableCell className="font-mono text-sm">{e.nid}</TableCell>
                              <TableCell className="font-medium">{e.nom}</TableCell>
                              <TableCell>{e.prenom}</TableCell>
                              <TableCell>{e.groupe}</TableCell>
                              <TableCell>{e.departement}</TableCell>
                              <TableCell className="text-right font-semibold">{fmt(e.netpay)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow className="bg-amber-50/50 font-bold">
                            <TableCell colSpan={6} className="font-bold text-amber-700">TOTAL CASH</TableCell>
                            <TableCell className="text-right font-bold text-amber-700">{fmt(totalCashAmount)}</TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ===== NIT TAB ===== */}
          <TabsContent value="nit">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle style={{ color: "#0B0F2E" }}>
                    Negative Income Tax (NIT) -- {getPeriodeLabel(selectedPeriode)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Employees eligible for NIT (low income below threshold)
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {nitData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-40" style={{ color: "#0B0F2E" }} />
                    <p>No employees eligible for Negative Income Tax this period.</p>
                    <p className="text-sm mt-1">NIT applies to employees earning &lt;= Rs 25,000 / month.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#0B0F2E]/5">
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Basic Salary</TableHead>
                          <TableHead className="text-right">NIT Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {nitData.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm">{r.code}</TableCell>
                            <TableCell className="font-medium">{r.nom}</TableCell>
                            <TableCell className="text-right">{fmt(r.basic)}</TableCell>
                            <TableCell className="text-right font-semibold" style={{ color: "#22c55e" }}>{fmt(r.nit_amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="bg-[#0B0F2E]/10 font-bold">
                          <TableCell colSpan={2} className="font-bold" style={{ color: "#0B0F2E" }}>TOTAL NIT</TableCell>
                          <TableCell className="text-right font-bold">{fmt(nitData.reduce((s, r) => s + r.basic, 0))}</TableCell>
                          <TableCell className="text-right font-bold" style={{ color: "#22c55e" }}>{fmt(nitData.reduce((s, r) => s + r.nit_amount, 0))}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
