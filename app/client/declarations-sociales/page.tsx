"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, Download, Printer, CheckCircle, Users, FileText, Building2
} from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Societe { id: string; nom: string }
interface Employe {
  id: string
  code: string
  nom: string
  prenom: string
  nic_number?: string
  salaire_base?: number
}
interface Bulletin {
  id: string
  employe_id: string
  periode: string
  salaire_brut: number
  salaire_net: number
  csg_salarie: number
  csg_patronal?: number
  nsf_salarie: number
  nsf_patronal?: number
  training_levy?: number
  paye: number
  employe?: { code: string; nom: string; prenom: string; nic_number?: string }
}

interface DeclarationRow {
  index: number
  nic: string
  nom: string
  prenom: string
  rateCode: string
  period: string
  salary: number
  nsf: number
  csg: number
  csgBonus: number
  levy: number
}

export default function DeclarationsSocialesPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")
  const [periode, setPeriode] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [bulletins, setBulletins] = useState<Bulletin[]>([])
  const [employes, setEmployes] = useState<Employe[]>([])
  const [loading, setLoading] = useState(false)
  const [validated, setValidated] = useState(false)

  useEffect(() => {
    fetch("/api/client/societes")
      .then(r => r.json())
      .then(d => {
        const list = d.societes || d.data || []
        setSocietes(list)
        if (list.length > 0 && !selectedSociete) setSelectedSociete(list[0].id)
      })
      .catch(() => setSocietes([]))
  }, [])

  const fetchData = useCallback(async () => {
    if (!selectedSociete) return
    setLoading(true)
    setValidated(false)
    try {
      const [bRes, eRes] = await Promise.all([
        fetch(`/api/rh/paie?societe_id=${selectedSociete}&periode=${periode}`),
        fetch(`/api/rh/employes?societe_id=${selectedSociete}`),
      ])
      const bJson = await bRes.json()
      const eJson = await eRes.json()
      setBulletins(bJson.bulletins || [])
      setEmployes(eJson.employes || eJson.data || [])
    } catch {
      setBulletins([])
      setEmployes([])
    } finally {
      setLoading(false)
    }
  }, [selectedSociete, periode])

  useEffect(() => { fetchData() }, [fetchData])

  // Build rows
  const empMap = new Map<string, Employe>()
  employes.forEach(e => empMap.set(e.id, e))

  const rows: DeclarationRow[] = bulletins.map((b, i) => {
    const emp = empMap.get(b.employe_id)
    const salary = Number(b.salaire_brut) || 0
    const nsf = Number(b.nsf_salarie) || salary * 0.015
    const csg = Number(b.csg_salarie) || (salary <= 50000 ? salary * 0.015 : salary * 0.03)
    const csgBonus = 0
    const levy = Number(b.training_levy) || salary * 0.01
    return {
      index: i + 1,
      nic: emp?.nic_number || b.employe?.nic_number || "---",
      nom: emp?.nom || b.employe?.nom || "---",
      prenom: emp?.prenom || b.employe?.prenom || "---",
      rateCode: "S2",
      period: "M",
      salary,
      nsf,
      csg,
      csgBonus,
      levy,
    }
  })

  const totalBasicWage = rows.reduce((s, r) => s + r.salary, 0)
  const totalNSF = rows.reduce((s, r) => s + r.nsf, 0)
  const totalCSG = rows.reduce((s, r) => s + r.csg, 0)
  const totalCSGBonus = rows.reduce((s, r) => s + r.csgBonus, 0)
  const totalLevy = rows.reduce((s, r) => s + r.levy, 0)
  const totalPayable = totalNSF + totalCSG + totalCSGBonus + totalLevy
  const npfTotal = totalNSF

  // Export CSV
  function exportCSV() {
    const header = "#,NID,Nom,Prenom,Code Rate,Periode,Salaire,NSF,CSG,CSG Bonus,Levy"
    const csvRows = rows.map(r =>
      `${r.index},${r.nic},${r.nom},${r.prenom},${r.rateCode},${r.period},${fmt(r.salary)},${fmt(r.nsf)},${fmt(r.csg)},${fmt(r.csgBonus)},${fmt(r.levy)}`
    )
    const csv = [header, ...csvRows].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `declarations_sociales_${periode}.csv`
    a.click()
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Declarations Sociales</h1>
          <p className="text-sm text-gray-500 mt-1">NSF / CSG / Training Levy -- Declaration mensuelle</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedSociete} onValueChange={setSelectedSociete}>
            <SelectTrigger className="w-[220px] h-9">
              <SelectValue placeholder="Societe" />
            </SelectTrigger>
            <SelectContent>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="h-9 w-[160px]" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Nb employes", value: String(rows.length), icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total basic wage", value: fmt(totalBasicWage) + " MUR", icon: FileText, color: "text-green-600", bg: "bg-green-50" },
          { label: "Total payable", value: fmt(totalPayable) + " MUR", icon: Building2, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "NPF", value: fmt(npfTotal) + " MUR", icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "CSG", value: fmt(totalCSG) + " MUR", icon: FileText, color: "text-red-600", bg: "bg-red-50" },
        ].map(k => (
          <Card key={k.label} className="border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center`}>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
              </div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: NAVY }}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contributions Summary */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>Resume des contributions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">NPF (NSF)</p>
              <p className="font-bold" style={{ color: NAVY }}>{fmt(npfTotal)} MUR</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">CSG</p>
              <p className="font-bold" style={{ color: NAVY }}>{fmt(totalCSG)} MUR</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">NSF</p>
              <p className="font-bold" style={{ color: NAVY }}>{fmt(totalNSF)} MUR</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Levy (HRDC)</p>
              <p className="font-bold" style={{ color: NAVY }}>{fmt(totalLevy)} MUR</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">CSG Bonus</p>
              <p className="font-bold" style={{ color: NAVY }}>{fmt(totalCSGBonus)} MUR</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => setValidated(true)}
          disabled={rows.length === 0 || validated}
          style={{ backgroundColor: validated ? "#22c55e" : NAVY }}
          className="text-white"
        >
          {validated ? <CheckCircle className="w-4 h-4 mr-2" /> : null}
          {validated ? "Valide" : "Valider"}
        </Button>
        <Button variant="outline" onClick={exportCSV} disabled={rows.length === 0}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
        <Button variant="outline" onClick={() => window.print()} disabled={rows.length === 0}>
          <Printer className="w-4 h-4 mr-2" /> Imprimer
        </Button>
      </div>

      {/* Declaration Table */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
            Detail par employe -- {periode}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Aucun bulletin pour cette periode. Calculez la paie d&apos;abord.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>NID</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Prenom</TableHead>
                    <TableHead className="text-center">Code Rate</TableHead>
                    <TableHead className="text-center">Periode</TableHead>
                    <TableHead className="text-right">Salaire</TableHead>
                    <TableHead className="text-right">NSF</TableHead>
                    <TableHead className="text-right">CSG</TableHead>
                    <TableHead className="text-right">CSG Bonus</TableHead>
                    <TableHead className="text-right">Levy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.index}>
                      <TableCell className="font-medium text-gray-500">{r.index}</TableCell>
                      <TableCell className="font-mono text-xs">{r.nic}</TableCell>
                      <TableCell className="font-medium">{r.nom}</TableCell>
                      <TableCell>{r.prenom}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">{r.rateCode}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">{r.period}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.salary)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.nsf)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.csg)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.csgBonus)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(r.levy)}</TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="border-t-2 border-gray-300 font-bold">
                    <TableCell colSpan={6} className="text-right" style={{ color: NAVY }}>TOTAL</TableCell>
                    <TableCell className="text-right font-mono" style={{ color: NAVY }}>{fmt(totalBasicWage)}</TableCell>
                    <TableCell className="text-right font-mono" style={{ color: NAVY }}>{fmt(totalNSF)}</TableCell>
                    <TableCell className="text-right font-mono" style={{ color: NAVY }}>{fmt(totalCSG)}</TableCell>
                    <TableCell className="text-right font-mono" style={{ color: NAVY }}>{fmt(totalCSGBonus)}</TableCell>
                    <TableCell className="text-right font-mono" style={{ color: NAVY }}>{fmt(totalLevy)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
