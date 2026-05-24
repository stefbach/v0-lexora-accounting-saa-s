"use client"

/**
 * Page /client/ecritures — agent-friendly.
 *
 * Vue des écritures comptables (grand livre détaillé) de la société.
 * Lex Banque produit les écritures BNQ qui apparaîtront ici.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  RefreshCw,
  BookOpen,
  Search,
  ArrowRight,
  Sparkles,
  Bot,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

interface Ecriture {
  id: string
  date_ecriture: string
  journal: string
  numero_compte: string
  libelle: string | null
  debit_mur: number
  credit_mur: number
  devise_origine: string | null
  montant_origine: number | null
  taux_change_applique: number | null
  ref_folio: string | null
  lettre: string | null
  date_lettrage: string | null
  facture_id: string | null
}

const JOURNAL_LABELS: Record<string, { label: string; color: string }> = {
  VTE: { label: "Ventes", color: "bg-green-100 text-green-700 border-green-300" },
  ACH: { label: "Achats", color: "bg-rose-100 text-rose-700 border-rose-300" },
  BNQ: { label: "Banque", color: "bg-blue-100 text-blue-700 border-blue-300" },
  SAL: { label: "Salaires", color: "bg-purple-100 text-purple-700 border-purple-300" },
  OD: { label: "Diverses", color: "bg-amber-100 text-amber-700 border-amber-300" },
  CLS: { label: "Clôture", color: "bg-slate-100 text-slate-700 border-slate-300" },
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export default function ClientEcrituresPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [ecritures, setEcritures] = useState<Ecriture[]>([])
  const [loading, setLoading] = useState(false)
  const [journalFilter, setJournalFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Ecriture | null>(null)
  const [editFields, setEditFields] = useState<{
    numero_compte: string; libelle: string; debit_mur: string; credit_mur: string; date_ecriture: string
  }>({ numero_compte: '', libelle: '', debit_mur: '', credit_mur: '', date_ecriture: '' })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const openEdit = (e: Ecriture) => {
    setEditing(e)
    setEditFields({
      numero_compte: e.numero_compte || '',
      libelle: e.libelle || '',
      debit_mur: String(e.debit_mur || 0),
      credit_mur: String(e.credit_mur || 0),
      date_ecriture: e.date_ecriture || '',
    })
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch('/api/client/ecritures', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          numero_compte: editFields.numero_compte,
          libelle: editFields.libelle,
          debit_mur: Number(editFields.debit_mur) || 0,
          credit_mur: Number(editFields.credit_mur) || 0,
          date_ecriture: editFields.date_ecriture || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur modification')
      }
      setEditing(null)
      showToast('Écriture modifiée', 'success')
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Erreur modification', 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteOne = async (e: Ecriture) => {
    if (!confirm(`Supprimer cette écriture ?\n${e.numero_compte} · ${e.libelle || ''}\nCette suppression est DÉFINITIVE en base de données.`)) return
    setBusyId(e.id)
    try {
      const res = await fetch(`/api/client/ecritures?id=${e.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur suppression')
      }
      showToast('Écriture supprimée', 'success')
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Erreur suppression', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const deleteBatch = async (folio: string) => {
    if (!confirm(`Supprimer TOUT le lot d'écritures ${folio} ?\nToutes les lignes partageant ce folio seront effacées en base.`)) return
    setBusyId(folio)
    try {
      const res = await fetch(`/api/client/ecritures?folio=${encodeURIComponent(folio)}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Erreur suppression batch')
      }
      const data = await res.json()
      showToast(`${data.deleted} ligne(s) supprimée(s)`, 'success')
      await load()
    } catch (e: any) {
      showToast(e?.message || 'Erreur suppression batch', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      // Utilise /api/client/financial qui expose financial.ecritures (V2).
      // Le format retourné a déjà les aliases `compte`, `debit`, `credit`.
      const res = await fetch(`/api/client/financial?societe_id=${societeId}`)
      const d = await res.json()
      const fin = d?.financial || {}
      const arr = (fin.ecritures || []).map((e: any) => ({
        id: e.id,
        date_ecriture: e.date_ecriture,
        journal: e.journal || "",
        numero_compte: e.numero_compte || e.compte || "",
        libelle: e.libelle || null,
        debit_mur: Number(e.debit_mur) || Number(e.debit) || 0,
        credit_mur: Number(e.credit_mur) || Number(e.credit) || 0,
        devise_origine: e.devise_origine || null,
        montant_origine: e.montant_origine || null,
        taux_change_applique: e.taux_change_applique || null,
        ref_folio: e.ref_folio || null,
        lettre: e.lettre || null,
        date_lettrage: e.date_lettrage || null,
        facture_id: e.facture_id || null,
      }))
      setEcritures(arr)
    } catch {}
    finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    let list = ecritures
    if (journalFilter !== "all") list = list.filter((e) => e.journal === journalFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (e) =>
          e.libelle?.toLowerCase().includes(q) ||
          e.numero_compte?.includes(q) ||
          e.ref_folio?.toLowerCase().includes(q)
      )
    }
    return list
      .slice()
      .sort((a, b) => (b.date_ecriture || "").localeCompare(a.date_ecriture || ""))
  }, [ecritures, journalFilter, search])

  const totalDebit = filtered.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
  const totalCredit = filtered.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
  const journaux = useMemo(() => {
    const set = new Set<string>()
    for (const e of ecritures) if (e.journal) set.add(e.journal)
    return Array.from(set).sort()
  }, [ecritures])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        {/* HEADER */}
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-blue-50 to-sky-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 p-3 text-white shadow-md">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-indigo-900">{t('acc.ecr.title', locale)}</h1>
                <p className="text-sm text-indigo-700/80 mt-0.5">
                  {t('acc.ecr.subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {t('common.refresh', locale)}
              </Button>
              <Link href="/client/grand-livre">
                <Button variant="outline" size="sm">
                  {t('acc.ecr.general_ledger', locale)}
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </Link>
              <Link href="/client/rapprochement">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Lex Banque
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('acc.ecr.no_company', locale)}
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KpiCard label={t('acc.ecr.entries', locale)} value={filtered.length} />
              <KpiCard label={t('acc.ecr.total_debit', locale)} value={fmt(totalDebit)} tone="green" />
              <KpiCard label={t('acc.ecr.total_credit', locale)} value={fmt(totalCredit)} tone="rose" />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-indigo-600" />
                    {t('acc.ecr.list_title', locale)} ({filtered.length})
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('acc.ecr.search_placeholder', locale)}
                        className="pl-8 h-9 w-56"
                      />
                    </div>
                    <Select value={journalFilter} onValueChange={setJournalFilter}>
                      <SelectTrigger className="h-9 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('acc.ecr.all_journals', locale)}</SelectItem>
                        {journaux.map((j) => (
                          <SelectItem key={j} value={j}>
                            {JOURNAL_LABELS[j]?.label || j}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {t('acc.ecr.no_entries', locale)}
                  </p>
                ) : (
                  <div className="rounded border bg-card divide-y">
                    {filtered.map((e) => {
                      const jLabel = JOURNAL_LABELS[e.journal] || {
                        label: e.journal,
                        color: "bg-slate-100 text-slate-700 border-slate-300",
                      }
                      const isBnqLex = e.journal === "BNQ" && e.ref_folio?.startsWith("BANK-")
                      return (
                        <div
                          key={e.id}
                          className="flex items-start justify-between gap-3 p-3 hover:bg-muted/20"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground font-mono">
                                {formatDate(e.date_ecriture)}
                              </span>
                              <Badge className={`text-[10px] border ${jLabel.color}`}>
                                {jLabel.label}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {e.numero_compte}
                              </Badge>
                              {e.lettre && (
                                <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300 font-mono">
                                  {e.lettre}
                                </Badge>
                              )}
                              {isBnqLex && (
                                <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-300">
                                  <Bot className="h-3 w-3 mr-0.5" />
                                  Lex Banque
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm mt-1 break-words">{e.libelle || "—"}</p>
                            {e.devise_origine && e.devise_origine !== "MUR" && e.montant_origine && (
                              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                                {t('acc.ecr.origin', locale)} : {fmt(e.montant_origine)} {e.devise_origine}
                                {e.taux_change_applique && ` × ${e.taux_change_applique}`}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 font-mono text-sm flex flex-col items-end gap-1">
                            <div>
                              {e.debit_mur > 0 && (
                                <p className="text-green-700">D {fmt(e.debit_mur)}</p>
                              )}
                              {e.credit_mur > 0 && (
                                <p className="text-rose-700">C {fmt(e.credit_mur)}</p>
                              )}
                            </div>
                            {/* Actions Modifier / Supprimer / Supprimer le lot.
                                Toujours dispos (sous réserve qu'aucune clôture
                                ne verrouille la période — vérifié côté API). */}
                            <div className="flex gap-1 mt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[10px]"
                                title="Modifier l'écriture"
                                disabled={busyId === e.id || saving}
                                onClick={() => openEdit(e)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[10px] text-rose-600 border-rose-200 hover:bg-rose-50"
                                title="Supprimer cette ligne"
                                disabled={busyId === e.id}
                                onClick={() => deleteOne(e)}
                              >
                                {busyId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </Button>
                              {e.ref_folio && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-1.5 text-[10px] text-rose-700 border-rose-300 hover:bg-rose-100"
                                  title={`Supprimer tout le lot (${e.ref_folio})`}
                                  disabled={busyId === e.ref_folio}
                                  onClick={() => deleteBatch(e.ref_folio!)}
                                >
                                  {busyId === e.ref_folio ? <Loader2 className="h-3 w-3 animate-spin" /> : '🗑 Lot'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      {/* Toast minimaliste pour feedback action */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {toast.msg}
        </div>
      )}
      {/* Dialog d'édition d'écriture — modal simple, pas de lib UI lourde */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Modifier l'écriture</h2>
                <p className="text-xs text-gray-500 font-mono mt-1">{editing.ref_folio || editing.id.slice(0, 8)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Date</label>
                <Input
                  type="date"
                  value={editFields.date_ecriture}
                  onChange={(e) => setEditFields({ ...editFields, date_ecriture: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Numéro de compte</label>
                <Input
                  value={editFields.numero_compte}
                  onChange={(e) => setEditFields({ ...editFields, numero_compte: e.target.value })}
                  placeholder="Ex: 411000"
                  className="mt-1 h-9 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Libellé</label>
                <Input
                  value={editFields.libelle}
                  onChange={(e) => setEditFields({ ...editFields, libelle: e.target.value })}
                  className="mt-1 h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-green-700">Débit MUR</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editFields.debit_mur}
                    onChange={(e) => setEditFields({ ...editFields, debit_mur: e.target.value })}
                    className="mt-1 h-9 font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-rose-700">Crédit MUR</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editFields.credit_mur}
                    onChange={(e) => setEditFields({ ...editFields, credit_mur: e.target.value })}
                    className="mt-1 h-9 font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </ClientPageShell>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: "amber" | "green" | "rose" | "blue"
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "green"
        ? "border-green-200 bg-green-50"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50"
            : "border-muted bg-card"
  return (
    <Card className={cls}>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}
