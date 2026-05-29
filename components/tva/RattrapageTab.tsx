"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Loader2, Calculator, CheckCircle, AlertTriangle, Clock, History, RefreshCw,
} from "lucide-react"
import { t } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

interface Societe { id: string; nom: string }
interface Ligne {
  periode: string
  trimestre: string | null
  label: string
  type: 'mensuel' | 'trimestriel'
  record_id: string | null
  statut_declaration: string
  declaree: boolean
  en_retard: boolean
  date_limite: string
  date_declaration: string | null
  reference_mra: string | null
  tva_nette: number
  nb_factures?: number
  source_data?: string
  montant_declare_mra: number | null
  estimation: boolean
  is_rattrapage: boolean
  source_saisie: string | null
  paiements_banque?: Array<{ date: string; libelle: string; montant: number }>
  total_paye_banque?: number
}
interface Synthese {
  nb_periodes: number
  nb_declarees: number
  nb_non_declarees: number
  nb_en_retard: number
  nb_avec_donnees?: number
  total_a_regulariser: number
  penalites_estimees: number
}
interface Data {
  societe: { id: string; nom: string; frequence_tva: string; assujetti_tva: boolean }
  plage: { debut: string; fin: string }
  migration_446?: boolean
  lignes: Ligne[]
  synthese: Synthese
}

function defaultDebut() {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// Mois YYYY-MM couverts par une ligne (1 pour mensuel, 3 pour trimestriel)
function moisDeLigne(l: Ligne): string[] {
  if (l.type === 'mensuel') return [l.periode]
  const [y, m] = l.periode.split('-').map(Number)
  return [m - 2, m - 1, m].map(mm => `${y}-${String(mm).padStart(2, '0')}`)
}

export function RattrapageTab({
  societes, selectedSociete, locale,
}: {
  societes: Societe[]
  selectedSociete: string
  locale: 'fr' | 'en'
}) {
  const [debut, setDebut] = useState(defaultDebut())
  const [fin, setFin] = useState(currentMonth())
  const [allHistory, setAllHistory] = useState(true)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [calculating, setCalculating] = useState(false)
  const [progress, setProgress] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Dialog "marquer déclarées"
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dateDecl, setDateDecl] = useState(new Date().toISOString().slice(0, 10))
  const [refMra, setRefMra] = useState("")
  const [saving, setSaving] = useState(false)

  const sid = selectedSociete && selectedSociete !== "all" ? selectedSociete : ""

  const fetchData = useCallback(async () => {
    if (!sid) { setData(null); return }
    setLoading(true); setError(""); setSelected(new Set())
    try {
      const params = new URLSearchParams({ societe_id: sid, date_fin: fin })
      if (allHistory) params.set("tout", "1")
      else params.set("date_debut", debut)
      const res = await fetch(`/api/comptable/tva/rattrapage?${params.toString()}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Erreur")
      setData(d)
    } catch (e: any) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [sid, debut, fin, allHistory])

  useEffect(() => { fetchData() }, [fetchData])

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const nonDeclarees = (data?.lignes || []).filter(l => !l.declaree)
  const allNonDeclSelected = nonDeclarees.length > 0 && nonDeclarees.every(l => selected.has(l.periode))
  const toggleAll = () => {
    if (allNonDeclSelected) setSelected(new Set())
    else setSelected(new Set(nonDeclarees.map(l => l.periode)))
  }

  // Calculer toutes les périodes sélectionnées (ou toutes non déclarées) depuis les écritures
  const handleCalculer = async () => {
    if (!sid || !data) return
    const cibles = data.lignes.filter(l => !l.declaree && (selected.size === 0 || selected.has(l.periode)))
    if (cibles.length === 0) return
    // Chaque période = 1 ou 3 mois → /calculer travaille au mois
    const mois = Array.from(new Set(cibles.flatMap(moisDeLigne)))
    setCalculating(true); setError("")
    try {
      let done = 0
      for (const m of mois) {
        setProgress(`${done + 1}/${mois.length} — ${m}`)
        const res = await fetch("/api/comptable/tva/calculer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ societe_id: sid, periode: m }),
        })
        if (!res.ok) { const e = await res.json(); throw new Error(`${m}: ${e.error || "échec"}`) }
        done++
      }
      await fetchData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCalculating(false); setProgress("")
    }
  }

  // Marquer les périodes sélectionnées comme déclarées
  const handleMarquer = async () => {
    if (!sid || !data || selected.size === 0) return
    const periodes = data.lignes
      .filter(l => selected.has(l.periode))
      .map(l => ({
        periode: l.periode,
        trimestre: l.trimestre,
        type: l.type,
        date_declaration: dateDecl,
        reference_mra: refMra || undefined,
        montant_declare: l.tva_nette,
      }))
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/comptable/tva/rattrapage/marquer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: sid, statut: "declare", periodes }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Erreur")
      setDialogOpen(false); setRefMra("")
      await fetchData()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!sid) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{t('cab.tva.rat.pick_company', locale)}</p>
        </CardContent>
      </Card>
    )
  }

  const s = data?.synthese

  return (
    <div className="space-y-6">
      {/* Plage + actions */}
      <Card className="border-2" style={{ borderColor: GOLD }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base" style={{ color: NAVY }}>
            <History className="inline w-4 h-4 mr-2" style={{ color: GOLD }} />
            {t('cab.tva.rat.title', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">{t('cab.tva.rat.help', locale)}</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex rounded-lg border overflow-hidden self-end h-8">
              <button
                onClick={() => setAllHistory(true)}
                className={`px-3 text-xs font-medium ${allHistory ? "bg-[#0B0F2E] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >{t('cab.tva.rat.all_history', locale)}</button>
              <button
                onClick={() => setAllHistory(false)}
                className={`px-3 text-xs font-medium ${!allHistory ? "bg-[#0B0F2E] text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >{t('cab.tva.rat.custom_range', locale)}</button>
            </div>
            <div>
              <Label className="text-xs">{t('cab.tva.rat.from', locale)}</Label>
              <Input type="month" value={debut} max={fin} disabled={allHistory} onChange={e => setDebut(e.target.value)} className="w-40 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{t('cab.tva.rat.to', locale)}</Label>
              <Input type="month" value={fin} min={allHistory ? undefined : debut} onChange={e => setFin(e.target.value)} className="w-40 h-8 text-sm" />
            </div>
            <Button variant="outline" className="h-8 gap-2" onClick={fetchData} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t('cab.tva.rat.refresh', locale)}
            </Button>
            <Button
              className="h-8 gap-2" style={{ backgroundColor: NAVY }}
              onClick={handleCalculer}
              disabled={calculating || loading || !data || nonDeclarees.length === 0}
            >
              {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
              {calculating
                ? `${t('cab.tva.rat.computing', locale)} ${progress}`
                : selected.size > 0
                  ? `${t('cab.tva.rat.compute_selected', locale)} (${selected.size})`
                  : t('cab.tva.rat.compute_missing', locale)}
            </Button>
            <Button
              variant="outline" className="h-8 gap-2"
              onClick={() => setDialogOpen(true)}
              disabled={selected.size === 0}
            >
              <CheckCircle className="w-4 h-4" />
              {t('cab.tva.rat.mark_declared', locale)} {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
          {data && (
            <p className="text-xs text-gray-500">
              {t('cab.tva.rat.range_label', locale)} <span className="font-mono font-medium">{data.plage.debut} → {data.plage.fin}</span>
              {" · "}{data.societe.frequence_tva === 'trimestrielle' ? t('cab.tva.rat.freq_quarterly', locale) : t('cab.tva.rat.freq_monthly', locale)}
            </p>
          )}
          {data && data.migration_446 === false && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{t('cab.tva.rat.migration_warning', locale)}</AlertDescription>
            </Alert>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent>
      </Card>

      {/* Synthèse */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('cab.tva.rat.kpi_total', locale)}</p>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{s.nb_periodes}</p>
            <p className="text-xs text-gray-400">{t('cab.tva.rat.kpi_declared', locale)}: {s.nb_declarees}</p>
          </CardContent></Card>
          <Card className={s.nb_non_declarees > 0 ? "border-orange-300" : ""}><CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('cab.tva.rat.kpi_missing', locale)}</p>
            <p className="text-2xl font-bold text-orange-600">{s.nb_non_declarees}</p>
            <p className="text-xs text-gray-400">{t('cab.tva.rat.kpi_late', locale)}: {s.nb_en_retard}</p>
          </CardContent></Card>
          <Card className={s.total_a_regulariser > 0 ? "border-red-300" : ""}><CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('cab.tva.rat.kpi_to_regularize', locale)}</p>
            <p className="text-xl font-bold text-red-600">{fmt(s.total_a_regulariser)} MUR</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-gray-500">{t('cab.tva.rat.kpi_penalties', locale)}</p>
            <p className="text-xl font-bold text-orange-600">{fmt(s.penalites_estimees)} MUR</p>
            <p className="text-xs text-gray-400">{t('cab.tva.rat.kpi_estimate', locale)}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle style={{ color: NAVY }}>{t('cab.tva.rat.timeline', locale)}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} /></div>
          ) : !data || data.lignes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">{t('cab.tva.rat.empty', locale)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  <TableHead className="w-8">
                    <Checkbox checked={allNonDeclSelected} onCheckedChange={toggleAll} aria-label="all" />
                  </TableHead>
                  <TableHead>{t('cab.tva.rat.col_period', locale)}</TableHead>
                  <TableHead>{t('cab.tva.rat.col_deadline', locale)}</TableHead>
                  <TableHead className="text-right">{t('cab.tva.rat.col_net', locale)}</TableHead>
                  <TableHead>{t('cab.tva.rat.col_status', locale)}</TableHead>
                  <TableHead>{t('cab.tva.rat.col_info', locale)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lignes.map(l => (
                  <TableRow key={l.periode} className={l.en_retard ? "bg-red-50" : l.declaree ? "" : "bg-orange-50/40"}>
                    <TableCell>
                      {!l.declaree && (
                        <Checkbox checked={selected.has(l.periode)} onCheckedChange={() => toggle(l.periode)} aria-label={l.periode} />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">{l.label}</TableCell>
                    <TableCell className={`text-sm ${l.en_retard ? "text-red-600 font-semibold" : ""}`}>
                      {new Date(l.date_limite).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-mono ${l.tva_nette >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(Math.abs(l.tva_nette))}
                      {l.estimation && <span className="text-[10px] ml-1 text-gray-400">{t('cab.tva.rat.est', locale)}</span>}
                    </TableCell>
                    <TableCell>
                      {l.declaree ? (
                        <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="w-3 h-3" />{t('cab.tva.rat.st_declared', locale)}</Badge>
                      ) : l.en_retard ? (
                        <Badge className="bg-red-100 text-red-800 gap-1"><AlertTriangle className="w-3 h-3" />{t('cab.tva.rat.st_late', locale)}</Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-800 gap-1"><Clock className="w-3 h-3" />{t('cab.tva.rat.st_todo', locale)}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {l.declaree && l.date_declaration
                        ? `${t('cab.tva.rat.declared_on', locale)} ${new Date(l.date_declaration).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}${l.reference_mra ? ` · ${l.reference_mra}` : ''}`
                        : l.source_data === 'factures'
                          ? `${l.nb_factures} ${t('cab.tva.rat.src_factures', locale)}`
                          : l.source_data === 'ecritures'
                            ? t('cab.tva.rat.src_ecritures', locale)
                            : l.source_data === 'calcul'
                              ? t('cab.tva.rat.src_calcul', locale)
                              : <span className="text-gray-400">{t('cab.tva.rat.src_none', locale)}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog marquer déclarées */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cab.tva.rat.dialog_title', locale)} ({selected.size})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-500">{t('cab.tva.rat.dialog_help', locale)}</p>
            <div>
              <Label className="text-xs">{t('cab.tva.rat.dialog_date', locale)}</Label>
              <Input type="date" value={dateDecl} onChange={e => setDateDecl(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{t('cab.tva.rat.dialog_ref', locale)}</Label>
              <Input value={refMra} onChange={e => setRefMra(e.target.value)} placeholder="MRA-..." className="h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{t('cab.tva.rat.cancel', locale)}</Button>
            <Button style={{ backgroundColor: NAVY }} onClick={handleMarquer} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {t('cab.tva.rat.confirm', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
