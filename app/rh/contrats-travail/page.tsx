"use client"

/**
 * RH — Liste des contrats de travail
 *
 * Page d'accueil du module "Contrats Travail" côté RH.
 * Consomme l'endpoint GET /api/rh/contrats (multi-tenant : filtre par
 * societe_id côté serveur) et expose :
 *  - KPIs (total, CDI, CDD/autres, en signature, expirant < 30 j)
 *  - Filtres (type, statut, recherche employé)
 *  - Table cliquable vers le détail
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Search, FileText, FileWarning, FileCheck2, Clock } from "lucide-react"

// ── Types (pas de `any` nouveau) ────────────────────────────────────────────
type Employe = {
  id: string
  prenom: string | null
  nom: string | null
  poste?: string | null
  email?: string | null
  societe_id?: string | null
  societe?: { id: string; nom: string } | null
}

type Contrat = {
  id: string
  employe_id: string | null
  societe_id: string | null
  type_contrat: string
  secteur: string | null
  date_debut: string
  date_fin: string | null
  salaire_brut: number | null
  poste: string | null
  statut: string
  created_at: string
  updated_at?: string | null
  employe?: Employe | null
}

type Societe = { id: string; nom: string }

// ── Constantes ──────────────────────────────────────────────────────────────
const TYPES: { value: string; label: string }[] = [
  { value: "all",          label: "Tous les types" },
  { value: "CDI",          label: "CDI" },
  { value: "CDD",          label: "CDD" },
  { value: "Temps_partiel",label: "Temps partiel" },
  { value: "Consultant",   label: "Prestation / Consultant" },
  { value: "Stage",        label: "Stage" },
  { value: "Saisonnier",   label: "Intérim / Saisonnier" },
]

const STATUTS: { value: string; label: string }[] = [
  { value: "all",           label: "Tous les statuts" },
  { value: "brouillon",     label: "Brouillon" },
  { value: "signe_employe", label: "En signature" },
  { value: "signe",         label: "Signé" },
  { value: "expire",        label: "Expiré / Terminé" },
  { value: "resilie",       label: "Résilié" },
]

const STATUT_CLASS: Record<string, string> = {
  brouillon:     "bg-gray-100 text-gray-700 border-gray-200",
  signe_employe: "bg-blue-100 text-blue-700 border-blue-200",
  signe:         "bg-emerald-100 text-emerald-700 border-emerald-200",
  expire:        "bg-amber-100 text-amber-700 border-amber-200",
  resilie:       "bg-red-100 text-red-700 border-red-200",
}

const STATUT_LABEL: Record<string, string> = {
  brouillon:     "Brouillon",
  signe_employe: "En signature",
  signe:         "Signé",
  expire:        "Terminé",
  resilie:       "Résilié",
}

function StatutBadge({ statut }: { statut: string }) {
  const cls = STATUT_CLASS[statut] ?? "bg-gray-100 text-gray-600 border-gray-200"
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {STATUT_LABEL[statut] ?? statut}
    </span>
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
  } catch {
    return iso
  }
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24))
}

// ── KPI tile ────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, tone = "neutral",
}: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "neutral" | "primary" | "warning" | "success" }) {
  const toneCls: Record<string, string> = {
    neutral: "from-slate-50 to-slate-100 text-slate-700",
    primary: "from-blue-50 to-blue-100 text-blue-700",
    warning: "from-amber-50 to-amber-100 text-amber-700",
    success: "from-emerald-50 to-emerald-100 text-emerald-700",
  }
  return (
    <Card className="rounded-2xl shadow-sm border-0 overflow-hidden">
      <CardContent className={`p-4 bg-gradient-to-br ${toneCls[tone]}`}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
            {icon}
          </div>
          <div>
            <p className="text-xs font-medium opacity-80">{label}</p>
            <p className="text-2xl font-bold leading-tight">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ContratsTravailListPage() {
  const router = useRouter()

  const [societes, setSocietes] = useState<Societe[]>([])
  const [filtSociete, setFiltSociete] = useState<string>("all")
  const [filtType, setFiltType] = useState<string>("all")
  const [filtStatut, setFiltStatut] = useState<string>("all")
  const [search, setSearch] = useState<string>("")

  const [contrats, setContrats] = useState<Contrat[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Chargement sociétés (pour filtre multi-tenant)
  useEffect(() => {
    let alive = true
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then((d: { societes?: Societe[] }) => {
        if (!alive) return
        const list = d.societes ?? []
        setSocietes(list)
        if (list.length === 1) setFiltSociete(list[0].id)
      })
      .catch(() => { /* silently ignore — API peut renvoyer 401 sans societes */ })
    return () => { alive = false }
  }, [])

  const loadContrats = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (filtSociete !== "all") params.set("societe_id", filtSociete)
      if (filtType !== "all") params.set("type_contrat", filtType)
      if (filtStatut !== "all") params.set("statut", filtStatut)
      const res = await fetch(`/api/rh/contrats?${params.toString()}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
      setContrats((d?.contrats ?? []) as Contrat[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement")
      setContrats([])
    } finally {
      setLoading(false)
    }
  }, [filtSociete, filtType, filtStatut])

  useEffect(() => { loadContrats() }, [loadContrats])

  // Filtre texte (employé / poste)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contrats
    return contrats.filter(c => {
      const nom = `${c.employe?.prenom ?? ""} ${c.employe?.nom ?? ""}`.toLowerCase()
      const poste = (c.poste ?? c.employe?.poste ?? "").toLowerCase()
      return nom.includes(q) || poste.includes(q)
    })
  }, [contrats, search])

  // KPIs
  const kpis = useMemo(() => {
    const total = contrats.length
    let cdi = 0, cddOrOther = 0, enSignature = 0, expirantBientot = 0
    for (const c of contrats) {
      if (c.type_contrat === "CDI") cdi++
      else cddOrOther++
      if (c.statut === "signe_employe" || c.statut === "brouillon") enSignature++
      if (c.date_fin) {
        const d = daysUntil(c.date_fin)
        if (d !== null && d >= 0 && d <= 30 && c.statut !== "resilie" && c.statut !== "expire") expirantBientot++
      }
    }
    return { total, cdi, cddOrOther, enSignature, expirantBientot }
  }, [contrats])

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "RH", href: "/rh" },
        { label: "Contrats Travail" },
      ]}
      kicker="Ressources humaines"
      title="Contrats de travail"
      subtitle="Gérez les contrats employés : création, signature électronique, avenants et résiliations."
      actions={
        <Button
          onClick={() => router.push("/rh/contrats-travail/nouveau")}
          className="bg-[#0B0F2E] hover:bg-[#1a1f4a] text-white rounded-xl"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nouveau contrat
        </Button>
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-10 relative z-10">
        {/* ── KPIs ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard icon={<FileText className="h-5 w-5" />} label="Total contrats" value={kpis.total} tone="neutral" />
          <KpiCard icon={<FileCheck2 className="h-5 w-5" />} label="CDI" value={kpis.cdi} tone="success" />
          <KpiCard icon={<FileText className="h-5 w-5" />} label="CDD & autres" value={kpis.cddOrOther} tone="primary" />
          <KpiCard icon={<Clock className="h-5 w-5" />} label="En signature" value={kpis.enSignature} tone="warning" />
        </div>

        {kpis.expirantBientot > 0 && (
          <Card className="mb-4 rounded-2xl border-amber-200 bg-amber-50/50">
            <CardContent className="p-3 flex items-center gap-3">
              <FileWarning className="h-5 w-5 text-amber-700" />
              <p className="text-sm text-amber-800">
                <strong>{kpis.expirantBientot}</strong> contrat{kpis.expirantBientot > 1 ? "s" : ""} expire{kpis.expirantBientot > 1 ? "nt" : ""} dans moins de 30 jours.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Filtres ─────────────────────────────────────────────────────── */}
        <Card className="mb-4 rounded-2xl shadow-sm">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <div className="relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un employé ou un poste…"
                  className="h-11 pl-9 rounded-xl"
                />
              </div>
            </div>
            <div className="md:col-span-3">
              <Select value={filtSociete} onValueChange={setFiltSociete}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Société" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les sociétés</SelectItem>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select value={filtType} onValueChange={setFiltType}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Select value={filtStatut} onValueChange={setFiltStatut}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Statut" /></SelectTrigger>
                <SelectContent>
                  {STATUTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement des contrats…
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-red-600">Erreur : {error}</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <FileText className="h-10 w-10 text-gray-300 mb-2" />
                <p className="text-sm">Aucun contrat ne correspond aux filtres.</p>
                <Button
                  onClick={() => router.push("/rh/contrats-travail/nouveau")}
                  variant="outline"
                  className="mt-4 rounded-xl"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Créer le premier contrat
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employé</TableHead>
                    <TableHead>Société</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date début</TableHead>
                    <TableHead>Date fin</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const nom = `${c.employe?.prenom ?? ""} ${c.employe?.nom ?? ""}`.trim() || "—"
                    const expSoon = c.date_fin && (() => {
                      const d = daysUntil(c.date_fin)
                      return d !== null && d >= 0 && d <= 30
                    })()
                    return (
                      <TableRow
                        key={c.id}
                        onClick={() => router.push(`/rh/contrats-travail/${c.id}`)}
                        className="cursor-pointer hover:bg-gray-50"
                      >
                        <TableCell>
                          <div className="font-medium text-gray-900">{nom}</div>
                          <div className="text-xs text-gray-500">{c.poste ?? c.employe?.poste ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">{c.employe?.societe?.nom ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="rounded-full">{c.type_contrat}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(c.date_debut)}</TableCell>
                        <TableCell className="text-sm">
                          {formatDate(c.date_fin)}
                          {expSoon && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium">
                              &lt; 30 j
                            </span>
                          )}
                        </TableCell>
                        <TableCell><StatutBadge statut={c.statut} /></TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/rh/contrats-travail/${c.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#0B0F2E] text-sm font-medium hover:underline"
                          >
                            Voir
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
      </div>
    </ClientPageShell>
  )
}
