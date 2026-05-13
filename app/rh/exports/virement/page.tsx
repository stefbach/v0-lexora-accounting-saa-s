"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Download, CreditCard, Building2, AlertTriangle, CheckCircle2, Users, FileText } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

const BANQUES_LABELS: Record<string, string> = {
  MCB: "Mauritius Commercial Bank",
  SBM: "State Bank of Mauritius",
  ABC: "ABC Banking Corporation",
  AFRASIA: "AfrAsia Bank",
  MAUBANK: "MauBank",
  BANKONE: "Bank One",
  ABSA: "ABSA / Barclays",
  SCB: "Standard Chartered",
  HSBC: "HSBC Mauritius",
  BCP: "BCP",
  BDM: "Banque des Mascareignes",
  CIM: "CIM Finance",
  AUTRE: "Autre banque",
  SANS_BANQUE: "Coordonnees manquantes",
}

const FORMAT_LABELS: Record<string, string> = {
  MCB: "Format BP-V1 (.txt) — MCB Juice Pro Business",
  SBM: "Format BizEdge (.csv) — pipe-separated",
  ABC: "Format CSV ABC Corporate",
  AFRASIA: "Format CSV AfrAsia (guillemets)",
  MAUBANK: "Format CSV MauBank",
  BANKONE: "Format CSV Bank One (date DD/MM/YYYY)",
  ABSA: "Format BatchPay ABSA",
  SCB: "Format SCMUPAY Standard Chartered",
  HSBC: "Format CSV HSBC",
  DEFAULT: "Format CSV générique",
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n)
}

export default function ExportVirementPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [compteEmetteur, setCompteEmetteur] = useState<any>(null)
  const [comptesDisponibles, setComptesDisponibles] = useState<any[]>([])
  const [compteSelectionne, setCompteSelectionne] = useState("")
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloads, setDownloads] = useState<string[]>([])

  // Charger les sociétés
  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  // Charger les comptes bancaires de la société sélectionnée
  const loadComptes = useCallback(async () => {
    if (!societe) return
    try {
      const res = await fetch(`/api/comptable/comptes-bancaires?societe_id=${societe}&devise=MUR`)
      const data = await res.json()
      const comptes = data.comptes || []
      setComptesDisponibles(comptes)

      // Auto-sélectionner le compte paie principal
      const comptePaie = comptes.find((c: any) => c.usage_paie && c.compte_principal)
        || comptes.find((c: any) => c.usage_paie)
        || comptes.find((c: any) => c.compte_principal && c.devise === 'MUR')
        || comptes[0]

      if (comptePaie) {
        setCompteSelectionne(comptePaie.id)
        setCompteEmetteur(comptePaie)
      } else {
        setCompteEmetteur(null)
        setCompteSelectionne("")
      }
    } catch (e) { console.error(e) }
  }, [societe])

  useEffect(() => { loadComptes() }, [loadComptes])

  // Mettre à jour compte émetteur quand on change la sélection
  useEffect(() => {
    const c = comptesDisponibles.find(c => c.id === compteSelectionne)
    if (c) setCompteEmetteur(c)
  }, [compteSelectionne, comptesDisponibles])

  // Aperçu — charger le récap des bénéficiaires par banque
  const chargerPreview = useCallback(async () => {
    if (!societe || !periode) return
    setLoadingPreview(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          periode,
          compte_emetteur_id: compteSelectionne || undefined,
          format: "json",  // aperçu sans téléchargement
          preview_only: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPreview(data.recap)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors du chargement de l'aperçu")
      setPreview(null)
    } finally { setLoadingPreview(false) }
  }, [societe, periode, compteSelectionne])

  useEffect(() => {
    if (societe && periode) chargerPreview()
  }, [chargerPreview])

  // Télécharger UN fichier pour une banque bénéficiaire spécifique
  const telechargerBanque = async (banqueCode: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          periode,
          compte_emetteur_id: compteSelectionne || undefined,
          format: "single",
          banque_filter: banqueCode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const isTxt = data.filename?.endsWith('.txt')
      const blob = new Blob([data.content], { type: isTxt ? "text/plain;charset=utf-8" : "text/csv;charset=utf-8" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = data.filename
      a.click()
      setDownloads(prev => [...prev, banqueCode])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur téléchargement")
    } finally { setLoading(false) }
  }

  // Télécharger TOUS les fichiers
  const telechargerTous = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societe,
          periode,
          compte_emetteur_id: compteSelectionne || undefined,
          format: "json",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Télécharger chaque fichier
      for (const fichier of data.fichiers || []) {
        const isTxt = fichier.filename?.endsWith('.txt')
        const blob = new Blob([fichier.content], { type: isTxt ? "text/plain" : "text/csv" })
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = fichier.filename
        a.click()
        await new Promise(r => setTimeout(r, 300)) // pause entre téléchargements
      }
      setDownloads(data.fichiers?.map((f: any) => f.banque) || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur téléchargement")
    } finally { setLoading(false) }
  }

  const banqueEmettrice = compteEmetteur?.bank_code || compteEmetteur?.banque?.toUpperCase().slice(0, 3) || "?"
  const formatFichier = FORMAT_LABELS[banqueEmettrice] || FORMAT_LABELS["DEFAULT"]

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('rha.b.virement.title', locale)}</h1>
        <p className="text-sm text-gray-500">{t('rha.b.virement.subtitle', locale)}</p>
      </div>

      {/* Paramètres */}
      <Card>
        <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base"><CreditCard className="w-4 h-4"/>Paramètres</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Société *</Label>
              <Select value={societe} onValueChange={v => { setSociete(v); setPreview(null); setDownloads([]) }}>
                <SelectTrigger><SelectValue placeholder="Choisir une société"/></SelectTrigger>
                <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Période (mois)</Label>
              <Input type="month" value={periode} onChange={e => { setPeriode(e.target.value); setPreview(null); setDownloads([]) }}/>
            </div>
          </div>

          {/* Compte émetteur — auto-détecté */}
          {societe && (
            <div className="space-y-2">
              <Label>Compte bancaire émetteur (débiteur)</Label>
              {comptesDisponibles.length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
                  <AlertTriangle className="w-4 h-4 shrink-0"/>
                  Aucun compte bancaire MUR configuré pour cette société.
                  <a href="/comptable/banque" className="underline ml-1">Ajouter un compte →</a>
                </div>
              ) : (
                <Select value={compteSelectionne} onValueChange={setCompteSelectionne}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner le compte débiteur"/>
                  </SelectTrigger>
                  <SelectContent>
                    {comptesDisponibles.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.banque} — {c.numero_compte || c.nom_compte}
                        {c.usage_paie && " (Paie)"}
                        {c.compte_principal && " (Principal)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Infos compte sélectionné */}
              {compteEmetteur && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <Building2 className="w-5 h-5 text-blue-600 shrink-0"/>
                  <div className="flex-1 text-sm">
                    <span className="font-semibold text-blue-800">{compteEmetteur.banque}</span>
                    <span className="text-blue-600 ml-2">N° {compteEmetteur.numero_compte}</span>
                    {compteEmetteur.iban && <span className="text-blue-500 ml-2 text-xs">IBAN: {compteEmetteur.iban}</span>}
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                    {formatFichier}
                  </Badge>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Erreur */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0"/>{error}
        </div>
      )}

      {/* Aperçu par banque bénéficiaire */}
      {loadingPreview && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin"/>Chargement de l'aperçu...
        </div>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
                <Users className="w-4 h-4"/>
                Récapitulatif — {preview.nb_bulletins_total} bulletins validés
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  Total MUR : <strong>{fmt(preview.montant_total_mur || 0)}</strong>
                  {preview.montant_total_eur > 0 && <> + EUR : <strong>{preview.montant_total_eur?.toFixed(2)}</strong></>}
                </span>
                <Button
                  onClick={telechargerTous}
                  disabled={loading || !compteEmetteur}
                  className="bg-[#0B0F2E] text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : <Download className="w-4 h-4 mr-2"/>}
                  Tout télécharger
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banque bénéficiaire</TableHead>
                  <TableHead className="text-center">Employés</TableHead>
                  <TableHead className="text-right">Montant total</TableHead>
                  <TableHead>Format fichier</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(preview.fichiers || []).map((f: any) => {
                  const isDone = downloads.includes(f.banque)
                  const isWarning = f.banque === "SANS_BANQUE"
                  return (
                    <TableRow key={f.banque} className={isWarning ? "bg-orange-50" : ""}>
                      <TableCell>
                        <div className="font-medium">
                          {isWarning
                            ? <span className="text-orange-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>{BANQUES_LABELS[f.banque] || f.banque}</span>
                            : BANQUES_LABELS[f.banque] || f.banque
                          }
                        </div>
                        {f.devise && f.devise !== 'MUR' && <Badge className="text-xs bg-blue-100 text-blue-700 border-0 mt-1">{f.devise}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm">{f.nb_employes}</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmt(f.montant_total)}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {/* Format dépend de la banque ÉMETTRICE, pas bénéficiaire */}
                        {banqueEmettrice === 'MCB'
                          ? (f.banque === 'SANS_BANQUE' ? 'CSV liste' : 'MCB BP-V1 .txt (inclus)')
                          : (FORMAT_LABELS[f.banque] || FORMAT_LABELS['DEFAULT'])
                        }
                      </TableCell>
                      <TableCell className="text-center">
                        {isDone ? (
                          <span className="flex items-center justify-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="w-4 h-4"/>Téléchargé
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => telechargerBanque(f.banque)}
                            disabled={loading || !compteEmetteur || (banqueEmettrice === 'MCB' && f.banque !== 'SANS_BANQUE')}
                            title={banqueEmettrice === 'MCB' ? "MCB génère un seul fichier BP-V1 — utiliser 'Tout télécharger'" : ""}
                          >
                            <Download className="w-3 h-3 mr-1"/>
                            {banqueEmettrice === 'MCB' && f.banque !== 'SANS_BANQUE' ? 'Via BP-V1' : 'Télécharger'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* Note format MCB */}
            {banqueEmettrice === 'MCB' && (
              <div className="p-4 bg-blue-50 border-t text-xs text-blue-700 flex items-start gap-2">
                <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Banque émettrice MCB :</strong> Le format BP-V1 MCB regroupe tous les bénéficiaires dans un seul fichier <code>.txt</code>.
                  Les virements MCB→MCB sont en lignes <code>1</code>, les virements vers d'autres banques en lignes <code>2</code> (avec code banque MCB).
                  Utilisez <strong>"Tout télécharger"</strong> pour obtenir le fichier unique à uploader sur MCB Juice Pro Business.
                </div>
              </div>
            )}

            {/* Avertissement employés sans banque */}
            {preview.nb_employes_sans_banque > 0 && (
              <div className="p-4 bg-orange-50 border-t text-sm text-orange-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0"/>
                <strong>{preview.nb_employes_sans_banque} employé(s)</strong> n'ont pas de coordonnées bancaires renseignées.
                <a href="/rh/employes" className="underline ml-1">Compléter les fiches employés →</a>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Si pas encore de société sélectionnée */}
      {!societe && (
        <div className="text-center py-16 text-gray-400">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300"/>
          <p className="text-sm">Sélectionnez une société et une période pour générer les fichiers de virement</p>
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
