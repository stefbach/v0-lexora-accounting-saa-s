"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, ArrowLeft, Download, Scale, AlertTriangle } from "lucide-react"
import { t, getLocale } from '@/lib/i18n'

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

interface CompteBalance {
  numero_compte: string
  libelle: string
  classe: string
  libelle_classe: string
  type_compte: string
  sens_normal: string
  total_debit: number
  total_credit: number
  solde: number
  solde_debiteur: number
  solde_crediteur: number
}

interface BalanceResp {
  comptes: CompteBalance[]
  par_classe: Record<string, CompteBalance[]>
  total_debit: number
  total_credit: number
  equilibre: boolean
  delta_desequilibre: number
  nb_comptes: number
  message?: string
}

const CLASSE_COLORS: Record<string, string> = {
  "1": "bg-blue-50 border-blue-200",
  "2": "bg-yellow-50 border-yellow-200",
  "3": "bg-orange-50 border-orange-200",
  "4": "bg-purple-50 border-purple-200",
  "5": "bg-green-50 border-green-200",
  "6": "bg-red-50 border-red-200",
  "7": "bg-teal-50 border-teal-200",
}

export default function BalancePage() {
  const params    = useParams()
  const locale    = getLocale()
  const societeId = params.societeId as string
  const clientId  = params.clientId  as string

  const [data, setData]             = useState<BalanceResp | null>(null)
  const [loading, setLoading]       = useState(false)
  const [dateDeb, setDateDeb]       = useState("")
  const [dateFin, setDateFin]       = useState("")
  const [exercice, setExercice]     = useState("all")
  const [vue, setVue]               = useState<"classe" | "detail">("classe")

  const fetchData = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ societe_id: societeId })
      if (dateDeb && dateDeb !== "") p.append("date_debut", dateDeb)
      if (dateFin && dateFin !== "") p.append("date_fin",   dateFin)
      if (exercice && exercice !== "all") p.append("exercice", exercice)

      const res  = await fetch(`/api/comptable/balance?${p}`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [societeId, dateDeb, dateFin, exercice])

  useEffect(() => { fetchData() }, [fetchData])

  // Export CSV
  const exportCSV = () => {
    if (!data?.comptes) return
    const nomSociete = societeId.slice(0, 8)
    const periode    = dateDeb ? dateDeb.slice(0, 7) : new Date().toISOString().slice(0, 7)
    const rows = [
      [t('cabclt.bal.col_account', locale), t('cabclt.bal.col_label', locale), t('cabclt.bal.col_class', locale), t('cabclt.bal.col_normal_side', locale), t('cabclt.bal.col_total_debit', locale), t('cabclt.bal.col_total_credit', locale), t('cabclt.bal.col_debit_balance', locale), t('cabclt.bal.col_credit_balance', locale)],
      ...data.comptes.map(c => [
        c.numero_compte, c.libelle, c.libelle_classe, c.sens_normal,
        c.total_debit.toFixed(2), c.total_credit.toFixed(2),
        c.solde_debiteur.toFixed(2), c.solde_crediteur.toFixed(2),
      ]),
      [t('cabclt.bal.total', locale), "", "", "",
       data.total_debit.toFixed(2), data.total_credit.toFixed(2), "", ""],
    ]
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(";")).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `balance_${nomSociete}_${periode}.csv`
    a.click()
  }

  const classeLabels: Record<string, string> = {
    "1": "1 — " + t('cabclt.bal.class_1', locale),
    "2": "2 — " + t('cabclt.bal.class_2', locale),
    "3": "3 — " + t('cabclt.bal.class_3', locale),
    "4": "4 — " + t('cabclt.bal.class_4', locale),
    "5": "5 — " + t('cabclt.bal.class_5', locale),
    "6": "6 — " + t('cabclt.bal.class_6', locale),
    "7": "7 — " + t('cabclt.bal.class_7', locale),
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/comptable/clients/${clientId}/${societeId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />{t('cabclt.bal.back', locale)}</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
              <Scale className="inline w-6 h-6 mr-2" style={{ color: GOLD }} />
              {t('cabclt.bal.title', locale)}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('cabclt.bal.subtitle', locale)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setVue(vue === "classe" ? "detail" : "classe")} variant="outline" size="sm">
            {vue === "classe" ? t('cabclt.bal.detailed_view', locale) : t('cabclt.bal.class_view', locale)}
          </Button>
          <Button onClick={exportCSV} variant="outline" className="gap-2" disabled={!data?.comptes?.length}>
            <Download className="w-4 h-4" /> {t('cabclt.bal.export_csv', locale)}
          </Button>
        </div>
      </div>

      {/* Alerte déséquilibre */}
      {data && !data.equilibre && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{t('cabclt.bal.imbalance_detected', locale)}</strong> {t('cabclt.bal.imbalance_pre', locale)} {fmt(data.delta_desequilibre)} {t('cabclt.bal.imbalance_post', locale)}
          </AlertDescription>
        </Alert>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">{t('cabclt.bal.start_date', locale)}</Label>
            <Input type="date" value={dateDeb} onChange={e => setDateDeb(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div>
            <Label className="text-xs">{t('cabclt.bal.end_date', locale)}</Label>
            <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div>
            <Label className="text-xs">{t('cabclt.bal.fiscal_year', locale)}</Label>
            <Select value={exercice} onValueChange={setExercice}>
              <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder={t('cabclt.bal.all', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('cabclt.bal.all', locale)}</SelectItem>
                <SelectItem value="FY2024-2025">FY2024-2025</SelectItem>
                <SelectItem value="FY2023-2024">FY2023-2024</SelectItem>
                <SelectItem value="FY2025-2026">FY2025-2026</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase">{t('cabclt.bal.kpi_accounts', locale)}</p>
            <p className="text-xl font-bold" style={{ color: NAVY }}>{data.nb_comptes}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase">{t('cabclt.bal.col_total_debit', locale)}</p>
            <p className="text-xl font-bold text-blue-700">{fmt(data.total_debit)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase">{t('cabclt.bal.col_total_credit', locale)}</p>
            <p className="text-xl font-bold text-purple-700">{fmt(data.total_credit)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase">{t('cabclt.bal.balance_status', locale)}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={data.equilibre ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                {data.equilibre ? "✓ " + t('cabclt.bal.balanced', locale) : "✗ " + t('cabclt.bal.unbalanced', locale)}
              </Badge>
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} />
        </div>
      ) : data?.message ? (
        <Card><CardContent className="py-12 text-center text-gray-500">
          <Scale className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{data.message}</p>
          <p className="text-sm mt-1">{t('cabclt.bal.upload_hint', locale)}</p>
        </CardContent></Card>
      ) : vue === "classe" ? (
        // Vue groupée par classe
        <div className="space-y-4">
          {Object.entries(data?.par_classe || {}).sort(([a], [b]) => a.localeCompare(b)).map(([classe, comptes]) => {
            const tdDebit   = comptes.reduce((s, c) => s + c.total_debit,   0)
            const tdCredit  = comptes.reduce((s, c) => s + c.total_credit,  0)
            const tdSoldeD  = comptes.reduce((s, c) => s + c.solde_debiteur, 0)
            const tdSoldeC  = comptes.reduce((s, c) => s + c.solde_crediteur, 0)
            return (
              <Card key={classe} className={`border ${CLASSE_COLORS[classe] || ""}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm" style={{ color: NAVY }}>
                    {t('cabclt.bal.class_prefix', locale)} {classeLabels[classe] || classe}
                    <span className="ml-2 text-xs font-normal text-gray-500">({comptes.length} {t('cabclt.bal.accounts_lower', locale)})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>{t('cabclt.bal.col_account', locale)}</TableHead>
                        <TableHead>{t('cabclt.bal.col_label', locale)}</TableHead>
                        <TableHead>{t('cabclt.bal.col_side', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bal.col_total_debit', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bal.col_total_credit', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bal.col_debit_balance', locale)}</TableHead>
                        <TableHead className="text-right">{t('cabclt.bal.col_credit_balance', locale)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comptes.map(c => (
                        <TableRow key={c.numero_compte}>
                          <TableCell className="text-xs font-mono font-semibold">{c.numero_compte}</TableCell>
                          <TableCell className="text-xs">{c.libelle}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] px-1">
                              {c.sens_normal === "D" ? t('cabclt.bal.side_debit', locale) : t('cabclt.bal.side_credit', locale)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono text-blue-700">
                            {c.total_debit > 0 ? fmt(c.total_debit) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono text-purple-700">
                            {c.total_credit > 0 ? fmt(c.total_credit) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {c.solde_debiteur > 0 ? <span className="text-blue-700">{fmt(c.solde_debiteur)}</span> : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">
                            {c.solde_crediteur > 0 ? <span className="text-purple-700">{fmt(c.solde_crediteur)}</span> : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Sous-total */}
                      <TableRow className="bg-gray-100 font-bold text-xs border-t-2">
                        <TableCell colSpan={3} className="text-xs font-bold">{t('cabclt.bal.subtotal_class', locale)} {classe}</TableCell>
                        <TableCell className="text-right font-mono text-blue-800">{fmt(tdDebit)}</TableCell>
                        <TableCell className="text-right font-mono text-purple-800">{fmt(tdCredit)}</TableCell>
                        <TableCell className="text-right font-mono">{tdSoldeD > 0 ? fmt(tdSoldeD) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{tdSoldeC > 0 ? fmt(tdSoldeC) : "—"}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}

          {/* Total général */}
          {data && (
            <Card className="border-2 border-gray-800">
              <CardContent className="p-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500">{t('cabclt.bal.total_debit_caps', locale)}</p>
                    <p className="text-lg font-bold text-blue-700">{fmt(data.total_debit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('cabclt.bal.total_credit_caps', locale)}</p>
                    <p className="text-lg font-bold text-purple-700">{fmt(data.total_credit)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('cabclt.bal.debit_balance_caps', locale)}</p>
                    <p className="text-lg font-bold text-blue-700">
                      {fmt(data.comptes?.reduce((s, c) => s + c.solde_debiteur, 0) || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t('cabclt.bal.credit_balance_caps', locale)}</p>
                    <p className="text-lg font-bold text-purple-700">
                      {fmt(data.comptes?.reduce((s, c) => s + c.solde_crediteur, 0) || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        // Vue détaillée (toutes classes)
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  <TableHead>{t('cabclt.bal.col_account', locale)}</TableHead>
                  <TableHead>{t('cabclt.bal.col_label', locale)}</TableHead>
                  <TableHead>{t('cabclt.bal.col_class', locale)}</TableHead>
                  <TableHead>{t('cabclt.bal.col_side', locale)}</TableHead>
                  <TableHead className="text-right">{t('cabclt.bal.col_total_debit', locale)}</TableHead>
                  <TableHead className="text-right">{t('cabclt.bal.col_total_credit', locale)}</TableHead>
                  <TableHead className="text-right">{t('cabclt.bal.col_debit_balance', locale)}</TableHead>
                  <TableHead className="text-right">{t('cabclt.bal.col_credit_balance', locale)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.comptes || []).map((c, idx) => (
                  <TableRow key={c.numero_compte} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <TableCell className="text-xs font-mono font-semibold" style={{ color: NAVY }}>{c.numero_compte}</TableCell>
                    <TableCell className="text-xs">{c.libelle}</TableCell>
                    <TableCell className="text-xs text-gray-500">{c.libelle_classe}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] px-1">
                        {c.sens_normal === "D" ? t('cptb.bal.side_debit', locale) : t('cptb.bal.side_credit', locale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-blue-700">
                      {c.total_debit > 0 ? fmt(c.total_debit) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-purple-700">
                      {c.total_credit > 0 ? fmt(c.total_credit) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {c.solde_debiteur > 0 ? <span className="text-blue-700">{fmt(c.solde_debiteur)}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {c.solde_crediteur > 0 ? <span className="text-purple-700">{fmt(c.solde_crediteur)}</span> : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totaux */}
                {data && (
                  <TableRow className="bg-gray-100 font-bold border-t-2">
                    <TableCell colSpan={4} className="text-xs font-bold">{t('cabclt.bal.grand_total', locale)}</TableCell>
                    <TableCell className="text-right text-sm font-mono text-blue-800">{fmt(data.total_debit)}</TableCell>
                    <TableCell className="text-right text-sm font-mono text-purple-800">{fmt(data.total_credit)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {fmt(data.comptes?.reduce((s, c) => s + c.solde_debiteur, 0) || 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {fmt(data.comptes?.reduce((s, c) => s + c.solde_crediteur, 0) || 0)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
