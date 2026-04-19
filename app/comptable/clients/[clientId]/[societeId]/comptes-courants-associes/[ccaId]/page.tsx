"use client"

/**
 * Detail d'un CCA — cote comptable
 *  - Infos associe + type
 *  - Historique complet mouvements (sort date desc)
 *  - Graph evolution solde (Recharts)
 *  - Export CSV / PDF
 *  - Info conformite si solde debiteur
 *  - Bouton "Saisir mouvement"
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft, Download, FileText, Loader2, AlertTriangle, Plus, RefreshCw,
} from "lucide-react"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts"
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
  created_at: string | null
  updated_at: string | null
}

type Mouvement = {
  id: string
  compte_courant_id: string
  date_mouvement: string
  type: string
  montant: number | string
  description: string | null
  facture_id: string | null
  lettre: string | null
  created_at: string | null
}

type ApiResponse = {
  compte: Cca
  mouvements: Mouvement[]
}

export default function CcaDetailPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string
  const ccaId = params.ccaId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mvOpen, setMvOpen] = useState(false)

  const load = useCallback(async () => {
    if (!societeId || !ccaId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/comptable/cca/${ccaId}/mouvements?societe_id=${societeId}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Erreur chargement")
        return
      }
      setData(json as ApiResponse)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur")
    } finally {
      setLoading(false)
    }
  }, [societeId, ccaId])

  useEffect(() => { load() }, [load])

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
      const res = await fetch(`/api/comptable/cca/${ccaId}/mouvements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          type: payload.type,
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

  const compte = data?.compte
  const mouvements = data?.mouvements ?? []

  // Historique trie par date ASC pour calculer solde courant, puis on inverse
  // pour l'affichage (derniere ligne en haut).
  const enriched = useMemo(() => {
    const asc = [...mouvements].sort((a, b) =>
      (a.date_mouvement || "").localeCompare(b.date_mouvement || ""),
    )
    let solde = 0
    const withBalance = asc.map((m) => {
      solde += Number(m.montant ?? 0)
      return { ...m, solde_courant: solde }
    })
    return withBalance
  }, [mouvements])

  const chartData = useMemo(
    () =>
      enriched.map((m) => ({
        date: m.date_mouvement,
        solde: Number(m.solde_courant.toFixed(2)),
      })),
    [enriched],
  )

  const displayRows = useMemo(() => [...enriched].reverse(), [enriched])

  const solde = Number(compte?.solde ?? 0)
  const isDebiteur = solde < 0 && compte?.type === "associe"

  const exportCsv = () => {
    if (!compte) return
    const header = ["Date", "Type", "Montant (MUR)", "Description", "Solde apres (MUR)"]
    const rows = displayRows.map((m) => [
      m.date_mouvement,
      m.type,
      Number(m.montant ?? 0).toFixed(2),
      (m.description ?? "").replace(/[\r\n;,]/g, " "),
      m.solde_courant.toFixed(2),
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v)}"`).join(";"))
      .join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `CCA_${compte.nom.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    // Stub : on ouvre simplement la page en impression navigateur.
    if (typeof window !== "undefined") window.print()
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F6FB" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: NAVY }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 space-y-6" style={{ background: "#F4F6FB" }}>
      {/* Header + breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href={`/comptable/clients/${clientId}/${societeId}/comptes-courants-associes`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Retour CCA
          </Button>
        </Link>
        <div className="flex-1">
          <div className="text-xs text-gray-500">
            Comptes Courants Associés / {compte?.nom ?? "--"}
          </div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            {compte?.nom ?? "CCA"}
          </h1>
          <p className="text-sm text-gray-500">
            Détail du compte courant et historique des mouvements.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-1" /> Actualiser
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!compte}>
          <Download className="w-4 h-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={!compte}>
          <FileText className="w-4 h-4 mr-1" /> PDF
        </Button>
        <Button
          size="sm"
          style={{ background: GOLD, color: NAVY }}
          onClick={() => setMvOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> Saisir mouvement
        </Button>
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Infos associe */}
      {compte && (
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Nom</p>
              <p className="font-semibold" style={{ color: NAVY }}>{compte.nom}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Type</p>
              <Badge className={
                compte.type === "associe"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }>
                {compte.type === "associe" ? "Associé / Dirigeant (455)" : "Collaborateur (467)"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-500">Solde courant (MUR)</p>
              <p className={
                "text-xl font-bold font-mono " +
                (solde > 0 ? "text-green-700" : solde < 0 ? "text-orange-700" : "text-gray-700")
              }>
                {solde > 0 ? "+" : ""}{fmt(solde)}
              </p>
              <p className="text-[10px] text-gray-400">
                {solde > 0
                  ? "La société doit à l’associé"
                  : solde < 0
                    ? "L’associé doit à la société"
                    : "Compte soldé"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Nb mouvements</p>
              <p className="text-xl font-bold" style={{ color: NAVY }}>{mouvements.length}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerte conformite */}
      {isDebiteur && compte && (
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-800 mb-1">
                Convention de prêt obligatoire
              </div>
              <p className="text-sm text-amber-900">
                Le solde de {compte.nom} est débiteur ({fmt(solde)} MUR). Conformément au
                Companies Act 2001 (Mauritius), toute avance consentie par la société à un
                dirigeant / associé doit faire l&apos;objet d&apos;une convention de prêt
                signée pour éviter une requalification fiscale (distribution déguisée de
                dividendes).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Graph evolution solde */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: NAVY }}>
            Évolution du solde
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              Aucun mouvement à afficher.
            </div>
          ) : (
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number) => [`${fmt(value)} MUR`, "Solde"]}
                    labelFormatter={(l) => formatDate(String(l))}
                  />
                  <Line
                    type="monotone"
                    dataKey="solde"
                    stroke={NAVY}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique mouvements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: NAVY }}>
            Historique des mouvements ({mouvements.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {displayRows.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-500">
              Aucun mouvement enregistré.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Montant (MUR)</TableHead>
                  <TableHead className="text-right">Solde après (MUR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((m) => {
                  const montant = Number(m.montant ?? 0)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{formatDate(m.date_mouvement)}</TableCell>
                      <TableCell>
                        <Badge className={
                          m.type === "avance"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-green-100 text-green-700"
                        }>
                          {m.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[320px] truncate">
                        {m.description ?? "--"}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        <span className={montant >= 0 ? "text-orange-700" : "text-green-700"}>
                          {montant >= 0 ? "+" : ""}{fmt(montant)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={
                          m.solde_courant > 0
                            ? "text-green-700"
                            : m.solde_courant < 0
                              ? "text-orange-700"
                              : "text-gray-500"
                        }>
                          {fmt(m.solde_courant)}
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

      {/* Dialog */}
      <MouvementDialog
        open={mvOpen}
        onOpenChange={setMvOpen}
        ccas={compte ? [{ id: compte.id, nom: compte.nom, type: compte.type }] : []}
        lockedCcaId={ccaId}
        saving={saving}
        onSubmit={submitMouvement}
      />
    </div>
  )
}
