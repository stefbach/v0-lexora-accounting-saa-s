"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import {
  Plus,
  Search,
  FileText,
  Clock,
  CheckCircle2,
  Send,
  Archive,
  PenLine,
  Eye,
  Loader2,
  FilePen,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { TYPES_CONTRATS, STATUTS_CONTRATS } from "@/lib/contrats/constants"
import { t, getLocale } from "@/lib/i18n"

interface Contrat {
  id: string
  reference: string
  titre: string
  type_contrat: string
  statut: string
  montant_total: number | null
  devise: string
  created_at: string
  date_signature_client: string | null
  client?: { full_name: string; email: string }
  societe?: { nom: string }
  comptable?: { full_name: string }
}

const STATUT_CONFIG: Record<string, { labelKey: string; color: string; icon: React.ReactNode }> = {
  brouillon: { labelKey: 'cptb.contrats.statut_brouillon', color: 'bg-gray-100 text-gray-700', icon: <PenLine className="w-3 h-3" /> },
  en_revision: { labelKey: 'cptb.contrats.statut_en_revision', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="w-3 h-3" /> },
  valide: { labelKey: 'cptb.contrats.statut_valide', color: 'bg-blue-100 text-blue-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  envoye: { labelKey: 'cptb.contrats.statut_envoye', color: 'bg-purple-100 text-purple-700', icon: <Send className="w-3 h-3" /> },
  signe: { labelKey: 'cptb.contrats.statut_signe', color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="w-3 h-3" /> },
  archive: { labelKey: 'cptb.contrats.statut_archive', color: 'bg-gray-100 text-gray-500', icon: <Archive className="w-3 h-3" /> },
  resilie: { labelKey: 'cptb.contrats.statut_resilie', color: 'bg-red-100 text-red-700', icon: <FileText className="w-3 h-3" /> },
}

export default function ContratsPage() {
  const locale = getLocale()
  const router = useRouter()
  const pathname = usePathname() || ""
  // Préfixe d'espace : /client/contrats côté client_admin / direction,
  // /comptable/contrats côté équipe comptable. Permet de garder l'utilisateur
  // dans son espace lors de la navigation interne (détail, rediger).
  const basePath = pathname.startsWith("/client/") ? "/client/contrats" : "/comptable/contrats"
  // Société active : on n'affiche QUE les contrats de cette société pour
  // garder une isolation logique (un contrat appartient à une société,
  // pas à un utilisateur global).
  const { societeId } = useSocieteActive()
  const [contrats, setContrats] = useState<Contrat[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreType, setFiltreType] = useState('tous')
  const [total, setTotal] = useState(0)

  const chargerContrats = useCallback(async () => {
    if (!societeId) {
      setContrats([])
      setTotal(0)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('societe_id', societeId)
      if (search) params.set('search', search)
      if (filtreStatut !== 'tous') params.set('statut', filtreStatut)
      if (filtreType !== 'tous') params.set('type_contrat', filtreType)
      params.set('limit', '30')

      const res = await fetch(`/api/contrats?${params}`)
      const { data, count } = await res.json()
      setContrats(data || [])
      setTotal(count || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [societeId, search, filtreStatut, filtreType])

  useEffect(() => {
    const timer = setTimeout(chargerContrats, 300)
    return () => clearTimeout(timer)
  }, [chargerContrats])

  const creerContrat = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/contrats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: 'Nouveau contrat',
          type_contrat: 'autre',
          societe_id: societeId || null,
        }),
      })
      const { data } = await res.json()
      if (data?.id) {
        router.push(`${basePath}/${data.id}/rediger`)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const stats = {
    brouillons: contrats.filter(c => c.statut === 'brouillon').length,
    en_cours: contrats.filter(c => ['en_revision', 'valide', 'envoye'].includes(c.statut)).length,
    signes: contrats.filter(c => c.statut === 'signe').length,
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FilePen className="w-7 h-7 text-blue-600" />
            {t('cab.contrats.title', locale)}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {t('cab.contrats.subtitle', locale)}
          </p>
        </div>
        <Button
          onClick={creerContrat}
          disabled={creating}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          {t('cab.contrats.new', locale)}
        </Button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <PenLine className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.brouillons}</p>
              <p className="text-sm text-gray-500">{t('cab.contrats.drafts', locale)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.en_cours}</p>
              <p className="text-sm text-gray-500">{t('cab.contrats.in_progress', locale)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.signes}</p>
              <p className="text-sm text-gray-500">{t('cab.contrats.signed', locale)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder={t('cab.contrats.search', locale)}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtreStatut} onValueChange={setFiltreStatut}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('cptb.contrats.statut_placeholder', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">{t('cab.contrats.all_status', locale)}</SelectItem>
            {STATUTS_CONTRATS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtreType} onValueChange={setFiltreType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('cptb.contrats.type_placeholder', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tous">{t('cab.contrats.all_types', locale)}</SelectItem>
            {TYPES_CONTRATS.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500 self-center ml-auto">
          {total} {total > 1 ? t('cptb.contrats.count_plural', locale) : t('cptb.contrats.count_singular', locale)}
        </span>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : contrats.length === 0 ? (
        <div className="text-center py-16">
          <FilePen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('cab.contrats.empty', locale)}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={creerContrat}
            disabled={creating}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('cab.contrats.create_first', locale)}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {contrats.map(contrat => {
            const statutConfig = STATUT_CONFIG[contrat.statut] || STATUT_CONFIG.brouillon
            const typeLabel = TYPES_CONTRATS.find(t => t.value === contrat.type_contrat)?.label || contrat.type_contrat

            return (
              <div
                key={contrat.id}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">{contrat.titre}</p>
                        <span className="text-xs text-gray-400 flex-shrink-0">{contrat.reference}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{typeLabel}</span>
                        {contrat.client && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-500">{contrat.client.full_name}</span>
                          </>
                        )}
                        {contrat.societe && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-500">{contrat.societe.nom}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {contrat.montant_total && (
                      <span className="text-sm font-medium text-gray-700">
                        {contrat.montant_total.toLocaleString('fr-FR')} {contrat.devise}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statutConfig.color}`}>
                      {statutConfig.icon}
                      {t(statutConfig.labelKey, locale)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(contrat.created_at).toLocaleDateString('fr-FR')}
                    </span>
                    <div className="flex gap-1">
                      <Link href={`${basePath}/${contrat.id}/rediger`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <PenLine className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Link href={`${basePath}/${contrat.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
