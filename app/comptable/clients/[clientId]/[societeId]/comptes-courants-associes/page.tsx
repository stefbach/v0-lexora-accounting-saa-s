"use client"

/**
 * Comptes Courants Associés — vue comptable (liste)
 *
 * - KPIs : nb CCA actifs, solde crediteur, solde debiteur, alertes legales
 * - Tableau CCA avec filtres + bouton detail
 * - Dialogs : creer CCA, nouveau mouvement
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft, ArrowDownLeft, ArrowUpRight, AlertTriangle, Loader2,
  Plus, RefreshCw, Users, Wallet,
} from "lucide-react"
import { MouvementDialog } from "@/components/cca/MouvementDialog"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d: string | null | undefined) {
  if (!d) return "--"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

type Cca = {
  id: string
  societe_id: string
  nom: string
  type: string
  solde: number | string | null
  dernier_mouvement: string | null
  nb_mouvements: number
  updated_at: string | null
}

type Mouvement = {
  id: string
  compte_courant_id: string
  date_mouvement: string
  type: string
  montant: number | string
  description: string | null
}

type LegalAlert = {
  compte_id: string
  nom: string
  solde: number
  message: string
}

type ApiResponse = {
  comptes: Cca[]
  mouvements: Mouvement[]
  kpis: {
    nb_ccas_actifs: number
    total_crediteur: number
    total_debiteur: number
    total_solde: number
    nb_alertes: number
  }
  legal_alerts: LegalAlert[]
}

export default function ComptesCourantsAssociesPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Filtres
  const [filterAssocie, setFilterAssocie] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterPeriodeFrom, setFilterPeriodeFrom] = useState<string>("")
  const [filterPeriodeTo, setFilterPeriodeTo] = useState<string>("")

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [formNom, setFormNom] = useState("")
  const [formType, setFormType] = useState("associe")

  const [mvOpen, setMvOpen] = useState(false)

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/comptable/cca?societe_id=${societeId}`)
      const json = (await res.json()) as ApiResponse | { error: string }
      if (!res.ok) {
        setError("error" in json ? json.error : "Erreur chargement")
        return
      }
      setData(json as ApiResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const createCca = async () => {
    if (!formNom) return
    setSaving(true)
    try {
      const res = await fetch("/api/comptable/cca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer_compte",
          societe_id: societeId,
          nom: formNom,
          type: formType,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? "Erreur création")
        return
      }
      setCreateOpen(false)
      setFormNom("")
      setFormType("associe")
      await load()
    } finally {
      setSaving(false)
    }
  }

  const submitMouvement = async (payload: {
    cca_id: string
    type: "avance" | "remboursement"
    montant: number
    date_mouvement: string
    description: string
    facture_id: string | null
  }) => {
    setSaving(true)
    try {
      const res = await fetch("/api/comptable/cca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: payload.type,
          societe_id: societeId,
          compte_courant_id: payload.cca_id,
          montant: payload.montant,
          date_mouvement: payload.date_mouvement,
          description: payload.description,
          facture_id: payload.facture_id,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? "Erreur enregistrement")
        return
      }
      setMvOpen(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const comptes = data?.comptes ?? []
  const mouvements = data?.mouvements ?? []

  const ccaOptions = useMemo(
    () => comptes.map((c) => ({ id: c.id, nom: c.nom, type: c.type })),
    [comptes],
  )

  const filteredComptes = useMemo(() => {
    return comptes.filter((c) => {
      if (filterAssocie !== "all" && c.id !== filterAssocie) return false
      return true
    })
  }, [comptes, filterAssocie])

  // Filter mouvements for the "Derniers mouvements" table
  const filteredMouvements = useMemo(() => {
    return mouvements.filter((m) => {
      if (filterAssocie !== "all" && m.compte_courant_id !== filterAssocie) return false
      if (filterType !== "all" && m.type !== filterType) return false
      if (filterPeriodeFrom && (m.date_mouvement || "") < filterPeriodeFrom) return false
      if (filterPeriodeTo && (m.date_mouvement || "") > filterPeriodeTo) return false
      return true
    })
  }, [mouvements, filterAssocie, filterType, filterPeriodeFrom, filterPeriodeTo])

  const kpis = data?.kpis
  const legalAlerts = data?.legal_alerts ?? []

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#F4F6FB" }}>
      {/* Header + breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href={`/comptable/clients/${clientId}/${societeId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Retour
          </Button>
        </Link>
        <div className="flex-1">
          <div className="text-xs text-gray-500">
            Comptabilité / Clients / {clientId} / {societeId}
          </div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Comptes Courants Associés
          </h1>
          <p className="text-sm text-gray-500">
            Suivi des avances et remboursements entre la société et ses dirigeants / associés.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-1" /> Actualiser
        </Button>
        <Button
          size="sm"
          style={{ background: GOLD, color: NAVY }}
          onClick={() => setMvOpen(true)}
          disabled={comptes.length === 0}
        >
          <ArrowUpRight className="w-4 h-4 mr-1" /> Nouveau mouvement
        </Button>
        <Button size="sm" style={{ background: NAVY, color: "white" }} onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nouveau CCA
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Alertes légales */}
      {legalAlerts.length > 0 && (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-800 mb-1">
                Alertes légales — Companies Act Mauritius
              </div>
              <ul className="text-sm text-amber-900 space-y-1">
                {legalAlerts.map((a) => (
                  <li key={a.compte_id}>{a.message}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8" style={{ color: NAVY }} />
            <div>
              <p className="text-xs text-gray-500">CCA actifs</p>
              <p className="text-xl font-bold" style={{ color: NAVY }}>
                {kpis?.nb_ccas_actifs ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-xs text-gray-500">Solde créditeur total</p>
              <p className="text-xl font-bold text-green-700">
                {fmt(Number(kpis?.total_crediteur ?? 0))} MUR
              </p>
              <p className="text-[10px] text-gray-400">Société doit aux associés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-xs text-gray-500">Solde débiteur total</p>
              <p className="text-xl font-bold text-orange-700">
                {fmt(Math.abs(Number(kpis?.total_debiteur ?? 0)))} MUR
              </p>
              <p className="text-[10px] text-gray-400">Associés doivent à la société</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-xs text-gray-500">Alertes légales</p>
              <p className="text-xl font-bold text-amber-700">
                {kpis?.nb_alertes ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Associé</Label>
            <Select value={filterAssocie} onValueChange={setFilterAssocie}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {comptes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type mouvement</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="avance">Avance</SelectItem>
                <SelectItem value="remboursement">Remboursement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Du</Label>
            <Input type="date" value={filterPeriodeFrom} onChange={(e) => setFilterPeriodeFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Au</Label>
            <Input type="date" value={filterPeriodeTo} onChange={(e) => setFilterPeriodeTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Table des CCA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: NAVY }}>
            Liste des comptes courants ({filteredComptes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} />
            </div>
          ) : filteredComptes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Aucun compte courant. Créez-en un pour commencer.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Associé / Dirigeant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Solde courant (MUR)</TableHead>
                  <TableHead>Dernier mouvement</TableHead>
                  <TableHead className="text-right">Nb mouvements</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredComptes.map((c) => {
                  const solde = Number(c.solde ?? 0)
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nom}</TableCell>
                      <TableCell>
                        <Badge className={
                          c.type === "associe"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700"
                        }>
                          {c.type === "associe" ? "Associé (455)" : "Collaborateur (467)"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {solde > 0 ? (
                          <span className="text-green-700">+{fmt(solde)}</span>
                        ) : solde < 0 ? (
                          <span className="text-orange-700">{fmt(solde)}</span>
                        ) : (
                          <span className="text-gray-400">0,00</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(c.dernier_mouvement)}</TableCell>
                      <TableCell className="text-right text-sm">{c.nb_mouvements}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/comptable/clients/${clientId}/${societeId}/comptes-courants-associes/${c.id}`}
                        >
                          <Button variant="outline" size="sm">Détail</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Derniers mouvements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: NAVY }}>
            Derniers mouvements ({filteredMouvements.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {filteredMouvements.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              Aucun mouvement pour ces filtres.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Associé</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Montant (MUR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMouvements.slice(0, 30).map((m) => {
                  const cca = comptes.find((c) => c.id === m.compte_courant_id)
                  const montant = Number(m.montant ?? 0)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{formatDate(m.date_mouvement)}</TableCell>
                      <TableCell className="font-medium">{cca?.nom ?? "--"}</TableCell>
                      <TableCell>
                        <Badge className={
                          m.type === "avance"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-green-100 text-green-700"
                        }>
                          {m.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">
                        {m.description ?? "--"}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        <span className={montant >= 0 ? "text-orange-700" : "text-green-700"}>
                          {montant >= 0 ? "+" : ""}{fmt(montant)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog : créer CCA */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau Compte Courant Associé</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Nom *</Label>
              <Input
                value={formNom}
                onChange={(e) => setFormNom(e.target.value)}
                placeholder="Nom du dirigeant / associé"
              />
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="associe">Associé / Dirigeant (compte 455)</SelectItem>
                  <SelectItem value="collaborateur">Collaborateur (compte 467)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={createCca} disabled={saving || !formNom} className="bg-[#0B0F2E]">
              {saving ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : mouvement */}
      <MouvementDialog
        open={mvOpen}
        onOpenChange={setMvOpen}
        ccas={ccaOptions}
        saving={saving}
        onSubmit={submitMouvement}
      />
    </div>
  )
}
