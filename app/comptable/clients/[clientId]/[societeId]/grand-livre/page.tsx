"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowLeft, Download, ChevronLeft, ChevronRight, BookOpen } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  if (!d) return ""
  const dt = new Date(d)
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

interface Ecriture {
  id: string
  date_ecriture: string
  journal: string
  ref_folio: string
  numero_compte: string
  nom_compte: string
  description: string
  debit_mur: number
  credit_mur: number
  solde_progressif: number
  document_id: string | null
}

interface GrandLivreResp {
  ecritures: Ecriture[]
  total_debit: number
  total_credit: number
  solde_ouverture: number
  solde_cloture: number
  total: number
  page: number
  pages: number
}

export default function GrandLivrePage() {
  const params = useParams()
  const societeId  = params.societeId as string
  const clientId   = params.clientId  as string

  const [data, setData]       = useState<GrandLivreResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage]       = useState(1)

  // Filtres
  const [compteDeb, setCompteDeb]   = useState("")
  const [compteFin, setCompteFin]   = useState("")
  const [dateDeb, setDateDeb]       = useState("")
  const [dateFin, setDateFin]       = useState("")
  const [journal, setJournal]       = useState("all")

  const fetchData = useCallback(async (p = 1) => {
    if (!societeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: societeId, page: String(p), limit: "50" })
      if (compteDeb) params.append("compte_debut", compteDeb)
      if (compteFin) params.append("compte_fin",   compteFin)
      if (dateDeb)   params.append("date_debut",   dateDeb)
      if (dateFin)   params.append("date_fin",     dateFin)
      if (journal && journal !== "all") params.append("journal", journal)

      const res  = await fetch(`/api/comptable/grand-livre?${params}`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [societeId, compteDeb, compteFin, dateDeb, dateFin, journal])

  useEffect(() => { fetchData(1); setPage(1) }, [fetchData])

  const handlePage = (p: number) => { setPage(p); fetchData(p) }

  // Couleur solde progressif selon sens normal du compte
  function soldeColor(ecriture: Ecriture) {
    const c = ecriture.numero_compte[0]
    const sensNormalCredit = ["1", "4", "5", "7"].includes(c)
    const solde = ecriture.solde_progressif
    // Anormal = contraire au sens normal
    if (sensNormalCredit && solde > 0) return "text-red-600 font-semibold"
    if (!sensNormalCredit && solde < 0) return "text-red-600 font-semibold"
    return "text-green-700"
  }

  // Export CSV
  const exportCSV = () => {
    if (!data?.ecritures) return
    const rows = [
      ["Date", "Journal", "N° Pièce", "Compte", "Libellé", "Débit", "Crédit", "Solde progressif"],
      ...data.ecritures.map(e => [
        fmtDate(e.date_ecriture), e.journal, e.ref_folio || "",
        e.numero_compte, e.description || e.nom_compte || "",
        e.debit_mur.toFixed(2), e.credit_mur.toFixed(2), e.solde_progressif.toFixed(2),
      ]),
    ]
    const csv     = rows.map(r => r.map(v => `"${v}"`).join(";")).join("\n")
    const blob    = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url     = URL.createObjectURL(blob)
    const a       = document.createElement("a")
    a.href        = url
    a.download    = `grand_livre_${societeId}_${dateDeb || "all"}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/comptable/clients/${clientId}/${societeId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Retour</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
              <BookOpen className="inline w-6 h-6 mr-2" style={{ color: GOLD }} />
              Grand Livre
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Toutes les écritures comptables avec solde progressif</p>
          </div>
        </div>
        <Button onClick={exportCSV} variant="outline" className="gap-2" disabled={!data?.ecritures?.length}>
          <Download className="w-4 h-4" /> Exporter CSV
        </Button>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label className="text-xs">Compte début</Label>
            <Input placeholder="Ex: 401" value={compteDeb} onChange={e => setCompteDeb(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Compte fin</Label>
            <Input placeholder="Ex: 499" value={compteFin} onChange={e => setCompteFin(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Date début</Label>
            <Input type="date" value={dateDeb} onChange={e => setDateDeb(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Date fin</Label>
            <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Journal</Label>
            <Select value={journal} onValueChange={setJournal}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="ACH">ACH — Achats</SelectItem>
                <SelectItem value="VTE">VTE — Ventes</SelectItem>
                <SelectItem value="BNQ">BNQ — Banque</SelectItem>
                <SelectItem value="OD">OD — Opérations diverses</SelectItem>
                <SelectItem value="SAL">SAL — Salaires</SelectItem>
                <SelectItem value="AN">AN — À-nouveau</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Débit</p>
            <p className="text-xl font-bold text-blue-700">{fmt(data.total_debit)} MUR</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Crédit</p>
            <p className="text-xl font-bold text-blue-700">{fmt(data.total_credit)} MUR</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Solde Clôture</p>
            <p className={`text-xl font-bold ${data.solde_cloture >= 0 ? "text-green-700" : "text-red-600"}`}>
              {fmt(Math.abs(data.solde_cloture))} MUR
              <span className="text-xs ml-1 text-gray-500">{data.solde_cloture >= 0 ? "D" : "C"}</span>
            </p>
          </CardContent></Card>
        </div>
      )}

      {/* Tableau */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle style={{ color: NAVY }}>
            Écritures
            {data && <span className="ml-2 text-sm font-normal text-gray-500">({data.total} lignes)</span>}
          </CardTitle>
          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => handlePage(page - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">Page {page} / {data.pages}</span>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => handlePage(page + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} />
            </div>
          ) : !data?.ecritures?.length ? (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Aucune écriture comptabilisée</p>
              <p className="text-sm mt-1">Uploadez des documents pour commencer</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Journal</TableHead>
                    <TableHead className="text-xs">N° Pièce</TableHead>
                    <TableHead className="text-xs">Compte</TableHead>
                    <TableHead className="text-xs">Libellé</TableHead>
                    <TableHead className="text-xs text-right">Débit</TableHead>
                    <TableHead className="text-xs text-right">Crédit</TableHead>
                    <TableHead className="text-xs text-right">Solde progressif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ecritures.map((e, idx) => (
                    <TableRow key={e.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                      <TableCell className="text-xs font-mono whitespace-nowrap">{fmtDate(e.date_ecriture)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{e.journal || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-gray-500">{e.ref_folio || "—"}</TableCell>
                      <TableCell className="text-xs font-mono font-semibold" style={{ color: NAVY }}>
                        {e.numero_compte}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate text-gray-700">
                        {e.description || e.nom_compte || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {e.debit_mur > 0 ? (
                          <span className="text-blue-700">{fmt(e.debit_mur)}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {e.credit_mur > 0 ? (
                          <span className="text-purple-700">{fmt(e.credit_mur)}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className={`text-xs text-right font-mono ${soldeColor(e)}`}>
                        {fmt(e.solde_progressif)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Légende couleurs */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-green-700"></span>
          Solde normal
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-red-600"></span>
          Solde anormal (sens inversé)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-700"></span>
          Débit
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-purple-700"></span>
          Crédit
        </span>
      </div>
    </div>
  )
}
