"use client"

/**
 * Page /client/banque — agent-friendly.
 *
 * Vue d'ensemble des comptes bancaires de la société active du client +
 * historique des relevés bancaires importés. Branche Lex Banque (lien direct
 * vers /client/rapprochement pour la suite du flow).
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Landmark,
  RefreshCw,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Bot,
  ArrowRight,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface CompteBancaire {
  id: string
  banque: string
  nom_compte: string
  numero_compte: string
  iban?: string | null
  devise: string
  compte_comptable: string
  solde_actuel: number
  solde_dernier_releve: number
  date_dernier_releve: string | null
  compte_principal: boolean
  actif: boolean
}

interface ReleveBancaire {
  id: string
  compte_bancaire_id: string
  periode: string
  date_debut: string
  date_fin: string
  solde_ouverture: number
  solde_cloture: number
  total_debits: number
  total_credits: number
  statut_rapprochement: string
  transactions_json: any[] | null
  created_at: string
}

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    dev
  )
}
function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}
function daysSince(d: string | null): number {
  if (!d) return Infinity
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export default function ClientBanquePage() {
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<CompteBancaire[]>([])
  const [releves, setReleves] = useState<ReleveBancaire[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      // /api/client/financial expose les comptes_bancaires + transactions agrégées
      // dans `financial.bankAccounts` et `financial.bankTransactions`.
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const d = await res.json()
      const fin = d?.financial || {}
      const accounts: CompteBancaire[] = (fin.bankAccounts || []).map((a: any) => ({
        id: a.id,
        banque: a.banque || "—",
        nom_compte: a.nom_compte || a.numero_compte,
        numero_compte: a.numero_compte || "—",
        iban: a.iban || null,
        devise: a.devise || "MUR",
        compte_comptable: a.compte_comptable || "—",
        solde_actuel: Number(a.solde_actuel) || Number(a.solde_mur) || 0,
        solde_dernier_releve: Number(a.solde_dernier_releve) || 0,
        date_dernier_releve: a.date_dernier_releve || null,
        compte_principal: !!a.compte_principal,
        actif: a.actif !== false,
      }))
      setComptes(accounts)
      // Reconstruire les relevés depuis les bankTransactions plates
      const txs: any[] = fin.bankTransactions || []
      const releveMap = new Map<string, ReleveBancaire>()
      for (const t of txs) {
        const rid: string = t.releve_id || t.releveId
        if (!rid) continue
        const cur = releveMap.get(rid) || {
          id: rid,
          compte_bancaire_id: t.compte_bancaire_id || t.account_id || "",
          periode: t.periode || "",
          date_debut: t.date,
          date_fin: t.date,
          solde_ouverture: 0,
          solde_cloture: 0,
          total_debits: 0,
          total_credits: 0,
          statut_rapprochement: t.statut_rapprochement || "en_attente",
          transactions_json: [],
          created_at: t.created_at || t.date,
        }
        cur.transactions_json = cur.transactions_json || []
        cur.transactions_json.push(t)
        if (t.date) {
          if (!cur.date_debut || t.date < cur.date_debut) cur.date_debut = t.date
          if (!cur.date_fin || t.date > cur.date_fin) cur.date_fin = t.date
        }
        cur.total_debits += Number(t.debit) || 0
        cur.total_credits += Number(t.credit) || 0
        releveMap.set(rid, cur)
      }
      setReleves(Array.from(releveMap.values()))
    } catch {
      showToast("Erreur chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, showToast])
  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async (file: File) => {
    if (!societeId || !file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("societe_id", societeId)
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd })
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur upload", "error")
        return
      }
      showToast(`Relevé importé — ${d?.nb_transactions || 0} transactions extraites`)
      load()
    } catch (e: any) {
      showToast(e?.message || "Erreur upload", "error")
    } finally {
      setUploading(false)
    }
  }

  const totalSoldes = useMemo(
    () => comptes.reduce((s, c) => s + (c.solde_actuel || 0), 0),
    [comptes]
  )
  const lastImport = useMemo(() => {
    if (releves.length === 0) return null
    return releves.reduce((max, r) =>
      (r.created_at || "") > (max?.created_at || "") ? r : max
    , releves[0]).created_at
  }, [releves])
  const txEnAttente = useMemo(() => {
    return releves.reduce((sum, r) => {
      const arr = Array.isArray(r.transactions_json) ? r.transactions_json : []
      const enAttente = arr.filter(
        (t: any) =>
          t.statut === "propose" ||
          t.statut === "a_verifier" ||
          (!t.statut &&
            !t.facture_id &&
            !(Array.isArray(t.facture_ids) && t.facture_ids.length > 0))
      ).length
      return sum + enAttente
    }, 0)
  }, [releves])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* HEADER */}
        <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-sky-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 p-3 text-white shadow-md">
                <Landmark className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-blue-900">Comptes bancaires</h1>
                <p className="text-sm text-blue-700/80 mt-0.5">
                  Comptes & relevés · prérequis pour Lex Banque
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
              <label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(f)
                    e.currentTarget.value = ""
                  }}
                />
                <span
                  className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all h-9 rounded-md px-4 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white shadow-md ${
                    uploading ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Importer un relevé
                </span>
              </label>
              <Link href="/client/rapprochement">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Aller à Lex Banque
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              Société non disponible.
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Comptes actifs" value={comptes.filter((c) => c.actif).length} />
              <KpiCard
                label="Solde cumulé"
                value={fmt(totalSoldes, comptes[0]?.devise || "MUR")}
                tone="green"
              />
              <KpiCard
                label="Dernier import"
                value={lastImport ? formatDate(lastImport) : "—"}
                tone="blue"
              />
              <KpiCard
                label="Tx en attente"
                value={txEnAttente}
                tone={txEnAttente > 0 ? "amber" : "green"}
                accent={txEnAttente > 0}
              />
            </div>

            {/* Liste des comptes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-blue-600" />
                  Vos comptes bancaires ({comptes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {comptes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucun compte bancaire — importe un relevé pour en créer un.
                  </p>
                ) : (
                  comptes.map((c) => {
                    const days = daysSince(c.date_dernier_releve)
                    const stale = days > 35
                    return (
                      <div
                        key={c.id}
                        className="flex items-start justify-between gap-4 p-4 border rounded-lg hover:bg-muted/20"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">
                              {c.banque} · {c.numero_compte}
                            </h3>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {c.devise}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              PCM {c.compte_comptable}
                            </Badge>
                            {c.compte_principal && (
                              <Badge className="text-[10px] bg-blue-100 text-blue-700 border border-blue-300">
                                Principal
                              </Badge>
                            )}
                            {!c.actif && (
                              <Badge variant="outline" className="text-[10px] opacity-60">
                                Inactif
                              </Badge>
                            )}
                          </div>
                          {c.iban && (
                            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                              IBAN {c.iban}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
                            <span className="text-muted-foreground">
                              Solde actuel :{" "}
                              <span className="font-mono font-medium text-foreground">
                                {fmt(c.solde_actuel, c.devise)}
                              </span>
                            </span>
                            <span className="text-muted-foreground">
                              Dernier relevé : {formatDate(c.date_dernier_releve)}
                            </span>
                            {stale && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Plus de {days}j sans relevé
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Link href="/client/rapprochement">
                          <Button size="sm" variant="outline">
                            <Bot className="h-4 w-4 mr-1.5" />
                            Rapprocher
                          </Button>
                        </Link>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Relevés importés */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Relevés importés ({releves.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {releves.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Aucun relevé importé. Clique sur "Importer un relevé" pour commencer.
                  </p>
                ) : (
                  <div className="rounded border bg-card divide-y">
                    {releves
                      .slice()
                      .sort((a, b) => (b.date_fin || "").localeCompare(a.date_fin || ""))
                      .map((r) => {
                        const compte = comptes.find((c) => c.id === r.compte_bancaire_id)
                        const nbTx = Array.isArray(r.transactions_json)
                          ? r.transactions_json.length
                          : 0
                        const enAttente = Array.isArray(r.transactions_json)
                          ? r.transactions_json.filter(
                              (t: any) => t.statut === "propose" || t.statut === "a_verifier"
                            ).length
                          : 0
                        const rapprochees = Array.isArray(r.transactions_json)
                          ? r.transactions_json.filter((t: any) => t.statut === "rapproche")
                              .length
                          : 0
                        return (
                          <div
                            key={r.id}
                            className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-sm">
                                  {compte
                                    ? `${compte.banque} ${compte.numero_compte}`
                                    : "Compte inconnu"}
                                </h4>
                                <Badge variant="outline" className="text-[10px]">
                                  {r.periode || formatDate(r.date_debut)}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(r.date_debut)} → {formatDate(r.date_fin)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                                <span className="text-muted-foreground">
                                  Solde {fmt(r.solde_ouverture, compte?.devise)} →{" "}
                                  {fmt(r.solde_cloture, compte?.devise)}
                                </span>
                                <span className="text-muted-foreground">
                                  {nbTx} transaction{nbTx > 1 ? "s" : ""}
                                </span>
                                {rapprochees > 0 && (
                                  <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {rapprochees} rapprochée{rapprochees > 1 ? "s" : ""}
                                  </Badge>
                                )}
                                {enAttente > 0 && (
                                  <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                                    <Clock className="h-3 w-3 mr-1" />
                                    {enAttente} à valider
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Link href="/client/rapprochement">
                              <Button size="sm" variant="ghost">
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        )
                      })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CTA Lex Banque */}
            {(comptes.length > 0 || releves.length > 0) && (
              <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-purple-600 p-3 text-white shadow-md">
                      <Bot className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-purple-900">Prêt pour Lex Banque ?</h3>
                      <p className="text-sm text-purple-700/80 mt-0.5">
                        L'agent IA va rapprocher tes {txEnAttente} transactions en attente avec
                        tes factures.
                      </p>
                    </div>
                  </div>
                  <Link href="/client/rapprochement">
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white shadow-md">
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Lancer Lex Banque
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

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
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
