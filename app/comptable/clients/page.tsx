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
import { ChevronRight, Search, Loader2, Plus } from "lucide-react"
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
  const [success, setSuccess] = useState<string | null>(null)

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("client_admin")
  const [formBrn, setFormBrn] = useState("")
  const [formTva, setFormTva] = useState("")
  const [formStatutTva, setFormStatutTva] = useState("false")
  const [formAdresse, setFormAdresse] = useState("")

  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, societesRes] = await Promise.all([
        fetch("/api/comptable/clients"),
        fetch("/api/comptable/societes"),
      ])
      const [clientsData, societesData] = await Promise.all([
        clientsRes.json(),
        societesRes.json(),
      ])
      if (clientsData.clients) setClients(clientsData.clients)
      if (clientsData.dossiers) setDossiers(clientsData.dossiers || [])
      if (societesData.societes) setSocietes(societesData.societes)
    } catch {
      console.error("Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t) } }, [success])

  const isComptableAdmin = profile?.role === "comptable"

  const filteredClients = clients.filter(
    (c) => c.full_name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  )

  const getClientSocietes = (clientId: string) =>
    dossiers.filter((d) => d.client_id === clientId && d.societe).map((d) => d.societe!)

  const getClientSocieteCount = (clientId: string) =>
    getClientSocietes(clientId).length

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword(""); setFormRole("client_admin"); setFormBrn(""); setFormTva(""); setFormStatutTva("false"); setFormAdresse(""); setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    if (!formName || !formEmail || !formPassword) { setError("Veuillez remplir tous les champs obligatoires."); return }
    if (formPassword.length < 6) { setError("Le mot de passe doit contenir au moins 6 caractères."); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formEmail, password: formPassword, full_name: formName, role: formRole, phone: formPhone || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur"); return }

      const newUserId = data.user?.id
      // Auto-create personal société + dossier
      if (newUserId) {
        const socRes = await fetch("/api/admin/societes", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nom: `${formName} — Personnel`,
            brn: formBrn || null,
            numero_tva_mra: formTva || null,
            statut_tva: formStatutTva === "true",
            adresse: formAdresse || null,
          }),
        })
        const socData = await socRes.json()
        if (socRes.ok && socData.societe?.id) {
          await fetch("/api/admin/dossiers", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: newUserId, societe_id: socData.societe.id, comptable_id: profile?.id || null }),
          })
        }
      }
      setSuccess(`Client ${formName} créé avec succès !`)
      resetForm(); setDialogOpen(false); fetchData()
    } catch { setError("Erreur de connexion") } finally { setCreating(false) }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            {isComptableAdmin ? "Mes Clients" : "Mes Clients Assignés"}
          </h1>
          <p className="text-muted-foreground">
            {isComptableAdmin ? "Portefeuille complet" : "Clients et sociétés assignés"}
          </p>
        </div>
        {isComptableAdmin && (
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm() }}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: "#1E2A4A" }}><Plus className="mr-2 h-4 w-4" />Ajouter un client</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nouveau client</DialogTitle><DialogDescription>Créez un compte client.</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><Label>Nom complet *</Label><Input placeholder="Ex: Jean-Marc Dupont" value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
                <div className="space-y-2"><Label>Email *</Label><Input type="email" placeholder="Ex: jm@tibok.mu" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></div>
                <div className="space-y-2"><Label>Mot de passe *</Label><Input type="password" placeholder="Minimum 6 caractères" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} /></div>
                <div className="space-y-2"><Label>Téléphone</Label><Input placeholder="Ex: +230 5678 9012" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} /></div>
                <div className="space-y-2"><Label>Type *</Label>
                  <Select value={formRole} onValueChange={setFormRole}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="client_admin">Client Admin</SelectItem><SelectItem value="client_user">Client Utilisateur</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>BRN</Label><Input placeholder="Ex: C07012345" value={formBrn} onChange={(e) => setFormBrn(e.target.value)} /></div>
                  <div className="space-y-2"><Label>N° TVA MRA</Label><Input placeholder="Ex: VAT-20260001" value={formTva} onChange={(e) => setFormTva(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Adresse</Label><Input placeholder="Ex: Port Louis, Mauritius" value={formAdresse} onChange={(e) => setFormAdresse(e.target.value)} /></div>
                <div className="space-y-2"><Label>Statut TVA</Label>
                  <Select value={formStatutTva} onValueChange={setFormStatutTva}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="true">Assujetti</SelectItem><SelectItem value="false">Non assujetti</SelectItem></SelectContent>
                  </Select>
                </div>
                {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Annuler</Button>
                <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreate} disabled={creating}>
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {success && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Sociétés</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Dernière activité</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const clientSocietes = getClientSocietes(client.id)
                  const societeCount = clientSocietes.length
                  return (
                    <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{client.full_name}</p>
                          <p className="text-xs text-muted-foreground">{client.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {societeCount === 0 ? (
                          <Badge variant="outline" className="text-xs">Individuel</Badge>
                        ) : societeCount === 1 ? (
                          <Badge variant="outline" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>{clientSocietes[0].nom}</Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>{clientSocietes[0].nom}</Badge>
                            <Badge variant="outline" className="text-xs">+{societeCount - 1}</Badge>
                          </div>
                        )}
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
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(client.created_at).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/comptable/clients/${client.id}`}>
                            Voir <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredClients.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun client trouvé.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
