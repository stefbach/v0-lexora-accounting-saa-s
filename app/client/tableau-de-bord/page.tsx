"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, FileText, Users, TrendingUp, AlertCircle, Plus, ArrowRight, Loader2, Banknote, Receipt, UserCog } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface Societe { id: string; nom: string; brn: string; statut: string }
interface Stats {
  ca: number; depenses: number; benefice: number; tresorerie: number
  nb_employes: number; nb_documents: number; nb_docs_en_attente: number
  tva_due: number; derniere_ecriture: string | null
}

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " MUR" }

export default function TableauDeBord() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selected, setSelected] = useState<string>("all")
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  // Charger les sociétés
  useEffect(() => {
    fetch("/api/client/societes")
      .then(r => r.json())
      .then(d => {
        setSocietes(d.societes || [])
        if (d.societes?.length === 1) setSelected(d.societes[0].id)
      })
  }, [])

  // Charger les stats financières
  useEffect(() => {
    setLoading(true)
    const url = selected && selected !== "all"
      ? `/api/client/financial?societe_id=${selected}`
      : "/api/client/financial"
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d && !d.error) setStats(d)
        else setStats(null)
        setLoading(false)
      })
      .catch(() => { setStats(null); setLoading(false) })
  }, [selected])

  const mois = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  const societeActive = societes.find(s => s.id === selected)

  if (profileLoading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]" />
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">
            Bonjour {profile?.full_name?.split(" ")[0] || ""}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5 capitalize">{mois}</p>
        </div>
        {societes.length > 1 && (
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Toutes les sociétés" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes mes sociétés</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {societes.length === 1 && (
          <div className="text-right">
            <p className="font-semibold text-[#1E2A4A]">{societes[0].nom}</p>
            {societes[0].brn && <p className="text-xs text-gray-400">BRN : {societes[0].brn}</p>}
          </div>
        )}
      </div>

      {/* Pas de société → onboarding */}
      {societes.length === 0 && (
        <Card className="border-2 border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5">
          <CardContent className="p-8 text-center space-y-4">
            <Building2 className="w-12 h-12 mx-auto text-[#C9A84C]" />
            <div>
              <p className="text-lg font-bold text-[#1E2A4A]">Bienvenue sur LEXORA</p>
              <p className="text-sm text-gray-500 mt-1">Commencez par créer votre société pour accéder à tous les modules.</p>
            </div>
            <Link href="/client/societes">
              <Button className="bg-[#1E2A4A]">
                <Plus className="w-4 h-4 mr-2" /> Créer ma société
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      {societes.length > 0 && (
        <>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <Card key={i}><CardContent className="p-4">
                  <div className="h-4 bg-gray-100 rounded animate-pulse mb-2 w-2/3" />
                  <div className="h-7 bg-gray-100 rounded animate-pulse w-full" />
                </CardContent></Card>
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Chiffre d'Affaires", value: stats.ca, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
                { label: "Dépenses", value: stats.depenses, icon: Receipt, color: "text-red-500", bg: "bg-red-50" },
                { label: "Bénéfice", value: stats.benefice, icon: TrendingUp, color: stats.benefice >= 0 ? "text-green-600" : "text-red-500", bg: stats.benefice >= 0 ? "bg-green-50" : "bg-red-50" },
                { label: "Trésorerie", value: stats.tresorerie, icon: Banknote, color: "text-blue-600", bg: "bg-blue-50" },
              ].map(k => (
                <Card key={k.label}>
                  <CardContent className="p-4">
                    <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center mb-2`}>
                      <k.icon className={`w-4 h-4 ${k.color}`} />
                    </div>
                    <p className="text-xs text-gray-500">{k.label}</p>
                    <p className={`text-lg font-bold ${k.color} mt-0.5`}>
                      {k.value !== 0 ? fmt(k.value) : <span className="text-sm text-gray-400 font-normal">Pas de données</span>}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card><CardContent className="p-6 text-center text-gray-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-orange-400" />
              <p>Aucune donnée financière disponible.</p>
              <p className="text-sm mt-1">Uploadez vos relevés bancaires et factures pour voir vos chiffres.</p>
            </CardContent></Card>
          )}

          {/* Actions rapides */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Documents</p>
                    {stats && stats.nb_docs_en_attente > 0 && (
                      <Badge className="bg-orange-100 text-orange-700 text-xs">{stats.nb_docs_en_attente} en attente</Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">Uploadez factures, relevés, justificatifs</p>
                <Link href="/client/documents">
                  <Button variant="outline" size="sm" className="w-full">
                    Accéder <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Mon Équipe</p>
                    {stats && stats.nb_employes > 0 && (
                      <span className="text-xs text-gray-400">{stats.nb_employes} employé{stats.nb_employes > 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">Gérer les accès RH, Juridique, Employés</p>
                <Link href="/client/equipe">
                  <Button variant="outline" size="sm" className="w-full">
                    Accéder <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">États Financiers</p>
                    {stats?.derniere_ecriture && (
                      <span className="text-xs text-gray-400">Mis à jour {new Date(stats.derniere_ecriture).toLocaleDateString('fr-FR')}</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-3">Grand Livre, Bilan, P&L, TVA</p>
                <Link href="/client/bilan">
                  <Button variant="outline" size="sm" className="w-full">
                    Accéder <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Mes sociétés */}
          {societes.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-[#1E2A4A]">Mes Sociétés</h2>
                <Link href="/client/societes">
                  <Button variant="ghost" size="sm" className="text-xs">Gérer <ArrowRight className="w-3 h-3 ml-1" /></Button>
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {societes.map(s => (
                  <Card key={s.id} className="border-l-4 border-l-[#1E2A4A]">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{s.nom}</p>
                        {s.brn && <p className="text-xs text-gray-400">BRN : {s.brn}</p>}
                        <Badge variant="outline" className="text-xs mt-1">{s.statut || 'active'}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/client/documents?societe_id=${s.id}`}>
                          <Button variant="ghost" size="sm" title="Documents"><FileText className="w-4 h-4" /></Button>
                        </Link>
                        <Link href={`/client/equipe?societe_id=${s.id}`}>
                          <Button variant="ghost" size="sm" title="Équipe"><UserCog className="w-4 h-4" /></Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Link href="/client/societes">
                  <Card className="border-dashed border-2 border-gray-200 hover:border-[#C9A84C] transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-2 text-gray-400 hover:text-[#C9A84C]">
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">Ajouter une société</span>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
