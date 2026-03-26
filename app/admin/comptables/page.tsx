"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Plus, Search, Mail, Phone, Users, Eye, UserPlus, Loader2, Calendar,
} from "lucide-react"

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

export default function ComptablesPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedComptable, setSelectedComptable] = useState<UserProfile | null>(null)
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState<"comptable" | "comptable_dedie">("comptable")

  // Assign form
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.users) setAllUsers(data.users)
    } catch {
      console.error("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const comptables = allUsers.filter((u) => u.role === "comptable" || u.role === "comptable_dedie")
  const clients = allUsers.filter((u) => u.role === "client")

  const filtered = comptables.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  )

  const getClientCount = (comptableId: string) =>
    clients.filter((c) => c.comptable_id === comptableId).length

  const getAssignedClients = (comptableId: string) =>
    clients.filter((c) => c.comptable_id === comptableId)

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword(""); setFormRole("comptable"); setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    if (!formName || !formEmail || !formPassword) {
      setError("Veuillez remplir tous les champs obligatoires."); return
    }
    if (formPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères."); return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formEmail, password: formPassword, full_name: formName, role: formRole, phone: formPhone || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur"); return }
      setSuccess(`Comptable ${formName} créé avec succès !`)
      resetForm(); setDialogOpen(false); fetchUsers()
      setTimeout(() => setSuccess(null), 5000)
    } catch { setError("Erreur de connexion") } finally { setCreating(false) }
  }

  const openProfile = (comptable: UserProfile) => {
    setSelectedComptable(comptable)
    setProfileDialogOpen(true)
  }

  const openAssign = (comptable: UserProfile) => {
    setSelectedComptable(comptable)
    // Pre-select already assigned clients
    const assigned = new Set(clients.filter((c) => c.comptable_id === comptable.id).map((c) => c.id))
    setSelectedClientIds(assigned)
    setAssignDialogOpen(true)
  }

  const toggleClient = (clientId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  const handleAssign = async () => {
    if (!selectedComptable) return
    setAssigning(true)
    try {
      // For each client, set or unset comptable_id
      const promises = clients.map((client) => {
        const shouldBeAssigned = selectedClientIds.has(client.id)
        const isAssigned = client.comptable_id === selectedComptable.id

        if (shouldBeAssigned && !isAssigned) {
          return fetch("/api/admin/users/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: client.id, comptable_id: selectedComptable.id }),
          })
        } else if (!shouldBeAssigned && isAssigned) {
          return fetch("/api/admin/users/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: client.id, comptable_id: null }),
          })
        }
        return null
      }).filter(Boolean)

      await Promise.all(promises)
      setSuccess(`Clients assignés à ${selectedComptable.full_name} avec succès !`)
      setAssignDialogOpen(false)
      fetchUsers()
      setTimeout(() => setSuccess(null), 5000)
    } catch {
      setError("Erreur lors de l'assignation")
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Comptables</h1>
          <p className="text-muted-foreground mt-1">Gestion de l&apos;équipe comptable Lexora</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un comptable
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau comptable</DialogTitle>
              <DialogDescription>Un compte sera créé automatiquement avec le rôle comptable.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom complet *</Label>
                <Input placeholder="Ex: Marie Dupont" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" placeholder="Ex: marie@lexora.mu" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe *</Label>
                <Input type="password" placeholder="Minimum 6 caractères" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input placeholder="Ex: +230 5234 5678" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type de comptable *</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as "comptable" | "comptable_dedie")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comptable">Comptable (accès à tous les clients)</SelectItem>
                    <SelectItem value="comptable_dedie">Comptable dédié (clients assignés uniquement)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Annuler</Button>
              <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreate} disabled={creating}>
                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer le comptable"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {success && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher par nom ou email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((comptable) => (
            <Card key={comptable.id} className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: comptable.is_active !== false ? "#C9A84C" : "#9ca3af" }} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full text-white font-semibold text-sm" style={{ backgroundColor: "#1E2A4A" }}>
                      {comptable.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{comptable.full_name}</CardTitle>
                      <CardDescription className="mt-0.5">{comptable.role === "comptable_dedie" ? "Comptable dédié" : "Comptable"}</CardDescription>
                    </div>
                  </div>
                  <Badge className={comptable.is_active !== false ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                    {comptable.is_active !== false ? "Actif" : "Inactif"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /><span>{comptable.email}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span>{comptable.phone || "—"}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /><span>{getClientCount(comptable.id)} client(s) assigné(s)</span></div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openProfile(comptable)}>
                    <Eye className="mr-1 h-3.5 w-3.5" />Voir profil
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" style={{ borderColor: "#C9A84C", color: "#C9A84C" }} onClick={() => openAssign(comptable)}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" />Assigner clients
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">Aucun comptable trouvé.</div>
      )}

      {/* Profile Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profil du comptable</DialogTitle>
          </DialogHeader>
          {selectedComptable && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full text-white font-bold text-xl" style={{ backgroundColor: "#1E2A4A" }}>
                  {selectedComptable.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedComptable.full_name}</h3>
                  <Badge className="bg-emerald-100 text-emerald-700">Comptable</Badge>
                </div>
              </div>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{selectedComptable.email}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Téléphone</p><p className="font-medium">{selectedComptable.phone || "Non renseigné"}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Clients assignés</p><p className="font-medium">{getClientCount(selectedComptable.id)} client(s)</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Créé le</p><p className="font-medium">{new Date(selectedComptable.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p></div>
                </div>
              </div>
              {getAssignedClients(selectedComptable.id).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Clients assignés :</p>
                  <div className="space-y-1">
                    {getAssignedClients(selectedComptable.id).map((client) => (
                      <div key={client.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{client.full_name}</span>
                        <span className="text-muted-foreground">— {client.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Clients Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assigner des clients</DialogTitle>
            <DialogDescription>
              {selectedComptable && `Sélectionnez les clients à assigner à ${selectedComptable.full_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-auto space-y-2">
            {clients.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Aucun client enregistré sur la plateforme.</p>
            ) : (
              clients.map((client) => {
                const isSelected = selectedClientIds.has(client.id)
                const assignedTo = client.comptable_id && client.comptable_id !== selectedComptable?.id
                  ? allUsers.find((u) => u.id === client.comptable_id)?.full_name
                  : null

                return (
                  <div
                    key={client.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? "border-amber-300 bg-amber-50" : "border-border hover:bg-muted/50"}`}
                    onClick={() => toggleClient(client.id)}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleClient(client.id)} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{client.full_name}</p>
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    </div>
                    {assignedTo && (
                      <Badge variant="outline" className="text-xs">Assigné à {assignedTo}</Badge>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Annuler</Button>
            <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleAssign} disabled={assigning || clients.length === 0}>
              {assigning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</> : `Enregistrer (${selectedClientIds.size} client${selectedClientIds.size !== 1 ? "s" : ""})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
