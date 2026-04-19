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
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, ArrowLeft, Download, ChevronLeft, ChevronRight, BookOpen, Check, X, FileDown } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

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
  lettre: string | null
  date_lettrage: string | null
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
  lettrage: {
    lettrees: number
    non_lettrees: number
    total: number
  }
}

// Filtres rapides par classe
const QUICK_FILTERS = [
  { label: "Tous",        debut: "",    fin: "" },
  { label: "1xx Capital", debut: "100", fin: "199" },
  { label: "2xx Immo",    debut: "200", fin: "299" },
  { label: "3xx Stocks",  debut: "300", fin: "399" },
  { label: "4xx Tiers",   debut: "400", fin: "499" },
  { label: "401 Fourn.",  debut: "401", fin: "4019" },
  { label: "411 Clients", debut: "411", fin: "4119" },
  { label: "5xx Banque",  debut: "500", fin: "599" },
  { label: "512 Banque",  debut: "512", fin: "5129" },
  { label: "6xx Charges", debut: "600", fin: "699" },
  { label: "7xx Produits",debut: "700", fin: "799" },
]

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

  // Lettrage
  const [selectedIds, setSelectedIds]     = useState<Set<string>>(new Set())
  const [lettrageCode, setLettrageCode]   = useState("")
  const [isLettraging, setIsLettraging]   = useState(false)

  // Détermine si on est sur une plage tiers (4xx) → afficher checkboxes
  const isTiersRange = (() => {
    if (!compteDeb) return false
    const start = parseInt(compteDeb, 10)
    const end   = compteFin ? parseInt(compteFin, 10) : start
    return start >= 400 && start <= 499
  })()

  const fetchData = useCallback(async (p = 1) => {
    if (!societeId) return
    setLoading(true)
    try {
      const qParams = new URLSearchParams({ societe_id: societeId, page: String(p), limit: "50" })
      if (compteDeb) qParams.append("compte_debut", compteDeb)
      if (compteFin) qParams.append("compte_fin",   compteFin)
      if (dateDeb)   qParams.append("date_debut",   dateDeb)
      if (dateFin)   qParams.append("date_fin",     dateFin)
      if (journal && journal !== "all") qParams.append("journal", journal)

      const res  = await fetch(`/api/comptable/grand-livre?${qParams}`)
      const json = await res.json()
      setData(json)
      setSelectedIds(new Set()) // reset sélection après rechargement
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
    if (sensNormalCredit && solde > 0) return "text-red-600 font-semibold"
    if (!sensNormalCredit && solde < 0) return "text-red-600 font-semibold"
    return "text-green-700"
  }

  // Couleur de la ligne
  function rowClass(e: Ecriture, idx: number) {
    if (e.lettre) return "bg-green-50"
    const isCompte4xx = e.numero_compte.startsWith("4")
    if (isCompte4xx && !e.lettre) return "bg-orange-50/30"
    return idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
  }

  // Toggle sélection écriture
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Calcul totaux sélection
  const selectedEcritures = data?.ecritures?.filter(e => selectedIds.has(e.id)) || []
  const selDebit  = selectedEcritures.reduce((s, e) => s + (e.debit_mur || 0), 0)
  const selCredit = selectedEcritures.reduce((s, e) => s + (e.credit_mur || 0), 0)
  const selEcart  = Math.abs(selDebit - selCredit)

  // Lettrer
  const handleLettrer = async () => {
    if (selectedIds.size === 0) return
    const code = lettrageCode.trim() || ("GL" + Date.now().toString().slice(-6))
    setIsLettraging(true)
    try {
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manuel",
          societe_id: societeId,
          ecriture_ids: Array.from(selectedIds),
          lettre: code,
        }),
      })
      if (!res.ok) { const d = await res.json(); console.error(d.error); return }
      setLettrageCode("")
      fetchData(page)
    } catch (e) { console.error(e) }
    finally { setIsLettraging(false) }
  }

  // Délettrer
  const handleDelettrer = async () => {
    if (selectedIds.size === 0) return
    setIsLettraging(true)
    try {
      const res = await fetch("/api/comptable/lettrage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delettrer",
          societe_id: societeId,
          ecriture_ids: Array.from(selectedIds),
        }),
      })
      if (!res.ok) { const d = await res.json(); console.error(d.error); return }
      fetchData(page)
    } catch (e) { console.error(e) }
    finally { setIsLettraging(false) }
  }

  // Export CSV
  const exportCSV = () => {
    if (!data?.ecritures) return
    const rows = [
      ["Date", "Journal", "N° Pièce", "Compte", "Libellé", "Débit", "Crédit", "Solde progressif", "Lettre"],
      ...data.ecritures.map(e => [
        fmtDate(e.date_ecriture), e.journal, e.ref_folio || "",
        e.numero_compte, e.description || e.nom_compte || "",
        e.debit_mur.toFixed(2), e.credit_mur.toFixed(2), e.solde_progressif.toFixed(2),
        e.lettre || "",
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
    <div className="p-6 space-y-6 pb-28">
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
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" className="gap-2" disabled={!data?.ecritures?.length}>
            <Download className="w-4 h-4" /> Exporter CSV
          </Button>
          <Button
            onClick={() => {
              const qp = new URLSearchParams({ societe_id: societeId, format: "fec" })
              if (dateDeb) qp.set("date_debut", dateDeb)
              if (dateFin) qp.set("date_fin", dateFin)
              window.open(`/api/comptable/export-fec?${qp.toString()}`, "_blank")
            }}
            variant="outline"
            className="gap-2"
            disabled={!societeId}
          >
            <FileDown className="w-4 h-4" /> Exporter FEC
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-gray-500 uppercase tracking-wide">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                  <SelectItem value="BQ">BQ — Banque</SelectItem>
                  <SelectItem value="BNQ">BNQ — Banque (auto)</SelectItem>
                  <SelectItem value="OD">OD — Opérations diverses</SelectItem>
                  <SelectItem value="SAL">SAL — Salaires</SelectItem>
                  <SelectItem value="AN">AN — À-nouveau</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filtres rapides par classe */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_FILTERS.map(f => {
              const isActive = f.debut === "" ? (compteDeb === "" && compteFin === "") : (compteDeb === f.debut && compteFin === f.fin)
              return (
                <button
                  key={f.label}
                  onClick={() => { setCompteDeb(f.debut); setCompteFin(f.fin) }}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    isActive
                      ? "bg-blue-50 border-blue-400 text-blue-700 font-medium"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-4 gap-4">
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
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Lettrage</p>
            <p className="text-xl font-bold text-green-700">
              {data.lettrage.lettrees}
              <span className="text-xs ml-1 font-normal text-gray-500">/ {data.lettrage.total}</span>
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0 hover:bg-green-100">
                {data.lettrage.lettrees} lettrées
              </Badge>
              <Badge className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0 hover:bg-gray-100">
                {data.lettrage.non_lettrees} non lettrées
              </Badge>
            </div>
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
                    {isTiersRange && <TableHead className="w-8"></TableHead>}
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Journal</TableHead>
                    <TableHead className="text-xs">N° Pièce</TableHead>
                    <TableHead className="text-xs">Compte</TableHead>
                    <TableHead className="text-xs">Libellé</TableHead>
                    <TableHead className="text-xs text-right">Débit</TableHead>
                    <TableHead className="text-xs text-right">Crédit</TableHead>
                    <TableHead className="text-xs text-right">Solde progressif</TableHead>
                    <TableHead className="text-xs text-center">Lettre</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.ecritures.map((e, idx) => (
                    <TableRow key={e.id} className={rowClass(e, idx)}>
                      {isTiersRange && (
                        <TableCell className="w-8">
                          <Checkbox
                            checked={selectedIds.has(e.id)}
                            disabled={!!e.lettre}
                            onCheckedChange={() => toggleSelect(e.id)}
                            className="w-3.5 h-3.5"
                          />
                        </TableCell>
                      )}
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
                      <TableCell className="text-xs text-center">
                        {e.lettre ? (
                          <Badge className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0 hover:bg-green-100" title={e.date_lettrage ? `Lettré le ${fmtDate(e.date_lettrage)}` : "Rapproché"}>
                            {e.lettre}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
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
      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
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
        <span className="flex items-center gap-1">
          <Badge className="bg-green-100 text-green-800 text-[10px] px-1 py-0 hover:bg-green-100">AB</Badge>
          Lettré (rapproché)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-8 h-3 rounded bg-green-50 border border-green-200"></span>
          Écriture lettrée
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-8 h-3 rounded bg-orange-50 border border-orange-200"></span>
          Tiers non lettré
        </span>
      </div>

      {/* Barre sticky de lettrage (visible quand sélection > 0) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 shadow-2xl px-6 py-3 flex items-center gap-4 flex-wrap"
          style={{ borderColor: NAVY }}>
          <span className="font-semibold text-sm" style={{ color: NAVY }}>
            {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
          </span>
          <span className="text-sm text-gray-500">
            Débit : <strong className="text-blue-700">{fmt(selDebit)}</strong>
            {" | "}
            Crédit : <strong className="text-purple-700">{fmt(selCredit)}</strong>
            {" | "}
            Écart : <strong className={selEcart <= 0.01 ? "text-green-600" : "text-red-600"}>
              {fmt(selEcart)} MUR
            </strong>
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Input
              placeholder="Code lettre (auto si vide)"
              value={lettrageCode}
              onChange={e => setLettrageCode(e.target.value)}
              className="h-8 text-sm w-48"
            />
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white gap-1"
              disabled={selEcart > 0.01 || isLettraging}
              onClick={handleLettrer}
            >
              {isLettraging ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Lettrer
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-orange-300 text-orange-600 hover:bg-orange-50 gap-1"
              disabled={isLettraging}
              onClick={handleDelettrer}
            >
              Délettrer
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-500 gap-1"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="w-3 h-3" /> Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
