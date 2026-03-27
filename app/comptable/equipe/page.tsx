"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Plus, Search, Loader2, Mail, Phone, Users, Eye, UserPlus, Calendar, Building2, ChevronDown, ChevronRight } from "lucide-react"
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

interface Societe {
  id: string
  nom: string
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  comptable_id: string | null
  societe?: Societe | null
  client?: { id: string; full_name: string; email: string } | null
}

interface ClientWithSocietes {
  client: UserProfile
  dossiers: Dossier[] // societies linked to this client
  hasSocietes: boolean
}

export default function ComptableEquipePage() {
  const [search, setSearch] = useState("")
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
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

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<UserProfile | null>(null)
  const [assigning, setAssigning] = useState(false)
  // Track which dossier IDs are assigned to this comptable dédié
  const [selectedDossierIds, setSelectedDossierIds] = useState<Set<string>>(new Set())
  // Track which client IDs (without societies) are directly assigned
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())
  // Track expanded client sections in the tree
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, dossiersRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/dossiers"),
      ])
      const [usersData, dossiersData] = await Promise.all([
        usersRes.json(), dossiersRes.json(),
      ])
      if (usersData.users) setAllUsers(usersData.users)
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

  const teamMembers = allUsers.filter((u) => u.role === "comptable_dedie")
  const clients = allUsers.filter((u) => u.role === "client_admin" || u.role === "client_user")

  const filtered = teamMembers.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  // Build client-with-societies structure for assignment UI
  const getClientsWithSocietes = (): ClientWithSocietes[] => {
    return clients.map(client => {
      const clientDossiers = dossiers.filter(d => d.client_id === client.id && d.societe)
      return {
        client,
        dossiers: clientDossiers,
        hasSocietes: clientDossiers.length > 0,
      }
    })
  }

  // Get assignment counts for a comptable dédié
  const getAssignmentInfo = (comptableId: string) => {
    const assignedDossiers = dossiers.filter(d => d.comptable_id === comptableId)
    const directClients = clients.filter(c => c.comptable_id === comptableId)
    // Clients without societies that are directly assigned
    const directOnlyClients = directClients.filter(c => {
      const hasDossiers = dossiers.some(d => d.client_id === c.id)
      return !hasDossiers
    })
    const assignedSocieteCount = assignedDossiers.length
    const assignedClientCount = directOnlyClients.length
    // Unique clients from dossiers
    const uniqueClientIds = new Set(assignedDossiers.map(d => d.client_id))
    return {
      totalItems: assignedSocieteCount + assignedClientCount,
      societeCount: assignedSocieteCount,
      clientCount: assignedClientCount,
      uniqueClientFromSocietes: uniqueClientIds.size,
      assignedDossiers,
      directOnlyClients,
    }
  }

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
      resetForm(); setDialogOpen(false); fetchData()
    } catch {
      setError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  // --- Assignment dialog logic ---
  const openAssignDialog = (member: UserProfile) => {
    setAssignTarget(member)

    // Pre-select currently assigned dossiers (societies)
    const assignedDossiers = new Set(
      dossiers.filter(d => d.comptable_id === member.id).map(d => d.id)
    )
    setSelectedDossierIds(assignedDossiers)

    // Pre-select directly assigned clients (no societies)
    const directClients = new Set(
      clients
        .filter(c => c.comptable_id === member.id && !dossiers.some(d => d.client_id === c.id))
        .map(c => c.id)
    )
    setSelectedClientIds(directClients)

    // Expand clients that have assignments
    const toExpand = new Set<string>()
    dossiers.forEach(d => {
      if (d.comptable_id === member.id) toExpand.add(d.client_id)
    })
    setExpandedClients(toExpand)

    setAssignDialogOpen(true)
  }

  const toggleDossier = (dossierId: string) => {
    setSelectedDossierIds(prev => {
      const next = new Set(prev)
      if (next.has(dossierId)) next.delete(dossierId)
      else next.add(dossierId)
      return next
    })
  }

  const toggleDirectClient = (clientId: string) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  const toggleExpanded = (clientId: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  const handleAssign = async () => {
    if (!assignTarget) return
    setAssigning(true)
    setError(null)

    try {
      // Build society assignments: for each dossier, determine if it changed
      const societyAssignments: { dossier_id: string; assigned: boolean }[] = []
      dossiers.forEach(d => {
        const wasAssigned = d.comptable_id === assignTarget.id
        const isNowAssigned = selectedDossierIds.has(d.id)
        if (wasAssigned !== isNowAssigned) {
          societyAssignments.push({ dossier_id: d.id, assigned: isNowAssigned })
        }
      })

      // Build client assignments: for clients without societies
      const clientAssignments: { client_id: string; assigned: boolean }[] = []
      clients.forEach(c => {
        const hasDossiers = dossiers.some(d => d.client_id === c.id)
        if (hasDossiers) return // skip clients with societies

        const wasAssigned = c.comptable_id === assignTarget.id
        const isNowAssigned = selectedClientIds.has(c.id)
        if (wasAssigned !== isNowAssigned) {
          clientAssignments.push({ client_id: c.id, assigned: isNowAssigned })
        }
      })

      if (societyAssignments.length === 0 && clientAssignments.length === 0) {
        setSuccess("Aucune modification à enregistrer.")
        setAssignDialogOpen(false)
        return
      }

      const res = await fetch("/api/comptable/equipe/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comptable_dedie_id: assignTarget.id,
          society_assignments: societyAssignments,
          client_assignments: clientAssignments,
        }),
      })

      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur lors de l'assignation"); return }

      const total = (data.results?.societies_updated || 0) + (data.results?.clients_updated || 0)
      setSuccess(`${total} assignation(s) mise(s) à jour pour ${assignTarget.full_name} !`)
      setAssignDialogOpen(false)
      setAssignTarget(null)
      fetchData()
    } catch {
      setError("Erreur de connexion")
    } finally {
      setAssigning(false)
    }
  }

  // --- Profile dialog with detailed assignments ---
  const openProfile = (member: UserProfile) => {
    setSelectedMember(member)
    setProfileDialogOpen(true)
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

  const clientsWithSocietes = getClientsWithSocietes()

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
      {error && !dialogOpen && !assignDialogOpen && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}

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
          {filtered.map((member) => {
            const info = getAssignmentInfo(member.id)
            return (
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
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{info.societeCount} société(s) assignée(s)</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{info.clientCount} client(s) sans société</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-3.5 w-3.5" /><span>Créé le {new Date(member.created_at).toLocaleDateString("fr-FR")}</span></div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openProfile(member)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />Voir détails
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" style={{ borderColor: "#C9A84C", color: "#C9A84C" }} onClick={() => openAssignDialog(member)}>
                      <UserPlus className="mr-1 h-3.5 w-3.5" />Assigner
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Profile Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profil du comptable dédié</DialogTitle>
          </DialogHeader>
          {selectedMember && (() => {
            const info = getAssignmentInfo(selectedMember.id)
            return (
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
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Sociétés assignées</p><p className="font-medium">{info.societeCount} société(s)</p></div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Clients sans société</p><p className="font-medium">{info.clientCount} client(s)</p></div>
                  </div>
                </div>

                {/* Assigned societies grouped by client */}
                {info.assignedDossiers.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Sociétés assignées :</p>
                    <div className="space-y-1">
                      {info.assignedDossiers.map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{d.societe?.nom || "—"}</span>
                          {d.client && <span className="text-muted-foreground">— Client : {d.client.full_name}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Directly assigned clients (without societies) */}
                {info.directOnlyClients.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Clients assignés (sans société) :</p>
                    <div className="space-y-1">
                      {info.directOnlyClients.map(c => (
                        <div key={c.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{c.full_name}</span>
                          <span className="text-muted-foreground">— {c.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {info.totalItems === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">Aucune assignation pour le moment.</p>
                )}
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(o) => { setAssignDialogOpen(o); if (!o) setAssignTarget(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>Assigner des clients et sociétés</DialogTitle>
            <DialogDescription>
              {assignTarget && `Sélectionnez les éléments à assigner à ${assignTarget.full_name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-auto space-y-1">
            {clientsWithSocietes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Aucun client disponible.</p>
            ) : (
              clientsWithSocietes.map(({ client, dossiers: clientDossiers, hasSocietes }) => {
                if (!hasSocietes) {
                  // Client without societies: single checkbox for the client
                  const isSelected = selectedClientIds.has(client.id)
                  const assignedToOther = client.comptable_id && client.comptable_id !== assignTarget?.id
                    ? allUsers.find(u => u.id === client.comptable_id)?.full_name
                    : null

                  return (
                    <div
                      key={client.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${isSelected ? "border-amber-300 bg-amber-50" : "border-border hover:bg-muted/50"}`}
                      onClick={() => toggleDirectClient(client.id)}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleDirectClient(client.id)} />
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{client.full_name}</p>
                        <p className="text-xs text-muted-foreground">{client.email} — Aucune société</p>
                      </div>
                      {assignedToOther && (
                        <Badge variant="outline" className="text-xs">Assigné à {assignedToOther}</Badge>
                      )}
                    </div>
                  )
                }

                // Client with societies: expandable tree
                const isExpanded = expandedClients.has(client.id)
                const assignedCount = clientDossiers.filter(d => selectedDossierIds.has(d.id)).length

                return (
                  <div key={client.id} className="border rounded-lg overflow-hidden">
                    {/* Client header */}
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpanded(client.id)}
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <Users className="h-4 w-4" style={{ color: "#1E2A4A" }} />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{client.full_name}</p>
                        <p className="text-xs text-muted-foreground">{client.email} — {clientDossiers.length} société(s)</p>
                      </div>
                      {assignedCount > 0 && (
                        <Badge style={{ backgroundColor: "#C9A84C", color: "white" }} className="text-xs">
                          {assignedCount}/{clientDossiers.length}
                        </Badge>
                      )}
                    </div>

                    {/* Expanded societies */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                        {clientDossiers.map(d => {
                          const isSelected = selectedDossierIds.has(d.id)
                          const assignedToOther = d.comptable_id && d.comptable_id !== assignTarget?.id
                            ? allUsers.find(u => u.id === d.comptable_id)?.full_name
                            : null

                          return (
                            <div
                              key={d.id}
                              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-amber-50 border border-amber-300" : "hover:bg-muted/50"}`}
                              onClick={() => toggleDossier(d.id)}
                            >
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleDossier(d.id)} />
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm flex-1">{d.societe?.nom || "Société inconnue"}</span>
                              {assignedToOther && (
                                <Badge variant="outline" className="text-xs">Assigné à {assignedToOther}</Badge>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Annuler</Button>
            <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleAssign} disabled={assigning}>
              {assigning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</> : "Enregistrer les assignations"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
