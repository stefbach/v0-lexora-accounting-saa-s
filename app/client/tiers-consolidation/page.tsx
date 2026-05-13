"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Merge, Loader2, AlertCircle, CheckCircle2, X, Edit2 } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

interface TiersInfo {
  raw: string
  normalized: string
  sources: Array<{ kind: 'facture' | 'cca'; type?: string; count: number; total?: number }>
}

interface ConsolidationGroup {
  key: string
  canonical: string
  variants: TiersInfo[]
  similarities: number[]
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TiersConsolidationPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [groups, setGroups] = useState<ConsolidationGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [merging, setMerging] = useState<Set<string>>(new Set())
  const [minSim, setMinSim] = useState(0.65)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [editedCanonical, setEditedCanonical] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const scan = async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/tiers/consolidation?societe_id=${societeId}&min_similarity=${minSim}`)
      const d = await res.json()
      if (res.ok) {
        setGroups(d.groups || [])
        setEditedCanonical({})
        setToast({ type: 'success', message: `${d.total_groups} groupes de variantes detectes sur ${d.total_tiers_scanned} tiers` })
      } else {
        setToast({ type: 'error', message: d.error || 'Erreur' })
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (societeId) scan()
  }, [societeId])

  const consolidate = async (g: ConsolidationGroup) => {
    if (!societeId) return
    const canonical = editedCanonical[g.key] || g.canonical
    if (!window.confirm(
      `Consolider ${g.variants.length} variantes en "${canonical}" ?\n\n` +
      `Variantes :\n${g.variants.map(v => '  • ' + v.raw).join('\n')}\n\n` +
      `Toutes les factures et comptes courants concernes seront renommes.\n` +
      `Les soldes CCA seront additionnes. Action IRREVERSIBLE.`
    )) return
    setMerging(prev => new Set([...prev, g.key]))
    try {
      const res = await fetch("/api/comptable/tiers/consolidation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          canonical_name: canonical,
          variants: g.variants.map(v => v.raw),
        }),
      })
      const d = await res.json()
      if (res.ok) {
        setToast({
          type: 'success',
          message: `✓ ${d.factures_renamed} factures renommees, ${d.cca_merged} CCA fusionnes (${d.mouvements_migrated} mvts migres)`,
        })
        await scan()
      } else {
        setToast({ type: 'error', message: d.error })
      }
    } catch (e: any) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setMerging(prev => { const n = new Set(prev); n.delete(g.key); return n })
    }
  }

  return (
    <div className="p-6 space-y-4">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-white max-w-md ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span className="text-sm">{toast.message}</span>
          <button onClick={() => setToast(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E] flex items-center gap-2">
          <Users className="w-6 h-6" /> {t('acc.tiers.title', locale)}
        </h1>
        <p className="text-sm text-gray-500">
          {t('acc.tiers.subtitle', locale)}
        </p>
      </div>

      <Card>
        <CardContent className="p-3 flex items-end gap-2 flex-wrap">
          <div>
            <label className="text-xs">{t('acc.tiers.sensitivity', locale)}</label>
            <Input
              type="number"
              min={0.4}
              max={1}
              step={0.05}
              value={minSim}
              onChange={e => setMinSim(parseFloat(e.target.value) || 0.65)}
              className="w-32 h-8"
            />
          </div>
          <Button onClick={scan} disabled={loading} className="bg-[#0B0F2E] text-white h-8">
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Users className="w-4 h-4 mr-1" />}
            {t('acc.tiers.scan', locale)}
          </Button>
          <div className="ml-auto text-sm text-slate-500">
            {groups.length > 0 && `${groups.length} ${t('acc.tiers.groups_detected', locale)}`}
          </div>
        </CardContent>
      </Card>

      {groups.length === 0 && !loading && (
        <Card>
          <CardContent className="p-6 text-center text-slate-500 text-sm">
            {t('acc.tiers.no_variant', locale)}
          </CardContent>
        </Card>
      )}

      {groups.map(g => {
        const isMerging = merging.has(g.key)
        const current = editedCanonical[g.key] ?? g.canonical
        const totalFactures = g.variants.reduce((s, v) =>
          s + v.sources.filter(x => x.kind === 'facture').reduce((a, b) => a + b.count, 0), 0
        )
        const totalCca = g.variants.reduce((s, v) =>
          s + v.sources.filter(x => x.kind === 'cca').reduce((a, b) => a + b.count, 0), 0
        )
        return (
          <Card key={g.key} className="border-amber-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                <Merge className="w-4 h-4 text-amber-600" />
                <span>{t('acc.tiers.group', locale)} {g.key.substring(0, 40)}</span>
                <Badge variant="outline" className="text-[10px]">{g.variants.length} {t('acc.tiers.variants', locale)}</Badge>
                {totalFactures > 0 && <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">{totalFactures} {t('acc.tiers.invoices_lc', locale)}</Badge>}
                {totalCca > 0 && <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px]">{totalCca} CCA</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded p-2">
                <Edit2 className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs font-medium shrink-0">{t('acc.tiers.canonical_name', locale)} :</span>
                <Input
                  value={current}
                  onChange={e => setEditedCanonical({ ...editedCanonical, [g.key]: e.target.value })}
                  className="h-7 text-sm flex-1"
                />
                <Button
                  size="sm"
                  className="h-7 bg-amber-600 text-white hover:bg-amber-700"
                  onClick={() => consolidate(g)}
                  disabled={isMerging || !current.trim()}
                >
                  {isMerging ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Merge className="w-3 h-3 mr-1" />}
                  {t('acc.tiers.consolidate', locale)} {g.variants.length} {t('acc.tiers.variants', locale)}
                </Button>
              </div>

              <div className="space-y-1">
                {g.variants.map((v, i) => {
                  const isCanonical = v.raw === current
                  return (
                    <div
                      key={v.raw}
                      className={`flex items-center gap-2 p-2 rounded text-sm ${isCanonical ? 'bg-emerald-50 border border-emerald-300' : 'bg-slate-50 border border-slate-200'}`}
                    >
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        sim {(g.similarities[i] * 100).toFixed(0)}%
                      </Badge>
                      <span className={`flex-1 ${isCanonical ? 'font-bold text-emerald-700' : ''}`}>{v.raw}</span>
                      <div className="flex gap-1 text-xs">
                        {v.sources.map((s, j) => (
                          <Badge
                            key={j}
                            className={`text-[10px] border-0 ${
                              s.kind === 'cca' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {s.kind === 'cca' ? 'CCA' : `${t('acc.tiers.invoice', locale)} ${s.type || ''}`} · {s.count}
                            {s.total !== undefined ? ` · ${fmt(s.total)} MUR` : ''}
                          </Badge>
                        ))}
                      </div>
                      {!isCanonical && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px]"
                          onClick={() => setEditedCanonical({ ...editedCanonical, [g.key]: v.raw })}
                        >
                          {t('acc.tiers.use_as_canonical', locale)}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
