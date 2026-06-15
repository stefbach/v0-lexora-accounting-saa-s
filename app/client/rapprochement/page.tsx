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
import Link from "next/link"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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
  Edit3,
  Link2,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

const AGENT_NAME = "Lex Banque"

function getMois(locale: Locale) {
  return [
    { val: "01", label: t('acc.rap.month_jan', locale) },
    { val: "02", label: t('acc.rap.month_feb', locale) },
    { val: "03", label: t('acc.rap.month_mar', locale) },
    { val: "04", label: t('acc.rap.month_apr', locale) },
    { val: "05", label: t('acc.rap.month_may', locale) },
    { val: "06", label: t('acc.rap.month_jun', locale) },
    { val: "07", label: t('acc.rap.month_jul', locale) },
    { val: "08", label: t('acc.rap.month_aug', locale) },
    { val: "09", label: t('acc.rap.month_sep', locale) },
    { val: "10", label: t('acc.rap.month_oct', locale) },
    { val: "11", label: t('acc.rap.month_nov', locale) },
    { val: "12", label: t('acc.rap.month_dec', locale) },
  ]
}
const ANNEES = ["2024", "2025", "2026", "2027"]

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d: string | null | undefined, locale: Locale = 'fr'): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
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
  debit_mur?: number | null
  credit_mur?: number | null
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

export default function ClientRapprochementPage() {
  const locale = getLocale()
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
  // Affect dialog : tx ciblée pour imputation manuelle
  const [affectTx, setAffectTx] = useState<BankTx | null>(null)

  // Override de classification par tx (override de la proposition agent
  // via Select inline dans SuggestionRow). Cf comptable/rapprochement/page.tsx.
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
      showToast(t('acc.rap.load_error', locale), "error")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [societeId, periodeDebut, periodeFin, showToast, locale])
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
    for (const tx of transactions) {
      const id = tx.releve_id || ""
      const banque = tx.banque || ""
      const devise = tx.devise || "MUR"
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
    for (const tx of transactions) {
      if (tx.tiers_detecte) set.add(tx.tiers_detecte)
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
      out = out.filter((tx) => {
        const fids =
          Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
            ? tx.facture_ids
            : tx.facture_id
              ? [tx.facture_id]
              : []
        if (fids.length === 0) {
          // Pour les classifications ou orphelines, sens = signe du montant
          if (filtreSens === "client") return tx.credit > 0 // entrée
          if (filtreSens === "fournisseur") return tx.debit > 0 // sortie
          return true
        }
        // Sinon on vérifie le type des factures liées
        const linked = fids.map((id) => factures.find((f) => f.id === id)).filter(Boolean) as Facture[]
        return linked.some((f) => f.type_facture === filtreSens)
      })
    }
    if (filtreCompte !== "all") {
      out = out.filter((tx) => {
        const banque = tx.banque || ""
        const devise = tx.devise || "MUR"
        return banque + "|" + devise === filtreCompte
      })
    }
    if (filtreTiers !== "all") {
      out = out.filter((tx) => {
        if (tx.tiers_detecte === filtreTiers) return true
        const fids =
          Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
            ? tx.facture_ids
            : tx.facture_id
              ? [tx.facture_id]
              : []
        const linked = fids.map((id) => factures.find((f) => f.id === id)).filter(Boolean) as Facture[]
        return linked.some((f) => f.tiers === filtreTiers)
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(
        (tx) =>
          tx.libelle.toLowerCase().includes(q) ||
          tx.tiers_detecte?.toLowerCase().includes(q) ||
          tx.compte_comptable?.includes(q) ||
          tx.lettre?.toLowerCase().includes(q) ||
          String(tx.debit).includes(q) ||
          String(tx.credit).includes(q)
      )
    }
    return out
  }

  const proposes = useMemo(
    () => applyFilters(transactions.filter((tx) => tx.statut === "propose")),
    [transactions, search, filtreSens, filtreCompte, filtreTiers, factures]
  )
  const aVerifier = useMemo(
    () => applyFilters(transactions.filter((tx) => tx.statut === "a_verifier")),
    [transactions, search, filtreSens, filtreCompte, filtreTiers, factures]
  )
  const rapprochees = useMemo(
    () =>
      applyFilters(
        transactions.filter(
          (tx) =>
            tx.statut === "rapproche" ||
            (!tx.statut &&
              (tx.facture_id || (Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0)))
        )
      ),
    [transactions, search, filtreSens, filtreCompte, filtreTiers, factures]
  )
  const orphelines = useMemo(
    () =>
      applyFilters(
        transactions.filter(
          (tx) =>
            (tx.statut === "non_identifie" || !tx.statut) &&
            !tx.facture_id &&
            !(Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0) &&
            !tx.compte_comptable
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

  // Catégorise une suggestion en mode "comptable" plutôt que par source algo/IA :
  //   - encaissements_client : match avec une facture client (entrée banque)
  //   - paiements_fournisseur : match avec une facture fournisseur (sortie)
  //   - frais_bancaires       : classification frais bancaires/agios/intérêts
  //   - salaires              : classification salaire bulk ou individuel
  //   - mra                   : paiement MRA / charges sociales
  //   - intercompte           : virement entre comptes d'une MÊME société → 5800
  //   - inter_societes        : virement entre DEUX sociétés du groupe (DDS↔OCC) → 451
  //   - autres                : tout le reste (typiquement matches IA cross)
  function classifyBucket(
    tx: BankTx
  ):
    | "encaissements_client"
    | "paiements_fournisseur"
    | "frais_bancaires"
    | "salaires"
    | "mra"
    | "intercompte"
    | "inter_societes"
    | "autres" {
    const cls = (tx.classification || tx.classification_suggestion?.type || "").toLowerCase()
    if (cls === "frais_bancaires" || cls === "interets" || cls === "agios") return "frais_bancaires"
    if (cls === "salaire_bulk" || cls === "salaire_individuel" || cls === "reversal_salaire") return "salaires"
    if (cls === "paiement_mra" || cls === "charges_sociales") return "mra"
    if (cls === "inter_societe" || cls === "inter_societes") return "inter_societes"
    if (cls === "virement_interne" || cls === "transfert_interne" || cls === "intercompte") return "intercompte"
    const fids =
      Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
        ? tx.facture_ids
        : tx.facture_id
          ? [tx.facture_id]
          : []
    if (fids.length > 0) {
      const linked = fids.map((id) => factures.find((f) => f.id === id)).filter(Boolean) as Facture[]
      if (linked.some((f) => f.type_facture === "client")) return "encaissements_client"
      if (linked.some((f) => f.type_facture === "fournisseur")) return "paiements_fournisseur"
      // Fallback sur le sens du montant
      if (tx.credit > 0) return "encaissements_client"
      if (tx.debit > 0) return "paiements_fournisseur"
    }
    return "autres"
  }

  const groups = useMemo(() => {
    type Grp = {
      key: string
      title: string
      desc: string
      icon: string
      color: string
      items: BankTx[]
    }
    const all = [...proposes, ...aVerifier]
    const buckets = {
      encaissements_client: [] as BankTx[],
      paiements_fournisseur: [] as BankTx[],
      frais_bancaires: [] as BankTx[],
      salaires: [] as BankTx[],
      mra: [] as BankTx[],
      intercompte: [] as BankTx[],
      inter_societes: [] as BankTx[],
      autres: [] as BankTx[],
    }
    for (const tx of all) {
      const b = classifyBucket(tx)
      buckets[b].push(tx)
    }
    const g: Grp[] = []
    if (buckets.encaissements_client.length)
      g.push({
        key: "encaissements_client",
        title: t('acc.rap.encaiss_title', locale),
        desc: t('acc.rap.encaiss_desc', locale),
        icon: "📥",
        color: "border-green-300 bg-green-50",
        items: buckets.encaissements_client,
      })
    if (buckets.paiements_fournisseur.length)
      g.push({
        key: "paiements_fournisseur",
        title: t('acc.rap.paiem_title', locale),
        desc: t('acc.rap.paiem_desc', locale),
        icon: "📤",
        color: "border-rose-300 bg-rose-50",
        items: buckets.paiements_fournisseur,
      })
    if (buckets.mra.length)
      g.push({
        key: "mra",
        title: t('acc.rap.mra_title', locale),
        desc: t('acc.rap.mra_desc', locale),
        icon: "🏛️",
        color: "border-red-300 bg-red-50",
        items: buckets.mra,
      })
    if (buckets.frais_bancaires.length)
      g.push({
        key: "frais_bancaires",
        title: t('acc.rap.frais_title', locale),
        desc: t('acc.rap.frais_desc', locale),
        icon: "💳",
        color: "border-orange-300 bg-orange-50",
        items: buckets.frais_bancaires,
      })
    if (buckets.salaires.length)
      g.push({
        key: "salaires",
        title: t('acc.rap.sal_title', locale),
        desc: t('acc.rap.sal_desc', locale),
        icon: "💸",
        color: "border-purple-300 bg-purple-50",
        items: buckets.salaires,
      })
    if (buckets.intercompte.length)
      g.push({
        key: "intercompte",
        title: "Virements intercompte (même société)",
        desc: "Transferts entre 2 comptes bancaires de la même société (ex DDS MCB → DDS SBM). Compte de transit 5800 — solde doit revenir à 0 après le pendant.",
        icon: "🔄",
        color: "border-blue-300 bg-blue-50",
        items: buckets.intercompte,
      })
    if (buckets.inter_societes.length)
      g.push({
        key: "inter_societes",
        title: "Virements inter-sociétés (groupe DDS ↔ OCC)",
        desc: "Transferts entre 2 sociétés du même groupe. Compte courant Groupe 451 (IAS 24 related parties). Pas de transit — créance/dette permanente.",
        icon: "🤝",
        color: "border-indigo-300 bg-indigo-50",
        items: buckets.inter_societes,
      })
    if (buckets.autres.length)
      g.push({
        key: "autres",
        title: t('acc.rap.others_title', locale),
        desc: t('acc.rap.others_desc', locale),
        icon: "❓",
        color: "border-slate-300 bg-slate-50",
        items: buckets.autres,
      })
    return g
  }, [proposes, aVerifier, factures, locale])

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
        showToast(d?.error || t('acc.rap.error_autoletter', locale), "error")
        return
      }
      showToast(
        t('acc.rap.autoletter_msg', locale).replace('{n}', String(d.matched || 0))
      )
      load()
    } catch (e: any) {
      showToast(`${t('acc.rap.error_label', locale)} : ${e?.message || t('acc.rap.network_error', locale)}`, "error")
    } finally {
      setAutoLettrage(false)
    }
  }, [societeId, periodeDebut, periodeFin, load, showToast, locale])

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
        showToast(d?.error || t('acc.rap.error_classif', locale), "error")
        return
      }
      showToast(
        t('acc.rap.classif_msg', locale).replace('{n}', String(d.classified || d.matched || 0))
      )
      load()
    } catch (e: any) {
      showToast(`${t('acc.rap.error_label', locale)} : ${e?.message || t('acc.rap.network_error', locale)}`, "error")
    } finally {
      setReclassifying(false)
    }
  }, [societeId, periodeDebut, periodeFin, load, showToast, locale])

  const handleRunAgent = useCallback(
    async (withAi = false) => {
      if (!societeId) return
      setRunningAgent(true)
      try {
        // Par défaut : sans couche IA Claude (rapide, ~2s, ne bloque pas).
        // Avec IA : appel Claude pour les cas ambigus (~30s, +5-15 matches sémantiques).
        const body: any = {
          societe_id: societeId,
          dry_run: false,
          min_confidence: 0.8, // strict — préfère rater un match plutôt que d'en proposer un faux
          use_semantic: withAi,
        }
        if (periodeDebut) body.date_debut = periodeDebut
        if (periodeFin) body.date_fin = periodeFin
        const res = await fetch("/api/agent/rapprochement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) {
          showToast(d?.error || t('acc.rap.error_run', locale).replace('{agent}', AGENT_NAME), "error")
          return
        }
        const total =
          (d.stats?.matched || 0) +
          (d.stats?.classified || 0) +
          (d.stats?.semantic_matches || 0) +
          (d.stats?.semantic_classifications || 0)
        showToast(
          t('acc.rap.lex_msg', locale)
            .replace('{agent}', AGENT_NAME)
            .replace('{ai}', withAi ? t('acc.rap.with_ai', locale) : '')
            .replace('{n}', String(total))
            .replace('{w}', String(d.writes?.transactions_modifiees || 0))
        )
        load()
      } catch (e: any) {
        showToast(`${t('acc.rap.error_run', locale).replace('{agent}', AGENT_NAME)} : ${e?.message || t('acc.rap.network_error', locale)}`, "error")
      } finally {
        setRunningAgent(false)
      }
    },
    [societeId, periodeDebut, periodeFin, load, showToast, locale]
  )

  const validateOne = useCallback(
    async (tx: BankTx): Promise<{ ok: boolean; error?: string; lettre?: string }> => {
      if (!societeId) return { ok: false, error: t('acc.rap.company_missing', locale) }
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
        // Override manuel via le Select inline (cf state classificationOverrides)
        const override = classificationOverrides.get(tx.id)
        if (override) {
          body.classification = override.classification
          body.compte_charge = override.compte
        } else {
          body.classification = tx.classification
          body.compte_charge = tx.compte_comptable
        }
      } else {
        return { ok: false, error: t('acc.rap.suggestion_incomplete', locale) }
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
        return { ok: false, error: e?.message || t('acc.rap.network_error', locale) }
      }
    },
    [societeId, locale, classificationOverrides]
  )

  const handleValidateOne = async (tx: BankTx) => {
    const r = await validateOne(tx)
    if (!r.ok) return showToast(`${t('acc.rap.fail', locale)} : ${r.error}`, "error")
    showToast(t('acc.rap.validated_lettre', locale).replace('{l}', r.lettre || "—"))
    load()
  }

  // Imputation manuelle d'une tx : soit liée à une facture, soit imputée
  // sur un compte PCM de la classe choisie (CCA, salaires, frais, etc.).
  const handleAffectManual = useCallback(
    async (
      tx: BankTx,
      mode: "facture" | "pcm",
      payload: { facture_id?: string; classification?: string; compte_charge?: string }
    ): Promise<{ ok: boolean; error?: string; lettre?: string }> => {
      if (!societeId) return { ok: false, error: t('acc.rap.company_missing', locale) }
      const body: any = {
        societe_id: societeId,
        transaction_id: tx.id,
        releve_id: tx.releve_id,
        action: "lettrer_manuel",
      }
      if (mode === "facture" && payload.facture_id) {
        body.facture_id = payload.facture_id
      } else if (mode === "pcm" && payload.compte_charge) {
        body.classification = payload.classification || "manuel"
        body.compte_charge = payload.compte_charge
      } else {
        return { ok: false, error: t('acc.rap.params_invalid', locale) }
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
        return { ok: false, error: e?.message || t('acc.rap.network_error', locale) }
      }
    },
    [societeId, locale]
  )

  // Lettrage multi-factures / partiel : groupe plusieurs factures sur un
  // règlement (facture_ids → lettrer_multi) ou répartit un règlement avec
  // au moins une facture partielle (allocations → lettrer_partiel).
  const handleAffectFactures = useCallback(
    async (
      tx: BankTx,
      payload: { facture_ids?: string[]; allocations?: { facture_id: string; montant: number }[]; partiel?: boolean }
    ): Promise<{ ok: boolean; error?: string; lettre?: string; ecart?: { compte: string; montant: number; libelle: string } | null }> => {
      if (!societeId) return { ok: false, error: t('acc.rap.company_missing', locale) }
      const body: any = {
        societe_id: societeId,
        transaction_id: tx.id,
        releve_id: tx.releve_id,
      }
      if (payload.partiel && payload.allocations && payload.allocations.length > 0) {
        body.action = "lettrer_partiel"
        body.allocations = payload.allocations
      } else if (payload.facture_ids && payload.facture_ids.length > 1) {
        body.action = "lettrer_multi"
        body.facture_ids = payload.facture_ids
      } else if (payload.facture_ids && payload.facture_ids.length === 1) {
        body.action = "lettrer_manuel"
        body.facture_id = payload.facture_ids[0]
      } else {
        return { ok: false, error: t('acc.rap.params_invalid', locale) }
      }
      try {
        const res = await fetch("/api/comptable/rapprochement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (!res.ok) return { ok: false, error: d?.error || `HTTP ${res.status}` }
        return { ok: true, lettre: d?.lettre, ecart: d?.ecart ?? null }
      } catch (e: any) {
        return { ok: false, error: e?.message || t('acc.rap.network_error', locale) }
      }
    },
    [societeId, locale]
  )

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
      if (!res.ok) return showToast(d?.error || t('acc.rap.reject_impossible', locale), "error")
      showToast(t('acc.rap.suggestion_rejected', locale))
      load()
    } catch (e: any) {
      showToast(e?.message || t('acc.rap.error_reject', locale), "error")
    }
  }

  const handleValidateBatch = async (items: BankTx[]) => {
    if (items.length === 0) return showToast(t('acc.rap.nothing_checked', locale), "error")
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
    if (errors.length === 0) showToast(t('acc.rap.batch_ok', locale).replace('{n}', String(ok)))
    else showToast(t('acc.rap.batch_mixed', locale).replace('{ok}', String(ok)).replace('{ko}', String(errors.length)).replace('{first}', errors[0]), "error")
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
      const all = items.every((tx) => n.has(tx.id))
      for (const tx of items) {
        if (all) n.delete(tx.id)
        else n.add(tx.id)
      }
      return n
    })

  const total = transactions.length
  const tauxRapproche = total > 0 ? Math.round((rapprochees.length / total) * 100) : 0

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        <AffectDialog
          tx={affectTx}
          factures={factures}
          allTransactions={transactions}
          onClose={() => setAffectTx(null)}
          onAffect={handleAffectManual}
          onAffectFactures={handleAffectFactures}
          showToast={showToast}
          onReload={load}
          locale={locale}
        />
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
                    {t('acc.rap.ai_agent', locale)}
                  </Badge>
                </h1>
                <p className="text-sm text-purple-700/80 mt-0.5">
                  {t('acc.rap.subtitle', locale)}
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
                {t('common.refresh', locale)}
              </Button>
              <Button
                onClick={() => handleRunAgent(false)}
                disabled={runningAgent || !societeId}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-md"
                title="Algo pur, ~2 secondes"
              >
                {runningAgent ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('acc.rap.running', locale)}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t('acc.rap.run', locale)} {AGENT_NAME}
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleRunAgent(true)}
                disabled={runningAgent || !societeId}
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
                title="Approfondit avec l'IA Claude (~30s) sur les cas ambigus"
              >
                <Bot className="h-4 w-4 mr-1.5" />
                {t('acc.rap.deepen_ai', locale)}
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
            <span className="text-sm font-medium">{t('acc.rap.period', locale)} :</span>
            <button
              onClick={() => setModeToutes((v) => !v)}
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                modeToutes
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-white text-gray-500 border-gray-300 hover:border-blue-400"
              }`}
            >
              {t('acc.rap.all', locale)}
            </button>
            {!modeToutes && (
              <>
                <Select value={selectedMois} onValueChange={setSelectedMois}>
                  <SelectTrigger className="w-32 h-8 border-0 bg-transparent text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getMois(locale).map((m) => (
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
                <span className="font-medium">{t('acc.rap.how_works_title', locale)}</span> {t('acc.rap.how_works_desc', locale)}
              </p>
              <p>
                <span className="font-medium">{t('acc.rap.three_ways', locale)}</span>
              </p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  <span className="font-medium text-purple-700">{t('acc.rap.way_lex_banque', locale)}</span> — {t('acc.rap.way_lex_banque_desc', locale)}
                </li>
                <li>
                  <span className="font-medium text-blue-700">{t('acc.rap.way_auto', locale)}</span> — {t('acc.rap.way_auto_desc', locale)}
                </li>
                <li>
                  <span className="font-medium text-green-700">{t('acc.rap.way_classif', locale)}</span> — {t('acc.rap.way_classif_desc', locale)}
                </li>
              </ul>
              <p>
                {t('acc.rap.suggestions_in_tab', locale)} <span className="font-medium">{t('acc.rap.to_validate_tab', locale)}</span>{t('acc.rap.suggestions_tail', locale)}
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
                {t('acc.rap.auto_match_btn', locale)}
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
                {t('acc.rap.classification_btn', locale)}
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
                  placeholder={t('acc.rap.search_placeholder', locale)}
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
                  <SelectItem value="all">{t('acc.rap.sens_all', locale)}</SelectItem>
                  <SelectItem value="client">{t('acc.rap.sens_clients', locale)}</SelectItem>
                  <SelectItem value="fournisseur">{t('acc.rap.sens_suppliers', locale)}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtreCompte} onValueChange={setFiltreCompte}>
                <SelectTrigger className="h-9 w-52">
                  <Landmark className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder={t('acc.rap.bank_account_ph', locale)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('acc.rap.all_banks', locale)}</SelectItem>
                  {comptesUniques.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtreTiers} onValueChange={setFiltreTiers}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue placeholder={t('acc.rap.tiers_ph', locale)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('acc.rap.all_tiers', locale)}</SelectItem>
                  {tiersList.slice(0, 100).map((tr) => (
                    <SelectItem key={tr} value={tr}>
                      {tr.length > 50 ? tr.slice(0, 47) + "…" : tr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilter && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs">
                  {t('acc.rap.reset', locale)}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('acc.rap.no_company', locale)}
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard label={t('acc.rap.kpi_total_tx', locale)} value={total} />
              <KpiCard
                label={t('acc.rap.kpi_to_validate', locale)}
                value={totalSuggestions}
                tone="amber"
                accent={totalSuggestions > 0}
              />
              <KpiCard label={t('acc.rap.kpi_reconciled', locale)} value={rapprochees.length} tone="green" />
              <KpiCard label={t('acc.rap.kpi_orphans', locale)} value={orphelines.length} tone="rose" />
              <KpiCard label={t('acc.rap.kpi_rate', locale)} value={`${tauxRapproche}%`} tone="blue" />
            </div>

            <Card>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="px-4 pt-2 bg-transparent border-b rounded-none w-full justify-start gap-1 h-auto">
                  <TabsTrigger
                    value="a-valider"
                    className="data-[state=active]:bg-amber-100 px-3 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 mr-1.5 text-amber-600" />{t('acc.rap.tab_to_validate', locale)} (
                    {totalSuggestions})
                  </TabsTrigger>
                  <TabsTrigger value="rapprochees" className="px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-600" />
                    {t('acc.rap.tab_reconciled', locale)} ({rapprochees.length})
                  </TabsTrigger>
                  <TabsTrigger value="orphelines" className="px-3 py-2">
                    <HelpCircle className="h-4 w-4 mr-1.5 text-rose-600" />
                    {t('acc.rap.tab_orphans', locale)} ({orphelines.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="a-valider" className="p-4 space-y-5 mt-0">
                  {totalSuggestions === 0 ? (
                    <EmptyState
                      title={t('acc.rap.empty_no_pending_title', locale)}
                      hint={t('acc.rap.empty_no_pending_hint', locale).replace('{agent}', AGENT_NAME)}
                    />
                  ) : (
                    groups.map((g) => {
                      const selectedCount = g.items.filter((tx) => selectedTxIds.has(tx.id)).length
                      const allChecked =
                        selectedCount === g.items.length && g.items.length > 0
                      // Total montant du groupe (en devise principale, agrégé en valeur absolue)
                      const totalGroupAmount = g.items.reduce(
                        (s, tx) => s + Math.max(tx.debit || 0, tx.credit || 0),
                        0
                      )
                      return (
                        <div key={g.key} className={`rounded border-2 ${g.color}`}>
                          <div className="flex items-center justify-between gap-2 p-3 border-b bg-white/60 flex-wrap">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Checkbox
                                checked={allChecked}
                                onCheckedChange={() => toggleAllInGroup(g.items)}
                              />
                              <div className="text-2xl">{g.icon}</div>
                              <div className="min-w-0">
                                <h3 className="font-semibold text-sm flex items-center gap-2">
                                  {g.title}
                                  <Badge variant="outline" className="text-[10px]">
                                    {g.items.length} tx · {fmt(totalGroupAmount)}
                                  </Badge>
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
                                      g.items.filter((tx) => selectedTxIds.has(tx.id))
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
                                  {t('acc.rap.validate_n', locale).replace('{n}', String(selectedCount))}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleValidateBatch(g.items)}
                                  disabled={validating}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                  {t('acc.rap.validate_all_n', locale).replace('{n}', String(g.items.length))}
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="bg-white">
                            {g.items.map((tx) => (
                              <SuggestionRow
                                key={tx.id}
                                tx={tx}
                                type={tx.facture_id || (Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0) ? "match" : "classification"}
                                checked={selectedTxIds.has(tx.id)}
                                onToggle={() => toggleTx(tx.id)}
                                onValidate={() => handleValidateOne(tx)}
                                onReject={() => handleRejectOne(tx)}
                                facturesById={facturesById}
                                locale={locale}
                                override={classificationOverrides.get(tx.id)}
                                onReclassify={setOverride}
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
                      title={t('acc.rap.empty_no_reconciled_title', locale)}
                      hint={t('acc.rap.empty_no_reconciled_hint', locale)}
                    />
                  ) : (
                    <div className="rounded border bg-card divide-y">
                      {rapprochees.map((tx) => (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          facturesById={facturesById}
                          locale={locale}
                          onModifier={async () => {
                            // 1) délettre
                            try {
                              const res = await fetch("/api/comptable/rapprochement", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  action: "delettrer",
                                  societe_id: societeId,
                                  transaction_id: tx.id,
                                  releve_id: tx.releve_id,
                                  facture_id: tx.facture_id,
                                }),
                              })
                              if (!res.ok) {
                                const d = await res.json().catch(() => null)
                                showToast(d?.error || t('acc.rap.delettrage_failed', locale), "error")
                                return
                              }
                            } catch (e: any) {
                              showToast(e?.message || t('acc.rap.network_error', locale), "error")
                              return
                            }
                            // 2) ouvre le dialog Imputer pour re-affecter
                            await load()
                            setAffectTx(tx)
                            showToast(t('acc.rap.recon_cancelled', locale))
                          }}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="orphelines" className="p-4 mt-0">
                  {orphelines.length === 0 ? (
                    <EmptyState
                      title={t('acc.rap.empty_no_orphan_title', locale)}
                      hint={t('acc.rap.empty_no_orphan_hint', locale)}
                    />
                  ) : (
                    <div className="rounded border bg-card divide-y">
                      {orphelines.map((tx) => (
                        <TxRow key={tx.id} tx={tx} facturesById={facturesById} locale={locale} onImputer={() => setAffectTx(tx)} />
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

const RECLASS_OPTIONS_CLIENT: Array<{ value: string; compte: string; label: string }> = [
  { value: "fournisseur", compte: "401", label: "401 — Fournisseur" },
  { value: "client", compte: "411", label: "411 — Client" },
  { value: "salaire_bulk", compte: "4210", label: "4210 — Salaires nets" },
  { value: "charges_sociales", compte: "4421", label: "4421 — PAYE / MRA" },
  { value: "nsf_csg", compte: "4431", label: "4431 — NSF / CSG" },
  { value: "tva", compte: "4471", label: "4471 — TVA" },
  { value: "inter_societe", compte: "451", label: "451 — Inter-sociétés (DDS ↔ OCC, groupe)" },
  { value: "compte_courant_associe", compte: "455", label: "455 — CCA (Associé personne physique)" },
  { value: "virement_interne", compte: "5800", label: "5800 — Intercompte (même société, 2 banques)" },
  { value: "frais_bancaires", compte: "6271", label: "6271 — Services bancaires" },
  { value: "interets", compte: "6611", label: "6611 — Intérêts" },
  { value: "loyer", compte: "613", label: "613 — Locations / Loyer" },
  { value: "electricite", compte: "6061", label: "6061 — Électricité / Eau" },
  { value: "telecom", compte: "626", label: "626 — Télécommunications" },
  { value: "assurance", compte: "616", label: "616 — Assurances" },
  { value: "autre", compte: "658", label: "658 — Charges diverses" },
]

function SuggestionRow({
  tx,
  type,
  checked,
  onToggle,
  onValidate,
  onReject,
  facturesById,
  locale,
  override,
  onReclassify,
}: {
  tx: BankTx
  type: "match" | "classification"
  checked: boolean
  onToggle: () => void
  onValidate: () => void
  onReject: () => void
  facturesById: Map<string, Facture>
  locale: Locale
  override?: { classification: string; compte: string }
  onReclassify?: (txId: string, classification: string, compte: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const montant = tx.debit > 0 ? -tx.debit : tx.credit
  const fids =
    Array.isArray(tx.facture_ids) && tx.facture_ids.length > 0
      ? tx.facture_ids
      : tx.facture_id
        ? [tx.facture_id]
        : []
  const factures = fids.map((id) => facturesById.get(id)).filter(Boolean) as Facture[]
  // Calcul écart match (en MUR équivalent si fournis, sinon devise origine)
  const factureTotal = factures.reduce(
    (s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0),
    0
  )
  const txMontantMur = tx.debit_mur ?? tx.credit_mur ?? Math.abs(montant)
  const ecart = Math.abs(Math.abs(txMontantMur) - factureTotal)
  const ecartPct = factureTotal > 0 ? (ecart / factureTotal) * 100 : 0

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-start gap-3 p-3 hover:bg-muted/20">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 space-y-1.5 text-left cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{formatDate(tx.date, locale)}</p>
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
                    {t('acc.rap.invoice', locale)} <span className="font-mono">{f.numero_facture || f.id.slice(0, 8)}</span>
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
                <span className="italic text-muted-foreground">{t('acc.rap.invoice_unfound', locale)}</span>
              )}
            </p>
          ) : (
            <p className="text-xs flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground">{t('acc.rap.pcm_arrow', locale)} </span>
              {onReclassify ? (
                <Select
                  value={override?.classification ?? (tx.classification || "")}
                  onValueChange={(v) => {
                    const opt = RECLASS_OPTIONS_CLIENT.find((o) => o.value === v)
                    if (opt) onReclassify(tx.id, opt.value, opt.compte)
                  }}
                >
                  <SelectTrigger
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 px-2 py-0 text-[10px] font-mono w-auto inline-flex min-w-[200px]"
                  >
                    <SelectValue>
                      <span className="font-mono">
                        {override
                          ? `${override.compte} (${override.classification}) ✏️`
                          : `${tx.compte_comptable || "?"} (${tx.classification || "?"})`}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RECLASS_OPTIONS_CLIENT.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono">
                        {opt.label}
                      </SelectItem>
                    ))}
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
                {tx.nb_factures}{t('acc.rap.invoices_x', locale)}
              </Badge>
            )}
            {type === "match" && ecart > 0.01 && (
              <Badge
                className={`text-[10px] ${
                  ecartPct > 5
                    ? "bg-red-100 text-red-700 border-red-300"
                    : "bg-amber-100 text-amber-700 border-amber-300"
                }`}
              >
                {t('acc.rap.gap_short', locale)} {fmt(ecart)} ({ecartPct.toFixed(1)}%)
              </Badge>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground italic">
              {expanded ? t('acc.rap.detail_open', locale) : t('acc.rap.detail_closed', locale)}
            </span>
          </div>
        </button>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            onClick={onValidate}
            className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {t('acc.rap.validate', locale)}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onReject}
            className="h-7 text-xs text-muted-foreground hover:text-rose-700 hover:bg-rose-50"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            {t('acc.rap.reject', locale)}
          </Button>
        </div>
      </div>

      {/* Panneau détail expandable */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-blue-50/30 text-xs space-y-2 border-t">
          {/* Pièce bancaire */}
          <div className="rounded border bg-white p-3">
            <p className="font-medium text-blue-900 mb-1.5">{t('acc.rap.bank_entry_raw', locale)}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
              <Detail label={t('acc.rap.detail_date', locale)} value={formatDate(tx.date, locale)} />
              <Detail label={t('acc.rap.detail_currency', locale)} value={tx.devise || "MUR"} />
              <Detail
                label={t('acc.rap.detail_debit', locale)}
                value={tx.debit > 0 ? fmt(tx.debit) : "—"}
                tone={tx.debit > 0 ? "rose" : undefined}
              />
              <Detail
                label={t('acc.rap.detail_credit', locale)}
                value={tx.credit > 0 ? fmt(tx.credit) : "—"}
                tone={tx.credit > 0 ? "green" : undefined}
              />
            </div>
            <div className="mt-2 break-words">
              <span className="text-muted-foreground">{t('acc.rap.full_label', locale)} </span>
              <span className="font-mono">{tx.libelle}</span>
            </div>
            {tx.tiers_detecte && (
              <p className="mt-1">
                <span className="text-muted-foreground">{t('acc.rap.detected_party', locale)} </span>
                <span className="font-medium">{tx.tiers_detecte}</span>
              </p>
            )}
            {tx.note && (
              <p className="mt-1 italic text-muted-foreground">{t('acc.rap.reasoning', locale)} {tx.note}</p>
            )}
          </div>

          {/* Pièce comptable */}
          {type === "match" && factures.length > 0 && (
            <div className="rounded border bg-white p-3">
              <p className="font-medium text-emerald-900 mb-1.5">
                📄 {factures.length > 1 ? t('acc.rap.invoices_linked', locale) : t('acc.rap.invoice_linked', locale)} ({factures.length})
              </p>
              <div className="space-y-1.5">
                {factures.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start justify-between gap-2 border-l-2 border-emerald-300 pl-2"
                  >
                    <div className="min-w-0">
                      <p>
                        <span className="font-mono font-medium">
                          {f.numero_facture || f.id.slice(0, 8)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`ml-2 text-[10px] ${
                            f.type_facture === "client"
                              ? "bg-green-50 text-green-700 border-green-300"
                              : "bg-rose-50 text-rose-700 border-rose-300"
                          }`}
                        >
                          {f.type_facture === "client" ? t('acc.rap.client_lc', locale) : t('acc.rap.supplier_lc', locale)}
                        </Badge>
                      </p>
                      {f.tiers && <p className="text-muted-foreground">{f.tiers}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {f.date_facture && `${t('acc.rap.issued', locale)} ${formatDate(f.date_facture, locale)}`}
                        {f.date_echeance && ` · ${t('acc.rap.due', locale)} ${formatDate(f.date_echeance, locale)}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono">
                        {fmt(f.montant_ttc)} {f.devise || "MUR"}
                      </p>
                      {f.devise && f.devise !== "MUR" && f.montant_mur && (
                        <p className="text-[10px] text-muted-foreground font-mono">
                          ≈ {fmt(f.montant_mur)} MUR
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {ecart > 0.01 && (
                  <p className="pt-1 border-t mt-1 text-[11px]">
                    <span className="text-muted-foreground">{t('acc.rap.invoice_total', locale)} </span>
                    <span className="font-mono font-medium">{fmt(factureTotal)} MUR</span>
                    <span className="text-muted-foreground"> · {t('acc.rap.gap_label', locale)} </span>
                    <span
                      className={`font-mono font-medium ${
                        ecartPct > 5 ? "text-red-700" : "text-amber-700"
                      }`}
                    >
                      {fmt(ecart)} MUR ({ecartPct.toFixed(2)}%)
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Classification PCM */}
          {type === "classification" && tx.compte_comptable && (
            <div className="rounded border bg-white p-3">
              <p className="font-medium text-purple-900 mb-1.5">{t('acc.rap.classification_proposed', locale)}</p>
              <p>
                {t('acc.rap.pcm_account', locale)}{" "}
                <Badge variant="outline" className="font-mono">
                  {tx.compte_comptable}
                </Badge>
                {tx.classification && (
                  <span className="ml-2 text-muted-foreground">
                    {t('acc.rap.category_label', locale)} <span className="font-medium">{tx.classification}</span>
                  </span>
                )}
              </p>
              {tx.classification_suggestion?.note && (
                <p className="mt-1 italic text-muted-foreground">
                  {tx.classification_suggestion.note}
                </p>
              )}
            </div>
          )}

          {/* Lien vers les écritures */}
          <div className="flex gap-2">
            <Link
              href={`/client/ecritures?search=${encodeURIComponent(tx.libelle.slice(0, 30))}`}
              className="text-[11px] text-blue-700 hover:underline"
            >
              {t('acc.rap.view_linked_entries', locale)}
            </Link>
            {factures[0] && (
              <Link
                href={`/client/factures?search=${encodeURIComponent(factures[0].numero_facture || factures[0].id.slice(0, 8))}`}
                className="text-[11px] text-blue-700 hover:underline"
              >
                {t('acc.rap.view_invoice', locale)}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "green" | "rose"
}) {
  const cls =
    tone === "green"
      ? "text-green-700 font-medium"
      : tone === "rose"
        ? "text-rose-700 font-medium"
        : "text-foreground"
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cls}>{value}</p>
    </div>
  )
}

function TxRow({
  tx,
  facturesById,
  onImputer,
  onModifier,
  locale,
}: {
  tx: BankTx
  facturesById: Map<string, Facture>
  onImputer?: () => void
  onModifier?: () => void
  locale: Locale
}) {
  const montant = tx.debit > 0 ? -tx.debit : tx.credit
  return (
    <div className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{formatDate(tx.date, locale)}</p>
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
              {t('acc.rap.invoice', locale)} {facturesById.get(tx.facture_id)?.numero_facture || tx.facture_id.slice(0, 8)}
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
        {onImputer && (
          <Button size="sm" variant="outline" onClick={onImputer} className="h-7 text-xs">
            <Edit3 className="h-3.5 w-3.5 mr-1" />
            {t('acc.rap.impute', locale)}
          </Button>
        )}
        {onModifier && (
          <Button
            size="sm"
            variant="outline"
            onClick={onModifier}
            className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
            title={t('acc.rap.modify_title', locale)}
          >
            <Edit3 className="h-3.5 w-3.5 mr-1" />
            {t('acc.rap.modify', locale)}
          </Button>
        )}
      </div>
    </div>
  )
}

// ── AffectDialog : imputation manuelle d'une tx orpheline ────────────
// Deux modes : (a) lier à une facture existante, (b) imputer sur un compte PCM.

const PCM_PRESETS: Array<{ value: string; label: string; classification: string }> = [
  { value: "6270", label: "6270 — Frais bancaires", classification: "frais_bancaires" },
  { value: "6611", label: "6611 — Intérêts emprunts / agios", classification: "interets" },
  { value: "5811", label: "5811 — Virements internes en cours", classification: "virement_interne" },
  { value: "4210", label: "4210 — Rémunérations dues (salaires)", classification: "salaire_individuel" },
  { value: "4310", label: "4310 — Sécurité sociale", classification: "charges_sociales" },
  { value: "4330", label: "4330 — MRA / PAYE", classification: "paiement_mra" },
  { value: "4455", label: "4455 — TVA à décaisser", classification: "tva" },
  { value: "4671", label: "4671 — Compte courant associé (associé)", classification: "cca" },
  { value: "4672", label: "4672 — Compte courant associé (groupe)", classification: "cca" },
  { value: "451", label: "451 — Compte courant intersociétés (groupe)", classification: "interco" },
  { value: "1681", label: "1681 — Emprunts auprès d'entreprises liées", classification: "interco_emprunt" },
  { value: "2671", label: "2671 — Créances rattachées à des participations", classification: "interco_creance" },
  { value: "411", label: "411 — Clients (créance)", classification: "client_divers" },
  { value: "401", label: "401 — Fournisseurs (dette)", classification: "fournisseur_divers" },
  { value: "1641", label: "1641 — Emprunts (remboursement)", classification: "remboursement_pret" },
  { value: "627", label: "627 — Services bancaires (autre)", classification: "services_bancaires" },
  { value: "658", label: "658 — Charges diverses gestion courante", classification: "autre_charge" },
  { value: "758", label: "758 — Produits divers gestion courante", classification: "autre_produit" },
]

function AffectDialog({
  tx,
  factures,
  allTransactions,
  onClose,
  onAffect,
  onAffectFactures,
  showToast,
  onReload,
  locale,
}: {
  tx: BankTx | null
  factures: Facture[]
  allTransactions: BankTx[]
  onClose: () => void
  onAffect: (
    tx: BankTx,
    mode: "facture" | "pcm",
    payload: { facture_id?: string; classification?: string; compte_charge?: string }
  ) => Promise<{ ok: boolean; error?: string; lettre?: string }>
  onAffectFactures: (
    tx: BankTx,
    payload: { facture_ids?: string[]; allocations?: { facture_id: string; montant: number }[]; partiel?: boolean }
  ) => Promise<{ ok: boolean; error?: string; lettre?: string; ecart?: { compte: string; montant: number; libelle: string } | null }>
  showToast: (msg: string, type?: "success" | "error") => void
  onReload: () => void
  locale: Locale
}) {
  const [tab, setTab] = useState<"facture" | "pcm" | "interne">("facture")
  const [search, setSearch] = useState("")
  const [pcmCustom, setPcmCustom] = useState("")
  const [pcmPreset, setPcmPreset] = useState<string>("")
  const [busy, setBusy] = useState(false)
  // Multi-sélection de factures + montant affecté par facture (MUR) pour
  // grouper plusieurs factures sur un règlement et/ou régler partiellement.
  const [selectedFids, setSelectedFids] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [propagationCandidates, setPropagationCandidates] = useState<BankTx[]>([])
  const [propagationCompte, setPropagationCompte] = useState<string>("")
  const [propagationClassif, setPropagationClassif] = useState<string>("")
  const [propagationSelected, setPropagationSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (tx) {
      setTab("facture")
      setSearch("")
      setSelectedFids(new Set())
      setAmounts({})
      setPcmCustom("")
      setPcmPreset("")
      setPropagationCandidates([])
      setPropagationSelected(new Set())
      setPropagationCompte("")
      setPropagationClassif("")
    }
  }, [tx?.id])

  if (!tx) return null

  const montant = tx.debit > 0 ? -tx.debit : tx.credit

  // Tri des factures par pertinence : montant proche d'abord, puis date
  const targetAmount = Math.abs(montant)
  const filteredFactures = (() => {
    const q = search.trim().toLowerCase()
    let list = factures.filter((f) => f.statut !== "paye" && f.statut !== "annule")
    if (q) {
      list = list.filter(
        (f) =>
          f.numero_facture?.toLowerCase().includes(q) ||
          f.tiers?.toLowerCase().includes(q)
      )
    }
    return list
      .slice()
      .sort((a, b) => {
        const da = Math.abs((Number(a.montant_mur) || Number(a.montant_ttc) || 0) - targetAmount)
        const db = Math.abs((Number(b.montant_mur) || Number(b.montant_ttc) || 0) - targetAmount)
        return da - db
      })
      .slice(0, 30)
  })()

  // ── Multi-factures + répartition partielle (parité avec le comptable) ──
  // Le total affecté (MUR) doit ≈ le montant du règlement (écart ≤ 1). Affecter
  // moins que le solde d'une facture ⇒ paiement partiel (facture reste "partiel").
  const txAmount = Math.abs(montant)
  const remainingOf = (f: Facture) =>
    typeof f.solde_non_paye === "number"
      ? f.solde_non_paye
      : Number(f.montant_mur) || Number(f.montant_ttc) || 0
  const toggleFid = (fid: string) => {
    setSelectedFids((prev) => {
      const n = new Set(prev)
      if (n.has(fid)) {
        n.delete(fid)
        setAmounts((a) => { const c = { ...a }; delete c[fid]; return c })
      } else {
        n.add(fid)
        const f = factures.find((x) => x.id === fid)
        if (f) {
          // Pré-remplissage = montant restant À RÉPARTIR du virement, plafonné
          // au solde de la facture. Ainsi un virement plus petit que la facture
          // se règle partiellement en 1 clic (au lieu de bloquer sur le solde).
          const usedByOthers = factures
            .filter((x) => prev.has(x.id))
            .reduce((s, x) => {
              const raw = amounts[x.id]
              const v = raw === undefined || raw === "" ? remainingOf(x) : Number(raw)
              return s + (Number.isFinite(v) ? v : 0)
            }, 0)
          const residual = Math.round((txAmount - usedByOthers) * 100) / 100
          const def = residual > 0 ? Math.min(remainingOf(f), residual) : remainingOf(f)
          setAmounts((a) => ({ ...a, [fid]: String(Math.round(def * 100) / 100) }))
        }
      }
      return n
    })
  }
  const selectedFactures = factures.filter((f) => selectedFids.has(f.id))
  const allocAmount = (f: Facture) => {
    const raw = amounts[f.id]
    const n = raw === undefined || raw === "" ? remainingOf(f) : Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  const sumAlloc = Math.round(selectedFactures.reduce((s, f) => s + allocAmount(f), 0) * 100) / 100
  const diffAlloc = Math.round((txAmount - sumAlloc) * 100) / 100
  const anyOver = selectedFactures.some((f) => allocAmount(f) > remainingOf(f) + 1)
  const anyNonPositive = selectedFactures.some((f) => allocAmount(f) <= 0)
  const hasPartial = selectedFactures.some((f) => allocAmount(f) < remainingOf(f) - 0.01)
  // L'écart (somme affectée − virement) est désormais autorisé : il est booké
  // automatiquement (change 656/756 · frais 6270 · acompte 4191/409). On ne
  // bloque plus que les vraies erreurs (au-delà du solde, montant ≤ 0).
  const allocValid = !anyOver && !anyNonPositive
  // Traitement d'écart (affichage) — miroir de la logique serveur.
  const ecartTreatment = (() => {
    if (Math.abs(diffAlloc) <= 1) return null // diffAlloc = virement − somme
    const ecartBrut = -diffAlloc // somme − virement (A − P), signe serveur
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

  const handleApplyFactures = async () => {
    if (selectedFactures.length === 0) return
    setBusy(true)
    // Écart ou partiel → lettrer_partiel (gère l'écart). Sinon match exact →
    // facture_ids (chemin classique lettrer_multi/manuel).
    const needsPartiel = hasPartial || Math.abs(diffAlloc) > 1
    const payload = needsPartiel
      ? {
          partiel: true,
          allocations: selectedFactures.map((f) => ({
            facture_id: f.id,
            montant: Math.round(allocAmount(f) * 100) / 100,
          })),
        }
      : { facture_ids: selectedFactures.map((f) => f.id) }
    const r = await onAffectFactures(tx, payload)
    setBusy(false)
    if (!r.ok) return showToast(`${t('acc.rap.fail', locale)} : ${r.error}`, "error")
    const ecartMsg = r.ecart ? ` · écart ${fmt(r.ecart.montant)} → ${r.ecart.compte}` : ""
    showToast(t('acc.rap.imputed_facture', locale).replace('{l}', r.lettre || "—") + ecartMsg)
    onClose()
    onReload()
  }

  const handleApplyPcm = async () => {
    const compte = pcmCustom.trim() || pcmPreset
    if (!compte) return showToast(t('acc.rap.choose_pcm_error', locale), "error")
    const preset = PCM_PRESETS.find((p) => p.value === pcmPreset)
    const classif = preset?.classification || "manuel"
    setBusy(true)
    const r = await onAffect(tx, "pcm", {
      compte_charge: compte,
      classification: classif,
    })
    setBusy(false)
    if (!r.ok) return showToast(`${t('acc.rap.fail', locale)} : ${r.error}`, "error")
    showToast(t('acc.rap.imputed_pcm', locale).replace('{c}', compte).replace('{l}', r.lettre || "—"))

    // ── Propagation : cherche les tx similaires non encore imputées ──
    // Critères de similarité (souples) :
    //   - Même tiers_detecte (si défini)
    //   - OU 4 premiers mots du libellé en commun
    //   - Et tx orpheline (statut non_identifie ou a_verifier)
    const tiersTx = (tx.tiers_detecte || "").toLowerCase().trim()
    const libWords = (tx.libelle || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .join(" ")
    const similar = allTransactions.filter((tr) => {
      if (tr.id === tx.id) return false
      if (
        tr.statut !== "non_identifie" &&
        tr.statut !== "a_verifier" &&
        tr.statut
      )
        return false
      if (
        tr.facture_id ||
        (Array.isArray(tr.facture_ids) && tr.facture_ids.length > 0)
      )
        return false
      if (tr.compte_comptable) return false
      // Match sur tiers détecté
      if (tiersTx && (tr.tiers_detecte || "").toLowerCase().trim() === tiersTx)
        return true
      // Match sur 4 premiers mots du libellé
      if (libWords) {
        const tWords = (tr.libelle || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .split(/\s+/)
          .slice(0, 4)
          .join(" ")
        if (tWords && tWords === libWords) return true
      }
      return false
    })
    if (similar.length > 0) {
      setPropagationCandidates(similar)
      setPropagationCompte(compte)
      setPropagationClassif(classif)
      setPropagationSelected(new Set(similar.map((s) => s.id)))
      // Ne ferme PAS le dialog — affiche le panneau propagation
    } else {
      onClose()
      onReload()
    }
  }

  const handlePropagate = async () => {
    const items = propagationCandidates.filter((tr) => propagationSelected.has(tr.id))
    if (items.length === 0) return showToast(t('acc.rap.nothing_selected', locale), "error")
    setBusy(true)
    let ok = 0
    const errors: string[] = []
    for (const tr of items) {
      const r = await onAffect(tr, "pcm", {
        compte_charge: propagationCompte,
        classification: propagationClassif,
      })
      if (r.ok) ok++
      else errors.push(`${tr.libelle.slice(0, 40)} : ${r.error}`)
    }
    setBusy(false)
    if (errors.length === 0) {
      showToast(t('acc.rap.propag_done', locale).replace('{n}', String(ok)).replace('{compte}', propagationCompte))
    } else {
      showToast(t('acc.rap.batch_mixed', locale).replace('{ok}', String(ok)).replace('{ko}', String(errors.length)).replace('{first}', errors[0]), "error")
    }
    setPropagationCandidates([])
    setPropagationSelected(new Set())
    onClose()
    onReload()
  }

  const handleSkipPropagation = () => {
    setPropagationCandidates([])
    setPropagationSelected(new Set())
    onClose()
    onReload()
  }

  return (
    <Dialog open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('acc.rap.dialog_title', locale)}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{formatDate(tx.date, locale)}</span> ·{" "}
            <span className="font-mono">{tx.libelle}</span>
            <br />
            <span className="font-mono font-medium">
              {montant >= 0 ? "+" : ""}
              {fmt(montant)} {tx.devise || "MUR"}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Panneau de propagation post-imputation */}
        {propagationCandidates.length > 0 ? (
          <div className="space-y-3">
            <div className="rounded border-2 border-blue-300 bg-blue-50 p-3">
              <h4 className="font-medium text-sm text-blue-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {t('acc.rap.imputation_recorded', locale)} {propagationCandidates.length} {t('acc.rap.similar_detected', locale)}
              </h4>
              <p className="text-xs text-blue-800/80 mt-1">
                {t('acc.rap.propagate_question', locale)}{" "}
                <span className="font-mono">{propagationCompte}</span>{" "}
                <span className="opacity-70">— {propagationClassif}</span>) {t('acc.rap.propagate_to_these', locale)}
              </p>
            </div>
            <div className="rounded border bg-card divide-y max-h-72 overflow-y-auto">
              {propagationCandidates.map((tr) => {
                const checked = propagationSelected.has(tr.id)
                const m = tr.debit > 0 ? -tr.debit : tr.credit
                return (
                  <label
                    key={tr.id}
                    className="flex items-start gap-2 p-2 hover:bg-muted/30 cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {
                        setPropagationSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(tr.id)) next.delete(tr.id)
                          else next.add(tr.id)
                          return next
                        })
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0 text-xs">
                      <p className="text-muted-foreground">{formatDate(tr.date, locale)}</p>
                      <p className="break-words">{tr.libelle}</p>
                    </div>
                    <p
                      className={`font-mono text-xs flex-shrink-0 ${
                        m >= 0 ? "text-green-700" : "text-rose-700"
                      }`}
                    >
                      {m >= 0 ? "+" : ""}
                      {fmt(m)} {tr.devise || "MUR"}
                    </p>
                  </label>
                )
              })}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={handleSkipPropagation} disabled={busy}>
                {t('acc.rap.no_thanks', locale)}
              </Button>
              <Button
                onClick={handlePropagate}
                disabled={busy || propagationSelected.size === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                {t('acc.rap.propagate_to_n', locale).replace('{n}', String(propagationSelected.size))}
              </Button>
            </div>
          </div>
        ) : (
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList className="w-full">
            <TabsTrigger value="facture" className="flex-1">
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              {t('acc.rap.tab_facture', locale)}
            </TabsTrigger>
            <TabsTrigger value="pcm" className="flex-1">
              <Wrench className="h-3.5 w-3.5 mr-1.5" />
              {t('acc.rap.tab_pcm', locale)}
            </TabsTrigger>
            <TabsTrigger value="interne" className="flex-1">
              <Landmark className="h-3.5 w-3.5 mr-1.5" />
              {t('acc.rap.tab_interne', locale)}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="facture" className="mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('acc.rap.search_invoice_ph', locale)}
                className="pl-8 h-9"
              />
            </div>
            {filteredFactures.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('acc.rap.no_invoice_found', locale)}
              </p>
            ) : (
              <div className="rounded border bg-card divide-y max-h-80 overflow-y-auto">
                {filteredFactures.map((f) => {
                  const fAmt = Number(f.montant_mur) || Number(f.montant_ttc) || 0
                  const ecart = Math.abs(fAmt - targetAmount)
                  const ecartPct = targetAmount > 0 ? (ecart / targetAmount) * 100 : 0
                  const checked = selectedFids.has(f.id)
                  return (
                    <label
                      key={f.id}
                      className="w-full flex items-start gap-3 p-3 hover:bg-muted/30 text-left cursor-pointer"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleFid(f.id)} className="mt-1" />
                      <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm">
                            {f.numero_facture || f.id.slice(0, 8)}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              f.type_facture === "client"
                                ? "bg-green-50 text-green-700 border-green-300"
                                : "bg-rose-50 text-rose-700 border-rose-300"
                            }`}
                          >
                            {f.type_facture === "client" ? t('acc.rap.client_lc', locale) : t('acc.rap.supplier_lc', locale)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {f.statut}
                          </Badge>
                        </div>
                        <p className="text-xs mt-0.5 break-words">{f.tiers || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t('acc.rap.issued', locale)} {formatDate(f.date_facture, locale)} · {t('acc.rap.due', locale)}{" "}
                          {formatDate(f.date_echeance, locale)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono text-sm">
                          {fmt(f.montant_ttc)} {f.devise || "MUR"}
                        </p>
                        {ecartPct > 0.5 && (
                          <p
                            className={`text-[10px] font-mono ${
                              ecartPct > 5 ? "text-red-700" : "text-amber-700"
                            }`}
                          >
                            {t('acc.rap.gap_short', locale)} {ecartPct.toFixed(1)}%
                          </p>
                        )}
                      </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}

            {/* Répartition : montant affecté par facture + validation
                (grouper plusieurs factures sur un règlement et/ou partiel) */}
            {selectedFactures.length > 0 && (
              <div className="space-y-2">
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
                          <span className="font-mono text-xs">{f.numero_facture || f.id.slice(0, 8)}</span>
                          {f.tiers && <span className="text-xs text-muted-foreground"> · {f.tiers.slice(0, 40)}</span>}
                          {partial && !over && (
                            <Badge className="ml-1 text-[10px] bg-amber-100 text-amber-800 border-amber-300">partiel</Badge>
                          )}
                        </div>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={val}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          className={`h-8 w-32 text-right font-mono ${over ? "border-rose-400" : ""}`}
                        />
                        <span className="w-24 text-right font-mono text-xs text-muted-foreground">{fmt(reste)}</span>
                      </div>
                    )
                  })}
                </div>
                <div
                  className={`rounded border p-2.5 text-sm flex items-center justify-between ${
                    Math.abs(diffAlloc) <= 1 ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <span>
                    {selectedFactures.length} facture{selectedFactures.length > 1 ? "s" : ""} · affecté{" "}
                    <span className="font-mono">{fmt(sumAlloc)} MUR</span>
                    {hasPartial && <span className="text-amber-700"> · répartition partielle</span>}
                  </span>
                  <span className="font-mono text-xs">
                    Règlement {fmt(txAmount)} {tx.devise || "MUR"} · écart{" "}
                    <span className={Math.abs(diffAlloc) <= 1 ? "" : "text-amber-700"}>
                      {diffAlloc >= 0 ? "+" : ""}
                      {fmt(diffAlloc)}
                    </span>
                  </span>
                </div>
                {!allocValid ? (
                  <p className="text-[11px] text-rose-700">
                    {anyOver
                      ? "Un montant dépasse le solde restant de sa facture."
                      : "Chaque montant affecté doit être strictement positif."}
                  </p>
                ) : ecartTreatment ? (
                  <p className="text-[11px] text-amber-800">
                    Écart de {fmt(Math.abs(ecartTreatment.ecartBrut))} MUR → comptabilisé en{" "}
                    <span className="font-mono">{ecartTreatment.compte}</span> ({ecartTreatment.libelle}).
                  </p>
                ) : null}
                <Button
                  onClick={handleApplyFactures}
                  disabled={busy || selectedFactures.length === 0 || !allocValid}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  {ecartTreatment
                    ? `Solder + écart → ${ecartTreatment.compte} (${selectedFactures.length})`
                    : hasPartial
                      ? `Enregistrer la répartition (${selectedFactures.length})`
                      : `Lier ${selectedFactures.length} facture${selectedFactures.length > 1 ? "s" : ""}`}
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="pcm" className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t('acc.rap.current_pcm', locale)}
              </label>
              <Select value={pcmPreset} onValueChange={setPcmPreset}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('acc.rap.choose_current_pcm', locale)} />
                </SelectTrigger>
                <SelectContent>
                  {PCM_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t('acc.rap.or_enter_other_pcm', locale)}
              </label>
              <Input
                value={pcmCustom}
                onChange={(e) => setPcmCustom(e.target.value)}
                placeholder="Ex: 6125"
                className="mt-1 h-9 font-mono"
              />
            </div>
            <Button
              onClick={handleApplyPcm}
              disabled={busy || (!pcmPreset && !pcmCustom.trim())}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {t('acc.rap.impute_on', locale)} {pcmCustom.trim() || pcmPreset || "…"}
            </Button>
            <p className="text-[11px] text-muted-foreground italic">
              {t('acc.rap.bnq_auto_create', locale)}
            </p>
          </TabsContent>

          <TabsContent value="interne" className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('acc.rap.search_mirror_help', locale)} <span className="font-mono">{t('acc.rap.virements_internes_label', locale)}</span>.
            </p>
            <InterneCompteSection
              tx={tx}
              allTransactions={allTransactions}
              busy={busy}
              locale={locale}
              onApplyMirror={async (mirrorTx) => {
                setBusy(true)
                // Lettre les 2 tx (la courante + la miroir) sur 5811
                const r1 = await onAffect(tx, "pcm", {
                  classification: "virement_interne",
                  compte_charge: "5811",
                })
                if (!r1.ok) {
                  setBusy(false)
                  return showToast(t('acc.rap.fail_side', locale).replace('{side}', tx.libelle.slice(0, 30)).replace('{err}', r1.error || ''), "error")
                }
                const r2 = await onAffect(mirrorTx, "pcm", {
                  classification: "virement_interne",
                  compte_charge: "5811",
                })
                setBusy(false)
                if (!r2.ok) {
                  return showToast(
                    t('acc.rap.fail_side_b', locale).replace('{err}', r2.error || ''),
                    "error"
                  )
                }
                showToast(t('acc.rap.virement_5811_letter', locale))
                onClose()
                onReload()
              }}
              onApplyAlone={async () => {
                setBusy(true)
                const r = await onAffect(tx, "pcm", {
                  classification: "virement_interne",
                  compte_charge: "5811",
                })
                setBusy(false)
                if (!r.ok) return showToast(`${t('acc.rap.fail', locale)} : ${r.error}`, "error")
                showToast(t('acc.rap.imputed_5811', locale))
                onClose()
                onReload()
              }}
            />
          </TabsContent>
        </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InterneCompteSection({
  tx,
  allTransactions,
  busy,
  onApplyMirror,
  onApplyAlone,
  locale,
}: {
  tx: BankTx
  allTransactions: BankTx[]
  busy: boolean
  onApplyMirror: (mirror: BankTx) => Promise<void>
  onApplyAlone: () => Promise<void>
  locale: Locale
}) {
  const targetAmt = Math.max(tx.debit, tx.credit)
  const txDate = tx.date ? new Date(tx.date).getTime() : 0
  const txCompte = tx.banque || ""

  // Cherche les tx miroirs : autre compte (banque différente OU même banque
  // mais devise différente), sens INVERSE, montant proche (±5%), date ±10 jours.
  const candidates = useMemo(() => {
    return allTransactions
      .filter((tr) => tr.id !== tx.id)
      .filter((tr) => {
        const otherCompte = tr.banque || ""
        // Autre tx (peu importe le compte, on prend tout sauf la même tx)
        if (!tr.date) return false
        const dt = Math.abs(new Date(tr.date).getTime() - txDate) / 86400000
        if (dt > 10) return false
        // Sens inverse : si tx est sortie (debit), miroir est entrée (credit) et inverse
        const sameSide =
          (tx.debit > 0 && tr.debit > 0) || (tx.credit > 0 && tr.credit > 0)
        if (sameSide) return false
        const tAmt = Math.max(tr.debit, tr.credit)
        const ratio = targetAmt > 0 ? Math.abs(tAmt - targetAmt) / targetAmt : 999
        if (ratio > 0.05) return false
        return true
      })
      .sort((a, b) => {
        const da = Math.abs(new Date(a.date).getTime() - txDate)
        const db = Math.abs(new Date(b.date).getTime() - txDate)
        return da - db
      })
      .slice(0, 10)
  }, [tx, allTransactions, targetAmt, txDate])

  return (
    <div className="space-y-3">
      {candidates.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground italic">
          {t('acc.rap.no_mirror', locale)}
        </p>
      ) : (
        <>
          <p className="text-xs font-medium">
            {t('acc.rap.mirror_candidates', locale).replace('{n}', String(candidates.length))}
          </p>
          <div className="rounded border bg-card divide-y max-h-72 overflow-y-auto">
            {candidates.map((m) => {
              const mAmt = Math.max(m.debit, m.credit)
              const mSens = m.debit > 0 ? "-" : "+"
              const mCompte = m.banque || "?"
              const ratio = targetAmt > 0 ? Math.abs(mAmt - targetAmt) / targetAmt : 0
              return (
                <button
                  key={m.id}
                  disabled={busy}
                  onClick={() => onApplyMirror(m)}
                  className="w-full flex items-start justify-between gap-3 p-3 hover:bg-blue-50 text-left disabled:opacity-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {mCompte} ({m.devise || "MUR"})
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(m.date, locale)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 break-words">{m.libelle}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p
                      className={`font-mono text-sm ${mSens === "+" ? "text-green-700" : "text-rose-700"}`}
                    >
                      {mSens}
                      {fmt(mAmt)}
                    </p>
                    {ratio > 0.005 && (
                      <p className="text-[10px] font-mono text-amber-700">
                        {t('acc.rap.gap_short', locale)} {(ratio * 100).toFixed(2)}%
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            {t('acc.rap.click_mirror_letter', locale)}
          </p>
        </>
      )}
      <div className="border-t pt-3">
        <Button
          onClick={onApplyAlone}
          disabled={busy}
          variant="outline"
          className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Wrench className="h-4 w-4 mr-2" />
          )}
          {t('acc.rap.impute_alone_5811', locale)}
        </Button>
      </div>
    </div>
  )
}
