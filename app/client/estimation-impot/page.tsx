"use client"

/**
 * Estimation d'impôt « live » — /client/estimation-impot (cible A).
 *
 * Anti-mauvaise-surprise pour le dirigeant : une estimation *indicative* de ce
 * qu'il devra à la MRA (impôt sur les sociétés + TVA), calculée à partir de son
 * résultat d'exercice et de sa TVA nette. Réutilise /api/client/financial ;
 * calcul pur dans lib/reporting/estimation-impot. Ce n'est pas la déclaration
 * officielle (rappel affiché).
 */

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Landmark, Loader2, AlertTriangle, ArrowRight, Info, PiggyBank } from "lucide-react"
import { estimerImpot, type EstimationInput } from "@/lib/reporting/estimation-impot"

const NAVY = "#0B0F2E"

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " MUR"
}

interface FinancialPayload {
  resultat?: number; tvaNette?: number; exercice_actuel?: string
}

export default function EstimationImpotPage() {
  const { societeId, societe } = useSocieteActive()
  const [fin, setFin] = useState<FinancialPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const charger = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const d = await r.json()
      setFin(d?.financial ?? null)
    } catch { setFin(null) }
    setLoading(false)
  }, [societeId])

  useEffect(() => { charger() }, [charger])

  const regime = (societe?.regime as string | undefined) ?? "domestic"
  const numeroTva = societe?.numero_tva_mra as string | undefined
  const tvaAssujetti = !!(numeroTva && String(numeroTva).trim())

  const estimation = useMemo(() => {
    if (!fin) return null
    const input: EstimationInput = {
      resultat_exercice: fin.resultat ?? 0,
      regime,
      tva_nette: fin.tvaNette ?? 0,
      tva_assujetti: tvaAssujetti,
    }
    return estimerImpot(input)
  }, [fin, regime, tvaAssujetti])

  if (!societeId) {
    return (
      <ClientPageShell>
        <Card><CardContent className="py-10 text-center text-slate-500">Sélectionnez d'abord une société.</CardContent></Card>
      </ClientPageShell>
    )
  }

  return (
    <ClientPageShell>
      <div className="max-w-3xl mx-auto space-y-5">
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: NAVY }}>
            <Landmark className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: NAVY }}>Ce que vous devrez à la MRA</h1>
            <p className="text-sm text-slate-500">
              {societe?.nom ? `${societe.nom} — ` : ""}estimation indicative{fin?.exercice_actuel ? ` · exercice ${fin.exercice_actuel}` : ""}.
            </p>
          </div>
        </div>

        {loading ? (
          <Card><CardContent className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></CardContent></Card>
        ) : !estimation ? (
          <Card><CardContent className="py-10 text-center text-slate-500">Données indisponibles pour le moment.</CardContent></Card>
        ) : (
          <>
            {/* Total à provisionner */}
            <Card className="border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-50/60 to-white">
              <CardContent className="py-5 flex items-center gap-4">
                <PiggyBank className="h-9 w-9 text-indigo-600 flex-shrink-0" />
                <div>
                  <p className="text-sm text-slate-500">À mettre de côté dès maintenant</p>
                  <p className="text-3xl font-bold tracking-tight" style={{ color: NAVY }}>
                    {fmt(estimation.total_a_provisionner)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Total estimé de vos impôts à venir (impôt sur les sociétés + TVA à reverser).
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Détail par poste */}
            <div className="space-y-3">
              {estimation.lignes.map(l => (
                <Card key={l.cle} className={`border-l-4 ${l.credit ? "border-l-emerald-500" : l.montant > 0 ? "border-l-amber-500" : "border-l-slate-300"}`}>
                  <CardHeader className="pb-1.5">
                    <CardTitle className="text-base flex items-center justify-between gap-3">
                      <span>{l.titre}</span>
                      <span className={`font-bold ${l.credit ? "text-emerald-700" : ""}`} style={{ color: l.credit ? undefined : NAVY }}>
                        {l.credit ? "+" : ""}{fmt(l.montant)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {l.taux_pct !== null && (
                      <p className="text-xs text-slate-500">
                        Base : {fmt(l.base)} × {l.taux_pct}%
                      </p>
                    )}
                    <p className="text-sm text-slate-600">{l.explication}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 flex-shrink-0" /> {l.echeance}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Avertissement */}
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 text-amber-800 p-3 text-sm">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Estimation indicative</strong>, calculée sur votre résultat comptable avant
                retraitements fiscaux. Le montant officiel (crédits d'impôt, FTC, TDS, retraitements)
                est établi par votre comptable au moment de la déclaration.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/client/echeances"><Button variant="outline" size="sm">Voir mes échéances MRA <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
              <Link href="/client/synthese-mensuelle"><Button variant="outline" size="sm">Synthèse du mois <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
            </div>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
