"use client"

/**
 * Synthèse mensuelle « en clair » — /client/synthese-mensuelle (cible A).
 *
 * Répond en langage simple aux 5 questions d'un dirigeant non-comptable :
 * ai-je gagné de l'argent ? combien est entré/sorti ? combien de TVA à
 * reverser ? qui me doit ? à qui je dois ? Réutilise /api/client/financial
 * (agrégats déjà calculés) ; logique de mise en récit : lib/reporting.
 */

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  FileBarChart, ChevronLeft, ChevronRight, Loader2, Printer,
  TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowRight,
} from "lucide-react"
import { construireSynthese, type SyntheseInput, type Ton } from "@/lib/reporting/synthese-mensuelle"

const NAVY = "#0B0F2E"

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " MUR"
}

/** Bornes AAAA-MM-JJ du mois (année, mois 0-indexé). */
function bornesMois(annee: number, mois: number): { debut: string; fin: string } {
  const p = (n: number) => String(n).padStart(2, "0")
  const dernier = new Date(annee, mois + 1, 0).getDate()
  return { debut: `${annee}-${p(mois + 1)}-01`, fin: `${annee}-${p(mois + 1)}-${p(dernier)}` }
}

const TON_STYLE: Record<Ton, { border: string; badge: string; text: string }> = {
  positif: { border: "border-l-emerald-500", badge: "bg-emerald-50 text-emerald-700", text: "text-emerald-700" },
  negatif: { border: "border-l-red-500", badge: "bg-red-50 text-red-700", text: "text-red-700" },
  attention: { border: "border-l-amber-500", badge: "bg-amber-50 text-amber-700", text: "text-amber-700" },
  neutre: { border: "border-l-slate-300", badge: "bg-slate-100 text-slate-600", text: "text-slate-700" },
}

interface FinancialPayload {
  totalRevenue?: number; totalExpenses?: number; tvaNette?: number
  creances?: number; dettesFournisseurs?: number; dettesFiscales?: number
  dettesSociales?: number; totalBankMUR?: number
}

async function fetchFinancial(societeId: string, debut: string, fin: string): Promise<FinancialPayload | null> {
  try {
    const r = await fetch(`/api/client/financial?societe_id=${societeId}&date_debut=${debut}&date_fin=${fin}`)
    const d = await r.json()
    return d?.financial ?? null
  } catch { return null }
}

export default function SyntheseMensuellePage() {
  const { societeId, societe } = useSocieteActive()
  const now = new Date()
  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois] = useState(now.getMonth())
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ courant: FinancialPayload | null; precedent: FinancialPayload | null } | null>(null)

  const moisLabel = `${MOIS_FR[mois]} ${annee}`

  const charger = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    const cur = bornesMois(annee, mois)
    const prevMoisIdx = mois === 0 ? 11 : mois - 1
    const prevAnnee = mois === 0 ? annee - 1 : annee
    const prev = bornesMois(prevAnnee, prevMoisIdx)
    const [courant, precedent] = await Promise.all([
      fetchFinancial(societeId, cur.debut, cur.fin),
      fetchFinancial(societeId, prev.debut, prev.fin),
    ])
    setData({ courant, precedent })
    setLoading(false)
  }, [societeId, annee, mois])

  useEffect(() => { charger() }, [charger])

  const synthese = useMemo(() => {
    if (!data?.courant) return null
    const f = data.courant
    const input: SyntheseInput = {
      mois_label: moisLabel,
      revenus: f.totalRevenue ?? 0,
      depenses: f.totalExpenses ?? 0,
      tva_nette: f.tvaNette ?? 0,
      creances: f.creances ?? 0,
      dettes_fournisseurs: f.dettesFournisseurs ?? 0,
      dettes_fiscales: f.dettesFiscales ?? 0,
      dettes_sociales: f.dettesSociales ?? 0,
      tresorerie: f.totalBankMUR ?? 0,
      revenus_mois_precedent: data.precedent?.totalRevenue,
    }
    return construireSynthese(input)
  }, [data, moisLabel])

  const auMoisCourant = annee === now.getFullYear() && mois === now.getMonth()
  function moisPrecedent() {
    if (mois === 0) { setAnnee(annee - 1); setMois(11) } else setMois(mois - 1)
  }
  function moisSuivant() {
    if (auMoisCourant) return
    if (mois === 11) { setAnnee(annee + 1); setMois(0) } else setMois(mois + 1)
  }

  if (!societeId) {
    return (
      <ClientPageShell>
        <Card><CardContent className="py-10 text-center text-slate-500">Sélectionnez d'abord une société.</CardContent></Card>
      </ClientPageShell>
    )
  }

  const vTon = synthese ? TON_STYLE[synthese.verdict.ton] : TON_STYLE.neutre

  return (
    <ClientPageShell>
      <div className="max-w-4xl mx-auto space-y-5 print:max-w-full">
        {/* En-tête + sélecteur de mois */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: NAVY }}>
              <FileBarChart className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: NAVY }}>Synthèse du mois</h1>
              <p className="text-sm text-slate-500">{societe?.nom ? `${societe.nom} — ` : ""}en clair, sans jargon.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="icon" onClick={moisPrecedent} title="Mois précédent"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[130px] text-center capitalize">{moisLabel}</span>
            <Button variant="outline" size="icon" onClick={moisSuivant} disabled={auMoisCourant} title="Mois suivant"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="ml-1"><Printer className="h-4 w-4 mr-1.5" /> Imprimer / PDF</Button>
          </div>
        </div>

        {loading ? (
          <Card><CardContent className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></CardContent></Card>
        ) : !synthese ? (
          <Card><CardContent className="py-10 text-center text-slate-500">Aucune donnée pour {moisLabel}.</CardContent></Card>
        ) : (
          <>
            {/* Verdict */}
            <Card className={`border-l-4 ${vTon.border}`}>
              <CardContent className="py-4 flex items-start gap-3">
                {synthese.verdict.ton === "positif" && <TrendingUp className="h-6 w-6 text-emerald-600 flex-shrink-0" />}
                {synthese.verdict.ton === "negatif" && <TrendingDown className="h-6 w-6 text-red-600 flex-shrink-0" />}
                {synthese.verdict.ton === "attention" && <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />}
                {synthese.verdict.ton === "neutre" && <Minus className="h-6 w-6 text-slate-500 flex-shrink-0" />}
                <div>
                  <p className={`font-semibold ${vTon.text}`}>
                    Résultat du mois : {fmt(synthese.resultat)}
                  </p>
                  <p className="text-sm text-slate-600 mt-0.5">{synthese.verdict.phrase}</p>
                </div>
              </CardContent>
            </Card>

            {/* Cartes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {synthese.cartes.map(c => {
                const st = TON_STYLE[c.ton]
                return (
                  <Card key={c.cle} className={`border-l-4 ${st.border}`}>
                    <CardHeader className="pb-1.5">
                      <CardTitle className="text-sm font-medium text-slate-600">{c.titre}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      <p className={`text-2xl font-bold tracking-tight ${c.cle === "resultat" ? st.text : ""}`} style={{ color: c.cle === "resultat" ? undefined : NAVY }}>
                        {fmt(c.montant)}
                      </p>
                      <p className="text-xs text-slate-500 leading-snug">{c.phrase}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Renvois utiles */}
            <div className="flex flex-wrap gap-2 print:hidden">
              <Link href="/client/echeances"><Button variant="outline" size="sm">Voir mes échéances <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
              <Link href="/client/relances"><Button variant="outline" size="sm">Relancer mes clients <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
              <Link href="/client/tableau-de-bord"><Button variant="outline" size="sm">Tableau de bord détaillé <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
            </div>

            <p className="text-[11px] text-slate-400 text-center pt-1">
              Chiffres indicatifs calculés à partir de vos factures, écritures et relevés. Pour la déclaration officielle, référez-vous à votre comptable.
            </p>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
