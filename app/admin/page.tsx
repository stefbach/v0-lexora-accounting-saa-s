'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, UserCog, Building2, FileText, AlertTriangle,
  TrendingUp, Clock, CheckCircle2, BarChart3
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPIs {
  nb_clients: number
  nb_comptables: number
  nb_societes: number
  nb_documents_mois: number
  nb_documents_en_attente: number
  nb_alertes_urgentes: number
  mrr_simule: number
}

interface DocumentMois {
  mois: string
  count: number
}

interface AlerteUrgente {
  id: string
  titre: string
  type_alerte: string
  date_echeance?: string
  societe_nom?: string
}

interface DernierDocument {
  id: string
  nom_fichier: string
  type_document: string
  created_at: string
  societe_nom?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-MU', { style: 'currency', currency: 'MUR', minimumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR')

function getMonthLabel(moisStr: string) {
  const [y, m] = moisStr.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function MiniBarChart({ data }: { data: DocumentMois[] }) {
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center flex-1 gap-1">
          <div
            className="w-full rounded-t"
            style={{
              height: `${(d.count / max) * 48}px`,
              backgroundColor: '#C9A84C',
              opacity: i === data.length - 1 ? 1 : 0.4 + (i / data.length) * 0.5,
              minHeight: d.count > 0 ? 4 : 0
            }}
          />
          <span className="text-muted-foreground" style={{ fontSize: 9 }}>
            {getMonthLabel(d.mois)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState<KPIs>({
    nb_clients: 0, nb_comptables: 0, nb_societes: 0,
    nb_documents_mois: 0, nb_documents_en_attente: 0,
    nb_alertes_urgentes: 0, mrr_simule: 0
  })
  const [docsMois, setDocsMois] = useState<DocumentMois[]>([])
  const [alertesUrgentes, setAlertesUrgentes] = useState<AlerteUrgente[]>([])
  const [derniersDocuments, setDerniersDocuments] = useState<DernierDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const now = new Date()
        const debutMois = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const dans7jours = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        const [
          { count: nbClients },
          { count: nbComptables },
          { count: nbSocietes },
          { count: nbDocsMois },
          { count: nbDocsAttente },
          { data: alertes },
          { data: derniersDocs },
          { data: societesList }
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true })
            .in('role', ['client_admin', 'client_user']),
          supabase.from('profiles').select('*', { count: 'exact', head: true })
            .in('role', ['comptable', 'comptable_dedie']),
          supabase.from('societes').select('*', { count: 'exact', head: true }),
          supabase.from('documents').select('*', { count: 'exact', head: true })
            .gte('created_at', debutMois),
          supabase.from('documents').select('*', { count: 'exact', head: true })
            .in('statut', ['en_attente', 'en_cours']),
          supabase.from('alertes')
            .select('id, titre, type_alerte, date_echeance, societes(nom)')
            .lte('date_echeance', dans7jours)
            .eq('statut', 'active')
            .order('date_echeance', { ascending: true })
            .limit(5),
          supabase.from('documents')
            .select('id, nom_fichier, type_document, created_at, societes(nom)')
            .order('created_at', { ascending: false })
            .limit(5),
          supabase.from('societes').select('id').limit(1000)
        ])

        // Documents par mois (6 derniers mois)
        const moisData: DocumentMois[] = []
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const debut = d.toISOString().split('T')[0]
          const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0]
          const { count } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', debut)
            .lte('created_at', fin + 'T23:59:59')
          moisData.push({
            mois: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            count: count || 0
          })
        }

        const mrr = (societesList?.length || 0) * 4500

        setKpis({
          nb_clients: nbClients || 0,
          nb_comptables: nbComptables || 0,
          nb_societes: nbSocietes || 0,
          nb_documents_mois: nbDocsMois || 0,
          nb_documents_en_attente: nbDocsAttente || 0,
          nb_alertes_urgentes: alertes?.length || 0,
          mrr_simule: mrr
        })

        setDocsMois(moisData)

        setAlertesUrgentes(
          (alertes || []).map(a => ({
            id: a.id,
            titre: a.titre,
            type_alerte: a.type_alerte,
            date_echeance: a.date_echeance,
            societe_nom: (a.societes as { nom?: string } | null)?.nom
          }))
        )

        setDerniersDocuments(
          (derniersDocs || []).map(d => ({
            id: d.id,
            nom_fichier: d.nom_fichier,
            type_document: d.type_document,
            created_at: d.created_at,
            societe_nom: (d.societes as { nom?: string } | null)?.nom
          }))
        )
      } catch (err) {
        console.error('Erreur dashboard admin:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const kpiCards = [
    { titre: 'Clients actifs', valeur: kpis.nb_clients, icon: Users, color: '#C9A84C', href: '/admin/clients' },
    { titre: 'Comptables', valeur: kpis.nb_comptables, icon: UserCog, color: '#1E2A4A', href: '/admin/comptables' },
    { titre: 'Sociétés actives', valeur: kpis.nb_societes, icon: Building2, color: '#16a34a', href: '/admin/clients' },
    { titre: 'MRR simulé', valeur: fmt(kpis.mrr_simule), icon: TrendingUp, color: '#7c3aed', href: '/admin/parametres' }
  ]

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1E2A4A' }}>Tableau de bord administrateur</h1>
          <p className="text-muted-foreground mt-1">Chargement des KPIs en temps réel...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6"><div className="h-16 bg-gray-200 rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#1E2A4A' }}>
          Tableau de bord administrateur
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestion de la plateforme Lexora —{' '}
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {kpis.nb_alertes_urgentes > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">
            {kpis.nb_alertes_urgentes} alerte(s) avec deadline dans les 7 prochains jours
          </span>
          <Link href="/comptable/alertes" className="ml-auto text-sm underline">Voir tout</Link>
        </div>
      )}

      {/* 4 cartes KPI */}
      <div className="grid gap-4 md:grid-cols-4">
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
                <p className="text-2xl font-bold" style={{ color: '#1E2A4A' }}>{card.valeur}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Documents + Graphique */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" style={{ color: '#C9A84C' }} />
              <CardTitle className="text-sm">Documents ce mois</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Uploadés ce mois</span>
              <span className="font-bold text-xl">{kpis.nb_documents_mois}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">En attente de validation</span>
              <Badge className={kpis.nb_documents_en_attente > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}>
                {kpis.nb_documents_en_attente}
              </Badge>
            </div>
            {kpis.nb_documents_en_attente === 0 && (
              <div className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Tous les documents sont traités</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" style={{ color: '#C9A84C' }} />
              <CardTitle className="text-sm">Documents uploadés — 6 derniers mois</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <MiniBarChart data={docsMois} />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Total période : {docsMois.reduce((s, d) => s + d.count, 0)}</span>
              <span>Mois courant : {docsMois[docsMois.length - 1]?.count || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertes + Dernières activités */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <CardTitle className="text-sm">Top 5 alertes urgentes</CardTitle>
              </div>
              <Link href="/comptable/alertes" className="text-xs text-muted-foreground hover:underline">Voir tout →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {alertesUrgentes.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 py-4">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm">Aucune alerte urgente</span>
              </div>
            ) : (
              <div className="space-y-2">
                {alertesUrgentes.map(a => {
                  const daysLeft = a.date_echeance
                    ? Math.ceil((new Date(a.date_echeance).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null
                  return (
                    <div key={a.id} className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-100">
                      <Clock className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.titre}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.societe_nom && <span>{a.societe_nom} • </span>}
                          {daysLeft !== null && daysLeft < 0
                            ? <span className="text-red-600 font-semibold">Dépassé de {Math.abs(daysLeft)} j</span>
                            : daysLeft !== null
                              ? <span>Dans {daysLeft} j — {a.date_echeance ? fmtDate(a.date_echeance) : ''}</span>
                              : null
                          }
                        </p>
                      </div>
                      <Badge className="text-xs shrink-0 bg-red-100 text-red-700">{a.type_alerte}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" style={{ color: '#C9A84C' }} />
                <CardTitle className="text-sm">Dernières activités</CardTitle>
              </div>
              <Link href="/comptable/documents" className="text-xs text-muted-foreground hover:underline">Voir tout →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {derniersDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Aucun document récent</p>
            ) : (
              <div className="space-y-2">
                {derniersDocuments.map(d => (
                  <div key={d.id} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.nom_fichier}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.societe_nom && <span>{d.societe_nom} • </span>}
                        {fmtDate(d.created_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{d.type_document}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
