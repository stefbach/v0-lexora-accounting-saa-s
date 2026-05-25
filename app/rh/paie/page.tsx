"use client"
import React, { useState, useEffect, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Calculator, Download, FileText, BookOpen, AlertTriangle, CheckCircle, Lock, Unlock, ShieldCheck, ArrowRight, Clock, CreditCard, FileSpreadsheet, Receipt, Pencil, X, Save, RefreshCw, History } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { PaieValidationPanel } from "@/components/rh/PaieValidationPanel"
import { DecomptabilisationDialog } from "@/components/rh/DecomptabilisationDialog"
import { createClient } from "@/lib/supabase/client"
import { t, getLocale } from "@/lib/i18n"

const DECOMPTA_ROLES = [
  'admin', 'super_admin', 'rh', 'rh_manager', 'direction', 'client_admin',
] as const
import {
  calculerPeriodePaieSync,
  DEFAULT_CONFIG as DEFAULT_PERIODE_CFG,
  type PeriodePaieConfig,
  type PeriodePaieMode,
} from "@/lib/rh/periode-paie"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }
const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  valide: "bg-blue-100 text-blue-700",
  paye: "bg-green-100 text-green-700",
  declare_mra: "bg-purple-100 text-purple-700"
}

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/**
 * Retourne les 12 derniers mois (mois en cours + 11 précédents) au format
 * YYYY-MM, triés du plus récent au plus ancien. Utilisé pour que le
 * sélecteur de période propose toujours le mois courant, même si aucun
 * bulletin n'a encore été calculé pour ce mois-là.
 */
function last12Months(): string[] {
  const today = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export default function PaiePage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [periode, setPeriode] = useState("")
  const [periodeReady, setPeriodeReady] = useState(false)
  const [availablePeriodes, setAvailablePeriodes] = useState<string[]>([])
  // PE1 — config période paie de la société active (pour afficher
  // '25/03 → 24/04' dans le sélecteur quand mode != calendaire).
  const [periodeCfg, setPeriodeCfg] = useState<PeriodePaieConfig>({ ...DEFAULT_PERIODE_CFG })
  const [bulletins, setBulletins] = useState<any[]>([])
  const [totaux, setTotaux] = useState<any>({})
  // Migration 135 — toggle pointage_actif renvoyé par /api/rh/paie pour
  // afficher le bandeau correspondant. null = pas encore chargé / pas
  // de société sélectionnée.
  const [pointageActif, setPointageActif] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Workflow
  const [workflow, setWorkflow] = useState<any>(null)
  const [audit, setAudit] = useState<any[]>([])

  // Bug A fix — alerte employés sortis dans la période sélectionnée.
  // On charge la liste des employés de la société + filtre ceux dont
  // date_depart tombe dans le mois affiché → on prévient le RH avant
  // qu'il clique "Calculer la paie" (le calcul sera fait en solde
  // tout compte avec prorata automatique, mais l'avertissement évite
  // l'incompréhension "pourquoi le bulletin est-il à moitié ?").
  const [employesSortants, setEmployesSortants] = useState<Array<{
    id: string; prenom: string; nom: string; date_depart: string
  }>>([])

  // Sprint 5 FIX 4 — erreur de chargement non-bloquante (remplace l'alert
  // agressif qui gâchait l'UX et empêchait de voir la page).
  const [loadError, setLoadError] = useState<string | null>(null)

  // FIX-DECOMPTA — rôle de l'utilisateur courant pour conditionner l'affichage
  // du bouton "Décomptabiliser". Whitelist : admin/super_admin/rh/rh_manager/
  // direction/client_admin (alignée sur l'API).
  const [userRole, setUserRole] = useState<string>("")
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      sb.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => { if (data?.role) setUserRole(data.role) })
    })
  }, [])
  const canDecomptabiliser = (DECOMPTA_ROLES as readonly string[]).includes(userRole)

  // Comptabilisation
  const [comptabilisationLoading, setComptabilisationLoading] = useState(false)
  const [comptabilisationResult, setComptabilisationResult] = useState<string | null>(null)

  // Sprint 12 FEATURE 5 — onglet actif synchronisé avec URL ?tab=
  // Valeurs : "bulletins" (défaut) | "validation" | "historique"
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get("tab")
  const initialTab = tabParam === "validation" || tabParam === "historique" ? tabParam : "bulletins"
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  useEffect(() => {
    // Resync si l'URL change (back/forward)
    const tab = searchParams.get("tab")
    if (tab === "validation" || tab === "historique") setActiveTab(tab)
    else setActiveTab("bulletins")
  }, [searchParams])
  const changeTab = (next: string) => {
    setActiveTab(next)
    const sp = new URLSearchParams(Array.from(searchParams.entries()))
    if (next === "bulletins") sp.delete("tab")
    else sp.set("tab", next)
    const qs = sp.toString()
    router.replace(qs ? `/rh/paie?${qs}` : "/rh/paie", { scroll: false })
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(async ([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      const firstSociete = unique.length >= 1 ? unique[0].id : "all"
      setSociete(firstSociete)

      // FIX — le sélecteur doit TOUJOURS proposer le mois en cours + les
      // 11 mois précédents, même si aucun bulletin n'existe encore. On
      // fusionne ces 12 mois avec les périodes qui ont des bulletins en
      // DB (historique plus ancien). Défaut = mois en cours, toujours.
      const todayYm = new Date().toISOString().slice(0, 7)
      const derniersMois = last12Months()
      try {
        const params = new URLSearchParams()
        if (firstSociete !== "all") params.set("societe_id", firstSociete)
        const data = await fetch(`/api/rh/paie?${params}`).then(r => r.json())
        const allBulletins = data.bulletins || []
        const moisAvecBulletins = allBulletins
          .map((b: any) => (b.periode || "").slice(0, 7))
          .filter(Boolean) as string[]
        const tousLesMois = Array.from(new Set([...derniersMois, ...moisAvecBulletins]))
          .sort((a, b) => b.localeCompare(a))
        setAvailablePeriodes(tousLesMois)
      } catch {
        setAvailablePeriodes(derniersMois)
      }
      setPeriode(todayYm)
      setPeriodeReady(true)
    })
  }, [])

  const load = useCallback(async () => {
    if (!periodeReady || !periode) return
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const res = await fetch(`/api/rh/paie?${params}`)
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      if (!res.ok || data?.error) {
        console.error('[rh/paie] load error', res.status, data?.error || data)
        setLoadError(data?.error || t('rha.a.paie.err_status_prefix', locale).replace('{status}', String(res.status)) + t('rha.a.paie.err_load', locale))
        setBulletins([])
        setTotaux({})
        setPointageActif(null)
        return
      }
      setBulletins(data.bulletins || [])
      setTotaux(data.totaux || {})
      // Migration 135 — toggle pointage_actif renvoyé par /api/rh/paie
      // pour piloter le bandeau d'info en haut de la page.
      setPointageActif(data.pointage_actif ?? null)
    } catch (e: any) {
      console.error('[rh/paie] load exception', e)
      setLoadError(t('rha.a.paie.err_network', locale) + (e?.message || ''))
      setBulletins([])
      setTotaux({})
      setPointageActif(null)
    } finally { setLoading(false) }
  }, [societe, periode, periodeReady])

  // PE1 — charge la config période paie de la société sélectionnée.
  useEffect(() => {
    if (!societe || societe === "all") { setPeriodeCfg({ ...DEFAULT_PERIODE_CFG }); return }
    let cancelled = false
    fetch(`/api/rh/societe?societe_id=${societe}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        const s = d?.societe || d || {}
        setPeriodeCfg({
          mode: (s.periode_paie_mode as PeriodePaieMode) || 'calendaire',
          jour_cut_off: Number(s.periode_paie_jour_cut_off) || 24,
          jour_paiement: s.periode_paie_jour_paiement == null ? null : Number(s.periode_paie_jour_paiement),
          offset_paiement_mois: (Number(s.periode_paie_offset_paiement_mois) === 1 ? 1 : 0) as 0 | 1,
        })
      })
      .catch(() => setPeriodeCfg({ ...DEFAULT_PERIODE_CFG }))
    return () => { cancelled = true }
  }, [societe])

  const loadWorkflow = useCallback(async () => {
    if (!periode || societe === "all") { setWorkflow(null); return }
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "workflow_status", societe_id: societe, periode })
      })
      if (!res.ok) { setWorkflow(null); return } // tables may not exist yet
      const data = await res.json()
      setWorkflow(data.workflow || null)
      setAudit(data.audit || [])
    } catch { setWorkflow(null) }
  }, [societe, periode])

  // Sprint 11 BUG 1 — DÉCISION PATRON : aucun calcul automatique.
  // Le chargement de la page ne fait que GET /api/rh/paie (lecture seule,
  // aucune écriture). La génération des bulletins n'est déclenchée que par
  // un clic explicite du RH sur "Calculer la paie" (stepper ou empty state).
  // Ne PAS ajouter d'appel à calculerBatch() depuis un useEffect ou depuis
  // load() — cela réintroduirait le comportement auto proscrit.
  useEffect(() => { load(); loadWorkflow() }, [load, loadWorkflow])

  // Bug A fix — récupère les employés avec date_depart dans le mois affiché
  // pour pré-alerter le RH avant le calcul. Lecture seule, non-bloquant.
  useEffect(() => {
    if (!periode || societe === "all" || !societe) {
      setEmployesSortants([])
      return
    }
    const [yyyy, mm] = periode.split('-')
    if (!yyyy || !mm) return
    const moisDebut = `${yyyy}-${mm}-01`
    const moisFin = new Date(Number(yyyy), Number(mm), 0).toISOString().slice(0, 10)
    let cancelled = false
    // statut=tous : retourne actifs + sortis. On filtre côté client
    // ceux dont date_depart tombe pile dans le mois affiché.
    fetch(`/api/rh/employes?societe_id=${societe}&statut=tous`)
      .then(r => r.ok ? r.json() : { employes: [] })
      .then(d => {
        if (cancelled) return
        const tous = d.employes || d.data || []
        const sortantsCeMois = tous
          .filter((e: any) => {
            if (!e.date_depart) return false
            const dd = String(e.date_depart).slice(0, 10)
            return dd >= moisDebut && dd <= moisFin
          })
          .map((e: any) => ({
            id: e.id,
            prenom: e.prenom || '',
            nom: e.nom || '',
            date_depart: String(e.date_depart).slice(0, 10),
          }))
        setEmployesSortants(sortantsCeMois)
      })
      .catch(() => setEmployesSortants([]))
    return () => { cancelled = true }
  }, [societe, periode])

  const doAction = async (action: string, extra?: any) => {
    if (societe === "all") return alert(t('rha.a.paie.err_pick_societe', locale))
    setActionLoading(action)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, societe_id: societe, periode, ...extra })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || t('rha.a.paie.err_generic', locale)); return data }
      return data
    } catch (e: any) { alert(t('rha.a.paie.err_network', locale) + (e.message || "")); return null }
    finally { setActionLoading(null); load(); loadWorkflow() }
  }

  const calculerBatch = async () => {
    if (societe === "all") return alert(t('rha.a.paie.err_pick_societe', locale))
    const calcPeriode = periode || new Date().toISOString().slice(0, 7)
    setCalculating(true)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer_batch", societe_id: societe, periode: calcPeriode })
      })
      let data: any
      const text = await res.text()
      try { data = JSON.parse(text) } catch { alert(t('rha.a.paie.err_server', locale) + text.slice(0, 300)); setCalculating(false); return }
      if (!res.ok) {
        alert(t('rha.a.paie.err_status_prefix', locale).replace('{status}', String(res.status)) + (data.error || JSON.stringify(data).slice(0, 300)))
      } else {
        // F14 — Toast detaille avec breakdown updates/inserts/skip/erreurs.
        const r = data.recalcul
        if (r) {
          const parts: string[] = []
          const title = r.action === 'recalcul_batch' ? t('rha.a.paie.calc_recalcul_title', locale) : t('rha.a.paie.calc_initial_title', locale)
          parts.push(`${title} — ${calcPeriode}`)
          parts.push(t('rha.a.paie.calc_nb_modifies', locale).replace('{n}', String(r.nb_modifies)))
          if (r.nb_updates > 0 && r.nb_inserts > 0) {
            parts.push(t('rha.a.paie.calc_breakdown', locale).replace('{u}', String(r.nb_updates)).replace('{i}', String(r.nb_inserts)))
          }
          if (r.nb_skip > 0) {
            const raisonsList: string[] = []
            for (const [k, v] of Object.entries(r.raisons_skip || {})) {
              raisonsList.push(`${v} ${k}`)
            }
            parts.push(t('rha.a.paie.calc_nb_skip', locale).replace('{n}', String(r.nb_skip)).replace('{raisons}', raisonsList.join(', ')))
          }
          if (r.nb_erreurs > 0) parts.push(t('rha.a.paie.calc_nb_erreurs', locale).replace('{n}', String(r.nb_erreurs)))
          parts.push(t('rha.a.paie.calc_duree', locale).replace('{s}', (r.duree_ms / 1000).toFixed(1)))
          const msg = parts.join('\n')
          alert(msg + (r.nb_erreurs > 0 && data.erreurs ? `\n\n${t('rha.a.paie.calc_details', locale)}${data.erreurs.join("\n")}` : ""))
        } else {
          const nb = data.nb || data.bulletins?.length || 0
          const erreurs = data.erreurs || []
          alert(
            t('rha.a.paie.calc_nb_bulletins', locale).replace('{n}', String(nb)).replace('{p}', calcPeriode)
            + (erreurs.length > 0 ? t('rha.a.paie.calc_erreurs_suffix', locale).replace('{n}', String(erreurs.length)) + erreurs.join("\n") : "")
          )
        }
        if (!availablePeriodes.includes(calcPeriode)) {
          setAvailablePeriodes(prev => [calcPeriode, ...prev].sort((a, b) => b.localeCompare(a)))
        }
        setPeriode(calcPeriode); setPeriodeReady(true)
        if (data.bulletins?.length > 0) { setBulletins(data.bulletins); setTotaux(data.totaux || {}) }
        else { load() }
        loadWorkflow()
      }
    } catch (e: any) { alert(t('rha.a.paie.err_network', locale) + (e.message || "")) } finally { setCalculating(false) }
  }

  const validerTous = () => doAction("valider_tous")
  const verrouiller = async () => {
    if (!confirm(t('rha.a.paie.confirm_verrouiller', locale))) return
    if (societe === "all") return alert(t('rha.a.paie.err_pick_societe', locale))
    setComptabilisationLoading(true)
    setComptabilisationResult(null)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verrouiller", societe_id: societe, periode })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || t('rha.a.paie.err_verrouillage', locale)); return }
      if (data.nb_bulletins_comptabilises > 0) {
        setComptabilisationResult(
          t('rha.a.paie.lock_ok_ecritures', locale)
            .replace('{n}', String(data.nb_ecritures))
            .replace('{b}', String(data.nb_bulletins_comptabilises))
        )
      } else {
        setComptabilisationResult(t('rha.a.paie.lock_ok_skip', locale))
      }
      if (data.erreurs_compta?.length) {
        console.warn("[verrouiller] erreurs comptabilisation:", data.erreurs_compta)
        alert(t('rha.a.paie.lock_warn_compta', locale).replace('{n}', String(data.erreurs_compta.length)))
      }
      load(); loadWorkflow()
    } catch (e: any) {
      alert(t('rha.a.paie.err_network', locale) + (e.message || ""))
    } finally { setComptabilisationLoading(false) }
  }
  const deverrouiller = () => {
    const motif = prompt(t('rha.a.paie.prompt_motif_deverrouillage', locale))
    if (!motif) return
    doAction("deverrouiller", { motif })
  }

  const exportVirements = async () => {
    if (societe === "all") return alert(t('rha.a.paie.err_pick_societe', locale))
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode, format: "json" })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || t('rha.a.paie.err_export', locale)); return }
      if (data.content) {
        const blob = new Blob([data.content], { type: "text/csv" })
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = data.filename || "export.csv"; a.click()
      } else if (data.fichiers?.length > 0) {
        for (const f of data.fichiers) {
          const blob = new Blob([f.content], { type: "text/csv" })
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = f.filename; a.click()
        }
      } else { alert(t('rha.a.paie.err_no_file', locale)) }
      doAction("mark_step", { step: "virements_generes" })
    } catch (e: any) { alert(t('rha.a.paie.err_network', locale) + (e.message || "")) }
  }

  const comptabiliserPaie = async () => {
    if (societe === "all") return alert(t('rha.a.paie.err_pick_societe', locale))
    setComptabilisationLoading(true)
    setComptabilisationResult(null)
    try {
      const data = await fetch("/api/rh/paie/comptabiliser", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_periode: true, societe_id: societe, periode })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      setComptabilisationResult(
        t('rha.a.paie.compta_ok', locale)
          .replace('{n}', String(data.nb_ecritures))
          .replace('{b}', String(data.nb_bulletins))
      )
      doAction("mark_step", { step: "comptabilise" })
      load(); loadWorkflow()
    } catch (e: unknown) {
      setComptabilisationResult(t('rha.a.paie.compta_err_prefix', locale) + (e instanceof Error ? e.message : t('rha.a.paie.compta_err_unknown', locale)))
    } finally { setComptabilisationLoading(false) }
  }

  const ouvrirPDF = (bulletinId: string) => {
    setPdfLoading(bulletinId)
    window.open(`/api/rh/paie/pdf?bulletin_id=${bulletinId}`, "_blank")
    setPdfLoading(null)
  }

  const bulletinsNonComptabilises = bulletins.filter(b => b.statut === "valide" && !b.comptabilise)

  // Use local bulletins as fallback when workflow API fails (tables not created yet)
  const hasBulletins = bulletins.length > 0 || !!workflow?.bulletins_generes
  const allBrouillon = bulletins.length > 0 && bulletins.every(b => b.statut === "brouillon")
  const localAllValidated = bulletins.length > 0 && bulletins.every(b => b.statut === "valide" || b.verrouille)
  const localAllLocked = bulletins.length > 0 && bulletins.every(b => b.verrouille)

  const isLocked = workflow?.tous_verrouilles || localAllLocked
  const allValidated = workflow?.tous_valides || localAllValidated

  // ─── Workflow Stepper ──────────────────────────────────────────
  const steps: {
    id: string; label: string; desc: string; done: boolean; icon: any;
    link?: string; action?: () => void; actionLabel?: string;
    actionDisabled?: boolean; phase: "process" | "postlock";
  }[] = [
    {
      id: "calcul", label: t('rha.a.paie.step_calcul', locale),
      desc: hasBulletins
        ? t('rha.a.paie.desc_nb_bulletins', locale).replace('{n}', String(bulletins.length || workflow?.bulletins_total || 0))
        : t('rha.a.paie.desc_lancer_calcul', locale),
      done: hasBulletins, icon: Calculator,
      action: calculerBatch,
      // Bug A fix — si des employés sont sortis dans la période, libellé
      // explicite "solde tout compte" pour signaler le mode de calcul.
      actionLabel: employesSortants.length > 0
        ? (hasBulletins ? "Recalculer (solde tout compte)" : "Calculer en solde tout compte")
        : (hasBulletins ? t('rha.a.paie.btn_recalculer_paie', locale) : t('rha.a.paie.btn_calculer_paie', locale)),
      actionDisabled: calculating || isLocked, phase: "process",
    },
    {
      id: "validation", label: t('rha.a.paie.step_validation', locale),
      desc: hasBulletins
        ? t('rha.a.paie.desc_valides_x_y', locale).replace('{x}', String(bulletins.filter(b => b.statut === "valide" || b.verrouille).length)).replace('{y}', String(bulletins.length))
        : t('rha.a.paie.desc_apres_calcul', locale),
      done: !!allValidated, icon: CheckCircle,
      action: validerTous, actionLabel: t('rha.a.paie.btn_valider_tous', locale),
      actionDisabled: !hasBulletins || allValidated || isLocked, phase: "process",
    },
    {
      id: "verrouillage", label: t('rha.a.paie.step_verrouillage', locale),
      desc: isLocked
        ? t('rha.a.paie.desc_verrouille', locale)
        : allValidated
          ? t('rha.a.paie.desc_pret_verrouiller', locale)
          : t('rha.a.paie.desc_apres_validation', locale),
      done: isLocked, icon: Lock,
      action: verrouiller, actionLabel: t('rha.a.paie.btn_verrouiller', locale),
      actionDisabled: !allValidated || isLocked, phase: "process",
    },
    {
      id: "virements", label: t('rha.a.paie.step_virements', locale),
      desc: workflow?.virements_generes ? t('rha.a.paie.desc_exporte', locale) : t('rha.a.paie.desc_export_banque', locale),
      done: !!workflow?.virements_generes, icon: CreditCard,
      action: exportVirements, actionLabel: t('rha.a.paie.btn_exporter', locale),
      actionDisabled: !isLocked, phase: "postlock",
    },
    {
      id: "mra", label: t('rha.a.paie.step_mra', locale),
      desc: workflow?.mra_declare ? t('rha.a.paie.desc_declare', locale) : t('rha.a.paie.desc_csg_nsf_paye', locale),
      done: !!workflow?.mra_declare, icon: FileSpreadsheet,
      link: "/rh/exports/paie", phase: "postlock",
    },
    {
      id: "compta", label: t('rha.a.paie.step_compta', locale),
      desc: workflow?.tous_comptabilises
        ? t('rha.a.paie.desc_ecritures_faites', locale)
        : bulletinsNonComptabilises.length > 0
          ? t('rha.a.paie.desc_x_a_faire', locale).replace('{n}', String(bulletinsNonComptabilises.length))
          : t('rha.a.paie.desc_apres_verrouillage', locale),
      done: !!workflow?.tous_comptabilises, icon: BookOpen,
      action: comptabiliserPaie, actionLabel: t('rha.a.paie.btn_comptabiliser', locale),
      actionDisabled: !isLocked || comptabilisationLoading || bulletinsNonComptabilises.length === 0,
      phase: "postlock",
    },
  ]

  // Simulation state
  const [simResult, setSimResult] = useState<{ brut: number; deductions: number; net: number; coutEmployeur: number; detailCSG: string } | null>(null)

  const runSimulation = () => {
    // F9 + F10 + F11 — simulation alignée sur le moteur calculerBulletin :
    //  - CSG  : 1.5% si BASIC ≤ 50K, 3% sinon (sur BASIC SEUL, règle MRA F11)
    //  - NSF  : 1% plafonné à 28 600 MUR (sur BASIC SEUL, règle MRA F11)
    //  - PAYE : cumulatif annuel × 13 / 13 sur 500k-1M-20% (sur BRUT TOTAL)
    // Le champ "Salaire brut" ici = salaire_base (basic) ; OT et primes
    // sont considérés comme allowances qui s'ajoutent au brut pour PAYE
    // mais PAS à la base CSG/NSF.
    const basic = parseFloat((document.getElementById("sim-brut") as HTMLInputElement)?.value || "0")
    const ot = parseFloat((document.getElementById("sim-ot") as HTMLInputElement)?.value || "0")
    const prime = parseFloat((document.getElementById("sim-prime") as HTMLInputElement)?.value || "0")
    const brutTotal = basic + ot + prime

    // F11 — CSG et NSF sur basic salary uniquement.
    const csgRate = basic <= 50000 ? 0.015 : 0.03
    const csg = Math.round(basic * csgRate)

    const NSF_PLAFOND = 28570
    const nsfBase = Math.min(basic, NSF_PLAFOND)
    const nsf = Math.round(nsfBase * 0.01)

    // PAYE sur brut total (basic + allowances/OT/primes).
    const revenuAnnuel = brutTotal * 13
    let payeAnnuel = 0
    if (revenuAnnuel > 500000) {
      if (revenuAnnuel <= 1000000) payeAnnuel = (revenuAnnuel - 500000) * 0.10
      else payeAnnuel = 50000 + (revenuAnnuel - 1000000) * 0.20
    }
    const paye = Math.floor(payeAnnuel / 13)

    const deductions = csg + nsf + paye
    const net = brutTotal - deductions
    // F11 — Charges patronales CSG/NSF sur basic. Training levy & PRGF inchangés.
    const csgPRate = basic <= 50000 ? 0.03 : 0.06
    const csgP = Math.round(basic * csgPRate)
    const nsfP = Math.round(nsfBase * 0.025)
    const tl = Math.round(basic * 0.015)
    const prgf = Math.round(4.5 * 26)
    const totalCharges = csgP + nsfP + tl + prgf
    setSimResult({
      brut: brutTotal,
      deductions,
      net,
      coutEmployeur: brutTotal + totalCharges,
      detailCSG:
        t('rha.a.paie.sim_csg_detail', locale)
          .replace('{rate}', (csgRate * 100).toFixed(1))
          .replace('{cap}', String(NSF_PLAFOND))
        + (paye > 0 ? t('rha.a.paie.sim_paye_suffix', locale).replace('{amt}', fmt(paye)) : "")
    })
  }

  // ─── Inline editing ─────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, number | string>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const startEdit = (b: any) => {
    setEditingId(b.id)
    setEditFields({
      salaire_base: Number(b.salaire_base) || 0,
      heures_sup_montant: Number(b.heures_sup_montant) || 0,
      special_allowance_1: Number(b.special_allowance_1) || 0,
      special_allowance_2: Number(b.special_allowance_2) || 0,
      special_allowance_3: Number(b.special_allowance_3) || 0,
      transport_allowance: Number(b.transport_allowance) || 0,
      petrol_allowance: Number(b.petrol_allowance) || 0,
      jours_absence: Number(b.jours_absence) || 0,
      montant_absence: Number(b.montant_absence) || 0,
      prime_label_1: b.employe?.prime_fixe_1_libelle || "",
      prime_label_2: b.employe?.prime_fixe_2_libelle || "",
      prime_label_3: b.employe?.prime_fixe_3_libelle || "",
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    setSavingEdit(true)
    try {
      // Save bulletin fields (strip prime_label_ fields which go to employee)
      const bulletinChamps: Record<string, any> = {}
      const empChamps: Record<string, any> = {}
      for (const [k, v] of Object.entries(editFields)) {
        if (k.startsWith("prime_label_")) {
          const n = k.replace("prime_label_", "")
          empChamps[`prime_fixe_${n}_libelle`] = v
        } else {
          bulletinChamps[k] = v
        }
      }
      // Save bulletin
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "modifier_bulletin", bulletin_id: editingId, champs: bulletinChamps })
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || t('rha.a.paie.err_generic', locale)); return }
      // Save prime labels on employee if changed
      const b = bulletins.find(x => x.id === editingId)
      if (b && Object.keys(empChamps).length > 0) {
        await fetch("/api/rh/paie", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "modifier_employe", employe_id: b.employe_id, champs: empChamps })
        })
      }
      setEditingId(null)
      load(); loadWorkflow()
    } catch (e: any) { alert(t('rha.a.paie.compta_err_prefix', locale) + (e.message || "")) }
    finally { setSavingEdit(false) }
  }

  const [recalcId, setRecalcId] = useState<string | null>(null)

  // FIX-SOLDE-STC — modal "employé sortant" : quand l'API renvoie 409 avec
  // code=EMPLOYE_SORTANT (action `calculer` ou `calculer_batch` sur un
  // employé dont date_depart tombe dans la période), on redirige le RH
  // vers /rh/depart au lieu d'afficher une alerte technique.
  const [sortantModal, setSortantModal] = useState<{
    employe_id: string
    employe_nom: string
    date_depart: string
    redirect_url: string
    hint?: string
  } | null>(null)

  const recalculerEmploye = async (employe_id: string) => {
    if (societe === "all") return
    const emp = bulletins.find(b => b.employe_id === employe_id)
    const nomComplet = emp?.employe ? `${emp.employe.prenom} ${emp.employe.nom}` : employe_id
    // FIX-IMMUTABLE (mig 427) — garde côté UI : un bulletin comptabilisé
    // ne peut pas être recalculé. Le bouton est déjà masqué quand
    // comptabilise=true mais on garde la garde au cas où (URL forgée,
    // état stale, etc.).
    if (emp?.comptabilise) {
      alert(`Bulletin de ${nomComplet} déjà comptabilisé — modification interdite. Voir les écritures liées ou décomptabiliser (admin).`)
      return
    }
    // FIX-SOLDE-STC — pré-check côté client : si l'employé est sortant ce
    // mois, on déclenche directement la modal "module Départ" sans aller
    // taper l'API (UX plus rapide). L'API reste source de vérité — voir
    // gestion 409/EMPLOYE_SORTANT plus bas.
    const empSortant = employesSortants.find(e => e.id === employe_id)
    if (empSortant) {
      setSortantModal({
        employe_id,
        employe_nom: `${empSortant.prenom} ${empSortant.nom}`,
        date_depart: empSortant.date_depart,
        redirect_url: `/rh/depart?employe_id=${employe_id}`,
        hint: "Le bulletin paie normal ne peut pas être généré pour un employé sortant. Le solde tout compte inclut salaire prorata + indemnités (préavis, licenciement) + 13e prorata + AL payée.",
      })
      return
    }
    if (!confirm(t('rha.a.paie.confirm_recalc_employe', locale).replace('{nom}', nomComplet))) return
    setRecalcId(employe_id)
    try {
      const res = await fetch("/api/rh/paie", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "calculer_batch", societe_id: societe, periode, employe_ids: [employe_id] })
      })
      const data = await res.json()
      // FIX-IMMUTABLE — 409 = bulletin comptabilisé, message dédié au lieu d'une alerte générique
      if (res.status === 409 && data?.code === 'BULLETIN_COMPTABILISE') {
        alert(`Bulletin de ${nomComplet} déjà comptabilisé — modification interdite.\n${data.hint || ''}`)
      } else if (res.status === 409 && data?.code === 'EMPLOYE_SORTANT') {
        // FIX-SOLDE-STC — l'API a refusé : ouvrir la modal de redirection.
        setSortantModal({
          employe_id,
          employe_nom: data.employe_nom || nomComplet,
          date_depart: data.date_depart,
          redirect_url: data.redirect_url || `/rh/depart?employe_id=${employe_id}`,
          hint: data.hint,
        })
      } else if (!res.ok) {
        alert(data.error || t('rha.a.paie.err_generic', locale))
      }
      load(); loadWorkflow()
    } catch (e: any) { alert(t('rha.a.paie.compta_err_prefix', locale) + (e.message || "")) }
    finally { setRecalcId(null) }
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.a.paie.title', locale)}</h1>
            <p className="text-sm text-gray-500">{t('rha.a.paie.subtitle2', locale)}</p>
          </div>
        </div>

        {/* Sprint 5 FIX 4 — banner d'erreur non-bloquant (remplace l'alert) */}
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
              <div>
                <p className="font-medium">{t('rha.a.paie.err_load', locale)}</p>
                <p className="text-xs text-red-800 mt-0.5">{loadError}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setLoadError(null); load() }}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              {t('rha.a.paie.retry', locale)}
            </Button>
          </div>
        )}

        {/* Migration 135 — bandeau état du toggle pointage_actif */}
        {societe !== "all" && pointageActif === false && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start gap-3">
            <span className="text-lg leading-none">ℹ️</span>
            <div>
              <p className="font-medium">{t('rha.a.paie.pointage_off_title', locale)}</p>
              <p className="text-xs text-blue-800 mt-0.5">
                {t('rha.a.paie.pointage_off_hint', locale)}
              </p>
            </div>
          </div>
        )}
        {societe !== "all" && pointageActif === true && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-start gap-3">
            <span className="text-lg leading-none">✅</span>
            <div>
              <p className="font-medium">{t('rha.a.paie.pointage_on_title', locale)}</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                {t('rha.a.paie.pointage_on_hint', locale)}
              </p>
            </div>
          </div>
        )}

        {/* Period selector */}
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center flex-wrap">
            <Select value={societe} onValueChange={setSociete}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={t('rha.a.paie.societe_ph', locale)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('rha.a.paie.toutes', locale)}</SelectItem>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={periode} onValueChange={setPeriode}>
              <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder={t('rha.a.paie.periode_ph', locale)} /></SelectTrigger>
              <SelectContent>
                {availablePeriodes.map(p => {
                  const d = new Date(p + "-15")
                  const label = d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { month: "long", year: "numeric" })
                  const base = label.charAt(0).toUpperCase() + label.slice(1)
                  // PE1 — suffixe '(25/03 → 24/04)' si mode cut_off_jour.
                  let suffix = ""
                  if (periodeCfg.mode === 'cut_off_jour') {
                    const r = calculerPeriodePaieSync(periodeCfg, `${p}-01`)
                    const fmt = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
                    suffix = ` (${fmt(r.periode_debut)} → ${fmt(r.periode_fin)})`
                  }
                  return <SelectItem key={p} value={p}>{base}{suffix}</SelectItem>
                })}
              </SelectContent>
            </Select>
            {isLocked && (
              <Badge className="bg-red-100 text-red-700 gap-1"><Lock className="w-3 h-3" />{t('rha.a.paie.locked_badge', locale)}</Badge>
            )}
          </CardContent>
        </Card>

        {/* Sprint 12 FEATURE 5 — onglets Bulletins / Validation / Historique */}
        <Tabs value={activeTab} onValueChange={changeTab}>
          <TabsList>
            <TabsTrigger value="bulletins" className="gap-2"><Calculator className="w-4 h-4" />{t('rha.a.paie.tab_bulletins', locale)}</TabsTrigger>
            <TabsTrigger value="validation" className="gap-2"><ShieldCheck className="w-4 h-4" />{t('rha.a.paie.tab_validation', locale)}</TabsTrigger>
            <TabsTrigger value="historique" className="gap-2"><History className="w-4 h-4" />{t('rha.a.paie.tab_historique', locale)}</TabsTrigger>
          </TabsList>

          <TabsContent value="bulletins" className="space-y-6 mt-4">

        {/* Bug A fix — Alert employés sortis dans la période.
            Prévient le RH AVANT le calcul que les bulletins de ces
            employés seront en solde tout compte avec prorata auto.
            Cas type : Alicia Désiré sortie le 18 → bulletin 18j et non
            30j, et bulletin précédent éventuellement archivé. */}
        {employesSortants.length > 0 && (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-amber-900">
                  {employesSortants.length === 1
                    ? "Sortie employé dans la période — solde tout compte"
                    : `${employesSortants.length} sorties employés dans la période — solde tout compte`}
                </p>
                <ul className="text-sm text-amber-800 space-y-1">
                  {employesSortants.map(e => {
                    const d = new Date(e.date_depart + "T12:00:00").toLocaleDateString(
                      locale === 'en' ? 'en-GB' : 'fr-FR',
                      { day: '2-digit', month: '2-digit', year: 'numeric' },
                    )
                    return (
                      <li key={e.id} className="flex items-center gap-2">
                        <span className="font-medium">{e.prenom} {e.nom}</span>
                        <span className="text-amber-700">— sortie le {d}</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="text-xs text-amber-700">
                  Le bulletin sera calculé en <b>solde tout compte</b> avec prorata
                  automatique sur la base des jours travaillés. Si un bulletin
                  existe déjà au mois entier, il sera archivé (consultable depuis
                  <a href="/rh/historique-paie" className="underline ml-1">Historique paie</a>).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══ WORKFLOW STEPPER ═══ */}
        {societe !== "all" && (
          <div className="space-y-4">
            {/* Calcul, validation et verrouillage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
                  <ShieldCheck className="w-4 h-4 inline mr-1" />
                  {t('rha.a.paie.workflow_title', locale)}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {steps.filter(s => s.phase === "process").map(step => {
                    const Icon = step.icon
                    return (
                      <div key={step.id} className={`p-4 rounded-xl border-2 text-center ${
                        step.done
                          ? "border-green-300 bg-green-50"
                          : step.actionDisabled
                            ? "border-gray-200 bg-gray-50"
                            : "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
                      }`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                          step.done ? "bg-green-100 text-green-700" : step.actionDisabled ? "bg-gray-100 text-gray-400" : "bg-blue-100 text-blue-700"
                        }`}>
                          {step.done ? <CheckCircle className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                        </div>
                        <p className={`text-sm font-bold ${step.done ? "text-green-700" : step.actionDisabled ? "text-gray-400" : "text-blue-700"}`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{step.desc}</p>
                        {/* Sprint 16 BUG 2 — ne PAS masquer le bouton quand step.done=true
                            pour l'étape "calcul". Le RH doit pouvoir recalculer à tout
                            moment tant que la période n'est pas verrouillée. */}
                        {step.done && step.id !== "calcul" ? (
                          <span className="inline-block mt-2 text-xs text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded-full">{t('rha.a.paie.fait', locale)}</span>
                        ) : step.done && step.id === "calcul" && !isLocked ? (
                          <div className="flex flex-col items-center gap-1 mt-2">
                            <span className="text-xs text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded-full">{t('rha.a.paie.fait', locale)}</span>
                            <Button
                              className="h-7 text-[11px] px-3"
                              variant="outline"
                              disabled={step.actionDisabled || !!actionLoading || calculating}
                              onClick={step.action}
                            >
                              {calculating && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                              {t('rha.a.paie.recalculer', locale)}
                            </Button>
                          </div>
                        ) : step.action ? (
                          <Button
                            className="mt-3 h-8 text-xs px-4"
                            style={step.id === "verrouillage" ? { backgroundColor: "#dc2626", color: "white" } : { backgroundColor: NAVY, color: "white" }}
                            disabled={step.actionDisabled || !!actionLoading || calculating}
                            onClick={step.action}
                          >
                            {(actionLoading === step.id || (step.id === "calcul" && calculating)) && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            {step.actionLabel}
                          </Button>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Post-verrouillage */}
            <Card className={!isLocked ? "opacity-50" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold" style={{ color: GOLD }}>
                  <Lock className="w-4 h-4 inline mr-1" />
                  {t('rha.a.paie.postlock_title', locale)}
                  {!isLocked && <span className="text-xs text-gray-400 font-normal ml-2">{t('rha.a.paie.postlock_hint', locale)}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {steps.filter(s => s.phase === "postlock").map(step => {
                    const Icon = step.icon
                    return (
                      <div key={step.id} className={`p-4 rounded-xl border-2 text-center ${
                        step.done ? "border-green-300 bg-green-50" : isLocked ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"
                      }`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${
                          step.done ? "bg-green-100 text-green-700" : isLocked ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"
                        }`}>
                          {step.done ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                        </div>
                        <p className={`text-sm font-bold ${step.done ? "text-green-700" : isLocked ? "text-amber-800" : "text-gray-400"}`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{step.desc}</p>
                        {step.done ? (
                          <span className="inline-block mt-2 text-xs text-green-600 font-semibold bg-green-100 px-2 py-0.5 rounded-full">{t('rha.a.paie.fait', locale)}</span>
                        ) : step.action && isLocked ? (
                          <Button
                            className="mt-3 h-8 text-xs px-4"
                            style={{ backgroundColor: GOLD, color: "white" }}
                            disabled={step.actionDisabled || !!actionLoading}
                            onClick={step.action}
                          >
                            {(step.id === "compta" && comptabilisationLoading) && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            {step.actionLabel}
                          </Button>
                        ) : step.link && isLocked ? (
                          <a href={step.link}>
                            <Button className="mt-3 h-8 text-xs px-4" style={{ backgroundColor: GOLD, color: "white" }}>
                              {t('rha.a.paie.declarer_mra', locale)}
                            </Button>
                          </a>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                {comptabilisationResult && (
                  <p className="text-sm font-medium mt-3 p-2 bg-gray-50 rounded border">{comptabilisationResult}</p>
                )}
              </CardContent>
            </Card>

            {/* Lock bar */}
            {isLocked && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                <Lock className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-xs text-red-700 font-medium flex-1">{t('rha.a.paie.locked_msg', locale)}</span>
                <Button onClick={deverrouiller} variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-100 h-7 text-xs shrink-0">
                  <Unlock className="w-3 h-3 mr-1" />{t('rha.a.paie.deverrouiller', locale)}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Summary cards */}
        {bulletins.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: t('rha.a.paie.kpi_brute', locale), v: fmt(totaux.masse_salariale_brute || 0), color: `text-[${NAVY}]` },
              { label: t('rha.a.paie.kpi_nette', locale), v: fmt(totaux.masse_salariale_nette || 0), color: "text-green-700" },
              { label: t('rha.a.paie.kpi_deductions', locale), v: fmt((totaux.masse_salariale_brute || 0) - (totaux.masse_salariale_nette || 0)), color: "text-red-600" },
              { label: t('rha.a.paie.kpi_charges', locale), v: fmt(totaux.total_charges_patronales || 0), color: "text-orange-600" },
              { label: t('rha.a.paie.kpi_cout', locale), v: fmt(totaux.cout_total_employeur || 0), color: "text-[#D4AF37]" },
            ].map(k => (
              <Card key={k.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`}>{k.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ═══ BULLETINS TABLE ═══ */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle style={{ color: NAVY }}>{t('rha.a.paie.bulletins_for', locale)} — {periode} ({bulletins.length})</CardTitle>
              <div className="flex gap-2">
                {periode.endsWith("-12") && !isLocked && (
                  <Button onClick={() => {
                    if (societe === "all") return alert(t('rha.a.paie.err_pick_societe', locale))
                    if (confirm(t('rha.a.paie.confirm_eoy', locale))) {
                      fetch("/api/rh/paie", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "calculer_batch", societe_id: societe, periode, include_eoy_bonus: true })
                      }).then(() => { load(); loadWorkflow() })
                    }
                  }} variant="outline" className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10" size="sm">
                    {t('rha.a.paie.eoy_btn', locale)}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : bulletins.length === 0 ? (
              // Sprint 11 BUG 1 — empty state avec CTA explicite "Calculer la paie".
              // Le calcul est MANUEL uniquement (décision patron) — aucun bulletin
              // n'est généré tant que le RH ne clique pas sur ce bouton.
              <div className="text-center py-12 text-gray-500">
                <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium text-gray-700">{t('rha.a.paie.empty_title', locale)}</p>
                <p className="text-sm mt-1 mb-4">
                  {t('rha.a.paie.empty_hint', locale)}
                </p>
                <Button
                  onClick={calculerBatch}
                  disabled={calculating || societe === "all" || isLocked}
                  className="bg-[#0B0F2E] text-white hover:bg-[#1a2050]"
                >
                  {calculating
                    ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    : <Calculator className="w-4 h-4 mr-2" />}
                  {t('rha.a.paie.calculer', locale)}
                </Button>
                {societe === "all" && (
                  <p className="text-xs text-amber-600 mt-3">{t('rha.a.paie.empty_pick', locale)}</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rha.a.paie.col_employe', locale)}</TableHead>
                    <TableHead>{t('rha.a.paie.col_poste', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.a.paie.col_base', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.a.paie.col_ot', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.a.paie.col_primes', locale)}</TableHead>
                    <TableHead className="text-right font-bold">{t('rha.a.paie.col_brut', locale)}</TableHead>
                    <TableHead className="text-right text-red-600">{t('rha.a.paie.col_deductions', locale)}</TableHead>
                    <TableHead className="text-right font-bold text-green-700">{t('rha.a.paie.col_net', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.a.paie.col_charges', locale)}</TableHead>
                    <TableHead>{t('rha.a.paie.col_statut', locale)}</TableHead>
                    <TableHead>{t('rha.a.paie.col_actions', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulletins.map(b => (
                    <React.Fragment key={b.id}>
                    <TableRow className={b.verrouille ? "bg-gray-50" : ""}>
                      <TableCell className="font-medium">
                        {b.employe?.prenom} {b.employe?.nom}
                        {b.employe?.exclure_mra && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-bold">{t('rha.a.paie.badge_hors_mra', locale)}</span>
                        )}
                        {b.employe?.devise_salaire === "EUR" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-semibold cursor-help">EUR</span>
                            </TooltipTrigger>
                            <TooltipContent><p>Taux: {b.employe?.taux_change_eur || 46.50} MUR</p></TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{b.employe?.poste || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(b.salaire_base)}</TableCell>
                      <TableCell className="text-right text-orange-600 text-sm">
                        {Number(b.heures_sup_montant) > 0 ? fmt(b.heures_sup_montant) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-purple-600 text-sm">
                        {Number(b.special_allowance_1) > 0 ? fmt(b.special_allowance_1) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">{fmt(b.salaire_brut)}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm text-xs">
                            <p className="font-bold mb-1">{t('rha.a.paie.tooltip_brut_title', locale)}</p>
                            <div className="space-y-0.5">
                              <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_base', locale)}</span><span className="font-mono">{fmt(b.salaire_base)}</span></p>
                              {Number(b.transport_allowance) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_transport', locale)}</span><span className="font-mono">{fmt(b.transport_allowance)}</span></p>}
                              {Number(b.petrol_allowance) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_essence', locale)}</span><span className="font-mono">{fmt(b.petrol_allowance)}</span></p>}
                              {Number(b.heures_sup_montant) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_ot', locale)}</span><span className="font-mono">{fmt(b.heures_sup_montant)}</span></p>}
                              {Number(b.special_allowance_1) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_prime_1', locale)}</span><span className="font-mono">{fmt(b.special_allowance_1)}</span></p>}
                              {Number(b.special_allowance_2) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_prime_2', locale)}</span><span className="font-mono">{fmt(b.special_allowance_2)}</span></p>}
                              {Number(b.special_allowance_3) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_prime_3', locale)}</span><span className="font-mono">{fmt(b.special_allowance_3)}</span></p>}
                              {Number(b.other_refund) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_other_refund', locale)}</span><span className="font-mono">{fmt(b.other_refund)}</span></p>}
                              {Number(b.increment_salaire) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_increment', locale)}</span><span className="font-mono">{fmt(b.increment_salaire)}</span></p>}
                              {Number(b.eoy_bonus) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_13e_mois', locale)}</span><span className="font-mono">{fmt(b.eoy_bonus)}</span></p>}
                              {Number(b.departure_notice) > 0 && <p className="flex justify-between gap-3"><span>{t('rha.a.paie.tooltip_preavis', locale)}</span><span className="font-mono">{fmt(b.departure_notice)}</span></p>}
                              <p className="flex justify-between gap-3 pt-1 mt-1 border-t border-gray-400 font-bold"><span>{t('rha.a.paie.tooltip_brut_total', locale)}</span><span className="font-mono">{fmt(b.salaire_brut)}</span></p>
                            </div>
                            {b.notes && <p className="mt-2 pt-1 border-t border-gray-400 text-gray-400 break-words">{b.notes}</p>}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right text-red-600 text-sm">{fmt(b.total_deductions)}</TableCell>
                      <TableCell className="text-right font-bold text-green-700">{fmt(b.salaire_net)}</TableCell>
                      <TableCell className="text-right text-orange-500 text-sm">{fmt(b.total_charges_patronales)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[b.statut] || ""}`}>{b.statut}</span>
                          {/* FIX-STC-IDENTIQUE (mig 430) — badge Solde de Tout Compte
                              + montant retenues manuelles si > 0 */}
                          {b.type_bulletin === 'solde_tout_compte' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded font-medium cursor-help">
                                  Solde de Tout Compte
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                Bulletin de paie de sortie — IDENTIQUE au calcul STC affiché dans /rh/depart.
                                {Number(b.retenues_manuelles) > 0 && (
                                  <div className="mt-1 pt-1 border-t border-gray-400">
                                    Retenues manuelles : <span className="font-mono font-bold">{fmt(b.retenues_manuelles)} MUR</span>
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {b.verrouille && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded gap-0.5 flex items-center"><Lock className="w-2.5 h-2.5" />{t('rha.a.paie.badge_lock', locale)}</span>}
                          {b.jours_absence > 0 && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">{t('rha.a.paie.badge_jours_abs', locale).replace('{n}', String(b.jours_absence))}</span>}
                          {/* FIX-IMMUTABLE (mig 427) — badge enrichi avec date de comptabilisation
                              et lien vers les écritures comptables liées. */}
                          {b.comptabilise && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded flex items-center gap-0.5 font-medium cursor-help"
                                  title={b.comptabilise_at ? `Comptabilisé le ${new Date(b.comptabilise_at).toLocaleDateString('fr-FR')}` : 'Comptabilisé'}
                                >
                                  <CheckCircle className="w-2.5 h-2.5" />
                                  {b.comptabilise_at
                                    ? `Comptabilisé ${new Date(b.comptabilise_at).toLocaleDateString('fr-FR')}`
                                    : t('rha.a.paie.badge_cpt', locale)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Bulletin verrouillé en comptabilité — modification interdite.
                                {b.ecriture_id ? ' Cliquer le bouton "Écritures" pour voir le détail.' : ''}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {/* FIX-IMMUTABLE (mig 427) — bulletin comptabilisé = aucune modif possible,
                              seulement consultation PDF + lien vers écritures comptables.
                              Le bouton "Recalculer" est masqué et remplacé par "Voir (verrouillé)". */}
                          {!b.verrouille && !b.comptabilise && b.statut === "brouillon" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => startEdit(b)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('rha.a.paie.tt_modifier', locale)}</TooltipContent>
                            </Tooltip>
                          )}
                          {!b.verrouille && !b.comptabilise && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => recalculerEmploye(b.employe_id)} disabled={recalcId === b.employe_id}>
                                  {recalcId === b.employe_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('rha.a.paie.tt_recalculer_all', locale)}</TooltipContent>
                            </Tooltip>
                          )}
                          {/* FIX-IMMUTABLE (mig 427) — bulletin comptabilisé : remplacer "Recalculer"
                              par "Voir écritures" qui ouvre le grand livre filtré sur l'écriture liée. */}
                          {b.comptabilise && b.ecriture_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                                  onClick={() => window.open(`/comptable/grand-livre?ecriture_id=${b.ecriture_id}`, '_blank')}
                                >
                                  <BookOpen className="w-3 h-3" />
                                  Écritures
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Voir les écritures comptables liées (lecture seule)</TooltipContent>
                            </Tooltip>
                          )}
                          {b.comptabilise && !b.ecriture_id && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="px-2 py-1 text-xs text-gray-500 italic flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  Verrouillé
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Bulletin comptabilisé — lecture seule</TooltipContent>
                            </Tooltip>
                          )}
                          {/* FIX-DECOMPTA — bouton décomptabilisation accessible RH+direction */}
                          {b.comptabilise && canDecomptabiliser && (
                            <DecomptabilisationDialog
                              bulletinId={b.id}
                              bulletin={{
                                id: b.id,
                                employe_nom: `${b.employe?.prenom || ''} ${b.employe?.nom || ''}`.trim(),
                                periode: b.periode || periode,
                                salaire_brut: b.salaire_brut || 0,
                                salaire_net: b.salaire_net || 0,
                                ecriture_id: b.ecriture_id || null,
                                comptabilise_at: b.comptabilise_at || null,
                              }}
                              onSuccess={() => { load(); loadWorkflow() }}
                            />
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => ouvrirPDF(b.id)} disabled={pdfLoading === b.id}>
                                {pdfLoading === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                                PDF
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('rha.a.paie.tt_dl_pdf', locale)}</TooltipContent>
                          </Tooltip>
                          {!b.verrouille && !b.employe?.exclure_mra && (
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-amber-600 hover:bg-amber-50 px-1.5" onClick={async () => {
                              if (!confirm(t('rha.a.paie.confirm_hors_mra', locale).replace('{nom}', `${b.employe?.prenom} ${b.employe?.nom}`))) return
                              await doAction("modifier_employe", { employe_id: b.employe_id, champs: { exclure_mra: true } })
                            }}>
                              {t('rha.a.paie.btn_hors_mra', locale)}
                            </Button>
                          )}
                          {/* FIX-IMMUTABLE (mig 427) — masquer suppression si comptabilisé.
                              Le trigger trg_bulletin_immutable_delete refuserait de toute
                              façon, on évite simplement l'erreur côté UI. */}
                          {!b.verrouille && !b.comptabilise && b.statut === "brouillon" && (
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-red-500 hover:bg-red-50 px-1.5" onClick={async () => {
                              if (!confirm(t('rha.a.paie.confirm_supprimer_bulletin', locale).replace('{nom}', `${b.employe?.prenom} ${b.employe?.nom}`))) return
                              await doAction("supprimer_bulletin", { bulletin_id: b.id })
                            }}>
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Inline edit row */}
                    {editingId === b.id && (
                      <TableRow className="bg-blue-50">
                        <TableCell colSpan={11} className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Pencil className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-bold text-blue-700">{t('rha.a.paie.edit_panel_title', locale).replace('{nom}', `${b.employe?.prenom} ${b.employe?.nom}`)}</span>
                            <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={() => setEditingId(null)}>
                              <X className="w-3 h-3 mr-1" />{t('rha.a.paie.btn_annuler', locale)}
                            </Button>
                          </div>

                          {/* Commit 11 — Congés du mois (shown when conges_details is available) */}
                          {b.conges_details && (
                            (b.conges_details.al_jours > 0
                              || b.conges_details.sl_jours > 0
                              || b.conges_details.ul_jours > 0
                              || b.conges_details.mat_pat_jours > 0
                              || (b.conges_details.anomalies_pointage?.length ?? 0) > 0) ? (
                              <div className="mb-4 rounded-md border border-blue-200 bg-white p-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 mb-2">{t('rha.a.paie.section_conges_mois', locale)}</p>
                                <table className="w-full text-xs">
                                  <thead className="text-[10px] text-gray-500 uppercase">
                                    <tr>
                                      <th className="text-left py-1">{t('rha.a.paie.col_type', locale)}</th>
                                      <th className="text-right py-1">{t('rha.a.paie.col_jours', locale)}</th>
                                      <th className="text-right py-1">{t('rha.a.paie.col_impact_salaire', locale)}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {b.conges_details.al_employe_jours > 0 && (
                                      <tr className="border-t border-gray-100">
                                        <td className="py-1">{t('rha.a.paie.al_employee_tag', locale)} <span className="text-gray-400">{t('rha.a.paie.al_employee_suffix', locale)}</span></td>
                                        <td className="text-right py-1 font-medium">{b.conges_details.al_employe_jours}</td>
                                        <td className="text-right py-1 text-gray-400">—</td>
                                      </tr>
                                    )}
                                    {b.conges_details.al_impose_jours > 0 && (
                                      <tr className="border-t border-gray-100">
                                        <td className="py-1">{t('rha.a.paie.al_employee_tag', locale)} <span className="text-amber-700">{t('rha.a.paie.al_imposed_suffix', locale)}</span></td>
                                        <td className="text-right py-1 font-medium">{b.conges_details.al_impose_jours}</td>
                                        <td className="text-right py-1 text-gray-400">—</td>
                                      </tr>
                                    )}
                                    {b.conges_details.sl_jours > 0 && (
                                      <tr className="border-t border-gray-100">
                                        <td className="py-1">{t('rha.a.paie.sl_tag', locale)}</td>
                                        <td className="text-right py-1 font-medium">{b.conges_details.sl_jours}</td>
                                        <td className="text-right py-1 text-gray-400">—</td>
                                      </tr>
                                    )}
                                    {b.conges_details.ul_jours > 0 && (
                                      <tr className="border-t border-gray-100">
                                        <td className="py-1">{t('rha.a.paie.ul_tag', locale)}</td>
                                        <td className="text-right py-1 font-medium">{b.conges_details.ul_jours}</td>
                                        <td className="text-right py-1 text-red-600 font-medium">−{fmt(b.conges_details.ul_deduction_mur)} MUR</td>
                                      </tr>
                                    )}
                                    {b.conges_details.mat_pat_jours > 0 && (
                                      <tr className="border-t border-gray-100">
                                        <td className="py-1">{t('rha.a.paie.mat_pat_tag', locale)}</td>
                                        <td className="text-right py-1 font-medium">{b.conges_details.mat_pat_jours}</td>
                                        <td className="text-right py-1 text-gray-400">—</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                                {b.conges_details.anomalies_pointage && b.conges_details.anomalies_pointage.length > 0 && (
                                  <div className="mt-2 border-t border-orange-200 pt-2">
                                    <p className="text-[10px] font-bold uppercase text-orange-700 mb-1">
                                      <AlertTriangle className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                                      {t('rha.a.paie.anomalies_pointage', locale)}
                                    </p>
                                    <ul className="text-[11px] text-orange-700 space-y-0.5 list-disc pl-5">
                                      {b.conges_details.anomalies_pointage.slice(0, 6).map((a: string, i: number) => (
                                        <li key={i}>{a}</li>
                                      ))}
                                      {b.conges_details.anomalies_pointage.length > 6 && (
                                        <li className="text-gray-500">{t('rha.a.paie.others_suffix', locale).replace('{n}', String(b.conges_details.anomalies_pointage.length - 6))}</li>
                                      )}
                                    </ul>
                                  </div>
                                )}
                                {/* Sprint 3 BUG 3 — alerte UL appliqué hors MRA. */}
                                {b.conges_details.ul_hors_mra && b.conges_details.ul_jours > 0 && (
                                  <div className="mt-2 border-t border-amber-200 pt-2 bg-amber-50 -mx-2 -mb-2 px-2 pb-2 rounded-b-md">
                                    <p className="text-[11px] text-amber-900">
                                      <AlertTriangle className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                                      <b>{t('rha.a.paie.badge_hors_mra', locale)}</b> — {t('rha.a.paie.ul_hors_mra_warn', locale)
                                        .replace('{n}', String(b.conges_details.ul_jours))
                                        .replace('{amt}', Math.round(b.conges_details.ul_deduction_mur).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR'))}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : null
                          )}

                          {/* Salaire et allocations */}
                          <p className="text-[10px] font-bold text-gray-500 mb-1">{t('rha.a.paie.section_salaire_alloc', locale)}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                            {[
                              { key: "salaire_base", label: t('rha.a.paie.f_salaire_base', locale) },
                              { key: "transport_allowance", label: t('rha.a.paie.f_transport', locale) },
                              { key: "petrol_allowance", label: t('rha.a.paie.f_petrol', locale) },
                              { key: "heures_sup_montant", label: t('rha.a.paie.f_heures_sup', locale) },
                            ].map(f => (
                              <div key={f.key}>
                                <label className="text-[10px] text-gray-500 block mb-0.5">{f.label}</label>
                                <Input type="number" className="h-8 text-sm"
                                  value={editFields[f.key] ?? 0}
                                  onChange={e => setEditFields(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                                />
                              </div>
                            ))}
                          </div>

                          {/* Primes — libellé libre + montant */}
                          <p className="text-[10px] font-bold text-purple-600 mb-1">{t('rha.a.paie.section_primes', locale)}</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                            {[1, 2, 3].map(n => (
                              <div key={n} className="flex gap-2">
                                <div className="flex-1">
                                  <label className="text-[10px] text-gray-500 block mb-0.5">{t('rha.a.paie.lbl_libelle_prime', locale).replace('{n}', String(n))}</label>
                                  <Input className="h-8 text-sm" placeholder={n === 1 ? t('rha.a.paie.ph_prime_1', locale) : n === 2 ? t('rha.a.paie.ph_prime_2', locale) : t('rha.a.paie.ph_prime_3', locale)}
                                    value={editFields[`prime_label_${n}`] ?? (b.employe?.[`prime_fixe_${n}_libelle`] || "")}
                                    onChange={e => setEditFields(prev => ({ ...prev, [`prime_label_${n}`]: e.target.value }))}
                                  />
                                </div>
                                <div className="w-28">
                                  <label className="text-[10px] text-gray-500 block mb-0.5">{t('rha.a.paie.lbl_montant', locale)}</label>
                                  <Input type="number" className="h-8 text-sm"
                                    value={editFields[`special_allowance_${n}`] ?? 0}
                                    onChange={e => setEditFields(prev => ({ ...prev, [`special_allowance_${n}`]: parseFloat(e.target.value) || 0 }))}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Absences */}
                          <p className="text-[10px] font-bold text-red-500 mb-1">{t('rha.a.paie.section_absences', locale)}</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">{t('rha.a.paie.f_jours_absence', locale)}</label>
                              <Input type="number" className="h-8 text-sm"
                                value={editFields.jours_absence ?? 0}
                                onChange={e => setEditFields(prev => ({ ...prev, jours_absence: parseFloat(e.target.value) || 0 }))}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">{t('rha.a.paie.f_montant_absence', locale)}</label>
                              <Input type="number" className="h-8 text-sm"
                                value={editFields.montant_absence ?? 0}
                                onChange={e => setEditFields(prev => ({ ...prev, montant_absence: parseFloat(e.target.value) || 0 }))}
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <Button size="sm" className="h-8 text-xs" style={{ backgroundColor: NAVY, color: "white" }} onClick={saveEdit} disabled={savingEdit}>
                              {savingEdit ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                              {t('rha.a.paie.btn_enregistrer', locale)}
                            </Button>
                            <p className="text-[10px] text-gray-400 self-center">{t('rha.a.paie.edit_after_hint', locale)}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ AUDIT LOG ═══ */}
        {audit.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-600">{t('rha.a.paie.audit_title', locale)} — {periode}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rha.a.paie.audit_col_date', locale)}</TableHead>
                    <TableHead>{t('rha.a.paie.audit_col_action', locale)}</TableHead>
                    <TableHead>{t('rha.a.paie.audit_col_user', locale)}</TableHead>
                    <TableHead>{t('rha.a.paie.audit_col_details', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{new Date(a.created_at).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {a.action === "validation" && t('rha.a.paie.audit_action_validation', locale)}
                          {a.action === "verrouillage" && t('rha.a.paie.audit_action_verrouillage', locale)}
                          {a.action === "deverrouillage" && t('rha.a.paie.audit_action_deverrouillage', locale)}
                          {a.action === "export_banque" && t('rha.a.paie.audit_action_export_banque', locale)}
                          {a.action === "export_mra" && t('rha.a.paie.audit_action_export_mra', locale)}
                          {a.action === "comptabilisation" && t('rha.a.paie.audit_action_comptabilisation', locale)}
                          {a.action === "calcul" && t('rha.a.paie.audit_action_calcul', locale)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">{a.user_email || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-500">{a.details ? JSON.stringify(a.details) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Simulation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold" style={{ color: NAVY }}>{t('rha.a.paie.sim_title', locale)}</CardTitle>
            <p className="text-sm text-gray-500">{t('rha.a.paie.sim_subtitle', locale)}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('rha.a.paie.sim_brut_label', locale)}</label>
                <Input type="number" placeholder="25000" id="sim-brut" defaultValue="25000" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('rha.a.paie.sim_ot_label', locale)}</label>
                <Input type="number" placeholder="0" id="sim-ot" defaultValue="0" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">{t('rha.a.paie.sim_prime_label', locale)}</label>
                <Input type="number" placeholder="0" id="sim-prime" defaultValue="0" />
              </div>
            </div>
            <Button onClick={runSimulation} style={{ backgroundColor: NAVY }} className="text-white">
              <Calculator className="w-4 h-4 mr-2" />{t('rha.a.paie.sim_btn', locale)}
            </Button>
            {simResult && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">{t('rha.a.paie.sim_brut_total', locale)}</p>
                  <p className="text-lg font-bold" style={{ color: NAVY }}>{fmt(simResult.brut)}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">{t('rha.a.paie.sim_deductions', locale)}</p>
                  <p className="text-lg font-bold text-red-600">-{fmt(simResult.deductions)}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{simResult.detailCSG}</p>
                </div>
                <div className="p-4 rounded-lg text-center" style={{ background: "rgba(212,175,55,0.1)", border: `2px solid ${GOLD}` }}>
                  <p className="text-xs text-gray-500">{t('rha.a.paie.sim_net_est', locale)}</p>
                  <p className="text-xl font-bold" style={{ color: GOLD }}>{fmt(simResult.net)}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">{t('rha.a.paie.sim_cout_emp', locale)}</p>
                  <p className="text-lg font-bold text-orange-600">{fmt(simResult.coutEmployeur)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

          </TabsContent>

          {/* Sprint 12 FEATURE 5 — onglet Validation : contrôle prépaie */}
          <TabsContent value="validation" className="space-y-6 mt-4">
            {societe === "all" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3 text-sm text-amber-800">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <p>{t('rha.a.paie.val_pick_societe_msg', locale)}</p>
              </div>
            ) : (
              <PaieValidationPanel societe={societe} periode={periode} onValidated={load} />
            )}
          </TabsContent>

          {/* Sprint 12 FEATURE 5 — onglet Historique : périodes verrouillées */}
          <TabsContent value="historique" className="space-y-4 mt-4">
            {(() => {
              const locked = bulletins.filter(b => b.verrouille === true)
              const byPeriod = locked.reduce<Record<string, typeof locked>>((acc, b) => {
                const p = (b.periode || "").slice(0, 7)
                if (!acc[p]) acc[p] = []
                acc[p].push(b)
                return acc
              }, {})
              const periods = Object.keys(byPeriod).sort((a, b) => b.localeCompare(a))
              if (periods.length === 0) {
                return (
                  <div className="text-center py-12 text-gray-400">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{t('rha.a.paie.hist_empty_title', locale)}</p>
                    <p className="text-xs mt-1">
                      {t('rha.a.paie.hist_empty_hint', locale)}
                    </p>
                  </div>
                )
              }
              return (
                <div className="space-y-3">
                  {periods.map(p => {
                    const items = byPeriod[p]
                    const d = new Date(p + "-15")
                    const label = d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { month: "long", year: "numeric" })
                    const totalNet = items.reduce((s, b) => s + (Number(b.salaire_net) || 0), 0)
                    const totalBrut = items.reduce((s, b) => s + (Number(b.salaire_brut) || 0), 0)
                    return (
                      <Card key={p}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                              <Lock className="w-4 h-4 text-red-600" />
                              {label.charAt(0).toUpperCase() + label.slice(1)}
                              <Badge className="bg-gray-100 text-gray-700 text-[10px]">{t('rha.a.paie.hist_badge_locked', locale)}</Badge>
                            </CardTitle>
                            <div className="flex gap-2 text-xs">
                              <span className="text-gray-500">{t('rha.a.paie.hist_bulletins_n', locale).replace('{n}', String(items.length))}</span>
                              <span className="text-gray-300">·</span>
                              <span>{t('rha.a.paie.hist_brut', locale)} {fmt(totalBrut)}</span>
                              <span className="text-gray-300">·</span>
                              <span className="font-semibold text-green-700">{t('rha.a.paie.hist_net', locale)} {fmt(totalNet)}</span>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => setPeriode(p)}>
                              {t('rha.a.paie.hist_voir_bulletins', locale)}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => window.open(`/api/rh/exports/virement?societe_id=${societe}&periode=${p}&format=json`, "_blank")}>
                              <Download className="w-3.5 h-3.5 mr-1" />
                              {t('rha.a.paie.hist_export_virements', locale)}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )
            })()}
          </TabsContent>
        </Tabs>

        {/* FIX-SOLDE-STC — Modal "Employé sortant" : se déclenche quand on
            tente de recalculer un bulletin pour un employé dont date_depart
            tombe dans la période. Renvoie vers /rh/depart pour calculer un
            vrai solde tout compte (préavis + indemnité + 13e prorata + AL). */}
        {sortantModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border-2 border-amber-300">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-amber-900">
                    Employé sortant — utiliser le module Départ
                  </h3>
                  <p className="text-sm text-gray-700 mt-1">
                    <span className="font-semibold">{sortantModal.employe_nom}</span> est sorti le{' '}
                    <span className="font-semibold">
                      {new Date(sortantModal.date_depart + 'T12:00:00').toLocaleDateString(
                        locale === 'en' ? 'en-GB' : 'fr-FR',
                        { day: '2-digit', month: '2-digit', year: 'numeric' },
                      )}
                    </span>
                    .
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 mb-4">
                {sortantModal.hint ||
                  "Le bulletin paie normal ne peut pas être généré pour un employé sortant. Le solde tout compte inclut salaire prorata + indemnités (préavis, licenciement) + 13e prorata + AL payée."}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSortantModal(null)}>
                  Annuler
                </Button>
                <Button
                  style={{ backgroundColor: NAVY, color: 'white' }}
                  onClick={() => {
                    const url = sortantModal.redirect_url
                    setSortantModal(null)
                    router.push(url)
                  }}
                >
                  Ouvrir le module Départ
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
    </ClientPageShell>
  )
}
