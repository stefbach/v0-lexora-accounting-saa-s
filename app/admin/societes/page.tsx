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

  // --------------- derived data ---------------
  const comptables = users.filter((u) => u.role === "comptable")
  const clients = users.filter((u) => u.role === "client")

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

      if (!resSoc.ok) throw new Error(dataSoc.error || "Erreur lors du chargement des sociétés")
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

  // --------------- add société handler ---------------
  const handleAdd = async () => {
    if (!addNom.trim()) {
      setError("Le nom de la société est requis.")
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
      if (!res.ok) throw new Error(data.error || "Erreur lors de la création")

      const newSociete = data.societe

      // Create dossiers for selected clients
      if (addClientIds.length > 0 && newSociete?.id) {
        const comptableForDossier = addComptableId || null
        if (!comptableForDossier) {
          setSuccess("Société créée. Attention : aucun comptable assigné, les dossiers clients n'ont pas été créés.")
        } else {
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
              `Société créée. ${addClientIds.length - failures.length}/${addClientIds.length} client(s) lié(s) avec succès.`
            )
          } else {
            setSuccess("Société créée et client(s) lié(s) avec succès.")
          }
        }
      } else {
        setSuccess("Société créée avec succès.")
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
      setError("Veuillez sélectionner un client.")
      return
    }
    const comptableId = linkSociete.comptable_id
    if (!comptableId) {
      setError("Cette société n'a pas de comptable assigné. Veuillez d'abord en assigner un.")
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
          comptable_id: comptableId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la liaison")
      setSuccess("Client lié à la société avec succès.")
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Sociétés
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion des sociétés enregistrées sur la plateforme
          </p>
        </div>

        {/* ---- Add société dialog ---- */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une société
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle société</DialogTitle>
              <DialogDescription>
                Renseignez les informations de la société à ajouter.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Nom */}
              <div className="space-y-2">
                <Label htmlFor="add-nom">
                  Nom de la société <span className="text-red-500">*</span>
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

              {/* N° TVA MRA */}
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
                    <SelectValue placeholder="Sélectionner le statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assujetti">Assujetti</SelectItem>
                    <SelectItem value="non_assujetti">Non assujetti</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Comptable */}
              <div className="space-y-2">
                <Label>Comptable assigné</Label>
                <Select value={addComptableId} onValueChange={setAddComptableId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner un comptable" />
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

              {/* Clients à lier */}
              <div className="space-y-2">
                <Label>Client(s) à lier</Label>
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
                style={{ backgroundColor: "#C9A84C" }}
                onClick={handleAdd}
                disabled={addSubmitting}
              >
                {addSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Créer la société
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
              Sélectionnez un client à lier à la société{" "}
              <strong>{linkSociete?.nom}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={linkClientId} onValueChange={setLinkClientId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner un client" />
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
              style={{ backgroundColor: "#C9A84C" }}
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

      {/* Table Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" style={{ color: "#C9A84C" }} />
              <CardTitle style={{ color: "#1E2A4A" }}>
                Liste des sociétés
              </CardTitle>
            </div>
            <CardDescription>
              {loading
                ? "Chargement..."
                : `${filtered.length} société(s) trouvée(s)`}
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
                style={{ color: "#1E2A4A" }}
              />
              <span className="ml-3 text-muted-foreground">
                Chargement des sociétés...
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
                  <TableHead>Comptable assigné</TableHead>
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
                        {s.brn || "—"}
                      </TableCell>
                      <TableCell>{s.numero_tva_mra || "—"}</TableCell>
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
                            Non assigné
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
                                  borderColor: "#C9A84C",
                                  color: "#1E2A4A",
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
                            <UserPlus className="h-4 w-4" style={{ color: "#C9A84C" }} />
                          </Button>
                          {/* Edit */}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Modifier"
                            onClick={() =>
                              alert(
                                `Modification de "${s.nom}" — fonctionnalité à venir.`
                              )
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            title="Supprimer"
                            onClick={() =>
                              alert(
                                `Suppression de "${s.nom}" — fonctionnalité à venir.`
                              )
                            }
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
                      Aucune société trouvée.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
