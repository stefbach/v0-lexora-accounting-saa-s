"use client"

/**
 * Page /client/nouvelle-facture-ia — Assistant IA création de factures.
 *
 * Chat conversationnel : l'IA récupère contexte (société active, contacts,
 * catalogue, 10 dernières factures) et guide l'utilisateur jusqu'à la
 * création effective. Le bouton "Générer" apparaît dès que l'IA a
 * suffisamment d'infos (pret_a_generer=true).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Loader2,
  Sparkles,
  Send,
  ArrowLeft,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Eye,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from "@/lib/i18n"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp?: string
}

interface ParametresExtraits {
  type_document?: string
  tiers?: string
  contact_id?: string | null
  devise?: string
  taux_change?: number
  date_facture?: string
  date_echeance?: string
  lignes?: Array<{
    description: string
    quantite: number
    prix_unitaire: number
    taux_tva: number
    unite?: string | null
  }>
  remise_pct?: number
  remise_montant?: number
  facture_reference_id?: string | null
  recurrent?: boolean
  recurrence_periodicite?: string | null
}

interface Analyse {
  parametres_extraits: ParametresExtraits
  informations_manquantes: string[]
  pret_a_generer: boolean
  prochaine_question?: string
}

interface Contexte {
  societe: { id: string; nom: string; brn?: string; vat_number?: string; mra_fiscalisation_active?: boolean }
  user: { full_name?: string; email?: string }
  contacts: Array<{ id: string; nom?: string; entreprise?: string }>
  catalogue: Array<{ id: string; designation: string; prix_ht_mur?: number }>
  factures_recentes: Array<{ id: string; numero_facture?: string; tiers?: string; date_facture?: string; montant_ttc?: number; devise?: string }>
  prochain_numero?: { facture?: string; devis?: string; avoir?: string; note_debit?: string }
}

function fmtMontant(n: number, dev = "MUR") {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + dev
}

export default function NouvelleFactureIAPage() {
  const locale = getLocale()
  const router = useRouter()
  const { societeId } = useSocieteActive()
  const [contexte, setContexte] = useState<Contexte | null>(null)
  const [loadingContexte, setLoadingContexte] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [analyse, setAnalyse] = useState<Analyse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Charge le contexte au montage et affiche le message d'accueil
  const loadContexte = useCallback(async () => {
    if (!societeId) return
    setLoadingContexte(true)
    try {
      const r = await fetch(`/api/client/factures-ia/contexte?societe_id=${societeId}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('inv.nfia.err_context', locale))
      setContexte(j)
      // Message d'accueil construit localement (économise un round trip Claude)
      const nbContacts = j.contacts?.length || 0
      const nbCat = j.catalogue?.length || 0
      const nbFac = j.factures_recentes?.length || 0
      const recap: string[] = []
      if (nbContacts > 0) recap.push(`${nbContacts} ${nbContacts > 1 ? t('inv.nfia.clients_many', locale) : t('inv.nfia.clients_one', locale)}`)
      if (nbCat > 0) recap.push(`${nbCat} ${nbCat > 1 ? t('inv.nfia.articles_many', locale) : t('inv.nfia.articles_one', locale)}`)
      if (nbFac > 0) recap.push(`${nbFac} ${nbFac > 1 ? t('inv.nfia.invoice_many', locale) : t('inv.nfia.invoice_one', locale)}`)
      const ctxRecap = recap.length > 0 ? `${t('inv.nfia.welcome_have_access', locale)} ${recap.join(', ')}.\n\n` : ''
      setMessages([{
        role: "assistant",
        content: t('inv.nfia.welcome', locale)
          .replace('{nom}', j.societe?.nom || '?')
          .replace('{recap}', ctxRecap),
      }])
    } catch (e: any) {
      setErrorMsg(e?.message || t('inv.nfia.err_load_context', locale))
    } finally {
      setLoadingContexte(false)
    }
  }, [societeId, locale])

  useEffect(() => { loadContexte() }, [loadContexte])

  // Auto-scroll
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
  }, [messages, sending])

  async function sendMessage() {
    if (!input.trim() || !societeId || sending) return
    const userMsg: ChatMessage = { role: "user", content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setSending(true)
    setErrorMsg(null)
    try {
      const r = await fetch(`/api/client/factures-ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          historique: messages,
          message: userMsg.content,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('inv.nfia.err_ia', locale))
      setMessages(prev => [...prev, { role: "assistant", content: j.message }])
      setAnalyse(j.analyse || null)
    } catch (e: any) {
      setErrorMsg(e?.message || t('inv.nfia.err_ia', locale))
      // On retire le message user pour permettre re-essai propre
      setMessages(prev => prev.slice(0, -1))
      setInput(userMsg.content)
    } finally {
      setSending(false)
    }
  }

  async function genererFacture() {
    if (!analyse?.parametres_extraits || !societeId || generating) return
    setGenerating(true)
    setErrorMsg(null)
    try {
      const r = await fetch(`/api/client/factures-ia/generer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          parametres: analyse.parametres_extraits,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('inv.nfia.err_generate', locale))
      // Redirige vers l'aperçu
      router.push(j.preview_url || "/client/factures")
    } catch (e: any) {
      setErrorMsg(e?.message || t('inv.nfia.err_generate', locale))
    } finally {
      setGenerating(false)
    }
  }

  const params = analyse?.parametres_extraits || {}
  const totalLignesHT = (params.lignes || []).reduce((s, l) => s + (l.quantite * l.prix_unitaire), 0)
  const totalLignesTVA = (params.lignes || []).reduce((s, l) => s + (l.quantite * l.prix_unitaire * l.taux_tva / 100), 0)
  const totalTTC = totalLignesHT + totalLignesTVA - (params.remise_montant || (totalLignesHT * (params.remise_pct || 0) / 100))

  return (
    <ClientPageShell>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Link href="/client/nouvelle-facture">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" /> {t('inv.nfia.classic_mode', locale)}
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                {t('inv.nfia.title', locale)}
              </h1>
              {contexte?.societe && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Building2 className="h-3 w-3" />
                  {t('inv.nfia.for', locale)} <span className="font-medium">{contexte.societe.nom}</span>
                  {contexte.societe.brn && <span className="text-muted-foreground">· {t('inv.nfia.brn_label', locale)} {contexte.societe.brn}</span>}
                  {contexte.societe.vat_number && <span className="text-muted-foreground">· {t('inv.nfia.vat_label', locale)} {contexte.societe.vat_number}</span>}
                </p>
              )}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chat */}
          <Card className="lg:col-span-2 flex flex-col h-[calc(100vh-220px)] min-h-[480px]">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                {t('inv.nfia.conversation', locale)}
                {loadingContexte && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0 flex flex-col">
              <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-[#0B0F2E] text-white"
                        : "bg-amber-50 border border-amber-200 text-gray-900"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> {t('inv.nfia.thinking', locale)}
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t p-3 flex gap-2">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder={t('inv.nfia.input_ph', locale)}
                  className="resize-none flex-1 min-h-[48px] max-h-[120px]"
                  disabled={sending || loadingContexte}
                />
                <Button onClick={sendMessage} disabled={sending || !input.trim() || loadingContexte}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Aperçu paramètres extraits + bouton Générer */}
          <Card className="h-[calc(100vh-220px)] min-h-[480px] flex flex-col">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                {t('inv.nfia.preview', locale)}
                {analyse?.pret_a_generer && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] ml-auto">
                    {t('inv.nfia.ready', locale)}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              {!analyse && (
                <p className="text-muted-foreground italic">{t('inv.nfia.placeholder_intro', locale)}</p>
              )}
              {analyse && (
                <>
                  <Section title={t('inv.nfia.sec_type', locale)}>
                    <Badge variant="outline" className="capitalize">
                      {params.type_document?.replace('_', ' ') || t('inv.nfia.default_doc', locale)}
                    </Badge>
                  </Section>
                  <Section title={t('inv.nfia.sec_client', locale)}>
                    {params.tiers || <Empty locale={locale} />}
                    {params.contact_id && (
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] ml-2">{t('inv.nfia.linked_contact', locale)}</Badge>
                    )}
                  </Section>
                  <Section title={t('inv.nfia.sec_dates', locale)}>
                    {t('inv.nfia.issue', locale)} : {params.date_facture || <Empty locale={locale} />}<br />
                    {t('inv.nfia.due', locale)} : {params.date_echeance || <Empty locale={locale} />}
                  </Section>
                  {params.devise && (
                    <Section title={t('inv.nfia.sec_currency', locale)}>
                      {params.devise}
                      {params.taux_change && params.devise !== "MUR" && (
                        <span className="text-muted-foreground ml-2">({t('inv.nfia.rate', locale)} {params.taux_change})</span>
                      )}
                    </Section>
                  )}
                  <Section title={`${t('inv.nfia.sec_lines', locale)} (${params.lignes?.length || 0})`}>
                    {!params.lignes || params.lignes.length === 0 ? <Empty locale={locale} /> : (
                      <ul className="space-y-1 text-xs">
                        {params.lignes.map((l, i) => (
                          <li key={i} className="border-l-2 border-amber-300 pl-2">
                            <div className="font-medium">{l.description}</div>
                            <div className="text-muted-foreground">
                              {l.quantite} {l.unite || ''} × {fmtMontant(l.prix_unitaire, params.devise || 'MUR')} ({t('inv.nfia.vat_in_line', locale)} {l.taux_tva}%)
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  {(params.lignes?.length || 0) > 0 && (
                    <Section title={t('inv.nfia.sec_totals', locale)}>
                      <div className="text-xs space-y-0.5">
                        <div>{t('inv.nfia.ht', locale)} : {fmtMontant(totalLignesHT, params.devise || 'MUR')}</div>
                        <div>{t('inv.nfia.vat', locale)} : {fmtMontant(totalLignesTVA, params.devise || 'MUR')}</div>
                        {(params.remise_pct || params.remise_montant) && (
                          <div className="text-amber-700">
                            {t('inv.nfia.discount', locale)} : {params.remise_pct ? `${params.remise_pct}%` : fmtMontant(params.remise_montant || 0, params.devise || 'MUR')}
                          </div>
                        )}
                        <div className="font-semibold text-base pt-1 border-t">
                          {t('inv.nfia.ttc', locale)} : {fmtMontant(totalTTC, params.devise || 'MUR')}
                        </div>
                      </div>
                    </Section>
                  )}
                  {params.recurrent && (
                    <Section title={t('inv.nfia.sec_recurrence', locale)}>
                      <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
                        {params.recurrence_periodicite || t('inv.nfia.monthly', locale)}
                      </Badge>
                    </Section>
                  )}
                  {analyse.informations_manquantes && analyse.informations_manquantes.length > 0 && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                      <div className="font-semibold mb-1">{t('inv.nfia.still_need', locale)}</div>
                      <ul className="list-disc list-inside space-y-0.5">
                        {analyse.informations_manquantes.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
            <div className="border-t p-3">
              <Button
                onClick={genererFacture}
                disabled={!analyse?.pret_a_generer || generating}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> {t('inv.nfia.creating', locale)}</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-1.5" /> {t('inv.nfia.create_doc', locale)} {params.type_document || t('inv.nfia.default_doc', locale)}</>
                )}
              </Button>
              {!analyse?.pret_a_generer && analyse && (
                <p className="text-[11px] text-muted-foreground text-center mt-1">
                  {t('inv.nfia.continue_hint', locale)}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </ClientPageShell>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      <div>{children}</div>
    </div>
  )
}

function Empty({ locale }: { locale: Locale }) {
  return <span className="text-muted-foreground italic text-xs">{t('inv.nfia.empty_value', locale)}</span>
}
