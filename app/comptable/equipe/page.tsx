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
import { t, getLocale } from "@/lib/i18n"

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
  const locale = getLocale()
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
      setCreateError(t('cab.equipe.err_required_fields', locale))
      return
    }
    if (password.length < 6) {
      setCreateError(t('cab.equipe.err_password_short', locale))
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
        setCreateError(data.error || t('cab.equipe.err_create', locale))
        return
      }
      setSuccess(`${t('cab.equipe.success_added_pre', locale)} ${name} ${t('cab.equipe.success_added_post', locale)}`)
      resetCreateForm()
      setDialogOpen(false)
      fetchData()
    } catch {
      setCreateError(t('cab.equipe.err_connection_server', locale))
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
        setSuccess(t('cab.equipe.no_changes', locale))
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
        setAssignError(data.error || t('cab.equipe.err_assign', locale))
        return
      }

      const total = (data.results?.societies_updated || 0) + (data.results?.clients_updated || 0)
      setSuccess(`${total} ${t('cab.equipe.success_updated_for', locale)} ${assignTarget.full_name} !`)
      setAssignDialogOpen(false)
      setAssignTarget(null)
      fetchData()
    } catch {
      setAssignError(t('cab.equipe.err_connection', locale))
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
            {t('cab.equipe.my_assignments', locale)}
          </h1>
          <p className="text-muted-foreground">
            {t('cab.equipe.my_assignments_subtitle', locale)}
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
                    <p className="text-xs text-muted-foreground">{t('cab.equipe.kpi_companies', locale)}</p>
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
                    <p className="text-xs text-muted-foreground">{t('cab.equipe.kpi_direct_clients', locale)}</p>
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
                    <p className="text-xs text-muted-foreground">{t('cab.equipe.kpi_total_clients', locale)}</p>
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
                    {t('cab.equipe.assigned_companies', locale)}
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
                            {d.societe?.nom || t('cab.equipe.unknown_company', locale)}
                          </p>
                          {d.client && (
                            <p className="text-xs text-muted-foreground truncate">
                              {t('cab.equipe.client_label', locale)} : {d.client.full_name}
                            </p>
                          )}
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 flex-shrink-0">
                          {t('cab.equipe.badge_assigned', locale)}
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
                    {t('cab.equipe.clients_no_company', locale)}
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
                  <h2 className="text-lg font-semibold mb-2">{t('cab.equipe.no_assignment_title', locale)}</h2>
                  <p className="text-muted-foreground">
                    {t('cab.equipe.no_assignment_desc', locale)}
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
            {t('cab.equipe.admin_only', locale)}
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
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('cab.equipe.title', locale)}</h1>
          <p className="text-muted-foreground">{t('cab.equipe.subtitle', locale)}</p>
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
              {t('cab.equipe.add_dedie', locale)}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('cab.equipe.dialog_create_title', locale)}</DialogTitle>
              <DialogDescription>
                {t('cab.equipe.dialog_create_desc', locale)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Field
                id="cd-name"
                label={t('cab.equipe.fld_full_name', locale)}
                placeholder="Ex : Sophie Laurent"
                required
                inputRef={refName}
              />
              <Field
                id="cd-email"
                label={t('cab.equipe.fld_email', locale)}
                type="email"
                placeholder="Ex : sophie@lexora.mu"
                required
                inputRef={refEmail}
              />
              <Field
                id="cd-password"
                label={t('cab.equipe.fld_password', locale)}
                type="password"
                placeholder={t('cab.equipe.password_placeholder', locale)}
                required
                inputRef={refPassword}
              />
              <Field
                id="cd-phone"
                label={t('cab.equipe.fld_phone', locale)}
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
                {t('cab.equipe.cancel', locale)}
              </Button>
              <Button
                style={{ backgroundColor: GOLD }}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('cab.equipe.creating', locale)}</>
                ) : (
                  t('cab.equipe.add_to_team_btn', locale)
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
          placeholder={t('cab.equipe.search', locale)}
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
            <h2 className="text-lg font-semibold mb-2">{t('cab.equipe.empty', locale)}</h2>
            <p className="text-muted-foreground mb-4">
              {t('cab.equipe.empty_hint', locale)}
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
                        <CardDescription className="mt-0.5">{t('cab.equipe.role_dedie', locale)}</CardDescription>
                      </div>
                    </div>
                    <Badge
                      className={
                        isActive
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 flex-shrink-0"
                          : "bg-gray-100 text-gray-600 border-gray-200 flex-shrink-0"
                      }
                    >
                      {isActive ? t('cab.equipe.badge_active', locale) : t('cab.equipe.badge_inactive', locale)}
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
                      <span>{info.societeCount} {t('cab.equipe.companies_assigned_suffix', locale)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{info.clientCount} {t('cab.equipe.clients_no_company_suffix', locale)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{t('cab.equipe.created_on', locale)} {new Date(member.created_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}</span>
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
                      {t('cab.equipe.view_details', locale)}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      style={{ borderColor: GOLD, color: GOLD }}
                      onClick={() => openAssignDialog(member)}
                    >
                      <UserPlus className="mr-1 h-3.5 w-3.5" />
                      {t('cab.equipe.assign', locale)}
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
            <DialogTitle>{t('cab.equipe.profile_title', locale)}</DialogTitle>
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
                    <Badge className="bg-amber-100 text-amber-700">{t('cab.equipe.role_dedie', locale)}</Badge>
                  </div>
                </div>

                <div className="grid gap-3 text-sm">
                  {[
                    { icon: Mail, label: t('cab.equipe.fld_email', locale), value: selectedMember.email },
                    { icon: Phone, label: t('cab.equipe.fld_phone', locale), value: selectedMember.phone || t('cab.equipe.not_provided', locale) },
                    { icon: Building2, label: t('cab.equipe.assigned_companies', locale), value: `${info.societeCount} ${t('cab.equipe.companies_unit', locale)}` },
                    { icon: Users, label: t('cab.equipe.clients_no_company', locale), value: `${info.clientCount} ${t('cab.equipe.clients_unit', locale)}` },
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
                    <p className="text-sm font-semibold mb-2">{t('cab.equipe.assigned_companies', locale)} :</p>
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
                    <p className="text-sm font-semibold mb-2">{t('cab.equipe.clients_no_company', locale)} :</p>
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
                    {t('cab.equipe.no_assignment_yet', locale)}
                  </p>
                )}
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>
              {t('cab.equipe.close', locale)}
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
                {t('cab.equipe.edit_assignments', locale)}
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
            <DialogTitle>{t('cab.equipe.assign_dialog_title', locale)}</DialogTitle>
            {assignTarget && (
              <DialogDescription>
                {t('cab.equipe.assign_dialog_desc', locale)}{" "}
                <span className="font-medium text-foreground">{assignTarget.full_name}</span>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="py-4 max-h-[400px] overflow-auto space-y-1">
            {clientsWithSocietes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">{t('cab.equipe.no_client_available', locale)}</p>
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
                          {client.email} — {t('cab.equipe.no_company', locale)}
                        </p>
                      </div>
                      {assignedToOther && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {t('cab.equipe.assigned_to', locale)} {assignedToOther}
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
                          {client.email} — {clientDossiers.length} {t('cab.equipe.companies_unit', locale)}
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
                                {d.societe?.nom || t('cab.equipe.unknown_company', locale)}
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
              {t('cab.equipe.cancel', locale)}
            </Button>
            <Button
              style={{ backgroundColor: GOLD }}
              onClick={handleAssign}
              disabled={assigning}
            >
              {assigning ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('cab.equipe.saving', locale)}</>
              ) : (
                t('cab.equipe.save_assignments', locale)
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
