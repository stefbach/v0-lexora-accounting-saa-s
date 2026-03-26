"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Eye, Search, Loader2, Plus, UserPlus, Building2, Users } from "lucide-react"
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
  client?: { id: string; full_name: string; email: string } | null
  societe: { id: string; nom: string } | null
}

interface Societe {
  id: string
  nom: string
  brn: string | null
  numero_tva_mra: string | null
  statut_tva: boolean
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

  // Client create dialog
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("client_admin")
  const [formSociete, setFormSociete] = useState("")

  // Société create dialog
  const [societeDialogOpen, setSocieteDialogOpen] = useState(false)
  const [creatingSociete, setCreatingSociete] = useState(false)
  const [societeError, setSocieteError] = useState<string | null>(null)
  const [formNom, setFormNom] = useState("")
  const [formBrn, setFormBrn] = useState("")
  const [formTva, setFormTva] = useState("")
  const [formStatutTva, setFormStatutTva] = useState("true")
  const [formSocieteClients, setFormSocieteClients] = useState<Set<string>>(new Set())

  // Link dialogs
  const [linkClientDialog, setLinkClientDialog] = useState(false)
  const [linkClientId, setLinkClientId] = useState<string | null>(null)
  const [linkSocieteId, setLinkSocieteId] = useState("")
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const [linkSocieteDialog, setLinkSocieteDialog] = useState(false)
  const [linkSocieteForClient, setLinkSocieteForClient] = useState<string | null>(null)
  const [linkClientForSociete, setLinkClientForSociete] = useState("")

  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, societesRes, dossiersRes] = await Promise.all([
        fetch("/api/comptable/clients"),
        fetch("/api/comptable/societes"),
        fetch("/api/admin/dossiers"),
      ])
      const [clientsData, societesData, dossiersData] = await Promise.all([
        clientsRes.json(),
        societesRes.json(),
        dossiersRes.json(),
      ])
      if (clientsData.clients) setClients(clientsData.clients)
      if (clientsData.dossiers) setDossiers(clientsData.dossiers || [])
      if (societesData.societes) setSocietes(societesData.societes)
      if (dossiersData.dossiers && !clientsData.dossiers) setDossiers(dossiersData.dossiers)
    } catch {
      console.error("Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t) } }, [success])

  const isComptableAdmin = profile?.role === "comptable"

  // --- Clients helpers ---
  const filteredClients = clients.filter(
    (c) => c.full_name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  )

  const getClientSocietes = (clientId: string) =>
    dossiers.filter((d) => d.client_id === clientId && d.societe).map((d) => d.societe!.nom)

  // --- Sociétés helpers ---
  const filteredSocietes = societes.filter(
    (s) => s.nom.toLowerCase().includes(search.toLowerCase()) || (s.brn && s.brn.toLowerCase().includes(search.toLowerCase()))
  )

  const getSocieteClients = (societeId: string) =>
    dossiers.filter((d) => d.societe_id === societeId && d.client).map((d) => d.client!)

  // --- Client create ---
  const resetClientForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword(""); setFormRole("client_admin"); setFormSociete(""); setError(null)
  }

  const handleCreateClient = async () => {
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
      if (formSociete && newUserId && profile?.id) {
        const s = societes.find(s => s.id === formSociete)
        await fetch("/api/admin/dossiers", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: newUserId, societe_id: formSociete, comptable_id: s?.comptable_id || profile.id }),
        })
      }
      setSuccess(`Client ${formName} créé avec succès !`)
      resetClientForm(); setClientDialogOpen(false); fetchData()
    } catch { setError("Erreur de connexion") } finally { setCreating(false) }
  }

  // --- Société create ---
  const resetSocieteForm = () => {
    setFormNom(""); setFormBrn(""); setFormTva(""); setFormStatutTva("true"); setFormSocieteClients(new Set()); setSocieteError(null)
  }

  const toggleSocieteClient = (id: string) => {
    setFormSocieteClients(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleCreateSociete = async () => {
    setSocieteError(null)
    if (!formNom) { setSocieteError("Le nom est requis."); return }
    setCreatingSociete(true)
    try {
      const res = await fetch("/api/admin/societes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: formNom, brn: formBrn || null, numero_tva_mra: formTva || null, statut_tva: formStatutTva === "true", comptable_id: profile?.id || null }),
      })
      const data = await res.json()
      if (!res.ok) { setSocieteError(data.error || "Erreur"); return }
      const newId = data.societe?.id
      if (newId && formSocieteClients.size > 0 && profile?.id) {
        await Promise.all(Array.from(formSocieteClients).map(cid =>
          fetch("/api/admin/dossiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: cid, societe_id: newId, comptable_id: profile!.id }) })
        ))
      }
      setSuccess(`Société ${formNom} créée !`)
      resetSocieteForm(); setSocieteDialogOpen(false); fetchData()
    } catch { setSocieteError("Erreur de connexion") } finally { setCreatingSociete(false) }
  }

  // --- Link handlers ---
  const handleLinkClientToSociete = async () => {
    setLinkError(null)
    if (!linkClientId || !linkSocieteId) { setLinkError("Veuillez sélectionner."); return }
    setLinking(true)
    try {
      const s = societes.find(s => s.id === linkSocieteId)
      const res = await fetch("/api/admin/dossiers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: linkClientId, societe_id: linkSocieteId, comptable_id: s?.comptable_id || profile?.id }),
      })
      const data = await res.json()
      if (!res.ok) { setLinkError(data.error || "Erreur"); return }
      setSuccess("Lié avec succès !"); setLinkClientDialog(false); fetchData()
    } catch { setLinkError("Erreur") } finally { setLinking(false) }
  }

  const handleLinkSocieteToClient = async () => {
    setLinkError(null)
    if (!linkSocieteForClient || !linkClientForSociete) { setLinkError("Veuillez sélectionner."); return }
    setLinking(true)
    try {
      const s = societes.find(s => s.id === linkSocieteForClient)
      const res = await fetch("/api/admin/dossiers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: linkClientForSociete, societe_id: linkSocieteForClient, comptable_id: s?.comptable_id || profile?.id }),
      })
      const data = await res.json()
      if (!res.ok) { setLinkError(data.error || "Erreur"); return }
      setSuccess("Client lié !"); setLinkSocieteDialog(false); fetchData()
    } catch { setLinkError("Erreur") } finally { setLinking(false) }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            {profile?.role === "comptable_dedie" ? "Mes Clients Assignés" : "Mes Clients"}
          </h1>
          <p className="text-muted-foreground">Gestion des clients et sociétés</p>
        </div>
      </div>

      {success && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="clients">
          <TabsList>
            <TabsTrigger value="clients" className="gap-1.5"><Users className="h-4 w-4" />Clients ({filteredClients.length})</TabsTrigger>
            <TabsTrigger value="societes" className="gap-1.5"><Building2 className="h-4 w-4" />Sociétés ({filteredSocietes.length})</TabsTrigger>
          </TabsList>

          {/* ===================== CLIENTS TAB ===================== */}
          <TabsContent value="clients" className="space-y-4">
            {isComptableAdmin && (
              <div className="flex justify-end">
                <Dialog open={clientDialogOpen} onOpenChange={(o) => { setClientDialogOpen(o); if (!o) resetClientForm() }}>
                  <DialogTrigger asChild>
                    <Button style={{ backgroundColor: "#1E2A4A" }}><Plus className="mr-2 h-4 w-4" />Ajouter un client</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Nouveau client</DialogTitle><DialogDescription>Créez un compte client et liez-le à une société.</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2"><Label>Nom complet *</Label><Input placeholder="Ex: Raj Doobur" value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
                      <div className="space-y-2"><Label>Email *</Label><Input type="email" placeholder="Ex: raj@tibok.mu" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></div>
                      <div className="space-y-2"><Label>Mot de passe *</Label><Input type="password" placeholder="Minimum 6 caractères" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} /></div>
                      <div className="space-y-2"><Label>Téléphone</Label><Input placeholder="Ex: +230 5678 9012" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} /></div>
                      <div className="space-y-2"><Label>Type *</Label>
                        <Select value={formRole} onValueChange={setFormRole}><SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="client_admin">Client Admin</SelectItem><SelectItem value="client_user">Client Utilisateur</SelectItem></SelectContent>
                        </Select>
                      </div>
                      {societes.length > 0 && (<div className="space-y-2"><Label>Société</Label>
                        <Select value={formSociete} onValueChange={setFormSociete}><SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                          <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                        </Select></div>)}
                      {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setClientDialogOpen(false); resetClientForm() }}>Annuler</Button>
                      <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreateClient} disabled={creating}>
                        {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead><TableHead>Email</TableHead><TableHead>Société(s)</TableHead><TableHead>Rôle</TableHead><TableHead>Statut</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => {
                      const cs = getClientSocietes(client.id)
                      return (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium">{client.full_name}</TableCell>
                          <TableCell>{client.email}</TableCell>
                          <TableCell><div className="flex flex-wrap gap-1">{cs.length > 0 ? cs.map((s, i) => <Badge key={i} variant="outline" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>{s}</Badge>) : <span className="text-muted-foreground text-sm">Aucune</span>}</div></TableCell>
                          <TableCell><Badge variant="outline" className={client.role === "client_admin" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}>{client.role === "client_admin" ? "Admin" : "Utilisateur"}</Badge></TableCell>
                          <TableCell><Badge className={client.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{client.is_active ? "Actif" : "Inactif"}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" asChild><Link href={`/comptable/clients/${client.id}`}><Eye className="mr-1 h-4 w-4" />Dossier</Link></Button>
                              {isComptableAdmin && <Button variant="outline" size="sm" style={{ borderColor: "#C9A84C", color: "#C9A84C" }} onClick={() => { setLinkClientId(client.id); setLinkSocieteId(""); setLinkError(null); setLinkClientDialog(true) }}>Lier société</Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {filteredClients.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun client trouvé.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===================== SOCIÉTÉS TAB ===================== */}
          <TabsContent value="societes" className="space-y-4">
            {isComptableAdmin && (
              <div className="flex justify-end">
                <Dialog open={societeDialogOpen} onOpenChange={(o) => { setSocieteDialogOpen(o); if (!o) resetSocieteForm() }}>
                  <DialogTrigger asChild>
                    <Button style={{ backgroundColor: "#1E2A4A" }}><Plus className="mr-2 h-4 w-4" />Ajouter une société</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>Nouvelle société</DialogTitle><DialogDescription>Créez une société et liez-la à des clients.</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2"><Label>Nom *</Label><Input placeholder="Ex: TIBOK Ltd" value={formNom} onChange={(e) => setFormNom(e.target.value)} /></div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2"><Label>BRN</Label><Input placeholder="Ex: C12345678" value={formBrn} onChange={(e) => setFormBrn(e.target.value)} /></div>
                        <div className="space-y-2"><Label>N° TVA MRA</Label><Input placeholder="Ex: VAT-20230001" value={formTva} onChange={(e) => setFormTva(e.target.value)} /></div>
                      </div>
                      <div className="space-y-2"><Label>Statut TVA</Label>
                        <Select value={formStatutTva} onValueChange={setFormStatutTva}><SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="true">Assujetti</SelectItem><SelectItem value="false">Non assujetti</SelectItem></SelectContent>
                        </Select>
                      </div>
                      {clients.length > 0 && (<div className="space-y-2"><Label>Clients à lier</Label>
                        <div className="max-h-[200px] overflow-auto space-y-2 border rounded-md p-3">
                          {clients.map(c => (
                            <div key={c.id} className={`flex items-center gap-3 p-2 rounded cursor-pointer ${formSocieteClients.has(c.id) ? "bg-amber-50 border border-amber-200" : "hover:bg-muted/50"}`} onClick={() => toggleSocieteClient(c.id)}>
                              <Checkbox checked={formSocieteClients.has(c.id)} onCheckedChange={() => toggleSocieteClient(c.id)} />
                              <div><p className="text-sm font-medium">{c.full_name}</p><p className="text-xs text-muted-foreground">{c.email}</p></div>
                            </div>
                          ))}
                        </div></div>)}
                      {societeError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{societeError}</div>}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setSocieteDialogOpen(false); resetSocieteForm() }}>Annuler</Button>
                      <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreateSociete} disabled={creatingSociete}>
                        {creatingSociete ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead><TableHead>BRN</TableHead><TableHead>N° TVA MRA</TableHead><TableHead>Statut TVA</TableHead><TableHead>Client(s)</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSocietes.map((societe) => {
                      const sc = getSocieteClients(societe.id)
                      return (
                        <TableRow key={societe.id}>
                          <TableCell className="font-medium">{societe.nom}</TableCell>
                          <TableCell>{societe.brn || "—"}</TableCell>
                          <TableCell>{societe.numero_tva_mra || "—"}</TableCell>
                          <TableCell><Badge className={societe.statut_tva ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{societe.statut_tva ? "Active" : "Inactive"}</Badge></TableCell>
                          <TableCell><div className="flex flex-wrap gap-1">{sc.length > 0 ? sc.map(c => <Badge key={c.id} variant="outline" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>{c.full_name}</Badge>) : <span className="text-muted-foreground text-sm">Aucun</span>}</div></TableCell>
                          <TableCell>
                            {isComptableAdmin && <Button variant="outline" size="sm" style={{ borderColor: "#C9A84C", color: "#C9A84C" }} onClick={() => { setLinkSocieteForClient(societe.id); setLinkClientForSociete(""); setLinkError(null); setLinkSocieteDialog(true) }}><UserPlus className="mr-1 h-4 w-4" />Lier client</Button>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {filteredSocietes.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucune société trouvée.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Link Client → Société Dialog */}
      <Dialog open={linkClientDialog} onOpenChange={setLinkClientDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lier à une société</DialogTitle><DialogDescription>{linkClientId && `Client : ${clients.find(c => c.id === linkClientId)?.full_name}`}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={linkSocieteId} onValueChange={setLinkSocieteId}><SelectTrigger><SelectValue placeholder="Sélectionner une société" /></SelectTrigger>
              <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
            </Select>
            {linkError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{linkError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkClientDialog(false)}>Annuler</Button>
            <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleLinkClientToSociete} disabled={linking}>{linking ? "Liaison..." : "Lier"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Société → Client Dialog */}
      <Dialog open={linkSocieteDialog} onOpenChange={setLinkSocieteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lier un client</DialogTitle><DialogDescription>{linkSocieteForClient && `Société : ${societes.find(s => s.id === linkSocieteForClient)?.nom}`}</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <Select value={linkClientForSociete} onValueChange={setLinkClientForSociete}><SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.email}</SelectItem>)}</SelectContent>
            </Select>
            {linkError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{linkError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkSocieteDialog(false)}>Annuler</Button>
            <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleLinkSocieteToClient} disabled={linking}>{linking ? "Liaison..." : "Lier"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
