"use client"

/**
 * Page /client/virements — préparation de virements bancaires.
 *
 * Première version minimale :
 *  - Form de préparation (interne entre comptes société, externe vers tiers)
 *  - Liste des virements préparés / effectués / historique (Tabs)
 *  - Génération d'un fichier MCB BP-V1 (texte) téléchargeable côté client
 *    — pas d'intégration bancaire réelle dans cette PR
 *
 * Endpoint : /api/client/virements (GET liste, POST create).
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  ArrowRightLeft,
  Send,
  FileDown,
  Loader2,
  Plus,
} from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale } from "@/lib/i18n"

interface CompteBancaire {
  id: string
  banque: string
  nom_compte: string | null
  numero_compte: string | null
  iban: string | null
  devise: string
}

interface Virement {
  id: string
  societe_id: string
  compte_source_id: string | null
  compte_destination_id: string | null
  tiers_destination: string | null
  iban_destination: string | null
  montant: number
  devise: string
  libelle: string | null
  date_execution: string | null
  mode: 'interne' | 'externe'
  statut: 'a_effectuer' | 'effectue' | 'annule'
  created_at: string
}

function fmt(n: number, dev = "MUR") {
  return (
    n.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    dev
  )
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fr-FR")
  } catch {
    return d
  }
}

/**
 * Génère un fichier au format simple MCB BP-V1 (Pipe-delimited).
 * Format minimal pour la PR : 1 ligne par virement.
 * Header : VERSION|DATE|NB
 * Ligne  : SRC_IBAN|DST_IBAN_OR_TIERS|MONTANT|DEVISE|LIBELLE|DATE_EXEC
 */
function buildMcbBpV1(virs: Virement[], comptes: CompteBancaire[]): string {
  const lines: string[] = []
  lines.push(`MCB-BP-V1|${new Date().toISOString().slice(0, 10)}|${virs.length}`)
  for (const v of virs) {
    const src = comptes.find((c) => c.id === v.compte_source_id)
    const dst = comptes.find((c) => c.id === v.compte_destination_id)
    const srcIban = src?.iban || src?.numero_compte || ""
    const dstId = v.iban_destination || dst?.iban || dst?.numero_compte || v.tiers_destination || ""
    lines.push(
      [
        srcIban,
        dstId,
        v.montant.toFixed(2),
        v.devise,
        (v.libelle || "").replace(/\|/g, " "),
        v.date_execution || "",
      ].join("|")
    )
  }
  return lines.join("\n")
}

export default function ClientVirementsPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<CompteBancaire[]>([])
  const [virements, setVirements] = useState<Virement[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Form state
  const [mode, setMode] = useState<'interne' | 'externe'>('externe')
  const [compteSource, setCompteSource] = useState<string>("")
  const [compteDest, setCompteDest] = useState<string>("")
  const [tiersDest, setTiersDest] = useState<string>("")
  const [ibanDest, setIbanDest] = useState<string>("")
  const [montant, setMontant] = useState<string>("")
  const [devise, setDevise] = useState<string>("MUR")
  const [libelle, setLibelle] = useState<string>("")
  const [dateExec, setDateExec] = useState<string>("")

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    setError(null)
    try {
      const [resComptes, resVirs] = await Promise.all([
        fetch(`/api/client/comptes-bancaires?societe_id=${societeId}`, {
          cache: "no-store",
        }),
        fetch(`/api/client/virements?societe_id=${societeId}`, {
          cache: "no-store",
        }),
      ])
      const dComptes = await resComptes.json()
      const dVirs = await resVirs.json()
      setComptes(Array.isArray(dComptes.comptes) ? dComptes.comptes : [])
      setVirements(Array.isArray(dVirs.virements) ? dVirs.virements : [])
    } catch (e: any) {
      setError(e?.message || t('scp.vir_err_loading', locale))
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setCompteSource("")
    setCompteDest("")
    setTiersDest("")
    setIbanDest("")
    setMontant("")
    setLibelle("")
    setDateExec("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!societeId) return
    setSubmitting(true)
    try {
      const payload: any = {
        societe_id: societeId,
        mode,
        compte_source_id: compteSource,
        montant: Number(montant),
        devise,
        libelle,
        date_execution: dateExec || null,
      }
      if (mode === 'interne') {
        payload.compte_destination_id = compteDest
      } else {
        payload.tiers_destination = tiersDest
        payload.iban_destination = ibanDest
      }
      const res = await fetch('/api/client/virements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d?.error || t('scp.vir_err_status', locale).replace('{status}', String(res.status)))
      } else {
        setInfo(d?._stub ? t('scp.vir_prepared_stub', locale) : t('scp.vir_prepared', locale))
        resetForm()
        await load()
      }
    } catch (e: any) {
      setError(e?.message || t('scp.vir_unknown_error', locale))
    } finally {
      setSubmitting(false)
    }
  }

  const aEffectuer = useMemo(
    () => virements.filter((v) => v.statut === 'a_effectuer'),
    [virements]
  )
  const effectues = useMemo(
    () => virements.filter((v) => v.statut === 'effectue'),
    [virements]
  )

  const handleDownloadFile = () => {
    if (aEffectuer.length === 0) return
    const text = buildMcbBpV1(aEffectuer, comptes)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `virements_${new Date().toISOString().slice(0, 10)}.mcb`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderList = (list: Virement[]) => {
    if (list.length === 0) {
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('scp.vir_empty', locale)}
        </p>
      )
    }
    return (
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2 font-medium">{t('scp.vir_col_date', locale)}</th>
              <th className="text-left p-2 font-medium">{t('scp.vir_col_mode', locale)}</th>
              <th className="text-left p-2 font-medium">{t('scp.vir_col_source', locale)}</th>
              <th className="text-left p-2 font-medium">{t('scp.vir_col_dest', locale)}</th>
              <th className="text-right p-2 font-medium">{t('scp.vir_col_amount', locale)}</th>
              <th className="text-left p-2 font-medium">{t('scp.vir_col_label', locale)}</th>
              <th className="text-center p-2 font-medium">{t('scp.vir_col_status', locale)}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((v) => {
              const src = comptes.find((c) => c.id === v.compte_source_id)
              const dst = comptes.find((c) => c.id === v.compte_destination_id)
              return (
                <tr key={v.id} className="border-t hover:bg-muted/20">
                  <td className="p-2 whitespace-nowrap">
                    {fmtDate(v.date_execution || v.created_at)}
                  </td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-[10px]">
                      {v.mode}
                    </Badge>
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {src ? `${src.banque} ${src.numero_compte || ''}` : '—'}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {v.mode === 'interne'
                      ? dst
                        ? `${dst.banque} ${dst.numero_compte || ''}`
                        : '—'
                      : v.tiers_destination || v.iban_destination || '—'}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {fmt(Number(v.montant), v.devise)}
                  </td>
                  <td className="p-2 max-w-xs truncate" title={v.libelle || ''}>
                    {v.libelle || '—'}
                  </td>
                  <td className="p-2 text-center">
                    <Badge variant="outline" className="text-[10px]">
                      {v.statut}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: t('scp.vir_client_area', locale), href: '/client/tableau-de-bord' },
        { label: t('scp.vir_breadcrumb', locale) },
      ]}
      kicker={t('scp.vir_kicker', locale)}
      title={t('scp.vir_title', locale)}
      subtitle={t('scp.vir_subtitle', locale)}
    >
      <div className="space-y-6">
        {error && (
          <div className="p-3 rounded bg-red-50 text-red-700 border border-red-200 text-sm">
            {error}
          </div>
        )}
        {info && (
          <div className="p-3 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm">
            {info}
          </div>
        )}

        {/* Form nouveau virement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              {t('scp.vir_new', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('scp.vir_mode', locale)}
                </label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="interne">
                      {t('scp.vir_internal', locale)}
                    </SelectItem>
                    <SelectItem value="externe">{t('scp.vir_external', locale)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('scp.vir_source_account', locale)}
                </label>
                <Select value={compteSource} onValueChange={setCompteSource}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('scp.vir_choose', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {comptes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.banque} · {c.numero_compte || c.iban || c.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {mode === 'interne' ? (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t('scp.vir_dest_account', locale)}
                  </label>
                  <Select value={compteDest} onValueChange={setCompteDest}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('scp.vir_choose', locale)} />
                    </SelectTrigger>
                    <SelectContent>
                      {comptes
                        .filter((c) => c.id !== compteSource)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.banque} · {c.numero_compte || c.iban || c.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t('scp.vir_tiers_dest', locale)}
                    </label>
                    <Input
                      placeholder={t('scp.vir_beneficiary_ph', locale)}
                      value={tiersDest}
                      onChange={(e) => setTiersDest(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t('scp.vir_iban_dest', locale)}
                    </label>
                    <Input
                      placeholder="MU17BOMM..."
                      value={ibanDest}
                      onChange={(e) => setIbanDest(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('scp.vir_amount', locale)}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('scp.vir_currency', locale)}
                </label>
                <Select value={devise} onValueChange={setDevise}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MUR">MUR</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="ZAR">ZAR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('scp.vir_label', locale)}
                </label>
                <Input
                  placeholder={t('scp.vir_label_ph', locale)}
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t('scp.vir_exec_date', locale)}
                </label>
                <Input
                  type="date"
                  value={dateExec}
                  onChange={(e) => setDateExec(e.target.value)}
                />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2">
                <Button
                  type="submit"
                  disabled={submitting || !societeId}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1.5" />
                  )}
                  {t('scp.vir_prepare_btn', locale)}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Onglets liste */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                {t('scp.vir_prepared_title', locale)}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadFile}
                disabled={aEffectuer.length === 0}
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <FileDown className="h-4 w-4 mr-1.5" />
                {t('scp.vir_export_file', locale)}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t('cui.loading', locale)}
              </div>
            ) : (
              <Tabs defaultValue="a_effectuer">
                <TabsList>
                  <TabsTrigger value="a_effectuer">
                    {t('scp.vir_tab_todo', locale)} ({aEffectuer.length})
                  </TabsTrigger>
                  <TabsTrigger value="effectue">
                    {t('scp.vir_tab_done', locale)} ({effectues.length})
                  </TabsTrigger>
                  <TabsTrigger value="historique">
                    {t('scp.vir_tab_history', locale)} ({virements.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="a_effectuer" className="mt-3">
                  {renderList(aEffectuer)}
                </TabsContent>
                <TabsContent value="effectue" className="mt-3">
                  {renderList(effectues)}
                </TabsContent>
                <TabsContent value="historique" className="mt-3">
                  {renderList(virements)}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPageShell>
  )
}
