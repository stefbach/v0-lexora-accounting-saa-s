"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, BookOpen, ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR") : "—" }

interface Societe { id: string; nom: string }

export default function ClientGrandLivrePage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [compteDebut, setCompteDebut] = useState("")
  const [compteFin, setCompteFin] = useState("")
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [journal, setJournal] = useState("all")
  const [exercice, setExercice] = useState("")

  // Available exercices (Mauritius fiscal year July-June)
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const currentExStart = currentMonth >= 7 ? currentYear : currentYear - 1
  const availableExercices = Array.from({ length: 5 }, (_, i) => {
    const s = currentExStart - i
    return `${s}-${s + 1}`
  })

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => {
      const s = d.societes || []
      setSocietes(s)
      if (s.length === 1) setSelectedSociete(s[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (selectedSociete === "all") { setData(null); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: selectedSociete, page: String(page), limit: "50" })
      if (compteDebut) params.set("compte_debut", compteDebut)
      if (compteFin) params.set("compte_fin", compteFin)
      if (dateDebut) params.set("date_debut", dateDebut)
      if (dateFin) params.set("date_fin", dateFin)
      if (journal && journal !== "all") params.set("journal", journal)
      if (exercice) params.set("exercice", exercice)
      const res = await fetch(`/api/comptable/grand-livre?${params}`)
      setData(await res.json())
    } catch { setData(null) }
    finally { setLoading(false) }
  }, [selectedSociete, page, compteDebut, compteFin, dateDebut, dateFin, journal, exercice])

  useEffect(() => { load() }, [load])

  const ecritures = data?.ecritures || []
  const lettrage = data?.lettrage || { lettrees: 0, non_lettrees: 0, total: 0 }
  const soldeOuvertureParCompte: Record<string, number> = data?.solde_ouverture_par_compte || {}
  const hasSoldeOuverture = Object.keys(soldeOuvertureParCompte).length > 0

  const exportCSV = () => {
    if (!ecritures.length) return
    const header = "Date;Journal;N° Piece;Compte;Libelle;Debit;Credit;Solde;Lettre\n"
    const rows = ecritures.map((e: any) =>
      `${e.date_ecriture};${e.journal};${e.ref_folio || ""};${e.numero_compte};${(e.description || e.nom_compte || "").replace(/;/g, ",")};${e.debit_mur};${e.credit_mur};${e.solde_progressif};${e.lettre || ""}`
    ).join("\n")
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "grand-livre.csv"; a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Grand Livre</h1>
          <p className="text-sm text-gray-500">Ecritures comptables avec solde progressif et lettrage</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!ecritures.length}>
            <Download className="w-4 h-4 mr-2" />CSV
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-7 gap-3">
          <div>
            <Label className="text-xs">Societe</Label>
            <Select value={selectedSociete} onValueChange={v => { setSelectedSociete(v); setPage(1) }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">-- Choisir --</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Exercice</Label>
            <Select value={exercice || "all"} onValueChange={v => { setExercice(v === "all" ? "" : v); setPage(1) }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {availableExercices.map(ex => <SelectItem key={ex} value={ex}>{ex}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Compte debut</Label><Input className="h-9" placeholder="401" value={compteDebut} onChange={e => setCompteDebut(e.target.value)} /></div>
          <div><Label className="text-xs">Compte fin</Label><Input className="h-9" placeholder="512" value={compteFin} onChange={e => setCompteFin(e.target.value)} /></div>
          <div><Label className="text-xs">Date debut</Label><Input className="h-9" type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} /></div>
          <div><Label className="text-xs">Date fin</Label><Input className="h-9" type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Journal</Label>
            <Select value={journal} onValueChange={v => { setJournal(v); setPage(1) }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="ACH">ACH (Achats)</SelectItem>
                <SelectItem value="VTE">VTE (Ventes)</SelectItem>
                <SelectItem value="BNQ">BNQ (Banque)</SelectItem>
                <SelectItem value="OD">OD (Operations)</SelectItem>
                <SelectItem value="SAL">SAL (Salaires)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedSociete === "all" ? (
        <Card><CardContent className="py-16 text-center text-gray-400">Selectionnez une societe</CardContent></Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]" /></div>
      ) : !data ? (
        <Card><CardContent className="py-16 text-center text-gray-400">Erreur de chargement</CardContent></Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-4">
            {hasSoldeOuverture && (
              <Card className="border-l-4 border-l-[#C9A84C]">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Report a nouveau</p>
                  <p className={`text-xl font-bold ${data.solde_ouverture >= 0 ? "text-[#C9A84C]" : "text-red-600"}`}>{fmt(data.solde_ouverture)} MUR</p>
                  <p className="text-xs text-gray-400">{Object.keys(soldeOuvertureParCompte).length} comptes</p>
                </CardContent>
              </Card>
            )}
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Total Debit</p><p className="text-xl font-bold text-blue-700">{fmt(data.total_debit)} MUR</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Total Credit</p><p className="text-xl font-bold text-purple-700">{fmt(data.total_credit)} MUR</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Solde Cloture</p><p className={`text-xl font-bold ${data.solde_cloture >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(Math.abs(data.solde_cloture))} MUR</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Lettrage</p><p className="text-xl font-bold text-[#1E2A4A]">{lettrage.lettrees} / {lettrage.total}</p><p className="text-xs text-gray-400">{lettrage.non_lettrees} non lettrees</p></CardContent></Card>
          </div>

          {/* Tableau */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-[#1E2A4A]">
                Ecritures <span className="ml-2 text-sm font-normal text-gray-500">({data.total} lignes — source: {data.source})</span>
              </CardTitle>
              {data.pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-sm text-gray-600">Page {page} / {data.pages}</span>
                  <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {ecritures.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Aucune ecriture comptabilisee</p>
                  <p className="text-sm mt-1">Uploadez des documents pour alimenter le grand livre</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Journal</TableHead>
                        <TableHead className="text-xs">N° Piece</TableHead>
                        <TableHead className="text-xs">Compte</TableHead>
                        <TableHead className="text-xs">Libelle</TableHead>
                        <TableHead className="text-xs text-right">Debit</TableHead>
                        <TableHead className="text-xs text-right">Credit</TableHead>
                        <TableHead className="text-xs text-right">Solde progressif</TableHead>
                        <TableHead className="text-xs">Lettre</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Opening balance rows when exercice is selected */}
                      {hasSoldeOuverture && page === 1 && (() => {
                        // Find unique accounts in current page ecritures that have opening balances
                        const accountsShown = new Set<string>()
                        const openingRows: { compte: string; solde: number }[] = []
                        for (const e of ecritures) {
                          if (!accountsShown.has(e.numero_compte) && soldeOuvertureParCompte[e.numero_compte] !== undefined) {
                            accountsShown.add(e.numero_compte)
                            openingRows.push({ compte: e.numero_compte, solde: soldeOuvertureParCompte[e.numero_compte] })
                          }
                        }
                        // Also add accounts that have opening balances but no entries in this period
                        for (const [compte, solde] of Object.entries(soldeOuvertureParCompte)) {
                          if (!accountsShown.has(compte) && solde !== 0) {
                            openingRows.push({ compte, solde })
                          }
                        }
                        openingRows.sort((a, b) => a.compte.localeCompare(b.compte))
                        if (openingRows.length === 0) return null
                        return (
                          <>
                            <TableRow className="bg-[#C9A84C]/10 border-b-2 border-[#C9A84C]/30">
                              <TableCell colSpan={9} className="text-xs font-bold text-[#1E2A4A] py-2">
                                Report a nouveau (soldes d&apos;ouverture)
                              </TableCell>
                            </TableRow>
                            {openingRows.map(row => (
                              <TableRow key={`opening-${row.compte}`} className="bg-[#C9A84C]/5">
                                <TableCell className="text-xs font-mono whitespace-nowrap text-gray-400">Ouverture</TableCell>
                                <TableCell><Badge variant="outline" className="text-[10px] px-1 py-0 border-[#C9A84C] text-[#C9A84C]">RAN</Badge></TableCell>
                                <TableCell className="text-xs font-mono text-gray-400">--</TableCell>
                                <TableCell className="text-xs font-mono font-semibold text-[#1E2A4A]">{row.compte}</TableCell>
                                <TableCell className="text-xs text-gray-500 italic">Solde d&apos;ouverture (report a nouveau)</TableCell>
                                <TableCell className="text-xs text-right font-mono">{row.solde > 0 ? <span className="text-blue-700">{fmt(row.solde)}</span> : "—"}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{row.solde < 0 ? <span className="text-purple-700">{fmt(Math.abs(row.solde))}</span> : "—"}</TableCell>
                                <TableCell className={`text-xs text-right font-mono ${row.solde >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(row.solde)}</TableCell>
                                <TableCell><span className="text-gray-300">—</span></TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-b-2 border-[#1E2A4A]/20">
                              <TableCell colSpan={9} className="py-0.5" />
                            </TableRow>
                          </>
                        )
                      })()}
                      {ecritures.map((e: any, idx: number) => (
                        <TableRow key={e.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                          <TableCell className="text-xs font-mono whitespace-nowrap">{fmtDate(e.date_ecriture)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] px-1 py-0">{e.journal || "—"}</Badge></TableCell>
                          <TableCell className="text-xs font-mono text-gray-500">{e.ref_folio || "—"}</TableCell>
                          <TableCell className="text-xs font-mono font-semibold text-[#1E2A4A]">{e.numero_compte}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate text-gray-700">{e.description || e.nom_compte || "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{e.debit_mur > 0 ? <span className="text-blue-700">{fmt(e.debit_mur)}</span> : "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{e.credit_mur > 0 ? <span className="text-purple-700">{fmt(e.credit_mur)}</span> : "—"}</TableCell>
                          <TableCell className={`text-xs text-right font-mono ${e.solde_progressif >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(e.solde_progressif)}</TableCell>
                          <TableCell>{e.lettre ? <Badge className="bg-green-100 text-green-700 text-xs">{e.lettre}</Badge> : <span className="text-gray-300">—</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
