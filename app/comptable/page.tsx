"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Users,
  Building2,
  FileText,
  AlertTriangle,
  Search,
  Loader2,
  ChevronRight,
  Clock,
  UserCheck,
  ArrowRight,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useProfile } from "@/hooks/use-profile"
import { t, getLocale } from '@/lib/i18n'

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"
const SECONDARY = "#4A5490"

const panelStyle = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow:
    "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
}

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
  comptable_id: string | null
  societe: { id: string; nom: string } | null
}

interface Assistant {
  id: string
  full_name: string
  email: string
  assignedClientCount: number
}

export default function ComptableDashboardPage() {
  const locale = getLocale()
  const { profile } = useProfile()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [pendingDocs, setPendingDocs] = useState(0)
  const [alertCount, setAlertCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterCollab, setFilterCollab] = useState("all")

  const isDedie = profile?.role === "comptable_dedie"

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        fetch("/api/comptable/clients").then((r) => r.json()),
        fetch("/api/comptable/documents").then((r) => r.json()),
        fetch("/api/comptable/alertes").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
      ])

      const clientsData =
        results[0].status === "fulfilled" ? results[0].value : {}
      const docsData =
        results[1].status === "fulfilled" ? results[1].value : {}
      const alertesData =
        results[2].status === "fulfilled" ? results[2].value : {}
      const usersData =
        results[3].status === "fulfilled" ? results[3].value : {}

      if (clientsData.clients) setClients(clientsData.clients)
      if (clientsData.dossiers) setDossiers(clientsData.dossiers || [])

      if (docsData.documents) {
        const docs = docsData.documents as { statut: string }[]
        setPendingDocs(
          docs.filter(
            (d) => d.statut === "en_cours" || d.statut === "en_attente"
          ).length
        )
      }

      if (alertesData.alertes) {
        setAlertCount((alertesData.alertes as unknown[]).length)
      }

      // Build assistants list from comptable_dedie users
      if (usersData.users) {
        const allDossiers = clientsData.dossiers || []
        const comptableDedies = (usersData.users as Record<string, unknown>[]).filter(
          (u) => u.role === "comptable_dedie"
        )
        const assistantList: Assistant[] = comptableDedies.map((u) => {
          const assignedDossiers = allDossiers.filter(
            (d: Dossier) => d.comptable_id === u.id
          )
          const uniqueClientIds = new Set(
            assignedDossiers.map((d: Dossier) => d.client_id)
          )
          return {
            id: u.id as string,
            full_name: u.full_name as string,
            email: u.email as string,
            assignedClientCount: uniqueClientIds.size,
          }
        })
        setAssistants(assistantList)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getClientSocietes = (clientId: string) =>
    dossiers
      .filter((d) => d.client_id === clientId && d.societe)
      .map((d) => d.societe!)

  const getAssignedCollabName = (clientId: string): string | null => {
    const clientDossiers = dossiers.filter((d) => d.client_id === clientId)
    const comptableIds = [
      ...new Set(
        clientDossiers
          .map((d) => d.comptable_id)
          .filter(Boolean)
      ),
    ]
    if (comptableIds.length === 0) return null
    const collab = assistants.find((a) => a.id === comptableIds[0])
    return collab ? collab.full_name : null
  }

  const filteredClients = clients.filter((c) => {
    const matchSearch =
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (filterCollab === "all") return true
    if (filterCollab === "non_assigne") {
      const clientDossiers = dossiers.filter((d) => d.client_id === c.id)
      return clientDossiers.every((d) => !d.comptable_id)
    }
    // Filter by specific collaborateur
    const clientDossiers = dossiers.filter((d) => d.client_id === c.id)
    return clientDossiers.some((d) => d.comptable_id === filterCollab)
  })

  const totalSocietes = new Set(dossiers.map((d) => d.societe_id)).size

  const kpis = [
    { label: t('cab.dashboard.kpi_clients', locale),       value: clients.length, icon: Users,         strong: "#4191FF", dark: "#1D5FC4" },
    { label: t('cab.dashboard.kpi_companies', locale),     value: totalSocietes,  icon: Building2,     strong: "#D4AF37", dark: "#A88925" },
    { label: t('cab.dashboard.kpi_docs_pending', locale),  value: pendingDocs,    icon: FileText,      strong: "#2ECC8A", dark: "#1F9B68" },
    { label: t('cab.dashboard.kpi_alerts', locale),        value: alertCount,     icon: AlertTriangle, strong: "#E25555", dark: "#B93B3B" },
  ]

  const now = new Date()
  const dateFr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('cab.dashboard.crumb_firm', locale), href: "/comptable" }, { label: t('cab.dashboard.crumb_overview', locale) }]}
      kicker={`${isDedie ? t('cab.dashboard.role_assistant', locale) : t('cab.dashboard.role_expert', locale)} · ${dateFr}`}
      title={t('cab.dashboard.title', locale)}
      subtitle={`${profile?.full_name || t('cab.dashboard.welcome', locale)} ${t('cab.dashboard.subtitle_suffix', locale)}`}
    >
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {/* KPIs — premium pattern */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map(k => (
            <article
              key={k.label}
              className="relative overflow-hidden group transition-all duration-200 hover:-translate-y-1"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
                border: "1px solid #D8DFED",
                borderRadius: "16px",
                boxShadow:
                  "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-[3px]"
                style={{ background: `linear-gradient(90deg, ${k.strong} 0%, ${k.strong}33 100%)` }}
              />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "-60px",
                  right: "-60px",
                  width: "160px",
                  height: "160px",
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${k.strong}22 0%, transparent 70%)`,
                  pointerEvents: "none",
                }}
              />
              <div className="relative p-5">
                <div className="flex items-center justify-between mb-4">
                  <div
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${k.strong}22 0%, ${k.strong}08 100%)`,
                      border: `1px solid ${k.strong}44`,
                      boxShadow: `0 10px 24px -10px ${k.strong}55, inset 0 1px 0 rgba(255,255,255,0.4)`,
                      color: k.dark,
                    }}
                  >
                    <k.icon className="w-5 h-5" strokeWidth={1.8} />
                  </div>
                </div>
                <p
                  className="text-[11px] font-bold uppercase"
                  style={{ color: "#475569", letterSpacing: "0.08em" }}
                >
                  {k.label}
                </p>
                <p
                  className="text-2xl font-bold mt-1"
                  style={{
                    color: NAVY,
                    fontFamily: "Poppins, sans-serif",
                    letterSpacing: "-0.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : k.value}
                </p>
              </div>
            </article>
          ))}
        </div>

        {/* Client table */}
        <Card style={panelStyle}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${BLUE}22 0%, ${BLUE}08 100%)`,
                  border: `1px solid ${BLUE}44`,
                  color: "#1D5FC4",
                }}
              >
                <Users className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-semibold" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
                {t('cab.dashboard.portfolio', locale)}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('cab.dashboard.search_client', locale)}
                  className="pl-9"
                  style={{ borderColor: "#D8DFED", borderRadius: 10 }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {!isDedie && assistants.length > 0 && (
                <Select value={filterCollab} onValueChange={setFilterCollab}>
                  <SelectTrigger className="w-[220px]" style={{ borderColor: "#D8DFED", borderRadius: 10 }}>
                    <SelectValue placeholder={t('cab.dashboard.filter_collab', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('cab.dashboard.all_clients', locale)}</SelectItem>
                    <SelectItem value="non_assigne">{t('cab.dashboard.unassigned', locale)}</SelectItem>
                    {assistants.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm">{t('cab.dashboard.no_client', locale)}</p>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E9F4" }}>
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: "linear-gradient(180deg, #F8FAFF 0%, #F1F5FC 100%)" }}>
                      <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>{t('cab.dashboard.col_client', locale)}</TableHead>
                      <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>{t('cab.dashboard.col_email', locale)}</TableHead>
                      <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>{t('cab.dashboard.col_companies', locale)}</TableHead>
                      <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>{t('cab.dashboard.col_docs_pending', locale)}</TableHead>
                      <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>{t('cab.dashboard.col_last_activity', locale)}</TableHead>
                      <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>{t('cab.dashboard.col_assigned_to', locale)}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => {
                      const clientSocietes = getClientSocietes(client.id)
                      const collabName = getAssignedCollabName(client.id)
                      return (
                        <TableRow
                          key={client.id}
                          className="cursor-pointer hover:bg-[#F8FAFF]/60 transition-colors"
                          onClick={() =>
                            router.push(`/comptable/clients/${client.id}`)
                          }
                        >
                          <TableCell>
                            <p className="font-medium" style={{ color: NAVY }}>{client.full_name}</p>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {client.email}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              style={{ borderColor: GOLD, color: NAVY }}
                            >
                              {clientSocietes.length}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs bg-gray-50"
                            >
                              --
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(client.created_at).toLocaleDateString(
                                "fr-FR",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {collabName ? (
                              <Badge
                                variant="outline"
                                className="text-xs"
                                style={{ borderColor: GOLD, color: NAVY }}
                              >
                                {collabName}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t('cab.dashboard.unassigned', locale)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/comptable/clients/${client.id}`}>
                                <ChevronRight className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mon equipe section -- only for comptable, not comptable_dedie */}
        {!isDedie && (
          <Card style={panelStyle}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, ${GOLD}22 0%, ${GOLD}08 100%)`,
                      border: `1px solid ${GOLD}44`,
                      color: "#A88925",
                    }}
                  >
                    <UserCheck className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
                    Mon equipe
                  </CardTitle>
                </div>
                <Link href="/comptable/equipe">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    style={{ borderColor: "#D8DFED", color: NAVY }}
                  >
                    Gerer <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : assistants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <UserCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">Aucun collaborateur</p>
                  <p className="text-xs mt-1">
                    Ajoutez des collaborateurs depuis la page Mon Equipe.
                  </p>
                  <Link href="/comptable/equipe">
                    <Button
                      size="sm"
                      className="mt-3 text-[#0B0F2E] font-semibold"
                      style={{
                        background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                        boxShadow: "0 6px 16px -6px rgba(212,175,55,0.55), inset 0 1px 0 rgba(255,255,255,0.4)",
                      }}
                    >
                      Ajouter un collaborateur
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E4E9F4" }}>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: "linear-gradient(180deg, #F8FAFF 0%, #F1F5FC 100%)" }}>
                        <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>Collaborateur</TableHead>
                        <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>Email</TableHead>
                        <TableHead style={{ color: SECONDARY, fontWeight: 600 }}>Clients assignes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assistants.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium" style={{ color: NAVY }}>
                            {a.full_name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {a.email}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              style={{ borderColor: GOLD, color: NAVY }}
                            >
                              {a.assignedClientCount} client
                              {a.assignedClientCount !== 1 ? "s" : ""}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPageShell>
  )
}
