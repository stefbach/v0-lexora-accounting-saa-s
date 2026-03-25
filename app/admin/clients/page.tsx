"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import {
  Plus,
  Search,
  Eye,
  Pencil,
  UserCog,
  Users,
  FileText,
} from "lucide-react"

const mockClients = [
  {
    id: "1",
    nom: "Raj Doobur",
    societe: "TIBOK Ltd",
    email: "raj@tibok.mu",
    comptableAssigne: "Marie Dupont",
    documents: 24,
    statutTvaMois: "declare" as const,
  },
  {
    id: "2",
    nom: "Nadia Jeetun",
    societe: "BPO Services Ltd",
    email: "nadia@bpo-services.mu",
    comptableAssigne: "Jean Martin",
    documents: 18,
    statutTvaMois: "declare" as const,
  },
  {
    id: "3",
    nom: "Olivier Masson",
    societe: "Obesity Care Malta",
    email: "olivier@obesitycare.mt",
    comptableAssigne: "Marie Dupont",
    documents: 9,
    statutTvaMois: "non_assujetti" as const,
  },
  {
    id: "4",
    nom: "Fatima Doorgakant",
    societe: "NHS S2 Corp",
    email: "fatima@nhs-s2.mu",
    comptableAssigne: "Sophie Laurent",
    documents: 31,
    statutTvaMois: "en_retard" as const,
  },
  {
    id: "5",
    nom: "Vikash Doobur",
    societe: "TIBOK Ltd",
    email: "vikash@tibok.mu",
    comptableAssigne: "Marie Dupont",
    documents: 14,
    statutTvaMois: "a_faire" as const,
  },
  {
    id: "6",
    nom: "Priya Doorgakant",
    societe: "NHS S2 Corp",
    email: "priya@nhs-s2.mu",
    comptableAssigne: "Sophie Laurent",
    documents: 22,
    statutTvaMois: "declare" as const,
  },
  {
    id: "7",
    nom: "Yannick Lafleur",
    societe: "BPO Services Ltd",
    email: "yannick@bpo-services.mu",
    comptableAssigne: "Jean Martin",
    documents: 6,
    statutTvaMois: "a_faire" as const,
  },
]

const statutTvaLabels: Record<string, string> = {
  declare: "Déclaré",
  a_faire: "À faire",
  en_retard: "En retard",
  non_assujetti: "Non assujetti",
}

const statutTvaStyles: Record<string, string> = {
  declare: "bg-emerald-100 text-emerald-700 border-emerald-200",
  a_faire: "bg-amber-100 text-amber-700 border-amber-200",
  en_retard: "bg-red-100 text-red-700 border-red-200",
  non_assujetti: "bg-gray-100 text-gray-600 border-gray-200",
}

export default function ClientsPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = mockClients.filter(
    (c) =>
      c.nom.toLowerCase().includes(search.toLowerCase()) ||
      c.societe.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.comptableAssigne.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Clients
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion de tous les clients de la plateforme
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau client</DialogTitle>
              <DialogDescription>
                Renseignez les informations du nouveau client.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom complet</label>
                <Input placeholder="Ex: Raj Doobur" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" placeholder="Ex: raj@tibok.mu" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Téléphone</label>
                <Input placeholder="Ex: +230 5678 9012" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Société</label>
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner une société" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tibok">TIBOK Ltd</SelectItem>
                    <SelectItem value="bpo">BPO Services Ltd</SelectItem>
                    <SelectItem value="obesity">Obesity Care Malta</SelectItem>
                    <SelectItem value="nhs">NHS S2 Corp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                style={{ backgroundColor: "#C9A84C" }}
                onClick={() => setDialogOpen(false)}
              >
                Créer le client
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" style={{ color: "#C9A84C" }} />
              <CardTitle style={{ color: "#1E2A4A" }}>
                Liste des clients
              </CardTitle>
            </div>
            <CardDescription>
              {filtered.length} client{filtered.length !== 1 ? "s" : ""} trouvé
              {filtered.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, société, email..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Société</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Comptable assigné</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Statut TVA du mois</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.nom}</TableCell>
                  <TableCell>{client.societe}</TableCell>
                  <TableCell>{client.email}</TableCell>
                  <TableCell>{client.comptableAssigne}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <FileText
                        className="h-3.5 w-3.5"
                        style={{ color: "#1E2A4A" }}
                      />
                      <span>{client.documents}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statutTvaStyles[client.statutTvaMois]}>
                      {statutTvaLabels[client.statutTvaMois]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Voir dashboard"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Réassigner comptable"
                        style={{ color: "#C9A84C" }}
                      >
                        <UserCog className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
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
    </div>
  )
}
