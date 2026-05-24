"use client"

/**
 * Page /client/plan-comptable — Plan Comptable Mauricien hiérarchique.
 *
 * 7 classes collapsibles. Au sein de chaque classe, arborescence
 * parent → enfants (compte_parent + niveau). Recherche full-text qui
 * ouvre automatiquement les classes correspondantes.
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Loader2,
  RefreshCw,
  BookOpen,
  Search,
  ChevronDown,
  ChevronRight,
  Layers,
  Wallet,
  Building2,
  Package,
  Users,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

interface ComptePCM {
  id: string
  compte: string
  libelle: string | null
  classe: number
  type_compte: string | null
  sens_normal: "D" | "C" | null
  compte_parent: string | null
  niveau: number | null
  actif: boolean
  est_analytique: boolean
  notes: string | null
  societe_id: string | null
}

interface CompteUsage {
  nb_ecritures: number
  total_debit: number
  total_credit: number
  solde: number
  ecritures: Array<{
    id: string
    date: string | null
    journal: string | null
    libelle: string | null
    debit: number
    credit: number
    lettre: string | null
    ref_folio: string | null
  }>
}

function getClasses(locale: Locale): Array<{ num: number; label: string; desc: string; color: string; Icon: any }> {
  return [
    { num: 1, label: t('acc.pcm.cls1', locale), desc: t('acc.pcm.cls1_desc', locale), color: "blue", Icon: Wallet },
    { num: 2, label: t('acc.pcm.cls2', locale), desc: t('acc.pcm.cls2_desc', locale), color: "cyan", Icon: Building2 },
    { num: 3, label: t('acc.pcm.cls3', locale), desc: t('acc.pcm.cls3_desc', locale), color: "teal", Icon: Package },
    { num: 4, label: t('acc.pcm.cls4', locale), desc: t('acc.pcm.cls4_desc', locale), color: "amber", Icon: Users },
    { num: 5, label: t('acc.pcm.cls5', locale), desc: t('acc.pcm.cls5_desc', locale), color: "purple", Icon: Landmark },
    { num: 6, label: t('acc.pcm.cls6', locale), desc: t('acc.pcm.cls6_desc', locale), color: "rose", Icon: ArrowDownCircle },
    { num: 7, label: t('acc.pcm.cls7', locale), desc: t('acc.pcm.cls7_desc', locale), color: "green", Icon: ArrowUpCircle },
  ]
}
const colorMap: Record<string, { bg: string; border: string; text: string; bgLight: string }> = {
  blue: { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-900", bgLight: "bg-blue-100" },
  cyan: { bg: "bg-cyan-50", border: "border-cyan-300", text: "text-cyan-900", bgLight: "bg-cyan-100" },
  teal: { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-900", bgLight: "bg-teal-100" },
  amber: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-900", bgLight: "bg-amber-100" },
  purple: { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-900", bgLight: "bg-purple-100" },
  rose: { bg: "bg-rose-50", border: "border-rose-300", text: "text-rose-900", bgLight: "bg-rose-100" },
  green: { bg: "bg-green-50", border: "border-green-300", text: "text-green-900", bgLight: "bg-green-100" },
}

export default function PlanComptablePage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<ComptePCM[]>([])
  const [usage, setUsage] = useState<Map<string, CompteUsage>>(new Map())
  const [loading, setLoading] = useState(false)
  const [openClasses, setOpenClasses] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6, 7]))
  const [openCompte, setOpenCompte] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [pcmRes, finRes] = await Promise.all([
        fetch(`/api/client/plan-comptable?societe_id=${societeId}`).then((r) => r.json()),
        fetch(`/api/client/financial?societe_id=${societeId}`).then((r) => r.json()),
      ])
      setComptes(pcmRes?.comptes || [])
      // Calcul usage par compte (nb écritures, totaux, détail) via financial.ecritures
      const ecr: any[] = finRes?.financial?.ecritures || []
      const map = new Map<string, CompteUsage>()
      for (const e of ecr) {
        const num = e.numero_compte || e.compte || "?"
        const debit = Number(e.debit_mur) || Number(e.debit) || 0
        const credit = Number(e.credit_mur) || Number(e.credit) || 0
        const cur = map.get(num) || {
          nb_ecritures: 0,
          total_debit: 0,
          total_credit: 0,
          solde: 0,
          ecritures: [],
        }
        cur.nb_ecritures++
        cur.total_debit += debit
        cur.total_credit += credit
        cur.solde = cur.total_debit - cur.total_credit
        cur.ecritures.push({
          id: e.id,
          date: e.date_ecriture || null,
          journal: e.journal || null,
          libelle: e.libelle || null,
          debit,
          credit,
          lettre: e.lettre || null,
          ref_folio: e.ref_folio || null,
        })
        map.set(num, cur)
      }
      setUsage(map)
    } catch { /* noop */ }
    finally {
      setLoading(false)
    }
  }, [societeId])
  useEffect(() => {
    load()
  }, [load])

  // Index par classe
  const byClass = useMemo(() => {
    const map = new Map<number, ComptePCM[]>()
    for (const c of comptes) {
      const arr = map.get(c.classe) || []
      arr.push(c)
      map.set(c.classe, arr)
    }
    for (const [, v] of map) v.sort((a, b) => a.compte.localeCompare(b.compte))
    return map
  }, [comptes])

  // Filtre par recherche
  const filteredByClass = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result = new Map<number, ComptePCM[]>()
    for (const [cl, arr] of byClass) {
      const filtered = q
        ? arr.filter(
            (c) =>
              c.compte.toLowerCase().includes(q) ||
              (c.libelle || "").toLowerCase().includes(q)
          )
        : arr
      result.set(cl, filtered)
    }
    return result
  }, [byClass, search])

  // Auto-open matching classes when searching
  useEffect(() => {
    if (search.trim()) {
      const next = new Set<number>()
      for (const [cl, arr] of filteredByClass) if (arr.length > 0) next.add(cl)
      setOpenClasses(next)
    }
  }, [search, filteredByClass])

  const toggleClass = (cl: number) => {
    setOpenClasses((prev) => {
      const next = new Set(prev)
      if (next.has(cl)) next.delete(cl)
      else next.add(cl)
      return next
    })
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-7xl">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-zinc-50 to-stone-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-3 text-white shadow-md">
                <BookOpen className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{t('acc.pcm.title', locale)}</h1>
                <p className="text-sm text-slate-700/80 mt-0.5">
                  {t('acc.pcm.subtitle_prefix', locale)} {comptes.length} {t('acc.pcm.subtitle_suffix', locale)}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              {t('common.refresh', locale)}
            </Button>
          </div>
        </div>

        {!societeId ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              {t('acc.pcm.no_company', locale)}
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
          </div>
        ) : (
          <>
            {/* Recherche */}
            <Card>
              <CardContent className="p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('acc.pcm.search_placeholder', locale)}
                    className="pl-8 h-9"
                  />
                </div>
                <div className="flex justify-end mt-2 gap-2">
                  <button
                    onClick={() => setOpenClasses(new Set([1, 2, 3, 4, 5, 6, 7]))}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    {t('acc.pcm.expand_all', locale)}
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    onClick={() => setOpenClasses(new Set())}
                    className="text-xs text-blue-700 hover:underline"
                  >
                    {t('acc.pcm.collapse_all', locale)}
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Sections par classe */}
            <div className="space-y-3">
              {getClasses(locale).map((cl) => {
                const arr = filteredByClass.get(cl.num) || []
                const open = openClasses.has(cl.num)
                const cls = colorMap[cl.color]
                const totalInClass = (byClass.get(cl.num) || []).length
                return (
                  <Card key={cl.num} className={`${cls.border} border-2`}>
                    <button
                      onClick={() => toggleClass(cl.num)}
                      className={`w-full ${cls.bg} hover:${cls.bgLight} transition-colors p-4 flex items-center justify-between gap-3 text-left`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`rounded-lg ${cls.bgLight} p-2.5 ${cls.text}`}>
                          <cl.Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className={`font-bold ${cls.text}`}>
                            {t('acc.pcm.class', locale)} {cl.num} — {cl.label}
                          </h3>
                          <p className="text-xs text-muted-foreground">{cl.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase">
                            {t('acc.pcm.accounts', locale)}
                          </div>
                          <div className={`font-bold ${cls.text}`}>
                            {arr.length}
                            {search.trim() && arr.length !== totalInClass && (
                              <span className="text-muted-foreground"> / {totalInClass}</span>
                            )}
                          </div>
                        </div>
                        {open ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {open && (
                      <div className="border-t bg-white">
                        {arr.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground italic">
                            {search.trim()
                              ? t('acc.pcm.no_match', locale)
                              : t('acc.pcm.empty_class', locale)}
                          </p>
                        ) : (
                          <div className="divide-y">
                            {arr.map((c) => (
                              <PCMRow
                                key={c.id}
                                c={c}
                                cls={cls}
                                usage={usage.get(c.compte)}
                                isOpen={openCompte === c.compte}
                                onToggle={() =>
                                  setOpenCompte(
                                    openCompte === c.compte ? null : c.compte
                                  )
                                }
                                locale={locale}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function PCMRow({
  c,
  cls,
  usage,
  isOpen,
  onToggle,
  locale,
}: {
  c: ComptePCM
  cls: { bgLight: string; text: string }
  usage?: CompteUsage
  isOpen: boolean
  onToggle: () => void
  locale: Locale
}) {
  const indent = Math.max(0, (c.niveau || 1) - 2) * 16
  const isOverride = !!c.societe_id
  const hasUsage = usage && usage.nb_ecritures > 0

  return (
    <div>
      <button
        onClick={() => hasUsage && onToggle()}
        disabled={!hasUsage}
        className={`w-full flex items-start gap-3 p-3 text-left ${
          hasUsage ? "hover:bg-muted/30 cursor-pointer" : "cursor-default"
        }`}
        style={{ paddingLeft: 12 + indent }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {hasUsage &&
              (isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              ))}
            <Badge variant="outline" className={`text-[11px] font-mono ${cls.bgLight} ${cls.text}`}>
              {c.compte}
            </Badge>
            {c.sens_normal && (
              <Badge variant="outline" className="text-[10px]">
                {t('acc.pcm.direction', locale)} {c.sens_normal === "D" ? t('acc.pcm.debit', locale) : t('acc.pcm.credit', locale)}
              </Badge>
            )}
            {c.type_compte && (
              <Badge variant="outline" className="text-[10px]">
                {c.type_compte}
              </Badge>
            )}
            {isOverride && (
              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                {t('acc.pcm.custom_company', locale)}
              </Badge>
            )}
            {!c.actif && (
              <Badge variant="outline" className="text-[10px] opacity-60">
                {t('acc.pcm.inactive', locale)}
              </Badge>
            )}
            {c.est_analytique && (
              <Badge variant="outline" className="text-[10px]">
                {t('acc.pcm.analytical', locale)}
              </Badge>
            )}
            {c.compte_parent && (
              <span className="text-[10px] text-muted-foreground font-mono">
                ↳ {t('acc.pcm.parent', locale)} {c.compte_parent}
              </span>
            )}
          </div>
          <p className="text-sm mt-1 break-words font-medium">{c.libelle || "—"}</p>
          {c.notes && <p className="text-[11px] italic text-muted-foreground">{c.notes}</p>}
        </div>
        <div className="text-right flex-shrink-0 text-xs font-mono space-y-0.5">
          {hasUsage ? (
            <>
              <div className="text-[10px] text-muted-foreground uppercase">
                {usage!.nb_ecritures} {t('acc.pcm.entries_abbr', locale)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                D {fmt(usage!.total_debit)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                C {fmt(usage!.total_credit)}
              </div>
              <div
                className={`font-medium ${
                  usage!.solde >= 0 ? "text-green-700" : "text-rose-700"
                }`}
              >
                {fmt(usage!.solde)}
              </div>
            </>
          ) : (
            <div className="text-[10px] text-muted-foreground italic">{t('acc.pcm.not_used', locale)}</div>
          )}
        </div>
      </button>
      {isOpen && hasUsage && (
        <div className="bg-slate-50 border-t border-b">
          <div className="px-4 py-2 text-[11px] text-muted-foreground border-b">
            {usage!.nb_ecritures} {t('acc.pcm.entries_on_account', locale)}{" "}
            <span className="font-mono">{c.compte}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">{t('common.date', locale)}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t('acc.pcm.journal', locale)}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t('acc.pcm.label', locale)}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t('acc.pcm.debit', locale)}</th>
                  <th className="px-2 py-1.5 text-right font-medium">{t('acc.pcm.credit', locale)}</th>
                  <th className="px-2 py-1.5 text-left font-medium">{t('acc.pcm.letter', locale)}</th>
                </tr>
              </thead>
              <tbody>
                {usage!.ecritures
                  .slice()
                  .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                  .map((e) => (
                    <tr key={e.id} className="border-b border-slate-200 hover:bg-white">
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                        {e.date ? new Date(e.date).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {e.journal && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {e.journal}
                          </Badge>
                        )}
                      </td>
                      <td
                        className="px-2 py-1.5 max-w-md truncate"
                        title={e.libelle || ""}
                      >
                        {e.libelle || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-green-700">
                        {e.debit > 0 ? fmt(e.debit) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-rose-700">
                        {e.credit > 0 ? fmt(e.credit) : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {e.lettre && (
                          <Badge className="text-[10px] font-mono bg-green-100 text-green-700 border-green-300">
                            {e.lettre}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
