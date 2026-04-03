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
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Search, Loader2, UserPlus, Building2 } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
}

interface Societe {
  id: string
  nom: string
  brn: string | null
  numero_tva_mra: string | null
  statut_tva: boolean
  comptable_id: string | null
  comptable: { id: string; full_name: string; email: string } | null
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  comptable_id: string
  client: { id: string; full_name: string; email: string } | null
  societe: { id: string; nom: string } | null
}

export default function ComptableSocietesPage() {
  const [search, setSearch] = useState("")
  const [societes, setSocietes] = useState<Societe[]>([])
  const [clients, setClients] = useState<UserProfile[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form
  const [formNom, setFormNom] = useState("")
  const [formBrn, setFormBrn] = useState("")
  const [formTva, setFormTva] = useState("")
  const [formStatutTva, setFormStatutTva] = useState("true")
  const [formErn, setFormErn] = useState("")
  const [formTanSociete, setFormTanSociete] = useState("")
  const [formDateIncorporation, setFormDateIncorporation] = useState("")
  const [formClients, setFormClients] = useState<Set<string>>(new Set())

  // Link client dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkSocieteId, setLinkSocieteId] = useState<string | null>(null)
  const [linkClientId, setLinkClientId] = useState("")
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [societesRes, clientsRes, dossiersRes] = await Promise.all([
        fetch("/api/comptable/societes"),
        fetch("/api/comptable/clients"),
        fetch("/api/admin/dossiers"),
      ])
      const [societesData, clientsData, dossiersData] = await Promise.all([
        societesRes.json(),
        clientsRes.json(),
        dossiersRes.json(),
      ])
      if (societesData.societes) setSocietes(societesData.societes)
      if (clientsData.clients) setClients(clientsData.clients)
      if (dossiersData.dossiers) setDossiers(dossiersData.dossiers)
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

  const filtered = societes.filter(
    (s) =>
      s.nom.toLowerCase().includes(search.toLowerCase()) ||
      (s.brn && s.brn.toLowerCase().includes(search.toLowerCase()))
  )

  const getSocieteClients = (societeId: string) => {
    return dossiers
      .filter((d) => d.societe_id === societeId && d.client)
      .map((d) => d.client!)
  }

  const isComptableAdmin = profile?.role === "comptable"

  const resetForm = () => {
    setFormNom(""); setFormBrn(""); setFormTva(""); setFormStatutTva("true")
    setFormErn(""); setFormTanSociete(""); setFormDateIncorporation("")
    setFormClients(new Set()); setError(null)
  }

  const toggleClient = (clientId: string) => {
    setFormClients((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  const handleCreate = async () => {
    setError(null)
    if (!formNom) { setError("Le nom de la société est requis."); return }

    setCreating(true)
    try {
      // Create société with current comptable as assigned
      const res = await fetch("/api/admin/societes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: formNom,
          brn: formBrn || null,
          numero_tva_mra: formTva || null,
          statut_tva: formStatutTva === "true",
          comptable_id: profile?.id || null,
          ern: formErn || null,
          tan: formTanSociete || null,
          date_incorporation: formDateIncorporation || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur lors de la création"); return }

      const newSocieteId = data.societe?.id

      // Create dossiers for selected clients
      if (newSocieteId && formClients.size > 0 && profile?.id) {
        await Promise.all(
          Array.from(formClients).map((clientId) =>
            fetch("/api/admin/dossiers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: clientId,
                societe_id: newSocieteId,
                comptable_id: profile.id,
              }),
            })
          )
        )
      }

      setSuccess(`Société ${formNom} créée avec succès !`)
      resetForm(); setDialogOpen(false); fetchData()
    } catch {
      setError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  const handleLinkClient = async () => {
    setLinkError(null)
    if (!linkClientId || !linkSocieteId) { setLinkError("Veuillez sélectionner un client."); return }

    setLinking(true)
    try {
      const societe = societes.find(s => s.id === linkSocieteId)
      const comptableId = societe?.comptable_id || profile?.id

      const res = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: linkClientId,
          societe_id: linkSocieteId,
          comptable_id: comptableId,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setLinkError(data.error || "Erreur"); return }

      setSuccess("Client lié à la société avec succès !")
      setLinkDialogOpen(false); setLinkClientId(""); setLinkSocieteId(null); fetchData()
    } catch {
      setLinkError("Erreur de connexion")
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>Sociétés</h1>
          <p className="text-muted-foreground">Gestion des sociétés</p>
        </div>
        {isComptableAdmin && (
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: "#0B0F2E" }}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une société
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nouvelle société</DialogTitle>
                <DialogDescription>Créez une société et liez-la à des clients existants.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nom de la société *</Label>
                  <Input placeholder="Ex: TIBOK Ltd" value={formNom} onChange={(e) => setFormNom(e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>BRN</Label>
                    <Input placeholder="Ex: C12345678" value={formBrn} onChange={(e) => setFormBrn(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>N° TVA MRA</Label>
                    <Input placeholder="Ex: VAT-20230001" value={formTva} onChange={(e) => setFormTva(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Statut TVA</Label>
                  <Select value={formStatutTva} onValueChange={setFormStatutTva}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Assujetti à la TVA</SelectItem>
                      <SelectItem value="false">Non assujetti</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>ERN (Employer Registration N°)</Label>
                    <Input placeholder="Ex: C12345678" value={formErn} onChange={(e) => setFormErn(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>TAN Société</Label>
                    <Input placeholder="Ex: A123456789" value={formTanSociete} onChange={(e) => setFormTanSociete(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date d&apos;incorporation</Label>
                  <Input type="date" value={formDateIncorporation} onChange={(e) => setFormDateIncorporation(e.target.value)} />
                </div>
                {clients.length > 0 && (
                  <div className="space-y-2">
                    <Label>Clients à lier</Label>
                    <div className="max-h-[200px] overflow-auto space-y-2 border rounded-md p-3">
                      {clients.map((client) => (
                        <div
                          key={client.id}
                          className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${formClients.has(client.id) ? "bg-amber-50 border border-amber-200" : "hover:bg-muted/50"}`}
                          onClick={() => toggleClient(client.id)}
                        >
                          <Checkbox checked={formClients.has(client.id)} onCheckedChange={() => toggleClient(client.id)} />
                          <div>
                            <p className="text-sm font-medium">{client.full_name}</p>
                            <p className="text-xs text-muted-foreground">{client.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Annuler</Button>
                <Button style={{ backgroundColor: "#D4AF37" }} onClick={handleCreate} disabled={creating}>
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer la société"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {success && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher par nom ou BRN..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle style={{ color: "#0B0F2E" }}>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Sociétés ({filtered.length})
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>BRN</TableHead>
                  <TableHead>N° TVA MRA</TableHead>
                  <TableHead>Statut TVA</TableHead>
                  <TableHead>Client(s)</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((societe) => {
                  const societeClients = getSocieteClients(societe.id)
                  return (
                    <TableRow key={societe.id}>
                      <TableCell className="font-medium">{societe.nom}</TableCell>
                      <TableCell>{societe.brn || "—"}</TableCell>
                      <TableCell>{societe.numero_tva_mra || "—"}</TableCell>
                      <TableCell>
                        <Badge className={societe.statut_tva ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {societe.statut_tva ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {societeClients.length > 0 ? societeClients.map((c) => (
                            <Badge key={c.id} variant="outline" style={{ borderColor: "#D4AF37", color: "#0B0F2E" }}>{c.full_name}</Badge>
                          )) : <span className="text-muted-foreground text-sm">Aucun</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isComptableAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            style={{ borderColor: "#D4AF37", color: "#D4AF37" }}
                            onClick={() => { setLinkSocieteId(societe.id); setLinkClientId(""); setLinkError(null); setLinkDialogOpen(true) }}
                          >
                            <UserPlus className="mr-1 h-4 w-4" />
                            Lier un client
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Aucune société trouvée.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Link Client Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lier un client à la société</DialogTitle>
            <DialogDescription>
              {linkSocieteId && `Société : ${societes.find(s => s.id === linkSocieteId)?.nom}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={linkClientId} onValueChange={setLinkClientId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {linkError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{linkError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Annuler</Button>
            <Button style={{ backgroundColor: "#D4AF37" }} onClick={handleLinkClient} disabled={linking}>
              {linking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Liaison...</> : "Lier le client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
