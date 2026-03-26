"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
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
import { Eye, Search, Loader2, Plus } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface Client {
  id: string
  full_name: string
  email: string
  role: string
  phone: string | null
  is_active: boolean
  created_at: string
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  comptable_id: string
  societe: { id: string; nom: string } | null
}

interface Societe {
  id: string
  nom: string
  comptable_id: string | null
}

export default function ComptableClientsPage() {
  const [search, setSearch] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Client form
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("client_admin")
  const [formSociete, setFormSociete] = useState("")

  // Link client to société dialog
  const [linkDialogOpen2, setLinkDialogOpen2] = useState(false)
  const [linkClientId2, setLinkClientId2] = useState<string | null>(null)
  const [linkSocieteId2, setLinkSocieteId2] = useState("")
  const [linking2, setLinking2] = useState(false)
  const [linkError2, setLinkError2] = useState<string | null>(null)


  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, societesRes] = await Promise.all([
        fetch("/api/comptable/clients"),
        fetch("/api/admin/societes"),
      ])
      const [clientsData, societesData] = await Promise.all([
        clientsRes.json(),
        societesRes.json(),
      ])
      if (clientsData.clients) setClients(clientsData.clients)
      if (clientsData.dossiers) setDossiers(clientsData.dossiers)
      if (societesData.societes) setSocietes(societesData.societes)
    } catch {
      console.error("Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const filtered = clients.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  )

  const getClientSocietes = (clientId: string) => {
    return dossiers
      .filter((d) => d.client_id === clientId && d.societe)
      .map((d) => d.societe!.nom)
  }

  const isComptableAdmin = profile?.role === "comptable"

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword(""); setFormRole("client_admin"); setFormSociete(""); setError(null)
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
      // Create the user
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          full_name: formName,
          role: formRole,
          phone: formPhone || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur lors de la création"); return }

      const newUserId = data.user?.id

      // If société selected, create a dossier linking client ↔ société ↔ comptable
      if (formSociete && newUserId && profile?.id) {
        const selectedSociete = societes.find(s => s.id === formSociete)
        const comptableId = selectedSociete?.comptable_id || profile.id

        await fetch("/api/admin/dossiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: newUserId,
            societe_id: formSociete,
            comptable_id: comptableId,
          }),
        })
      }

      setSuccess(`Client ${formName} créé avec succès !`)
      resetForm(); setDialogOpen(false); fetchData()
    } catch {
      setError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  const handleLinkSociete = async () => {
    setLinkError2(null)
    if (!linkClientId2 || !linkSocieteId2) { setLinkError2("Veuillez sélectionner une société."); return }

    setLinking2(true)
    try {
      const selectedSociete = societes.find(s => s.id === linkSocieteId2)
      const comptableId = selectedSociete?.comptable_id || profile?.id

      const res = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: linkClientId2,
          societe_id: linkSocieteId2,
          comptable_id: comptableId,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setLinkError2(data.error || "Erreur"); return }

      setSuccess("Client lié à la société avec succès !")
      setLinkDialogOpen2(false); fetchData()
    } catch {
      setLinkError2("Erreur de connexion")
    } finally {
      setLinking2(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            {profile?.role === "comptable_dedie" ? "Mes Clients Assignés" : "Mes Clients"}
          </h1>
          <p className="text-muted-foreground">
            {profile?.role === "comptable_dedie"
              ? "Clients et sociétés qui vous sont assignés"
              : "Tous les clients de la plateforme"}
          </p>
        </div>
        {isComptableAdmin && (
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
                <DialogDescription>Créez un compte client et liez-le à une société.</DialogDescription>
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
                  <Label>Type de client *</Label>
                  <Select value={formRole} onValueChange={setFormRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client_admin">Client Admin (accès complet aux finances)</SelectItem>
                      <SelectItem value="client_user">Client Utilisateur (upload documents uniquement)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {societes.length > 0 && (
                  <div className="space-y-2">
                    <Label>Société à lier</Label>
                    <Select value={formSociete} onValueChange={setFormSociete}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
                      <SelectContent>
                        {societes.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Annuler</Button>
                <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreate} disabled={creating}>
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer le client"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle style={{ color: "#1E2A4A" }}>Clients ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Société(s)</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((client) => {
                  const clientSocietes = getClientSocietes(client.id)
                  return (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.full_name}</TableCell>
                      <TableCell>{client.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {clientSocietes.length > 0 ? clientSocietes.map((s, i) => (
                            <Badge key={i} variant="outline" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>{s}</Badge>
                          )) : <span className="text-muted-foreground text-sm">Aucune</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={client.role === "client_admin" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}>
                          {client.role === "client_admin" ? "Admin" : "Utilisateur"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={client.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {client.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/comptable/clients/${client.id}`}>
                              <Eye className="mr-1 h-4 w-4" />
                              Voir dossier
                            </Link>
                          </Button>
                          {isComptableAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              style={{ borderColor: "#C9A84C", color: "#C9A84C" }}
                              onClick={() => { setLinkClientId2(client.id); setLinkSocieteId2(""); setLinkError2(null); setLinkDialogOpen2(true) }}
                            >
                              Lier société
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucun client trouvé.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Link Client to Société Dialog */}
      <Dialog open={linkDialogOpen2} onOpenChange={setLinkDialogOpen2}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lier à une société</DialogTitle>
            <DialogDescription>
              {linkClientId2 && `Client : ${clients.find(c => c.id === linkClientId2)?.full_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Société</Label>
              <Select value={linkSocieteId2} onValueChange={setLinkSocieteId2}>
                <SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
                <SelectContent>
                  {societes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {linkError2 && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{linkError2}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen2(false)}>Annuler</Button>
            <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleLinkSociete} disabled={linking2}>
              {linking2 ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Liaison...</> : "Lier la société"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
