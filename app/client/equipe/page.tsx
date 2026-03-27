"use client"

import { useState, useEffect, useCallback } from "react"
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
import { Users, Plus, Loader2 } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface TeamMember {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
}

function getRoleBadge(role: string) {
  switch (role) {
    case "client_admin":
      return (
        <Badge style={{ backgroundColor: "#1E2A4A", color: "white" }}>
          Admin
        </Badge>
      )
    case "client_user":
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
          Utilisateur
        </Badge>
      )
    default:
      return <Badge variant="secondary">{role}</Badge>
  }
}

export default function EquipePage() {
  const { profile, loading: profileLoading } = useProfile()
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Form fields
  const [newNom, setNewNom] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newPhone, setNewPhone] = useState("")

  // Track the societe IDs of the current user
  const [mySocieteIds, setMySocieteIds] = useState<string[]>([])

  const fetchTeam = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      // Get all dossiers to find the current user's societes
      const dossiersRes = await fetch("/api/admin/dossiers")
      const dossiersData = await dossiersRes.json()
      const dossiers = dossiersData.dossiers || []

      // Find societes linked to the current user
      const myDossiers = dossiers.filter((d: any) => d.client_id === profile.id)
      const societeIds = [...new Set(myDossiers.map((d: any) => d.societe_id))] as string[]
      setMySocieteIds(societeIds)

      if (societeIds.length === 0) {
        setTeam([])
        setLoading(false)
        return
      }

      // Find all users who share the same societes
      const sharedDossiers = dossiers.filter(
        (d: any) => societeIds.includes(d.societe_id) && d.client_id !== profile.id
      )
      const teamUserIds = [...new Set(sharedDossiers.map((d: any) => d.client_id))] as string[]

      if (teamUserIds.length === 0) {
        setTeam([])
        setLoading(false)
        return
      }

      // Get user profiles
      const usersRes = await fetch("/api/admin/users")
      const usersData = await usersRes.json()
      const allUsers = usersData.users || []

      const teamMembers = allUsers
        .filter((u: any) => teamUserIds.includes(u.id))
        .map((u: any) => ({
          id: u.id,
          full_name: u.full_name || u.email,
          email: u.email,
          role: u.role,
          created_at: u.created_at,
        }))

      setTeam(teamMembers)
    } catch {
      console.error("Failed to fetch team")
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    if (profile) fetchTeam()
  }, [profile, fetchTeam])

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Acces non autorise
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acceder a cette page.
        </p>
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour a l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  async function handleAddMember() {
    if (!newNom || !newEmail || !newPassword) return
    if (newPassword.length < 6) {
      setSubmitError("Le mot de passe doit contenir au moins 6 caracteres.")
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      // 1. Create user via /api/admin/users with role=client_user
      const createRes = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          full_name: newNom,
          role: "client_user",
          phone: newPhone || null,
        }),
      })

      const createData = await createRes.json()
      if (!createRes.ok) {
        setSubmitError(createData.error || "Erreur lors de la creation du compte.")
        setSubmitting(false)
        return
      }

      const newUserId = createData.user?.id
      if (!newUserId) {
        setSubmitError("Erreur: ID utilisateur non retourne.")
        setSubmitting(false)
        return
      }

      // 2. Link the new user to the same societes via /api/admin/dossiers
      for (const societeId of mySocieteIds) {
        await fetch("/api/admin/dossiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: newUserId,
            societe_id: societeId,
          }),
        })
      }

      // Reset form and refresh team list
      setNewNom("")
      setNewEmail("")
      setNewPassword("")
      setNewPhone("")
      setDialogOpen(false)
      fetchTeam()
    } catch {
      setSubmitError("Erreur de connexion.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Mon Equipe
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerez les personnes qui ont acces a votre espace Lexora.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setSubmitError(null) }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#C9A84C", color: "white" }}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter un membre
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle style={{ color: "#1E2A4A" }}>Ajouter un membre</DialogTitle>
              <DialogDescription>
                Creez un compte pour un membre de votre entreprise.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newNom">Nom complet *</Label>
                <Input
                  id="newNom"
                  placeholder="Ex: Jean Dupont"
                  value={newNom}
                  onChange={(e) => setNewNom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newEmail">Adresse email *</Label>
                <Input
                  id="newEmail"
                  type="email"
                  placeholder="Ex: jean@tibok.mu"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Mot de passe * (min 6 caracteres)</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="Mot de passe"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPhone">Telephone</Label>
                <Input
                  id="newPhone"
                  type="tel"
                  placeholder="Ex: +230 5XXX XXXX"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              {submitError && (
                <p className="text-sm text-red-600">{submitError}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={submitting || !newNom || !newEmail || !newPassword}
                style={{ backgroundColor: "#C9A84C", color: "white" }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Creer le compte
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
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#C9A84C" }} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Date d&apos;ajout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.created_at
                        ? new Date(member.created_at).toLocaleDateString("fr-FR")
                        : "--"}
                    </TableCell>
                  </TableRow>
                ))}
                {team.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Aucun membre dans l&apos;equipe. Cliquez sur &quot;Ajouter un membre&quot; pour creer un compte.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
