"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, BookOpen, Search, Download } from "lucide-react"

interface EcritureGroupee {
  compte: string
  libelle_compte: string
  ecritures: Array<{
    id: string; date_ecriture: string; journal: string
    libelle: string; debit: number; credit: number; numero_piece: string | null
  }>
  total_debit: number; total_credit: number; solde: number
}

interface Societe { id: string; nom: string }

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function GrandLivrePage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [comptes, setComptes] = useState<EcritureGroupee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchCompte, setSearchCompte] = useState("")
  const [classeFilter, setClasseFilter] = useState("all")
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [expandedCompte, setExpandedCompte] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (selectedSociete === "all") { setLoading(false); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: selectedSociete })
      if (classeFilter !== "all") params.set("classe", classeFilter)
      if (dateDebut) params.set("date_debut", dateDebut)
      if (dateFin) params.set("date_fin", dateFin)
      const res = await fetch(`/api/comptable/grand-livre?${params}`)
      const data = await res.json()
      setComptes(data.grand_livre || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedSociete, classeFilter, dateDebut, dateFin])

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = comptes.filter(c =>
    c.compte.startsWith(searchCompte) || c.libelle_compte.toLowerCase().includes(searchCompte.toLowerCase())
  )

  const totaux = {
    debit: filtered.reduce((s, c) => s + c.total_debit, 0),
    credit: filtered.reduce((s, c) => s + c.total_credit, 0),
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Grand Livre</h1>
          <p className="text-sm text-gray-500 mt-1">Détail des écritures par compte</p>
        </div>
        <Button variant="outline" className="gap-2"><Download className="w-4 h-4" /> Exporter</Button>
      </div>

      {/* Filtres */}
      <Card><CardContent className="p-4">
        <div className="flex flex-wrap gap-3">
          <Select value={selectedSociete} onValueChange={setSelectedSociete}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Choisir une société..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">-- Choisir une société --</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={classeFilter} onValueChange={setClasseFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Toutes classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes classes</SelectItem>
              {["1","2","3","4","5","6","7"].map(c => <SelectItem key={c} value={c}>Classe {c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input className="pl-9 w-40" placeholder="N° compte..." value={searchCompte} onChange={e => setSearchCompte(e.target.value)} />
          </div>
          <Input type="date" className="w-40" placeholder="Date début" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
          <Input type="date" className="w-40" placeholder="Date fin" value={dateFin} onChange={e => setDateFin(e.target.value)} />
        </div>
      </CardContent></Card>

      {/* KPIs */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Comptes actifs</p>
            <p className="text-2xl font-bold text-[#1E2A4A]">{filtered.length}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Débit</p>
            <p className="text-2xl font-bold text-blue-700">{fmt(totaux.debit)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">Total Crédit</p>
            <p className="text-2xl font-bold text-red-700">{fmt(totaux.credit)}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Grand Livre */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#1E2A4A] flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> Grand Livre {filtered.length > 0 ? `(${filtered.length} comptes)` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {selectedSociete === "all" ? (
            <div className="text-center py-12 text-gray-500">Sélectionnez une société pour afficher le grand livre</div>
          ) : loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#1E2A4A]" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucune écriture trouvée</div>
          ) : (
            <div className="divide-y">
              {filtered.map(c => (
                <div key={c.compte}>
                  {/* En-tête compte */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 bg-blue-50/40"
                    onClick={() => setExpandedCompte(expandedCompte === c.compte ? null : c.compte)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#1E2A4A] text-sm bg-[#1E2A4A]/10 px-2 py-1 rounded">{c.compte}</span>
                      <span className="font-medium text-gray-700">{c.libelle_compte}</span>
                      <span className="text-xs text-gray-400">{c.ecritures.length} écriture{c.ecritures.length > 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-blue-600">D: {fmt(c.total_debit)}</span>
                      <span className="text-red-600">C: {fmt(c.total_credit)}</span>
                      <span className={`font-semibold ${c.solde >= 0 ? "text-blue-700" : "text-red-700"}`}>
                        Solde: {fmt(Math.abs(c.solde))} {c.solde >= 0 ? "D" : "C"}
                      </span>
                      <span className="text-gray-400">{expandedCompte === c.compte ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {/* Détail écritures */}
                  {expandedCompte === c.compte && (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead>Date</TableHead>
                          <TableHead>Journal</TableHead>
                          <TableHead>Pièce</TableHead>
                          <TableHead>Libellé</TableHead>
                          <TableHead className="text-right">Débit</TableHead>
                          <TableHead className="text-right">Crédit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {c.ecritures.map(e => (
                          <TableRow key={e.id}>
                            <TableCell className="text-sm">{new Date(e.date_ecriture).toLocaleDateString("fr-FR")}</TableCell>
                            <TableCell><span className="text-xs bg-gray-100 px-2 py-1 rounded">{e.journal || "—"}</span></TableCell>
                            <TableCell className="text-xs font-mono text-gray-500">{e.numero_piece || "—"}</TableCell>
                            <TableCell className="text-sm">{e.libelle}</TableCell>
                            <TableCell className="text-right text-blue-600">{e.debit > 0 ? fmt(e.debit) : "—"}</TableCell>
                            <TableCell className="text-right text-red-600">{e.credit > 0 ? fmt(e.credit) : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
