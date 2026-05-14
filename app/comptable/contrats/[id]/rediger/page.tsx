"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Send,
  Loader2,
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  ChevronRight,
} from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface Contrat {
  id: string
  reference: string
  titre: string
  type_contrat: string
  statut: string
  conversation_ia: Message[]
  parametres: Record<string, unknown>
  contenu_html: string | null
  client?: { full_name: string; email: string }
  societe?: { nom: string }
}

interface AnalyseStatus {
  pret_a_generer: boolean
  informations_manquantes: string[]
  parametres: Record<string, unknown>
}

export default function RedigerContratPage() {
  const locale = getLocale()
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname() || ""
  const basePath = pathname.startsWith("/client/") ? "/client/contrats" : "/comptable/contrats"
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [contrat, setContrat] = useState<Contrat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [currentStream, setCurrentStream] = useState('')
  const [analyse, setAnalyse] = useState<AnalyseStatus | null>(null)

  // Charger le contrat
  useEffect(() => {
    const charger = async () => {
      try {
        const res = await fetch(`/api/contrats/${id}`)
        const { data } = await res.json()
        if (data) {
          setContrat(data)
          setMessages(data.conversation_ia || [])
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    charger()
  }, [id])

  // Scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentStream])

  const envoyerMessage = useCallback(async () => {
    if (!input.trim() || sending || streaming) return

    const messageUser = input.trim()
    setInput('')
    setSending(true)
    setStreaming(true)
    setCurrentStream('')

    // Ajouter message utilisateur immédiatement
    const msgUser: Message = {
      role: 'user',
      content: messageUser,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, msgUser])

    try {
      const res = await fetch(`/api/contrats/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageUser }),
      })

      if (!res.ok) throw new Error('Erreur réseau')

      const reader = res.body?.getReader()
      if (!reader) throw new Error('Pas de stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullResponse = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.chunk) {
              fullResponse += data.chunk
              setCurrentStream(fullResponse)
            }

            if (data.done) {
              setAnalyse({
                pret_a_generer: data.pret_a_generer,
                informations_manquantes: data.informations_manquantes || [],
                parametres: data.parametres || {},
              })

              // Ajouter le message assistant final
              const msgAssistant: Message = {
                role: 'assistant',
                content: fullResponse,
                timestamp: new Date().toISOString(),
              }
              setMessages(prev => [...prev, msgAssistant])
              setCurrentStream('')
            }
          } catch {
            // Ignorer les erreurs de parsing
          }
        }
      }
    } catch (err) {
      console.error(err)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: t('cab.rediger.error_retry', locale),
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setSending(false)
      setStreaming(false)
    }
  }, [id, input, sending, streaming])

  const genererContrat = async (instructions?: string) => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/contrats/${id}/generer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions_modification: instructions }),
      })
      const { data } = await res.json()
      if (data) {
        setContrat(prev => prev ? { ...prev, ...data } : data)
        router.push(`${basePath}/${id}`)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      envoyerMessage()
    }
  }

  // Suggestions rapides pour démarrer
  const suggestions = [
    t('cab.rediger.sugg_1', locale),
    t('cab.rediger.sugg_2', locale),
    t('cab.rediger.sugg_3', locale),
    t('cab.rediger.sugg_4', locale),
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={basePath}>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <h1 className="font-semibold text-gray-900 text-sm">
                {contrat?.titre || t('cab.rediger.title_default', locale)}
              </h1>
              {contrat?.reference && (
                <span className="text-xs text-gray-400">{contrat.reference}</span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {t('cab.rediger.assistant_ia', locale)} · {contrat?.client?.full_name || t('cab.rediger.client_undefined', locale)}
              {contrat?.societe && ` · ${contrat.societe.nom}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {contrat?.contenu_html && (
            <Link href={`${basePath}/${id}`}>
              <Button variant="outline" size="sm" className="text-xs">
                <Eye className="w-3 h-3 mr-1" />
                {t('cab.rediger.view_contract', locale)}
              </Button>
            </Link>
          )}
          <Button
            onClick={() => genererContrat()}
            disabled={generating || streaming}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
          >
            {generating ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <FileText className="w-3 h-3 mr-1" />
            )}
            {contrat?.contenu_html ? t('cab.rediger.regenerate', locale) : t('cab.rediger.generate', locale)}
          </Button>
        </div>
      </div>

      {/* Zone de messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="max-w-2xl mx-auto mt-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {t('cab.rediger.intro_title', locale)}
              </h2>
              <p className="text-gray-500 text-sm">
                {t('cab.rediger.intro_text', locale)}
              </p>
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide text-center mb-3">
                {t('cab.rediger.examples_label', locale)}
              </p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(s)
                    textareaRef.current?.focus()
                  }}
                  className="w-full text-left p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-between group"
                >
                  <span>{s}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                }`}
              >
                {msg.content.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
                ))}
              </div>
            </div>
          ))}

          {/* Message en cours de stream */}
          {streaming && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
              </div>
              <div className="max-w-[80%] bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-800 shadow-sm">
                {currentStream ? (
                  currentStream.split('\n').map((line, i) => (
                    <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
                  ))
                ) : (
                  <div className="flex gap-1 items-center py-1">
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Panneau de statut IA */}
      {analyse && (
        <div className={`px-4 py-2 flex items-center gap-3 text-xs flex-shrink-0 border-t ${
          analyse.pret_a_generer
            ? 'bg-green-50 border-green-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          {analyse.pret_a_generer ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-green-700 font-medium">
                {t('cab.rediger.ready_to_generate', locale)}
              </span>
              <Button
                onClick={() => genererContrat()}
                disabled={generating}
                size="sm"
                className="ml-auto h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
              >
                {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : t('cab.rediger.generate_now', locale)}
              </Button>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
              <span className="text-yellow-700">
                {t('cab.rediger.missing', locale)} {analyse.informations_manquantes.slice(0, 3).join(', ')}
                {analyse.informations_manquantes.length > 3 && ` +${analyse.informations_manquantes.length - 3}`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Zone de saisie */}
      <div className="bg-white border-t p-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('cab.rediger.input_placeholder', locale)}
              className="min-h-[52px] max-h-32 resize-none pr-12 text-sm"
              disabled={sending || streaming}
              rows={2}
            />
          </div>
          <Button
            onClick={envoyerMessage}
            disabled={!input.trim() || sending || streaming}
            className="bg-blue-600 hover:bg-blue-700 text-white h-[52px] w-[52px] p-0 flex-shrink-0"
          >
            {sending || streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">
          {t('cab.rediger.input_hint', locale)}
        </p>
      </div>
    </div>
  )
}
