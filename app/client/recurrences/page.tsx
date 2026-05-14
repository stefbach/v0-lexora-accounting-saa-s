"use client"

/**
 * Page /client/recurrences — Factures récurrentes (modèles + générations).
 *
 * Affiche :
 *   • Liste des modèles avec leur config et la prochaine date de génération
 *   • Tableau des "générations dues" (preview du cron)
 *   • Boutons "Simuler" + "Générer maintenant"
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Loader2,
  Repeat,
  Plus,
  RefreshCw,
  Play,
  Calendar,
  AlertTriangle,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Modele {
  id: string
  numero_facture: string | null
  tiers: string | null
  montant_ttc: number
  devise: string
  recurrent_frequence: "mensuel" | "trimestriel" | "annuel"
  recurrence_jour_du_mois: number | null
  recurrence_date_debut: string | null
  recurrence_date_fin: string | null
  derniere_generation_date: string | null
}

interface Plan {
  modele_id: string
  modele_numero: string | null
  tiers: string | null
  dates_a_generer: string[]
}

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    dev
  )
}

const FREQ_LABEL: Record<string, string> = {
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  annuel: "Annuel",
}

export default function ClientRecurrencesPage() {
  const { societeId } = useSocieteActive()
  const [modeles, setModeles] = useState<Modele[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/client/recurrences?societe_id=${societeId}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || "Erreur")
      setModeles(d?.modeles || [])
      setPlans(d?.plans || [])
    } catch (e: any) {
      showToast(e?.message || "Erreur chargement", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    load()
  }, [load])

  const totalAGenerer = useMemo(
    () => plans.reduce((s, p) => s + p.dates_a_generer.length, 0),
    [plans],
  )

  async function run(dry_run: boolean) {
    if (!societeId) return
    if (totalAGenerer === 0) {
      showToast("Aucune génération en attente", "error")
      return
    }
    if (!dry_run) {
      const ok = window.confirm(`Générer ${totalAGenerer} facture(s) maintenant ?`)
      if (!ok) return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/client/recurrences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, dry_run }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || "Erreur")
      showToast(
        `${dry_run ? "Simulation" : "Génération"} : ${d?.summary?.factures_creees ?? 0} créée(s), ${
          d?.summary?.erreurs ?? 0
        } erreur(s)`,
        d?.summary?.erreurs > 0 ? "error" : "success",
      )
      await load()
    } catch (e: any) {
      showToast(e?.message || "Erreur", "error")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-6xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        )}

        <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 p-3 text-white shadow-md">
                <Repeat className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-violet-900">Factures récurrentes</h1>
                <p className="text-sm text-violet-800/80 mt-0.5">
                  Modèles générés automatiquement (mensuel / trimestriel / annuel)
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Link href="/client/nouvelle-facture">
                <Button className="bg-violet-600 hover:bg-violet-700 text-white shadow-md">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Créer un modèle
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
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
          </div>
        ) : (
          <>
            {/* Bandeau "à générer" */}
            <Card className={totalAGenerer > 0 ? "border-amber-300 bg-amber-50" : ""}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  {totalAGenerer > 0 ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                      <strong>{totalAGenerer} facture(s)</strong> en attente de génération sur{" "}
                      {plans.length} modèle(s).
                    </>
                  ) : (
                    <>Tous les modèles sont à jour ✓</>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => run(true)}
                    disabled={submitting || totalAGenerer === 0}
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Simuler
                  </Button>
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => run(false)}
                    disabled={submitting || totalAGenerer === 0}
                  >
                    {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Play className="h-4 w-4 mr-1.5" />
                    Générer maintenant
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="modeles">
              <TabsList>
                <TabsTrigger value="modeles">Modèles ({modeles.length})</TabsTrigger>
                <TabsTrigger value="preview">À générer ({totalAGenerer})</TabsTrigger>
              </TabsList>

              <TabsContent value="modeles">
                {modeles.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      Aucun modèle récurrent. Créez une nouvelle facture et cochez
                      « Facture récurrente » pour en faire un modèle.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0 divide-y">
                      {modeles.map((m) => (
                        <div key={m.id} className="p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-medium">
                                {m.numero_facture || m.id.slice(0, 8)}
                              </span>
                              <Badge className="bg-violet-100 text-violet-700 border-violet-300">
                                <Repeat className="h-3 w-3 mr-1" />
                                {FREQ_LABEL[m.recurrent_frequence] || m.recurrent_frequence}
                              </Badge>
                              {m.recurrence_jour_du_mois && (
                                <Badge variant="outline" className="text-[10px]">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  Jour {m.recurrence_jour_du_mois}
                                </Badge>
                              )}
                            </div>
                            <div className="font-mono font-medium text-sm">
                              {fmt(m.montant_ttc, m.devise)}
                            </div>
                          </div>
                          <div className="text-sm mt-1">{m.tiers || "—"}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                            <span>Début : {m.recurrence_date_debut || "—"}</span>
                            {m.recurrence_date_fin && <span>Fin : {m.recurrence_date_fin}</span>}
                            <span>
                              Dernière génération :{" "}
                              {m.derniere_generation_date || "jamais"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="preview">
                {plans.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                      Aucune génération en attente.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0 divide-y">
                      {plans.map((p) => (
                        <div key={p.modele_id} className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">
                              {p.modele_numero || p.modele_id.slice(0, 8)}
                            </span>
                            <span className="text-sm">{p.tiers || "—"}</span>
                            <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">
                              {p.dates_a_generer.length} à générer
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1">
                            {p.dates_a_generer.map((d) => (
                              <code key={d} className="bg-muted px-1.5 py-0.5 rounded">
                                {d}
                              </code>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
