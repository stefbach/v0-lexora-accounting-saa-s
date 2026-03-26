"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Eye, Search, Loader2 } from "lucide-react"
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

export default function ComptableClientsPage() {
  const [search, setSearch] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/comptable/clients")
      const data = await res.json()
      if (data.clients) setClients(data.clients)
      if (data.dossiers) setDossiers(data.dossiers)
    } catch {
      console.error("Failed to fetch clients")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

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

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
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
                  const societes = getClientSocietes(client.id)
                  return (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.full_name}</TableCell>
                      <TableCell>{client.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {societes.length > 0 ? societes.map((s, i) => (
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
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/comptable/clients/${client.id}`}>
                            <Eye className="mr-1 h-4 w-4" />
                            Voir dossier
                          </Link>
                        </Button>
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
    </div>
  )
}
