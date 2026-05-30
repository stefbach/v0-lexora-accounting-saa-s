"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Loader2, RefreshCw, Plus, Trash2, Save, CheckCircle, AlertTriangle, Sparkles, History, Calculator,
} from "lucide-react"
import { t } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

interface Societe { id: string; nom: string }

interface FactureOubliee {
  id: string; numero: string; tiers: string; type: string; montant_tva: number; date_facture: string
}
interface Detectee {
  periode_origine: string
  tva_recalculee: number
  montant_declare_mra: number
  ecart: number
  source: 'recalcul' | 'estimation'
  libelle: string
  factures_oubliees: FactureOubliee[]
}
interface Ligne {
  key: string
  periode_origine: string | null
  libelle: string
  montant: number
  sens: 'collectee' | 'deductible' | 'net'
  type: 'ecart_auto' | 'manuel'
  facture_id: string | null
  motif: string | null
  statut: 'proposee' | 'incluse' | 'ignoree'
}
interface Data {
  societe: { id: string; nom: string }
  periode: string
  migration_452: boolean
  nb_periodes_figees: number
  periodes_figees: string[]
  detectees: Detectee[]
  lignes: Array<Omit<Ligne, 'key'>>
  total_inclus: number
}

let _k = 0
const nextKey = () => `l${++_k}`

export function RegularisationsTab({
  societes, selectedSociete, locale,
}: {
  societes: Societe[]
  selectedSociete: string
  locale: 'fr' | 'en'
}) {
  const [periode, setPeriode] = useState(currentMonth())
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [recalcing, setRecalcing] = useState(false)
  const [recalcProgress, setRecalcProgress] = useState("")

  const sid = selectedSociete && selectedSociete !== "all" ? selectedSociete : ""

  const fetchData = useCallback(async () => {
    if (!sid) { setData(null); setLignes([]); return }
    setLoading(true); setError(""); setSaved(false)
    try {
      const res = await fetch(`/api/comptable/tva/regularisations?societe_id=${sid}&periode=${periode}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Erreur")
      setData(d)
      setLignes((d.lignes || []).map((l: any) => ({ ...l, key: nextKey() })))
    } catch (e: any) {
      setError(e.message); setData(null)
    } finally {
      setLoading(false)
    }
  }, [sid, periode])

  useEffect(() => { fetchData() }, [fetchData])

  const addDetected = (d: Detectee) => {
    setSaved(false)
    setLignes(prev => [...prev, {
      key: nextKey(),
      periode_origine: d.periode_origine,
      libelle: d.libelle,
      montant: d.ecart,
      sens: 'net',
      type: 'ecart_auto',
      facture_id: null,
      motif: null,
      statut: 'incluse',
    }])
  }
  const addManual = () => {
    setSaved(false)
    setLignes(prev => [...prev, {
      key: nextKey(),
      periode_origine: null,
      libelle: "",
      montant: 0,
      sens: 'net',
      type: 'manuel',
      facture_id: null,
      motif: null,
      statut: 'incluse',
    }])
  }
  const update = (key: string, patch: Partial<Ligne>) => {
    setSaved(false)
    setLignes(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }
  const remove = (key: string) => {
    setSaved(false)
    setLignes(prev => prev.filter(l => l.key !== key))
  }

  const alreadyAdded = (po: string) => lignes.some(l => l.type === 'ecart_auto' && l.periode_origine === po)
  const total = lignes
    .filter(l => l.statut === 'incluse')
    .reduce((s, l) => s + (Number(l.montant) || 0), 0)

  // Recalcule les périodes figées depuis les écritures (peuple tva_nette_recalculee)
  // pour obtenir des écarts basés sur le vrai recalcul plutôt qu'une estimation.
  const handleRecalc = async () => {
    if (!sid || !data || data.periodes_figees.length === 0) return
    setRecalcing(true); setError("")
    try {
      let done = 0
      for (const m of data.periodes_figees) {
        setRecalcProgress(`${done + 1}/${data.periodes_figees.length} — ${m}`)
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
      setRecalcing(false); setRecalcProgress("")
    }
  }

  const handleSave = async () => {
    if (!sid) return
    setSaving(true); setError(""); setSaved(false)
    try {
      const res = await fetch("/api/comptable/tva/regularisations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: sid,
          periode,
          lignes: lignes.map(({ key, ...rest }) => rest),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Erreur")
      setSaved(true)
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
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{t('cab.tva.regul.pick_company', locale)}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* En-tête + période */}
      <Card className="border-2" style={{ borderColor: GOLD }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base" style={{ color: NAVY }}>
            <Sparkles className="inline w-4 h-4 mr-2" style={{ color: GOLD }} />
            {t('cab.tva.regul.title', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">{t('cab.tva.regul.help', locale)}</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">{t('cab.tva.regul.period_label', locale)}</Label>
              <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-40 h-8 text-sm" />
            </div>
            <Button variant="outline" className="h-8 gap-2" onClick={fetchData} disabled={loading || recalcing}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t('cab.tva.regul.refresh', locale)}
            </Button>
            <Button
              variant="outline" className="h-8 gap-2"
              onClick={handleRecalc}
              disabled={recalcing || loading || !data || data.periodes_figees.length === 0}
            >
              {recalcing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
              {recalcing
                ? `${t('cab.tva.regul.recalc_running', locale)} ${recalcProgress}`
                : t('cab.tva.regul.recalc', locale)}
            </Button>
          </div>
          <Alert>
            <History className="h-4 w-4" />
            <AlertDescription className="text-xs">{t('cab.tva.regul.note', locale)}</AlertDescription>
          </Alert>
          {data && data.migration_452 === false && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{t('cab.tva.regul.migration_warning', locale)}</AlertDescription>
            </Alert>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {saved && (
            <Alert className="border-green-300 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-xs text-green-700">{t('cab.tva.regul.saved', locale)}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Détectées automatiquement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm" style={{ color: NAVY }}>
            {t('cab.tva.regul.detected_title', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: NAVY }} /></div>
          ) : !data || data.detectees.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 py-6">{t('cab.tva.regul.detected_empty', locale)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  <TableHead>{t('cab.tva.regul.col_origin', locale)}</TableHead>
                  <TableHead className="text-right">{t('cab.tva.regul.col_declared', locale)}</TableHead>
                  <TableHead className="text-right">{t('cab.tva.regul.col_recomputed', locale)}</TableHead>
                  <TableHead className="text-right">{t('cab.tva.regul.col_ecart', locale)}</TableHead>
                  <TableHead>{t('cab.tva.regul.factures_oubliees', locale)}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.detectees.map(d => (
                  <TableRow key={d.periode_origine}>
                    <TableCell className="font-mono text-sm font-medium">
                      {d.periode_origine}
                      <Badge
                        variant="outline"
                        className={`ml-2 text-[9px] ${d.source === 'recalcul' ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}`}
                      >
                        {d.source === 'recalcul' ? t('cab.tva.regul.source_recalcul', locale) : t('cab.tva.regul.source_estimation', locale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">{fmt(d.montant_declare_mra)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{fmt(d.tva_recalculee)}</TableCell>
                    <TableCell className={`text-right text-sm font-mono font-bold ${d.ecart >= 0 ? "text-red-600" : "text-green-600"}`}>
                      {d.ecart >= 0 ? "+" : ""}{fmt(d.ecart)}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500 max-w-[280px]">
                      {d.factures_oubliees.length === 0
                        ? <span className="text-gray-400">—</span>
                        : d.factures_oubliees.map(f => `${f.numero} (${f.tiers}, ${fmt(f.montant_tva)})`).join(", ")}
                    </TableCell>
                    <TableCell className="text-right">
                      {alreadyAdded(d.periode_origine) ? (
                        <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="w-3 h-3" />{t('cab.tva.regul.added', locale)}</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={() => addDetected(d)}>
                          <Plus className="w-3 h-3" />{t('cab.tva.regul.add_detected', locale)}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Lignes de régularisation (éditables) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm" style={{ color: NAVY }}>{t('cab.tva.regul.manual_title', locale)}</CardTitle>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addManual}>
            <Plus className="w-3 h-3" />{t('cab.tva.regul.add_manual', locale)}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {lignes.length === 0 ? (
            <p className="text-sm text-gray-500 px-6 py-6">{t('cab.tva.regul.empty_lines', locale)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 text-xs">
                  <TableHead>{t('cab.tva.regul.col_origin', locale)}</TableHead>
                  <TableHead>{t('cab.tva.regul.col_label', locale)}</TableHead>
                  <TableHead>{t('cab.tva.regul.col_type', locale)}</TableHead>
                  <TableHead className="text-right">{t('cab.tva.regul.col_amount', locale)}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lignes.map(l => (
                  <TableRow key={l.key}>
                    <TableCell className="w-28">
                      <Input
                        type="month"
                        value={l.periode_origine || ""}
                        onChange={e => update(l.key, { periode_origine: e.target.value || null })}
                        className="h-7 text-xs w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.libelle}
                        placeholder={t('cab.tva.regul.placeholder_label', locale)}
                        onChange={e => update(l.key, { libelle: e.target.value })}
                        className="h-7 text-xs min-w-[220px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {l.type === 'ecart_auto' ? t('cab.tva.regul.type_auto', locale) : t('cab.tva.regul.type_manual', locale)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right w-36">
                      <Input
                        type="number"
                        step="0.01"
                        value={Number.isFinite(l.montant) ? l.montant : 0}
                        onChange={e => update(l.key, { montant: parseFloat(e.target.value) || 0 })}
                        className={`h-7 text-xs text-right font-mono w-32 ${l.montant >= 0 ? "text-red-600" : "text-green-600"}`}
                      />
                    </TableCell>
                    <TableCell className="text-right w-10">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" onClick={() => remove(l.key)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total */}
                <TableRow className="bg-gray-100 font-bold border-t-2">
                  <TableCell colSpan={3}>{t('cab.tva.regul.total', locale)}</TableCell>
                  <TableCell className={`text-right font-mono ${total >= 0 ? "text-red-600" : "text-green-600"}`}>
                    {total >= 0 ? "+" : ""}{fmt(total)} MUR
                    <span className="ml-1 text-[10px] font-normal text-gray-500">
                      {total >= 0 ? t('cab.tva.regul.sign_pay', locale) : t('cab.tva.regul.sign_credit', locale)}
                    </span>
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Enregistrer */}
      <div className="flex justify-end">
        <Button style={{ backgroundColor: NAVY }} className="gap-2" onClick={handleSave} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('cab.tva.regul.saving', locale) : t('cab.tva.regul.save', locale)}
        </Button>
      </div>
    </div>
  )
}
