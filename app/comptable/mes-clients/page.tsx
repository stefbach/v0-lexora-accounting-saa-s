"use client"
import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

interface SocieteClient {
  id: string
  nom: string
  brn: string
  ern: string
  type_acces: string
  nb_dossiers_en_cours: number
  docs_en_attente: number
  derniere_ecriture: string | null
}

export default function MesClientsPage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<SocieteClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/comptable/mes-societes")
      .then(r => r.json())
      .then(d => { setSocietes(d.societes || []); setLoading(false) })
  }, [])

  const badgeAcces = (type: string) => {
    if (type === 'comptable_dedie') return <Badge className="bg-purple-100 text-purple-800 text-xs">{t('cab.mes_clients.dedicated', locale)}</Badge>
    if (type === 'lecture') return <Badge variant="outline" className="text-xs">{t('cab.mes_clients.read', locale)}</Badge>
    return <Badge className="bg-blue-100 text-blue-800 text-xs">{t('cab.mes_clients.accountant', locale)}</Badge>
  }

  const totalDocs = societes.reduce((s, c) => s + (c.docs_en_attente || 0), 0)
  const totalDossiers = societes.reduce((s, c) => s + (c.nb_dossiers_en_cours || 0), 0)

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('cab.mes_clients.title', locale)}</h1>
        <p className="text-sm text-gray-500">{t('cab.mes_clients.subtitle', locale)}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">{t('cab.mes_clients.companies', locale)}</p>
          <p className="text-2xl font-bold text-[#0B0F2E]">{societes.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">{t('cab.mes_clients.docs_pending', locale)}</p>
          <p className={`text-2xl font-bold ${totalDocs > 0 ? 'text-orange-500' : 'text-green-600'}`}>{totalDocs}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">{t('cab.mes_clients.active_files', locale)}</p>
          <p className="text-2xl font-bold text-blue-600">{totalDossiers}</p>
        </CardContent></Card>
      </div>

      {/* Grille clients */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">{t('cab.mes_clients.loading', locale)}</div>
      ) : societes.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">{t('cab.mes_clients.empty', locale)}</p>
          <p className="text-sm mt-1">{t('cab.mes_clients.empty_hint', locale)}</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {societes.map(s => (
            <Card key={s.id} className="hover:shadow-md transition-shadow border-l-4 border-l-[#0B0F2E]">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-[#0B0F2E] text-base">{s.nom}</p>
                    {s.brn && <p className="text-xs text-gray-400">BRN : {s.brn}</p>}
                  </div>
                  {badgeAcces(s.type_acces)}
                </div>

                {/* Indicateurs */}
                <div className="flex gap-2 flex-wrap">
                  {s.docs_en_attente > 0 && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                      📄 {s.docs_en_attente} {s.docs_en_attente > 1 ? t('cpta.mescli_docs_pending_plural', locale) : t('cpta.mescli_docs_pending_singular', locale)}
                    </span>
                  )}
                  {s.nb_dossiers_en_cours > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      📁 {s.nb_dossiers_en_cours} {s.nb_dossiers_en_cours > 1 ? t('cpta.mescli_files_plural', locale) : t('cpta.mescli_files_singular', locale)}
                    </span>
                  )}
                  {s.derniere_ecriture && (
                    <span className="text-xs text-gray-400">
                      {t('cpta.mescli_last_entry', locale)} {new Date(s.derniere_ecriture).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
                    </span>
                  )}
                </div>

                {/* Boutons rapides */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link href={`/comptable/grand-livre?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">📒 {t('cpta.mescli_ledger', locale)}</Button>
                  </Link>
                  <Link href={`/client/documents?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      📄 {t('cpta.mescli_documents', locale)} {s.docs_en_attente > 0 && <span className="ml-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{s.docs_en_attente}</span>}
                    </Button>
                  </Link>
                  <Link href={`/rh/paie?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">👥 {t('cpta.mescli_payroll', locale)}</Button>
                  </Link>
                  <Link href={`/comptable/tva?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">🏛️ {t('cpta.mescli_vat', locale)}</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
