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
  Mail,
  Phone,
  Users,
  Eye,
  UserPlus,
  Briefcase,
} from "lucide-react"

const mockComptables = [
  {
    id: "1",
    nom: "Marie Dupont",
    email: "marie.dupont@lexora.mu",
    telephone: "+230 5234 5678",
    specialite: "TVA & Fiscalité",
    clientsAssignes: 12,
    statut: "actif" as const,
    societes: ["TIBOK Ltd", "Obesity Care Malta"],
  },
  {
    id: "2",
    nom: "Jean Martin",
    email: "jean.martin@lexora.mu",
    telephone: "+230 5345 6789",
    specialite: "Comptabilité générale",
    clientsAssignes: 8,
    statut: "actif" as const,
    societes: ["BPO Services Ltd"],
  },
  {
    id: "3",
    nom: "Sophie Laurent",
    email: "sophie.laurent@lexora.mu",
    telephone: "+230 5456 7890",
    specialite: "Charges sociales & Paie",
    clientsAssignes: 15,
    statut: "actif" as const,
    societes: ["NHS S2 Corp"],
  },
  {
    id: "4",
    nom: "Pierre Rochefort",
    email: "pierre.rochefort@lexora.mu",
    telephone: "+230 5567 8901",
    specialite: "Audit & Révision",
    clientsAssignes: 0,
    statut: "inactif" as const,
    societes: [],
  },
  {
    id: "5",
    nom: "Asha Doorgakant",
    email: "asha.doorgakant@lexora.mu",
    telephone: "+230 5678 9012",
    specialite: "TVA & Fiscalité",
    clientsAssignes: 7,
    statut: "actif" as const,
    societes: ["TIBOK Ltd", "BPO Services Ltd"],
  },
]

export default function ComptablesPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = mockComptables.filter(
    (c) =>
      c.nom.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.specialite.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Comptables
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion de l&apos;équipe comptable Lexora
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un comptable
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau comptable</DialogTitle>
              <DialogDescription>
                Renseignez les informations du nouveau comptable.
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
                <label className="text-sm font-medium">Spécialité</label>
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner une spécialité" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tva">TVA &amp; Fiscalité</SelectItem>
                    <SelectItem value="comptabilite">Comptabilité générale</SelectItem>
                    <SelectItem value="charges">Charges sociales &amp; Paie</SelectItem>
                    <SelectItem value="audit">Audit &amp; Révision</SelectItem>
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
                Créer le comptable
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom, email ou spécialité..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((comptable) => (
          <Card key={comptable.id} className="relative overflow-hidden">
            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{
                backgroundColor:
                  comptable.statut === "actif" ? "#C9A84C" : "#9ca3af",
              }}
            />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white font-semibold text-sm"
                    style={{ backgroundColor: "#1E2A4A" }}
                  >
                    {comptable.nom
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <CardTitle className="text-base">
                      {comptable.nom}
                    </CardTitle>
                    <CardDescription className="mt-0.5">
                      {comptable.specialite}
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  className={
                    comptable.statut === "actif"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }
                >
                  {comptable.statut === "actif" ? "Actif" : "Inactif"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span>{comptable.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{comptable.telephone}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {comptable.clientsAssignes} client
                    {comptable.clientsAssignes !== 1 ? "s" : ""} assigné
                    {comptable.clientsAssignes !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5" />
                  <span>
                    {comptable.societes.length > 0
                      ? comptable.societes.join(", ")
                      : "Aucune société"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Voir profil
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  style={{ borderColor: "#C9A84C", color: "#C9A84C" }}
                >
                  <UserPlus className="mr-1 h-3.5 w-3.5" />
                  Assigner clients
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          Aucun comptable trouvé pour cette recherche.
        </div>
      )}
    </div>
  )
}
