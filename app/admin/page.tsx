'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, UserCog, Building2, FileText, Briefcase, Loader2
} from 'lucide-react'
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR')

export default function AdminDashboardPage() {
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
    { titre: 'Total utilisateurs', valeur: totalUsers, icon: Users, color: '#0B0F2E', href: '/admin/users' },
    { titre: 'Total clients', valeur: totalClients, icon: Briefcase, color: '#D4AF37', href: '/admin/clients' },
    { titre: 'Total comptables', valeur: totalComptables, icon: UserCog, color: '#2563eb', href: '/admin/comptables' },
    { titre: 'Total societes', valeur: totalSocietes, icon: Building2, color: '#16a34a', href: '/admin/societes' },
    { titre: 'Stockage documents', valeur: totalDocuments, icon: FileText, color: '#7c3aed', href: '/admin/documents' },
  ]

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>Tableau de bord administrateur</h1>
          <p className="text-muted-foreground mt-1">Chargement...</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#0B0F2E' }} />
        </div>
      </div>
    )
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>
          Tableau de bord administrateur
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestion de la plateforme Lexora —{' '}
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {kpiCards.map(card => (
          <Link key={card.titre} href={card.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.titre}</CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: card.color + '20' }}>
                  <card.icon className="h-5 w-5" style={{ color: card.color }} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>{card.valeur}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* KPI par comptable + KPI par client */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Par comptable */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5" style={{ color: '#D4AF37' }} />
              <CardTitle className="text-sm">KPI par comptable</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {comptableKpis.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucun comptable enregistre</p>
            ) : (
              <div className="space-y-3">
                {comptableKpis.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {c.nb_clients} client{c.nb_clients !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        {c.nb_documents} doc{c.nb_documents !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Par client */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" style={{ color: '#D4AF37' }} />
              <CardTitle className="text-sm">KPI par client</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {clientKpis.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucun client enregistre</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {clientKpis.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {c.nb_societes} societe{c.nb_societes !== 1 ? 's' : ''}
                      </Badge>
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                        {c.nb_documents} doc{c.nb_documents !== 1 ? 's' : ''}
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
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" style={{ color: '#D4AF37' }} />
            <CardTitle className="text-sm">Derniers comptes crees</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Aucun utilisateur</p>
          ) : (
            <div className="space-y-2">
              {recentUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#0B0F2E] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {(u.full_name || u.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <Badge variant="outline" className="text-xs">{ROLE_LABELS[u.role] || u.role}</Badge>
                    <span className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </ClientPageShell>
  )
}
