'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, UserCog, Building2, FileText, Briefcase, Loader2, ArrowRight, Activity
} from 'lucide-react'
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { t, getLocale } from '@/lib/i18n'

interface ComptableKPI {
  id: string
  full_name: string
  email: string
  nb_clients: number
  nb_documents: number
}

interface ClientKPI {
  id: string
  full_name: string
  email: string
  nb_societes: number
  nb_documents: number
}

interface RecentUser {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  super_admin: 'Super Admin',
  comptable: 'Comptable',
  comptable_dedie: 'Comptable Dedie',
  client_admin: 'Client Admin',
  client_user: 'Client Utilisateur',
  rh: 'RH',
  direction: 'Direction',
  juridique: 'Juridique',
  manager: 'Manager',
  employe: 'Employe',
}

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"
const SECONDARY = "#4A5490"

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR')

// Premium card style
const panelStyle = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow:
    "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
}

export default function AdminDashboardPage() {
  const locale = getLocale()
  const [loading, setLoading] = useState(true)
  const [totalUsers, setTotalUsers] = useState(0)
  const [totalClients, setTotalClients] = useState(0)
  const [totalComptables, setTotalComptables] = useState(0)
  const [totalSocietes, setTotalSocietes] = useState(0)
  const [totalDocuments, setTotalDocuments] = useState(0)
  const [comptableKpis, setComptableKpis] = useState<ComptableKPI[]>([])
  const [clientKpis, setClientKpis] = useState<ClientKPI[]>([])
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()

        // Fetch all profiles
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, created_at')
          .order('created_at', { ascending: false })

        const allProfiles = profiles || []

        // Counts
        setTotalUsers(allProfiles.length)
        const clients = allProfiles.filter(p => ['client_admin', 'client_user'].includes(p.role))
        setTotalClients(clients.length)
        const comptables = allProfiles.filter(p => ['comptable', 'comptable_dedie'].includes(p.role))
        setTotalComptables(comptables.length)

        // Recent users (last 5)
        setRecentUsers(allProfiles.slice(0, 5))

        // Societes count
        const { count: nbSocietes } = await supabase
          .from('societes')
          .select('*', { count: 'exact', head: true })
        setTotalSocietes(nbSocietes || 0)

        // Documents count
        const { count: nbDocs } = await supabase
          .from('documents')
          .select('*', { count: 'exact', head: true })
        setTotalDocuments(nbDocs || 0)

        // Dossiers for relationships
        const { data: dossiers } = await supabase
          .from('dossiers')
          .select('id, client_id, comptable_id, societe_id')

        const allDossiers = dossiers || []

        // Documents per dossier for comptable KPIs
        const { data: allDocs } = await supabase
          .from('documents')
          .select('id, dossier_id')

        const docsByDossier: Record<string, number> = {}
        for (const doc of allDocs || []) {
          if (doc.dossier_id) {
            docsByDossier[doc.dossier_id] = (docsByDossier[doc.dossier_id] || 0) + 1
          }
        }

        // KPI par comptable
        const comptableMap: Record<string, { clients: Set<string>; docs: number }> = {}
        for (const d of allDossiers) {
          if (d.comptable_id) {
            if (!comptableMap[d.comptable_id]) {
              comptableMap[d.comptable_id] = { clients: new Set(), docs: 0 }
            }
            if (d.client_id) comptableMap[d.comptable_id].clients.add(d.client_id)
            comptableMap[d.comptable_id].docs += docsByDossier[d.id] || 0
          }
        }

        const comptableKpiList: ComptableKPI[] = comptables.map(c => ({
          id: c.id,
          full_name: c.full_name || c.email,
          email: c.email,
          nb_clients: comptableMap[c.id]?.clients.size || 0,
          nb_documents: comptableMap[c.id]?.docs || 0,
        }))
        setComptableKpis(comptableKpiList)

        // KPI par client
        const clientMap: Record<string, { societes: Set<string>; docs: number }> = {}
        for (const d of allDossiers) {
          if (d.client_id) {
            if (!clientMap[d.client_id]) {
              clientMap[d.client_id] = { societes: new Set(), docs: 0 }
            }
            if (d.societe_id) clientMap[d.client_id].societes.add(d.societe_id)
            clientMap[d.client_id].docs += docsByDossier[d.id] || 0
          }
        }

        const clientKpiList: ClientKPI[] = clients.map(c => ({
          id: c.id,
          full_name: c.full_name || c.email,
          email: c.email,
          nb_societes: clientMap[c.id]?.societes.size || 0,
          nb_documents: clientMap[c.id]?.docs || 0,
        }))
        setClientKpis(clientKpiList)
      } catch (err) {
        console.error('Erreur dashboard admin:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const kpiCards = [
    { titre: t('adm.dash.kpi_total_users', locale),       valeur: totalUsers,      icon: Users,     strong: "#4191FF", dark: "#1D5FC4", href: '/admin/users' },
    { titre: t('adm.dash.kpi_total_clients', locale),     valeur: totalClients,    icon: Briefcase, strong: "#D4AF37", dark: "#A88925", href: '/admin/clients' },
    { titre: t('adm.dash.kpi_total_accountants', locale), valeur: totalComptables, icon: UserCog,   strong: "#8B5CF6", dark: "#6D3EE0", href: '/admin/comptables' },
    { titre: t('adm.dash.kpi_total_companies', locale),   valeur: totalSocietes,   icon: Building2, strong: "#2ECC8A", dark: "#1F9B68", href: '/admin/societes' },
    { titre: t('adm.dash.kpi_stored_docs', locale),       valeur: totalDocuments,  icon: FileText,  strong: "#E25555", dark: "#B93B3B", href: '/admin/documents' },
  ]

  const now = new Date()
  const dateFr = now.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('adm.dash.breadcrumb_admin', locale), href: "/admin" }, { label: t('adm.dash.breadcrumb_current', locale) }]}
      kicker={`${t('adm.dash.kicker', locale)} · ${dateFr}`}
      title={t('adm.dash.title', locale)}
      subtitle={t('adm.dash.subtitle', locale)}
    >
      <div className="space-y-6 max-w-[1400px] mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: NAVY }} />
          </div>
        ) : (
          <>
            {/* KPI Cards — premium pattern */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {kpiCards.map(card => (
                <Link key={card.titre} href={card.href} className="group">
                  <article
                    className="relative overflow-hidden h-full cursor-pointer transition-all duration-200 group-hover:-translate-y-1"
                    style={{
                      background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
                      border: "1px solid #D8DFED",
                      borderRadius: "16px",
                      boxShadow:
                        "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
                    }}
                  >
                    {/* Top accent stripe */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-[3px]"
                      style={{ background: `linear-gradient(90deg, ${card.strong} 0%, ${card.strong}33 100%)` }}
                    />
                    {/* Corner glow */}
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        top: "-60px",
                        right: "-60px",
                        width: "160px",
                        height: "160px",
                        borderRadius: "50%",
                        background: `radial-gradient(circle, ${card.strong}22 0%, transparent 70%)`,
                        pointerEvents: "none",
                      }}
                    />
                    <div className="relative p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div
                          aria-hidden="true"
                          className="flex h-11 w-11 items-center justify-center rounded-xl"
                          style={{
                            background: `linear-gradient(135deg, ${card.strong}22 0%, ${card.strong}08 100%)`,
                            border: `1px solid ${card.strong}44`,
                            boxShadow: `0 10px 24px -10px ${card.strong}55, inset 0 1px 0 rgba(255,255,255,0.4)`,
                            color: card.dark,
                          }}
                        >
                          <card.icon className="w-5 h-5" strokeWidth={1.8} />
                        </div>
                        <ArrowRight
                          className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-1"
                          style={{ color: card.dark }}
                        />
                      </div>
                      <p
                        className="text-[11px] font-bold uppercase"
                        style={{ color: "#475569", letterSpacing: "0.08em" }}
                      >
                        {card.titre}
                      </p>
                      <p
                        className="text-2xl font-bold mt-1"
                        style={{
                          color: NAVY,
                          fontFamily: "Poppins, sans-serif",
                          letterSpacing: "-0.02em",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {card.valeur}
                      </p>
                    </div>
                  </article>
                </Link>
              ))}
            </div>

            {/* KPI par comptable + KPI par client */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Par comptable */}
              <Card style={panelStyle}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${GOLD}22 0%, ${GOLD}08 100%)`,
                          border: `1px solid ${GOLD}44`,
                          color: "#A88925",
                        }}
                      >
                        <UserCog className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-sm font-semibold" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
                        {t('adm.dash.kpi_accountant', locale)}
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs" style={{ borderColor: "#D8DFED", color: SECONDARY }}>
                      {comptableKpis.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {comptableKpis.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('adm.dash.no_accountant', locale)}</p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {comptableKpis.map(c => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-white"
                          style={{
                            background: "linear-gradient(180deg, #F8FAFF 0%, #F1F5FC 100%)",
                            border: "1px solid #E4E9F4",
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{c.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            <Badge variant="outline" className="text-xs" style={{ borderColor: GOLD, color: NAVY }}>
                              {c.nb_clients} {c.nb_clients !== 1 ? t('adm2.dash.clients_many', locale) : t('adm2.dash.clients_one', locale)}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              {c.nb_documents} {c.nb_documents !== 1 ? t('adm2.dash.docs_many', locale) : t('adm2.dash.docs', locale)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Par client */}
              <Card style={panelStyle}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${BLUE}22 0%, ${BLUE}08 100%)`,
                          border: `1px solid ${BLUE}44`,
                          color: "#1D5FC4",
                        }}
                      >
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-sm font-semibold" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
                        {t('adm.dash.kpi_client', locale)}
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs" style={{ borderColor: "#D8DFED", color: SECONDARY }}>
                      {clientKpis.length}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {clientKpis.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('adm.dash.no_client', locale)}</p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {clientKpis.map(c => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-white"
                          style={{
                            background: "linear-gradient(180deg, #F8FAFF 0%, #F1F5FC 100%)",
                            border: "1px solid #E4E9F4",
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{c.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            <Badge variant="outline" className="text-xs" style={{ borderColor: GOLD, color: NAVY }}>
                              {c.nb_societes} {c.nb_societes !== 1 ? t('adm2.dash.societes_many', locale) : t('adm2.dash.societes_one', locale)}
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                              {c.nb_documents} {c.nb_documents !== 1 ? t('adm2.dash.docs_many', locale) : t('adm2.dash.docs', locale)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent user creations */}
            <Card style={panelStyle}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{
                      background: `linear-gradient(135deg, #2ECC8A22 0%, #2ECC8A08 100%)`,
                      border: `1px solid #2ECC8A44`,
                      color: "#1F9B68",
                    }}
                  >
                    <Activity className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold" style={{ color: NAVY, fontFamily: "Poppins, sans-serif" }}>
                    {t('adm.dash.recent_accounts', locale)}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {recentUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t('adm.dash.no_user', locale)}</p>
                ) : (
                  <div className="space-y-2">
                    {recentUsers.map(u => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{
                          background: "linear-gradient(180deg, #F8FAFF 0%, #F1F5FC 100%)",
                          border: "1px solid #E4E9F4",
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${NAVY} 0%, #1a2151 100%)`,
                              boxShadow: `0 6px 16px -6px rgba(11,15,46,0.45), inset 0 1px 0 rgba(255,255,255,0.1)`,
                            }}
                          >
                            {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: NAVY }}>{u.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <Badge variant="outline" className="text-xs" style={{ borderColor: GOLD, color: NAVY }}>
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ClientPageShell>
  )
}
