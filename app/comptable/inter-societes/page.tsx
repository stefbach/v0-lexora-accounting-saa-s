"use client"

/**
 * Page Inter-sociétés — validation des virements inter-sociétés détectés
 * automatiquement par le rapprochement bancaire (cf PR #207).
 *
 * Workflow utilisateur :
 *   1. Le rapprochement détecte un virement DDS → OCC (même groupe).
 *   2. Il crée DR 451 / CR 512 côté DDS + le miroir DR 512 / CR 451 côté OCC.
 *   3. Le miroir est tagué `statut = 'auto_genere_inter_societe'` avec un
 *      `ref_folio` préfixé `MIR-`.
 *   4. Cette page liste tous ces miroirs pour validation comptable.
 *
 * V1 (cette page) : lecture + actions optimistes locales. Les routes
 * d'écriture (valider / supprimer) seront livrées en V2 — pour l'instant
 * on remonte un toast + on suggère l'action manuelle via le grand-livre.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import {
  Loader2,
  RefreshCw,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Filter,
} from "lucide-react"
import {
  InterSocieteRow,
  type InterSocietePaire,
} from "@/components/comptable/InterSocieteRow"

interface Societe {
  id: string
  nom: string
}

export default function InterSocietesPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState<string>("all")
  const [selectedEmettrice, setSelectedEmettrice] = useState<string>("all")
  const [dateDebut, setDateDebut] = useState<string>("")
  const [dateFin, setDateFin] = useState<string>("")
  const [statutFilter, setStatutFilter] = useState<string>("all")

  const [paires, setPaires] = useState<InterSocietePaire[]>([])
  const [enAttente, setEnAttente] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    msg: string
    type: "success" | "error" | "info"
  } | null>(null)

  // Locks locaux : ids miroirs marqués validés ou supprimés en V1
  const [localValides, setLocalValides] = useState<Set<string>>(new Set())
  const [localSupprimes, setLocalSupprimes] = useState<Set<string>>(new Set())

  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "success") => {
      setToast({ msg, type })
      setTimeout(() => setToast(null), 4000)
    },
    [],
  )

  // ── Sociétés ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/comptable/societes")
      .then((r) => r.json())
      .then((d) => {
        const list: Societe[] = d.societes || []
        setSocietes(list)
      })
      .catch(() => {})
  }, [])

  // ── Charger paires ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedSociete !== "all") params.set("societe_id", selectedSociete)
      if (selectedEmettrice !== "all")
        params.set("societe_emettrice", selectedEmettrice)
      if (dateDebut) params.set("date_debut", dateDebut)
      if (dateFin) params.set("date_fin", dateFin)
      const res = await fetch(`/api/comptable/inter-societes?${params}`)
      const d = await res.json()
      if (!res.ok) {
        showToast(d?.error || "Erreur chargement", "error")
        setPaires([])
        setEnAttente(0)
        return
      }
      setPaires(d.paires || [])
      setEnAttente(d.en_attente || 0)
    } catch (e: any) {
      showToast("Erreur réseau", "error")
      setPaires([])
    } finally {
      setLoading(false)
    }
  }, [selectedSociete, selectedEmettrice, dateDebut, dateFin, showToast])

  useEffect(() => {
    load()
  }, [load])

  // ── Actions (V1 optimistes / informatives) ───────────────────────────
  const handleValider = useCallback(
    (p: InterSocietePaire) => {
      // V1 : marquage local uniquement
      setLocalValides((prev) => {
        const next = new Set(prev)
        next.add(p.key)
        return next
      })
      showToast(
        `Paire ${p.miroir.ref_folio} marquée comme validée (local — persistance V2)`,
        "success",
      )
    },
    [showToast],
  )

  const handleReclasser = useCallback(
    (p: InterSocietePaire) => {
      // Redirection vers le grand-livre filtré sur la société dest et le compte 451
      const url = `/comptable/grand-livre?societe_id=${encodeURIComponent(
        p.societe_destinataire.id,
      )}&compte=451`
      window.open(url, "_blank", "noopener")
      showToast("Ouverture du grand-livre — édition manuelle requise", "info")
    },
    [showToast],
  )

  const handleSupprimer = useCallback(
    (p: InterSocietePaire) => {
      // V1 : pas de DELETE direct — on signale uniquement
      setLocalSupprimes((prev) => {
        const next = new Set(prev)
        next.add(p.key)
        return next
      })
      showToast(
        `Suppression demandée pour ${p.miroir.ref_folio}. Route DELETE à livrer en V2 — la paire reste en base.`,
        "info",
      )
    },
    [showToast],
  )

  // ── Filtrage côté client (statut local) ──────────────────────────────
  const filteredPaires = useMemo(() => {
    return paires
      .filter((p) => !localSupprimes.has(p.key))
      .map((p) =>
        localValides.has(p.key) ? { ...p, statut: "valide" as const } : p,
      )
      .filter((p) => {
        if (statutFilter === "all") return true
        if (statutFilter === "auto") return p.statut !== "valide"
        if (statutFilter === "valide") return p.statut === "valide"
        return true
      })
  }, [paires, localValides, localSupprimes, statutFilter])

  const enAttenteEffectif = useMemo(() => {
    return filteredPaires.filter((p) => p.statut !== "valide").length
  }, [filteredPaires])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success"
                ? "bg-emerald-600"
                : toast.type === "error"
                  ? "bg-rose-600"
                  : "bg-slate-700"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-indigo-600" />
              Virements inter-sociétés
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Liste des miroirs comptables générés automatiquement par le
              rapprochement bancaire lors de la détection d'un virement entre
              deux sociétés du même groupe (compte 451 — Comptes courants
              Groupe). Validez ou corrigez les paires détectées.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Rafraîchir
          </Button>
        </div>

        {/* Indicateurs en haut */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Total paires détectées
              </div>
              <div className="text-3xl font-semibold mt-1">
                {filteredPaires.length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                En attente de validation
              </div>
              <div className="text-3xl font-semibold mt-1 text-amber-700">
                {enAttenteEffectif}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Validées (session)
              </div>
              <div className="text-3xl font-semibold mt-1 text-emerald-700">
                {localValides.size}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtres */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filtres
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  Société destinataire
                </label>
                <Select
                  value={selectedSociete}
                  onValueChange={setSelectedSociete}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {societes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Société émettrice
                </label>
                <Select
                  value={selectedEmettrice}
                  onValueChange={setSelectedEmettrice}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {societes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Du</label>
                <Input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Au</label>
                <Input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Statut</label>
                <Select value={statutFilter} onValueChange={setStatutFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="auto">À contrôler</SelectItem>
                    <SelectItem value="valide">Validés</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tableau */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Paires miroir ({filteredPaires.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement...
              </div>
            ) : filteredPaires.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                Aucun virement inter-sociétés détecté avec ces filtres.
                <div className="text-xs mt-2 max-w-md mx-auto">
                  Les miroirs sont créés par le rapprochement bancaire lorsque
                  Lex Banque identifie un virement entre 2 sociétés du même
                  groupe.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-left py-2 px-3 font-medium">
                        Émettrice → Destinataire
                      </th>
                      <th className="text-right py-2 px-3 font-medium">
                        Montant
                      </th>
                      <th className="text-left py-2 px-3 font-medium">
                        Libellé / Réf.
                      </th>
                      <th className="text-left py-2 px-3 font-medium">
                        Statut
                      </th>
                      <th className="text-right py-2 px-3 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPaires.map((p) => (
                      <InterSocieteRow
                        key={p.key}
                        paire={p}
                        busy={busyKey === p.key}
                        onValider={handleValider}
                        onReclasser={handleReclasser}
                        onSupprimer={handleSupprimer}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Note de bas de page */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <Badge variant="outline" className="mr-2">
              V1
            </Badge>
            Cette page est en lecture + actions locales. Les routes de
            persistance (validation / suppression côté DB) seront livrées en
            V2. Pour modifier un compte ou supprimer une écriture, utiliser le
            grand-livre.
          </p>
        </div>
      </div>
    </ClientPageShell>
  )
}
