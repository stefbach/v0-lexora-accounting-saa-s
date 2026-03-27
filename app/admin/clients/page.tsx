"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { Plus, Search, Loader2, Users, Building2, Link } from "lucide-react"

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  is_active: boolean
  created_at: string
}

interface Societe {
  id: string
  nom: string
  brn: string | null
  numero_tva_mra: string | null
  statut_tva: boolean
  comptable_id: string | null
  comptable?: { id: string; full_name: string } | null
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  client?: { id: string; full_name: string } | null
  societe?: { id: string; nom: string } | null
}

export default function AdminClientsPage() {
  const [search, setSearch] = useState("")
  const [users, setUsers] = useState<UserProfile[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState<string | null>(null)

  // Client create
  const [clientDialog, setClientDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("client_admin")
  const [formSocieteIds, setFormSocieteIds] = useState<string[]>([])

  // Société create
  const [societeDialog, setSocieteDialog] = useState(false)
  const [creatingSociete, setCreatingSociete] = useState(false)
  const [societeError, setSocieteError] = useState<string | null>(null)
  const [formNom, setFormNom] = useState("")
  const [formBrn, setFormBrn] = useState("")
  const [formTva, setFormTva] = useState("")
  const [formStatutTva, setFormStatutTva] = useState("true")
  const [formClientIds, setFormClientIds] = useState<string[]>([])

  // Link societies to existing client
  const [linkDialog, setLinkDialog] = useState(false)
  const [linkClient, setLinkClient] = useState<UserProfile | null>(null)
  const [linkSocieteIds, setLinkSocieteIds] = useState<string[]>([])
  const [linking, setLinking] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, societesRes, dossiersRes] = await Promise.all([
        fetch("/api/admin/users"), fetch("/api/admin/societes"), fetch("/api/admin/dossiers"),
      ])
      const [usersData, societesData, dossiersData] = await Promise.all([
        usersRes.json(), societesRes.json(), dossiersRes.json(),
      ])
      if (usersData.users) setUsers(usersData.users)
      if (societesData.societes) setSocietes(societesData.societes)
      if (dossiersData.dossiers) setDossiers(dossiersData.dossiers)
    } catch { console.error("Failed to fetch") } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t) } }, [success])

  const clients = users.filter(u => u.role === "client_admin" || u.role === "client_user")

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  )
  const filteredSocietes = societes.filter(s =>
    s.nom.toLowerCase().includes(search.toLowerCase()) || (s.brn && s.brn.toLowerCase().includes(search.toLowerCase()))
  )

  const getClientSocietes = (clientId: string) =>
    dossiers.filter(d => d.client_id === clientId && d.societe).map(d => d.societe!.nom)

  const getClientSocieteIds = (clientId: string) =>
    dossiers.filter(d => d.client_id === clientId).map(d => d.societe_id)

  const getSocieteClients = (societeId: string) =>
    dossiers.filter(d => d.societe_id === societeId && d.client).map(d => d.client!)

  const resetClientForm = () => { setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword(""); setFormRole("client_admin"); setFormSocieteIds([]); setError(null) }
  const resetSocieteForm = () => { setFormNom(""); setFormBrn(""); setFormTva(""); setFormStatutTva("true"); setFormClientIds([]); setSocieteError(null) }

  const toggleSocieteSelection = (societeId: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(societeId) ? list.filter(id => id !== societeId) : [...list, societeId])
  }

  const toggleClientSelection = (clientId: string) => {
    setFormClientIds(prev => prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId])
  }

  const handleCreateClient = async () => {
    setError(null)
    if (!formName || !formEmail || !formPassword) { setError("Champs obligatoires manquants."); return }
    if (formPassword.length < 6) { setError("Mot de passe : 6 caractères minimum."); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formEmail, password: formPassword, full_name: formName, role: formRole, phone: formPhone || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur"); return }

      const newUserId = data.user?.id

      // Link selected societies via dossiers
      if (newUserId && formSocieteIds.length > 0) {
        await Promise.allSettled(
          formSocieteIds.map(societeId => {
            const societe = societes.find(s => s.id === societeId)
            return fetch("/api/admin/dossiers", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ client_id: newUserId, societe_id: societeId, comptable_id: societe?.comptable_id || null }),
            })
          })
        )
        setSuccess(`Client ${formName} créé et lié à ${formSocieteIds.length} société(s) !`)
      } else {
        setSuccess(`Client ${formName} créé !`)
      }

      resetClientForm(); setClientDialog(false); fetchData()
    } catch { setError("Erreur de connexion") } finally { setCreating(false) }
  }

  const handleCreateSociete = async () => {
    setSocieteError(null)
    if (!formNom) { setSocieteError("Le nom est requis."); return }
    setCreatingSociete(true)
    try {
      const res = await fetch("/api/admin/societes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: formNom, brn: formBrn || null, numero_tva_mra: formTva || null, statut_tva: formStatutTva === "true" }),
      })
      const data = await res.json()
      if (!res.ok) { setSocieteError(data.error || "Erreur"); return }

      const newSociete = data.societe

      // Link selected clients via dossiers
      if (newSociete?.id && formClientIds.length > 0) {
        await Promise.allSettled(
          formClientIds.map(clientId =>
            fetch("/api/admin/dossiers", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ client_id: clientId, societe_id: newSociete.id, comptable_id: null }),
            })
          )
        )
        setSuccess(`Société ${formNom} créée et liée à ${formClientIds.length} client(s) !`)
      } else {
        setSuccess(`Société ${formNom} créée !`)
      }

      resetSocieteForm(); setSocieteDialog(false); fetchData()
    } catch { setSocieteError("Erreur de connexion") } finally { setCreatingSociete(false) }
  }

  // Link societies to an existing client
  const openLinkDialog = (client: UserProfile) => {
    setLinkClient(client)
    const alreadyLinked = getClientSocieteIds(client.id)
    setLinkSocieteIds([...alreadyLinked])
    setLinkDialog(true)
  }

  const handleLinkSocietes = async () => {
    if (!linkClient) return
    setLinking(true)
    try {
      const alreadyLinked = getClientSocieteIds(linkClient.id)
      const toAdd = linkSocieteIds.filter(id => !alreadyLinked.includes(id))

      if (toAdd.length > 0) {
        await Promise.allSettled(
          toAdd.map(societeId => {
            const societe = societes.find(s => s.id === societeId)
            return fetch("/api/admin/dossiers", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ client_id: linkClient.id, societe_id: societeId, comptable_id: societe?.comptable_id || null }),
            })
          })
        )
        setSuccess(`${toAdd.length} société(s) liée(s) à ${linkClient.full_name} !`)
      } else {
        setSuccess("Aucune nouvelle société à lier.")
      }

      setLinkDialog(false); setLinkClient(null); setLinkSocieteIds([]); fetchData()
    } catch { setError("Erreur lors de la liaison") } finally { setLinking(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Clients</h1>
        <p className="text-muted-foreground">Gestion des clients et sociétés de la plateforme</p>
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

          {/* CLIENTS TAB */}
          <TabsContent value="clients" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={clientDialog} onOpenChange={(o) => { setClientDialog(o); if (!o) resetClientForm() }}>
                <DialogTrigger asChild><Button style={{ backgroundColor: "#1E2A4A" }}><Plus className="mr-2 h-4 w-4" />Ajouter un client</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Nouveau client</DialogTitle><DialogDescription>Créez un compte client.</DialogDescription></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Nom complet *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Email *</Label><Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Mot de passe *</Label><Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Téléphone</Label><Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Type *</Label>
                      <Select value={formRole} onValueChange={setFormRole}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="client_admin">Client Admin</SelectItem><SelectItem value="client_user">Client Utilisateur</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Société(s) à lier</Label>
                      {societes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucune société disponible.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-md border p-3 space-y-2">
                          {societes.map(s => (
                            <div key={s.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`create-client-soc-${s.id}`}
                                checked={formSocieteIds.includes(s.id)}
                                onCheckedChange={() => toggleSocieteSelection(s.id, formSocieteIds, setFormSocieteIds)}
                              />
                              <label htmlFor={`create-client-soc-${s.id}`} className="text-sm cursor-pointer">
                                {s.nom}{s.brn ? ` (${s.brn})` : ""}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setClientDialog(false); resetClientForm() }}>Annuler</Button>
                    <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreateClient} disabled={creating}>
                      {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nom</TableHead><TableHead>Email</TableHead><TableHead>Téléphone</TableHead>
                  <TableHead>Rôle</TableHead><TableHead>Société(s)</TableHead><TableHead>Statut</TableHead><TableHead>Date création</TableHead><TableHead>Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredClients.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell>{c.email}</TableCell>
                      <TableCell>{c.phone || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className={c.role === "client_admin" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}>{c.role === "client_admin" ? "Admin" : "Utilisateur"}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getClientSocietes(c.id).length > 0
                            ? getClientSocietes(c.id).map((s, i) => <Badge key={i} variant="outline" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>{s}</Badge>)
                            : <span className="text-muted-foreground text-sm">Aucune</span>}
                        </div>
                      </TableCell>
                      <TableCell><Badge className={c.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{c.is_active ? "Actif" : "Inactif"}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" title="Lier des sociétés" onClick={() => openLinkDialog(c)}>
                          <Link className="h-4 w-4 mr-1" style={{ color: "#C9A84C" }} />
                          <span className="text-xs">Lier</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredClients.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Aucun client trouvé.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* SOCIÉTÉS TAB */}
          <TabsContent value="societes" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={societeDialog} onOpenChange={(o) => { setSocieteDialog(o); if (!o) resetSocieteForm() }}>
                <DialogTrigger asChild><Button style={{ backgroundColor: "#1E2A4A" }}><Plus className="mr-2 h-4 w-4" />Ajouter une société</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Nouvelle société</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2"><Label>Nom *</Label><Input value={formNom} onChange={(e) => setFormNom(e.target.value)} /></div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>BRN</Label><Input value={formBrn} onChange={(e) => setFormBrn(e.target.value)} /></div>
                      <div className="space-y-2"><Label>N° TVA MRA</Label><Input value={formTva} onChange={(e) => setFormTva(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>Statut TVA</Label>
                      <Select value={formStatutTva} onValueChange={setFormStatutTva}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="true">Assujetti</SelectItem><SelectItem value="false">Non assujetti</SelectItem></SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Client(s) à lier</Label>
                      {clients.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun client disponible.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-md border p-3 space-y-2">
                          {clients.map(c => (
                            <div key={c.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`create-soc-client-${c.id}`}
                                checked={formClientIds.includes(c.id)}
                                onCheckedChange={() => toggleClientSelection(c.id)}
                              />
                              <label htmlFor={`create-soc-client-${c.id}`} className="text-sm cursor-pointer">
                                {c.full_name} ({c.email})
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {societeError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{societeError}</div>}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setSocieteDialog(false); resetSocieteForm() }}>Annuler</Button>
                    <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreateSociete} disabled={creatingSociete}>
                      {creatingSociete ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nom</TableHead><TableHead>BRN</TableHead><TableHead>N° TVA MRA</TableHead>
                  <TableHead>Statut TVA</TableHead><TableHead>Client(s)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredSocietes.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.nom}</TableCell>
                      <TableCell>{s.brn || "—"}</TableCell>
                      <TableCell>{s.numero_tva_mra || "—"}</TableCell>
                      <TableCell><Badge className={s.statut_tva ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>{s.statut_tva ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getSocieteClients(s.id).length > 0
                            ? getSocieteClients(s.id).map(c => <Badge key={c.id} variant="outline" style={{ borderColor: "#C9A84C", color: "#1E2A4A" }}>{c.full_name}</Badge>)
                            : <span className="text-muted-foreground text-sm">Aucun</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredSocietes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Aucune société trouvée.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Link societies to existing client dialog */}
      <Dialog open={linkDialog} onOpenChange={(o) => { setLinkDialog(o); if (!o) { setLinkClient(null); setLinkSocieteIds([]) } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>Lier des sociétés</DialogTitle>
            <DialogDescription>
              {linkClient && `Sélectionnez les sociétés à lier à ${linkClient.full_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-auto space-y-2">
            {societes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Aucune société disponible.</p>
            ) : (
              societes.map(s => {
                const isLinked = linkClient ? getClientSocieteIds(linkClient.id).includes(s.id) : false
                const isSelected = linkSocieteIds.includes(s.id)
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? "border-amber-300 bg-amber-50" : "border-border hover:bg-muted/50"}`}
                    onClick={() => { if (!isLinked) toggleSocieteSelection(s.id, linkSocieteIds, setLinkSocieteIds) }}
                  >
                    <Checkbox checked={isSelected} disabled={isLinked} onCheckedChange={() => { if (!isLinked) toggleSocieteSelection(s.id, linkSocieteIds, setLinkSocieteIds) }} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{s.nom}</p>
                      <p className="text-xs text-muted-foreground">{s.brn || "Pas de BRN"}</p>
                    </div>
                    {isLinked && <Badge variant="outline" className="text-xs">Déjà liée</Badge>}
                  </div>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(false)}>Annuler</Button>
            <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleLinkSocietes} disabled={linking || societes.length === 0}>
              {linking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Liaison...</> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
