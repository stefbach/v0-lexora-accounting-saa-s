"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Search, Loader2, Mail, Phone, Users, Eye, UserPlus, Calendar, Building2,
  ChevronDown, ChevronRight, Lock,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

// ─── Types ──────────────────────────────────────────────────────────────────

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
  dossiers: Dossier[]
  hasSocietes: boolean
}

// ─── Uncontrolled text field (defaultValue + onBlur) ─────────────────────────
// Avoids sluggish typing on every keystroke re-render.

interface UncontrolledFieldProps {
  id?: string
  label: string
  type?: string
  placeholder?: string
  defaultValue?: string
  required?: boolean
  inputRef: React.RefObject<HTMLInputElement>
}

function Field({ id, label, type = "text", placeholder, defaultValue = "", required, inputRef }: UncontrolledFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Input
        id={id}
        ref={inputRef}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ComptableEquipePage() {
  const [search, setSearch] = useState("")
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Uncontrolled refs for the create form
  const refName = useRef<HTMLInputElement>(null!)
  const refEmail = useRef<HTMLInputElement>(null!)
  const refPhone = useRef<HTMLInputElement>(null!)
  const refPassword = useRef<HTMLInputElement>(null!)

  // Global feedback
  const [success, setSuccess] = useState<string | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Profile dialog
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null)

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<UserProfile | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [selectedDossierIds, setSelectedDossierIds] = useState<Set<string>>(new Set())
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

  // ── Data loading ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, dossiersRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/dossiers"),
      ])
      const [usersData, dossiersData] = await Promise.all([
        usersRes.json(),
        dossiersRes.json(),
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

  // Auto-clear success banner
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => setSuccess(null), 5000)
    return () => clearTimeout(t)
  }, [success])

  // ── Derived data ───────────────────────────────────────────────────────────

  const teamMembers = allUsers.filter((u) => u.role === "comptable_dedie")
  const clients = allUsers.filter((u) => u.role === "client_admin" || u.role === "client_user")

  const filtered = teamMembers.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const getClientsWithSocietes = useCallback((): ClientWithSocietes[] => {
    return clients.map((client) => {
      const clientDossiers = dossiers.filter((d) => d.client_id === client.id && d.societe)
      return { client, dossiers: clientDossiers, hasSocietes: clientDossiers.length > 0 }
    })
  }, [clients, dossiers])

  const getAssignmentInfo = useCallback(
    (comptableId: string) => {
      const assignedDossiers = dossiers.filter((d) => d.comptable_id === comptableId)
      const directClients = clients.filter((c) => c.comptable_id === comptableId)
      const directOnlyClients = directClients.filter(
        (c) => !dossiers.some((d) => d.client_id === c.id)
      )
      const uniqueClientIds = new Set(assignedDossiers.map((d) => d.client_id))
      return {
        totalItems: assignedDossiers.length + directOnlyClients.length,
        societeCount: assignedDossiers.length,
        clientCount: directOnlyClients.length,
        uniqueClientFromSocietes: uniqueClientIds.size,
        assignedDossiers,
        directOnlyClients,
      }
    },
    [clients, dossiers]
  )

  const isComptableAdmin = profile?.role === "comptable"
  const isComptableDedie = profile?.role === "comptable_dedie"

  // ── Create collaborateur ───────────────────────────────────────────────────

  const resetCreateForm = () => {
    if (refName.current) refName.current.value = ""
    if (refEmail.current) refEmail.current.value = ""
    if (refPhone.current) refPhone.current.value = ""
    if (refPassword.current) refPassword.current.value = ""
    setCreateError(null)
  }

  const handleCreate = async () => {
    setCreateError(null)
    const name = refName.current?.value.trim() ?? ""
    const email = refEmail.current?.value.trim() ?? ""
    const password = refPassword.current?.value ?? ""
    const phone = refPhone.current?.value.trim() ?? ""

    if (!name || !email || !password) {
      setCreateError("Veuillez remplir tous les champs obligatoires.")
      return
    }
    if (password.length < 6) {
      setCreateError("Le mot de passe doit contenir au moins 6 caractères.")
      return
    }

    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: name,
          role: "comptable_dedie",
          phone: phone || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error || "Erreur lors de la création")
        return
      }
      setSuccess(`Comptable dédié ${name} ajouté à l'équipe !`)
      resetCreateForm()
      setDialogOpen(false)
      fetchData()
    } catch {
      setCreateError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  // ── Assign dialog ──────────────────────────────────────────────────────────

  const openAssignDialog = (member: UserProfile) => {
    setAssignTarget(member)
    setAssignError(null)

    const assignedDossiers = new Set(
      dossiers.filter((d) => d.comptable_id === member.id).map((d) => d.id)
    )
    setSelectedDossierIds(assignedDossiers)

    const directClients = new Set(
      clients
        .filter((c) => c.comptable_id === member.id && !dossiers.some((d) => d.client_id === c.id))
        .map((c) => c.id)
    )
    setSelectedClientIds(directClients)

    const toExpand = new Set<string>()
    dossiers.forEach((d) => { if (d.comptable_id === member.id) toExpand.add(d.client_id) })
    setExpandedClients(toExpand)

    setAssignDialogOpen(true)
  }

  const toggleDossier = (dossierId: string) => {
    setSelectedDossierIds((prev) => {
      const next = new Set(prev)
      next.has(dossierId) ? next.delete(dossierId) : next.add(dossierId)
      return next
    })
  }

  const toggleDirectClient = (clientId: string) => {
    setSelectedClientIds((prev) => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  const toggleExpanded = (clientId: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  const handleAssign = async () => {
    if (!assignTarget) return
    setAssigning(true)
    setAssignError(null)

    try {
      const societyAssignments: { dossier_id: string; assigned: boolean }[] = []
      dossiers.forEach((d) => {
        const wasAssigned = d.comptable_id === assignTarget.id
        const isNowAssigned = selectedDossierIds.has(d.id)
        if (wasAssigned !== isNowAssigned) {
          societyAssignments.push({ dossier_id: d.id, assigned: isNowAssigned })
        }
      })

      const clientAssignments: { client_id: string; assigned: boolean }[] = []
      clients.forEach((c) => {
        if (dossiers.some((d) => d.client_id === c.id)) return
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
      if (!res.ok) {
        setAssignError(data.error || "Erreur lors de l'assignation")
        return
      }

      const total = (data.results?.societies_updated || 0) + (data.results?.clients_updated || 0)
      setSuccess(`${total} assignation(s) mise(s) à jour pour ${assignTarget.full_name} !`)
      setAssignDialogOpen(false)
      setAssignTarget(null)
      fetchData()
    } catch {
      setAssignError("Erreur de connexion")
    } finally {
      setAssigning(false)
    }
  }

  // ── Profile dialog ─────────────────────────────────────────────────────────

  const openProfile = (member: UserProfile) => {
    setSelectedMember(member)
    setProfileDialogOpen(true)
  }

  // ── Render: comptable_dedie self-view ──────────────────────────────────────

  if (isComptableDedie && profile) {
    const myDossiers = dossiers.filter((d) => d.comptable_id === profile.id)
    const myDirectClients = clients.filter(
      (c) => c.comptable_id === profile.id && !dossiers.some((d) => d.client_id === c.id)
    )
    const uniqueClientCount = new Set([
      ...myDossiers.map((d) => d.client_id),
      ...myDirectClients.map((c) => c.id),
    ]).size

    return (
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Mes Assignations
          </h1>
          <p className="text-muted-foreground">
            Clients et sociétés qui vous sont assignés
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-lg" style={{ backgroundColor: `${NAVY}15` }}>
                    <Building2 className="h-5 w-5" style={{ color: NAVY }} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sociétés</p>
                    <p className="text-2xl font-bold" style={{ color: NAVY }}>{myDossiers.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-lg" style={{ backgroundColor: `${GOLD}20` }}>
                    <Users className="h-5 w-5" style={{ color: GOLD }} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Clients directs</p>
                    <p className="text-2xl font-bold" style={{ color: NAVY }}>{myDirectClients.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-emerald-50">
                    <Users className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total clients</p>
                    <p className="text-2xl font-bold" style={{ color: NAVY }}>{uniqueClientCount}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Societies list */}
            {myDossiers.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" style={{ color: GOLD }} />
                    Sociétés assignées
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {myDossiers.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {d.societe?.nom || "Société inconnue"}
                          </p>
                          {d.client && (
                            <p className="text-xs text-muted-foreground truncate">
                              Client : {d.client.full_name}
                            </p>
                          )}
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 flex-shrink-0">
                          Assigné
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Direct clients */}
            {myDirectClients.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" style={{ color: GOLD }} />
                    Clients assignés (sans société)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {myDirectClients.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                      >
                        <div
                          className="h-8 w-8 flex items-center justify-center rounded-full text-white text-xs font-semibold flex-shrink-0"
                          style={{ backgroundColor: NAVY }}
                        >
                          {c.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{c.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {myDossiers.length === 0 && myDirectClients.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold mb-2">Aucune assignation</h2>
                  <p className="text-muted-foreground">
                    Aucun client ou société ne vous a encore été assigné. Contactez votre comptable principal.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Render: non-admin fallback ─────────────────────────────────────────────

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

  // ── Render: comptable admin full view ──────────────────────────────────────

  const clientsWithSocietes = getClientsWithSocietes()

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Mon Équipe</h1>
          <p className="text-muted-foreground">Gérez vos comptables dédiés et leurs assignations</p>
        </div>

        {/* ── Create dialog ── */}
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) resetCreateForm()
          }}
        >
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: NAVY }}>
              <UserPlus className="mr-2 h-4 w-4" />
              Ajouter un comptable dédié
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau comptable dédié</DialogTitle>
              <DialogDescription>
                Ajoutez un collaborateur à votre équipe. Il n&apos;aura accès qu&apos;aux clients et
                sociétés qui lui seront assignés.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Field
                id="cd-name"
                label="Nom complet"
                placeholder="Ex : Sophie Laurent"
                required
                inputRef={refName}
              />
              <Field
                id="cd-email"
                label="Email"
                type="email"
                placeholder="Ex : sophie@lexora.mu"
                required
                inputRef={refEmail}
              />
              <Field
                id="cd-password"
                label="Mot de passe"
                type="password"
                placeholder="Minimum 6 caractères"
                required
                inputRef={refPassword}
              />
              <Field
                id="cd-phone"
                label="Téléphone"
                placeholder="Ex : +230 5234 5678"
                inputRef={refPhone}
              />

              {createError && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                  {createError}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setDialogOpen(false); resetCreateForm() }}
              >
                Annuler
              </Button>
              <Button
                style={{ backgroundColor: GOLD }}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</>
                ) : (
                  "Ajouter à l'équipe"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Feedback banners */}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}
      {globalError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {globalError}
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom ou email…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Team list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Aucun comptable dédié</h2>
            <p className="text-muted-foreground mb-4">
              Ajoutez des membres à votre équipe pour leur assigner des clients.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member) => {
            const info = getAssignmentInfo(member.id)
            const initials = member.full_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
            const isActive = member.is_active !== false

            return (
              <Card key={member.id} className="relative overflow-hidden">
                {/* Top accent bar */}
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ backgroundColor: isActive ? GOLD : "#9ca3af" }}
                />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white font-semibold text-sm flex-shrink-0"
                        style={{ backgroundColor: NAVY }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{member.full_name}</CardTitle>
                        <CardDescription className="mt-0.5">Comptable dédié</CardDescription>
                      </div>
                    </div>
                    <Badge
                      className={
                        isActive
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 flex-shrink-0"
                          : "bg-gray-100 text-gray-600 border-gray-200 flex-shrink-0"
                      }
                    >
                      {isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{member.phone || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{info.societeCount} société(s) assignée(s)</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{info.clientCount} client(s) sans société</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Créé le {new Date(member.created_at).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openProfile(member)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      Voir détails
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      style={{ borderColor: GOLD, color: GOLD }}
                      onClick={() => openAssignDialog(member)}
                    >
                      <UserPlus className="mr-1 h-3.5 w-3.5" />
                      Assigner
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Profile dialog ── */}
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
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-full text-white font-bold text-xl flex-shrink-0"
                    style={{ backgroundColor: NAVY }}
                  >
                    {selectedMember.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{selectedMember.full_name}</h3>
                    <Badge className="bg-amber-100 text-amber-700">Comptable dédié</Badge>
                  </div>
                </div>

                <div className="grid gap-3 text-sm">
                  {[
                    { icon: Mail, label: "Email", value: selectedMember.email },
                    { icon: Phone, label: "Téléphone", value: selectedMember.phone || "Non renseigné" },
                    { icon: Building2, label: "Sociétés assignées", value: `${info.societeCount} société(s)` },
                    { icon: Users, label: "Clients sans société", value: `${info.clientCount} client(s)` },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="font-medium">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {info.assignedDossiers.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Sociétés assignées :</p>
                    <div className="space-y-1">
                      {info.assignedDossiers.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{d.societe?.nom || "—"}</span>
                          {d.client && (
                            <span className="text-muted-foreground">— {d.client.full_name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {info.directOnlyClients.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Clients assignés (sans société) :</p>
                    <div className="space-y-1">
                      {info.directOnlyClients.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/30">
                          <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span>{c.full_name}</span>
                          <span className="text-muted-foreground">— {c.email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {info.totalItems === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Aucune assignation pour le moment.
                  </p>
                )}
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>
              Fermer
            </Button>
            {selectedMember && (
              <Button
                style={{ backgroundColor: GOLD }}
                onClick={() => {
                  setProfileDialogOpen(false)
                  openAssignDialog(selectedMember)
                }}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Modifier les assignations
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign dialog ── */}
      <Dialog
        open={assignDialogOpen}
        onOpenChange={(o) => {
          setAssignDialogOpen(o)
          if (!o) { setAssignTarget(null); setAssignError(null) }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>Assigner des clients et sociétés</DialogTitle>
            {assignTarget && (
              <DialogDescription>
                Sélectionnez les éléments à assigner à{" "}
                <span className="font-medium text-foreground">{assignTarget.full_name}</span>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="py-4 max-h-[400px] overflow-auto space-y-1">
            {clientsWithSocietes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Aucun client disponible.</p>
            ) : (
              clientsWithSocietes.map(({ client, dossiers: clientDossiers, hasSocietes }) => {
                // ── Client without societies ──
                if (!hasSocietes) {
                  const isSelected = selectedClientIds.has(client.id)
                  const assignedToOther =
                    client.comptable_id && client.comptable_id !== assignTarget?.id
                      ? allUsers.find((u) => u.id === client.comptable_id)?.full_name
                      : null

                  return (
                    <div
                      key={client.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? "border-amber-300 bg-amber-50" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => toggleDirectClient(client.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleDirectClient(client.id)}
                      />
                      <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{client.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {client.email} — Aucune société
                        </p>
                      </div>
                      {assignedToOther && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          Assigné à {assignedToOther}
                        </Badge>
                      )}
                    </div>
                  )
                }

                // ── Client with expandable societies ──
                const isExpanded = expandedClients.has(client.id)
                const assignedCount = clientDossiers.filter((d) =>
                  selectedDossierIds.has(d.id)
                ).length

                return (
                  <div key={client.id} className="border rounded-lg overflow-hidden">
                    {/* Client row */}
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpanded(client.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <Users className="h-4 w-4 flex-shrink-0" style={{ color: NAVY }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{client.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {client.email} — {clientDossiers.length} société(s)
                        </p>
                      </div>
                      {assignedCount > 0 && (
                        <Badge
                          style={{ backgroundColor: GOLD, color: "white" }}
                          className="text-xs flex-shrink-0"
                        >
                          {assignedCount}/{clientDossiers.length}
                        </Badge>
                      )}
                    </div>

                    {/* Expanded societies */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20 px-3 py-2 space-y-1">
                        {clientDossiers.map((d) => {
                          const isSelected = selectedDossierIds.has(d.id)
                          const assignedToOther =
                            d.comptable_id && d.comptable_id !== assignTarget?.id
                              ? allUsers.find((u) => u.id === d.comptable_id)?.full_name
                              : null

                          return (
                            <div
                              key={d.id}
                              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-amber-50 border border-amber-300"
                                  : "hover:bg-muted/50"
                              }`}
                              onClick={() => toggleDossier(d.id)}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleDossier(d.id)}
                              />
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="text-sm flex-1 truncate">
                                {d.societe?.nom || "Société inconnue"}
                              </span>
                              {assignedToOther && (
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {assignedToOther}
                                </Badge>
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

          {assignError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
              {assignError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              style={{ backgroundColor: GOLD }}
              onClick={handleAssign}
              disabled={assigning}
            >
              {assigning ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enregistrement...</>
              ) : (
                "Enregistrer les assignations"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
