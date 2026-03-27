"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Users, Plus } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface TeamMember {
  id: string
  nom: string
  email: string
  poste: string
  acces: "admin" | "upload"
  statut: "actif" | "invite"
}

const mockTeam: TeamMember[] = [
  {
    id: "1",
    nom: "Raj Doobur",
    email: "raj@tibok.mu",
    poste: "Directeur général",
    acces: "admin",
    statut: "actif",
  },
  {
    id: "2",
    nom: "Nisha Doobur",
    email: "nisha@tibok.mu",
    poste: "Assistante administrative",
    acces: "upload",
    statut: "actif",
  },
]

function getAccessBadge(acces: string) {
  switch (acces) {
    case "admin":
      return (
        <Badge style={{ backgroundColor: "#1E2A4A", color: "white" }}>
          Admin
        </Badge>
      )
    case "upload":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          Envoi uniquement
        </Badge>
      )
    default:
      return <Badge variant="secondary">{acces}</Badge>
  }
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case "actif":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Actif</Badge>
    case "invite":
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Invité</Badge>
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

export default function EquipePage() {
  const { profile } = useProfile()
  const [team, setTeam] = useState(mockTeam)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newNom, setNewNom] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPoste, setNewPoste] = useState("")
  const [newAcces, setNewAcces] = useState<"admin" | "upload">("upload")

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Accès non autorisé
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour à l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  function handleAddMember() {
    if (!newNom || !newEmail) return
    const newMember: TeamMember = {
      id: String(team.length + 1),
      nom: newNom,
      email: newEmail,
      poste: newPoste || "Non précisé",
      acces: newAcces,
      statut: "invite",
    }
    setTeam([...team, newMember])
    setNewNom("")
    setNewEmail("")
    setNewPoste("")
    setNewAcces("upload")
    setDialogOpen(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Mon Équipe
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez les personnes qui ont accès à votre espace Lexora.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#C9A84C", color: "white" }}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un accès
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle style={{ color: "#1E2A4A" }}>Ajouter un membre</DialogTitle>
              <DialogDescription>
                Invitez une personne de votre entreprise à accéder à Lexora.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newNom">Nom complet</Label>
                <Input
                  id="newNom"
                  placeholder="Ex: Jean Dupont"
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEmail">Adresse email</Label>
                <Input
                  id="newEmail"
                  type="email"
                  placeholder="Ex: jean@tibok.mu"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPoste">Poste</Label>
                <Input
                  id="newPoste"
                  placeholder="Ex: Comptable interne"
                  value={newPoste}
                  onChange={(e) => setNewPoste(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type d&apos;accès</Label>
                <Select value={newAcces} onValueChange={(v) => setNewAcces(v as "admin" | "upload")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — accès complet</SelectItem>
                    <SelectItem value="upload">Envoi uniquement — peut seulement envoyer des documents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleAddMember}
                style={{ backgroundColor: "#C9A84C", color: "white" }}
              >
                Envoyer l&apos;invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            <CardTitle style={{ color: "#1E2A4A" }}>
              Membres ({team.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Poste</TableHead>
                <TableHead>Accès</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.nom}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>{member.poste}</TableCell>
                  <TableCell>{getAccessBadge(member.acces)}</TableCell>
                  <TableCell>{getStatutBadge(member.statut)}</TableCell>
                </TableRow>
              ))}
              {team.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Aucun membre dans l&apos;équipe.
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
