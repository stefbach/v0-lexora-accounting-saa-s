"use client"

import { useState } from "react"
import Link from "next/link"
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
import { Eye, Search, Users } from "lucide-react"

const clients = [
  {
    id: "cl-001",
    name: "Jean-Marc Dupont",
    societe: "TIBOK Ltd",
    derniereActivite: "24 mars 2026",
    docsEnAttente: 3,
    statutTVA: "en_retard" as const,
  },
  {
    id: "cl-002",
    name: "Marie Lefèvre",
    societe: "BPO Services Ltd",
    derniereActivite: "23 mars 2026",
    docsEnAttente: 5,
    statutTVA: "a_declarer" as const,
  },
  {
    id: "cl-003",
    name: "Pierre Martin",
    societe: "Obesity Care Malta",
    derniereActivite: "22 mars 2026",
    docsEnAttente: 2,
    statutTVA: "a_jour" as const,
  },
  {
    id: "cl-004",
    name: "Sophie Bernard",
    societe: "NHS S2 Healthcare",
    derniereActivite: "21 mars 2026",
    docsEnAttente: 1,
    statutTVA: "a_declarer" as const,
  },
  {
    id: "cl-005",
    name: "Luc Moreau",
    societe: "TIBOK Ltd",
    derniereActivite: "20 mars 2026",
    docsEnAttente: 0,
    statutTVA: "a_jour" as const,
  },
  {
    id: "cl-006",
    name: "Claire Fontaine",
    societe: "NHS S2 Healthcare",
    derniereActivite: "19 mars 2026",
    docsEnAttente: 2,
    statutTVA: "a_jour" as const,
  },
  {
    id: "cl-007",
    name: "Antoine Rousseau",
    societe: "BPO Services Ltd",
    derniereActivite: "18 mars 2026",
    docsEnAttente: 1,
    statutTVA: "en_retard" as const,
  },
  {
    id: "cl-008",
    name: "Nathalie Girard",
    societe: "Obesity Care Malta",
    derniereActivite: "17 mars 2026",
    docsEnAttente: 1,
    statutTVA: "a_declarer" as const,
  },
]

const statutTVAConfig: Record<
  string,
  { label: string; className: string }
> = {
  a_jour: {
    label: "À jour",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  en_retard: {
    label: "En retard",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  a_declarer: {
    label: "À déclarer",
    className: "bg-orange-100 text-orange-700 border-orange-200",
  },
}

export default function ComptableClientsPage() {
  const [search, setSearch] = useState("")

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.societe.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "#C9A84C20" }}
          >
            <Users className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              Mes Clients
            </h1>
            <p className="text-sm text-gray-500">
              {clients.length} clients dans votre portefeuille
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Rechercher par nom ou société..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle style={{ color: "#1E2A4A" }}>
            Liste des clients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>Dernière activité</TableHead>
                <TableHead className="text-center">
                  Documents en attente
                </TableHead>
                <TableHead>Statut TVA du mois</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => {
                const tvaConfig = statutTVAConfig[client.statutTVA]
                return (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      {client.name}
                    </TableCell>
                    <TableCell>{client.societe}</TableCell>
                    <TableCell className="text-gray-500">
                      {client.derniereActivite}
                    </TableCell>
                    <TableCell className="text-center">
                      {client.docsEnAttente > 0 ? (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                          {client.docsEnAttente}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={tvaConfig.className}>
                        {tvaConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/comptable/clients/${client.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-1" />
                          Voir dossier
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
