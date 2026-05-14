"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { RefreshCw, Loader2, Plus, TrendingUp, Globe2, AlertCircle, CheckCircle2 } from "lucide-react"
import { t, getLocale, type Locale } from '@/lib/i18n'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

function formatTaux(taux: number) {
  return taux.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

const DEVISE_LABELS: Record<string, string> = {
  EUR: "Euro",
  GBP: "Livre sterling",
  USD: "Dollar US",
  ZAR: "Rand sud-africain",
  CNY: "Yuan chinois",
  AED: "Dirham UAE",
  INR: "Roupie indienne",
  SGD: "Dollar singapourien",
  JPY: "Yen japonais",
  CHF: "Franc suisse",
  CAD: "Dollar canadien",
  AUD: "Dollar australien",
  KES: "Shilling kenyan",
  MGA: "Ariary malgache",
}

const DEVISE_FLAGS: Record<string, string> = {
  EUR: "🇪🇺", GBP: "🇬🇧", USD: "🇺🇸", ZAR: "🇿🇦",
  CNY: "🇨🇳", AED: "🇦🇪", INR: "🇮🇳", SGD: "🇸🇬",
  JPY: "🇯🇵", CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺",
  KES: "🇰🇪", MGA: "🇲🇬",
}

function getSourceBadge(source: string) {
  if (source === "exchangerate-api") {
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">{t('acc.tc.auto_api', getLocale())}</Badge>
  }
  if (source === "manual") {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">{t('acc.tc.manual_entry', getLocale())}</Badge>
  }
  return <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-xs">{source || "—"}</Badge>
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TauxChangePage() {
  const locale = getLocale()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedDevise, setSelectedDevise] = useState<string>("EUR")

  // Manual entry form
  const [manualDevise, setManualDevise] = useState("EUR")
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0])
  const [manualTaux, setManualTaux] = useState("")

  // History filter
  const [historyDevise, setHistoryDevise] = useState("EUR")

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/comptable/taux-change")
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e.message || "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Clear notifications after 5s
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t) }
  }, [success])
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(null), 8000); return () => clearTimeout(t) }
  }, [error])

  const handleUpdateFromAPI = async () => {
    try {
      setUpdating(true)
      setError(null)
      const res = await fetch("/api/comptable/taux-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_from_api" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`)
      setSuccess(json.message || "Taux mis à jour avec succès")
      await fetchData()
    } catch (e: any) {
      setError(e.message || "Erreur mise à jour API")
    } finally {
      setUpdating(false)
    }
  }

  const handleManualEntry = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualTaux || !manualDate || !manualDevise) return
    try {
      setSaving(true)
      setError(null)
      const res = await fetch("/api/comptable/taux-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manual_entry",
          devise: manualDevise,
          date_taux: manualDate,
          taux: Number(manualTaux),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`)
      setSuccess(json.message || "Taux enregistré")
      setManualTaux("")
      await fetchData()
    } catch (e: any) {
      setError(e.message || "Erreur enregistrement")
    } finally {
      setSaving(false)
    }
  }

  const currentRates = data?.current || {}
  const historyByDevise = data?.history || {}
  const devises = Object.keys(currentRates).sort()
  const historyRows: any[] = historyByDevise[historyDevise] || []

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-blue-600" />
            {t('acc.tc.title', locale)}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('acc.tc.subtitle', locale)}
          </p>
        </div>
        <Button
          onClick={handleUpdateFromAPI}
          disabled={updating}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {updating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {t('acc.tc.update_from_bom', locale)}
        </Button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Tableau taux actuels */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            {t('acc.tc.current_rates', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : devises.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {t('acc.tc.no_rates', locale)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-24">{t('acc.tc.currency', locale)}</TableHead>
                  <TableHead>{t('acc.tc.name', locale)}</TableHead>
                  <TableHead className="text-right">{t('acc.tc.rate_mur', locale)}</TableHead>
                  <TableHead>{t('common.date', locale)}</TableHead>
                  <TableHead>{t('acc.tc.source', locale)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devises.map(devise => {
                  const r = currentRates[devise]
                  return (
                    <TableRow key={devise} className="hover:bg-gray-50">
                      <TableCell>
                        <span className="font-mono font-semibold text-gray-900">
                          {DEVISE_FLAGS[devise] || "🏳"} {devise}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-600 text-sm">
                        {DEVISE_LABELS[devise] || devise}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium text-gray-900">
                        {formatTaux(Number(r?.taux || 0))}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {formatDate(r?.date_taux || "")}
                      </TableCell>
                      <TableCell>
                        {getSourceBadge(r?.source || "")}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Saisie manuelle */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              {t('acc.tc.enter_historical', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleManualEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('acc.tc.currency', locale)}</label>
                <Select value={manualDevise} onValueChange={setManualDevise}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('acc.tc.choose_currency', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEVISE_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {DEVISE_FLAGS[code] || "🏳"} {code} — {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('acc.tc.date_of_rate', locale)}</label>
                <Input
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('acc.tc.rate', locale)} (1 {manualDevise} = ? MUR)
                </label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={manualTaux}
                  onChange={e => setManualTaux(e.target.value)}
                  placeholder="ex: 46.5000"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={saving || !manualTaux}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                {t('acc.tc.save_rate', locale)}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Historique */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">{t('acc.tc.history', locale)}</CardTitle>
              <Select value={historyDevise} onValueChange={setHistoryDevise}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DEVISE_LABELS).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {DEVISE_FLAGS[code] || "🏳"} {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : historyRows.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm px-4">
                {t('acc.tc.no_history', locale)} {historyDevise}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead>{t('common.date', locale)}</TableHead>
                    <TableHead className="text-right">{t('acc.tc.rate_mur', locale)}</TableHead>
                    <TableHead>{t('acc.tc.source', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((row: any, i: number) => (
                    <TableRow key={i} className="hover:bg-gray-50">
                      <TableCell className="text-sm text-gray-700 font-medium">
                        {formatDate(row.date_taux)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatTaux(Number(row.taux))}
                      </TableCell>
                      <TableCell>
                        {getSourceBadge(row.source)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Note de conformité MRA */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        {t('acc.tc.mra_note', locale)}
      </div>
    </div>
  )
}
