"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { RapprochementValidationPanel } from "@/components/accounting/RapprochementValidationPanel"

interface Rapprochement {
  id: string
  compte_bancaire: string
  banque: string | null
  periode_debut: string
  periode_fin: string
  solde_releve: number
  solde_comptable: number
  ecart: number
  statut: string
  locked?: boolean
  valide_par?: string | null
  valide_le?: string | null
  hash_integrite?: string | null
  justification_ecart?: string | null
}

function fmtDate(d: string) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—"
}

export default function RapprochementValidationsPage() {
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Rapprochement[]>([])

  const fetchAll = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/rapprochement/list?societe_id=${societeId}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      setItems(body.rapprochements || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const counts = {
    total: items.length,
    valide: items.filter(r => r.statut === "valide").length,
    ecart: items.filter(r => r.statut === "ecart_justifie").length,
    en_cours: items.filter(r => r.statut === "en_cours").length,
  }

  return (
    <ClientPageShell
      kicker="Comptabilité"
      title="Validations de rapprochement"
      subtitle="Clôture mensuelle, verrouillage et traçabilité (phase 4)"
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Rapprochement", href: "/client/rapprochement" },
        { label: "Validations" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 mr-1" /> Rafraîchir
        </Button>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">Total rapprochements</div>
          <div className="text-2xl font-bold">{counts.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">Validés</div>
          <div className="text-2xl font-bold text-emerald-700">{counts.valide}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">Écart justifié</div>
          <div className="text-2xl font-bold text-amber-600">{counts.ecart}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-gray-500">En cours</div>
          <div className="text-2xl font-bold text-gray-600">{counts.en_cours}</div>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-500">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          Aucun rapprochement enregistré sur cette société.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {items.map(r => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="outline">{r.compte_bancaire}</Badge>
                  {r.banque && <span className="text-sm font-normal text-gray-600">{r.banque}</span>}
                  <span className="ml-2 text-sm text-gray-500">
                    {fmtDate(r.periode_debut)} → {fmtDate(r.periode_fin)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RapprochementValidationPanel
                  rapprochement={r}
                  onChanged={fetchAll}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ClientPageShell>
  )
}
