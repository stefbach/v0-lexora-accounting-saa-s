"use client"

/**
 * Page /client/contacts — Gestion CRUD des contacts clients (factures_contacts).
 *
 * Remplace le tab "Clients" de /client/facturation-settings (localStorage)
 * par une UI persistée Supabase. Auto-import depuis localStorage si présent.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
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
  Users,
  RefreshCw,
  Upload,
  Search,
  Mail,
  Phone,
  Globe,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Contact {
  id: string
  nom: string
  entreprise: string | null
  adresse: string | null
  email: string | null
  telephone: string | null
  vat_number: string | null
  devise: string
  conditions_paiement: number
  offshore: boolean
  actif: boolean
  created_at?: string
  updated_at?: string
}

const DEVISES = ["MUR", "EUR", "USD", "GBP"] as const

export default function ClientContactsPage() {
  const { societeId } = useSocieteActive()
  const [items, setItems] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [includeInactifs, setIncludeInactifs] = useState(false)
  const [search, setSearch] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [fNom, setFNom] = useState("")
  const [fEntreprise, setFEntreprise] = useState("")
  const [fAdresse, setFAdresse] = useState("")
  const [fEmail, setFEmail] = useState("")
  const [fTel, setFTel] = useState("")
  const [fVat, setFVat] = useState("")
  const [fDevise, setFDevise] = useState("MUR")
  const [fCondPaie, setFCondPaie] = useState("30")
  const [fOffshore, setFOffshore] = useState(false)
  const [fActif, setFActif] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [legacyCount, setLegacyCount] = useState(0)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const url = `/api/client/factures-contacts?societe_id=${societeId}${
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

  useEffect(() => {
    if (loading || items.length > 0) {
      setLegacyCount(0)
      return
    }
    try {
      const raw = localStorage.getItem("lexora_invoice_clients")
      if (!raw) return
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) setLegacyCount(arr.length)
    } catch {
      /* ignore */
    }
  }, [items, loading])

  function openNew() {
    setEditing(null)
    setFNom("")
    setFEntreprise("")
    setFAdresse("")
    setFEmail("")
    setFTel("")
    setFVat("")
    setFDevise("MUR")
    setFCondPaie("30")
    setFOffshore(false)
    setFActif(true)
    setDialogOpen(true)
  }

  function openEdit(c: Contact) {
    setEditing(c)
    setFNom(c.nom)
    setFEntreprise(c.entreprise || "")
    setFAdresse(c.adresse || "")
    setFEmail(c.email || "")
    setFTel(c.telephone || "")
    setFVat(c.vat_number || "")
    setFDevise(c.devise)
    setFCondPaie(String(c.conditions_paiement))
    setFOffshore(c.offshore)
    setFActif(c.actif)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!societeId) return
    const nom = fNom.trim()
    if (!nom) {
      showToast("Nom requis", "error")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        nom,
        entreprise: fEntreprise.trim() || null,
        adresse: fAdresse.trim() || null,
        email: fEmail.trim() || null,
        telephone: fTel.trim() || null,
        vat_number: fVat.trim() || null,
        devise: fDevise,
        conditions_paiement: Number(fCondPaie) || 30,
        offshore: fOffshore,
        actif: fActif,
      }
      const url = editing
        ? `/api/client/factures-contacts/${editing.id}`
        : `/api/client/factures-contacts`
      const method = editing ? "PATCH" : "POST"
      const body = editing ? payload : { ...payload, societe_id: societeId }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erreur")
      showToast(editing ? "Contact modifié" : "Contact ajouté")
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(c: Contact) {
    if (!confirm(`Supprimer "${c.nom}" du carnet de contacts ?`)) return
    try {
      const res = await fetch(`/api/client/factures-contacts/${c.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.can_archive) {
          if (
            confirm(
              `${data.error}\n\nVoulez-vous l'archiver à la place (actif = false) ?`,
            )
          ) {
            const r2 = await fetch(`/api/client/factures-contacts/${c.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...c, actif: false }),
            })
            const d2 = await r2.json()
            if (!r2.ok) throw new Error(d2?.error || "Erreur")
            showToast("Contact archivé")
            await load()
          }
          return
        }
        throw new Error(data?.error || "Erreur")
      }
      showToast("Contact supprimé")
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  async function importLegacy() {
    if (!societeId) return
    try {
      const raw = localStorage.getItem("lexora_invoice_clients")
      if (!raw) return
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr) || arr.length === 0) return
      const itemsToImport = arr.map((it: any) => ({
        nom: String(it.nom || it.entreprise || "Contact"),
        entreprise: it.entreprise ? String(it.entreprise) : null,
        adresse: it.adresse ? String(it.adresse) : null,
        email: it.email ? String(it.email) : null,
        telephone: it.telephone ? String(it.telephone) : null,
        vat_number: it.vat_number ? String(it.vat_number) : null,
        devise: String(it.devise || "MUR"),
        conditions_paiement: Number(it.conditions_paiement) || 30,
        offshore: it.offshore === true,
        actif: true,
      }))
      const res = await fetch(`/api/client/factures-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, items: itemsToImport }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Erreur")
      showToast(`Importé : ${data?.inserted} contact(s)`)
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
        i.nom.toLowerCase().includes(q) ||
        (i.entreprise || "").toLowerCase().includes(q) ||
        (i.email || "").toLowerCase().includes(q),
    )
  }, [items, search])

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
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-sky-600 to-blue-600 p-3 text-white shadow-md">
                <Users className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-sky-900">Contacts clients</h1>
                <p className="text-sm text-sky-800/80 mt-0.5">
                  Carnet d'adresses réutilisable dans vos factures
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Button
                onClick={openNew}
                disabled={!societeId}
                className="bg-sky-600 hover:bg-sky-700 text-white shadow-md"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Nouveau contact
              </Button>
            </div>
          </div>
        </div>

        {legacyCount > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <strong>{legacyCount} contact(s) trouvé(s) en local storage</strong> —
                votre carnet n'était pas synchronisé avec Supabase.
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

        <Card>
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher nom, entreprise, email..."
                className="pl-8 h-9"
              />
            </div>
            <Label className="flex items-center gap-2 cursor-pointer text-sm">
              <Switch checked={includeInactifs} onCheckedChange={setIncludeInactifs} />
              Inclure inactifs
            </Label>
          </CardContent>
        </Card>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              Société non disponible.
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              <Users className="h-10 w-10 mx-auto mb-2 text-gray-400" />
              {items.length === 0
                ? "Aucun contact. Créez vos clients récurrents pour gagner du temps à la facturation."
                : "Aucun résultat pour ce filtre."}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom / Entreprise</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>VAT</TableHead>
                    <TableHead className="text-right">Délai paiement</TableHead>
                    <TableHead>Devise</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} className={!c.actif ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="font-medium">{c.nom}</div>
                        {c.entreprise && (
                          <div className="text-xs text-muted-foreground">{c.entreprise}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {c.email}
                          </div>
                        )}
                        {c.telephone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {c.telephone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.vat_number || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">{c.conditions_paiement} j</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.devise}</Badge>
                        {c.offshore && (
                          <Badge className="ml-1 text-[10px] bg-blue-100 text-blue-700 border-blue-300">
                            <Globe className="h-3 w-3 mr-0.5" />
                            Offshore
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.actif ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                            Actif
                          </Badge>
                        ) : (
                          <Badge variant="outline">Archivé</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(c)}
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

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nom *</Label>
                  <Input value={fNom} onChange={(e) => setFNom(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-1">
                  <Label>Entreprise</Label>
                  <Input value={fEntreprise} onChange={(e) => setFEntreprise(e.target.value)} placeholder="ACME Ltd" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Adresse</Label>
                <Textarea
                  value={fAdresse}
                  onChange={(e) => setFAdresse(e.target.value)}
                  rows={2}
                  placeholder="Rue, ville, code postal, pays"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="bob@acme.com" />
                </div>
                <div className="space-y-1">
                  <Label>Téléphone</Label>
                  <Input value={fTel} onChange={(e) => setFTel(e.target.value)} placeholder="+230 5..." />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>VAT number</Label>
                  <Input value={fVat} onChange={(e) => setFVat(e.target.value)} placeholder="VAT-XXX" />
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
                <div className="space-y-1">
                  <Label>Délai paiement (j)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={fCondPaie}
                    onChange={(e) => setFCondPaie(e.target.value)}
                  />
                </div>
              </div>
              <Label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={fOffshore} onCheckedChange={setFOffshore} />
                Client offshore (TVA 0%)
              </Label>
              {editing && (
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={fActif} onCheckedChange={setFActif} />
                  Contact actif
                </Label>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={submitting || !fNom.trim()}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Enregistrer" : "Ajouter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientPageShell>
  )
}
