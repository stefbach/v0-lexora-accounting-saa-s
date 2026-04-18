"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  BookOpen, Plus, Pencil, Trash2, Upload, Download, Search, RefreshCw, Loader2, FileText,
} from "lucide-react"
import { toast } from "sonner"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Compte {
  id: string
  societe_id: string | null
  compte: string
  libelle: string
  classe: number
  type_compte: string
  sens_normal: "D" | "C"
  compte_parent: string | null
  niveau: number
  actif: boolean
  est_analytique: boolean
  notes: string | null
}

const CLASSES = [
  { value: "1", label: "1 — Capitaux" },
  { value: "2", label: "2 — Immobilisations" },
  { value: "3", label: "3 — Stocks" },
  { value: "4", label: "4 — Tiers" },
  { value: "5", label: "5 — Trésorerie" },
  { value: "6", label: "6 — Charges" },
  { value: "7", label: "7 — Produits" },
  { value: "8", label: "8 — Spéciaux" },
]

const TYPES = [
  { value: "actif", label: "Actif" },
  { value: "passif", label: "Passif" },
  { value: "charge", label: "Charge" },
  { value: "produit", label: "Produit" },
  { value: "capitaux", label: "Capitaux" },
]

const emptyForm: Partial<Compte> = {
  compte: "",
  libelle: "",
  type_compte: "actif",
  sens_normal: "D",
  compte_parent: "",
  niveau: 3,
  est_analytique: false,
  notes: "",
}

export default function PlanComptablePage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [comptes, setComptes] = useState<Compte[]>([])
  const [search, setSearch] = useState("")
  const [classeFilter, setClasseFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [includeInactive, setIncludeInactive] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Compte>>(emptyForm)

  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState("")
  const [importErrors, setImportErrors] = useState<string[]>([])

  const fetchComptes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (societeId) params.set("societe_id", societeId)
      if (includeInactive) params.set("include_inactive", "1")
      const res = await fetch(`/api/comptable/plan-comptable?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur chargement")
      setComptes(body.comptes || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur chargement")
    } finally {
      setLoading(false)
    }
  }, [societeId, includeInactive])

  useEffect(() => { fetchComptes() }, [fetchComptes])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return comptes.filter(c => {
      if (classeFilter !== "all" && String(c.classe) !== classeFilter) return false
      if (typeFilter !== "all" && c.type_compte !== typeFilter) return false
      if (q) {
        if (!c.compte.toLowerCase().includes(q) && !c.libelle.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [comptes, search, classeFilter, typeFilter])

  const stats = useMemo(() => {
    const byClasse = new Map<number, number>()
    for (const c of comptes) byClasse.set(c.classe, (byClasse.get(c.classe) || 0) + 1)
    return { total: comptes.length, byClasse }
  }, [comptes])

  function openNew() {
    setEditing({ ...emptyForm, societe_id: societeId || null })
    setDialogOpen(true)
  }

  function openEdit(c: Compte) {
    setEditing({ ...c })
    setDialogOpen(true)
  }

  async function save() {
    if (!editing.compte || !editing.libelle) {
      toast.error("Compte et libellé requis")
      return
    }
    setSaving(true)
    try {
      const isEdit = Boolean(editing.id)
      const res = await fetch("/api/comptable/plan-comptable", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur sauvegarde")
      toast.success(isEdit ? "Compte modifié" : "Compte créé")
      setDialogOpen(false)
      fetchComptes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  async function remove(c: Compte) {
    if (!confirm(`Supprimer le compte ${c.compte} — ${c.libelle} ?\n(Si utilisé, il sera désactivé.)`)) return
    try {
      const res = await fetch(`/api/comptable/plan-comptable?id=${c.id}`, { method: "DELETE" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur suppression")
      toast.success(body.soft_deleted ? "Compte désactivé (utilisé dans des écritures)" : "Compte supprimé")
      fetchComptes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur suppression")
    }
  }

  function exportCSV() {
    const header = ["compte", "libelle", "type_compte", "sens_normal", "compte_parent", "niveau", "actif", "notes"]
    const rows = filtered.map(c => [
      c.compte, c.libelle, c.type_compte, c.sens_normal,
      c.compte_parent || "", c.niveau, c.actif ? "1" : "0", (c.notes || "").replace(/[\r\n]+/g, " "),
    ])
    const csv = [header, ...rows]
      .map(r => r.map(v => {
        const s = String(v ?? "")
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(";"))
      .join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `plan_comptable_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (!lines.length) return []
    const sep = lines[0].includes(";") ? ";" : ","
    const header = splitCSVLine(lines[0], sep).map(h => h.trim().toLowerCase())
    const out: Record<string, string>[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCSVLine(lines[i], sep)
      const row: Record<string, string> = {}
      header.forEach((h, idx) => { row[h] = (cells[idx] || "").trim() })
      if (row.compte) out.push(row)
    }
    return out
  }

  function splitCSVLine(line: string, sep: string): string[] {
    const out: string[] = []
    let cur = ""
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ
      } else if (ch === sep && !inQ) {
        out.push(cur); cur = ""
      } else cur += ch
    }
    out.push(cur)
    return out
  }

  async function runImport() {
    setImportErrors([])
    const rows = parseCSV(importText)
    if (!rows.length) { toast.error("Aucune ligne valide dans le CSV"); return }
    const payload = rows.map(r => ({
      compte: r.compte,
      libelle: r.libelle || r["libellé"] || "",
      type_compte: (r.type_compte || r.type || "actif").toLowerCase(),
      sens_normal: (r.sens_normal || r.sens || "D").toUpperCase(),
      compte_parent: r.compte_parent || null,
      niveau: r.niveau ? parseInt(r.niveau) : 3,
      notes: r.notes || null,
      societe_id: societeId || null,
    }))
    setSaving(true)
    try {
      const res = await fetch("/api/comptable/plan-comptable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comptes: payload, ignore_errors: true }),
      })
      const body = await res.json()
      if (!res.ok) {
        setImportErrors(body.details || [body.error || "Erreur"])
        throw new Error(body.error || "Erreur import")
      }
      toast.success(`${body.imported} compte(s) importé(s)${body.skipped ? ` — ${body.skipped} ignorés` : ""}`)
      if (body.errors?.length) setImportErrors(body.errors)
      else {
        setImportOpen(false); setImportText("")
      }
      fetchComptes()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur import")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ClientPageShell
      kicker="Comptabilité"
      title="Plan Comptable"
      subtitle="Gestion du plan de comptes (PCM) — classes 1 à 8"
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Plan comptable" }]}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importer CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> Exporter CSV
          </Button>
          <Button size="sm" onClick={openNew} style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau compte
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500">Total comptes</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        {[1, 2, 4, 6, 7].map(cl => (
          <Card key={cl}>
            <CardContent className="p-4">
              <div className="text-xs text-gray-500">Classe {cl}</div>
              <div className="text-2xl font-bold">{stats.byClasse.get(cl) || 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" /> Comptes
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchComptes}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input placeholder="Recherche compte ou libellé…" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={classeFilter} onValueChange={setClasseFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Classe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes classes</SelectItem>
                {CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous types</SelectItem>
                {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm px-2">
              <Switch checked={includeInactive} onCheckedChange={setIncludeInactive} />
              Inactifs
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="border rounded-md overflow-auto max-h-[60vh]">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead className="w-[110px]">Compte</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead className="w-[80px]">Classe</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead className="w-[70px]">Sens</TableHead>
                    <TableHead className="w-[100px]">Parent</TableHead>
                    <TableHead className="w-[70px] text-center">Actif</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">Aucun compte</TableCell></TableRow>
                  ) : filtered.map(c => (
                    <TableRow key={c.id} className={!c.actif ? "opacity-50" : ""}>
                      <TableCell className="font-mono">{c.compte}</TableCell>
                      <TableCell>{c.libelle}</TableCell>
                      <TableCell><Badge variant="outline">{c.classe}</Badge></TableCell>
                      <TableCell><span className="text-xs">{c.type_compte}</span></TableCell>
                      <TableCell><Badge variant={c.sens_normal === "D" ? "default" : "secondary"}>{c.sens_normal}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">{c.compte_parent || "—"}</TableCell>
                      <TableCell className="text-center">{c.actif ? "✓" : "✗"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(c)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="text-xs text-gray-500 mt-2">{filtered.length} / {comptes.length} comptes</div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Modifier le compte" : "Nouveau compte"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <Label>N° compte *</Label>
              <Input
                disabled={Boolean(editing.id)}
                value={editing.compte || ""}
                onChange={e => setEditing({ ...editing, compte: e.target.value })}
                placeholder="411000"
              />
            </div>
            <div>
              <Label>Compte parent</Label>
              <Input
                value={editing.compte_parent || ""}
                onChange={e => setEditing({ ...editing, compte_parent: e.target.value })}
                placeholder="411"
              />
            </div>
            <div className="col-span-2">
              <Label>Libellé *</Label>
              <Input value={editing.libelle || ""} onChange={e => setEditing({ ...editing, libelle: e.target.value })} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={editing.type_compte || "actif"} onValueChange={v => setEditing({ ...editing, type_compte: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sens normal</Label>
              <Select value={editing.sens_normal || "D"} onValueChange={(v: "D" | "C") => setEditing({ ...editing, sens_normal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="D">Débiteur</SelectItem>
                  <SelectItem value="C">Créditeur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Niveau</Label>
              <Input type="number" min={1} max={6} value={editing.niveau || 3} onChange={e => setEditing({ ...editing, niveau: parseInt(e.target.value) || 3 })} />
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={editing.est_analytique || false} onCheckedChange={v => setEditing({ ...editing, est_analytique: v })} />
              <Label>Analytique</Label>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={editing.notes || ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importer un plan comptable (CSV)</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-gray-600">
              Format attendu : colonnes <code>compte;libelle;type_compte;sens_normal;compte_parent;niveau;notes</code>
              (séparateur <code>;</code> ou <code>,</code>, première ligne = en-tête).
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <label>
                  <FileText className="h-4 w-4 mr-1" />
                  Charger un fichier…
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={async e => {
                    const f = e.target.files?.[0]
                    if (f) setImportText(await f.text())
                  }} />
                </label>
              </Button>
              <span className="text-xs text-gray-500">ou colle directement le CSV ci-dessous</span>
            </div>
            <Textarea rows={10} value={importText} onChange={e => setImportText(e.target.value)} className="font-mono text-xs"
              placeholder="compte;libelle;type_compte;sens_normal;compte_parent;niveau&#10;411000;Clients;actif;D;411;4" />
            {importErrors.length > 0 && (
              <div className="border border-red-200 bg-red-50 rounded p-2 text-xs text-red-700 max-h-32 overflow-auto">
                {importErrors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Annuler</Button>
            <Button onClick={runImport} disabled={saving || !importText.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Importer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}
