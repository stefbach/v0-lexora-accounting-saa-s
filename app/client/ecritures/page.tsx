"use client"

import React, { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Plus, Save, Trash2, Pencil, X, Download, BookOpen, AlertCircle, CheckCircle2, Search, Filter } from "lucide-react"

interface Ecriture {
  id: string
  numero_compte: string
  libelle: string
  debit_mur: number
  credit_mur: number
  lettre: string | null
  date_ecriture: string
  journal: string
  ref_folio: string | null
  facture_id: string | null
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d: string | null) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })
  } catch { return d }
}

export default function EcrituresPage() {
  const searchParams = useSearchParams()
  const [societes, setSocietes] = useState<any[]>([])
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [ecritures, setEcritures] = useState<Ecriture[]>([])
  const [totals, setTotals] = useState<{ debit_total: number; credit_total: number; solde: number } | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  // Filtres - preremplis depuis URL params
  const [filterCompte, setFilterCompte] = useState(() => searchParams.get("compte") || "")
  const [filterMois, setFilterMois] = useState(() => searchParams.get("mois") || "")
  const [filterJournal, setFilterJournal] = useState("")
  const [filterQ, setFilterQ] = useState("")
  const [filterLettre, setFilterLettre] = useState("")

  // Dialog OD
  const [odOpen, setOdOpen] = useState(false)
  const [odDate, setOdDate] = useState(new Date().toISOString().slice(0, 10))
  const [odLibelle, setOdLibelle] = useState("")
  const [odJournal, setOdJournal] = useState("OD")
  const [odLignes, setOdLignes] = useState([
    { numero_compte: "", libelle: "", debit_mur: 0, credit_mur: 0 },
    { numero_compte: "", libelle: "", debit_mur: 0, credit_mur: 0 },
  ])
  const [odSaving, setOdSaving] = useState(false)

  // Dialog édit
  const [editDialog, setEditDialog] = useState<Ecriture | null>(null)

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  // Chargement societes
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => {
        const list = d.societes || []
        setSocietes(list)
        if (list.length > 0) setSocieteId(list[0].id)
      })
      .catch(() => {})
  }, [])

  const load = async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        societe_id: societeId,
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      if (filterCompte) qs.set("compte", filterCompte)
      if (filterMois) qs.set("mois", filterMois)
      if (filterJournal) qs.set("journal", filterJournal)
      if (filterQ) qs.set("q", filterQ)
      if (filterLettre) qs.set("lettre", filterLettre)
      const res = await fetch(`/api/comptable/ecritures?${qs}`)
      const d = await res.json()
      setEcritures(d.ecritures || [])
      setTotal(d.total || 0)
      setTotals(d.totals || null)
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [societeId, page])

  // OD
  const addLigne = () => setOdLignes([...odLignes, { numero_compte: "", libelle: "", debit_mur: 0, credit_mur: 0 }])
  const removeLigne = (i: number) => setOdLignes(odLignes.filter((_, idx) => idx !== i))
  const updateLigne = (i: number, field: string, value: any) => {
    const next = [...odLignes]
    next[i] = { ...next[i], [field]: field.includes('mur') ? Number(value) || 0 : value }
    setOdLignes(next)
  }
  const totalDebitOd = odLignes.reduce((s, l) => s + (Number(l.debit_mur) || 0), 0)
  const totalCreditOd = odLignes.reduce((s, l) => s + (Number(l.credit_mur) || 0), 0)
  const ecartOd = Math.round((totalDebitOd - totalCreditOd) * 100) / 100

  const saveOd = async () => {
    if (!societeId) return
    if (Math.abs(ecartOd) > 0.01) {
      setToast({ type: 'error', message: `Ecart ${ecartOd.toFixed(2)} MUR — l'OD doit etre equilibree` })
      return
    }
    setOdSaving(true)
    try {
      const res = await fetch("/api/comptable/ecritures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          date_ecriture: odDate,
          libelle: odLibelle,
          journal: odJournal,
          lignes: odLignes.filter(l => l.numero_compte && (l.debit_mur > 0 || l.credit_mur > 0)),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', message: d.error })
      } else {
        setToast({ type: 'success', message: `✓ OD enregistree : ${d.nb_lignes} lignes, ref ${d.ref_folio}` })
        setOdOpen(false)
        setOdLibelle("")
        setOdLignes([
          { numero_compte: "", libelle: "", debit_mur: 0, credit_mur: 0 },
          { numero_compte: "", libelle: "", debit_mur: 0, credit_mur: 0 },
        ])
        load()
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setOdSaving(false)
    }
  }

  // Edit
  const saveEdit = async () => {
    if (!editDialog) return
    try {
      const res = await fetch("/api/comptable/ecritures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editDialog.id,
          societe_id: societeId,
          numero_compte: editDialog.numero_compte,
          libelle: editDialog.libelle,
          debit_mur: editDialog.debit_mur,
          credit_mur: editDialog.credit_mur,
          date_ecriture: editDialog.date_ecriture,
          lettre: editDialog.lettre,
        }),
      })
      const d = await res.json()
      if (!res.ok) setToast({ type: 'error', message: d.error })
      else {
        setToast({ type: 'success', message: "✓ Ecriture modifiee" })
        setEditDialog(null)
        load()
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    }
  }

  const deleteEcr = async (e: Ecriture) => {
    if (!window.confirm(`Supprimer l'ecriture ${e.numero_compte} ${fmt(e.debit_mur || e.credit_mur)} MUR du ${formatDate(e.date_ecriture)} ?`)) return
    try {
      const res = await fetch(`/api/comptable/ecritures?id=${e.id}${societeId ? `&societe_id=${societeId}` : ''}`, { method: "DELETE" })
      const d = await res.json()
      if (!res.ok) setToast({ type: 'error', message: d.error })
      else {
        setToast({ type: 'success', message: "✓ Ecriture supprimee" })
        load()
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    }
  }

  const exportData = async (format: 'fec' | 'csv' | 'balance') => {
    if (!societeId) return
    const qs = new URLSearchParams({ societe_id: societeId, format })
    if (filterMois && /^\d{4}-\d{2}$/.test(filterMois)) {
      const [yy, mm] = filterMois.split('-').map(Number)
      const start = `${yy}-${String(mm).padStart(2, '0')}-01`
      const lastDay = new Date(yy, mm, 0).getDate()
      const end = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      qs.set('date_debut', start)
      qs.set('date_fin', end)
    }
    window.open(`/api/comptable/export-fec?${qs}`, '_blank')
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-6 space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {toast.message}
          <button onClick={() => setToast(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E] flex items-center gap-2">
            <BookOpen className="w-6 h-6" /> Écritures comptables
          </h1>
          <p className="text-sm text-gray-500">Journal chronologique global · saisie OD · édition · export FEC</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {societes.length > 0 && (
            <Select value={societeId || ""} onValueChange={v => { setSocieteId(v); setPage(1) }}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setOdOpen(true)} className="bg-[#D4AF37] text-[#0B0F2E] hover:bg-[#C9A82E]">
            <Plus className="w-4 h-4 mr-1" /> Nouvelle OD
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            <div>
              <Label className="text-xs">Compte</Label>
              <Input placeholder="401, 455..." value={filterCompte} onChange={e => setFilterCompte(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Mois</Label>
              <Input type="month" value={filterMois} onChange={e => setFilterMois(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Journal</Label>
              <Select value={filterJournal || "all"} onValueChange={v => setFilterJournal(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="BNQ">BNQ — Banque</SelectItem>
                  <SelectItem value="ACH">ACH — Achats</SelectItem>
                  <SelectItem value="VTE">VTE — Ventes</SelectItem>
                  <SelectItem value="OD">OD — Opérations diverses</SelectItem>
                  <SelectItem value="SAL">SAL — Salaires</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Libellé</Label>
              <Input placeholder="mot-clé..." value={filterQ} onChange={e => setFilterQ(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Lettre</Label>
              <Input placeholder="MP..., CL..." value={filterLettre} onChange={e => setFilterLettre(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="h-8" onClick={() => { setPage(1); load() }}>
                <Search className="w-3 h-3 mr-1" /> Filtrer
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => {
                setFilterCompte(""); setFilterMois(""); setFilterJournal(""); setFilterQ(""); setFilterLettre("")
                setPage(1); setTimeout(load, 100)
              }}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
          {totals && (
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
              <span><strong>{total}</strong> écritures</span>
              <span>Débit : <strong className="text-red-600">{fmt(totals.debit_total)}</strong></span>
              <span>Crédit : <strong className="text-green-600">{fmt(totals.credit_total)}</strong></span>
              <span>Solde : <strong className={Math.abs(totals.solde) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}>{fmt(totals.solde)}</strong> {Math.abs(totals.solde) < 0.01 && '✓'}</span>
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportData('csv')}>
                  <Download className="w-3 h-3 mr-1" /> CSV
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportData('balance')}>
                  <Download className="w-3 h-3 mr-1" /> Balance
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportData('fec')}>
                  <Download className="w-3 h-3 mr-1" /> FEC
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Chargement…
            </div>
          ) : ecritures.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Aucune écriture trouvée</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Date</TableHead>
                  <TableHead className="w-16">Journal</TableHead>
                  <TableHead className="w-20">Compte</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="text-right w-24">Débit</TableHead>
                  <TableHead className="text-right w-24">Crédit</TableHead>
                  <TableHead className="w-20">Lettre</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ecritures.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{formatDate(e.date_ecriture)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] font-mono">{e.journal}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">{e.numero_compte}</TableCell>
                    <TableCell className="text-sm max-w-[400px] truncate" title={e.libelle}>{e.libelle}</TableCell>
                    <TableCell className="text-right text-sm text-red-600">{e.debit_mur > 0 ? fmt(e.debit_mur) : '—'}</TableCell>
                    <TableCell className="text-right text-sm text-green-600">{e.credit_mur > 0 ? fmt(e.credit_mur) : '—'}</TableCell>
                    <TableCell>{e.lettre ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">{e.lettre}</Badge> : '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditDialog({ ...e })}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => deleteEcr(e)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
              <span className="text-slate-600">Page {page} / {totalPages} · {total} total</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Précédent</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Suivant →</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog OD */}
      <Dialog open={odOpen} onOpenChange={setOdOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" /> Nouvelle écriture (OD)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={odDate} onChange={e => setOdDate(e.target.value)} />
              </div>
              <div>
                <Label>Journal</Label>
                <Select value={odJournal} onValueChange={setOdJournal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OD">OD — Opérations diverses</SelectItem>
                    <SelectItem value="BNQ">BNQ — Banque</SelectItem>
                    <SelectItem value="ACH">ACH — Achats</SelectItem>
                    <SelectItem value="VTE">VTE — Ventes</SelectItem>
                    <SelectItem value="SAL">SAL — Salaires</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Libellé général</Label>
                <Input value={odLibelle} onChange={e => setOdLibelle(e.target.value)} placeholder="Provision, correction..." />
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Compte</TableHead>
                    <TableHead>Libellé ligne</TableHead>
                    <TableHead className="w-32">Débit (MUR)</TableHead>
                    <TableHead className="w-32">Crédit (MUR)</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {odLignes.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input value={l.numero_compte} onChange={e => updateLigne(i, 'numero_compte', e.target.value)} placeholder="401" className="h-8 text-sm font-mono" />
                      </TableCell>
                      <TableCell>
                        <Input value={l.libelle} onChange={e => updateLigne(i, 'libelle', e.target.value)} placeholder="(hérite du libellé général si vide)" className="h-8 text-sm" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={l.debit_mur || ""} onChange={e => updateLigne(i, 'debit_mur', e.target.value)} className="h-8 text-sm text-right" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={l.credit_mur || ""} onChange={e => updateLigne(i, 'credit_mur', e.target.value)} className="h-8 text-sm text-right" />
                      </TableCell>
                      <TableCell>
                        {odLignes.length > 2 && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => removeLigne(i)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={addLigne}>
                <Plus className="w-3 h-3 mr-1" /> Ajouter une ligne
              </Button>
              <div className="text-sm">
                Débit : <strong className="text-red-600">{fmt(totalDebitOd)}</strong> ·
                Crédit : <strong className="text-green-600 ml-1">{fmt(totalCreditOd)}</strong> ·
                Écart : <strong className={Math.abs(ecartOd) < 0.01 ? 'text-emerald-600 ml-1' : 'text-red-600 ml-1'}>
                  {fmt(ecartOd)} {Math.abs(ecartOd) < 0.01 && '✓'}
                </strong>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOdOpen(false)}>Annuler</Button>
              <Button
                onClick={saveOd}
                disabled={odSaving || Math.abs(ecartOd) > 0.01 || totalDebitOd === 0}
                className="bg-[#0B0F2E] text-white"
              >
                {odSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Enregistrer l'OD
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog édit */}
      <Dialog open={!!editDialog} onOpenChange={o => { if (!o) setEditDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" /> Modifier l'écriture
            </DialogTitle>
          </DialogHeader>
          {editDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={editDialog.date_ecriture?.substring(0, 10) || ''} onChange={e => setEditDialog({ ...editDialog, date_ecriture: e.target.value })} />
                </div>
                <div>
                  <Label>Compte</Label>
                  <Input value={editDialog.numero_compte || ''} onChange={e => setEditDialog({ ...editDialog, numero_compte: e.target.value })} className="font-mono" />
                </div>
              </div>
              <div>
                <Label>Libellé</Label>
                <Input value={editDialog.libelle || ''} onChange={e => setEditDialog({ ...editDialog, libelle: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Débit</Label>
                  <Input type="number" step="0.01" value={editDialog.debit_mur || ''} onChange={e => setEditDialog({ ...editDialog, debit_mur: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Crédit</Label>
                  <Input type="number" step="0.01" value={editDialog.credit_mur || ''} onChange={e => setEditDialog({ ...editDialog, credit_mur: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div>
                <Label>Lettre (optionnel)</Label>
                <Input value={editDialog.lettre || ''} onChange={e => setEditDialog({ ...editDialog, lettre: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditDialog(null)}>Annuler</Button>
                <Button onClick={saveEdit} className="bg-[#0B0F2E] text-white">
                  <Save className="w-4 h-4 mr-1" /> Sauvegarder
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
