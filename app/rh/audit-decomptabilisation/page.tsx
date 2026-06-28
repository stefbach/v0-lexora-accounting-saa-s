"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Shield,
  Download,
  ChevronLeft,
  ChevronRight,
  Undo2,
  Filter,
  X,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface LogEntry {
  id: string
  bulletin_id: string
  ecriture_id_avant: string | null
  action: string
  user_id: string | null
  raison: string | null
  metadata: any
  created_at: string
  auteur: {
    id: string
    nom: string
    email?: string
    role?: string
  } | null
  bulletin: {
    id: string
    periode: string
    employe: { id: string; prenom: string; nom: string } | null
  } | null
}

const PAGE_SIZE = 50

function fmtDateTime(s: string): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return s
  }
}

function fmtPeriode(p?: string): string {
  if (!p) return "—"
  const ym = p.slice(0, 7)
  const d = new Date(`${ym}-01T12:00:00`)
  if (Number.isNaN(d.getTime())) return p
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

function csvEscape(v: any): string {
  const s = v == null ? "" : String(v)
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export default function AuditDecomptabilisationPage() {
  const locale = getLocale()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)

  // Filters
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [employeFilter, setEmployeFilter] = useState("")
  const [auteurFilter, setAuteurFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("limit", String(PAGE_SIZE))
      params.set("offset", String(offset))
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo) params.set("date_to", dateTo)
      const res = await fetch(
        `/api/rh/paie/decomptabilisation-log?${params.toString()}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || `HTTP ${res.status}`)
        setEntries([])
        setTotal(0)
        return
      }
      setEntries(data.entries || [])
      setTotal(data.total || 0)
    } catch (e: any) {
      setError(e?.message || t('sarh.audit.err_network', locale))
    } finally {
      setLoading(false)
    }
  }, [offset, dateFrom, dateTo])

  useEffect(() => {
    load()
  }, [load])

  // Filtres client-side : employé et auteur (l'API ne prend que user_id/UUID).
  const filtered = useMemo(() => {
    const ef = employeFilter.trim().toLowerCase()
    const af = auteurFilter.trim().toLowerCase()
    return entries.filter((e) => {
      if (ef) {
        const emp = e.bulletin?.employe
        const nom = `${emp?.prenom || ""} ${emp?.nom || ""}`.toLowerCase()
        if (!nom.includes(ef)) return false
      }
      if (af) {
        const auth = `${e.auteur?.nom || ""} ${e.auteur?.email || ""}`.toLowerCase()
        if (!auth.includes(af)) return false
      }
      return true
    })
  }, [entries, employeFilter, auteurFilter])

  const resetFilters = () => {
    setDateFrom("")
    setDateTo("")
    setEmployeFilter("")
    setAuteurFilter("")
    setOffset(0)
  }

  const exportCSV = () => {
    const headers = [
      t('sarh.audit.csv_date', locale),
      t('sarh.audit.csv_auteur', locale),
      t('sarh.audit.csv_role_auteur', locale),
      t('sarh.audit.csv_action', locale),
      t('sarh.audit.csv_employe', locale),
      t('sarh.audit.csv_periode', locale),
      t('sarh.audit.csv_raison', locale),
      t('sarh.audit.csv_type_correction', locale),
      t('sarh.audit.csv_ecriture_avant', locale),
    ]
    const rows = filtered.map((e) => [
      fmtDateTime(e.created_at),
      e.auteur?.nom || "—",
      e.auteur?.role || "—",
      e.action,
      e.bulletin?.employe
        ? `${e.bulletin.employe.prenom} ${e.bulletin.employe.nom}`
        : "—",
      fmtPeriode(e.bulletin?.periode),
      e.raison || "",
      e.metadata?.type_correction || "",
      e.ecriture_id_avant || "",
    ])
    const csv = [headers, ...rows]
      .map((r) => r.map(csvEscape).join(","))
      .join("\n")
    const blob = new Blob([`﻿${csv}`], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-decomptabilisation-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const hasFilters =
    dateFrom || dateTo || employeFilter.trim() || auteurFilter.trim()
  const pageStart = offset + 1
  const pageEnd = offset + entries.length
  const canPrev = offset > 0
  const canNext = offset + PAGE_SIZE < total

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-bold flex items-center gap-2"
              style={{ color: NAVY }}
            >
              <Shield className="w-6 h-6" style={{ color: GOLD }} />
              {t('sarh.audit.title', locale)}
            </h1>
            <p className="text-gray-500 text-sm">
              {t('sarh.audit.subtitle', locale)}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={exportCSV}
            disabled={filtered.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            {t('sarh.audit.export_csv', locale)}
          </Button>
        </div>

        {/* Filtres */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
              <Filter className="w-4 h-4" />
              {t('sarh.audit.filtres', locale)}
              {hasFilters && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs ml-auto"
                  onClick={resetFilters}
                >
                  <X className="w-3 h-3 mr-1" />
                  {t('sarh.audit.reset', locale)}
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label htmlFor="filter-date-from" className="text-xs">
                  {t('sarh.audit.date_debut', locale)}
                </Label>
                <Input
                  id="filter-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setOffset(0)
                  }}
                />
              </div>
              <div>
                <Label htmlFor="filter-date-to" className="text-xs">
                  {t('sarh.audit.date_fin', locale)}
                </Label>
                <Input
                  id="filter-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setOffset(0)
                  }}
                />
              </div>
              <div>
                <Label htmlFor="filter-employe" className="text-xs">
                  {t('sarh.audit.employe', locale)}
                </Label>
                <Input
                  id="filter-employe"
                  placeholder={t('sarh.audit.ph_employe', locale)}
                  value={employeFilter}
                  onChange={(e) => setEmployeFilter(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="filter-auteur" className="text-xs">
                  {t('sarh.audit.auteur', locale)}
                </Label>
                <Input
                  id="filter-auteur"
                  placeholder={t('sarh.audit.ph_auteur', locale)}
                  value={auteurFilter}
                  onChange={(e) => setAuteurFilter(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tableau */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-red-700 bg-red-50">
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Undo2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">
                  {t('sarh.audit.empty', locale)}
                  {hasFilters ? t('sarh.audit.empty_filtered_suffix', locale) : t('sarh.audit.empty_suffix', locale)}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">{t('sarh.audit.th_date', locale)}</TableHead>
                    <TableHead>{t('sarh.audit.th_auteur', locale)}</TableHead>
                    <TableHead>{t('sarh.audit.th_bulletin', locale)}</TableHead>
                    <TableHead>{t('sarh.audit.th_raison', locale)}</TableHead>
                    <TableHead className="w-28">{t('sarh.audit.th_etat_apres', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => {
                    const emp = e.bulletin?.employe
                    const isAdmin =
                      e.auteur?.role === "admin" ||
                      e.auteur?.role === "super_admin"
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs font-mono">
                          {fmtDateTime(e.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs">
                            <span className="font-medium">
                              {e.auteur?.nom || "—"}
                            </span>
                            {e.auteur?.role && (
                              <Badge
                                variant="outline"
                                className={`mt-0.5 w-fit text-[10px] ${isAdmin ? "border-blue-300 text-blue-700" : "border-amber-300 text-amber-700"}`}
                              >
                                {e.auteur.role}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            <div className="font-medium">
                              {emp
                                ? `${emp.prenom} ${emp.nom}`
                                : t('sarh.audit.bulletin_supprime', locale)}
                            </div>
                            <div className="text-gray-500 capitalize">
                              {fmtPeriode(e.bulletin?.periode)}
                            </div>
                            {e.metadata?.type_correction && (
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {t('sarh.audit.type_prefix', locale).replace('{x}', String(e.metadata.type_correction))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs max-w-md">
                          <span className="line-clamp-3 whitespace-pre-wrap">
                            {e.raison || (
                              <span className="text-gray-400 italic">
                                {t('sarh.audit.aucune', locale)}
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {e.metadata?.requires_admin_approval ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">
                              {t('sarh.audit.badge_valider_admin', locale)}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                              {t('sarh.audit.badge_decomptabilise', locale)}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              {t('sarh.audit.pagination', locale).replace('{a}', String(pageStart)).replace('{b}', String(pageEnd)).replace('{total}', String(total))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrev}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="w-4 h-4" />
                {t('sarh.audit.prev', locale)}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNext}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('sarh.audit.next', locale)}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </ClientPageShell>
  )
}
