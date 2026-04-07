"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, Building2, RefreshCw, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Plus, Trash2, Save,
  Landmark, CreditCard, PiggyBank, Wallet
} from "lucide-react"
import { MonthPicker } from "@/components/ui/MonthPicker"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-FR") + " MUR"
}
function fmtPct(n: number) {
  if (!isFinite(n)) return "N/A"
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%"
}

// Budget row definitions
const BUDGET_ROWS = [
  { key: "ca", label: "Chiffre d'affaires", type: "revenue" as const },
  { key: "charges_exploitation", label: "Charges d'exploitation", type: "expense" as const },
  { key: "charges_sociales", label: "Charges sociales (43x)", type: "expense" as const },
  { key: "frais_bancaires", label: "Frais bancaires (627)", type: "expense" as const },
  { key: "loyer", label: "Loyer (612)", type: "expense" as const },
  { key: "telecom", label: "Telecom (626)", type: "expense" as const },
  { key: "honoraires", label: "Honoraires (622)", type: "expense" as const },
  { key: "saas", label: "SaaS / Logiciels (651)", type: "expense" as const },
  { key: "transport", label: "Transport (624)", type: "expense" as const },
  { key: "autres_charges", label: "Autres charges", type: "expense" as const },
]

// Account prefix mapping for real amounts
const ACCOUNT_MAP: Record<string, string[]> = {
  ca: ["7"],
  charges_exploitation: ["60", "61"],
  charges_sociales: ["43"],
  frais_bancaires: ["627"],
  loyer: ["612"],
  telecom: ["626"],
  honoraires: ["622"],
  saas: ["651"],
  transport: ["624"],
  autres_charges: ["628", "629", "63", "64", "65", "66", "67", "68"],
}

interface Investment {
  id: string; description: string; amount: number; date: string
}
interface Credit {
  id: string; bank: string; amount: number; rate: number; monthly: number; remaining: number
}

export default function PrevisionnelPage() {
  const { profile, loading } = useProfile()
  const [data, setData] = useState<any>(null)
  const [fetching, setFetching] = useState(true)
  const [selectedSociete, setSelectedSociete] = useState<string>("")
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [investments, setInvestments] = useState<Investment[]>([])
  const [credits, setCredits] = useState<Credit[]>([])
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error' | null>>({})
  const investmentsRef = useRef<Investment[]>([])
  const creditsRef = useRef<Credit[]>([])
  useEffect(() => { investmentsRef.current = investments }, [investments])
  useEffect(() => { creditsRef.current = credits }, [credits])

  // Period filter state
  type PeriodMode = "mensuel" | "trimestriel" | "annuel"
  const now = new Date()
  const [periodMode, setPeriodMode] = useState<PeriodMode>("mensuel")
  const [selectedMonth, setSelectedMonth] = useState<string>(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
  const [selectedTrimestre, setSelectedTrimestre] = useState(() => {
    const q = Math.ceil((now.getMonth() + 1) / 3)
    return `T${q}`
  })
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  function getPeriodDates(): { debut: string; fin: string } {
    if (periodMode === "mensuel") {
      const [y, m] = selectedMonth.split("-").map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      return { debut: `${y}-${String(m).padStart(2, "0")}-01`, fin: `${y}-${String(m).padStart(2, "0")}-${lastDay}` }
    }
    if (periodMode === "trimestriel") {
      const q = parseInt(selectedTrimestre.replace("T", ""))
      const startMonth = (q - 1) * 3 + 1
      const endMonth = q * 3
      const lastDay = new Date(selectedYear, endMonth, 0).getDate()
      return { debut: `${selectedYear}-${String(startMonth).padStart(2, "0")}-01`, fin: `${selectedYear}-${String(endMonth).padStart(2, "0")}-${lastDay}` }
    }
    // annuel
    return { debut: `${selectedYear}-01-01`, fin: `${selectedYear}-12-31` }
  }

  // Load budgets from localStorage (lightweight, OK for budgets)
  useEffect(() => {
    try {
      const b = localStorage.getItem("lexora_budgets")
      if (b) setBudgets(JSON.parse(b))
    } catch { /* ignore */ }
  }, [])

  // Fetch ALL sociétés the user has access to (same pattern as banque page)
  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values()) as { id: string; nom: string }[]
      setSocietes(unique)
      if (unique.length > 0 && !selectedSociete) setSelectedSociete(unique[0].id)
    })
  }, [])

  const saveBudgets = useCallback((b: Record<string, number>) => {
    setBudgets(b)
    localStorage.setItem("lexora_budgets", JSON.stringify(b))
  }, [])

  // Load investissements/credits from DB
  const fetchInvestissements = useCallback(async () => {
    if (!selectedSociete || selectedSociete === "all") return
    try {
      const res = await fetch(`/api/client/investissements?societe_id=${selectedSociete}`)
      const json = await res.json()
      setInvestments((json.investissements || []).map((i: any) => ({
        id: i.id, description: i.libelle, amount: Number(i.montant) || 0, date: i.date_debut || "",
      })))
      setCredits((json.credits || []).map((c: any) => ({
        id: c.id, bank: c.banque || "", amount: Number(c.montant) || 0,
        rate: Number(c.taux_interet) || 0, monthly: Number(c.mensualite) || 0, remaining: Number(c.capital_restant) || 0,
      })))
    } catch { /* keep existing */ }
  }, [selectedSociete])

  useEffect(() => { fetchInvestissements() }, [fetchInvestissements])

  const saveInvestment = async (inv: Investment) => {
    if (!selectedSociete || selectedSociete === "all" || !inv.description) return
setSaveStatus(prev => ({ ...prev, [inv.id]: 'saving' }))
    try {
      const isNew = inv.id?.startsWith?.("new-")
      const res = await fetch("/api/client/investissements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: isNew ? undefined : inv.id, societe_id: selectedSociete, type: "investissement", libelle: inv.description, montant: inv.amount, date_debut: inv.date || null }),
      })
      if (isNew) {
        const json = await res.json()
        if (json.item?.id) {
          setInvestments(prev => prev.map(i => i.id === inv.id ? { ...i, id: json.item.id } : i))
          setSaveStatus(prev => { const n = { ...prev }; delete n[inv.id]; n[json.item.id] = 'saved'; return n })
          setTimeout(() => setSaveStatus(prev => ({ ...prev, [json.item.id]: null })), 2000)
          return
        }
      }
      setSaveStatus(prev => ({ ...prev, [inv.id]: 'saved' }))
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [inv.id]: null })), 2000)
    } catch {
      setSaveStatus(prev => ({ ...prev, [inv.id]: 'error' }))
    }
  }

  const deleteInvestment = async (id: string) => {
    if (!id.startsWith("new-")) {
      await fetch(`/api/client/investissements?id=${id}`, { method: "DELETE" })
    }
    setInvestments(prev => prev.filter(i => i.id !== id))
    setSaveStatus(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const saveCredit = async (cr: Credit) => {
    if (!selectedSociete || selectedSociete === "all") return
    if (!cr.bank && cr.amount === 0 && cr.monthly === 0 && cr.remaining === 0) return
setSaveStatus(prev => ({ ...prev, [cr.id]: 'saving' }))
    try {
      const isNew = cr.id?.startsWith?.("new-")
      const res = await fetch("/api/client/investissements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: isNew ? undefined : cr.id, societe_id: selectedSociete, type: "credit", libelle: cr.bank || "Crédit", montant: cr.amount, taux_interet: cr.rate, mensualite: cr.monthly, capital_restant: cr.remaining, banque: cr.bank }),
      })
      if (isNew) {
        const json = await res.json()
        if (json.item?.id) {
          setCredits(prev => prev.map(c => c.id === cr.id ? { ...c, id: json.item.id } : c))
          setSaveStatus(prev => { const n = { ...prev }; delete n[cr.id]; n[json.item.id] = 'saved'; return n })
          setTimeout(() => setSaveStatus(prev => ({ ...prev, [json.item.id]: null })), 2000)
          return
        }
      }
      setSaveStatus(prev => ({ ...prev, [cr.id]: 'saved' }))
      setTimeout(() => setSaveStatus(prev => ({ ...prev, [cr.id]: null })), 2000)
    } catch {
      setSaveStatus(prev => ({ ...prev, [cr.id]: 'error' }))
    }
  }

  const deleteCredit = async (id: string) => {
    if (!id.startsWith("new-")) {
      await fetch(`/api/client/investissements?id=${id}`, { method: "DELETE" })
    }
    setCredits(prev => prev.filter(c => c.id !== id))
    setSaveStatus(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const fetchData = useCallback(async () => {
    setFetching(true)
    try {
      const { debut, fin } = getPeriodDates()
      const base = selectedSociete && selectedSociete !== "all"
        ? `societe_id=${selectedSociete}&`
        : ""
      const url = `/api/client/financial?${base}date_debut=${debut}&date_fin=${fin}`
      const res = await fetch(url)
      const json = await res.json()
      setData(json.financial)
    } catch { setData(null) }
    finally { setFetching(false) }
  }, [selectedSociete, periodMode, selectedMonth, selectedTrimestre, selectedYear])

  useEffect(() => { fetchData() }, [fetchData])

  // Compute real amounts from expensesByAccount / revenueByAccount
  const reelValues = useMemo(() => {
    if (!data) return {} as Record<string, number>
    const rev = data.revenueByAccount || {}
    const exp = data.expensesByAccount || {}
    const all = { ...rev, ...exp }
    const result: Record<string, number> = {}
    for (const row of BUDGET_ROWS) {
      const prefixes = ACCOUNT_MAP[row.key] || []
      let total = 0
      for (const [acct, val] of Object.entries(all)) {
        if (prefixes.some(p => acct.startsWith(p))) {
          total += Math.abs(Number(val) || 0)
        }
      }
      // For CA, use totalRevenue as fallback
      if (row.key === "ca" && total === 0) total = data.totalRevenue || 0
      // For charges_exploitation, if no specific accounts, use totalExpenses minus specific ones
      if (row.key === "charges_exploitation" && total === 0) {
        const specificKeys = ["charges_sociales", "frais_bancaires", "loyer", "telecom", "honoraires", "saas", "transport", "autres_charges"]
        const specificTotal = specificKeys.reduce((s, k) => {
          const pf = ACCOUNT_MAP[k] || []
          let t = 0
          for (const [acct, val] of Object.entries(all)) {
            if (pf.some(p => acct.startsWith(p))) t += Math.abs(Number(val) || 0)
          }
          return s + t
        }, 0)
        total = Math.max(0, (data.totalExpenses || 0) - specificTotal)
      }
      result[row.key] = total
    }
    return result
  }, [data])

  // Cash flow data: selected month + 2 before + 3 projections after
  // Uses BOTH factures (statut=paye) AND écritures comptables (journal VTE/ACH)
  const cashFlowData = useMemo(() => {
    if (!data) return []
    const factures = data.factures || []
    const ecritures = data.ecritures || []
    const [sy, sm] = selectedMonth.split("-").map(Number)

    // Determine how many real months to show based on period mode
    const nbRealMonths = periodMode === "annuel" ? 12 : 3
    const startOffset = periodMode === "annuel" ? (sm - 1) : 2
    const months: { label: string; enc: number; dec: number; projection: boolean }[] = []

    for (let i = startOffset; i >= 0; i--) {
      const baseMonth = periodMode === "annuel" ? 0 : sm - 1
      const d = new Date(sy, baseMonth - i + (periodMode === "annuel" ? (nbRealMonths - 1 - startOffset + i) : 0), 1)
      if (periodMode === "annuel") {
        d.setFullYear(selectedYear)
        d.setMonth(i)
      }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })

      // Encaissements from factures clients payées
      let enc = factures
        .filter((f: any) => f.type_facture === "client" && f.statut === "paye" && (f.date_paiement || f.date_facture || "").startsWith(key))
        .reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
      // Fallback: écritures journal VTE (credit side = revenue)
      if (enc === 0) {
        enc = ecritures
          .filter((e: any) => e.journal === "VTE" && e.date_ecriture?.startsWith(key))
          .reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0)
      }

      // Décaissements from factures fournisseurs payées
      let dec = factures
        .filter((f: any) => f.type_facture === "fournisseur" && f.statut === "paye" && (f.date_paiement || f.date_facture || "").startsWith(key))
        .reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
      // Fallback: écritures journal ACH (debit side = expense)
      if (dec === 0) {
        dec = ecritures
          .filter((e: any) => e.journal === "ACH" && e.date_ecriture?.startsWith(key))
          .reduce((s: number, e: any) => s + (Number(e.debit) || 0), 0)
      }

      months.push({ label, enc, dec, projection: false })
    }

    // Fix annuel: rebuild from Jan to Dec
    if (periodMode === "annuel") {
      months.length = 0
      for (let m = 0; m < 12; m++) {
        const d = new Date(selectedYear, m, 1)
        const key = `${selectedYear}-${String(m + 1).padStart(2, "0")}`
        const label = d.toLocaleDateString("fr-FR", { month: "short" })
        let enc = factures.filter((f: any) => f.type_facture === "client" && f.statut === "paye" && (f.date_paiement || f.date_facture || "").startsWith(key)).reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
        if (enc === 0) enc = ecritures.filter((e: any) => e.journal === "VTE" && e.date_ecriture?.startsWith(key)).reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0)
        let dec = factures.filter((f: any) => f.type_facture === "fournisseur" && f.statut === "paye" && (f.date_paiement || f.date_facture || "").startsWith(key)).reduce((s: number, f: any) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
        if (dec === 0) dec = ecritures.filter((e: any) => e.journal === "ACH" && e.date_ecriture?.startsWith(key)).reduce((s: number, e: any) => s + (Number(e.debit) || 0), 0)
        months.push({ label, enc, dec, projection: false })
      }
    }

    // 3 projection months after (not for annuel)
    if (periodMode !== "annuel") {
      const realMonths = months.filter(m => !m.projection)
      const avgEnc = realMonths.length > 0 ? realMonths.reduce((s, m) => s + m.enc, 0) / realMonths.length : 0
      const avgDec = realMonths.length > 0 ? realMonths.reduce((s, m) => s + m.dec, 0) / realMonths.length : 0
      for (let i = 1; i <= 3; i++) {
        const d = new Date(sy, sm - 1 + i, 1)
        const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) + " *"
        months.push({ label, enc: avgEnc, dec: avgDec, projection: true })
      }
    }
    return months
  }, [data, selectedMonth, periodMode, selectedYear])

  // BFR
  const bfrData = useMemo(() => {
    if (!data) return { creances: 0, dettes: 0, bfr: 0, dso: 0, dpo: 0 }
    const creances = data.creances || 0
    const dettes = data.dettesFournisseurs || 0
    const ca = data.totalRevenue || 0
    const achats = data.totalExpenses || 0
    const bfr = creances - dettes
    const dso = ca > 0 ? (creances / ca) * 365 : 0
    const dpo = achats > 0 ? (dettes / achats) * 365 : 0
    return { creances, dettes, bfr, dso, dpo }
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>Acces non autorise</h1>
        <p className="text-sm text-muted-foreground">Vous n&apos;avez pas la permission.</p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: GOLD }}>Retour</Link>
      </div>
    )
  }

  if (fetching) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mon Previsionnel</h1>
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mon Previsionnel</h1>
            <p className="text-sm text-muted-foreground mt-1">Budget, tresorerie, BFR et investissements</p>
          </div>
          {societes.length > 0 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Société" /></SelectTrigger>
                <SelectContent>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                  {societes.length > 1 && <SelectItem value="all">Toutes les sociétés</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={fetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${fetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="budget" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="budget" className="text-xs sm:text-sm">Budget vs Reel</TabsTrigger>
          <TabsTrigger value="cashflow" className="text-xs sm:text-sm">Flux de tresorerie</TabsTrigger>
          <TabsTrigger value="bfr" className="text-xs sm:text-sm">BFR</TabsTrigger>
          <TabsTrigger value="invest" className="text-xs sm:text-sm">Investissements</TabsTrigger>
        </TabsList>

        {/* ===== TAB: Budget vs Reel ===== */}
        <TabsContent value="budget" className="space-y-4">
          {/* Period selector */}
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex rounded-lg border overflow-hidden">
                  {(["mensuel", "trimestriel", "annuel"] as PeriodMode[]).map(mode => (
                    <button key={mode} onClick={() => setPeriodMode(mode)}
                      className={`px-4 py-1.5 text-xs font-medium transition-colors ${periodMode === mode ? "bg-[#0B0F2E] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                      {mode === "mensuel" ? "Mensuel" : mode === "trimestriel" ? "Trimestriel" : "Annuel"}
                    </button>
                  ))}
                </div>
                {periodMode === "mensuel" && (
                  <MonthPicker value={selectedMonth} onChange={v => { if (v) setSelectedMonth(v) }} showTout={false} />
                )}
                {periodMode === "annuel" && (
                  <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                    <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {periodMode === "trimestriel" && (
                  <div className="flex items-center gap-2">
                    <Select value={selectedTrimestre} onValueChange={setSelectedTrimestre}>
                      <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{["T1", "T2", "T3", "T4"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                      <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary: Variance cards */}
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-3">
                <p className="text-xs text-gray-500">Entrées réelles</p>
                <p className="text-lg font-bold text-green-600">{fmt(data.totalRevenue || 0)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <p className="text-xs text-gray-500">Sorties réelles</p>
                <p className="text-lg font-bold text-red-500">{fmt(data.totalExpenses || 0)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <p className="text-xs text-gray-500">Résultat réel</p>
                <p className={`text-lg font-bold ${(data.totalRevenue || 0) - (data.totalExpenses || 0) >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt((data.totalRevenue || 0) - (data.totalExpenses || 0))}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3">
                <p className="text-xs text-gray-500">Variance globale</p>
                {(() => {
                  const budgetCA = budgets["ca"] || 0
                  const budgetDep = BUDGET_ROWS.filter(r => r.type === "expense").reduce((s, r) => s + (budgets[r.key] || 0), 0)
                  const budgetResult = budgetCA - budgetDep
                  const reelResult = (data.totalRevenue || 0) - (data.totalExpenses || 0)
                  const variance = budgetResult !== 0 ? ((reelResult - budgetResult) / Math.abs(budgetResult)) * 100 : 0
                  return <p className={`text-lg font-bold ${variance >= 0 ? "text-green-600" : "text-red-500"}`}>{budgetResult !== 0 ? fmtPct(variance) : "—"}</p>
                })()}
              </CardContent></Card>
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" style={{ color: NAVY }}>Budget vs Reel</CardTitle>
                <Button variant="outline" size="sm" onClick={() => saveBudgets(budgets)}>
                  <Save className="h-4 w-4 mr-1" /> Sauvegarder
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Poste</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Reel</TableHead>
                    <TableHead className="text-right">Ecart</TableHead>
                    <TableHead className="text-right">Ecart %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BUDGET_ROWS.map(row => {
                    const budget = budgets[row.key] || 0
                    const reel = reelValues[row.key] || 0
                    const ecart = budget - reel
                    const ecartPct = budget > 0 ? ((ecart / budget) * 100) : 0
                    // For revenue: green if reel >= budget; for expenses: green if reel <= budget
                    const isGood = row.type === "revenue" ? reel >= budget : reel <= budget
                    const ecartColor = budget === 0 ? "text-muted-foreground" : isGood ? "text-green-600" : "text-red-600"

                    return (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            className="w-32 text-right ml-auto h-8"
                            value={budgets[row.key] ?? ""}
                            placeholder="0"
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0
                              saveBudgets({ ...budgets, [row.key]: val })
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmt(reel)}</TableCell>
                        <TableCell className={`text-right font-medium ${ecartColor}`}>
                          {budget > 0 ? fmt(ecart) : "-"}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${ecartColor}`}>
                          {budget > 0 ? fmtPct(row.type === "revenue" ? -ecartPct : ecartPct) : "-"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Total row */}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell>TOTAL DEPENSES</TableCell>
                    <TableCell className="text-right">
                      {fmt(BUDGET_ROWS.filter(r => r.type === "expense").reduce((s, r) => s + (budgets[r.key] || 0), 0))}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmt(BUDGET_ROWS.filter(r => r.type === "expense").reduce((s, r) => s + (reelValues[r.key] || 0), 0))}
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: Flux de tresorerie ===== */}
        <TabsContent value="cashflow" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Solde bancaire</CardTitle>
                <Landmark className="h-5 w-5" style={{ color: GOLD }} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(data?.totalBankMUR || 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Argent reçu (clients)</CardTitle>
                <ArrowUpRight className="h-5 w-5 text-green-600" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  {fmt(cashFlowData.find(m => !m.projection && m === cashFlowData.filter(x => !x.projection).slice(-1)[0])?.enc || 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Argent payé (fournisseurs)</CardTitle>
                <ArrowDownRight className="h-5 w-5 text-red-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-500">
                  {fmt(cashFlowData.find(m => !m.projection && m === cashFlowData.filter(x => !x.projection).slice(-1)[0])?.dec || 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg" style={{ color: NAVY }}>Flux de trésorerie</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Suivi des encaissements (argent reçu) et décaissements (argent payé) mois par mois, avec projection sur 3 mois.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mois</TableHead>
                    <TableHead className="text-right">Argent reçu (clients)</TableHead>
                    <TableHead className="text-right">Argent payé (fournisseurs)</TableHead>
                    <TableHead className="text-right">Différence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashFlowData.map((m, i) => {
                    const solde = m.enc - m.dec
                    return (
                      <TableRow key={i} className={m.projection ? "bg-blue-50/50" : ""}>
                        <TableCell className="font-medium">
                          {m.label}
                          {m.projection && <Badge variant="outline" className="ml-2 text-xs">Projection</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">{fmt(m.enc)}</TableCell>
                        <TableCell className="text-right text-red-500 font-medium">{fmt(m.dec)}</TableCell>
                        <TableCell className={`text-right font-bold ${solde >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {fmt(solde)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-3">* Projections basees sur la moyenne des 3 derniers mois</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB: BFR ===== */}
        <TabsContent value="bfr" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Creances clients</CardTitle>
                <ArrowUpRight className="h-5 w-5" style={{ color: GOLD }} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(bfrData.creances)}</p>
                <p className="text-xs text-muted-foreground mt-1">Factures client non payees</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">Dettes fournisseurs</CardTitle>
                <ArrowDownRight className="h-5 w-5 text-red-500" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-500">{fmt(bfrData.dettes)}</p>
                <p className="text-xs text-muted-foreground mt-1">Factures fournisseur non payees</p>
              </CardContent>
            </Card>
            <Card className={bfrData.bfr >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">BFR</CardTitle>
                <Wallet className="h-5 w-5" style={{ color: bfrData.bfr >= 0 ? "#16A34A" : "#EF4444" }} />
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${bfrData.bfr >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(bfrData.bfr)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Creances - Dettes fournisseurs</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg" style={{ color: NAVY }}>DSO - Delai de paiement clients</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold" style={{ color: NAVY }}>
                    {bfrData.dso.toFixed(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">jours</p>
                    <p className="text-xs text-muted-foreground">(Creances / CA) x 365</p>
                  </div>
                </div>
                <div className="mt-4 w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (bfrData.dso / 90) * 100)}%`,
                      backgroundColor: bfrData.dso <= 30 ? "#16A34A" : bfrData.dso <= 60 ? "#F97316" : "#EF4444",
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0j</span><span>30j</span><span>60j</span><span>90j+</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg" style={{ color: NAVY }}>DPO - Delai de paiement fournisseurs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold" style={{ color: NAVY }}>
                    {bfrData.dpo.toFixed(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">jours</p>
                    <p className="text-xs text-muted-foreground">(Dettes / Achats) x 365</p>
                  </div>
                </div>
                <div className="mt-4 w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (bfrData.dpo / 90) * 100)}%`,
                      backgroundColor: bfrData.dpo >= 30 ? "#16A34A" : bfrData.dpo >= 15 ? "#F97316" : "#EF4444",
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0j</span><span>30j</span><span>60j</span><span>90j+</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== TAB: Investissements & Credits ===== */}
        <TabsContent value="invest" className="space-y-6">
          {/* Investments */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" style={{ color: NAVY }}>
                  <PiggyBank className="h-5 w-5 inline mr-2" />
                  Investissements
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => {
                  const newInv = { id: `new-${Date.now()}`, description: "", amount: 0, date: new Date().toISOString().slice(0, 10) }
                  setInvestments([...investments, newInv])
                }}>
                  <Plus className="h-4 w-4 mr-1" /> Ajouter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {investments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun investissement. Cliquez sur Ajouter pour commencer.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Montant (MUR)</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investments.map((inv, idx) => (
                      <TableRow key={inv.id} onBlur={(e) => {
                        // Only save when focus leaves the entire row (not just between cells)
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return
                        const latest = investmentsRef.current[idx]
                        if (latest?.description) saveInvestment(latest)
                      }}>
                        <TableCell>
                          <Input value={inv.description} placeholder="Description" className="h-8"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onChange={e => { const c = [...investments]; c[idx] = { ...c[idx], description: e.target.value }; setInvestments(c) }} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={inv.amount || ""} placeholder="0" className="h-8 text-right w-32 ml-auto"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onChange={e => { const c = [...investments]; c[idx] = { ...c[idx], amount: parseFloat(e.target.value) || 0 }; setInvestments(c) }} />
                        </TableCell>
                        <TableCell>
                          <Input type="date" value={inv.date} className="h-8 w-40"
                            onChange={e => { const c = [...investments]; c[idx] = { ...c[idx], date: e.target.value }; setInvestments(c) }} />
                        </TableCell>
                        <TableCell className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => deleteInvestment(inv.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          {saveStatus[inv.id] === 'saving' && <span className="text-xs text-gray-400 animate-pulse">Sauvegarde...</span>}
                          {saveStatus[inv.id] === 'saved' && <span className="text-xs text-green-500">✓</span>}
                          {saveStatus[inv.id] === 'error' && <span className="text-xs text-red-500">⚠</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{fmt(investments.reduce((s, i) => s + i.amount, 0))}</TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
              {investments.length > 0 && <p className="text-xs text-gray-400 px-4 py-2">Les modifications sont sauvegardées automatiquement</p>}
            </CardContent>
          </Card>

          {/* Credits */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg" style={{ color: NAVY }}>
                  <CreditCard className="h-5 w-5 inline mr-2" />
                  Credits / Emprunts
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => {
                  setCredits([...credits, { id: `new-${Date.now()}`, bank: "", amount: 0, rate: 0, monthly: 0, remaining: 0 }])
                }}>
                  <Plus className="h-4 w-4 mr-1" /> Ajouter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {credits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun credit. Cliquez sur Ajouter pour commencer.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Banque</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="text-right">Taux %</TableHead>
                      <TableHead className="text-right">Mensualite</TableHead>
                      <TableHead className="text-right">Restant</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credits.map((cr, idx) => (
                      <TableRow key={cr.id} onBlur={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return
                        const latest = creditsRef.current[idx]
                        if (latest && (latest.bank || latest.amount > 0 || latest.monthly > 0 || latest.remaining > 0)) saveCredit(latest)
                      }}>
                        <TableCell>
                          <Input value={cr.bank} placeholder="Banque" className="h-8 w-32"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onChange={e => { const c = [...credits]; c[idx] = { ...c[idx], bank: e.target.value }; setCredits(c) }} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={cr.amount || ""} placeholder="0" className="h-8 text-right w-28 ml-auto"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onChange={e => { const c = [...credits]; c[idx] = { ...c[idx], amount: parseFloat(e.target.value) || 0 }; setCredits(c) }} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.1" value={cr.rate || ""} placeholder="0" className="h-8 text-right w-20 ml-auto"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onChange={e => { const c = [...credits]; c[idx] = { ...c[idx], rate: parseFloat(e.target.value) || 0 }; setCredits(c) }} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={cr.monthly || ""} placeholder="0" className="h-8 text-right w-28 ml-auto"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onChange={e => { const c = [...credits]; c[idx] = { ...c[idx], monthly: parseFloat(e.target.value) || 0 }; setCredits(c) }} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={cr.remaining || ""} placeholder="0" className="h-8 text-right w-28 ml-auto"
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            onChange={e => { const c = [...credits]; c[idx] = { ...c[idx], remaining: parseFloat(e.target.value) || 0 }; setCredits(c) }} />
                        </TableCell>
                        <TableCell className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => deleteCredit(cr.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                          {saveStatus[cr.id] === 'saving' && <span className="text-xs text-gray-400 animate-pulse">Sauvegarde...</span>}
                          {saveStatus[cr.id] === 'saved' && <span className="text-xs text-green-500">✓</span>}
                          {saveStatus[cr.id] === 'error' && <span className="text-xs text-red-500">⚠</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{fmt(credits.reduce((s, c) => s + c.amount, 0))}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right">{fmt(credits.reduce((s, c) => s + c.monthly, 0))}</TableCell>
                      <TableCell className="text-right">{fmt(credits.reduce((s, c) => s + c.remaining, 0))}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
              {credits.length > 0 && <p className="text-xs text-gray-400 px-4 py-2">Les modifications sont sauvegardées automatiquement</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
