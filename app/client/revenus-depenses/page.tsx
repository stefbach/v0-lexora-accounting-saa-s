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
import { TrendingUp, TrendingDown, DollarSign, Calculator, Plus } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function formatMUR(amount: number) {
  return amount.toLocaleString("fr-FR") + " MUR"
}

interface RevenueItem {
  id: string
  date: string
  client: string
  description: string
  montant: number
}

interface ExpenseItem {
  id: string
  date: string
  fournisseur: string
  description: string
  montant: number
}

const initialRevenus: RevenueItem[] = []

const initialDepenses: ExpenseItem[] = []

export default function RevenusDepensesPage() {
  const { profile } = useProfile()
  const [revenus, setRevenus] = useState(initialRevenus)
  const [depenses, setDepenses] = useState(initialDepenses)

  const [revDialogOpen, setRevDialogOpen] = useState(false)
  const [depDialogOpen, setDepDialogOpen] = useState(false)

  const [newRevDate, setNewRevDate] = useState("")
  const [newRevClient, setNewRevClient] = useState("")
  const [newRevDesc, setNewRevDesc] = useState("")
  const [newRevMontant, setNewRevMontant] = useState("")

  const [newDepDate, setNewDepDate] = useState("")
  const [newDepFournisseur, setNewDepFournisseur] = useState("")
  const [newDepDesc, setNewDepDesc] = useState("")
  const [newDepMontant, setNewDepMontant] = useState("")

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

  const totalRevenus = revenus.reduce((sum, r) => sum + r.montant, 0)
  const totalDepenses = depenses.reduce((sum, d) => sum + d.montant, 0)
  const revenuNet = totalRevenus - totalDepenses
  const impotEstime = Math.round(revenuNet * 0.15)

  function handleAddRevenu() {
    if (!newRevDate || !newRevClient || !newRevMontant) return
    setRevenus([
      {
        id: String(revenus.length + 1),
        date: newRevDate,
        client: newRevClient,
        description: newRevDesc || "Non précisé",
        montant: Number(newRevMontant),
      },
      ...revenus,
    ])
    setNewRevDate("")
    setNewRevClient("")
    setNewRevDesc("")
    setNewRevMontant("")
    setRevDialogOpen(false)
  }

  function handleAddDepense() {
    if (!newDepDate || !newDepFournisseur || !newDepMontant) return
    setDepenses([
      {
        id: String(depenses.length + 1),
        date: newDepDate,
        fournisseur: newDepFournisseur,
        description: newDepDesc || "Non précisé",
        montant: Number(newDepMontant),
      },
      ...depenses,
    ])
    setNewDepDate("")
    setNewDepFournisseur("")
    setNewDepDesc("")
    setNewDepMontant("")
    setDepDialogOpen(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Revenus &amp; Dépenses
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivez ce que vous gagnez et ce que vous dépensez pour votre activité.
        </p>
      </div>

      {/* Revenus */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <CardTitle style={{ color: "#1E2A4A" }}>Revenus</CardTitle>
            </div>
            <Dialog open={revDialogOpen} onOpenChange={setRevDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" style={{ backgroundColor: "#22C55E", color: "white" }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle style={{ color: "#1E2A4A" }}>Ajouter un revenu</DialogTitle>
                  <DialogDescription>
                    Enregistrez un paiement que vous avez reçu.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="revDate">Date</Label>
                    <Input
                      id="revDate"
                      placeholder="Ex: 20/03/2026"
                      value={newRevDate}
                      onChange={(e) => setNewRevDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="revClient">Client</Label>
                    <Input
                      id="revClient"
                      placeholder="Nom du client"
                      value={newRevClient}
                      onChange={(e) => setNewRevClient(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="revDesc">Description</Label>
                    <Input
                      id="revDesc"
                      placeholder="Ex: Développement site web"
                      value={newRevDesc}
                      onChange={(e) => setNewRevDesc(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="revMontant">Montant (MUR)</Label>
                    <Input
                      id="revMontant"
                      type="number"
                      placeholder="Ex: 50000"
                      value={newRevMontant}
                      onChange={(e) => setNewRevMontant(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRevDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleAddRevenu} style={{ backgroundColor: "#22C55E", color: "white" }}>
                    Ajouter
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenus.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Aucun revenu enregistré. Cliquez sur &quot;Ajouter&quot; pour commencer.
                  </TableCell>
                </TableRow>
              ) : (
                revenus.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell className="font-medium">{row.client}</TableCell>
                    <TableCell className="text-muted-foreground">{row.description}</TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {formatMUR(row.montant)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dépenses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <CardTitle style={{ color: "#1E2A4A" }}>Dépenses</CardTitle>
            </div>
            <Dialog open={depDialogOpen} onOpenChange={setDepDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" style={{ borderColor: "#EF4444", color: "#EF4444" }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle style={{ color: "#1E2A4A" }}>Ajouter une dépense</DialogTitle>
                  <DialogDescription>
                    Enregistrez un achat ou un paiement que vous avez effectué.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="depDate">Date</Label>
                    <Input
                      id="depDate"
                      placeholder="Ex: 20/03/2026"
                      value={newDepDate}
                      onChange={(e) => setNewDepDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depFournisseur">Fournisseur</Label>
                    <Input
                      id="depFournisseur"
                      placeholder="Nom du fournisseur"
                      value={newDepFournisseur}
                      onChange={(e) => setNewDepFournisseur(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depDesc">Description</Label>
                    <Input
                      id="depDesc"
                      placeholder="Ex: Achat de matériel"
                      value={newDepDesc}
                      onChange={(e) => setNewDepDesc(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depMontant">Montant (MUR)</Label>
                    <Input
                      id="depMontant"
                      type="number"
                      placeholder="Ex: 10000"
                      value={newDepMontant}
                      onChange={(e) => setNewDepMontant(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDepDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleAddDepense} style={{ backgroundColor: "#EF4444", color: "white" }}>
                    Ajouter
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {depenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Aucune dépense enregistrée. Cliquez sur &quot;Ajouter&quot; pour commencer.
                  </TableCell>
                </TableRow>
              ) : (
                depenses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell className="font-medium">{row.fournisseur}</TableCell>
                    <TableCell className="text-muted-foreground">{row.description}</TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">
                      {formatMUR(row.montant)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total revenus
            </CardTitle>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatMUR(totalRevenus)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total dépenses
            </CardTitle>
            <TrendingDown className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatMUR(totalDepenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenu net
            </CardTitle>
            <DollarSign className="h-5 w-5" style={{ color: "#C9A84C" }} />
          </CardHeader>
          <CardContent>
            <div
              className="text-2xl font-bold"
              style={{ color: revenuNet >= 0 ? "#22C55E" : "#EF4444" }}
            >
              {formatMUR(revenuNet)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ce qu&apos;il vous reste après les dépenses
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impôt estimé (15%)
            </CardTitle>
            <Calculator className="h-5 w-5" style={{ color: "#1E2A4A" }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
              {formatMUR(impotEstime)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Estimation indicative
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
