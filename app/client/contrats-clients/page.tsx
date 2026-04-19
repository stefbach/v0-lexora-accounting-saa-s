"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Plus, Search, Loader2, FileSignature, FileText, CheckCircle2,
  AlertCircle, CalendarClock, Eye, Pencil,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ClientKpi } from "@/components/client/ClientKit"

const FONT = "'Poppins', sans-serif"

type Statut =
  | "brouillon"
  | "a_valider"
  | "en_revision"
  | "valide"
  | "actif"
  | "envoye"
  | "signe"
  | "termine"
  | "archive"
  | "resilie"
  | "annule"

interface Contrat {
  id: string
  reference: string | null
  titre: string
  type_contrat: string
  statut: Statut
  date_debut: string | null
  date_fin: string | null
  montant: number | null
  montant_total: number | null
  devise: string | null
  frequence_facturation: string | null
  action_renouvellement: string | null
  description: string | null
  societe_id: string | null
  client_id: string | null
  created_at: string
  client?: { id: string; full_name: string | null; email: string | null } | null
  societe?: { id: string; nom: string | null } | null
}

const STATUT_META: Record<string, { label: string; color: string }> = {
  brouillon:    { label: "Brouillon",   color: "bg-gray-100 text-gray-700 border-gray-300" },
  a_valider:    { label: "À valider",   color: "bg-amber-100 text-amber-800 border-amber-300" },
  en_revision:  { label: "En révision", color: "bg-amber-100 text-amber-800 border-amber-300" },
  valide:       { label: "Validé",      color: "bg-blue-100 text-blue-800 border-blue-300" },
  actif:        { label: "Actif",       color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  envoye:       { label: "Envoyé",      color: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  signe:        { label: "Signé",       color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  termine:      { label: "Terminé",     color: "bg-slate-100 text-slate-700 border-slate-300" },
  archive:      { label: "Archivé",     color: "bg-slate-100 text-slate-700 border-slate-300" },
  resilie:      { label: "Résilié",     color: "bg-rose-100 text-rose-800 border-rose-300" },
  annule:       { label: "Annulé",      color: "bg-rose-100 text-rose-800 border-rose-300" },
}

const TYPES_LABEL: Record<string, string> = {
  lettre_mission: "Lettre de mission",
  convention_honoraires: "Convention d'honoraires",
  prestation_service: "Prestation de service",
  nda: "NDA",
  mandat: "Mandat",
  cdi_prestataire: "CDI prestataire",
  saas_abonnement: "SaaS abonnement",
  maintenance: "Maintenance",
  consulting: "Consulting",
  autre: "Autre",
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try { return new Date(iso).toLocaleDateString("fr-FR") } catch { return iso }
}

function fmtMontant(m: number | null, devise: string | null): string {
  if (m === null || m === undefined) return "—"
  return `${Number(m).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${devise || "MUR"}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return null
  return Math.ceil((d - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function ContratsClientsPage() {
  const router = useRouter()
  const [contrats, setContrats] = useState<Contrat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatut, setFilterStatut] = useState<string>("all")
  const [detail, setDetail] = useState<Contrat | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("limit", "100")
      if (filterStatut !== "all") params.set("statut", filterStatut)
      if (search.trim()) params.set("q", search.trim())
      const res = await fetch(`/api/contrats?${params.toString()}`)
      const json = (await res.json()) as { data?: Contrat[]; error?: string }
      if (!res.ok) throw new Error(json.error || "Erreur de chargement")
      setContrats(json.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }, [filterStatut, search])

  useEffect(() => { load() }, [load])

  const kpis = useMemo(() => {
    const total = contrats.length
    const actifs = contrats.filter(c => c.statut === "actif" || c.statut === "signe").length
    const brouillons = contrats.filter(c => c.statut === "brouillon").length
    const echeances = contrats.filter(c => {
      const d = daysUntil(c.date_fin)
      return d !== null && d >= 0 && d <= 30
    }).length
    return { total, actifs, brouillons, echeances }
  }, [contrats])

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Contrats Clients" },
      ]}
      kicker={kpis.total > 0 ? `${kpis.total} contrat${kpis.total > 1 ? "s" : ""}` : "Aucun contrat"}
      title="Contrats Clients"
      subtitle="Rédigez, suivez et renouvelez vos contrats clients — lettres de mission, conventions, NDA, prestations, maintenance."
      actions={
        <Button
          onClick={() => router.push("/client/contrats-clients/nouveau")}
          style={{
            background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
            color: "#0B0F2E",
            fontWeight: 700,
            borderRadius: "10px",
            border: "none",
            boxShadow: "0 10px 24px -8px rgba(212,175,55,0.55)",
            fontFamily: FONT,
          }}
        >
          <Plus className="w-4 h-4 mr-2" />Nouveau contrat
        </Button>
      }
    >
      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginBottom: "22px",
        }}
      >
        <ClientKpi label="Total contrats" value={kpis.total} icon={FileSignature} accent="blue" />
        <ClientKpi label="Actifs" value={kpis.actifs} icon={CheckCircle2} accent="green" />
        <ClientKpi label="Brouillons" value={kpis.brouillons} icon={FileText} accent="gold" />
        <ClientKpi label="Échéances à 30j" value={kpis.echeances} icon={CalendarClock} accent="orange" />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Rechercher par titre ou référence…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="brouillon">Brouillon</SelectItem>
            <SelectItem value="a_valider">À valider</SelectItem>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="signe">Signé</SelectItem>
            <SelectItem value="termine">Terminé</SelectItem>
            <SelectItem value="resilie">Résilié</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-6 text-rose-700">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          ) : contrats.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              Aucun contrat pour l&apos;instant.
              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={() => router.push("/client/contrats-clients/nouveau")}
                >
                  <Plus className="w-4 h-4 mr-2" />Créer le premier contrat
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Renouv.</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contrats.map(c => {
                  const meta = STATUT_META[c.statut] || STATUT_META.brouillon
                  const montant = c.montant ?? c.montant_total
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setDetail(c)}
                    >
                      <TableCell className="font-semibold text-slate-800">
                        <div>{c.titre}</div>
                        {c.reference && (
                          <div className="text-xs text-slate-500">{c.reference}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {c.client?.full_name || c.societe?.nom || "—"}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {TYPES_LABEL[c.type_contrat] || c.type_contrat}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.color}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{fmtDate(c.date_debut)}</TableCell>
                      <TableCell>{fmtDate(c.date_fin)}</TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMontant(montant, c.devise)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600">
                          {c.action_renouvellement || "aucun"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetail(c)}
                          aria-label="Voir le détail"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Link href={`/client/contrats-clients/${c.id}`}>
                          <Button variant="ghost" size="sm" aria-label="Ouvrir la fiche">
                            <Pencil className="w-4 h-4" />
                          </Button>
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

      {/* Dialog détail (lecture seule) */}
      <Dialog open={!!detail} onOpenChange={o => { if (!o) setDetail(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: FONT }}>
              {detail?.titre || "Contrat"}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 pt-2 text-sm">
              <Info label="Référence" value={detail.reference || "—"} />
              <Info
                label="Statut"
                value={
                  <Badge variant="outline" className={STATUT_META[detail.statut]?.color || ""}>
                    {STATUT_META[detail.statut]?.label || detail.statut}
                  </Badge>
                }
              />
              <Info label="Type" value={TYPES_LABEL[detail.type_contrat] || detail.type_contrat} />
              <Info label="Client" value={detail.client?.full_name || "—"} />
              <Info label="Société" value={detail.societe?.nom || "—"} />
              <div className="grid grid-cols-2 gap-3">
                <Info label="Début" value={fmtDate(detail.date_debut)} />
                <Info label="Fin" value={fmtDate(detail.date_fin)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Info
                  label="Montant"
                  value={fmtMontant(detail.montant ?? detail.montant_total, detail.devise)}
                />
                <Info
                  label="Fréquence"
                  value={detail.frequence_facturation || "ponctuel"}
                />
              </div>
              <Info label="Renouvellement" value={detail.action_renouvellement || "aucun"} />
              {detail.description && (
                <Info label="Description" value={detail.description} />
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>
            {detail && (
              <Button onClick={() => router.push(`/client/contrats-clients/${detail.id}`)}>
                <Pencil className="w-4 h-4 mr-2" />Modifier
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-36 text-xs uppercase tracking-wide text-slate-500 pt-0.5">
        {label}
      </div>
      <div className="flex-1 text-slate-800">{value}</div>
    </div>
  )
}
