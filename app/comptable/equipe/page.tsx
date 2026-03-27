"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Search, Loader2, Mail, Phone, Users, Eye, UserPlus, Calendar } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

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

export default function ComptableEquipePage() {
  const [search, setSearch] = useState("")
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")

  // Profile dialog
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null)

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

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const teamMembers = allUsers.filter((u) => u.role === "comptable_dedie")
  const clients = allUsers.filter((u) => u.role === "client_admin" || u.role === "client_user")

  const filtered = teamMembers.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const getAssignedClientCount = (comptableId: string) =>
    clients.filter((c) => c.comptable_id === comptableId).length

  const getAssignedClients = (comptableId: string) =>
    clients.filter((c) => c.comptable_id === comptableId)

  const isComptableAdmin = profile?.role === "comptable"

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword(""); setError(null)
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
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          full_name: formName,
          role: "comptable_dedie",
          phone: formPhone || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur lors de la création"); return }

      setSuccess(`Comptable dédié ${formName} ajouté à l'équipe !`)
      resetForm(); setDialogOpen(false); fetchUsers()
    } catch {
      setError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  if (!isComptableAdmin) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Seul le comptable principal peut gérer l&apos;équipe.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Mon Équipe</h1>
          <p className="text-muted-foreground">Gérez vos comptables dédiés</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <UserPlus className="mr-2 h-4 w-4" />
              Ajouter un comptable dédié
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau comptable dédié</DialogTitle>
              <DialogDescription>
                Ajoutez un membre à votre équipe. Il n&apos;aura accès qu&apos;aux clients et sociétés qui lui seront assignés.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom complet *</Label>
                <Input placeholder="Ex: Sophie Laurent" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" placeholder="Ex: sophie@lexora.mu" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe *</Label>
                <Input type="password" placeholder="Minimum 6 caractères" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input placeholder="Ex: +230 5234 5678" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
              {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Annuler</Button>
              <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreate} disabled={creating}>
                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Ajouter à l'équipe"}
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
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Aucun comptable dédié</h2>
            <p className="text-muted-foreground mb-4">Ajoutez des membres à votre équipe pour leur assigner des clients.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member) => (
            <Card key={member.id} className="relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: member.is_active !== false ? "#C9A84C" : "#9ca3af" }} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full text-white font-semibold text-sm" style={{ backgroundColor: "#1E2A4A" }}>
                      {member.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{member.full_name}</CardTitle>
                      <CardDescription className="mt-0.5">Comptable dédié</CardDescription>
                    </div>
                  </div>
                  <Badge className={member.is_active !== false ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                    {member.is_active !== false ? "Actif" : "Inactif"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /><span>{member.email}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /><span>{member.phone || "—"}</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5" /><span>{getAssignedClientCount(member.id)} client(s) assigné(s)</span></div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /><span>Créé le {new Date(member.created_at).toLocaleDateString("fr-FR")}</span></div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedMember(member); setProfileDialogOpen(true) }}>
                    <Eye className="mr-1 h-3.5 w-3.5" />Voir détails
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Profile Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profil du comptable dédié</DialogTitle>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full text-white font-bold text-xl" style={{ backgroundColor: "#1E2A4A" }}>
                  {selectedMember.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedMember.full_name}</h3>
                  <Badge className="bg-amber-100 text-amber-700">Comptable dédié</Badge>
                </div>
              </div>
              <div className="grid gap-3 text-sm">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{selectedMember.email}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Téléphone</p><p className="font-medium">{selectedMember.phone || "Non renseigné"}</p></div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Clients assignés</p><p className="font-medium">{getAssignedClientCount(selectedMember.id)} client(s)</p></div>
                </div>
              </div>
              {getAssignedClients(selectedMember.id).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Clients assignés :</p>
                  <div className="space-y-1">
                    {getAssignedClients(selectedMember.id).map((client) => (
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
    </div>
  )
}
