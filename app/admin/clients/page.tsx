"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Plus, Search, Loader2, Link as LinkIcon } from "lucide-react"

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  comptable_id: string | null
  is_active: boolean
  created_at: string
}

interface Societe {
  id: string
  nom: string
  comptable_id: string | null
  comptable: { id: string; full_name: string; email: string } | null
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  comptable_id: string
  client: { id: string; full_name: string; email: string } | null
  comptable: { id: string; full_name: string; email: string } | null
  societe: { id: string; nom: string } | null
}

export default function ClientsPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkClientId, setLinkClientId] = useState<string | null>(null)

  const [users, setUsers] = useState<UserProfile[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Create form state
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formSociete, setFormSociete] = useState("")

  // Link form state
  const [linkSociete, setLinkSociete] = useState("")
  const [linkError, setLinkError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, societesRes, dossiersRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/societes"),
        fetch("/api/admin/dossiers"),
      ])
      const [usersData, societesData, dossiersData] = await Promise.all([
        usersRes.json(),
        societesRes.json(),
        dossiersRes.json(),
      ])
      if (usersData.users) setUsers(usersData.users)
      if (societesData.societes) setSocietes(societesData.societes)
      if (dossiersData.dossiers) setDossiers(dossiersData.dossiers)
    } catch {
      console.error("Erreur lors du chargement des données")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-clear success message
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const clients = users.filter((u) => u.role === "client")

  const filtered = clients.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  // Get sociétés linked to a client via dossiers
  const getClientSocietes = (clientId: string): { nom: string }[] => {
    return dossiers
      .filter((d) => d.client_id === clientId && d.societe)
      .map((d) => ({ nom: d.societe!.nom }))
  }

  // Get comptable(s) for a client via dossiers
  const getClientComptable = (clientId: string): string => {
    const clientDossiers = dossiers.filter((d) => d.client_id === clientId && d.comptable)
    if (clientDossiers.length === 0) return "—"
    const uniqueComptables = Array.from(
      new Map(clientDossiers.map((d) => [d.comptable!.id, d.comptable!.full_name])).values()
    )
    return uniqueComptables.join(", ")
  }

  // Get the comptable_id from a selected société
  const getComptableIdFromSociete = (societeId: string): string | null => {
    const societe = societes.find((s) => s.id === societeId)
    return societe?.comptable_id || null
  }

  const resetForm = () => {
    setFormName("")
    setFormEmail("")
    setFormPhone("")
    setFormPassword("")
    setFormSociete("")
    setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    if (!formName || !formEmail || !formPassword) {
      setError("Veuillez remplir tous les champs obligatoires.")
      return
    }
    if (formPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.")
      return
    }

    setCreating(true)
    try {
      // Step 1: Create the user
      const comptableId = formSociete ? getComptableIdFromSociete(formSociete) : null
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          full_name: formName,
          role: "client",
          phone: formPhone || null,
          comptable_id: comptableId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Erreur lors de la création du client")
        return
      }

      const newUserId = data.user?.id

      // Step 2: If société selected, create a dossier to link them
      if (formSociete && newUserId && comptableId) {
        const dossierRes = await fetch("/api/admin/dossiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: newUserId,
            societe_id: formSociete,
            comptable_id: comptableId,
          }),
        })
        const dossierData = await dossierRes.json()
        if (!dossierRes.ok) {
          // User was created but dossier failed - still show partial success
          setSuccess(`Client ${formName} créé, mais la liaison à la société a échoué : ${dossierData.error}`)
          resetForm()
          setDialogOpen(false)
          fetchData()
          return
        }
      }

      setSuccess(`Client ${formName} créé avec succès !`)
      resetForm()
      setDialogOpen(false)
      fetchData()
    } catch {
      setError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  const handleLink = async () => {
    setLinkError(null)
    if (!linkSociete || !linkClientId) {
      setLinkError("Veuillez sélectionner une société.")
      return
    }

    const comptableId = getComptableIdFromSociete(linkSociete)
    if (!comptableId) {
      setLinkError("Cette société n'a pas de comptable assigné. Veuillez d'abord assigner un comptable à la société.")
      return
    }

    setLinking(true)
    try {
      const res = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: linkClientId,
          societe_id: linkSociete,
          comptable_id: comptableId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLinkError(data.error || "Erreur lors de la liaison")
        return
      }

      const clientName = users.find((u) => u.id === linkClientId)?.full_name || "Client"
      const societeName = societes.find((s) => s.id === linkSociete)?.nom || "Société"
      setSuccess(`${clientName} a été lié à ${societeName} avec succès !`)
      setLinkDialogOpen(false)
      setLinkClientId(null)
      setLinkSociete("")
      setLinkError(null)
      fetchData()
    } catch {
      setLinkError("Erreur de connexion au serveur")
    } finally {
      setLinking(false)
    }
  }

  const openLinkDialog = (clientId: string) => {
    setLinkClientId(clientId)
    setLinkSociete("")
    setLinkError(null)
    setLinkDialogOpen(true)
  }

  // Compute the selected société's comptable name for the create form
  const selectedSocieteComptable = formSociete
    ? societes.find((s) => s.id === formSociete)?.comptable?.full_name || null
    : null

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Clients</h1>
          <p className="text-muted-foreground mt-1">Gestion des clients de la plateforme</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau client</DialogTitle>
              <DialogDescription>Un compte sera créé automatiquement avec le rôle client.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom complet *</Label>
                <Input placeholder="Ex: Raj Doobur" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" placeholder="Ex: raj@tibok.mu" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe *</Label>
                <Input type="password" placeholder="Minimum 6 caractères" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input placeholder="Ex: +230 5678 9012" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Société</Label>
                <Select value={formSociete} onValueChange={setFormSociete}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une société (optionnel)" /></SelectTrigger>
                  <SelectContent>
                    {societes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedSocieteComptable && (
                <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                  Comptable assigné automatiquement : <strong>{selectedSocieteComptable}</strong>
                </div>
              )}
              {formSociete && !selectedSocieteComptable && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
                  Cette société n&apos;a pas de comptable assigné. Le dossier ne pourra pas être créé.
                </div>
              )}
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Annuler</Button>
              <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreate} disabled={creating}>
                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer le client"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher par nom ou email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle style={{ color: "#1E2A4A" }}>Clients ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Société(s)</TableHead>
                  <TableHead>Comptable</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date création</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const clientSocietes = getClientSocietes(u.id)
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone || "—"}</TableCell>
                      <TableCell>
                        {clientSocietes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {clientSocietes.map((s, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}
                              >
                                {s.nom}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getClientComptable(u.id)}</TableCell>
                      <TableCell>
                        <Badge className={u.is_active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>
                          {u.is_active !== false ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLinkDialog(u.id)}
                          style={{ borderColor: "#1E2A4A", color: "#1E2A4A" }}
                        >
                          <LinkIcon className="mr-1 h-3 w-3" />
                          Lier à une société
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Aucun client trouvé.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Link to société dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) { setLinkClientId(null); setLinkSociete(""); setLinkError(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lier à une société</DialogTitle>
            <DialogDescription>
              {linkClientId
                ? `Lier ${users.find((u) => u.id === linkClientId)?.full_name || "ce client"} à une société supplémentaire.`
                : "Sélectionnez une société."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Société *</Label>
              <Select value={linkSociete} onValueChange={setLinkSociete}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
                <SelectContent>
                  {societes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {linkSociete && (
              <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                Comptable : <strong>{societes.find((s) => s.id === linkSociete)?.comptable?.full_name || "Aucun comptable assigné"}</strong>
              </div>
            )}
            {linkError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{linkError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLinkDialogOpen(false); setLinkClientId(null); setLinkSociete(""); setLinkError(null) }}>
              Annuler
            </Button>
            <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleLink} disabled={linking}>
              {linking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Liaison...</> : "Lier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
