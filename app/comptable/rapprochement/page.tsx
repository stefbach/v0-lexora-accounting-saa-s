"use client"

/**
 * Page Rapprochement bancaire — réécrite agent-first.
 *
 * Toute la logique est inline dans cette page (plus de panel externe).
 * Pas de mode legacy : la page est dédiée à l'agent IA "Lex Banque".
 *
 * Workflow :
 *   1. Sélectionne société + période (par défaut "Toutes")
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
  Link2,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"
import { ECART_TYPE_OPTIONS, resolveEcartCompte, type EcartTypeChoice } from "@/lib/accounting/rapprochement/ecart-ui"

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

interface Societe {
  id: string
  nom: string
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
  solde_non_paye?: number | null
}

export default function RapprochementPage() {
  const locale = getLocale()
  // ── État principal ─────────────────────────────────────────────────
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")
  const [modeToutes, setModeToutes] = useState(true) // ⚡ par défaut = TOUTES périodes
  const nowMois = String(new Date().getMonth() + 1).padStart(2, "0")
  const [selectedMois, setSelectedMois] = useState(nowMois)
  const [selectedAnnee, setSelectedAnnee] = useState(String(new Date().getFullYear()))

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [runningAgent, setRunningAgent] = useState(false)
  const [validating, setValidating] = useState(false)
  const [activeTab, setActiveTab] = useState("a-valider")
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  // Multi-facture linking dialog state
  const [linkingTx, setLinkingTx] = useState<BankTx | null>(null)
  const [linkSelectedFids, setLinkSelectedFids] = useState<Set<string>>(new Set())
  const [linkFilter, setLinkFilter] = useState("")
  const [linking, setLinking] = useState(false)

  // Override de classification par tx : permet de changer le compte/classification
  // proposé par l'agent avant de valider (ex : E-PAYROLL classé "salaire_bulk"
  // alors que c'est un fournisseur de logiciel paie → reclasser en "fournisseur").
  const [classificationOverrides, setClassificationOverrides] = useState<
    Map<string, { classification: string; compte: string }>
  >(new Map())

  const setOverride = useCallback((txId: string, classification: string, compte: string) => {
    setClassificationOverrides((prev) => {
      const next = new Map(prev)
      next.set(txId, { classification, compte })
      return next
    })
  }, [])

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

  // ── Chargement société ────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then((r) => r.json())
      .then((d) => {
        const list: Societe[] = d.societes || []
        setSocietes(list)
        if (list.length === 1) setSelectedSociete(list[0].id)
      })
      .catch(() => {})
  }, [])

  // ── Chargement du PCM éditable de la société (menu de classification) ──
  // Les comptes du PCM société (comptes_societes) alimentent dynamiquement
  // le menu "Compte PCM". Fallback sur RECLASS_OPTIONS statique si vide.
  const [pcmOptions, setPcmOptions] = useState<typeof RECLASS_OPTIONS | null>(null)
  useEffect(() => {
    if (selectedSociete === "all" || !selectedSociete) { setPcmOptions(null); return }
    fetch(`/api/societes/${selectedSociete}/pcm/comptes`)
      .then((r) => r.json())
      .then((d) => {
        const comptes = (d?.comptes || []) as Array<{ numero: string; intitule: string; classe: number }>
        if (comptes.length === 0) { setPcmOptions(null); return }
        const CLASSE_GROUPS: Record<number, string> = {
          1: "Capitaux", 2: "Immobilisations", 3: "Stocks", 4: "Tiers",
          5: "Trésorerie", 6: "Charges", 7: "Produits", 8: "Spéciaux",
        }
        const opts = comptes.map((c) => ({
          value: c.numero,            // classification key = numéro de compte
          compte: c.numero,           // envoyé en compte_charge (prime backend)
          label: `${c.numero} — ${c.intitule}`,
          group: `Classe ${c.classe} — ${CLASSE_GROUPS[c.classe] || ""}`.trim(),
        }))
        setPcmOptions(opts)
      })
      .catch(() => setPcmOptions(null))
  }, [selectedSociete])

  // Options effectives : PCM société si dispo, sinon liste standard
  const reclassOptions = pcmOptions && pcmOptions.length > 0 ? pcmOptions : RECLASS_OPTIONS

  // ── Chargement données rapprochement ──────────────────────────────
  const load = useCallback(async () => {
    if (selectedSociete === "all") {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({ societe_id: selectedSociete })
      if (periodeDebut) params.set("date_debut", periodeDebut)
      if (periodeFin) params.set("date_fin", periodeFin)
      const res = await fetch(`/api/comptable/rapprochement?${params}`)
      const d = await res.json()
      setData(d)
    } catch (e) {
      showToast("Erreur chargement", "error")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [selectedSociete, periodeDebut, periodeFin, showToast])
  useEffect(() => {
    load()
  }, [load])

  // ── Reset selection on data change ─────────────────────────────────
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

  // ── Buckets par statut ────────────────────────────────────────────
  const proposes = useMemo(
    () => transactions.filter((t) => t.statut === "propose"),
    [transactions]
  )
  const aVerifier = useMemo(
    () => transactions.filter((t) => t.statut === "a_verifier"),
    [transactions]
  )
  const rapprochees = useMemo(
    () =>
      transactions.filter(
        (t) =>
          t.statut === "rapproche" ||
          (!t.statut &&
            (t.facture_id || (Array.isArray(t.facture_ids) && t.facture_ids.length > 0)))
      ),
    [transactions]
  )
  const orphelines = useMemo(
    () =>
      transactions.filter(
        (t) =>
          (t.statut === "non_identifie" || !t.statut) &&
          !t.facture_id &&
          !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0) &&
          !t.compte_comptable
      ),
    [transactions]
  )
  const totalSuggestions = proposes.length + aVerifier.length

  // ── Groupes pour le tab "À valider" ───────────────────────────────
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

  // ── Lancer Lex Banque (agent IA) ──────────────────────────────────
  const handleRunAgent = useCallback(async () => {
    if (selectedSociete === "all") return
    setRunningAgent(true)
    try {
      const body: any = { societe_id: selectedSociete, dry_run: false, min_confidence: 0.7 }
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
  }, [selectedSociete, periodeDebut, periodeFin, load, showToast])

  // ── Valider une tx (crée écriture BNQ) ────────────────────────────
  const validateOne = useCallback(
    async (
      tx: BankTx,
      opts?: { partiel?: boolean; allocations?: { facture_id: string; montant: number }[]; ecart_compte?: string; ecart_libelle?: string }
    ): Promise<{ ok: boolean; error?: string; lettre?: string }> => {
      const body: any = {
        societe_id: selectedSociete,
        transaction_id: tx.id,
        releve_id: tx.releve_id,
      }
      const fids = (Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
        ? tx.facture_ids
        : tx.facture_id
          ? [tx.facture_id]
          : []
      ).filter(Boolean)
      if (opts?.partiel && opts.allocations && opts.allocations.length > 0) {
        // Répartition d'un prélèvement sur 1..N factures (montant MUR par
        // facture, au moins une partielle) → action lettrer_partiel.
        body.action = "lettrer_partiel"
        body.allocations = opts.allocations
        // Qualification manuelle de l'écart (compte d'attente 471 / change / …)
        if (opts.ecart_compte) body.ecart_compte = opts.ecart_compte
        if (opts.ecart_libelle) body.ecart_libelle = opts.ecart_libelle
      } else if (fids.length > 0) {
        if (fids.length > 1) {
          body.action = "lettrer_multi"
          body.facture_ids = fids
        } else {
          body.action = "lettrer_manuel"
          body.facture_id = fids[0]
        }
      } else if (tx.compte_comptable && tx.classification) {
        body.action = "lettrer_manuel"
        // Si l'utilisateur a manuellement reclassé via le Select inline,
        // on utilise l'override au lieu de la proposition de l'agent.
        const override = classificationOverrides.get(tx.id)
        if (override) {
          body.classification = override.classification
          body.compte_charge = override.compte
        } else {
          body.classification = tx.classification
          body.compte_charge = tx.compte_comptable
        }
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
    [selectedSociete, classificationOverrides]
  )

  const handleValidateOne = async (tx: BankTx) => {
    const r = await validateOne(tx)
    if (!r.ok) return showToast(`Échec : ${r.error}`, "error")
    showToast(`Validé (${r.lettre || "—"}) — écriture BNQ créée`)
    load()
  }

  // ── Ouvrir le dialog de liaison manuelle multi-factures ──────────────
  const openLinkDialog = useCallback((tx: BankTx) => {
    const existing = Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
      ? tx.facture_ids
      : tx.facture_id
        ? [tx.facture_id]
        : []
    setLinkingTx(tx)
    setLinkSelectedFids(new Set(existing))
    setLinkFilter("")
  }, [])

  // ── Confirmer la liaison : appelle lettrer_multi/lettrer_manuel ──────
  const handleLinkConfirm = useCallback(async (
    payload?: { partiel?: boolean; allocations?: { facture_id: string; montant: number }[]; ecart_compte?: string; ecart_libelle?: string }
  ) => {
    if (!linkingTx) return
    const fids = Array.from(linkSelectedFids)
    if (fids.length === 0) {
      return showToast("Sélectionnez au moins une facture", "error")
    }
    const partiel = payload?.partiel === true
    setLinking(true)
    const txWithFids = { ...linkingTx, facture_ids: fids, facture_id: fids[0] }
    const r = await validateOne(txWithFids, {
      partiel,
      allocations: payload?.allocations,
      ecart_compte: payload?.ecart_compte,
      ecart_libelle: payload?.ecart_libelle,
    })
    setLinking(false)
    if (!r.ok) return showToast(`Échec : ${r.error}`, "error")
    if (partiel) {
      showToast(`Répartition enregistrée sur ${fids.length} facture${fids.length > 1 ? "s" : ""} — écritures BNQ créées (${r.lettre || "—"})`)
    } else {
      showToast(
        `${fids.length} facture${fids.length > 1 ? "s" : ""} liée${fids.length > 1 ? "s" : ""} — écriture BNQ créée (${r.lettre || "—"})`
      )
    }
    setLinkingTx(null)
    setLinkSelectedFids(new Set())
    load()
  }, [linkingTx, linkSelectedFids, validateOne, showToast, load])

  const handleRejectOne = async (tx: BankTx) => {
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rejeter_suggestion",
          societe_id: selectedSociete,
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
      if (n.has(id)) n.delete(id); else n.add(id)
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

  const canAct = selectedSociete !== "all"
  const total = transactions.length
  const tauxRapproche = total > 0 ? Math.round((rapprochees.length / total) * 100) : 0

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {/* Toast */}
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
                    {t('cab.rapprochement.ai_agent', locale)}
                  </Badge>
                </h1>
                <p className="text-sm text-purple-700/80 mt-0.5">
                  {t('cab.rapprochement.subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={load}
                disabled={loading || !canAct}
                size="sm"
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {t('cab.rapprochement.refresh', locale)}
              </Button>
              <Button
                onClick={handleRunAgent}
                disabled={runningAgent || !canAct}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md"
              >
                {runningAgent ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('cab.rapprochement.in_progress', locale)}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t('cab.rapprochement.run', locale)} {AGENT_NAME}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Sélecteurs */}
        <div className="flex gap-3 items-center flex-wrap">
          <div className="w-64">
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger>
                <SelectValue placeholder={t('cab.rapprochement.choose_company', locale)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('cab.rapprochement.choose_company_opt', locale)}</SelectItem>
                {societes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
              modeToutes ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-200"
            }`}
          >
            <CalendarDays
              className={`w-4 h-4 ${modeToutes ? "text-amber-600" : "text-blue-600"}`}
            />
            <span className="text-sm font-medium">{t('cab.rapprochement.period', locale)}</span>
            <button
              onClick={() => setModeToutes((v) => !v)}
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                modeToutes
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-white text-gray-500 border-gray-300 hover:border-blue-400"
              }`}
            >
              {t('cab.rapprochement.all', locale)}
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

        {!canAct ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('cab.rapprochement.select_company_hint', locale)} {AGENT_NAME}.
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard label={t('cab.rapprochement.kpi_total', locale)} value={total} />
              <KpiCard
                label={t('cab.rapprochement.kpi_to_validate', locale)}
                value={totalSuggestions}
                tone="amber"
                accent={totalSuggestions > 0}
              />
              <KpiCard label={t('cab.rapprochement.kpi_reconciled', locale)} value={rapprochees.length} tone="green" />
              <KpiCard label={t('cab.rapprochement.kpi_orphan', locale)} value={orphelines.length} tone="rose" />
              <KpiCard label={t('cab.rapprochement.kpi_rate', locale)} value={`${tauxRapproche}%`} tone="blue" />
            </div>

            {/* Tabs */}
            <Card>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="px-4 pt-2 bg-transparent border-b rounded-none w-full justify-start gap-1 h-auto">
                  <TabsTrigger
                    value="a-valider"
                    className="data-[state=active]:bg-amber-100 px-3 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5 text-amber-600" />{t('cab.rapprochement.tab_to_validate', locale)} (
                    {totalSuggestions})
                  </TabsTrigger>
                  <TabsTrigger value="rapprochees" className="px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-600" />
                    {t('cab.rapprochement.tab_reconciled', locale)} ({rapprochees.length})
                  </TabsTrigger>
                  <TabsTrigger value="orphelines" className="px-3 py-2">
                    <HelpCircle className="h-4 w-4 mr-1.5 text-rose-600" />
                    {t('cab.rapprochement.tab_orphan', locale)} ({orphelines.length})
                  </TabsTrigger>
                </TabsList>

                {/* À valider */}
                <TabsContent value="a-valider" className="p-4 space-y-5 mt-0">
                  {totalSuggestions === 0 ? (
                    <EmptyState
                      title={t('cab.rapprochement.empty_pending', locale)}
                      hint={t('cab.rapprochement.empty_pending_hint', locale)}
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
                                override={classificationOverrides.get(tx.id)}
                                onReclassify={g.type === "classification" ? setOverride : undefined}
                                reclassOptions={reclassOptions}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </TabsContent>

                {/* Rapprochées */}
                <TabsContent value="rapprochees" className="p-4 mt-0">
                  {rapprochees.length === 0 ? (
                    <EmptyState
                      title={t('cab.rapprochement.empty_reconciled', locale)}
                      hint={t('cab.rapprochement.empty_reconciled_hint', locale)}
                    />
                  ) : (
                    <div className="rounded border bg-card divide-y">
                      {rapprochees.map((tx) => (
                        <TxRow key={tx.id} tx={tx} facturesById={facturesById} />
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Orphelines */}
                <TabsContent value="orphelines" className="p-4 mt-0">
                  {orphelines.length === 0 ? (
                    <EmptyState
                      title={t('cab.rapprochement.empty_orphan', locale)}
                      hint={t('cab.rapprochement.empty_orphan_hint', locale)}
                    />
                  ) : (
                    <div className="rounded border bg-card divide-y">
                      {orphelines.map((tx) => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          facturesById={facturesById}
                          onLink={() => openLinkDialog(tx)}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </>
        )}
      </div>

      {/* Dialog : lier manuellement plusieurs factures à une transaction */}
      <LinkFacturesDialog
        tx={linkingTx}
        factures={factures}
        selectedFids={linkSelectedFids}
        setSelectedFids={setLinkSelectedFids}
        filter={linkFilter}
        setFilter={setLinkFilter}
        onClose={() => setLinkingTx(null)}
        onConfirm={handleLinkConfirm}
        loading={linking}
      />
    </ClientPageShell>
  )
}

// ── Dialog manuel : lier une transaction à plusieurs factures ──────────
function LinkFacturesDialog({
  tx,
  factures,
  selectedFids,
  setSelectedFids,
  filter,
  setFilter,
  onClose,
  onConfirm,
  loading,
}: {
  tx: BankTx | null
  factures: Facture[]
  selectedFids: Set<string>
  setSelectedFids: (s: Set<string>) => void
  filter: string
  setFilter: (s: string) => void
  onClose: () => void
  onConfirm: (payload?: { partiel?: boolean; allocations?: { facture_id: string; montant: number }[]; ecart_compte?: string; ecart_libelle?: string }) => void
  loading: boolean
}) {
  const open = tx !== null
  const txAmount = tx ? (tx.debit > 0 ? tx.debit : tx.credit) : 0
  const txDevise = (tx?.devise || "MUR").toUpperCase()

  // Solde restant (MUR) d'une facture.
  const remainingOf = (f: Facture) =>
    f.solde_non_paye != null
      ? Number(f.solde_non_paye)
      : Number(f.montant_mur) || Number(f.montant_ttc) || 0

  // Filtre par date de facture (plage) + montants affectés par facture
  // (répartition d'un prélèvement) — état local, réinitialisé à chaque
  // ouverture sur une nouvelle transaction.
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  // Qualification de l'écart (compte d'attente 471 / change / …) quand on solde
  // une facture pour un montant ≠ du prélèvement (règlement en devise).
  const [ecartType, setEcartType] = useState<EcartTypeChoice>("auto")
  useEffect(() => {
    setDateDebut("")
    setDateFin("")
    setAmounts({})
    setEcartType("auto")
  }, [tx?.id])

  // Pré-filtre par tiers détecté + texte saisi + plage de dates
  const filtered = useMemo(() => {
    if (!tx) return []
    const q = filter.trim().toLowerCase()
    const unpaid = factures.filter(
      (f) => f.statut !== "paye" && f.statut !== "annule"
    )
    return unpaid.filter((f) => {
      if (q) {
        const hay = `${f.numero_facture || ""} ${f.tiers || ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      const d = f.date_facture ? f.date_facture.slice(0, 10) : ""
      if (dateDebut && (!d || d < dateDebut)) return false
      if (dateFin && (!d || d > dateFin)) return false
      return true
    })
  }, [tx, factures, filter, dateDebut, dateFin])

  if (!tx) return null

  const toggle = (fid: string) => {
    const n = new Set(selectedFids)
    if (n.has(fid)) {
      n.delete(fid)
      setAmounts((prev) => {
        const cp = { ...prev }; delete cp[fid]; return cp
      })
    } else {
      n.add(fid)
      // Montant par défaut = reste À RÉPARTIR du prélèvement, plafonné au solde
      // de la facture (un virement plus petit se règle partiellement en 1 clic).
      const f = factures.find((x) => x.id === fid)
      if (f) {
        const usedByOthers = selectedFactures.reduce((s, x) => s + allocAmount(x), 0)
        const residual = Math.round((txAmount - usedByOthers) * 100) / 100
        const def = residual > 0 ? Math.min(remainingOf(f), residual) : remainingOf(f)
        setAmounts((prev) => ({ ...prev, [fid]: String(Math.round(def * 100) / 100) }))
      }
    }
    setSelectedFids(n)
  }

  // ── Répartition (montant affecté par facture) ──────────────────────────
  const selectedFactures = Array.from(selectedFids)
    .map((id) => factures.find((f) => f.id === id))
    .filter(Boolean) as Facture[]
  const allocAmount = (f: Facture) => {
    const raw = amounts[f.id]
    const n = raw == null || raw === "" ? remainingOf(f) : Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  const sumAlloc = Math.round(selectedFactures.reduce((s, f) => s + allocAmount(f), 0) * 100) / 100
  const diffAlloc = Math.round((txAmount - sumAlloc) * 100) / 100
  // Au moins une facture réglée partiellement (montant < solde) → répartition
  // via lettrer_partiel ; sinon lettrage complet classique.
  const hasPartial = selectedFactures.some((f) => allocAmount(f) < remainingOf(f) - 0.01)
  const anyOverSolde = selectedFactures.some((f) => allocAmount(f) > remainingOf(f) + 1)
  const anyNonPositive = selectedFactures.some((f) => allocAmount(f) <= 0)
  // L'écart (somme affectée − prélèvement) est autorisé : booké en
  // change/frais/acompte côté serveur. On ne bloque plus que les vraies erreurs.
  const allocValid = !anyOverSolde && !anyNonPositive
  // Traitement d'écart (affichage) — miroir de la logique serveur.
  const ecartTreatment = (() => {
    if (Math.abs(diffAlloc) <= 1) return null
    const ecartBrut = -diffAlloc // somme − prélèvement (A − P)
    const anyDevise = selectedFactures.some((f) => (f.devise || "MUR").toUpperCase() !== "MUR")
    const seuil = Math.max(50, 0.02 * txAmount)
    const allClient = selectedFactures.every((f) => f.type_facture !== "fournisseur")
    let compte: string
    let libelle: string
    if (ecartBrut > 0) {
      compte = anyDevise ? "656" : "6270"
      libelle = anyDevise ? "écart de change (perte)" : "frais bancaires"
    } else if (Math.abs(ecartBrut) > seuil) {
      compte = allClient ? "4191" : "409"
      libelle = allClient ? "acompte client" : "avance fournisseur"
    } else {
      compte = anyDevise ? "756" : "6270"
      libelle = anyDevise ? "écart de change (gain)" : "écart"
    }
    return { ecartBrut, compte, libelle }
  })()

  const handleConfirmClick = () => {
    if (hasPartial || ecartTreatment) {
      // diffAlloc = prélèvement − somme affectée (signe attendu par resolveEcartCompte)
      const ecartOverride =
        Math.abs(diffAlloc) > 1 ? resolveEcartCompte(ecartType, diffAlloc) : null
      onConfirm({
        partiel: true,
        allocations: selectedFactures.map((f) => ({
          facture_id: f.id,
          montant: Math.round(allocAmount(f) * 100) / 100,
        })),
        ...(ecartOverride
          ? { ecart_compte: ecartOverride.compte, ecart_libelle: ecartOverride.libelle }
          : {}),
      })
    } else {
      onConfirm({ partiel: false })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Lier la transaction à une ou plusieurs factures</DialogTitle>
          <DialogDescription>
            Cochez les factures correspondant à ce virement. Le total des factures
            doit approcher le montant de la transaction.
          </DialogDescription>
        </DialogHeader>

        {/* Résumé tx */}
        <div className="rounded border p-3 bg-muted/30 space-y-1 text-sm">
          <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
          <p className="font-medium break-words">{tx.libelle}</p>
          <p className="font-mono">
            {tx.debit > 0 ? "Débit" : "Crédit"} {fmt(txAmount)} {txDevise}
          </p>
          {tx.tiers_detecte && (
            <p className="text-xs text-muted-foreground">
              Tiers détecté : <span className="font-medium">{tx.tiers_detecte}</span>
            </p>
          )}
        </div>

        {/* Filtre texte */}
        <Input
          placeholder="Filtrer par numéro de facture ou tiers…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9"
        />

        {/* Filtre par date de facture (plage) */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">Date facture — du</label>
            <Input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">au</label>
            <Input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="h-9"
            />
          </div>
          {(dateDebut || dateFin) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setDateDebut("")
                setDateFin("")
              }}
            >
              Effacer
            </Button>
          )}
        </div>

        {/* Liste des factures avec checkbox */}
        <div className="flex-1 overflow-y-auto rounded border divide-y">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              Aucune facture impayée trouvée.
            </p>
          ) : (
            filtered.map((f) => {
              const checked = selectedFids.has(f.id)
              const monMur = Number(f.montant_mur) || Number(f.montant_ttc) || 0
              return (
                <label
                  key={f.id}
                  className={`flex items-start gap-3 p-2.5 hover:bg-muted/30 cursor-pointer ${
                    checked ? "bg-blue-50/50" : ""
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggle(f.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm">
                        {f.numero_facture || f.id.slice(0, 8)}
                      </span>
                      {f.tiers && (
                        <span className="text-xs text-muted-foreground">· {f.tiers}</span>
                      )}
                      {f.type_facture && (
                        <Badge variant="outline" className="text-[10px]">
                          {f.type_facture}
                        </Badge>
                      )}
                      {f.statut === "partiel" && (
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                          partiel
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(f.date_facture || "")} ·{" "}
                      <span className="font-mono">
                        {fmt(f.montant_ttc)} {f.devise || "MUR"}
                      </span>
                      {f.devise && f.devise !== "MUR" && (
                        <span className="font-mono text-muted-foreground">
                          {" "}≈ {fmt(monMur)} MUR
                        </span>
                      )}
                      {f.solde_non_paye != null && Number(f.solde_non_paye) > 0 && Number(f.solde_non_paye) < monMur - 1 && (
                        <span className="font-mono text-amber-700">
                          {" "}· reste {fmt(Number(f.solde_non_paye))} MUR
                        </span>
                      )}
                    </p>
                  </div>
                </label>
              )
            })
          )}
        </div>

        {/* Répartition : montant affecté à chaque facture sélectionnée.
            Par défaut = solde restant (lettrage complet). Réduire un montant
            sous le solde ⇒ paiement partiel (la facture reste « partiel »). */}
        {selectedFactures.length > 0 && (
          <div className="rounded border divide-y text-sm">
            <div className="px-2.5 py-1.5 bg-muted/30 text-xs font-medium flex items-center justify-between">
              <span>Montant affecté par facture (MUR)</span>
              <span className="text-muted-foreground">Solde restant</span>
            </div>
            {selectedFactures.map((f) => {
              const reste = remainingOf(f)
              const val = amounts[f.id] ?? String(Math.round(reste * 100) / 100)
              const cur = allocAmount(f)
              const over = cur > reste + 1
              const partial = cur < reste - 0.01
              return (
                <div key={f.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs">
                      {f.numero_facture || f.id.slice(0, 8)}
                    </span>
                    {f.tiers && (
                      <span className="text-xs text-muted-foreground"> · {f.tiers}</span>
                    )}
                    {partial && !over && (
                      <>
                        <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                          partiel
                        </Badge>
                        {/* Solder = imputer le solde complet → la facture est
                            soldée et le delta avec le prélèvement devient un
                            écart à qualifier (compte d'attente, change…). */}
                        <button
                          type="button"
                          onClick={() => {
                            setAmounts((prev) => ({ ...prev, [f.id]: String(Math.round(reste * 100) / 100) }))
                            setEcartType((prev) => (prev === "auto" ? "attente" : prev))
                          }}
                          className="ml-1 text-[10px] text-blue-600 underline hover:text-blue-800"
                        >
                          solder
                        </button>
                      </>
                    )}
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={val}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [f.id]: e.target.value }))
                    }
                    className={`h-8 w-32 text-right font-mono ${over ? "border-rose-400" : ""}`}
                  />
                  <span className="w-28 text-right font-mono text-xs text-muted-foreground">
                    {fmt(reste)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Total affecté vs prélèvement */}
        {selectedFactures.length > 0 && (
          <div
            className={`rounded border p-2.5 text-sm flex items-center justify-between ${
              Math.abs(diffAlloc) <= 1
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            <span>
              {selectedFactures.length} facture{selectedFactures.length > 1 ? "s" : ""} · affecté{" "}
              <span className="font-mono">{fmt(sumAlloc)} MUR</span>
              {hasPartial && (
                <span className="text-amber-700"> · répartition partielle</span>
              )}
            </span>
            <span className="font-mono text-xs">
              Prélèvement {fmt(txAmount)} {txDevise} · écart{" "}
              <span className={Math.abs(diffAlloc) <= 1 ? "" : "text-amber-700"}>
                {diffAlloc >= 0 ? "+" : ""}
                {fmt(diffAlloc)}
              </span>
            </span>
          </div>
        )}

        {!allocValid ? (
          <p className="text-xs text-rose-700">
            {anyOverSolde
              ? "Un montant dépasse le solde restant de sa facture."
              : "Chaque montant affecté doit être strictement positif."}
          </p>
        ) : ecartTreatment ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 space-y-1.5">
            <span className="text-xs text-amber-800">
              Écart de {fmt(Math.abs(ecartTreatment.ecartBrut))} MUR — où l'imputer&nbsp;?
            </span>
            <select
              value={ecartType}
              onChange={(e) => setEcartType(e.target.value as EcartTypeChoice)}
              className="w-full h-8 rounded border border-amber-300 bg-white px-2 text-xs"
            >
              {ECART_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {(() => {
              const disp =
                resolveEcartCompte(ecartType, diffAlloc) ?? {
                  compte: ecartTreatment.compte,
                  libelle: ecartTreatment.libelle,
                }
              return (
                <p className="text-[11px] text-amber-700 font-mono">
                  → {disp.compte} ({disp.libelle})
                </p>
              )
            })()}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirmClick}
            disabled={loading || selectedFids.size === 0 || !allocValid}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {hasPartial || ecartTreatment ? "Enregistrement…" : "Liaison…"}
              </>
            ) : ecartTreatment ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Solder + écart → {(resolveEcartCompte(ecartType, diffAlloc) ?? ecartTreatment).compte} ({selectedFactures.length})
              </>
            ) : hasPartial ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Enregistrer la répartition ({selectedFactures.length})
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                Lier {selectedFids.size} facture{selectedFids.size > 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Composants helpers (inline, pas d'import externe) ─────────────────

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

// Options de reclassification manuelle proposées dans le Select.
// Couvre les scénarios PCM (Plan Comptable Mauricien) les plus fréquents,
// regroupées par catégorie pour faciliter la navigation. L'utilisateur peut
// sélectionner pour override la proposition automatique de l'agent.
const RECLASS_OPTIONS: Array<{
  value: string // classification key (envoyée à l'API)
  compte: string // numero_compte PCG correspondant
  label: string // libellé affiché
  group: string // catégorie pour regroupement UI
}> = [
  // ── Tiers commerciaux ──────────────────────────────────────────────
  { group: "Tiers", value: "fournisseur", compte: "401", label: "401 — Fournisseurs" },
  { group: "Tiers", value: "client", compte: "411", label: "411 — Clients" },

  // ── Associés / Inter-sociétés ──────────────────────────────────────
  { group: "Associés / Groupe", value: "compte_courant_associe", compte: "455", label: "455 — CCA (Associé personne physique)" },
  { group: "Associés / Groupe", value: "remboursement_associe", compte: "108", label: "108 — Compte exploitant / personnel" },
  { group: "Associés / Groupe", value: "inter_societe", compte: "451", label: "451 — Comptes Groupe (DDS ↔ OCC)" },
  { group: "Associés / Groupe", value: "virement_inter_societe", compte: "467", label: "467 — Virements inter-sociétés en transit" },
  { group: "Associés / Groupe", value: "virement_interne", compte: "5800", label: "5800 — Intercompte (même société, 2 banques)" },

  // ── Personnel & Paie ───────────────────────────────────────────────
  { group: "Paie & Personnel", value: "salaire_bulk", compte: "4210", label: "4210 — Salaires nets à payer" },
  { group: "Paie & Personnel", value: "avance_personnel", compte: "425", label: "425 — Avances au personnel" },
  { group: "Paie & Personnel", value: "csg_salarie", compte: "4311", label: "4311 — CSG salarié à verser" },
  { group: "Paie & Personnel", value: "nsf_salarie", compte: "4312", label: "4312 — NSF salarié à verser" },
  { group: "Paie & Personnel", value: "csg_patronal", compte: "4321", label: "4321 — CSG patronal à verser" },
  { group: "Paie & Personnel", value: "nsf_patronal", compte: "4322", label: "4322 — NSF patronal à verser" },
  { group: "Paie & Personnel", value: "prgf", compte: "4323", label: "4323 — PRGF à verser" },
  { group: "Paie & Personnel", value: "training_levy_verser", compte: "4324", label: "4324 — Training Levy à verser" },
  { group: "Paie & Personnel", value: "paye_mra", compte: "4330", label: "4330 — PAYE à verser MRA" },

  // ── Fiscal / MRA ───────────────────────────────────────────────────
  { group: "Fiscal / MRA", value: "tva_deductible", compte: "44566", label: "44566 — TVA déductible" },
  { group: "Fiscal / MRA", value: "tva_collectee", compte: "44571", label: "44571 — TVA collectée" },
  { group: "Fiscal / MRA", value: "impot_societe", compte: "4444", label: "4444 — Impôt sur les sociétés (CIT)" },
  { group: "Fiscal / MRA", value: "patente", compte: "6354", label: "6354 — Patente / licence" },
  { group: "Fiscal / MRA", value: "training_levy", compte: "633", label: "633 — Training Levy HRDC" },
  { group: "Fiscal / MRA", value: "impot_taxe", compte: "635", label: "635 — Autres impôts & taxes" },

  // ── Achats & Marchandises ──────────────────────────────────────────
  { group: "Achats", value: "achats_matieres", compte: "601", label: "601 — Achats matières premières" },
  { group: "Achats", value: "achats_fournitures", compte: "602", label: "602 — Achats fournitures stockées" },
  { group: "Achats", value: "materiel", compte: "606", label: "606 — Achats non stockés divers" },
  { group: "Achats", value: "electricite", compte: "6061", label: "6061 — Électricité / Eau / Gaz" },
  { group: "Achats", value: "fournitures_bureau", compte: "6064", label: "6064 — Fournitures de bureau" },
  { group: "Achats", value: "consommables", compte: "6068", label: "6068 — Petit outillage / consommables" },

  // ── Services extérieurs ────────────────────────────────────────────
  { group: "Services extérieurs", value: "sous_traitance", compte: "611", label: "611 — Sous-traitance" },
  { group: "Services extérieurs", value: "leasing", compte: "612", label: "612 — Crédit-bail / Leasing" },
  { group: "Services extérieurs", value: "loyer", compte: "613", label: "613 — Locations / Loyer" },
  { group: "Services extérieurs", value: "entretien", compte: "615", label: "615 — Entretien & réparations" },
  { group: "Services extérieurs", value: "assurance", compte: "616", label: "616 — Assurances" },
  { group: "Services extérieurs", value: "documentation", compte: "618", label: "618 — Documentation / abonnements" },

  // ── Autres services extérieurs ─────────────────────────────────────
  { group: "Honoraires & comm.", value: "honoraires_juridiques", compte: "6225", label: "6225 — Honoraires juridiques / avocats" },
  { group: "Honoraires & comm.", value: "honoraires_comptables", compte: "6226", label: "6226 — Honoraires comptables / audit" },
  { group: "Honoraires & comm.", value: "honoraires", compte: "622", label: "622 — Honoraires divers" },
  { group: "Honoraires & comm.", value: "publicite", compte: "623", label: "623 — Publicité / marketing" },
  { group: "Honoraires & comm.", value: "cadeaux", compte: "6234", label: "6234 — Cadeaux / réceptions" },

  // ── Déplacements & logistique ──────────────────────────────────────
  { group: "Déplacements", value: "transport_achats", compte: "6241", label: "6241 — Transports sur achats" },
  { group: "Déplacements", value: "transport_ventes", compte: "6242", label: "6242 — Transports sur ventes" },
  { group: "Déplacements", value: "deplacement", compte: "6251", label: "6251 — Frais de déplacement personnel" },
  { group: "Déplacements", value: "missions", compte: "6256", label: "6256 — Missions / restauration" },

  // ── Télécom & frais bancaires ──────────────────────────────────────
  { group: "Télécom / Banque", value: "postaux", compte: "6261", label: "6261 — Frais postaux" },
  { group: "Télécom / Banque", value: "telecom", compte: "626", label: "626 — Télécom / Internet" },
  { group: "Télécom / Banque", value: "frais_bancaires", compte: "6271", label: "6271 — Services bancaires / commissions" },
  { group: "Télécom / Banque", value: "cotisations_pro", compte: "628", label: "628 — Cotisations professionnelles" },

  // ── Financier ──────────────────────────────────────────────────────
  { group: "Financier", value: "interets", compte: "6611", label: "6611 — Intérêts emprunts" },
  { group: "Financier", value: "interets_cca", compte: "6615", label: "6615 — Intérêts sur CCA" },
  { group: "Financier", value: "frais_financiers", compte: "6617", label: "6617 — Frais financiers divers" },
  { group: "Financier", value: "perte_change", compte: "666", label: "666 — Perte de change" },
  { group: "Financier", value: "gain_change", compte: "766", label: "766 — Gain de change" },

  // ── Produits ───────────────────────────────────────────────────────
  { group: "Produits", value: "prestation", compte: "706", label: "706 — Prestations de services" },
  { group: "Produits", value: "vente_marchandises", compte: "707", label: "707 — Ventes de marchandises" },
  { group: "Produits", value: "produit_divers", compte: "758", label: "758 — Produits divers" },
  { group: "Produits", value: "produit_exceptionnel", compte: "771", label: "771 — Produits exceptionnels" },

  // ── Immobilisations (acquisitions ponctuelles) ─────────────────────
  { group: "Immobilisations", value: "immo_informatique", compte: "2154", label: "2154 — Matériel informatique" },
  { group: "Immobilisations", value: "immo_bureau", compte: "2183", label: "2183 — Matériel & mobilier bureau" },

  // ── Divers / attente ───────────────────────────────────────────────
  { group: "Divers", value: "charge_diverse", compte: "658", label: "658 — Charges diverses de gestion" },
  { group: "Divers", value: "charge_exceptionnelle", compte: "671", label: "671 — Charges exceptionnelles" },
  { group: "Divers", value: "autre", compte: "471", label: "471 — Compte d'attente (à requalifier)" },
]

function SuggestionRow({
  tx,
  type,
  checked,
  onToggle,
  onValidate,
  onReject,
  facturesById,
  override,
  onReclassify,
  reclassOptions = RECLASS_OPTIONS,
}: {
  tx: BankTx
  type: "match" | "classification"
  checked: boolean
  onToggle: () => void
  onValidate: () => void
  onReject: () => void
  facturesById: Map<string, Facture>
  override?: { classification: string; compte: string }
  onReclassify?: (txId: string, classification: string, compte: string) => void
  reclassOptions?: typeof RECLASS_OPTIONS
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
          <p className="text-xs flex items-center gap-1.5 flex-wrap">
            <span className="text-muted-foreground">→ Compte PCM </span>
            {onReclassify ? (
              <Select
                value={override?.classification ?? (tx.classification || "")}
                onValueChange={(v) => {
                  const opt = reclassOptions.find((o) => o.value === v)
                  if (opt) onReclassify(tx.id, opt.value, opt.compte)
                }}
              >
                <SelectTrigger className="h-6 px-2 py-0 text-[10px] font-mono w-auto inline-flex min-w-[180px]">
                  <SelectValue placeholder={`${tx.compte_comptable || "?"} (${tx.classification || "?"})`}>
                    <span className="font-mono">
                      {override
                        ? `${override.compte} (${override.classification}) ✏️`
                        : `${tx.compte_comptable || "?"} (${tx.classification || "?"})`}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {(() => {
                    const grouped = new Map<string, typeof RECLASS_OPTIONS>()
                    for (const o of reclassOptions) {
                      if (!grouped.has(o.group)) grouped.set(o.group, [])
                      grouped.get(o.group)!.push(o)
                    }
                    return Array.from(grouped.entries()).map(([groupName, opts]) => (
                      <SelectGroup key={groupName}>
                        <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                          {groupName}
                        </SelectLabel>
                        {opts.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  })()}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {tx.compte_comptable || "?"}
                </Badge>
                <span className="text-muted-foreground"> ({tx.classification})</span>
              </>
            )}
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
  onLink,
}: {
  tx: BankTx
  facturesById: Map<string, Facture>
  onLink?: () => void
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
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <p
          className={`font-mono text-sm ${
            montant >= 0 ? "text-green-700" : "text-rose-700"
          }`}
        >
          {montant >= 0 ? "+" : ""}
          {fmt(montant)} {tx.devise || "MUR"}
        </p>
        {onLink && (
          <Button
            size="sm"
            variant="outline"
            onClick={onLink}
            className="h-7 text-xs"
          >
            <Link2 className="h-3.5 w-3.5 mr-1" />
            Lier factures
          </Button>
        )}
      </div>
    </div>
  )
}
