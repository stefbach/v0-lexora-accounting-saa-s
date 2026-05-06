"use client"

/**
 * Page Rapprochement bancaire (côté CLIENT) — agent-first 'Lex Banque'.
 *
 * Miroir exact de /app/comptable/rapprochement avec la seule différence :
 * pas de sélecteur de société (le client n'en a qu'une, fournie par
 * useSocieteActive()).
 *
 * Workflow :
 *   1. Sélectionne la période (par défaut "Toutes")
 *   2. Clique "Lancer Lex Banque" → /api/agent/rapprochement
 *   3. Vois les suggestions dans l'onglet "À valider"
 *   4. Coche + "Valider" → /api/comptable/rapprochement?action=lettrer_manuel
 *      crée immédiatement l'écriture BNQ
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Bot,
  RefreshCw,
  CalendarDays,
  Search,
  Wand2,
  Wrench,
  Landmark,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

const AGENT_NAME = "Lex Banque"

const MOIS = [
  { val: "01", label: "Janvier" },
  { val: "02", label: "Février" },
  { val: "03", label: "Mars" },
  { val: "04", label: "Avril" },
  { val: "05", label: "Mai" },
  { val: "06", label: "Juin" },
  { val: "07", label: "Juillet" },
  { val: "08", label: "Août" },
  { val: "09", label: "Septembre" },
  { val: "10", label: "Octobre" },
  { val: "11", label: "Novembre" },
  { val: "12", label: "Décembre" },
]
const ANNEES = ["2024", "2025", "2026", "2027"]

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d: string): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

interface BankTx {
  id: string
  releve_id: string
  date: string
  libelle: string
  debit: number
  credit: number
  devise?: string
  banque?: string
  statut?: string
  facture_id?: string | null
  facture_ids?: string[]
  matched_type?: string | null
  matched_strategy?: string | null
  matched_confidence?: number | null
  match_confidence?: string | null
  classification?: string | null
  classification_suggestion?: any
  compte_comptable?: string | null
  tiers_detecte?: string | null
  suggestion_source?: string | null
  note?: string | null
  rapprochement_multi?: boolean
  nb_factures?: number
  lettre?: string | null
}

interface Facture {
  id: string
  numero_facture: string | null
  tiers: string | null
  montant_ttc: number
  montant_mur: number | null
  devise: string | null
  type_facture: string | null
  statut: string | null
  date_facture: string | null
  date_echeance: string | null
}

export default function ClientRapprochementPage() {
  // ── Société active du client (1 seule) ────────────────────────────
  const { societeId } = useSocieteActive()

  // ── Période (par défaut : Toutes) ─────────────────────────────────
  const [modeToutes, setModeToutes] = useState(true)
  const nowMois = String(new Date().getMonth() + 1).padStart(2, "0")
  const [selectedMois, setSelectedMois] = useState(nowMois)
  const [selectedAnnee, setSelectedAnnee] = useState(String(new Date().getFullYear()))

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [runningAgent, setRunningAgent] = useState(false)
  const [autoLettrage, setAutoLettrage] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [validating, setValidating] = useState(false)
  const [activeTab, setActiveTab] = useState("a-valider")
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  // Filtres
  const [search, setSearch] = useState("")
  const [filtreSens, setFiltreSens] = useState<"all" | "client" | "fournisseur">("all")
  const [filtreCompte, setFiltreCompte] = useState<string>("all")
  const [filtreTiers, setFiltreTiers] = useState<string>("all")

  const periodeDebut = modeToutes ? null : `${selectedAnnee}-${selectedMois}-01`
  const periodeFin = modeToutes
    ? null
    : (() => {
        const last = new Date(Number(selectedAnnee), Number(selectedMois), 0).getDate()
        return `${selectedAnnee}-${selectedMois}-${String(last).padStart(2, "0")}`
      })()

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const load = useCallback(async () => {
    if (!societeId) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: societeId })
      if (periodeDebut) params.set("date_debut", periodeDebut)
      if (periodeFin) params.set("date_fin", periodeFin)
      const res = await fetch(`/api/comptable/rapprochement?${params}`)
      const d = await res.json()
      setData(d)
    } catch {
      showToast("Erreur chargement", "error")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [societeId, periodeDebut, periodeFin, showToast])
  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setSelectedTxIds(new Set())
  }, [data])

  const transactions: BankTx[] = useMemo(() => data?.bankTransactions || [], [data])
  const factures: Facture[] = useMemo(() => data?.factures || [], [data])
  const facturesById = useMemo(() => {
    const m = new Map<string, Facture>()
    for (const f of factures) m.set(f.id, f)
    return m
  }, [factures])

  // Liste des comptes bancaires uniques (pour filtre)
  const comptesUniques = useMemo(() => {
    const map = new Map<string, { id: string; label: string; devise: string }>()
    for (const t of transactions) {
      const id = (t as any).releve_id || ""
      const banque = (t as any).banque || ""
      const devise = (t as any).devise || "MUR"
      if (!map.has(banque + "|" + devise) && banque) {
        map.set(banque + "|" + devise, {
          id: banque + "|" + devise,
          label: `${banque} (${devise})`,
          devise,
        })
      }
    }
    return Array.from(map.values())
  }, [transactions])

  // Liste des tiers détectés (pour filtre)
  const tiersList = useMemo(() => {
    const set = new Set<string>()
    for (const t of transactions) {
      if (t.tiers_detecte) set.add(t.tiers_detecte)
    }
    for (const f of factures) {
      if (f.tiers) set.add(f.tiers)
    }
    return Array.from(set).sort()
  }, [transactions, factures])

  // Applique les filtres communs (search + sens + compte + tiers)
  function applyFilters(list: BankTx[]): BankTx[] {
    let out = list
    if (filtreSens !== "all") {
      out = out.filter((t) => {
        const fids =
          Array.isArray(t.facture_ids) && t.facture_ids.length > 0
            ? t.facture_ids
            : t.facture_id
              ? [t.facture_id]
              : []
        if (fids.length === 0) {
          // Pour les classifications ou orphelines, sens = signe du montant
          if (filtreSens === "client") return t.credit > 0 // entrée
          if (filtreSens === "fournisseur") return t.debit > 0 // sortie
          return true
        }
        // Sinon on vérifie le type des factures liées
        const linked = fids.map((id) => factures.find((f) => f.id === id)).filter(Boolean) as Facture[]
        return linked.some((f) => f.type_facture === filtreSens)
      })
    }
    if (filtreCompte !== "all") {
      out = out.filter((t) => {
        const banque = (t as any).banque || ""
        const devise = (t as any).devise || "MUR"
        return banque + "|" + devise === filtreCompte
      })
    }
    if (filtreTiers !== "all") {
      out = out.filter((t) => {
        if (t.tiers_detecte === filtreTiers) return true
        const fids =
          Array.isArray(t.facture_ids) && t.facture_ids.length > 0
            ? t.facture_ids
            : t.facture_id
              ? [t.facture_id]
              : []
        const linked = fids.map((id) => factures.find((f) => f.id === id)).filter(Boolean) as Facture[]
        return linked.some((f) => f.tiers === filtreTiers)
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(
        (t) =>
          t.libelle.toLowerCase().includes(q) ||
          t.tiers_detecte?.toLowerCase().includes(q) ||
          t.compte_comptable?.includes(q) ||
          t.lettre?.toLowerCase().includes(q) ||
          String(t.debit).includes(q) ||
          String(t.credit).includes(q)
      )
    }
    return out
  }

  const proposes = useMemo(
    () => applyFilters(transactions.filter((t) => t.statut === "propose")),
    [transactions, search, filtreSens, filtreCompte, filtreTiers, factures]
  )
  const aVerifier = useMemo(
    () => applyFilters(transactions.filter((t) => t.statut === "a_verifier")),
    [transactions, search, filtreSens, filtreCompte, filtreTiers, factures]
  )
  const rapprochees = useMemo(
    () =>
      applyFilters(
        transactions.filter(
          (t) =>
            t.statut === "rapproche" ||
            (!t.statut &&
              (t.facture_id || (Array.isArray(t.facture_ids) && t.facture_ids.length > 0)))
        )
      ),
    [transactions, search, filtreSens, filtreCompte, filtreTiers, factures]
  )
  const orphelines = useMemo(
    () =>
      applyFilters(
        transactions.filter(
          (t) =>
            (t.statut === "non_identifie" || !t.statut) &&
            !t.facture_id &&
            !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0) &&
            !t.compte_comptable
        )
      ),
    [transactions, search, filtreSens, filtreCompte, filtreTiers, factures]
  )
  const totalSuggestions = proposes.length + aVerifier.length
  const hasFilter =
    !!search.trim() ||
    filtreSens !== "all" ||
    filtreCompte !== "all" ||
    filtreTiers !== "all"
  const resetFilters = () => {
    setSearch("")
    setFiltreSens("all")
    setFiltreCompte("all")
    setFiltreTiers("all")
  }

  const groups = useMemo(() => {
    type Grp = {
      key: string
      title: string
      desc: string
      items: BankTx[]
      type: "match" | "classification"
      isAi: boolean
    }
    const g: Grp[] = []
    const matchAlgo = proposes.filter((t) => t.suggestion_source !== "agent_ai")
    const matchAi = proposes.filter((t) => t.suggestion_source === "agent_ai")
    const classAlgo = aVerifier.filter((t) => t.suggestion_source !== "agent_ai")
    const classAi = aVerifier.filter((t) => t.suggestion_source === "agent_ai")
    if (matchAlgo.length)
      g.push({
        key: "ma",
        title: `Rapprochements algorithme (${matchAlgo.length})`,
        desc: "Tx ↔ facture proposés par le moteur de matching pur. Confiance élevée.",
        items: matchAlgo,
        type: "match",
        isAi: false,
      })
    if (matchAi.length)
      g.push({
        key: "mai",
        title: `Rapprochements IA Claude (${matchAi.length})`,
        desc: "Cas ambigus rattrapés par l'IA. À vérifier au cas par cas.",
        items: matchAi,
        type: "match",
        isAi: true,
      })
    if (classAlgo.length)
      g.push({
        key: "ca",
        title: `Classifications algorithme (${classAlgo.length})`,
        desc: "Frais bancaires, salaires, MRA, virements internes. Compte PCM pré-rempli.",
        items: classAlgo,
        type: "classification",
        isAi: false,
      })
    if (classAi.length)
      g.push({
        key: "cai",
        title: `Classifications IA Claude (${classAi.length})`,
        desc: "Cas atypiques classés par l'IA. Vérifier le compte PCM.",
        items: classAi,
        type: "classification",
        isAi: true,
      })
    return g
  }, [proposes, aVerifier])

  // Lettrage automatique sans IA — appelle la pipeline native
  // /api/comptable/rapprochement?action=auto_rapprocher (matching algo pur).
  const handleAutoLettrage = useCallback(async () => {
    if (!societeId) return
    setAutoLettrage(true)
    try {
      const body: any = { action: "auto_rapprocher", societe_id: societeId }
      if (periodeDebut) body.date_debut = periodeDebut
      if (periodeFin) body.date_fin = periodeFin
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur lettrage automatique", "error")
        return
      }
      showToast(
        `Lettrage automatique : ${d.matched || 0} transaction(s) rapprochée(s)`
      )
      load()
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || "réseau"}`, "error")
    } finally {
      setAutoLettrage(false)
    }
  }, [societeId, periodeDebut, periodeFin, load, showToast])

  // Classification comptable automatique (R01-R06) sur les tx orphelines —
  // applique les règles déterministes (frais bancaires, salaires, MRA, etc.)
  // sans matcher de facture.
  const handleReclassify = useCallback(async () => {
    if (!societeId) return
    setReclassifying(true)
    try {
      const body: any = { societe_id: societeId }
      if (periodeDebut) body.date_debut = periodeDebut
      if (periodeFin) body.date_fin = periodeFin
      const res = await fetch("/api/comptable/rapprochement/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur classification", "error")
        return
      }
      showToast(
        `Classification : ${d.classified || d.matched || 0} transaction(s) classée(s)`
      )
      load()
    } catch (e: any) {
      showToast(`Erreur : ${e?.message || "réseau"}`, "error")
    } finally {
      setReclassifying(false)
    }
  }, [societeId, periodeDebut, periodeFin, load, showToast])

  const handleRunAgent = useCallback(async () => {
    if (!societeId) return
    setRunningAgent(true)
    try {
      const body: any = { societe_id: societeId, dry_run: false, min_confidence: 0.7 }
      if (periodeDebut) body.date_debut = periodeDebut
      if (periodeFin) body.date_fin = periodeFin
      const res = await fetch("/api/agent/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || `Erreur ${AGENT_NAME}`, "error")
        return
      }
      const total =
        (d.stats?.matched || 0) +
        (d.stats?.classified || 0) +
        (d.stats?.semantic_matches || 0) +
        (d.stats?.semantic_classifications || 0)
      showToast(
        `${AGENT_NAME} : ${total} suggestion(s), ${d.writes?.transactions_modifiees || 0} écrites`
      )
      load()
    } catch (e: any) {
      showToast(`Erreur ${AGENT_NAME} : ${e?.message || "réseau"}`, "error")
    } finally {
      setRunningAgent(false)
    }
  }, [societeId, periodeDebut, periodeFin, load, showToast])

  const validateOne = useCallback(
    async (tx: BankTx): Promise<{ ok: boolean; error?: string; lettre?: string }> => {
      if (!societeId) return { ok: false, error: "société manquante" }
      const body: any = {
        societe_id: societeId,
        transaction_id: tx.id,
        releve_id: tx.releve_id,
      }
      const fids = (Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
        ? tx.facture_ids
        : tx.facture_id
          ? [tx.facture_id]
          : []
      ).filter(Boolean)
      if (fids.length > 0) {
        if (fids.length > 1) {
          body.action = "lettrer_multi"
          body.facture_ids = fids
        } else {
          body.action = "lettrer_manuel"
          body.facture_id = fids[0]
        }
      } else if (tx.compte_comptable && tx.classification) {
        body.action = "lettrer_manuel"
        body.classification = tx.classification
        body.compte_charge = tx.compte_comptable
      } else {
        return { ok: false, error: "Suggestion incomplète" }
      }
      try {
        const res = await fetch("/api/comptable/rapprochement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) return { ok: false, error: d?.error || `HTTP ${res.status}` }
        return { ok: true, lettre: d?.lettre }
      } catch (e: any) {
        return { ok: false, error: e?.message || "Erreur réseau" }
      }
    },
    [societeId]
  )

  const handleValidateOne = async (tx: BankTx) => {
    const r = await validateOne(tx)
    if (!r.ok) return showToast(`Échec : ${r.error}`, "error")
    showToast(`Validé (${r.lettre || "—"}) — écriture BNQ créée`)
    load()
  }

  const handleRejectOne = async (tx: BankTx) => {
    if (!societeId) return
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rejeter_suggestion",
          societe_id: societeId,
          transaction_id: tx.id,
          releve_id: tx.releve_id,
        }),
      })
      const d = await res.json()
      if (!res.ok) return showToast(d?.error || "Rejet impossible", "error")
      showToast("Suggestion rejetée")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur rejet", "error")
    }
  }

  const handleValidateBatch = async (items: BankTx[]) => {
    if (items.length === 0) return showToast("Rien de coché", "error")
    setValidating(true)
    let ok = 0
    const errors: string[] = []
    for (const tx of items) {
      const r = await validateOne(tx)
      if (r.ok) ok++
      else errors.push(`${tx.libelle.slice(0, 40)} : ${r.error}`)
    }
    setValidating(false)
    setSelectedTxIds(new Set())
    if (errors.length === 0) showToast(`${ok} validation(s) — écritures BNQ créées`)
    else showToast(`${ok} OK / ${errors.length} échec — ${errors[0]}`, "error")
    load()
  }

  const toggleTx = (id: string) =>
    setSelectedTxIds((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleAllInGroup = (items: BankTx[]) =>
    setSelectedTxIds((prev) => {
      const n = new Set(prev)
      const all = items.every((t) => n.has(t.id))
      for (const t of items) {
        if (all) n.delete(t.id)
        else n.add(t.id)
      }
      return n
    })

  const total = transactions.length
  const tauxRapproche = total > 0 ? Math.round((rapprochees.length / total) * 100) : 0

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* HEADER agent */}
        <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 via-indigo-50 to-blue-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 p-3 text-white shadow-md">
                <Bot className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-purple-900 flex items-center gap-2">
                  {AGENT_NAME}
                  <Badge className="bg-purple-600 text-white text-[10px] uppercase">
                    Agent IA
                  </Badge>
                </h1>
                <p className="text-sm text-purple-700/80 mt-0.5">
                  Rapprochement bancaire intelligent · matching automatique des factures + classifications PCM
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={load}
                disabled={loading || !societeId}
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Button
                onClick={handleRunAgent}
                disabled={runningAgent || !societeId}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md"
              >
                {runningAgent ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    En cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Lancer {AGENT_NAME}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Sélecteur Période (pas de société — le client n'en a qu'une) */}
        <div className="flex gap-3 items-center flex-wrap">
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              modeToutes ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-200"
            }`}
          >
            <CalendarDays
              className={`w-4 h-4 ${modeToutes ? "text-amber-600" : "text-blue-600"}`}
            />
            <span className="text-sm font-medium">Période :</span>
            <button
              onClick={() => setModeToutes((v) => !v)}
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                modeToutes
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-white text-gray-500 border-gray-300 hover:border-blue-400"
              }`}
            >
              Toutes
            </button>
            {!modeToutes && (
              <>
                <Select value={selectedMois} onValueChange={setSelectedMois}>
                  <SelectTrigger className="w-32 h-8 border-0 bg-transparent text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOIS.map((m) => (
                      <SelectItem key={m.val} value={m.val}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedAnnee} onValueChange={setSelectedAnnee}>
                  <SelectTrigger className="w-20 h-8 border-0 bg-transparent text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNEES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>

        {/* Encadré explicatif + actions manuelles */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 space-y-3">
            <div className="text-sm text-amber-900/90 space-y-1.5">
              <p>
                <span className="font-medium">Comment fonctionne cette page&nbsp;:</span> les transactions de tes relevés bancaires sont rapprochées avec tes factures (clients & fournisseurs) ou classées dans le bon compte PCM (frais bancaires, salaires, etc.).
              </p>
              <p>
                <span className="font-medium">3 façons d'agir&nbsp;:</span>
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  <span className="font-medium text-purple-700">Lex Banque (IA)</span> — l'agent rapproche tout en un clic, gère les libellés ambigus et les multi-devises.
                </li>
                <li>
                  <span className="font-medium text-blue-700">Lettrage automatique</span> — moteur d'algorithmes (8 stratégies cascadées) sans IA, plus rapide pour les volumes simples.
                </li>
                <li>
                  <span className="font-medium text-green-700">Classification</span> — applique les règles R01-R06 (frais bancaires, salaires bulk, MRA…) sur les transactions orphelines sans matcher de facture.
                </li>
              </ul>
              <p>
                Les suggestions apparaissent dans l'onglet <span className="font-medium">À valider</span>. Tu peux ensuite tout valider en lot ou cas par cas. Filtre par tiers / banque / période ci-dessous pour zoomer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleAutoLettrage}
                disabled={autoLettrage || loading || !societeId}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {autoLettrage ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-1.5" />
                )}
                Lettrage automatique
              </Button>
              <Button
                onClick={handleReclassify}
                disabled={reclassifying || loading || !societeId}
                size="sm"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                {reclassifying ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Wrench className="h-4 w-4 mr-1.5" />
                )}
                Classification (R01-R06)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Barre de filtres */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Libellé, tiers, montant, lettre, PCM…"
                  className="pl-8 h-9 w-72"
                />
              </div>
              <Select
                value={filtreSens}
                onValueChange={(v: any) => setFiltreSens(v)}
              >
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous (clients & fournisseurs)</SelectItem>
                  <SelectItem value="client">Clients (entrées)</SelectItem>
                  <SelectItem value="fournisseur">Fournisseurs (sorties)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtreCompte} onValueChange={setFiltreCompte}>
                <SelectTrigger className="h-9 w-52">
                  <Landmark className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="Compte bancaire" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les banques</SelectItem>
                  {comptesUniques.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtreTiers} onValueChange={setFiltreTiers}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder="Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les tiers</SelectItem>
                  {tiersList.slice(0, 100).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.length > 50 ? t.slice(0, 47) + "…" : t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilter && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                  Réinitialiser
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              Société non disponible.
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard label="Total tx" value={total} />
              <KpiCard
                label="À valider"
                value={totalSuggestions}
                tone="amber"
                accent={totalSuggestions > 0}
              />
              <KpiCard label="Rapprochées" value={rapprochees.length} tone="green" />
              <KpiCard label="Orphelines" value={orphelines.length} tone="rose" />
              <KpiCard label="Taux" value={`${tauxRapproche}%`} tone="blue" />
            </div>

            <Card>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="px-4 pt-2 bg-transparent border-b rounded-none w-full justify-start gap-1 h-auto">
                  <TabsTrigger
                    value="a-valider"
                    className="data-[state=active]:bg-amber-100 px-3 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5 text-amber-600" />À valider (
                    {totalSuggestions})
                  </TabsTrigger>
                  <TabsTrigger value="rapprochees" className="px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-600" />
                    Rapprochées ({rapprochees.length})
                  </TabsTrigger>
                  <TabsTrigger value="orphelines" className="px-3 py-2">
                    <HelpCircle className="h-4 w-4 mr-1.5 text-rose-600" />
                    Orphelines ({orphelines.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="a-valider" className="p-4 space-y-5 mt-0">
                  {totalSuggestions === 0 ? (
                    <EmptyState
                      title="Aucune suggestion en attente"
                      hint={`Clique sur "Lancer ${AGENT_NAME}" en haut de la page pour générer des suggestions.`}
                    />
                  ) : (
                    groups.map((g) => {
                      const selectedCount = g.items.filter((t) => selectedTxIds.has(t.id)).length
                      const allChecked =
                        selectedCount === g.items.length && g.items.length > 0
                      return (
                        <div key={g.key} className="rounded border bg-card">
                          <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30 flex-wrap">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Checkbox
                                checked={allChecked}
                                onCheckedChange={() => toggleAllInGroup(g.items)}
                              />
                              <div className="min-w-0">
                                <h3 className="font-medium text-sm flex items-center gap-2">
                                  {g.title}
                                  {g.isAi && (
                                    <Badge className="bg-purple-100 text-purple-700 text-[10px] border border-purple-300">
                                      <Bot className="h-3 w-3 mr-0.5" />
                                      IA
                                    </Badge>
                                  )}
                                </h3>
                                <p className="text-[11px] text-muted-foreground">{g.desc}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {selectedCount > 0 ? (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleValidateBatch(
                                      g.items.filter((t) => selectedTxIds.has(t.id))
                                    )
                                  }
                                  disabled={validating}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  {validating ? (
                                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                  )}
                                  Valider {selectedCount}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleValidateBatch(g.items)}
                                  disabled={validating}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                  Tout valider ({g.items.length})
                                </Button>
                              )}
                            </div>
                          </div>
                          <div>
                            {g.items.map((tx) => (
                              <SuggestionRow
                                key={tx.id}
                                tx={tx}
                                type={g.type}
                                checked={selectedTxIds.has(tx.id)}
                                onToggle={() => toggleTx(tx.id)}
                                onValidate={() => handleValidateOne(tx)}
                                onReject={() => handleRejectOne(tx)}
                                facturesById={facturesById}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </TabsContent>

                <TabsContent value="rapprochees" className="p-4 mt-0">
                  {rapprochees.length === 0 ? (
                    <EmptyState
                      title="Aucune transaction rapprochée"
                      hint="Valide des suggestions pour qu'elles apparaissent ici (avec écriture BNQ associée)."
                    />
                  ) : (
                    <div className="rounded border bg-card divide-y">
                      {rapprochees.map((tx) => (
                        <TxRow key={tx.id} tx={tx} facturesById={facturesById} />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="orphelines" className="p-4 mt-0">
                  {orphelines.length === 0 ? (
                    <EmptyState
                      title="Aucune transaction orpheline"
                      hint="Toutes les transactions ont reçu une suggestion."
                    />
                  ) : (
                    <div className="rounded border bg-card divide-y">
                      {orphelines.map((tx) => (
                        <TxRow key={tx.id} tx={tx} facturesById={facturesById} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

// ── Helpers UI inline ──────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tone,
  accent,
}: {
  label: string
  value: number | string
  tone?: "amber" | "green" | "rose" | "blue"
  accent?: boolean
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "green"
        ? "border-green-200 bg-green-50"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50"
            : "border-muted bg-card"
  return (
    <Card className={`${cls} ${accent ? "ring-2 ring-amber-400" : ""}`}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 text-center space-y-2">
      <p className="font-medium text-sm">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: number | null | undefined }) {
  if (confidence == null) return null
  const pct = Math.round(confidence * 100)
  const color =
    pct >= 90
      ? "bg-green-100 text-green-800 border-green-300"
      : pct >= 80
        ? "bg-blue-100 text-blue-800 border-blue-300"
        : "bg-amber-100 text-amber-800 border-amber-300"
  return <Badge className={`text-[10px] font-mono ${color}`}>{pct}%</Badge>
}

function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null
  const ai = source === "agent_ai"
  return (
    <Badge
      variant="outline"
      className={`text-[10px] ${
        ai
          ? "bg-purple-100 text-purple-800 border-purple-300"
          : "bg-slate-100 text-slate-700 border-slate-300"
      }`}
    >
      {ai ? (
        <>
          <Bot className="h-3 w-3 mr-0.5" />
          IA
        </>
      ) : (
        "Algo"
      )}
    </Badge>
  )
}

function SuggestionRow({
  tx,
  type,
  checked,
  onToggle,
  onValidate,
  onReject,
  facturesById,
}: {
  tx: BankTx
  type: "match" | "classification"
  checked: boolean
  onToggle: () => void
  onValidate: () => void
  onReject: () => void
  facturesById: Map<string, Facture>
}) {
  const montant = tx.debit > 0 ? -tx.debit : tx.credit
  const fids =
    Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
      ? tx.facture_ids
      : tx.facture_id
        ? [tx.facture_id]
        : []
  const factures = fids.map((id) => facturesById.get(id)).filter(Boolean) as Facture[]
  return (
    <div className="flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/20">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
            <p className="font-medium text-sm break-words">{tx.libelle}</p>
          </div>
          <p
            className={`font-mono text-sm flex-shrink-0 ${
              montant >= 0 ? "text-green-700" : "text-rose-700"
            }`}
          >
            {montant >= 0 ? "+" : ""}
            {fmt(montant)} {tx.devise || "MUR"}
          </p>
        </div>
        {type === "match" ? (
          <p className="text-xs">
            <span className="text-muted-foreground">→ </span>
            {factures.length > 0 ? (
              factures.map((f, i) => (
                <span key={f.id}>
                  Facture <span className="font-mono">{f.numero_facture || f.id.slice(0, 8)}</span>
                  {f.tiers && (
                    <span className="text-muted-foreground"> · {f.tiers.slice(0, 50)}</span>
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    ({fmt(f.montant_ttc)} {f.devise || "MUR"})
                  </span>
                  {i < factures.length - 1 ? (
                    <span className="text-muted-foreground"> + </span>
                  ) : null}
                </span>
              ))
            ) : (
              <span className="italic text-muted-foreground">facture introuvable</span>
            )}
          </p>
        ) : (
          <p className="text-xs">
            <span className="text-muted-foreground">→ Compte PCM </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {tx.compte_comptable || "?"}
            </Badge>
            <span className="text-muted-foreground"> ({tx.classification})</span>
          </p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <ConfidenceBadge confidence={tx.matched_confidence} />
          <SourceBadge source={tx.suggestion_source} />
          {tx.matched_strategy && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {tx.matched_strategy}
            </Badge>
          )}
          {tx.tiers_detecte && (
            <Badge variant="outline" className="text-[10px]">
              {tx.tiers_detecte.slice(0, 30)}
            </Badge>
          )}
          {tx.rapprochement_multi && (
            <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-300">
              {tx.nb_factures}× factures
            </Badge>
          )}
        </div>
        {tx.note && <p className="text-[11px] italic text-muted-foreground">{tx.note}</p>}
      </div>
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <Button
          size="sm"
          onClick={onValidate}
          className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Valider
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onReject}
          className="h-7 text-xs text-muted-foreground hover:text-rose-700 hover:bg-rose-50"
        >
          <XCircle className="h-3.5 w-3.5 mr-1" />
          Rejeter
        </Button>
      </div>
    </div>
  )
}

function TxRow({
  tx,
  facturesById,
}: {
  tx: BankTx
  facturesById: Map<string, Facture>
}) {
  const montant = tx.debit > 0 ? -tx.debit : tx.credit
  return (
    <div className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
        <p className="font-medium text-sm break-words">{tx.libelle}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {tx.lettre && (
            <Badge variant="outline" className="text-[10px] font-mono bg-green-50">
              {tx.lettre}
            </Badge>
          )}
          {tx.compte_comptable && (
            <Badge variant="outline" className="text-[10px] font-mono">
              PCM {tx.compte_comptable}
            </Badge>
          )}
          {tx.facture_id && (
            <Badge variant="outline" className="text-[10px]">
              Facture {facturesById.get(tx.facture_id)?.numero_facture || tx.facture_id.slice(0, 8)}
            </Badge>
          )}
          {tx.matched_strategy && (
            <Badge variant="outline" className="text-[10px] font-mono opacity-70">
              {tx.matched_strategy}
            </Badge>
          )}
        </div>
      </div>
      <p
        className={`font-mono text-sm flex-shrink-0 ${
          montant >= 0 ? "text-green-700" : "text-rose-700"
        }`}
      >
        {montant >= 0 ? "+" : ""}
        {fmt(montant)} {tx.devise || "MUR"}
      </p>
    </div>
  )
}
