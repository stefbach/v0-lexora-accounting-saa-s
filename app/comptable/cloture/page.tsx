"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, CheckCircle2, AlertTriangle, Calendar, TrendingUp, RefreshCw } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

interface Societe { id: string; nom: string }

export default function CloturePage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string>("")
  const [periode, setPeriode] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [exercice, setExercice] = useState<string>("2025-2026")
  const [dateCloture, setDateCloture] = useState<string>("2026-06-30")
  const [tauxEUR, setTauxEUR] = useState<string>("54.50")
  const [tauxUSD, setTauxUSD] = useState<string>("45.20")
  const [tauxGBP, setTauxGBP] = useState<string>("65.10")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const callApi = async (action: string, extra: Record<string, unknown>) => {
    if (!societeId) { setError("Sélectionnez une société"); return }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/comptable/cloture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, societe_id: societeId, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Erreur API")
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e?.message || "Erreur réseau")
    } finally {
      setLoading(false)
    }
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('cab.cloture.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('cab.cloture.subtitle', locale)}
          </p>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div>
              <Label>{t('cab.cloture.company', locale)}</Label>
              <Select value={societeId} onValueChange={setSocieteId}>
                <SelectTrigger className="w-72"><SelectValue placeholder={t('cab.cloture.choose_company', locale)} /></SelectTrigger>
                <SelectContent>
                  {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="mensuelle">
          <TabsList className="grid grid-cols-4 w-full max-w-3xl">
            <TabsTrigger value="mensuelle"><Calendar className="w-4 h-4 mr-1" /> {t('cab.cloture.tab_monthly', locale)}</TabsTrigger>
            <TabsTrigger value="annuelle"><TrendingUp className="w-4 h-4 mr-1" /> {t('cab.cloture.tab_annual', locale)}</TabsTrigger>
            <TabsTrigger value="change"><RefreshCw className="w-4 h-4 mr-1" /> {t('cab.cloture.tab_fx', locale)}</TabsTrigger>
            <TabsTrigger value="immo">{t('cab.cloture.tab_immo', locale)}</TabsTrigger>
          </TabsList>

          {/* Clôture mensuelle */}
          <TabsContent value="mensuelle" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Clôture mensuelle</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Génère en une fois : <strong>provisions IAS 19</strong> (PRGF + Severance),
                  <strong> agrégation TDS</strong> du mois, <strong>prorata IFRS 15</strong> over-time,
                  et <strong>calcul ECL IFRS 9</strong> sur les créances clients.
                </p>
                <div className="flex gap-3 items-end">
                  <div>
                    <Label>Période (YYYY-MM)</Label>
                    <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-44" />
                  </div>
                  <Button
                    onClick={() => callApi('cloture_mensuelle', { periode })}
                    disabled={loading || !societeId}
                    style={{ backgroundColor: NAVY, color: "white" }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Lancer la clôture mensuelle
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Clôture annuelle */}
          <TabsContent value="annuelle" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Clôture exercice + RAN auto</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Solde les comptes 6/7 sur 1200, génère les écritures à-nouveau (AN) au 1er jour
                  du nouvel exercice, et affecte le résultat sur le compte 119 (Report à nouveau).
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Action irréversible côté audit</strong> — la fonction est idempotente
                    (re-run autorisé) mais génère beaucoup d'écritures. Faire en fin d'exercice
                    après contrôle balance + état financier.
                  </div>
                </div>
                <div className="flex gap-3 items-end">
                  <div>
                    <Label>Exercice</Label>
                    <Select value={exercice} onValueChange={setExercice}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2025-2026">2025-2026</SelectItem>
                        <SelectItem value="2024-2025">2024-2025</SelectItem>
                        <SelectItem value="2023-2024">2023-2024</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => callApi('cloture_exercice', { exercice })}
                    disabled={loading || !societeId}
                    style={{ backgroundColor: GOLD, color: "white" }}
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Clôturer l'exercice {exercice}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Réévaluation change */}
          <TabsContent value="change" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Réévaluation IAS 21 — fin d'exercice</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600">
                  Réévalue les soldes 411 (créances clients) et 401 (dettes fournisseurs)
                  en devise étrangère au taux de clôture. Génère les écritures équilibrées
                  666N / 766N (gains/pertes de change non réalisés).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Date de clôture</Label>
                    <Input type="date" value={dateCloture} onChange={e => setDateCloture(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Taux EUR → MUR</Label>
                    <Input type="number" step="0.0001" value={tauxEUR} onChange={e => setTauxEUR(e.target.value)} />
                  </div>
                  <div>
                    <Label>Taux USD → MUR</Label>
                    <Input type="number" step="0.0001" value={tauxUSD} onChange={e => setTauxUSD(e.target.value)} />
                  </div>
                  <div>
                    <Label>Taux GBP → MUR</Label>
                    <Input type="number" step="0.0001" value={tauxGBP} onChange={e => setTauxGBP(e.target.value)} />
                  </div>
                </div>
                <Button
                  onClick={() => callApi('reevaluation_change', {
                    date_cloture: dateCloture,
                    taux_par_devise: {
                      EUR: parseFloat(tauxEUR) || 0,
                      USD: parseFloat(tauxUSD) || 0,
                      GBP: parseFloat(tauxGBP) || 0,
                    },
                  })}
                  disabled={loading || !societeId}
                  style={{ backgroundColor: NAVY, color: "white" }}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                  Réévaluer au {dateCloture}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test dépréciation immo */}
          <TabsContent value="immo" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">IAS 36 — Test de dépréciation immobilisation</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-3">
                  À utiliser quand un indice de perte de valeur est détecté sur une immobilisation
                  (vétusté, baisse marché, sinistre…). Saisis la valeur recouvrable (juste valeur
                  − coûts de cession, OU valeur d'usage). Si elle est inférieure à la VNC, une
                  écriture de dépréciation 6816 / 291 est générée automatiquement.
                </p>
                <p className="text-xs text-gray-500">
                  Accessible aussi depuis la liste des immobilisations (bouton "Tester valeur").
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Résultats */}
        {error && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="p-4 flex gap-2 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div><strong>Erreur :</strong> {error}</div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className="border-green-300 bg-green-50">
            <CardHeader>
              <CardTitle className="text-base text-green-800 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Résultat — {result.action}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-white p-3 rounded border overflow-auto max-h-96">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPageShell>
  )
}
