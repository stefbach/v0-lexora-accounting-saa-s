"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Plus, Search, Loader2, Building2 } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

interface Societe {
  id: string
  nom: string
  brn: string | null
  numero_tva_mra: string | null
  statut_tva: boolean
  comptable?: { id: string; full_name: string; email: string } | null
}

export default function ClientSocietesPage() {
  const [search, setSearch] = useState("")
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form
  const [formNom, setFormNom] = useState("")
  const [formBrn, setFormBrn] = useState("")
  const [formTva, setFormTva] = useState("")
  const [formStatutTva, setFormStatutTva] = useState("true")

  const fetchSocietes = useCallback(async () => {
    try {
      const res = await fetch("/api/client/societes")
      const data = await res.json()
      if (data.societes) setSocietes(data.societes)
    } catch {
      console.error("Failed to fetch societes")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSocietes() }, [fetchSocietes])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  if (profile?.role === "client_user") {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Vous n&apos;avez pas accès à cette section.</p>
            <Button variant="outline" asChild><Link href="/client">Retour au tableau de bord</Link></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const filtered = societes.filter(
    (s) =>
      s.nom.toLowerCase().includes(search.toLowerCase()) ||
      (s.brn && s.brn.toLowerCase().includes(search.toLowerCase()))
  )

  const resetForm = () => {
    setFormNom(""); setFormBrn(""); setFormTva(""); setFormStatutTva("true"); setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    if (!formNom) { setError("Le nom de la société est requis."); return }

    setCreating(true)
    try {
      // Create the société
      const res = await fetch("/api/admin/societes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: formNom,
          brn: formBrn || null,
          numero_tva_mra: formTva || null,
          statut_tva: formStatutTva === "true",
          comptable_id: null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Erreur lors de la création"); return }

      const newSocieteId = data.societe?.id

      // Create a dossier to link this client to the new société
      if (newSocieteId && profile?.id) {
        await fetch("/api/admin/dossiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: profile.id,
            societe_id: newSocieteId,
            comptable_id: profile.id, // temporary — comptable will be assigned later
          }),
        })
      }

      setSuccess(`Société ${formNom} créée et affiliée avec succès !`)
      resetForm(); setDialogOpen(false); fetchSocietes()
    } catch {
      setError("Erreur de connexion au serveur")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Mes Sociétés</h1>
          <p className="text-muted-foreground">Sociétés affiliées à votre compte</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm() }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#1E2A4A" }}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une société
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle société</DialogTitle>
              <DialogDescription>Créez une société et affiliez-la à votre compte.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom de la société *</Label>
                <Input placeholder="Ex: Ma Société Ltd" value={formNom} onChange={(e) => setFormNom(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>BRN</Label>
                  <Input placeholder="Ex: C12345678" value={formBrn} onChange={(e) => setFormBrn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>N° TVA MRA</Label>
                  <Input placeholder="Ex: VAT-20230001" value={formTva} onChange={(e) => setFormTva(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Statut TVA</Label>
                <Select value={formStatutTva} onValueChange={setFormStatutTva}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Assujetti à la TVA</SelectItem>
                    <SelectItem value="false">Non assujetti</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>Annuler</Button>
              <Button style={{ backgroundColor: "#C9A84C" }} onClick={handleCreate} disabled={creating}>
                {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Création...</> : "Créer la société"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {success && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher par nom ou BRN..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">Aucune société affiliée</h2>
            <p className="text-muted-foreground">Créez une société pour commencer.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle style={{ color: "#1E2A4A" }}>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Mes Sociétés ({filtered.length})
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>BRN</TableHead>
                  <TableHead>N° TVA MRA</TableHead>
                  <TableHead>Statut TVA</TableHead>
                  <TableHead>Comptable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((societe) => (
                  <TableRow key={societe.id}>
                    <TableCell className="font-medium">{societe.nom}</TableCell>
                    <TableCell>{societe.brn || "—"}</TableCell>
                    <TableCell>{societe.numero_tva_mra || "—"}</TableCell>
                    <TableCell>
                      <Badge className={societe.statut_tva ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                        {societe.statut_tva ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {societe.comptable ? (
                        <span>{societe.comptable.full_name}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Non assigné</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
