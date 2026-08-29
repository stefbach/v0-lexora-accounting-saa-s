"use client"

/**
 * Prévision de trésorerie — /client/previsions-tresorerie (cible A).
 *
 * « Vais-je être à court d'argent ? » Projette la trésorerie à 30/60/90 jours
 * à partir du solde bancaire, des factures clients à encaisser, des factures
 * fournisseurs à payer et des échéances MRA connues (TVA, impôt sur les
 * sociétés). Réutilise /api/client/financial ; projection pure dans
 * lib/reporting/prevision-tresorerie.
 */

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  LineChart, Loader2, AlertTriangle, CheckCircle2, ArrowRight, TrendingUp, TrendingDown, Wallet,
} from "lucide-react"
import { construirePrevision, ajouterJours, type FluxTresorerie } from "@/lib/reporting/prevision-tresorerie"
import { tauxISPct } from "@/lib/reporting/estimation-impot"

const NAVY = "#0B0F2E"

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " MUR"
}
function fmtDate(iso: string): string {
  try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) }
  catch { return iso }
}
function today(): string { return new Date().toISOString().slice(0, 10) }

/** Fin du mois suivant une date de référence (repère MRA « fin du mois suivant »). */
function finMoisSuivant(ref: string): string {
  const d = new Date(`${ref}T00:00:00Z`)
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))
  return fin.toISOString().slice(0, 10)
}

interface FactureRow {
  type_facture?: string; statut?: string; numero_facture?: string; tiers?: string
  date_echeance?: string; date_facture?: string; montant_mur?: number; montant_ttc?: number
}
interface FinancialPayload {
  factures?: FactureRow[]; totalBankMUR?: number; tvaNette?: number; resultat?: number
}

function montantFacture(f: FactureRow): number {
  return Number(f.montant_mur) || Number(f.montant_ttc) || 0
}
function echeanceFacture(f: FactureRow): string {
  return f.date_echeance || f.date_facture || today()
}

export default function PrevisionsTresoreriePage() {
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

  const { prevision, flux } = useMemo(() => {
    if (!fin) return { prevision: null, flux: [] as FluxTresorerie[] }
    const ref = today()
    const factures = fin.factures ?? []
    const flux: FluxTresorerie[] = []

    for (const f of factures) {
      if (f.statut === "paye" || f.statut === "annule") continue
      const montant = montantFacture(f)
      if (montant <= 0) continue
      const libelle = f.numero_facture ? `${f.tiers || "Facture"} — ${f.numero_facture}` : (f.tiers || "Facture")
      if (f.type_facture === "client") {
        flux.push({ date: echeanceFacture(f), montant, libelle, categorie: "client" })
      } else if (f.type_facture === "fournisseur") {
        flux.push({ date: echeanceFacture(f), montant: -montant, libelle, categorie: "fournisseur" })
      }
    }

    // Échéance MRA — TVA à reverser (fin du mois suivant), si assujetti.
    const numeroTva = societe?.numero_tva_mra as string | undefined
    const tvaNette = fin.tvaNette ?? 0
    if (numeroTva && String(numeroTva).trim() && tvaNette > 0) {
      flux.push({ date: finMoisSuivant(ref), montant: -tvaNette, libelle: "TVA à reverser (MRA)", categorie: "tva" })
    }

    // Échéance MRA — impôt sur les sociétés estimé (clôture + 6 mois).
    const dateFin = societe?.date_fin_exercice as string | undefined
    const resultat = fin.resultat ?? 0
    if (dateFin && resultat > 0) {
      const is = Math.round(resultat * (tauxISPct(societe?.regime as string | undefined) / 100) * 100) / 100
      if (is > 0) flux.push({ date: ajouterJours(dateFin, 182), montant: -is, libelle: "Impôt sur les sociétés (estimé)", categorie: "is" })
    }

    return { prevision: construirePrevision(fin.totalBankMUR ?? 0, flux, ref), flux }
  }, [fin, societe])

  const prochainsFlux = useMemo(() => {
    const ref = today()
    const max = ajouterJours(ref, 90)
    return [...flux]
      .map(f => ({ ...f, date: f.date < ref ? ref : f.date }))
      .filter(f => f.date <= max)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 12)
  }, [flux])

  if (!societeId) {
    return (
      <ClientPageShell>
        <Card><CardContent className="py-10 text-center text-slate-500">Sélectionnez d'abord une société.</CardContent></Card>
      </ClientPageShell>
    )
  }

  return (
    <ClientPageShell>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: NAVY }}>
            <LineChart className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: NAVY }}>Vais-je être à court d'argent ?</h1>
            <p className="text-sm text-slate-500">{societe?.nom ? `${societe.nom} — ` : ""}prévision de trésorerie à 90 jours.</p>
          </div>
        </div>

        {loading ? (
          <Card><CardContent className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></CardContent></Card>
        ) : !prevision ? (
          <Card><CardContent className="py-10 text-center text-slate-500">Données indisponibles pour le moment.</CardContent></Card>
        ) : (
          <>
            {/* Alerte / rassurance */}
            {prevision.risque_decouvert ? (
              <Card className="border-l-4 border-l-red-500 bg-red-50/50">
                <CardContent className="py-4 flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-700">Attention : risque de trésorerie négative</p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      Au rythme actuel, votre solde passerait sous zéro
                      {prevision.premier_jour_negatif ? ` vers le ${fmtDate(prevision.premier_jour_negatif)}` : ""}
                      {" "}(jusqu'à {fmt(prevision.solde_min)}). Relancez vos clients ou décalez des paiements.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/40">
                <CardContent className="py-4 flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-700">Trésorerie sous contrôle sur 90 jours</p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      Votre solde projeté reste positif (au plus bas : {fmt(prevision.solde_min)}
                      {prevision.date_solde_min ? ` le ${fmtDate(prevision.date_solde_min)}` : ""}).
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Solde actuel + 3 horizons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-slate-300">
                <CardHeader className="pb-1.5"><CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5"><Wallet className="h-4 w-4" /> Aujourd'hui</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(prevision.solde_initial)}</p><p className="text-xs text-slate-400 mt-1">Solde en banque</p></CardContent>
              </Card>
              {prevision.points.map(pt => (
                <Card key={pt.horizon_jours} className={`border-l-4 ${pt.solde_projete < 0 ? "border-l-red-500" : "border-l-indigo-400"}`}>
                  <CardHeader className="pb-1.5"><CardTitle className="text-sm font-medium text-slate-600">Dans {pt.horizon_jours} j</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${pt.solde_projete < 0 ? "text-red-700" : ""}`} style={{ color: pt.solde_projete < 0 ? undefined : NAVY }}>{fmt(pt.solde_projete)}</p>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                      <span className="inline-flex items-center gap-0.5 text-emerald-600"><TrendingUp className="h-3 w-3" />{fmt(pt.entrees_cumul)}</span>
                      <span className="inline-flex items-center gap-0.5 text-red-500"><TrendingDown className="h-3 w-3" />{fmt(pt.sorties_cumul)}</span>
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Prochains mouvements */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Prochains mouvements attendus</CardTitle></CardHeader>
              <CardContent className="p-0">
                {prochainsFlux.length === 0 ? (
                  <p className="text-sm text-slate-500 px-4 py-6 text-center">Aucun mouvement identifié sur 90 jours.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {prochainsFlux.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{f.libelle}</p>
                          <p className="text-xs text-slate-400">{fmtDate(f.date)}</p>
                        </div>
                        <span className={`text-sm font-semibold flex-shrink-0 ${f.montant >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {f.montant >= 0 ? "+" : "−"}{fmt(Math.abs(f.montant))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Link href="/client/relances"><Button variant="outline" size="sm">Relancer mes clients <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
              <Link href="/client/estimation-impot"><Button variant="outline" size="sm">Estimation d'impôt <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
              <Link href="/client/synthese-mensuelle"><Button variant="outline" size="sm">Synthèse du mois <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
            </div>

            <p className="text-[11px] text-slate-400 text-center pt-1">
              Projection indicative basée sur vos factures en cours et les échéances MRA connues. Les encaissements réels peuvent varier selon les délais de paiement.
            </p>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
