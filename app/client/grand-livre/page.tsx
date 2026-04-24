"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, BookOpen, ChevronLeft, ChevronRight, Download, RefreshCw, FileDown } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString("fr-FR") : "—" }

const COMPTE_NAMES: Record<string, string> = {
  '401': 'Fournisseurs', '411': 'Clients', '421': 'Personnel',
  '431': 'CSG/NSF', '432': 'Training Levy', '444': 'PAYE',
  '4456': 'TVA déductible', '4457': 'TVA collectée',
  '455': 'Comptes courants associés', '467': 'Collaborateurs',
  '512': 'Banque', '581': 'Virements internes',
  '601': 'Achats', '606': 'Fournitures', '611': 'Sous-traitance',
  '612': 'Loyers', '616': 'Assurances', '622': 'Honoraires',
  '623': 'Publicité', '624': 'Transport', '626': 'Télécom',
  '627': 'Frais bancaires', '628': 'Charges diverses',
  '641': 'Salaires', '641100': 'Salaires bruts',
  '645': 'Charges patronales', '645100': 'Cotisations patronales',
  '651': 'Redevances SaaS', '666': 'Pertes de change',
  '706': "Chiffre d'affaires", '753': 'Commissions',
  '766': 'Gains de change',
}

function getCompteName(compte: string): string {
  if (COMPTE_NAMES[compte]) return COMPTE_NAMES[compte]
  // Try prefix match
  for (let len = compte.length; len >= 2; len--) {
    const prefix = compte.substring(0, len)
    if (COMPTE_NAMES[prefix]) return COMPTE_NAMES[prefix]
  }
  return ''
}

function getLetterColor(lettre: string): string {
  if (!lettre) return 'transparent'
  if (lettre.startsWith('MRA')) return '#fee2e2'
  if (lettre.startsWith('M')) return '#dbeafe'
  if (lettre.startsWith('RG')) return '#d1fae5'
  if (lettre.startsWith('R')) return '#dcfce7'
  if (lettre.startsWith('S')) return '#f3e8ff'
  if (lettre.startsWith('L')) return '#ffedd5'
  if (lettre.startsWith('FEE')) return '#fef3c7'
  if (lettre.startsWith('BNQ')) return '#e0f2fe'
  return '#f3f4f6'
}

interface Societe { id: string; nom: string }

export default function ClientGrandLivrePage() {
  const { societeId, societe } = useSocieteActive()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [compteDebut, setCompteDebut] = useState("")
  const [compteFin, setCompteFin] = useState("")
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [journal, setJournal] = useState("all")
  const [exercice, setExercice] = useState("")
  const [lettreFilter, setLettreFilter] = useState<'all' | 'lettered' | 'unlettered'>('all')
  const [highlightedLettre, setHighlightedLettre] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

  // Available exercices (Mauritius fiscal year July-June)
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
  const currentExStart = currentMonth >= 7 ? currentYear : currentYear - 1
  const availableExercices = Array.from({ length: 5 }, (_, i) => {
    const s = currentExStart - i
    return `${s}-${s + 1}`
  })

  const load = useCallback(async () => {
    if (!societeId) { setData(null); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: societeId, page: String(page), limit: "50" })
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
  }, [societeId, page, compteDebut, compteFin, dateDebut, dateFin, journal, exercice])

  useEffect(() => { load() }, [load])

  const allEcritures = data?.ecritures || []
  const ecritures = allEcritures.filter((e: any) => {
    if (lettreFilter === 'lettered') return e.lettre
    if (lettreFilter === 'unlettered') return !e.lettre
    return true
  })
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

  const exportPDF = async () => {
    if (!societeId || pdfLoading) return
    setPdfLoading(true)
    try {
      // Fetch ALL entries (no pagination) for the PDF
      const params = new URLSearchParams({ societe_id: societeId, limit: "0" })
      if (compteDebut) params.set("compte_debut", compteDebut)
      if (compteFin) params.set("compte_fin", compteFin)
      if (dateDebut) params.set("date_debut", dateDebut)
      if (dateFin) params.set("date_fin", dateFin)
      if (journal && journal !== "all") params.set("journal", journal)
      if (exercice) params.set("exercice", exercice)
      const res = await fetch(`/api/comptable/grand-livre?${params}`)
      const pdfData = await res.json()
      const allPdfEcritures = pdfData?.ecritures || []

      if (allPdfEcritures.length === 0) {
        setPdfLoading(false)
        return
      }

      const { pdf } = await import('@react-pdf/renderer')
      const { GrandLivrePDF } = await import('@/components/pdf/GrandLivrePDF')
      const socData = societe
      const blob = await pdf(
        <GrandLivrePDF
          societe={socData}
          dateDebut={dateDebut || pdfData?.exercice ? `${pdfData.exercice?.split('-')[0]}-07-01` : ''}
          dateFin={dateFin || pdfData?.exercice ? `${pdfData.exercice?.split('-')[1]}-06-30` : ''}
          ecritures={allPdfEcritures}
          compteNames={COMPTE_NAMES}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `grand-livre_${socData?.nom || 'export'}_${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[grand-livre] PDF export error:', e)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Grand Livre" }]}
      kicker="Comptabilité"
      title="Grand Livre"
      subtitle="Écritures comptables avec solde progressif, lettrage et export CSV / PDF."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!ecritures.length}>
            <Download className="w-4 h-4 mr-2" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={!societeId || pdfLoading}>
            {pdfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}PDF
          </Button>
        </>
      }
    >
      <div className="space-y-6">

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
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
          <div><Label className="text-xs">Compte debut</Label><Input className="h-9" placeholder="ex: 401" value={compteDebut} onChange={e => setCompteDebut(e.target.value)} /></div>
          <div><Label className="text-xs">Compte fin</Label><Input className="h-9" placeholder="ex: 706" value={compteFin} onChange={e => setCompteFin(e.target.value)} /></div>
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

      {/* Lettrage filter + highlight */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">Lettrage :</span>
        <div className="flex rounded-lg border overflow-hidden">
          {([['all', 'Toutes'], ['lettered', 'Lettrées'], ['unlettered', 'Non lettrées']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setLettreFilter(val)} className={`px-3 py-1 text-xs font-medium ${lettreFilter === val ? 'bg-[#0B0F2E] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
        {highlightedLettre && (
          <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 border border-yellow-300 rounded text-xs">
            <span>Lettrage <strong>{highlightedLettre}</strong> : {ecritures.filter((e: any) => e.lettre === highlightedLettre).length} écritures liées</span>
            <button onClick={() => setHighlightedLettre(null)} className="text-gray-500 hover:text-gray-800">✕</button>
          </div>
        )}
      </div>

      {!societeId ? (
        <Card><CardContent className="py-16 text-center text-gray-400">Selectionnez une societe</CardContent></Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]" /></div>
      ) : !data ? (
        <Card><CardContent className="py-16 text-center text-gray-400">Erreur de chargement</CardContent></Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-4">
            {hasSoldeOuverture && (
              <Card className="border-l-4 border-l-[#D4AF37]">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Report a nouveau</p>
                  <p className={`text-xl font-bold ${data.solde_ouverture >= 0 ? "text-[#D4AF37]" : "text-red-600"}`}>{fmt(data.solde_ouverture)} MUR</p>
                  <p className="text-xs text-gray-400">{Object.keys(soldeOuvertureParCompte).length} comptes</p>
                </CardContent>
              </Card>
            )}
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Total Debit</p><p className="text-xl font-bold text-blue-700">{fmt(data.total_debit)} MUR</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Total Credit</p><p className="text-xl font-bold text-purple-700">{fmt(data.total_credit)} MUR</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Solde Cloture</p><p className={`text-xl font-bold ${data.solde_cloture >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(Math.abs(data.solde_cloture))} MUR</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Lettrage</p><p className="text-xl font-bold text-[#0B0F2E]">{lettrage.lettrees} / {lettrage.total}</p><p className="text-xs text-gray-400">{lettrage.non_lettrees} non lettrees</p></CardContent></Card>
          </div>

          {/* Tableau */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-[#0B0F2E]">
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
                            <TableRow className="bg-[#D4AF37]/10 border-b-2 border-[#D4AF37]/30">
                              <TableCell colSpan={9} className="text-xs font-bold text-[#0B0F2E] py-2">
                                Report a nouveau (soldes d&apos;ouverture)
                              </TableCell>
                            </TableRow>
                            {openingRows.map(row => (
                              <TableRow key={`opening-${row.compte}`} className="bg-[#D4AF37]/5">
                                <TableCell className="text-xs font-mono whitespace-nowrap text-gray-400">Ouverture</TableCell>
                                <TableCell><Badge variant="outline" className="text-[10px] px-1 py-0 border-[#D4AF37] text-[#D4AF37]">RAN</Badge></TableCell>
                                <TableCell className="text-xs font-mono text-gray-400">--</TableCell>
                                <TableCell className="text-xs font-mono font-semibold text-[#0B0F2E]">{row.compte}</TableCell>
                                <TableCell className="text-xs text-gray-500 italic">Solde d&apos;ouverture (report a nouveau)</TableCell>
                                <TableCell className="text-xs text-right font-mono">{row.solde > 0 ? <span className="text-blue-700">{fmt(row.solde)}</span> : "—"}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{row.solde < 0 ? <span className="text-purple-700">{fmt(Math.abs(row.solde))}</span> : "—"}</TableCell>
                                <TableCell className={`text-xs text-right font-mono ${row.solde >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(row.solde)}</TableCell>
                                <TableCell><span className="text-gray-300">—</span></TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-b-2 border-[#0B0F2E]/20">
                              <TableCell colSpan={9} className="py-0.5" />
                            </TableRow>
                          </>
                        )
                      })()}
                      {ecritures.map((e: any, idx: number) => (
                        <TableRow key={e.id} className={`${highlightedLettre && e.lettre === highlightedLettre ? 'bg-yellow-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <TableCell className="text-xs font-mono whitespace-nowrap">{fmtDate(e.date_ecriture)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px] px-1 py-0">{e.journal || "—"}</Badge></TableCell>
                          <TableCell className="text-xs font-mono text-gray-500">{e.ref_folio || "—"}</TableCell>
                          <TableCell className="text-xs font-mono font-semibold text-[#0B0F2E]">{e.numero_compte}{getCompteName(e.numero_compte) ? <span className="ml-1 text-gray-400 font-normal">{getCompteName(e.numero_compte)}</span> : ''}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate text-gray-700">{e.description || e.nom_compte || "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{e.debit_mur > 0 ? <span className="text-blue-700">{fmt(e.debit_mur)}</span> : "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{e.credit_mur > 0 ? <span className="text-purple-700">{fmt(e.credit_mur)}</span> : "—"}</TableCell>
                          <TableCell className={`text-xs text-right font-mono ${e.solde_progressif >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(e.solde_progressif)}</TableCell>
                          <TableCell>{e.lettre ? <span onClick={() => setHighlightedLettre(e.lettre === highlightedLettre ? null : e.lettre)} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold cursor-pointer" style={{ backgroundColor: getLetterColor(e.lettre) }}>{e.lettre}</span> : <span className="text-gray-300">—</span>}</TableCell>
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
    </ClientPageShell>
  )
}
