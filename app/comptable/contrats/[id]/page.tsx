"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  PenLine,
  Loader2,
  FileText,
  User,
  Building2,
  Calendar,
  Euro,
  CheckCircle2,
  Send,
  Archive,
  Download,
  History,
  RefreshCw,
  Sparkles,
  Clock,
  ChevronDown,
} from "lucide-react"
import { TYPES_CONTRATS, STATUTS_CONTRATS } from "@/lib/contrats/constants"
import { t, getLocale } from "@/lib/i18n"

interface Version {
  id: string
  version: number
  raison_modification: string
  created_at: string
}

interface Contrat {
  id: string
  reference: string
  titre: string
  type_contrat: string
  statut: string
  contenu_html: string | null
  parametres: Record<string, unknown>
  notes_internes: string | null
  montant_total: number | null
  devise: string
  date_debut: string | null
  date_fin: string | null
  created_at: string
  updated_at: string
  date_signature_client: string | null
  client?: { full_name: string; email: string; phone: string }
  societe?: { nom: string; brn: string }
  comptable?: { full_name: string }
  versions?: Version[]
}

const STATUT_TRANSITIONS: Record<string, string[]> = {
  brouillon: ['en_revision', 'archive'],
  en_revision: ['valide', 'brouillon', 'archive'],
  valide: ['envoye', 'en_revision', 'archive'],
  envoye: ['signe', 'en_revision', 'archive'],
  signe: ['archive'],
  archive: [],
  resilie: ['archive'],
}

export default function ContratDetailPage() {
  const locale = getLocale()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname() || ""
  const basePath = pathname.startsWith("/client/") ? "/client/contrats" : "/comptable/contrats"
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [contrat, setContrat] = useState<Contrat | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [notes, setNotes] = useState('')
  const [instructionModif, setInstructionModif] = useState('')
  const [showVersions, setShowVersions] = useState(false)
  const [activeTab, setActiveTab] = useState<'contrat' | 'dossier' | 'historique'>('contrat')

  useEffect(() => {
    const charger = async () => {
      try {
        const res = await fetch(`/api/contrats/${id}`)
        const { data } = await res.json()
        if (data) {
          setContrat(data)
          setNotes(data.notes_internes || '')
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    charger()
  }, [id])

  const changerStatut = async (nouveau_statut: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/contrats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: nouveau_statut }),
      })
      const { data } = await res.json()
      if (data) setContrat(prev => prev ? { ...prev, ...data } : data)
    } finally {
      setSaving(false)
    }
  }

  const sauvegarderNotes = async () => {
    setSaving(true)
    try {
      await fetch(`/api/contrats/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes_internes: notes }),
      })
    } finally {
      setSaving(false)
    }
  }

  const regenererContrat = async () => {
    if (!instructionModif.trim()) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/contrats/${id}/generer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions_modification: instructionModif }),
      })
      const { data } = await res.json()
      if (data) {
        setContrat(prev => prev ? { ...prev, ...data } : data)
        setInstructionModif('')
      }
    } finally {
      setRegenerating(false)
    }
  }

  const exporterPDF = () => {
    if (!contrat?.contenu_html) return
    const blob = new Blob([contrat.contenu_html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${contrat.reference || contrat.titre}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!contrat) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">{t('cab.contrat.not_found', locale)}</p>
        <Link href={basePath}>
          <Button variant="outline" className="mt-4">{t('cab.contrat.back', locale)}</Button>
        </Link>
      </div>
    )
  }

  const statutConfig = STATUTS_CONTRATS.find(s => s.value === contrat.statut)
  const typeLabel = TYPES_CONTRATS.find(t => t.value === contrat.type_contrat)?.label || contrat.type_contrat
  const transitionsDisponibles = STATUT_TRANSITIONS[contrat.statut] || []

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Panneau gauche — Dossier */}
      <div className="w-80 border-r bg-white flex flex-col flex-shrink-0 overflow-y-auto">
        {/* Header panneau */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Link href={basePath}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">{contrat.reference}</p>
              <h2 className="font-semibold text-gray-900 text-sm truncate">{contrat.titre}</h2>
            </div>
          </div>

          {/* Statut badge */}
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            contrat.statut === 'signe' ? 'bg-green-100 text-green-700' :
            contrat.statut === 'envoye' ? 'bg-purple-100 text-purple-700' :
            contrat.statut === 'valide' ? 'bg-blue-100 text-blue-700' :
            contrat.statut === 'en_revision' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {contrat.statut === 'signe' ? <CheckCircle2 className="w-3 h-3" /> :
             contrat.statut === 'envoye' ? <Send className="w-3 h-3" /> :
             <Clock className="w-3 h-3" />}
            {statutConfig?.label || contrat.statut}
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 border-b space-y-2">
          <Link href={`${basePath}/${id}/rediger`}>
            <Button variant="outline" className="w-full text-xs h-8 justify-start">
              <Sparkles className="w-3.5 h-3.5 mr-2 text-blue-600" />
              {t('cab.contrat.continue_ai', locale)}
            </Button>
          </Link>
          {contrat.contenu_html && (
            <Button
              variant="outline"
              className="w-full text-xs h-8 justify-start"
              onClick={exporterPDF}
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              {t('cab.contrat.export_html', locale)}
            </Button>
          )}
        </div>

        {/* Changer statut */}
        {transitionsDisponibles.length > 0 && (
          <div className="p-3 border-b">
            <p className="text-xs text-gray-500 font-medium mb-2">{t('cab.contrat.change_status', locale)}</p>
            <div className="space-y-1">
              {transitionsDisponibles.map(s => {
                const cfg = STATUTS_CONTRATS.find(x => x.value === s)
                return (
                  <button
                    key={s}
                    onClick={() => changerStatut(s)}
                    disabled={saving}
                    className="w-full text-left px-3 py-1.5 text-xs rounded-md hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                  >
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                    {cfg?.label || s}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Infos client */}
        <div className="p-3 border-b space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('cab.contrat.parties', locale)}</p>
          
          {contrat.client && (
            <div className="flex items-start gap-2">
              <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-800">{contrat.client.full_name}</p>
                <p className="text-xs text-gray-500">{contrat.client.email}</p>
              </div>
            </div>
          )}

          {contrat.societe && (
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-800">{contrat.societe.nom}</p>
                {contrat.societe.brn && (
                  <p className="text-xs text-gray-500">BRN: {contrat.societe.brn}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Paramètres structurés */}
        <div className="p-3 border-b space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t('cab.contrat.params_extracted', locale)}</p>
          <div className="space-y-1.5">
            {contrat.montant_total && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{t('cab.contrat.amount', locale)}</span>
                <span className="text-xs font-medium text-gray-800">
                  {contrat.montant_total.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')} {contrat.devise}
                </span>
              </div>
            )}
            {contrat.date_debut && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{t('cab.contrat.start', locale)}</span>
                <span className="text-xs font-medium text-gray-800">
                  {new Date(contrat.date_debut).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
                </span>
              </div>
            )}
            {contrat.date_fin && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{t('cab.contrat.end', locale)}</span>
                <span className="text-xs font-medium text-gray-800">
                  {new Date(contrat.date_fin).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
                </span>
              </div>
            )}
            {!!contrat.parametres?.periodicite_facturation && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{t('cab.contrat.billing', locale)}</span>
                <span className="text-xs font-medium text-gray-800">
                  {String(contrat.parametres.periodicite_facturation)}
                </span>
              </div>
            )}
            {Array.isArray(contrat.parametres?.services) && (contrat.parametres.services as unknown[]).length > 0 && (
              <div>
                <span className="text-xs text-gray-500 block mb-1">{t('cab.contrat.services', locale)}</span>
                <div className="flex flex-wrap gap-1">
                  {(contrat.parametres.services as unknown[]).slice(0, 3).map((s, i) => (
                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {String(s)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modification ciblée */}
        {contrat.contenu_html && (
          <div className="p-3 border-b">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              {t('cab.contrat.modify_section', locale)}
            </p>
            <Textarea
              value={instructionModif}
              onChange={e => setInstructionModif(e.target.value)}
              placeholder={t('cab.contrat.modify_placeholder', locale)}
              className="text-xs min-h-[70px] resize-none"
            />
            <Button
              onClick={regenererContrat}
              disabled={!instructionModif.trim() || regenerating}
              size="sm"
              className="mt-2 w-full h-7 text-xs"
              variant="outline"
            >
              {regenerating ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              {t('cab.contrat.apply_change', locale)}
            </Button>
          </div>
        )}

        {/* Notes internes */}
        <div className="p-3 flex-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            {t('cab.contrat.internal_notes', locale)}
          </p>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={sauvegarderNotes}
            placeholder={t('cab.contrat.notes_placeholder', locale)}
            className="text-xs min-h-[80px] resize-none"
          />
        </div>

        {/* Versions */}
        {contrat.versions && contrat.versions.length > 0 && (
          <div className="p-3 border-t">
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700"
            >
              <span className="flex items-center gap-1">
                <History className="w-3 h-3" />
                {contrat.versions.length} {t('cab.contrat.version_label', locale)}{contrat.versions.length > 1 ? 's' : ''}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showVersions ? 'rotate-180' : ''}`} />
            </button>
            {showVersions && (
              <div className="mt-2 space-y-1">
                {contrat.versions.map(v => (
                  <div key={v.id} className="text-xs text-gray-500 flex justify-between">
                    <span>v{v.version} — {v.raison_modification}</span>
                    <span>{new Date(v.created_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Zone principale — Aperçu du contrat */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-500 font-medium">{typeLabel}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400">
            {t('cab.contrat.modified_on', locale)} {new Date(contrat.updated_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
          </span>
          {contrat.date_signature_client && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {t('cab.contrat.signed_on', locale)} {new Date(contrat.date_signature_client).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
              </span>
            </>
          )}
        </div>

        {/* Contenu */}
        {contrat.contenu_html ? (
          <div className="flex-1 overflow-auto bg-gray-100 p-6">
            <div className="max-w-4xl mx-auto shadow-lg">
              <iframe
                ref={iframeRef}
                srcDoc={contrat.contenu_html}
                className="w-full bg-white"
                style={{ minHeight: '1000px', border: 'none' }}
                title={t('cab.contrat.preview_title', locale)}
                onLoad={e => {
                  const iframe = e.target as HTMLIFrameElement
                  if (iframe.contentDocument) {
                    iframe.style.height = `${iframe.contentDocument.documentElement.scrollHeight + 50}px`
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-gray-600 font-medium mb-2">{t('cab.contrat.not_generated', locale)}</h3>
              <p className="text-gray-400 text-sm mb-4">
                {t('cab.contrat.not_generated_hint', locale)}
              </p>
              <Link href={`${basePath}/${id}/rediger`}>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Sparkles className="w-4 h-4 mr-2" />
                  {t('cab.contrat.draft_with_ai', locale)}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
