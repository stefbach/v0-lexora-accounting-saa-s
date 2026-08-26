"use client"

/**
 * Page /client/pos — Point de vente (Module B).
 *
 * Session de caisse (ouverture avec fond initial, clôture avec comptage et
 * écart), écran caisse (recherche produit, panier, remises, totaux TVA),
 * encaissement multi-moyens et tickets du shift. La validation d'un ticket
 * est atomique côté serveur (RPC valider_vente_pos) : déduction de stock au
 * CUMP + écritures comptables (journal POS + COGS).
 *
 * Refonte "tableau de bord opérationnel" : au-delà de la caisse, la page
 * fournit désormais l'analytics du shift (CA, panier moyen, répartition des
 * moyens de paiement, CA par heure, top produits), l'historique des sessions
 * clôturées et une analyse IA à la demande. Toute la logique métier et les
 * appels API/RPC d'origine sont préservés — c'est une refonte de présentation
 * et d'intelligence, pas de logique.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Search,
  ShoppingCart,
  Trash2,
  Banknote,
  Undo2,
  LockKeyhole,
  Plus,
  Minus,
  Receipt,
  TrendingUp,
  Package,
  History,
  Wallet,
  PieChart as PieIcon,
  CornerDownLeft,
  Utensils,
  PauseCircle,
  Play,
  Clock,
  BarChart3,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { calculerLigne, calculerTotaux, resteAPayer, type LignePanier } from "@/lib/pos/panier"
import { appliquerRemiseGlobale, montantRemiseGlobale, type RemiseGlobale } from "@/lib/pos/remise-globale"
import { buildTicketModel, computeChange, type TicketModel } from "@/lib/pos/ticket"
import { TicketReceipt } from "@/components/pos/TicketReceipt"
import { ClientPicker, type ClientChoisi } from "@/components/pos/ClientPicker"
import { sumMoney } from "@/lib/money"
import {
  KpiCard,
  KpiGrid,
  SectionCard,
  ChartCard,
  OpsEmpty,
  OpsSkeleton,
  OperationsInsights,
  formatMUR,
  formatNumber,
  signedClass,
} from "@/components/operations"
import {
  LIBELLES_MOYEN_PAIEMENT,
  MOYENS_PAIEMENT,
  type MoyenPaiement,
} from "@/lib/pos/types"

interface ProduitRow {
  id: string
  sku: string
  designation: string
  categorie?: string | null
  gere_en_stock: boolean
  prix_vente_ht: number
  taux_tva: number
  actif: boolean
  stock_niveaux?: Array<{ quantite: number }>
}

interface SessionRow {
  id: string
  statut: "ouverte" | "fermee"
  fond_ouverture: number
  ouverte_at: string
  depots?: { nom: string } | null
}

interface LigneTicket {
  produit_id: string
  quantite: number
  montant_ttc: number
  produits?: { sku: string; designation: string } | null
}

interface TicketRow {
  id: string
  numero_ticket: string
  date_vente: string
  montant_ht?: number
  montant_ttc: number
  statut: string
  session_caisse_id?: string
  paiements_pos?: Array<{ moyen_paiement: MoyenPaiement; montant: number }>
  lignes_vente_pos?: LigneTicket[]
}

interface HistoriqueSession {
  id: string
  statut: string
  ouverte_at: string
  fermee_at: string | null
  fond_ouverture: number
  fond_fermeture_compte: number | null
  ecart_caisse: number | null
  depots?: { nom: string } | null
}

interface PanierItem extends LignePanier {
  sku: string
  designation: string
}

/** Panier mis en attente (retail) — persisté localement par session de caisse. */
interface PanierEnAttente {
  id: string
  label: string
  at: number
  items: PanierItem[]
}

interface PaiementSaisie {
  moyen_paiement: MoyenPaiement
  montant: string
  reference: string
}

interface RecapFermeture {
  fond_ouverture: number
  fond_fermeture_theorique: number
  fond_fermeture_compte: number
  ecart_caisse: number
  nb_tickets: number
  total_ttc: number
  par_moyen: Record<string, number>
}

/** Couleur d'accent par moyen de paiement (donut + badges). */
const COULEUR_MOYEN: Record<MoyenPaiement, string> = {
  especes: "#0F766E",
  carte: "#0B0F2E",
  mobile_money: "#D4AF37",
  virement: "#2A6FCC",
}

/** Montant unitaire (centimes) pour panier & dialogs. */
function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MUR"
}

/** Initiales lisibles d'un produit pour la vignette de la grille caisse. */
function initiales(designation: string): string {
  const mots = designation.trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return "?"
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase()
  return (mots[0][0] + mots[1][0]).toUpperCase()
}

export default function PosPage() {
  const { societeId, societe } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [session, setSession] = useState<SessionRow | null>(null)
  const [produits, setProduits] = useState<ProduitRow[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [historique, setHistorique] = useState<HistoriqueSession[]>([])
  const [caParSession, setCaParSession] = useState<Record<string, number>>({})
  const [search, setSearch] = useState("")
  const [panier, setPanier] = useState<PanierItem[]>([])
  const [enAttente, setEnAttente] = useState<PanierEnAttente[]>([])
  const [remiseType, setRemiseType] = useState<"pct" | "montant">("pct")
  const [remiseValeur, setRemiseValeur] = useState("")
  const [client, setClient] = useState<ClientChoisi | null>(null)
  const [categorieFiltre, setCategorieFiltre] = useState<string | null>(null)
  const [articleOpen, setArticleOpen] = useState(false)
  const [artForm, setArtForm] = useState({ sku: "", designation: "", prix: "", tva: "15", categorie: "", gereStock: false })
  const searchRef = useRef<HTMLInputElement>(null)

  const [fondOuverture, setFondOuverture] = useState("")
  const [encaisserOpen, setEncaisserOpen] = useState(false)
  const [paiements, setPaiements] = useState<PaiementSaisie[]>([])
  const [recuEspeces, setRecuEspeces] = useState("")
  const [lastTicket, setLastTicket] = useState<TicketModel | null>(null)
  const [ticketOpen, setTicketOpen] = useState(false)
  const [clotureOpen, setClotureOpen] = useState(false)
  const [fondCompte, setFondCompte] = useState("")
  const [recap, setRecap] = useState<RecapFermeture | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [sRes, pRes, hRes, vRes] = await Promise.all([
        fetch(`/api/client/pos/sessions?societe_id=${societeId}&statut=ouverte`),
        fetch(`/api/client/inventaire/produits?societe_id=${societeId}`),
        fetch(`/api/client/pos/sessions?societe_id=${societeId}&statut=fermee`),
        fetch(`/api/client/pos/ventes?societe_id=${societeId}`),
      ])

      const sData = await sRes.json()
      if (!sRes.ok) throw new Error(sData.error || "Erreur sessions")
      const ouverte: SessionRow | null = (sData.items || [])[0] || null
      setSession(ouverte)

      const pData = await pRes.json()
      if (!pRes.ok) throw new Error(pData.error || "Erreur produits")
      setProduits((pData.items || []).filter((p: ProduitRow) => p.actif))

      const hData = await hRes.json()
      if (hRes.ok) setHistorique(hData.items || [])

      // CA validé agrégé par session (alimente l'historique et le shift courant).
      const vData = await vRes.json()
      const allVentes: TicketRow[] = vRes.ok ? vData.items || [] : []
      const caMap: Record<string, number[]> = {}
      for (const v of allVentes) {
        if (v.statut !== "validee" || !v.session_caisse_id) continue
        ;(caMap[v.session_caisse_id] ||= []).push(Number(v.montant_ttc) || 0)
      }
      setCaParSession(
        Object.fromEntries(Object.entries(caMap).map(([k, arr]) => [k, sumMoney(arr)])),
      )

      if (ouverte) {
        setTickets(allVentes.filter((v) => v.session_caisse_id === ouverte.id))
      } else {
        setTickets([])
      }
    } catch (e: any) {
      showToast(e?.message || "Erreur de chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    load()
  }, [load])

  // ── Paniers en attente (retail) : persistés par session de caisse ────────
  const holdKey = session ? `pos_holds_${session.id}` : null
  useEffect(() => {
    if (!holdKey) {
      setEnAttente([])
      return
    }
    try {
      const raw = localStorage.getItem(holdKey)
      setEnAttente(raw ? (JSON.parse(raw) as PanierEnAttente[]) : [])
    } catch {
      setEnAttente([])
    }
  }, [holdKey])

  const persistHolds = useCallback(
    (next: PanierEnAttente[]) => {
      setEnAttente(next)
      if (!holdKey) return
      try {
        localStorage.setItem(holdKey, JSON.stringify(next))
      } catch {
        /* quota / mode privé : on garde l'état en mémoire */
      }
    },
    [holdKey],
  )

  // Catégories distinctes présentes dans le catalogue (pour les rayons).
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const p of produits) if (p.categorie && p.categorie.trim()) set.add(p.categorie.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"))
  }, [produits])

  const produitsFiltres = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = produits.filter((p) => {
      if (categorieFiltre && (p.categorie || "").trim() !== categorieFiltre) return false
      if (q) return p.sku.toLowerCase().includes(q) || p.designation.toLowerCase().includes(q)
      return true
    })
    return list.slice(0, 60)
  }, [produits, search, categorieFiltre])

  const stockDe = (p: ProduitRow) =>
    (p.stock_niveaux || []).reduce((s, n) => s + (Number(n.quantite) || 0), 0)

  // Remise globale ticket : répartie proportionnellement sur les lignes, pour
  // que la RPC (qui calcule tout depuis les lignes) encaisse le bon net.
  const remiseGlobale = useMemo<RemiseGlobale>(() => {
    const v = Number(remiseValeur)
    if (!Number.isFinite(v) || v <= 0) return null
    return { type: remiseType, valeur: v }
  }, [remiseType, remiseValeur])
  const lignesNettes = useMemo(() => appliquerRemiseGlobale(panier, remiseGlobale), [panier, remiseGlobale])
  const remiseMontant = useMemo(() => montantRemiseGlobale(panier, remiseGlobale), [panier, remiseGlobale])
  const totaux = useMemo(() => calculerTotaux(lignesNettes), [lignesNettes])

  const ticketsValides = useMemo(
    () => tickets.filter((t) => t.statut === "validee"),
    [tickets],
  )

  const totalEspecesSession = useMemo(
    () =>
      sumMoney(
        ticketsValides
          .flatMap((t) => t.paiements_pos || [])
          .filter((p) => p.moyen_paiement === "especes")
          .map((p) => Number(p.montant) || 0),
      ),
    [ticketsValides],
  )

  /* ── Analytics du shift ──────────────────────────────────────────── */
  const analytics = useMemo(() => {
    const caShift = sumMoney(ticketsValides.map((t) => Number(t.montant_ttc) || 0))
    const nbTickets = ticketsValides.length
    const panierMoyen = nbTickets > 0 ? caShift / nbTickets : 0

    // Répartition par moyen de paiement (donut).
    const parMoyen = MOYENS_PAIEMENT.map((moyen) => ({
      moyen,
      name: LIBELLES_MOYEN_PAIEMENT[moyen],
      value: sumMoney(
        ticketsValides
          .flatMap((t) => t.paiements_pos || [])
          .filter((p) => p.moyen_paiement === moyen)
          .map((p) => Number(p.montant) || 0),
      ),
    })).filter((d) => d.value > 0)

    // CA par heure d'ouverture (bar).
    const parHeureMap = new Map<number, number[]>()
    for (const t of ticketsValides) {
      const h = new Date(t.date_vente).getHours()
      const arr = parHeureMap.get(h) ?? []
      arr.push(Number(t.montant_ttc) || 0)
      parHeureMap.set(h, arr)
    }
    const caParHeure = Array.from(parHeureMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([h, arr]) => ({ heure: `${String(h).padStart(2, "0")}h`, ca: sumMoney(arr) }))

    // Top produits vendus (par CA TTC).
    const prodMap = new Map<string, { designation: string; qte: number; ca: number[] }>()
    for (const t of ticketsValides) {
      for (const l of t.lignes_vente_pos || []) {
        const key = l.produit_id
        const cur = prodMap.get(key) ?? {
          designation: l.produits?.designation || l.produits?.sku || "Produit",
          qte: 0,
          ca: [],
        }
        cur.qte += Number(l.quantite) || 0
        cur.ca.push(Number(l.montant_ttc) || 0)
        prodMap.set(key, cur)
      }
    }
    const topProduits = Array.from(prodMap.values())
      .map((p) => ({ designation: p.designation, qte: p.qte, ca: sumMoney(p.ca) }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 6)

    return { caShift, nbTickets, panierMoyen, parMoyen, caParHeure, topProduits }
  }, [ticketsValides])

  const especesTheoriques = (session?.fond_ouverture || 0) + totalEspecesSession
  const dernierEcart = historique.find((h) => h.ecart_caisse !== null)?.ecart_caisse ?? null

  const insightsPayload = useMemo(
    () => ({
      ca_shift: analytics.caShift,
      nb_tickets: analytics.nbTickets,
      panier_moyen: analytics.panierMoyen,
      fond_ouverture: session?.fond_ouverture || 0,
      especes_encaissees: totalEspecesSession,
      especes_theoriques_en_caisse: especesTheoriques,
      repartition_moyens_paiement: analytics.parMoyen.map((m) => ({
        moyen: m.moyen,
        montant: m.value,
      })),
      ca_par_heure: analytics.caParHeure,
      top_produits: analytics.topProduits,
      ecart_derniere_cloture: dernierEcart,
      nb_sessions_cloturees: historique.length,
    }),
    [analytics, session, totalEspecesSession, especesTheoriques, dernierEcart, historique.length],
  )

  const ajouterAuPanier = (p: ProduitRow) => {
    setPanier((prev) => {
      const idx = prev.findIndex((l) => l.produit_id === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantite: next[idx].quantite + 1 }
        return next
      }
      return [
        ...prev,
        {
          produit_id: p.id,
          sku: p.sku,
          designation: p.designation,
          quantite: 1,
          prix_unitaire_ht: Number(p.prix_vente_ht) || 0,
          remise_pct: 0,
          taux_tva: Number(p.taux_tva) || 0,
        },
      ]
    })
  }

  const majLigne = (produitId: string, patch: Partial<LignePanier>) => {
    setPanier((prev) =>
      prev.map((l) => (l.produit_id === produitId ? { ...l, ...patch } : l)),
    )
  }

  const changerQuantite = (produitId: string, delta: number) => {
    setPanier((prev) =>
      prev
        .map((l) =>
          l.produit_id === produitId ? { ...l, quantite: l.quantite + delta } : l,
        )
        .filter((l) => l.quantite > 0),
    )
  }

  /** Entrée dans la recherche : ajoute le 1er produit vendable au panier (scan-like). */
  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return
    e.preventDefault()
    const cible = produitsFiltres.find((p) => !(p.gere_en_stock && stockDe(p) <= 0))
    if (cible) {
      ajouterAuPanier(cible)
      setSearch("")
      searchRef.current?.focus()
    }
  }

  const ouvrirSession = async () => {
    if (!societeId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/pos/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, fond_ouverture: fondOuverture || 0 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast("Session de caisse ouverte")
      setFondOuverture("")
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const ouvrirEncaissement = () => {
    if (panier.length === 0) return
    setPaiements([{ moyen_paiement: "especes", montant: String(totaux.total_ttc), reference: "" }])
    setRecuEspeces("")
    setEncaisserOpen(true)
  }

  // ── Création rapide d'un article vendable (retail / plat restaurant) ──────
  const creerArticle = async () => {
    if (!societeId) return
    if (!artForm.sku.trim() || !artForm.designation.trim()) {
      showToast("SKU et désignation requis", "error")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/inventaire/produits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          sku: artForm.sku,
          designation: artForm.designation,
          prix_vente_ht: Number(artForm.prix) || 0,
          taux_tva: Number(artForm.tva) || 0,
          categorie: artForm.categorie || null,
          gere_en_stock: artForm.gereStock,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Article ${data.item?.sku || artForm.sku} créé`)
      setArticleOpen(false)
      setArtForm({ sku: "", designation: "", prix: "", tva: "15", categorie: "", gereStock: false })
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Mise en attente : met le panier de côté et le vide ───────────────────
  const mettreEnAttente = () => {
    if (panier.length === 0) return
    const label = (prompt("Nom du panier en attente (client, table, n°…) ?") || "").trim() || `Panier ${enAttente.length + 1}`
    persistHolds([{ id: `${Date.now()}`, label, at: Date.now(), items: panier }, ...enAttente])
    setPanier([])
    setRemiseValeur("")
    setSearch("")
    showToast("Panier mis en attente")
  }

  const reprendreAttente = (h: PanierEnAttente) => {
    if (panier.length > 0 && !confirm("Le panier en cours sera remplacé. Continuer ?")) return
    setPanier(h.items)
    setRemiseValeur("")
    persistHolds(enAttente.filter((x) => x.id !== h.id))
    showToast(`« ${h.label} » repris`)
  }

  const supprimerAttente = (id: string) => persistHolds(enAttente.filter((x) => x.id !== id))

  // Part espèces due + monnaie à rendre (affichés dans l'encaissement).
  const partEspeces = paiements
    .filter((p) => p.moyen_paiement === "especes")
    .reduce((s, p) => s + (Number(p.montant) || 0), 0)
  const rendu = recuEspeces ? computeChange(Number(recuEspeces) || 0, partEspeces) : 0

  const ajouterPaiement = () => {
    const reste = resteAPayer(
      totaux.total_ttc,
      paiements.map((p) => ({ montant: Number(p.montant) || 0 })),
    )
    setPaiements((prev) => [...prev, { moyen_paiement: "carte", montant: String(reste), reference: "" }])
  }

  const totalSaisi = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0)

  const validerTicket = async () => {
    if (!societeId || !session) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/client/pos/ventes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          session_id: session.id,
          client_id: client?.id || null,
          lignes: lignesNettes.map(({ produit_id, quantite, prix_unitaire_ht, remise_pct, taux_tva }) => ({
            produit_id,
            quantite,
            prix_unitaire_ht,
            remise_pct,
            taux_tva,
          })),
          paiements: paiements.map((p) => ({
            moyen_paiement: p.moyen_paiement,
            montant: Number(p.montant) || 0,
            reference: p.reference || null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      // Construit le ticket imprimable depuis le panier + paiements courants.
      const ticket = buildTicketModel({
        societe: societe?.nom || "Ticket de caisse",
        numero_ticket: data.numero_ticket || "",
        date: new Date().toISOString().slice(0, 10),
        total_ht: totaux.total_ht,
        total_tva: totaux.total_tva,
        total_ttc: totaux.total_ttc,
        lignes: lignesNettes.map((it) => ({
          designation: it.designation,
          sku: it.sku,
          quantite: it.quantite,
          prix_unitaire_ht: it.prix_unitaire_ht,
          remise_pct: it.remise_pct,
          taux_tva: it.taux_tva,
          montant_ttc: calculerLigne(it).montant_ttc,
        })),
        paiements: paiements.map((p) => ({
          moyen: p.moyen_paiement,
          montant: Number(p.montant) || 0,
          reference: p.reference || null,
        })),
        recu_especes: recuEspeces ? Number(recuEspeces) || undefined : undefined,
      })
      setLastTicket(ticket)
      setTicketOpen(true)
      showToast(
        `Ticket ${data.numero_ticket} validé — ${fmt(Number(data.montant_ttc) || 0)}` +
          (Number(data.points_gagnes) > 0 ? ` · +${data.points_gagnes} pts fidélité` : ""),
      )
      setEncaisserOpen(false)
      setPanier([])
      setRemiseValeur("")
      setClient(null)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const rembourserTicket = async (venteId: string, numero: string, statut: "remboursee" | "annulee") => {
    if (!societeId) return
    const action = statut === "annulee" ? "annuler" : "rembourser"
    if (!window.confirm(`Confirmer : ${action} le ticket ${numero} ? Le stock est ré-entré et l'encaissement contrepassé.`)) return
    try {
      const res = await fetch(`/api/client/pos/ventes/${venteId}/rembourser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, statut }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      showToast(`Ticket ${numero} ${statut === "annulee" ? "annulé" : "remboursé"}`)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    }
  }

  const fermerSession = async () => {
    if (!societeId || !session) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/pos/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, fond_fermeture_compte: fondCompte || 0 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur")
      setRecap(data.recap)
      setClotureOpen(false)
      setFondCompte("")
      setPanier([])
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  const aDesTickets = ticketsValides.length > 0

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Point de vente" }]}
      kicker="Gestion commerciale"
      title="Point de vente"
      subtitle="Caisse tactile et pilotage du shift : panier, TVA, encaissement multi-moyens, déduction de stock temps réel, écritures automatiques et analytics de session."
      disableParticles
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/client/pos/salle">
              <Utensils className="h-4 w-4 mr-1" /> Salle
            </Link>
          </Button>
          {session ? (
            <Button variant="outline" size="sm" onClick={() => setClotureOpen(true)}>
              <LockKeyhole className="h-4 w-4 mr-1" /> Clôturer la caisse
            </Button>
          ) : null}
        </div>
      }
    >
      {toast && (
        <div
          role="status"
          className={`mb-4 rounded-md px-4 py-2 text-sm ${
            toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {loading ? (
        <OpsSkeleton kpis={4} chart rows={3} />
      ) : !session ? (
        /* ── Ouverture de session ─────────────────────────────────── */
        <div className="space-y-6">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-6 space-y-4">
              <div className="text-center">
                <div
                  className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
                  style={{ backgroundColor: "rgba(212,175,55,0.12)" }}
                >
                  <Banknote className="h-6 w-6 text-[#A88925]" />
                </div>
                <h2 className="font-semibold text-[#0B0F2E]">Ouvrir une session de caisse</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Saisissez le fond de caisse initial (espèces) pour démarrer le shift.
                </p>
              </div>
              <div>
                <Label>Fond de caisse d&apos;ouverture (MUR)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fondOuverture}
                  onChange={(e) => setFondOuverture(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <Button className="w-full" onClick={ouvrirSession} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Ouvrir la caisse
              </Button>
            </CardContent>
          </Card>

          {/* Historique visible même caisse fermée */}
          <HistoriqueSessions historique={historique} caParSession={caParSession} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Bandeau session ──────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              Session ouverte
            </Badge>
            <span className="text-muted-foreground">
              {session.depots?.nom || "Caisse"} · ouverte à{" "}
              {new Date(session.ouverte_at).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · fond d&apos;ouverture {fmt(session.fond_ouverture)}
            </span>
          </div>

          <Tabs defaultValue="vendre" className="space-y-6">
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="vendre">
                <ShoppingCart className="h-4 w-4 mr-1.5" /> Vendre
              </TabsTrigger>
              <TabsTrigger value="salle">
                <Utensils className="h-4 w-4 mr-1.5" /> Salle
              </TabsTrigger>
              <TabsTrigger value="rapports">
                <BarChart3 className="h-4 w-4 mr-1.5" /> Rapports
              </TabsTrigger>
            </TabsList>

            {/* ═══ Onglet VENDRE ═══════════════════════════════════════ */}
            <TabsContent value="vendre" className="space-y-4">
              {/* Paniers en attente */}
              {enAttente.length > 0 && (
                <div className="rounded-lg border bg-amber-50/40 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <PauseCircle className="h-3.5 w-3.5" /> En attente ({enAttente.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {enAttente.map((h) => (
                      <div key={h.id} className="flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs">
                        <button
                          className="flex items-center gap-1 font-medium text-[#0B0F2E] hover:text-[#A88925]"
                          onClick={() => reprendreAttente(h)}
                          aria-label={`Reprendre ${h.label}`}
                        >
                          <Play className="h-3 w-3" /> {h.label}
                        </button>
                        <span className="text-muted-foreground">· {h.items.length} art.</span>
                        <button
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => supprimerAttente(h.id)}
                          aria-label={`Supprimer ${h.label}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Caisse (produits + panier) */}
              <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
                {/* Produits */}
                <SectionCard title="Caisse" subtitle="Cliquez ou scannez pour ajouter au panier" contentClassName="pt-3">
                  <div className="relative mb-3">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      placeholder="Rechercher un produit (SKU, désignation)…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={onSearchKeyDown}
                      className="pl-8 pr-24"
                      aria-label="Rechercher un produit"
                      autoFocus
                    />
                    <span className="pointer-events-none absolute right-2 top-1.5 hidden items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:flex">
                      <CornerDownLeft className="h-3 w-3" /> ajouter
                    </span>
                  </div>

                  {/* Rayons (catégories) + création rapide d'article */}
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex flex-1 flex-wrap gap-1.5 overflow-x-auto">
                      <button
                        onClick={() => setCategorieFiltre(null)}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          categorieFiltre === null ? "border-[#0B0F2E] bg-[#0B0F2E] text-white" : "hover:bg-muted"
                        }`}
                      >
                        Tous
                      </button>
                      {categories.map((c) => (
                        <button
                          key={c}
                          onClick={() => setCategorieFiltre(c)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            categorieFiltre === c ? "border-[#0B0F2E] bg-[#0B0F2E] text-white" : "hover:bg-muted"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => setArticleOpen(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Article
                    </Button>
                  </div>
                  {produitsFiltres.length === 0 ? (
                    <OpsEmpty
                      icon={Package}
                      title={search ? "Aucun résultat" : "Aucun produit vendable"}
                      description={
                        search
                          ? "Aucun produit ne correspond à votre recherche."
                          : "Créez un article directement avec le bouton « Article » ci-dessus, ou depuis Stock & inventaire."
                      }
                    />
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {produitsFiltres.map((p) => {
                        const stock = stockDe(p)
                        const rupture = p.gere_en_stock && stock <= 0
                        return (
                          <button
                            key={p.id}
                            onClick={() => !rupture && ajouterAuPanier(p)}
                            disabled={rupture}
                            aria-label={`Ajouter ${p.designation}${rupture ? " (rupture)" : ""}`}
                            className={`group flex gap-2.5 rounded-lg border p-3 text-left transition hover:border-[#D4AF37] hover:shadow-sm ${
                              rupture ? "opacity-50 cursor-not-allowed" : "hover:bg-[#D4AF37]/5"
                            }`}
                          >
                            <div
                              className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center text-xs font-semibold text-[#0B0F2E]"
                              style={{ backgroundColor: "rgba(11,15,46,0.06)" }}
                              aria-hidden="true"
                            >
                              {initiales(p.designation)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-[10px] text-muted-foreground">{p.sku}</div>
                              <div className="text-sm font-medium leading-tight truncate">{p.designation}</div>
                              <div className="mt-1 flex items-center justify-between gap-1 text-xs">
                                <span className="font-semibold text-[#0B0F2E]">{fmt(p.prix_vente_ht)} HT</span>
                                {p.gere_en_stock ? (
                                  <Badge
                                    variant="secondary"
                                    className={
                                      rupture
                                        ? "bg-[#9F1239]/10 text-[#9F1239] hover:bg-[#9F1239]/10"
                                        : stock <= 5
                                          ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                                    }
                                  >
                                    {rupture ? "Rupture" : `Stock ${formatNumber(stock)}`}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Service</Badge>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </SectionCard>

                {/* Panier */}
                <Card className="h-fit lg:sticky lg:top-4 py-0">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-[#0B0F2E] mb-3 flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" /> Panier ({panier.length})
                    </h3>
                    {panier.length === 0 ? (
                      <div className="py-8 text-center">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">Cliquez sur un produit pour l&apos;ajouter.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {panier.map((l) => {
                          const m = calculerLigne(l)
                          return (
                            <div key={l.produit_id} className="rounded-lg border p-2.5 bg-gray-50/50">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">{l.designation}</div>
                                  <div className="text-[11px] text-muted-foreground font-mono">{l.sku}</div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Retirer ${l.designation}`}
                                  onClick={() => setPanier((prev) => prev.filter((x) => x.produit_id !== l.produit_id))}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    aria-label="Diminuer la quantité"
                                    onClick={() => changerQuantite(l.produit_id, -1)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center text-sm tabular-nums">{l.quantite}</span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    aria-label="Augmenter la quantité"
                                    onClick={() => changerQuantite(l.produit_id, 1)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-1 text-xs">
                                  <span className="text-muted-foreground">Remise %</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    aria-label={`Remise sur ${l.designation}`}
                                    className="h-7 w-16 text-xs"
                                    value={l.remise_pct || ""}
                                    onChange={(e) =>
                                      majLigne(l.produit_id, {
                                        remise_pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                                      })
                                    }
                                  />
                                </div>
                                <span className="ml-auto text-sm font-semibold tabular-nums">{fmt(m.montant_ttc)}</span>
                              </div>
                            </div>
                          )
                        })}

                        {/* Remise globale ticket */}
                        <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
                          <span className="text-muted-foreground">Remise globale</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={remiseValeur}
                              onChange={(e) => setRemiseValeur(e.target.value)}
                              className="h-7 w-20 text-xs"
                              placeholder="0"
                              aria-label="Remise globale sur le ticket"
                            />
                            <div className="flex overflow-hidden rounded-md border">
                              <button
                                type="button"
                                onClick={() => setRemiseType("pct")}
                                className={`px-2 py-1 ${remiseType === "pct" ? "bg-[#0B0F2E] text-white" : "text-muted-foreground"}`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemiseType("montant")}
                                className={`px-2 py-1 ${remiseType === "montant" ? "bg-[#0B0F2E] text-white" : "text-muted-foreground"}`}
                              >
                                MUR
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="pt-1 space-y-1 text-sm">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Total HT</span>
                            <span className="tabular-nums">{fmt(totaux.total_ht)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>TVA</span>
                            <span className="tabular-nums">{fmt(totaux.total_tva)}</span>
                          </div>
                          {remiseMontant > 0 && (
                            <div className="flex justify-between text-emerald-700">
                              <span>Remise ticket</span>
                              <span className="tabular-nums">− {fmt(remiseMontant)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-base font-bold text-[#0B0F2E]">
                            <span>Total TTC</span>
                            <span className="tabular-nums">{fmt(totaux.total_ttc)}</span>
                          </div>
                        </div>
                        <Button className="w-full" size="lg" onClick={ouvrirEncaissement}>
                          <Banknote className="h-4 w-4 mr-2" /> Encaisser {fmt(totaux.total_ttc)}
                        </Button>
                        <Button className="w-full" variant="outline" size="sm" onClick={mettreEnAttente}>
                          <PauseCircle className="h-4 w-4 mr-2" /> Mettre en attente
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ═══ Onglet SALLE ════════════════════════════════════════ */}
            <TabsContent value="salle">
              <SectionCard title="Mode restauration — Salle" subtitle="Plan de salle et additions ouvertes" contentClassName="pt-4">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground max-w-xl">
                    Gérez vos tables et vos additions ouvertes (running tabs) : ouvrez une table, ajoutez les articles au fil
                    du service, puis encaissez — l&apos;addition devient un ticket POS avec stock et écritures automatiques,
                    exactement comme en caisse.
                  </p>
                  <Button asChild size="lg" className="shrink-0">
                    <Link href="/client/pos/salle">
                      <Utensils className="h-4 w-4 mr-2" /> Ouvrir la salle <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </SectionCard>
            </TabsContent>

            {/* ═══ Onglet RAPPORTS ═════════════════════════════════════ */}
            <TabsContent value="rapports" className="space-y-6">
          {/* ── KPIs du shift ────────────────────────────────────────── */}
          <KpiGrid cols={4}>
            <KpiCard
              label="CA du shift (TTC)"
              value={formatMUR(analytics.caShift)}
              icon={TrendingUp}
              color="#0F766E"
              hint={`${formatNumber(analytics.nbTickets)} ticket${analytics.nbTickets > 1 ? "s" : ""}`}
            />
            <KpiCard
              label="Tickets validés"
              value={formatNumber(analytics.nbTickets)}
              icon={Receipt}
              color="#0B0F2E"
            />
            <KpiCard
              label="Panier moyen"
              value={formatMUR(analytics.panierMoyen)}
              icon={ShoppingCart}
              color="#A88925"
            />
            <KpiCard
              label="Espèces en caisse (théorique)"
              value={formatMUR(especesTheoriques)}
              icon={Wallet}
              color="#0B0F2E"
              hint={`fond ${formatMUR(session.fond_ouverture)} + encaissé ${formatMUR(totalEspecesSession)}`}
            />
          </KpiGrid>

          {/* ── Graphiques analytics ─────────────────────────────────── */}
          {aDesTickets ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard
                title="Répartition par moyen de paiement"
                subtitle="Encaissements du shift (TTC)"
                height={260}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.parMoyen}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {analytics.parMoyen.map((d) => (
                        <Cell key={d.moyen} fill={COULEUR_MOYEN[d.moyen]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n) => [fmt(v), n as string]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
                  {analytics.parMoyen.map((d) => (
                    <div key={d.moyen} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: COULEUR_MOYEN[d.moyen] }}
                        aria-hidden="true"
                      />
                      {d.name} · <span className="font-medium">{formatMUR(d.value)}</span>
                    </div>
                  ))}
                </div>
              </ChartCard>

              <ChartCard title="Chiffre d'affaires par heure" subtitle="TTC encaissé" height={260}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.caParHeure} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f5" />
                    <XAxis dataKey="heure" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="ca" name="CA" fill="#D4AF37" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          ) : (
            <SectionCard title="Analytics du shift" subtitle="Répartition, CA horaire et top produits">
              <OpsEmpty
                icon={PieIcon}
                title="Aucune vente pour l'instant"
                description="Les graphiques du shift (moyens de paiement, CA par heure, top produits) apparaîtront dès le premier ticket encaissé."
              />
            </SectionCard>
          )}

          {/* ── Top produits ─────────────────────────────────────────── */}
          {aDesTickets && analytics.topProduits.length > 0 && (
            <SectionCard title="Top produits vendus" subtitle="Sur la session en cours" contentClassName="pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Qté</TableHead>
                      <TableHead className="text-right">CA TTC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.topProduits.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.designation}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(p.qte, 0)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMUR(p.ca)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}

          {/* ── Tickets du shift ─────────────────────────────────────── */}
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Tickets de la session
              </span>
            }
            subtitle={`${tickets.length} ticket${tickets.length > 1 ? "s" : ""}`}
            contentClassName="pt-0"
          >
            {tickets.length === 0 ? (
              <OpsEmpty
                icon={Receipt}
                title="Aucun ticket"
                description="Les tickets encaissés durant ce shift s'afficheront ici."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket</TableHead>
                      <TableHead>Heure</TableHead>
                      <TableHead>Paiement</TableHead>
                      <TableHead className="text-right">Montant TTC</TableHead>
                      <TableHead className="text-right">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.numero_ticket}</TableCell>
                        <TableCell>
                          {new Date(t.date_vente).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {(t.paiements_pos || []).map((p, i) => (
                              <Badge key={i} variant="secondary">
                                {LIBELLES_MOYEN_PAIEMENT[p.moyen_paiement] || p.moyen_paiement} · {fmt(p.montant)}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmt(t.montant_ttc)}</TableCell>
                        <TableCell className="text-right">
                          {t.statut === "validee" ? (
                            <Button
                              variant="ghost" size="sm" className="h-7 text-red-600 hover:text-red-700"
                              onClick={() => rembourserTicket(t.id, t.numero_ticket, "remboursee")}
                            >
                              <Undo2 className="h-3.5 w-3.5 mr-1" /> Rembourser
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {t.statut === "annulee" ? "Annulé" : t.statut === "remboursee" ? "Remboursé" : t.statut}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          {/* ── Analyse IA ───────────────────────────────────────────── */}
          <SectionCard contentClassName="pt-4">
            <OperationsInsights module="pos" societeId={societeId} payload={insightsPayload} />
          </SectionCard>

              {/* ── Historique des sessions ──────────────────────────── */}
              <HistoriqueSessions historique={historique} caParSession={caParSession} />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ── Dialog encaissement ────────────────────────────────────── */}
      <Dialog open={encaisserOpen} onOpenChange={setEncaisserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encaissement — {fmt(totaux.total_ttc)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Client (optionnel)</Label>
              <ClientPicker societeId={societeId} value={client} onChange={setClient} />
            </div>
            {paiements.map((p, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Moyen</Label>
                  <Select
                    value={p.moyen_paiement}
                    onValueChange={(v) =>
                      setPaiements((prev) => prev.map((x, j) => (j === i ? { ...x, moyen_paiement: v as MoyenPaiement } : x)))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MOYENS_PAIEMENT.map((m) => (
                        <SelectItem key={m} value={m}>
                          {LIBELLES_MOYEN_PAIEMENT[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  <Label className="text-xs">Montant</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.montant}
                    onChange={(e) =>
                      setPaiements((prev) => prev.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)))
                    }
                  />
                </div>
                {paiements.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Retirer ce moyen de paiement"
                    onClick={() => setPaiements((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={ajouterPaiement}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter un moyen de paiement
            </Button>
            <div className="text-sm flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Saisi / à payer</span>
              <span className={Math.abs(totalSaisi - totaux.total_ttc) <= 0.01 ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
                {fmt(totalSaisi)} / {fmt(totaux.total_ttc)}
              </span>
            </div>
            {partEspeces > 0 && (
              <div className="border-t pt-2 space-y-1">
                <Label className="text-xs text-muted-foreground">Espèces reçues (pour le rendu)</Label>
                <Input
                  type="number" inputMode="decimal" placeholder={fmt(partEspeces)}
                  value={recuEspeces} onChange={(e) => setRecuEspeces(e.target.value)}
                />
                <div className="text-sm flex justify-between">
                  <span className="text-muted-foreground">Rendu</span>
                  <span className="font-semibold tabular-nums">{fmt(rendu)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncaisserOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={validerTicket}
              disabled={submitting || Math.abs(totalSaisi - totaux.total_ttc) > 0.01}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Valider le ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TicketReceipt ticket={lastTicket} open={ticketOpen} onOpenChange={setTicketOpen} />

      {/* ── Dialog création rapide d'article ───────────────────────── */}
      <Dialog open={articleOpen} onOpenChange={setArticleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouvel article</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>SKU / code *</Label>
                <Input
                  value={artForm.sku}
                  onChange={(e) => setArtForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="CAFE-01"
                  autoFocus
                />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Input
                  list="pos-categories"
                  value={artForm.categorie}
                  onChange={(e) => setArtForm((f) => ({ ...f, categorie: e.target.value }))}
                  placeholder="Boissons"
                />
                <datalist id="pos-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <Label>Désignation *</Label>
              <Input
                value={artForm.designation}
                onChange={(e) => setArtForm((f) => ({ ...f, designation: e.target.value }))}
                placeholder="Café expresso"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Prix de vente HT (MUR)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={artForm.prix}
                  onChange={(e) => setArtForm((f) => ({ ...f, prix: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>TVA %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={artForm.tva}
                  onChange={(e) => setArtForm((f) => ({ ...f, tva: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={artForm.gereStock}
                onChange={(e) => setArtForm((f) => ({ ...f, gereStock: e.target.checked }))}
              />
              Géré en stock (décocher pour un service / plat non stocké)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArticleOpen(false)}>
              Annuler
            </Button>
            <Button onClick={creerArticle} disabled={submitting || !artForm.sku.trim() || !artForm.designation.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Créer l&apos;article
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog clôture ─────────────────────────────────────────── */}
      <Dialog open={clotureOpen} onOpenChange={setClotureOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clôture de la session</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fond d&apos;ouverture</span>
              <span>{fmt(session?.fond_ouverture || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Espèces encaissées</span>
              <span>{fmt(totalEspecesSession)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Fond théorique attendu</span>
              <span>{fmt((session?.fond_ouverture || 0) + totalEspecesSession)}</span>
            </div>
            <div>
              <Label>Fond de caisse compté (MUR) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={fondCompte}
                onChange={(e) => setFondCompte(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Un écart génère automatiquement l&apos;écriture comptable correspondante
              (manque : 6588 / surplus : 758).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClotureOpen(false)}>
              Annuler
            </Button>
            <Button onClick={fermerSession} disabled={submitting || fondCompte === ""}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Clôturer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog récapitulatif de clôture ────────────────────────── */}
      <Dialog open={!!recap} onOpenChange={(o) => !o && setRecap(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Session clôturée</DialogTitle>
          </DialogHeader>
          {recap && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tickets validés</span>
                <span>{recap.nb_tickets}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chiffre d&apos;affaires TTC</span>
                <span className="font-medium">{fmt(recap.total_ttc)}</span>
              </div>
              {Object.entries(recap.par_moyen || {}).map(([moyen, montant]) => (
                <div key={moyen} className="flex justify-between text-muted-foreground">
                  <span>· {LIBELLES_MOYEN_PAIEMENT[moyen as MoyenPaiement] || moyen}</span>
                  <span>{fmt(Number(montant))}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between">
                <span className="text-muted-foreground">Fond théorique</span>
                <span>{fmt(recap.fond_fermeture_theorique)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fond compté</span>
                <span>{fmt(recap.fond_fermeture_compte)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Écart de caisse</span>
                <span className={recap.ecart_caisse === 0 ? "" : recap.ecart_caisse < 0 ? "text-red-600" : "text-emerald-700"}>
                  {fmt(recap.ecart_caisse)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRecap(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPageShell>
  )
}

/* ── Historique des sessions clôturées ──────────────────────────────── */
function HistoriqueSessions({
  historique,
  caParSession,
}: {
  historique: HistoriqueSession[]
  caParSession: Record<string, number>
}) {
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <History className="h-4 w-4" /> Historique des sessions
        </span>
      }
      subtitle="Sessions clôturées, CA et écart de caisse"
      contentClassName="pt-0"
    >
      {historique.length === 0 ? (
        <OpsEmpty
          icon={History}
          title="Aucune session clôturée"
          description="L'historique des shifts précédents (CA, fond compté, écart) apparaîtra ici après la première clôture."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clôturée le</TableHead>
                <TableHead>Caisse</TableHead>
                <TableHead className="text-right">CA TTC</TableHead>
                <TableHead className="text-right">Fond compté</TableHead>
                <TableHead className="text-right">Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historique.map((h) => {
                const ca = caParSession[h.id] ?? 0
                const ecart = h.ecart_caisse
                return (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap">
                      {h.fermee_at
                        ? new Date(h.fermee_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>{h.depots?.nom || "Caisse"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMUR(ca)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMUR(h.fond_fermeture_compte)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${signedClass(ecart)}`}>
                      {ecart === null ? "—" : formatMUR(ecart)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  )
}
