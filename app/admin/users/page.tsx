"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Search,
  UserCog,
  Users,
  Loader2,
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

export default function UsersPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("")
  const [formComptable, setFormComptable] = useState("")

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      if (data.users) {
        setUsers(data.users)
      }
    } catch {
      console.error("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const comptables = users.filter((u) => u.role === "comptable")
  const clients = users.filter((u) => u.role === "client_admin" || u.role === "client_user")

  const filteredComptables = comptables.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const filteredClients = clients.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const resetForm = () => {
    setFormName("")
    setFormEmail("")
    setFormPhone("")
    setFormPassword("")
    setFormRole("")
    setFormComptable("")
    setError(null)
    setSuccess(null)
  }

  const handleCreate = async () => {
    setError(null)
    setSuccess(null)

    if (!formName || !formEmail || !formPassword || !formRole) {
      setError("Veuillez remplir tous les champs obligatoires.")
      return
    }

    if (formPassword.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.")
      return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          full_name: formName,
          role: formRole,
          phone: formPhone || null,
          comptable_id: formComptable || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erreur lors de la création")
        return
      }

      setSuccess(`Utilisateur ${formName} créé avec succès !`)
      resetForm()
      setDialogOpen(false)
      fetchUsers()
    } catch {
      setError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  const getComptableName = (comptableId: string | null) => {
    if (!comptableId) return "—"
    const comptable = users.find((u) => u.id === comptableId)
    return comptable?.full_name || "—"
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Utilisateurs
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion des comptables et clients de la plateforme
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel utilisateur</DialogTitle>
              <DialogDescription>
                Renseignez les informations du nouvel utilisateur. Un compte Supabase sera créé automatiquement.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom complet *</Label>
                <Input
                  placeholder="Ex: Marie Dupont"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="Ex: marie@lexora.mu"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe *</Label>
                <Input
                  type="password"
                  placeholder="Minimum 6 caractères"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  placeholder="Ex: +230 5234 5678"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Rôle *</Label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comptable">Comptable</SelectItem>
                    <SelectItem value="client_admin">Client Admin</SelectItem>
                    <SelectItem value="client_user">Client Utilisateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formRole === "client_admin" || formRole === "client_user") && comptables.length > 0 && (
                <div className="space-y-2">
                  <Label>Comptable assigné</Label>
                  <Select value={formComptable} onValueChange={setFormComptable}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un comptable" />
                    </SelectTrigger>
                    <SelectContent>
                      {comptables.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>
                Annuler
              </Button>
              <Button
                style={{ backgroundColor: "#C9A84C" }}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  "Créer l'utilisateur"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom ou email..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="comptables">
          <TabsList>
            <TabsTrigger value="comptables" className="gap-1.5">
              <UserCog className="h-4 w-4" />
              Comptables ({filteredComptables.length})
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-1.5">
              <Users className="h-4 w-4" />
              Clients ({filteredClients.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comptables">
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>Comptables</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredComptables.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.phone || "—"}</TableCell>
                        <TableCell>
                          <Badge className="border-transparent" style={{ backgroundColor: "#1E2A4A15", color: "#1E2A4A" }}>
                            Comptable
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={u.is_active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>
                            {u.is_active !== false ? "Actif" : "Inactif"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredComptables.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Aucun comptable trouvé.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clients">
            <Card>
              <CardHeader>
                <CardTitle style={{ color: "#1E2A4A" }}>Clients</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Comptable assigné</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.phone || "—"}</TableCell>
                        <TableCell>{getComptableName(u.comptable_id)}</TableCell>
                        <TableCell>
                          <Badge className={u.is_active !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>
                            {u.is_active !== false ? "Actif" : "Inactif"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredClients.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Aucun client trouvé.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
