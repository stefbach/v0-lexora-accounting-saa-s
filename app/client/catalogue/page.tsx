"use client"

/**
 * Page /client/catalogue — Gestion CRUD des services / produits récurrents.
 *
 * Remplace le tab "Catalogue" de /client/facturation-settings qui stockait
 * tout en localStorage. Persistance Supabase via /api/client/catalogue.
 *
 * Auto-import : au premier chargement, si la DB est vide et qu'il y a des
 * articles en localStorage (legacy), on propose à l'utilisateur d'importer.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Package,
  RefreshCw,
  Upload,
  FileSpreadsheet,
  Search,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { CatalogueImportDialog } from "@/components/client/CatalogueImportDialog"

interface CatalogueItem {
  id: string
  description: string
  prix_unitaire: number
  devise: string
  tva_applicable: boolean
  categorie: string | null
  unite: string
  actif: boolean
  created_at?: string
  updated_at?: string
}

const DEVISES = ["MUR", "EUR", "USD", "GBP"] as const
const UNITES_SUGGESTIONS = ["Forfait", "Heure", "Jour", "Mois", "Unité"]

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    dev
  )
}

export default function ClientCataloguePage() {
  const { societeId } = useSocieteActive()
  const [items, setItems] = useState<CatalogueItem[]>([])
  const [loading, setLoading] = useState(false)
  const [includeInactifs, setIncludeInactifs] = useState(false)
  const [search, setSearch] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogueItem | null>(null)
  const [fDescription, setFDescription] = useState("")
  const [fPrix, setFPrix] = useState("")
  const [fDevise, setFDevise] = useState("MUR")
  const [fTva, setFTva] = useState(true)
  const [fCategorie, setFCategorie] = useState("")
  const [fUnite, setFUnite] = useState("Forfait")
  const [fActif, setFActif] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Legacy localStorage detection
  const [legacyCount, setLegacyCount] = useState(0)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const url = `/api/client/catalogue?societe_id=${societeId}${
        includeInactifs ? "&include_inactifs=1" : ""
      }`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erreur")
      setItems(data?.items || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, includeInactifs])

  useEffect(() => {
    load()
  }, [load])

  // Détection legacy localStorage (auto-import)
  useEffect(() => {
    if (loading || items.length > 0) {
      setLegacyCount(0)
      return
    }
    try {
      const raw = localStorage.getItem("lexora_invoice_catalogue")
      if (!raw) return
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) setLegacyCount(arr.length)
    } catch {
      /* ignore */
    }
  }, [items, loading])

  function openNew() {
    setEditing(null)
    setFDescription("")
    setFPrix("")
    setFDevise("MUR")
    setFTva(true)
    setFCategorie("")
    setFUnite("Forfait")
    setFActif(true)
    setDialogOpen(true)
  }

  function openEdit(item: CatalogueItem) {
    setEditing(item)
    setFDescription(item.description)
    setFPrix(String(item.prix_unitaire))
    setFDevise(item.devise)
    setFTva(item.tva_applicable)
    setFCategorie(item.categorie || "")
    setFUnite(item.unite || "Forfait")
    setFActif(item.actif)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!societeId) return
    const desc = fDescription.trim()
    if (!desc) {
      showToast("Description requise", "error")
      return
    }
    const prix = Number(fPrix)
    if (!Number.isFinite(prix) || prix < 0) {
      showToast("Prix invalide", "error")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        description: desc,
        prix_unitaire: prix,
        devise: fDevise,
        tva_applicable: fTva,
        categorie: fCategorie.trim() || null,
        unite: fUnite,
        actif: fActif,
      }
      const url = editing
        ? `/api/client/catalogue/${editing.id}`
        : `/api/client/catalogue`
      const method = editing ? "PATCH" : "POST"
      const body = editing ? payload : { ...payload, societe_id: societeId }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erreur")
      showToast(editing ? "Article modifié" : "Article ajouté")
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(item: CatalogueItem) {
    if (!confirm(`Supprimer "${item.description}" du catalogue ?`)) return
    try {
      const res = await fetch(`/api/client/catalogue/${item.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Erreur")
      showToast("Article supprimé")
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  async function importLegacy() {
    if (!societeId) return
    try {
      const raw = localStorage.getItem("lexora_invoice_catalogue")
      if (!raw) return
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr) || arr.length === 0) return
      const itemsToImport = arr.map((it: any) => ({
        description: String(it.description || ""),
        prix_unitaire: Number(it.prix_unitaire) || 0,
        devise: String(it.devise || "MUR"),
        tva_applicable: it.tva_applicable !== false,
        categorie: it.categorie ? String(it.categorie) : null,
        unite: it.unite ? String(it.unite) : "Forfait",
        actif: true,
      }))
      const res = await fetch(`/api/client/catalogue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, items: itemsToImport }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erreur")
      showToast(`Importé : ${data?.inserted} article(s)`)
      // Garde localStorage en backup (l'utilisateur peut le vider plus tard)
      setLegacyCount(0)
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur import", "error")
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.description.toLowerCase().includes(q) ||
        (i.categorie || "").toLowerCase().includes(q),
    )
  }, [items, search])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.categorie) set.add(i.categorie)
    return Array.from(set).sort()
  }, [items])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-6xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* HEADER */}
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 p-3 text-white shadow-md">
                <Package className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-indigo-900">
                  Catalogue services / produits
                </h1>
                <p className="text-sm text-indigo-800/80 mt-0.5">
                  Articles réutilisables pour accélérer la création de factures
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
                disabled={!societeId}
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                Importer fichier
              </Button>
              <Button
                onClick={openNew}
                disabled={!societeId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Nouvel article
              </Button>
            </div>
          </div>
        </div>

        {/* Auto-import legacy */}
        {legacyCount > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <strong>{legacyCount} article(s) trouvé(s) en local storage</strong> —
                votre ancien catalogue n'était pas synchronisé avec Supabase.
              </div>
              <Button
                onClick={importLegacy}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Upload className="h-4 w-4 mr-1.5" />
                Importer maintenant
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Filtres */}
        <Card>
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="pl-8 h-9"
              />
            </div>
            <Label className="flex items-center gap-2 cursor-pointer text-sm">
              <Switch checked={includeInactifs} onCheckedChange={setIncludeInactifs} />
              Inclure inactifs
            </Label>
          </CardContent>
        </Card>

        {/* Liste */}
        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              Société non disponible.
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              {items.length === 0 ? (
                <>
                  <Package className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                  Aucun article. Ajoutez vos prestations courantes pour les
                  réutiliser dans vos factures.
                </>
              ) : (
                "Aucun résultat pour ce filtre."
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Unité</TableHead>
                    <TableHead className="text-right">Prix unitaire</TableHead>
                    <TableHead>TVA</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id} className={!item.actif ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell>
                        {item.categorie ? (
                          <Badge variant="outline">{item.categorie}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.unite}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(item.prix_unitaire, item.devise)}
                      </TableCell>
                      <TableCell>
                        {item.tva_applicable ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-300">
                            TVA 15%
                          </Badge>
                        ) : (
                          <Badge variant="outline">Zero-rated</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.actif ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                            Actif
                          </Badge>
                        ) : (
                          <Badge variant="outline">Inactif</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(item)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifier l'article" : "Nouvel article"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Description *</Label>
                <Input
                  value={fDescription}
                  onChange={(e) => setFDescription(e.target.value)}
                  placeholder="Prestation comptable mensuelle"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Prix unitaire</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fPrix}
                    onChange={(e) => setFPrix(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Devise</Label>
                  <Select value={fDevise} onValueChange={setFDevise}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVISES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Catégorie</Label>
                  <Input
                    value={fCategorie}
                    onChange={(e) => setFCategorie(e.target.value)}
                    placeholder="Comptabilité, Audit..."
                    list="catalogue-cat-suggestions"
                  />
                  <datalist id="catalogue-cat-suggestions">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <Label>Unité</Label>
                  <Input
                    value={fUnite}
                    onChange={(e) => setFUnite(e.target.value)}
                    list="catalogue-unite-suggestions"
                  />
                  <datalist id="catalogue-unite-suggestions">
                    {UNITES_SUGGESTIONS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div className="space-y-1">
                <Label>TVA applicable</Label>
                <Select
                  value={fTva ? "oui" : "non"}
                  onValueChange={(v) => setFTva(v === "oui")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oui">Oui — TVA 15%</SelectItem>
                    <SelectItem value="non">Non — Zero-rated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing && (
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={fActif} onCheckedChange={setFActif} />
                  Article actif (affiché dans le sélecteur des factures)
                </Label>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={submitting || !fDescription.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Enregistrer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog d'import en masse (CSV/XLSX) — appelle l'endpoint
            bulk POST /api/client/catalogue { items: [...] } mis en place
            depuis la PR #54. */}
        <CatalogueImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          societeId={societeId}
          onImported={() => load()}
        />
      </div>
    </ClientPageShell>
  )
}
