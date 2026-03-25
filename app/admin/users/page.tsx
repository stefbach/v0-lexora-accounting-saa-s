"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Ban,
  UserCog,
  Users,
} from "lucide-react"

const mockComptables = [
  {
    id: "1",
    nom: "Marie Dupont",
    email: "marie.dupont@lexora.mu",
    role: "comptable" as const,
    telephone: "+230 5234 5678",
    statut: "actif" as const,
  },
  {
    id: "2",
    nom: "Jean Martin",
    email: "jean.martin@lexora.mu",
    role: "comptable" as const,
    telephone: "+230 5345 6789",
    statut: "actif" as const,
  },
  {
    id: "3",
    nom: "Sophie Laurent",
    email: "sophie.laurent@lexora.mu",
    role: "comptable" as const,
    telephone: "+230 5456 7890",
    statut: "actif" as const,
  },
  {
    id: "4",
    nom: "Pierre Rochefort",
    email: "pierre.rochefort@lexora.mu",
    role: "comptable" as const,
    telephone: "+230 5567 8901",
    statut: "inactif" as const,
  },
]

const mockClients = [
  {
    id: "5",
    nom: "Raj Doobur",
    email: "raj@tibok.mu",
    role: "client" as const,
    telephone: "+230 5678 9012",
    statut: "actif" as const,
    comptableAssigne: "Marie Dupont",
  },
  {
    id: "6",
    nom: "Nadia Jeetun",
    email: "nadia@bpo-services.mu",
    role: "client" as const,
    telephone: "+230 5789 0123",
    statut: "actif" as const,
    comptableAssigne: "Jean Martin",
  },
  {
    id: "7",
    nom: "Olivier Masson",
    email: "olivier@obesitycare.mt",
    role: "client" as const,
    telephone: "+356 9900 1234",
    statut: "actif" as const,
    comptableAssigne: "Marie Dupont",
  },
  {
    id: "8",
    nom: "Fatima Doorgakant",
    email: "fatima@nhs-s2.mu",
    role: "client" as const,
    telephone: "+230 5890 1234",
    statut: "actif" as const,
    comptableAssigne: "Sophie Laurent",
  },
  {
    id: "9",
    nom: "Vikash Doobur",
    email: "vikash@tibok.mu",
    role: "client" as const,
    telephone: "+230 5901 2345",
    statut: "inactif" as const,
    comptableAssigne: "Marie Dupont",
  },
]

export default function UsersPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>("")

  const filteredComptables = mockComptables.filter(
    (u) =>
      u.nom.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const filteredClients = mockClients.filter(
    (u) =>
      u.nom.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Utilisateurs
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion des comptables et clients de la plateforme
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un utilisateur
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel utilisateur</DialogTitle>
              <DialogDescription>
                Renseignez les informations du nouvel utilisateur.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom complet</label>
                <Input placeholder="Ex: Marie Dupont" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" placeholder="Ex: marie@lexora.mu" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Téléphone</label>
                <Input placeholder="Ex: +230 5234 5678" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Rôle</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner un rôle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comptable">Comptable</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedRole === "client" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Comptable assigné
                  </label>
                  <Select>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner un comptable" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="marie">Marie Dupont</SelectItem>
                      <SelectItem value="jean">Jean Martin</SelectItem>
                      <SelectItem value="sophie">Sophie Laurent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                style={{ backgroundColor: "#C9A84C" }}
                onClick={() => setDialogOpen(false)}
              >
                Créer l&apos;utilisateur
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom ou email..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="comptables">
        <TabsList>
          <TabsTrigger value="comptables" className="gap-1.5">
            <UserCog className="h-4 w-4" />
            Comptables ({filteredComptables.length})
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5">
            <Users className="h-4 w-4" />
            Clients ({filteredClients.length})
          </TabsTrigger>
        </TabsList>

        {/* Comptables Tab */}
        <TabsContent value="comptables">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Comptables</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredComptables.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nom}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.telephone}</TableCell>
                      <TableCell>
                        <Badge
                          className="border-transparent"
                          style={{
                            backgroundColor: "#1E2A4A15",
                            color: "#1E2A4A",
                          }}
                        >
                          Comptable
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            u.statut === "actif"
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }
                        >
                          {u.statut === "actif" ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm">
                            <Ban className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredComptables.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Aucun comptable trouvé.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Comptable assigné</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.nom}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.telephone}</TableCell>
                      <TableCell>
                        <Badge
                          className="border-transparent"
                          style={{
                            backgroundColor: "#C9A84C20",
                            color: "#C9A84C",
                          }}
                        >
                          Client
                        </Badge>
                      </TableCell>
                      <TableCell>{u.comptableAssigne}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            u.statut === "actif"
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }
                        >
                          {u.statut === "actif" ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon-sm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm">
                            <Ban className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredClients.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Aucun client trouvé.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
