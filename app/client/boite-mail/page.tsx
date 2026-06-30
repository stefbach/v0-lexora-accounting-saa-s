"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Mail, RefreshCw, Search, Sparkles, ListChecks, Tag, Reply, Send, AlertCircle, CheckCircle2, Inbox,
} from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

type Participant = { name?: string; email?: string }
type MailMessage = {
  id: string
  threadId: string | null
  subject: string
  snippet: string
  body: string
  from: Participant | null
  to: Participant[]
  cc: Participant[]
  replyTo: Participant[]
  date: string | null
  unread: boolean
  starred: boolean
  folders: string[]
}

type AgentAction = 'summarize' | 'classify' | 'actions' | 'reply'

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const who = (p: Participant | null) => (p ? p.name || p.email || '?' : '?')

export default function BoiteMailPage() {
  const { societeId } = useSocieteActive()
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [noAccount, setNoAccount] = useState(false)
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const [selected, setSelected] = useState<MailMessage | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(false)

  const [agentBusy, setAgentBusy] = useState<AgentAction | null>(null)
  const [agentOut, setAgentOut] = useState<string | null>(null)
  const [replyMode, setReplyMode] = useState(false)
  const [replyInstruction, setReplyInstruction] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const sp = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra)
    if (societeId) p.set('societe_id', societeId)
    return p.toString()
  }

  const load = useCallback(async (search?: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/nylas/messages?${sp(search ? { q: search } : {})}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur de chargement')
      if (!d.account) { setNoAccount(true); setMessages([]) }
      else { setNoAccount(false); setAccountEmail(d.account.email); setMessages(d.messages || []) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally { setLoading(false) }
  }, [societeId])

  useEffect(() => { load() }, [load])

  const openMessage = async (m: MailMessage) => {
    setSelected(m); setAgentOut(null); setReplyMode(false); setReplyDraft(''); setReplyInstruction(''); setSent(null)
    if (m.body) return
    setLoadingMsg(true)
    try {
      const res = await fetch(`/api/nylas/messages/${encodeURIComponent(m.id)}?${sp()}`)
      const d = await res.json()
      if (res.ok && d.message) setSelected(d.message)
    } finally { setLoadingMsg(false) }
  }

  const runAgent = async (action: AgentAction) => {
    if (!selected) return
    setAgentBusy(action); setError(null)
    if (action === 'reply') { setReplyMode(true) }
    else { setAgentOut(null) }
    try {
      const res = await fetch('/api/nylas/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          subject: selected.subject,
          from: who(selected.from),
          body: selected.body || selected.snippet,
          instruction: action === 'reply' ? replyInstruction : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur agent IA')
      if (action === 'reply') setReplyDraft(d.result)
      else setAgentOut(d.result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur agent IA')
    } finally { setAgentBusy(null) }
  }

  const sendReply = async () => {
    if (!selected || !replyDraft.trim()) return
    const target = selected.replyTo?.[0]?.email || selected.from?.email
    if (!target) { setError('Adresse du destinataire introuvable'); return }
    setSending(true); setError(null)
    try {
      const subject = selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`
      const res = await fetch('/api/nylas/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          societe_id: societeId || null,
          to: [target],
          subject,
          html: replyDraft.replace(/\n/g, '<br>'),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Échec envoi')
      setSent(`Réponse envoyée à ${target}`)
      setReplyMode(false); setReplyDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec envoi')
    } finally { setSending(false) }
  }

  if (noAccount) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> Boîte de réception</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Aucune boîte email n'est connectée. Connecte une boîte (Gmail, Outlook, iCloud…) pour lire et gérer tes emails avec l'agent IA.</p>
            <Link href="/client/email-accounts"><Button><Mail className="h-4 w-4 mr-2" /> Connecter une boîte</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Inbox className="h-5 w-5" /> Boîte de réception
          {accountEmail && <Badge variant="secondary" className="font-normal">{accountEmail}</Badge>}
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(q) }}
              placeholder="Rechercher…"
              className="pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background w-48"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => load(q)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3"><AlertCircle className="h-4 w-4" /> {error}</div>}
      {sent && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3"><CheckCircle2 className="h-4 w-4" /> {sent}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_1fr] gap-4">
        {/* Liste */}
        <Card className="overflow-hidden">
          <CardContent className="p-0 divide-y max-h-[70vh] overflow-y-auto">
            {loading && messages.length === 0 && <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
            {!loading && messages.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Aucun message.</div>}
            {messages.map((m) => (
              <button
                key={m.id} onClick={() => openMessage(m)}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition ${selected?.id === m.id ? 'bg-muted' : ''} ${m.unread ? 'font-medium' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm">{who(m.from)}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(m.date)}</span>
                </div>
                <div className="truncate text-sm">{m.subject}</div>
                <div className="truncate text-xs text-muted-foreground">{m.snippet}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Lecture + agent IA */}
        <Card>
          {!selected ? (
            <CardContent className="p-10 text-center text-muted-foreground text-sm">Sélectionne un email pour le lire et le traiter avec l'agent IA.</CardContent>
          ) : (
            <>
              <CardHeader className="border-b">
                <CardTitle className="text-base">{selected.subject}</CardTitle>
                <div className="text-sm text-muted-foreground">De : {who(selected.from)} {selected.from?.email && <span className="text-xs">&lt;{selected.from.email}&gt;</span>}</div>
                <div className="text-xs text-muted-foreground">{fmtDate(selected.date)}</div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => runAgent('summarize')} disabled={!!agentBusy}>
                    {agentBusy === 'summarize' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />} Résumer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runAgent('classify')} disabled={!!agentBusy}>
                    {agentBusy === 'classify' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Tag className="h-3.5 w-3.5 mr-1.5" />} Classer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runAgent('actions')} disabled={!!agentBusy}>
                    {agentBusy === 'actions' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5 mr-1.5" />} Actions
                  </Button>
                  <Button size="sm" onClick={() => { setReplyMode(true); setAgentOut(null) }} disabled={!!agentBusy}>
                    <Reply className="h-3.5 w-3.5 mr-1.5" /> Répondre
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {agentOut && (
                  <div className="text-sm bg-violet-50 border border-violet-200 rounded-md p-3 whitespace-pre-wrap">
                    <div className="flex items-center gap-1.5 text-violet-700 font-medium mb-1.5 text-xs uppercase tracking-wide"><Sparkles className="h-3.5 w-3.5" /> Agent IA</div>
                    {agentOut}
                  </div>
                )}

                {replyMode && (
                  <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Réponse à {who(selected.from)}</div>
                    <textarea
                      value={replyInstruction} onChange={(e) => setReplyInstruction(e.target.value)}
                      placeholder="Que veux-tu répondre ? (notes en vrac — l'IA rédige proprement)"
                      className="w-full text-sm border rounded-md p-2 bg-background min-h-[60px]"
                    />
                    <Button size="sm" variant="outline" onClick={() => runAgent('reply')} disabled={agentBusy === 'reply'}>
                      {agentBusy === 'reply' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />} Rédiger avec l'IA
                    </Button>
                    {replyDraft && (
                      <>
                        <textarea
                          value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)}
                          className="w-full text-sm border rounded-md p-2 bg-background min-h-[160px]"
                        />
                        <div className="flex justify-end">
                          <Button size="sm" onClick={sendReply} disabled={sending}>
                            {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />} Envoyer
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="border-t pt-4">
                  {loadingMsg ? (
                    <div className="text-center text-muted-foreground py-6"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                  ) : selected.body ? (
                    <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: selected.body }} />
                  ) : (
                    <div className="text-sm text-muted-foreground">{selected.snippet}</div>
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
