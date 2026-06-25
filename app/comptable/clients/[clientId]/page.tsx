"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { t, getLocale, type Locale } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  Phone,
  UserX,
  Clock,
  TrendingUp,
  TrendingDown,
  Landmark,
  Calculator,
  BarChart3,
  Eye,
  BookOpen,
  Scale,
  Receipt,
  Wallet,
  FolderOpen,
  ExternalLink,
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " MUR"
}

interface ClientInfo {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  created_at: string
  is_active: boolean
}

interface SocieteCard {
  id: string
  nom: string
  brn: string | null
  statut_tva: boolean
  derniere_activite: string
}

interface SocieteFinancials {
  [societeId: string]: {
    loading: boolean
    ca: number
    charges: number
    resultat: number
    tresorerie: number
    totalDocuments: number
    totalEcritures: number
    error?: boolean
  }
}

interface AlerteEntry {
  id: string
  niveau: string
  titre: string
  description: string
  societeId?: string
  societeName?: string
}

const MODULE_LINKS = (clientId: string, societeId: string, locale: Locale) => [
  { href: `/comptable/clients/${clientId}/${societeId}/tableau-de-bord`, label: t('cabclt.client.mod_dashboard', locale), icon: BarChart3 },
  { href: `/comptable/clients/${clientId}/${societeId}/grand-livre`, label: t('cabclt.client.mod_ledger', locale), icon: BookOpen },
  { href: `/comptable/clients/${clientId}/${societeId}/balance`, label: t('cabclt.client.mod_balance', locale), icon: Scale },
  { href: `/comptable/clients/${clientId}/${societeId}/bilan`, label: t('cabclt.client.mod_bilan', locale), icon: TrendingUp },
  { href: `/comptable/clients/${clientId}/${societeId}/tva`, label: t('cabclt.client.mod_vat', locale), icon: Receipt },
  { href: `/comptable/clients/${clientId}/${societeId}/salaires`, label: t('cabclt.client.mod_salaries', locale), icon: Wallet },
  { href: `/comptable/clients/${clientId}/${societeId}/it-form3`, label: t('cabclt.client.mod_itform3', locale), icon: Calculator },
  { href: `/comptable/clients/${clientId}/${societeId}/documents`, label: t('cabclt.client.mod_documents', locale), icon: FolderOpen },
]

export default function FicheClientPage() {
  const params = useParams()
  const router = useRouter()
  const locale = getLocale()
  const clientId = params.clientId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [societes, setSocietes] = useState<SocieteCard[]>([])
  const [alertes, setAlertes] = useState<AlerteEntry[]>([])
  const [financials, setFinancials] = useState<SocieteFinancials>({})
  const [viewAsClient, setViewAsClient] = useState(false)

  useEffect(() => {
    async function fetchClientData() {
      setLoading(true)
      setError(null)
      try {
        const [clientsRes, alertesRes] = await Promise.allSettled([
          fetch("/api/comptable/clients").then((r) => r.json()),
          fetch("/api/comptable/alertes").then((r) => (r.ok ? r.json() : { alertes: [] })),
        ])

        const clientsData = clientsRes.status === "fulfilled" ? clientsRes.value : {}
        const alertesData = alertesRes.status === "fulfilled" ? alertesRes.value : {}

        // Find client in the list
        const allClients = clientsData.clients || []
        const user = allClients.find((u: Record<string, unknown>) => u.id === clientId)
        if (!user) throw new Error(t('cabclt.client.client_not_found', locale))

        setClient({
          id: user.id,
          full_name: user.full_name || "",
          email: user.email || "",
          phone: user.phone || "",
          role: user.role || "",
          created_at: user.created_at || "",
          is_active: user.is_active !== false,
        })

        // Build société list from dossiers
        const allDossiers = clientsData.dossiers || []
        const clientDossiers = allDossiers.filter(
          (d: Record<string, unknown>) => d.client_id === clientId
        )

        const societeMap = new Map<string, SocieteCard>()
        for (const d of clientDossiers) {
          if (!d.societe) continue
          const sId = d.societe.id || d.societe_id
          if (!sId || societeMap.has(sId)) continue
          societeMap.set(sId, {
            id: sId,
            nom: d.societe.nom || t('cabclt.client.no_name', locale),
            brn: d.societe.brn || null,
            statut_tva: d.societe.statut_tva || false,
            derniere_activite: d.created_at || "",
          })
        }

        // Fall back: search comptable/societes for societes linked to this client
        if (societeMap.size === 0) {
          try {
            const socRes = await fetch("/api/comptable/societes").then((r) => r.json())
            for (const s of socRes.societes || []) {
              societeMap.set(s.id, {
                id: s.id, nom: s.nom, brn: s.brn || null,
                statut_tva: s.statut_tva || false, derniere_activite: s.created_at || "",
              })
            }
          } catch { /* ignore */ }
        }

        const uniqueSocietes = Array.from(societeMap.values())
        setSocietes(uniqueSocietes)

        // Alertes filtered to this client's societes
        const societeIds = new Set(uniqueSocietes.map((s) => s.id))
        const rawAlertes: AlerteEntry[] = (alertesData.alertes || [])
          .filter((a: Record<string, unknown>) => !a.societe_id || societeIds.has(a.societe_id as string))
          .map((a: Record<string, unknown>) => ({
            id: (a.id as string) || crypto.randomUUID(),
            niveau: a.severity === "critical" ? "critique" : a.severity === "warning" ? "important" : "info",
            titre: (a.title || a.titre) as string || "",
            description: (a.message || a.description) as string || "",
            societeId: a.societe_id as string | undefined,
            societeName: a.societe_name as string | undefined,
          }))
        setAlertes(rawAlertes)

        // Load financial KPIs for each société
        const finInit: SocieteFinancials = {}
        for (const s of uniqueSocietes) {
          finInit[s.id] = { loading: true, ca: 0, charges: 0, resultat: 0, tresorerie: 0, totalDocuments: 0, totalEcritures: 0 }
        }
        setFinancials(finInit)

        // Fetch financials in parallel
        await Promise.allSettled(
          uniqueSocietes.map(async (s) => {
            try {
              const res = await fetch(`/api/client/financial?client_id=${clientId}&societe_id=${s.id}`)
              if (!res.ok) throw new Error("err")
              const d = await res.json()
              const fin = d.financial || d || {}
              setFinancials((prev) => ({
                ...prev,
                [s.id]: {
                  loading: false,
                  ca: fin.totalRevenue || 0,
                  charges: fin.totalExpenses || 0,
                  resultat: fin.resultat || 0,
                  tresorerie: fin.totalBankMUR || 0,
                  totalDocuments: fin.totalDocuments || 0,
                  totalEcritures: fin.totalEcritures || 0,
                },
              }))
            } catch {
              setFinancials((prev) => ({
                ...prev,
                [s.id]: { ...prev[s.id], loading: false, error: true },
              }))
            }
          })
        )
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t('cabclt.client.error_occurred', locale))
      } finally {
        setLoading(false)
      }
    }
    fetchClientData()
  }, [clientId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="flex-1 overflow-auto p-6 lg:p-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <UserX className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-base">{error || t('cabclt.client.client_not_found', locale)}</p>
            <Link href="/comptable">
              <Button variant="outline" className="mt-2 gap-2" style={{ borderColor: NAVY, color: NAVY }}>
                <ArrowLeft className="h-4 w-4" />
                {t('cabclt.client.back_dashboard', locale)}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const initials = client.full_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  function alertDotColor(niveau: string) {
    if (niveau === "critique") return "bg-red-500"
    if (niveau === "important") return "bg-orange-500"
    return "bg-blue-500"
  }

  const alertesByCriticite = {
    critique: alertes.filter((a) => a.niveau === "critique"),
    important: alertes.filter((a) => a.niveau === "important"),
    info: alertes.filter((a) => a.niveau === "info"),
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-8 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/comptable" className="flex items-center gap-1 hover:underline" style={{ color: NAVY }}>
            <ArrowLeft className="h-4 w-4" />
            {t('cabclt.client.dashboard', locale)}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/comptable/clients" className="hover:underline" style={{ color: NAVY }}>
            {t('cabclt.client.portfolio', locale)}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium" style={{ color: NAVY }}>{client.full_name}</span>
        </div>

        {/* "Voir comme le client" toggle */}
        <Button
          variant={viewAsClient ? "default" : "outline"}
          size="sm"
          className="gap-2 text-sm"
          style={
            viewAsClient
              ? { backgroundColor: NAVY, color: "#fff" }
              : { borderColor: NAVY, color: NAVY }
          }
          onClick={() => setViewAsClient((v) => !v)}
        >
          <Eye className="h-4 w-4" />
          {viewAsClient ? t('cabclt.client.accountant_view', locale) : t('cabclt.client.view_as_client', locale)}
        </Button>
      </div>

      {/* Client info header */}
      <Card style={{ borderLeft: `4px solid ${GOLD}`, backgroundColor: `${NAVY}06` }}>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div
              className="flex items-center justify-center h-16 w-16 rounded-full text-white text-xl font-bold shrink-0"
              style={{ backgroundColor: NAVY }}
            >
              {initials}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center flex-wrap gap-3">
                <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
                  {client.full_name}
                </h1>
                <Badge
                  className={
                    client.role === "client_admin"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : "bg-gray-50 text-gray-600 border-gray-200"
                  }
                >
                  {client.role === "client_admin" ? t('cabclt.client.role_admin', locale) : t('cabclt.client.role_user', locale)}
                </Badge>
                <Badge
                  className={
                    client.is_active
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }
                >
                  {client.is_active ? t('cabclt.client.active', locale) : t('cabclt.client.inactive', locale)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" />
                  {client.email}
                </span>
                {client.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {client.phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {t('cabclt.client.client_since', locale)}{" "}
                  {new Date(client.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {societes.length} {societes.length !== 1 ? t('cabclt.client.companies', locale) : t('cabclt.client.company', locale)}
                </span>
              </div>
            </div>

            {/* Summary badges */}
            <div className="flex gap-3 flex-wrap shrink-0">
              {alertesByCriticite.critique.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-700">
                    {alertesByCriticite.critique.length} {alertesByCriticite.critique.length > 1 ? t('cabclt.client.critical_plural', locale) : t('cabclt.client.critical', locale)}
                  </span>
                </div>
              )}
              {alertesByCriticite.important.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-700">
                    {alertesByCriticite.important.length} {alertesByCriticite.important.length > 1 ? t('cabclt.client.important_plural', locale) : t('cabclt.client.important', locale)}
                  </span>
                </div>
              )}
              {alertes.length === 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">{t('cabclt.client.no_alert', locale)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === "Voir comme le client" mode === */}
      {viewAsClient && societes.length > 0 && (
        <Card className="border-2" style={{ borderColor: NAVY }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
              <Eye className="h-4 w-4" />
              {t('cabclt.client.quick_access_title', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('cabclt.client.quick_access_desc_pre', locale)}{" "}
              <span className="font-semibold">{client.full_name}</span> {t('cabclt.client.quick_access_desc_post', locale)}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[
                { href: `/comptable/clients/${clientId}/${societes[0].id}`, label: t('cabclt.client.overview', locale), icon: BarChart3 },
                { href: `/comptable/clients/${clientId}/${societes[0].id}/grand-livre`, label: t('cabclt.client.mod_ledger', locale), icon: BookOpen },
                { href: `/comptable/clients/${clientId}/${societes[0].id}/balance`, label: t('cabclt.client.mod_balance', locale), icon: Scale },
                { href: `/comptable/clients/${clientId}/${societes[0].id}/bilan`, label: t('cabclt.client.mod_bilan', locale), icon: TrendingUp },
                { href: `/comptable/clients/${clientId}/${societes[0].id}/tva`, label: t('cabclt.client.mod_vat_mra', locale), icon: Receipt },
                { href: `/comptable/clients/${clientId}/${societes[0].id}/salaires`, label: t('cabclt.client.mod_salaries_hr', locale), icon: Wallet },
                { href: `/comptable/clients/${clientId}/${societes[0].id}/it-form3`, label: t('cabclt.client.mod_itform3', locale), icon: Calculator },
                { href: `/comptable/clients/${clientId}/${societes[0].id}/documents`, label: t('cabclt.client.mod_documents', locale), icon: FolderOpen },
              ].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="flex flex-col items-center gap-2 py-4 text-center">
                      <Icon className="h-5 w-5" style={{ color: GOLD }} />
                      <span className="text-xs font-medium" style={{ color: NAVY }}>{label}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            {societes.length > 1 && (
              <p className="text-xs text-muted-foreground italic">
                {t('cabclt.client.first_company_note_pre', locale)} ({societes[0].nom}). {t('cabclt.client.first_company_note_post', locale)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Societes grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
            {t('cabclt.client.companies_title', locale)} ({societes.length})
          </h2>
        </div>

        {societes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">{t('cabclt.client.no_companies', locale)}</p>
              <p className="text-sm">{t('cabclt.client.no_linked_companies', locale)}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {societes.map((soc) => {
              const fin = financials[soc.id]
              const modules = MODULE_LINKS(clientId, soc.id, locale)
              return (
                <Card
                  key={soc.id}
                  className="border-l-4 overflow-hidden"
                  style={{ borderLeftColor: GOLD }}
                >
                  {/* Société header — clickable */}
                  <CardHeader
                    className="cursor-pointer hover:bg-muted/40 transition-colors pb-3"
                    onClick={() => router.push(`/comptable/clients/${clientId}/${soc.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5" style={{ color: NAVY }} />
                        <div>
                          <h3 className="text-base font-bold" style={{ color: NAVY }}>
                            {soc.nom}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {soc.brn && (
                              <span className="text-xs text-muted-foreground">{t('cabclt.client.brn_label', locale)} {soc.brn}</span>
                            )}
                            <Badge
                              variant="outline"
                              className={
                                soc.statut_tva
                                  ? "text-xs bg-green-50 text-green-700 border-green-200"
                                  : "text-xs bg-gray-50 text-gray-500 border-gray-200"
                              }
                            >
                              {t('cabclt.client.vat_label', locale)} {soc.statut_tva ? t('cabclt.client.vat_subject', locale) : t('cabclt.client.vat_not_subject', locale)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold"
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              const r = await fetch("/api/comptable/act-as", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ societe_id: soc.id }),
                              })
                              const j = await r.json()
                              if (!r.ok) throw new Error(j.error)
                              window.location.href = "/client/tableau-de-bord"
                            } catch (err: any) {
                              alert(err?.message || t('cpta.clidet_enter_file_error', locale))
                            }
                          }}
                          title={t('cpta.clidet_enter_client_mode_tooltip', locale)}
                        >
                          {t('cpta.clidet_enter_client_mode', locale)}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          style={{ borderColor: NAVY, color: NAVY }}
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/comptable/clients/${clientId}/${soc.id}`)
                          }}
                        >
                          {t('cabclt.client.open_file', locale)}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    {/* Financial KPI mini-strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {fin?.loading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="rounded-lg border p-3 animate-pulse bg-muted/40 h-16" />
                        ))
                      ) : fin?.error ? (
                        <div className="col-span-4 text-xs text-muted-foreground italic py-2">
                          {t('cabclt.client.no_financial_data', locale)}
                        </div>
                      ) : fin ? (
                        <>
                          <div className="rounded-lg border p-3 space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" /> {t('cabclt.client.revenue', locale)}
                            </p>
                            <p className="text-sm font-bold text-green-700">{fmt(fin.ca)}</p>
                          </div>
                          <div className="rounded-lg border p-3 space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <TrendingDown className="h-3 w-3" /> {t('cabclt.client.charges', locale)}
                            </p>
                            <p className="text-sm font-bold text-red-600">{fmt(fin.charges)}</p>
                          </div>
                          <div className="rounded-lg border p-3 space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <BarChart3 className="h-3 w-3" /> {t('cabclt.client.profit', locale)}
                            </p>
                            <p
                              className="text-sm font-bold"
                              style={{ color: fin.resultat >= 0 ? "#16A34A" : "#DC2626" }}
                            >
                              {fmt(fin.resultat)}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3 space-y-0.5">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Landmark className="h-3 w-3" /> {t('cabclt.client.treasury', locale)}
                            </p>
                            <p className="text-sm font-bold" style={{ color: NAVY }}>
                              {fmt(fin.tresorerie)}
                            </p>
                          </div>
                        </>
                      ) : null}
                    </div>

                    {/* Quick-access module links */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                        {t('cabclt.client.quick_access_modules', locale)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {modules.map(({ href, label, icon: Icon }) => (
                          <Link key={href} href={href}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs h-7"
                              style={{ borderColor: `${NAVY}40`, color: NAVY }}
                            >
                              <Icon className="h-3 w-3" />
                              {label}
                            </Button>
                          </Link>
                        ))}
                      </div>
                    </div>

                    {/* Doc / écriture stats */}
                    {fin && !fin.loading && !fin.error && (fin.totalDocuments > 0 || fin.totalEcritures > 0) && (
                      <div className="flex gap-4 text-xs text-muted-foreground border-t pt-3">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5" />
                          <strong>{fin.totalDocuments}</strong> {fin.totalDocuments !== 1 ? t('cabclt.client.documents_plural', locale) : t('cabclt.client.documents_singular', locale)}
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3.5 w-3.5" />
                          <strong>{fin.totalEcritures}</strong> {fin.totalEcritures !== 1 ? t('cabclt.client.entries_plural', locale) : t('cabclt.client.entries_singular', locale)}
                        </span>
                        {soc.derniere_activite && (
                          <span className="flex items-center gap-1 ml-auto">
                            <Clock className="h-3.5 w-3.5" />
                            {t('cabclt.client.file_created_on', locale)}{" "}
                            {new Date(soc.derniere_activite).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Alertes */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
          {t('cabclt.client.active_alerts', locale)} ({alertes.length})
        </h2>
        {alertes.length === 0 ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center gap-3 pt-6">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-green-700 font-medium">{t('cabclt.client.no_active_alerts', locale)}</span>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {alertes.map((alerte) => (
              <Card key={alerte.id} className="py-0">
                <CardContent className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1 ${alertDotColor(alerte.niveau)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{alerte.titre}</p>
                        {alerte.societeName && (
                          <Badge variant="outline" className="text-xs">
                            {alerte.societeName}
                          </Badge>
                        )}
                      </div>
                      {alerte.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{alerte.description}</p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-xs shrink-0 ${
                        alerte.niveau === "critique"
                          ? "bg-red-100 text-red-700"
                          : alerte.niveau === "important"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {alerte.niveau}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Back button */}
      <div>
        <Link href="/comptable/clients">
          <Button variant="outline" className="gap-2" style={{ borderColor: NAVY, color: NAVY }}>
            <ArrowLeft className="h-4 w-4" />
            {t('cabclt.client.back_portfolio', locale)}
          </Button>
        </Link>
      </div>
    </div>
  )
}
