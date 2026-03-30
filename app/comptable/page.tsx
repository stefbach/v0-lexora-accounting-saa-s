"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

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
  assignedClients: string[]
}

export default function ComptableDashboardPage() {
  const { profile } = useProfile()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [pendingDocs, setPendingDocs] = useState(0)
  const [alertCount, setAlertCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const firstName = profile?.full_name?.split(" ")[0] || ""
  const isDedie = profile?.role === "comptable_dedie"

  const fetchData = useCallback(async () => {
    try {
      // Fetch what we can — some APIs may return 403 for non-comptable roles
      const results = await Promise.allSettled([
        fetch("/api/comptable/clients").then(r => r.json()),
        fetch("/api/comptable/documents").then(r => r.json()),
        fetch("/api/admin/users").then(r => r.json()),
      ])

      const clientsData = results[0].status === 'fulfilled' ? results[0].value : {}
      const docsData = results[1].status === 'fulfilled' ? results[1].value : {}
      const usersData = results[2].status === 'fulfilled' ? results[2].value : {}

      if (clientsData.clients) setClients(clientsData.clients)
      if (clientsData.dossiers) setDossiers(clientsData.dossiers || [])

      if (docsData.documents) {
        const docs = docsData.documents as { statut: string }[]
        setPendingDocs(docs.filter((d) => d.statut === "en_cours" || d.statut === "en_attente").length)
      }

      // Build assistants list
      if (usersData.users) {
        const allDossiers = clientsData.dossiers || []
        const comptableDedies = (usersData.users as any[]).filter(
          (u) => u.role === "comptable_dedie"
        )
        const assistantList: Assistant[] = comptableDedies.map((u) => {
          const assignedDossiers = allDossiers.filter(
            (d: any) => d.comptable_id === u.id
          )
          const uniqueClientIds = [
            ...new Set(assignedDossiers.map((d: any) => d.client_id)),
          ] as string[]
          const assignedClientNames = uniqueClientIds
            .map((cid) => {
              const c = (clientsData.clients || []).find(
                (cl: any) => cl.id === cid
              )
              return c ? c.full_name : ""
            })
            .filter(Boolean)
          return {
            id: u.id,
            full_name: u.full_name,
            email: u.email,
            assignedClients: assignedClientNames,
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

  const filteredClients = clients.filter(
    (c) =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  )

  const totalSocietes = new Set(dossiers.map((d) => d.societe_id)).size

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
          Bienvenue{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isDedie
            ? "Vue d'ensemble de vos clients assignes"
            : "Vue d'ensemble de votre portefeuille"}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clients</p>
                <p className="text-3xl font-bold mt-1" style={{ color: NAVY }}>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    clients.length
                  )}
                </p>
              </div>
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${GOLD}20` }}
              >
                <Users className="h-6 w-6" style={{ color: GOLD }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Societes gerees</p>
                <p className="text-3xl font-bold mt-1" style={{ color: NAVY }}>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    totalSocietes
                  )}
                </p>
              </div>
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${GOLD}20` }}
              >
                <Building2 className="h-6 w-6" style={{ color: GOLD }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Documents en attente
                </p>
                <p className="text-3xl font-bold mt-1" style={{ color: NAVY }}>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    pendingDocs
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pendingDocs > 0
                    ? "En attente de traitement"
                    : "Aucun document en attente"}
                </p>
              </div>
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${GOLD}20` }}
              >
                <FileText className="h-6 w-6" style={{ color: GOLD }} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Alertes actives</p>
                <p className="text-3xl font-bold mt-1" style={{ color: NAVY }}>
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    alertCount
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {alertCount > 0 ? "A traiter" : "Aucune alerte"}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client list - main content */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle
              className="flex items-center gap-2"
              style={{ color: NAVY }}
            >
              <Users className="h-5 w-5" />
              Portefeuille clients
            </CardTitle>
            <Link href="/comptable/clients">
              <Button variant="outline" size="sm" className="text-xs">
                Voir tout
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un client..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm">Aucun client trouve.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Societes</TableHead>
                  <TableHead>Docs en attente</TableHead>
                  <TableHead>Derniere activite</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const clientSocietes = getClientSocietes(client.id)
                  return (
                    <TableRow
                      key={client.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/comptable/clients/${client.id}`)
                      }
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium">{client.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {clientSocietes.length === 0 ? (
                          <Badge variant="outline" className="text-xs">
                            Individuel
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              style={{ borderColor: GOLD, color: NAVY }}
                            >
                              {clientSocietes.length}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              societe{clientSocietes.length > 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
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
          )}
        </CardContent>
      </Card>

      {/* Mon equipe section */}
      {!isDedie && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle
                className="flex items-center gap-2"
                style={{ color: NAVY }}
              >
                <UserCheck className="h-5 w-5" />
                Mon equipe
              </CardTitle>
              <Link href="/comptable/equipe">
                <Button variant="outline" size="sm" className="text-xs">
                  Gerer
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
                <p className="text-sm font-medium">Aucun assistant</p>
                <p className="text-xs mt-1">
                  Ajoutez des assistants comptables depuis la page Mon Equipe.
                </p>
                <Link href="/comptable/equipe">
                  <Button
                    size="sm"
                    className="mt-3 text-white"
                    style={{ backgroundColor: GOLD }}
                  >
                    Ajouter un assistant
                  </Button>
                </Link>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assistant</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Clients assignes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assistants.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.full_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.email}
                      </TableCell>
                      <TableCell>
                        {a.assignedClients.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Aucun client assigne
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {a.assignedClients.map((name, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="text-xs"
                                style={{ borderColor: GOLD, color: NAVY }}
                              >
                                {name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
