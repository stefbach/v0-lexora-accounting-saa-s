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
import { Plus, Search, Pencil, Trash2, Building2 } from "lucide-react"

const mockSocietes = [
  {
    id: "1",
    nom: "TIBOK Ltd",
    brn: "C12345678",
    numeroTvaMra: "VAT-20230001",
    statutTva: true,
    comptable: "Marie Dupont",
  },
  {
    id: "2",
    nom: "BPO Services Ltd",
    brn: "C23456789",
    numeroTvaMra: "VAT-20230002",
    statutTva: true,
    comptable: "Jean Martin",
  },
  {
    id: "3",
    nom: "Obesity Care Malta",
    brn: "C34567890",
    numeroTvaMra: "—",
    statutTva: false,
    comptable: "Marie Dupont",
  },
  {
    id: "4",
    nom: "NHS S2 Corp",
    brn: "C45678901",
    numeroTvaMra: "VAT-20230004",
    statutTva: true,
    comptable: "Sophie Laurent",
  },
]

export default function SocietesPage() {
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = mockSocietes.filter(
    (s) =>
      s.nom.toLowerCase().includes(search.toLowerCase()) ||
      s.brn.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Sociétés
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestion des sociétés enregistrées sur la plateforme
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une société
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle société</DialogTitle>
              <DialogDescription>
                Renseignez les informations de la société à ajouter.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nom de la société</label>
                <Input placeholder="Ex: TIBOK Ltd" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">BRN</label>
                <Input placeholder="Ex: C12345678" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">N° TVA MRA</label>
                <Input placeholder="Ex: VAT-20230001" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Statut TVA</label>
                <Select>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner le statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Comptable assigné</label>
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
                Créer la société
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search & Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" style={{ color: "#C9A84C" }} />
              <CardTitle style={{ color: "#1E2A4A" }}>
                Liste des sociétés
              </CardTitle>
            </div>
            <CardDescription>{filtered.length} société(s) trouvée(s)</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom ou BRN..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>BRN</TableHead>
                <TableHead>N° TVA MRA</TableHead>
                <TableHead>Statut TVA</TableHead>
                <TableHead>Comptable assigné</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.nom}</TableCell>
                  <TableCell className="font-mono text-sm">{s.brn}</TableCell>
                  <TableCell>{s.numeroTvaMra}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        s.statutTva
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }
                    >
                      {s.statutTva ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.comptable}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm">
                        <Pencil className="h-4 w-4" />
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucune société trouvée.
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
