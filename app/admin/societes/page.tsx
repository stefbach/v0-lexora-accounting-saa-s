"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Building2,
  Loader2,
  UserPlus,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Profile {
  id: string
  full_name: string
  email: string
  role?: string
}

interface Societe {
  id: string
  nom: string
  brn: string | null
  numero_tva_mra: string | null
  statut_tva: boolean
  comptable_id: string | null
  comptable: Profile | null
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  comptable_id: string
  client: Profile | null
  societe: { id: string; nom: string } | null
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SocietesPage() {
  // --------------- data state ---------------
  const [societes, setSocietes] = useState<Societe[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])

  // --------------- ui state ---------------
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // --------------- add dialog state ---------------
  const [addOpen, setAddOpen] = useState(false)
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [addNom, setAddNom] = useState("")
  const [addBrn, setAddBrn] = useState("")
  const [addTva, setAddTva] = useState("")
  const [addStatutTva, setAddStatutTva] = useState<string>("")
  const [addComptableId, setAddComptableId] = useState<string>("")
  const [addClientIds, setAddClientIds] = useState<string[]>([])

  // --------------- link-client dialog state ---------------
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkSociete, setLinkSociete] = useState<Societe | null>(null)
  const [linkClientId, setLinkClientId] = useState<string>("")
  const [linkSubmitting, setLinkSubmitting] = useState(false)

  // --------------- edit dialog state ---------------
  const [editOpen, setEditOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editSociete, setEditSociete] = useState<Societe | null>(null)
  const [editNom, setEditNom] = useState("")
  const [editBrn, setEditBrn] = useState("")
  const [editTva, setEditTva] = useState("")
  const [editStatutTva, setEditStatutTva] = useState<string>("")
  const [editComptableId, setEditComptableId] = useState<string>("")

  // --------------- delete dialog state ---------------
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [deleteSociete, setDeleteSociete] = useState<Societe | null>(null)

  // --------------- derived data ---------------
  const comptables = users.filter((u) => u.role === "comptable" || u.role === "comptable_dedie")
  const clients = users.filter((u) => u.role === "client_admin" || u.role === "client_user" || u.role === "client")

  const clientsForSociete = (societeId: string): Profile[] => {
    const clientIds = dossiers
      .filter((d) => d.societe_id === societeId && d.client)
      .map((d) => d.client_id)
    return users.filter((u) => clientIds.includes(u.id))
  }

  const filtered = societes.filter((s) => {
    const q = search.toLowerCase()
    return (
      s.nom.toLowerCase().includes(q) ||
      (s.brn ?? "").toLowerCase().includes(q)
    )
  })

  // --------------- fetch helpers ---------------
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [resSoc, resUsr, resDos] = await Promise.all([
        fetch("/api/admin/societes"),
        fetch("/api/admin/users"),
        fetch("/api/admin/dossiers"),
      ])

      const [dataSoc, dataUsr, dataDos] = await Promise.all([
        resSoc.json(),
        resUsr.json(),
        resDos.json(),
      ])

      if (!resSoc.ok) throw new Error(dataSoc.error || "Erreur lors du chargement des societes")
      if (!resUsr.ok) throw new Error(dataUsr.error || "Erreur lors du chargement des utilisateurs")
      if (!resDos.ok) throw new Error(dataDos.error || "Erreur lors du chargement des dossiers")

      setSocietes(dataSoc.societes ?? [])
      setUsers(dataUsr.users ?? [])
      setDossiers(dataDos.dossiers ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // --------------- auto-dismiss messages ---------------
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000)
      return () => clearTimeout(t)
    }
  }, [success])

  useEffect(() => {
    if (error && !loading) {
      const t = setTimeout(() => setError(null), 6000)
      return () => clearTimeout(t)
    }
  }, [error, loading])

  // --------------- add societe handler ---------------
  const handleAdd = async () => {
    if (!addNom.trim()) {
      setError("Le nom de la societe est requis.")
      return
    }
    setAddSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/societes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: addNom.trim(),
          brn: addBrn.trim() || null,
          numero_tva_mra: addTva.trim() || null,
          statut_tva: addStatutTva === "assujetti",
          comptable_id: addComptableId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la creation")

      const newSociete = data.societe

      // Create dossiers for selected clients
      if (addClientIds.length > 0 && newSociete?.id) {
        const comptableForDossier = addComptableId || null
        const dossierResults = await Promise.allSettled(
          addClientIds.map((clientId) =>
            fetch("/api/admin/dossiers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: clientId,
                societe_id: newSociete.id,
                comptable_id: comptableForDossier,
              }),
            })
          )
        )
        const failures = dossierResults.filter((r) => r.status === "rejected")
        if (failures.length > 0) {
          setSuccess(
            `Societe creee. ${addClientIds.length - failures.length}/${addClientIds.length} client(s) lie(s) avec succes.`
          )
        } else {
          setSuccess("Societe creee et client(s) lie(s) avec succes.")
        }
      } else {
        setSuccess("Societe creee avec succes.")
      }

      // Reset form
      setAddNom("")
      setAddBrn("")
      setAddTva("")
      setAddStatutTva("")
      setAddComptableId("")
      setAddClientIds([])
      setAddOpen(false)
      await fetchAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setAddSubmitting(false)
    }
  }

  // --------------- link client handler ---------------
  const handleLinkClient = async () => {
    if (!linkSociete || !linkClientId) {
      setError("Veuillez selectionner un client.")
      return
    }
    setLinkSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: linkClientId,
          societe_id: linkSociete.id,
          comptable_id: linkSociete.comptable_id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la liaison")
      setSuccess("Client lie a la societe avec succes.")
      setLinkClientId("")
      setLinkSociete(null)
      setLinkOpen(false)
      await fetchAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setLinkSubmitting(false)
    }
  }

  // --------------- edit societe handler ---------------
  const openEditDialog = (s: Societe) => {
    setEditSociete(s)
    setEditNom(s.nom)
    setEditBrn(s.brn ?? "")
    setEditTva(s.numero_tva_mra ?? "")
    setEditStatutTva(s.statut_tva ? "assujetti" : "non_assujetti")
    setEditComptableId(s.comptable_id ?? "")
    setEditOpen(true)
  }

  const handleEdit = async () => {
    if (!editSociete) return
    if (!editNom.trim()) {
      setError("Le nom de la societe est requis.")
      return
    }
    setEditSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/societes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editSociete.id,
          nom: editNom.trim(),
          brn: editBrn.trim() || null,
          numero_tva_mra: editTva.trim() || null,
          statut_tva: editStatutTva === "assujetti",
          comptable_id: editComptableId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la modification")
      setSuccess("Societe modifiee avec succes.")
      setEditOpen(false)
      setEditSociete(null)
      await fetchAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setEditSubmitting(false)
    }
  }

  // --------------- delete societe handler ---------------
  const openDeleteDialog = (s: Societe) => {
    setDeleteSociete(s)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteSociete) return
    setDeleteSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/societes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteSociete.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression")
      setSuccess("Societe et dossiers associes supprimes avec succes.")
      setDeleteOpen(false)
      setDeleteSociete(null)
      await fetchAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue")
    } finally {
      setDeleteSubmitting(false)
    }
  }

  // --------------- toggle client checkbox ---------------
  const toggleClient = (clientId: string) => {
    setAddClientIds((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    )
  }

  // --------------- render ---------------
  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
            Societes
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion des societes enregistrees sur la plateforme
          </p>
        </div>

        {/* ---- Add societe dialog ---- */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#0B0F2E" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une societe
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle societe</DialogTitle>
              <DialogDescription>
                Renseignez les informations de la societe a ajouter.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Nom */}
              <div className="space-y-2">
                <Label htmlFor="add-nom">
                  Nom de la societe <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="add-nom"
                  placeholder="Ex: TIBOK Ltd"
                  value={addNom}
                  onChange={(e) => setAddNom(e.target.value)}
                />
              </div>

              {/* BRN */}
              <div className="space-y-2">
                <Label htmlFor="add-brn">BRN</Label>
                <Input
                  id="add-brn"
                  placeholder="Ex: C12345678"
                  value={addBrn}
                  onChange={(e) => setAddBrn(e.target.value)}
                />
              </div>

              {/* N TVA MRA */}
              <div className="space-y-2">
                <Label htmlFor="add-tva">N° TVA MRA</Label>
                <Input
                  id="add-tva"
                  placeholder="Ex: VAT-20230001"
                  value={addTva}
                  onChange={(e) => setAddTva(e.target.value)}
                />
              </div>

              {/* Statut TVA */}
              <div className="space-y-2">
                <Label>Statut TVA</Label>
                <Select value={addStatutTva} onValueChange={setAddStatutTva}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selectionner le statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assujetti">Assujetti</SelectItem>
                    <SelectItem value="non_assujetti">Non assujetti</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Comptable */}
              <div className="space-y-2">
                <Label>Comptable assigne</Label>
                <Select value={addComptableId} onValueChange={setAddComptableId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selectionner un comptable" />
                  </SelectTrigger>
                  <SelectContent>
                    {comptables.length === 0 && (
                      <SelectItem value="_none" disabled>
                        Aucun comptable disponible
                      </SelectItem>
                    )}
                    {comptables.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} ({c.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clients a lier */}
              <div className="space-y-2">
                <Label>Client(s) a lier</Label>
                {clients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun client disponible.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-md border p-3 space-y-2">
                    {clients.map((client) => (
                      <div key={client.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`client-${client.id}`}
                          checked={addClientIds.includes(client.id)}
                          onCheckedChange={() => toggleClient(client.id)}
                        />
                        <label
                          htmlFor={`client-${client.id}`}
                          className="text-sm cursor-pointer"
                        >
                          {client.full_name} ({client.email})
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Annuler
              </Button>
              <Button
                style={{ backgroundColor: "#D4AF37" }}
                onClick={handleAdd}
                disabled={addSubmitting}
              >
                {addSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Creer la societe
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Feedback messages */}
      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}
      {error && !loading && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Link-client dialog */}
      <Dialog
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open)
          if (!open) {
            setLinkClientId("")
            setLinkSociete(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lier un client</DialogTitle>
            <DialogDescription>
              Selectionnez un client a lier a la societe{" "}
              <strong>{linkSociete?.nom}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={linkClientId} onValueChange={setLinkClientId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.length === 0 && (
                    <SelectItem value="_none" disabled>
                      Aucun client disponible
                    </SelectItem>
                  )}
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} ({c.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Annuler
            </Button>
            <Button
              style={{ backgroundColor: "#D4AF37" }}
              onClick={handleLinkClient}
              disabled={linkSubmitting || !linkClientId}
            >
              {linkSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Lier le client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit societe dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) {
            setEditSociete(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: "#0B0F2E" }}>
              Modifier la societe
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations de la societe{" "}
              <strong>{editSociete?.nom}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Nom */}
            <div className="space-y-2">
              <Label htmlFor="edit-nom">
                Nom de la societe <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-nom"
                placeholder="Ex: TIBOK Ltd"
                value={editNom}
                onChange={(e) => setEditNom(e.target.value)}
              />
            </div>

            {/* BRN */}
            <div className="space-y-2">
              <Label htmlFor="edit-brn">BRN</Label>
              <Input
                id="edit-brn"
                placeholder="Ex: C12345678"
                value={editBrn}
                onChange={(e) => setEditBrn(e.target.value)}
              />
            </div>

            {/* N TVA MRA */}
            <div className="space-y-2">
              <Label htmlFor="edit-tva">N° TVA MRA</Label>
              <Input
                id="edit-tva"
                placeholder="Ex: VAT-20230001"
                value={editTva}
                onChange={(e) => setEditTva(e.target.value)}
              />
            </div>

            {/* Statut TVA */}
            <div className="space-y-2">
              <Label>Statut TVA</Label>
              <Select value={editStatutTva} onValueChange={setEditStatutTva}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selectionner le statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assujetti">Assujetti</SelectItem>
                  <SelectItem value="non_assujetti">Non assujetti</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Comptable */}
            <div className="space-y-2">
              <Label>Comptable assigne</Label>
              <Select value={editComptableId} onValueChange={setEditComptableId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selectionner un comptable" />
                </SelectTrigger>
                <SelectContent>
                  {comptables.length === 0 && (
                    <SelectItem value="_none" disabled>
                      Aucun comptable disponible
                    </SelectItem>
                  )}
                  {comptables.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} ({c.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Annuler
            </Button>
            <Button
              style={{ backgroundColor: "#D4AF37" }}
              onClick={handleEdit}
              disabled={editSubmitting}
            >
              {editSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Enregistrer les modifications
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteSubmitting) {
            setDeleteOpen(open)
            if (!open) setDeleteSociete(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Confirmer la suppression
            </DialogTitle>
            <DialogDescription className="pt-2">
              Etes-vous sur de vouloir supprimer{" "}
              <strong>{deleteSociete?.nom}</strong> ? Cette action supprimera
              egalement tous les dossiers lies.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteSubmitting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSubmitting}
            >
              {deleteSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" style={{ color: "#D4AF37" }} />
              <CardTitle style={{ color: "#0B0F2E" }}>
                Liste des societes
              </CardTitle>
            </div>
            <CardDescription>
              {loading
                ? "Chargement..."
                : `${filtered.length} societe(s) trouvee(s)`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou BRN..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2
                className="h-8 w-8 animate-spin"
                style={{ color: "#0B0F2E" }}
              />
              <span className="ml-3 text-muted-foreground">
                Chargement des societes...
              </span>
            </div>
          )}

          {/* Table */}
          {!loading && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>BRN</TableHead>
                  <TableHead>N° TVA MRA</TableHead>
                  <TableHead>Statut TVA</TableHead>
                  <TableHead>Comptable assigne</TableHead>
                  <TableHead>Client(s)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const linkedClients = clientsForSociete(s.id)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.nom}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {s.brn || "\u2014"}
                      </TableCell>
                      <TableCell>{s.numero_tva_mra || "\u2014"}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            s.statut_tva
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }
                        >
                          {s.statut_tva ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.comptable ? s.comptable.full_name : (
                          <span className="text-muted-foreground italic">
                            Non assigne
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {linkedClients.length === 0 ? (
                          <span className="text-muted-foreground italic">
                            Aucun
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {linkedClients.map((c) => (
                              <Badge
                                key={c.id}
                                variant="outline"
                                style={{
                                  borderColor: "#D4AF37",
                                  color: "#0B0F2E",
                                }}
                              >
                                {c.full_name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Link client */}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Lier un client"
                            onClick={() => {
                              setLinkSociete(s)
                              setLinkClientId("")
                              setLinkOpen(true)
                            }}
                          >
                            <UserPlus className="h-4 w-4" style={{ color: "#D4AF37" }} />
                          </Button>
                          {/* Edit */}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Modifier"
                            onClick={() => openEditDialog(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            title="Supprimer"
                            onClick={() => openDeleteDialog(s)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Aucune societe trouvee.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </ClientPageShell>
  )
}
