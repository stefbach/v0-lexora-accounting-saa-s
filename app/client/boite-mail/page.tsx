"use client"
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, Mail, RefreshCw, Search, Sparkles, ListChecks, Tag, Reply, Send, AlertCircle,
  CheckCircle2, Inbox, Settings2, Wand2, Circle, X,
} from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

type Participant = { name?: string; email?: string }
type MailMessage = {
  id: string; threadId: string | null; subject: string; snippet: string; body: string
  from: Participant | null; to: Participant[]; cc: Participant[]; replyTo: Participant[]
  date: string | null; unread: boolean; starred: boolean; folders: string[]
}
type Analysis = { message_id: string; category: string; priority: 'haute' | 'moyenne' | 'basse'; needs_reply: boolean; summary: string; suggested_action: string }
type AgentSettings = { instructions: string; categories: string[]; signature: string; tone: string; auto_triage: boolean }
type AgentAction = 'summarize' | 'classify' | 'actions' | 'reply'
type Filter = { kind: 'all' | 'unread' | 'reply' | 'high' | 'category'; value?: string }

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const who = (p: Participant | null) => (p ? p.name || p.email || '?' : '?')
const prioColor: Record<string, string> = { haute: 'bg-red-100 text-red-700 border-red-200', moyenne: 'bg-amber-100 text-amber-700 border-amber-200', basse: 'bg-slate-100 text-slate-600 border-slate-200' }

export default function BoiteMailPage() {
  const { societeId } = useSocieteActive()
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [noAccount, setNoAccount] = useState(false)
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })

  const [selected, setSelected] = useState<MailMessage | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(false)

  const [triaging, setTriaging] = useState(false)
  const [digest, setDigest] = useState<string | null>(null)
  const [counts, setCounts] = useState<{ haute: number; moyenne: number; basse: number; a_repondre: number } | null>(null)

  const [agentBusy, setAgentBusy] = useState<AgentAction | null>(null)
  const [agentOut, setAgentOut] = useState<string | null>(null)
  const [replyMode, setReplyMode] = useState(false)
  const [replyInstruction, setReplyInstruction] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  const [settings, setSettings] = useState<AgentSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const [accountsList, setAccountsList] = useState<Array<{ id: string; account_email: string; label: string }>>([])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)

  const sp = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(extra)
    if (societeId) p.set('societe_id', societeId)
    if (activeAccountId) p.set('account_id', activeAccountId)
    return p.toString()
  }

  const load = useCallback(async (search?: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/nylas/messages?${sp({ folders: '0', ...(search ? { q: search } : {}) })}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur de chargement')
      if (!d.account) { setNoAccount(true); setMessages([]) }
      else { setNoAccount(false); setAccountEmail(d.account.email); if (d.account.id) setActiveAccountId((prev) => prev || d.account.id); setMessages(d.messages || []); setAnalyses(d.analyses || {}) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') }
    finally { setLoading(false) }
  }, [societeId, activeAccountId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/nylas/agent/settings?${sp()}`)
      const d = await res.json()
      if (res.ok) setSettings(d.settings)
    } catch { /* noop */ }
  }, [societeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); loadSettings() }, [load, loadSettings])

  // Liste des boîtes connectées (pour le sélecteur multi-comptes).
  useEffect(() => {
    fetch('/api/auth/nylas/accounts').then((r) => r.json()).then((d) => {
      if (Array.isArray(d.accounts)) setAccountsList(d.accounts)
    }).catch(() => {})
  }, [])

  // Changement de boîte : on remet la sélection et le tri à zéro.
  const switchAccount = (id: string) => {
    if (id === activeAccountId) return
    setActiveAccountId(id); setSelected(null); setDigest(null); setCounts(null); setAnalyses({}); setAutoDone(false)
  }

  // Tri auto si activé dans les consignes (une fois les messages chargés).
  const [autoDone, setAutoDone] = useState(false)
  useEffect(() => {
    if (settings?.auto_triage && !autoDone && messages.length > 0 && !triaging) {
      setAutoDone(true); runTriage(false)
    }
  }, [settings, messages, autoDone]) // eslint-disable-line react-hooks/exhaustive-deps

  const runTriage = async (force: boolean) => {
    setTriaging(true); setError(null)
    try {
      const res = await fetch('/api/nylas/agent/triage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId || null, account_id: activeAccountId, scope: 'recent', force }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur de tri')
      setAnalyses((prev) => ({ ...prev, ...(d.analyses || {}) }))
      setDigest(d.digest || null); setCounts(d.counts || null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur de tri') }
    finally { setTriaging(false) }
  }

  const openMessage = async (m: MailMessage) => {
    setSelected(m); setAgentOut(null); setReplyMode(false); setReplyDraft(''); setReplyInstruction(''); setSent(null)
    if (m.unread) { setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, unread: false } : x)) }
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
    if (action === 'reply') setReplyMode(true); else setAgentOut(null)
    try {
      const res = await fetch('/api/nylas/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, societe_id: societeId || null, subject: selected.subject, from: who(selected.from), body: selected.body || selected.snippet, instruction: action === 'reply' ? replyInstruction : undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur agent IA')
      if (action === 'reply') setReplyDraft(d.result); else setAgentOut(d.result)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur agent IA') }
    finally { setAgentBusy(null) }
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
        body: JSON.stringify({ societe_id: societeId || null, account_id: activeAccountId, to: [target], subject, html: replyDraft.replace(/\n/g, '<br>') }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Échec envoi')
      setSent(`Réponse envoyée à ${target}`); setReplyMode(false); setReplyDraft('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Échec envoi') }
    finally { setSending(false) }
  }

  const categories = useMemo(() => {
    const set = new Set<string>()
    Object.values(analyses).forEach((a) => a.category && set.add(a.category))
    return Array.from(set).sort()
  }, [analyses])

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      const a = analyses[m.id]
      switch (filter.kind) {
        case 'unread': return m.unread
        case 'reply': return a?.needs_reply
        case 'high': return a?.priority === 'haute'
        case 'category': return a?.category === filter.value
        default: return true
      }
    })
  }, [messages, analyses, filter])

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

  const FilterBtn = ({ f, label, count }: { f: Filter; label: string; count?: number }) => (
    <button
      onClick={() => setFilter(f)}
      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-sm transition ${filter.kind === f.kind && filter.value === f.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
    >
      <span>{label}</span>{typeof count === 'number' && <span className="text-xs opacity-70">{count}</span>}
    </button>
  )

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Inbox className="h-5 w-5" /> Boîte de réception
          {accountsList.length > 1 ? (
            <select
              value={activeAccountId || ''}
              onChange={(e) => switchAccount(e.target.value)}
              className="text-sm font-normal border rounded-md px-2 py-1 bg-background max-w-[220px]"
            >
              {accountsList.map((a) => <option key={a.id} value={a.id}>{a.account_email}</option>)}
            </select>
          ) : accountEmail && <Badge variant="secondary" className="font-normal">{accountEmail}</Badge>}
          <Link href="/client/email-accounts" className="text-xs text-muted-foreground underline">+ boîte</Link>
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(q) }} placeholder="Rechercher…" className="pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background w-44" />
          </div>
          <Button variant="outline" size="sm" onClick={() => load(q)} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
          <Button size="sm" onClick={() => runTriage(false)} disabled={triaging}>
            {triaging ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1.5" />} Trier ma boîte
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}><Settings2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3"><AlertCircle className="h-4 w-4" /> {error}</div>}
      {sent && <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3"><CheckCircle2 className="h-4 w-4" /> {sent}</div>}

      {digest && (
        <Card className="border-violet-200 bg-violet-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 text-violet-700 font-medium mb-1.5 text-xs uppercase tracking-wide"><Sparkles className="h-3.5 w-3.5" /> Attention du jour</div>
            <div className="text-sm whitespace-pre-wrap">{digest}</div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[170px_minmax(0,360px)_1fr] gap-4">
        {/* Filtres */}
        <div className="space-y-1">
          <FilterBtn f={{ kind: 'all' }} label="Tous" count={messages.length} />
          <FilterBtn f={{ kind: 'unread' }} label="Non lus" count={messages.filter((m) => m.unread).length} />
          <FilterBtn f={{ kind: 'reply' }} label="À répondre" count={counts?.a_repondre} />
          <FilterBtn f={{ kind: 'high' }} label="Prioritaires" count={counts?.haute} />
          {categories.length > 0 && <div className="pt-2 text-xs uppercase tracking-wide text-muted-foreground px-3">Catégories</div>}
          {categories.map((c) => <FilterBtn key={c} f={{ kind: 'category', value: c }} label={c} count={Object.values(analyses).filter((a) => a.category === c).length} />)}
        </div>

        {/* Liste */}
        <Card className="overflow-hidden">
          <CardContent className="p-0 divide-y max-h-[72vh] overflow-y-auto">
            {loading && messages.length === 0 && <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}
            {!loading && filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Aucun message.</div>}
            {filtered.map((m) => {
              const a = analyses[m.id]
              return (
                <button key={m.id} onClick={() => openMessage(m)} className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition ${selected?.id === m.id ? 'bg-muted' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm flex items-center gap-1.5 ${m.unread ? 'font-semibold' : ''}`}>
                      {m.unread && <Circle className="h-2 w-2 fill-blue-500 text-blue-500 shrink-0" />}{who(m.from)}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(m.date)}</span>
                  </div>
                  <div className={`truncate text-sm ${m.unread ? 'font-medium' : ''}`}>{m.subject}</div>
                  <div className="truncate text-xs text-muted-foreground">{a?.summary || m.snippet}</div>
                  {a && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${prioColor[a.priority]}`}>{a.priority}</span>
                      {a.category && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-background">{a.category}</span>}
                      {a.needs_reply && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">à répondre</span>}
                    </div>
                  )}
                </button>
              )
            })}
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
                {analyses[selected.id]?.suggested_action && (
                  <div className="text-xs bg-violet-50 border border-violet-200 rounded px-2 py-1 mt-1 text-violet-700">💡 {analyses[selected.id].suggested_action}</div>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => runAgent('summarize')} disabled={!!agentBusy}>{agentBusy === 'summarize' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />} Résumer</Button>
                  <Button size="sm" variant="outline" onClick={() => runAgent('classify')} disabled={!!agentBusy}>{agentBusy === 'classify' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Tag className="h-3.5 w-3.5 mr-1.5" />} Classer</Button>
                  <Button size="sm" variant="outline" onClick={() => runAgent('actions')} disabled={!!agentBusy}>{agentBusy === 'actions' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5 mr-1.5" />} Actions</Button>
                  <Button size="sm" onClick={() => { setReplyMode(true); setAgentOut(null) }} disabled={!!agentBusy}><Reply className="h-3.5 w-3.5 mr-1.5" /> Répondre</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {agentOut && (
                  <div className="text-sm bg-violet-50 border border-violet-200 rounded-md p-3 whitespace-pre-wrap">
                    <div className="flex items-center gap-1.5 text-violet-700 font-medium mb-1.5 text-xs uppercase tracking-wide"><Sparkles className="h-3.5 w-3.5" /> Agent IA</div>{agentOut}
                  </div>
                )}
                {replyMode && (
                  <div className="space-y-2 border rounded-md p-3 bg-muted/30">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Réponse à {who(selected.from)}</div>
                    <textarea value={replyInstruction} onChange={(e) => setReplyInstruction(e.target.value)} placeholder="Que veux-tu répondre ? (notes en vrac — l'IA rédige proprement, selon tes consignes)" className="w-full text-sm border rounded-md p-2 bg-background min-h-[60px]" />
                    <Button size="sm" variant="outline" onClick={() => runAgent('reply')} disabled={agentBusy === 'reply'}>{agentBusy === 'reply' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />} Rédiger avec l'IA</Button>
                    {replyDraft && (
                      <>
                        <textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} className="w-full text-sm border rounded-md p-2 bg-background min-h-[160px]" />
                        <div className="flex justify-end"><Button size="sm" onClick={sendReply} disabled={sending}>{sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />} Envoyer</Button></div>
                      </>
                    )}
                  </div>
                )}
                <div className="border-t pt-4">
                  {loadingMsg ? <div className="text-center text-muted-foreground py-6"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                    : selected.body ? <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: selected.body }} />
                    : <div className="text-sm text-muted-foreground">{selected.snippet}</div>}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {showSettings && settings && <SettingsModal settings={settings} societeId={societeId} onClose={() => setShowSettings(false)} onSaved={(s) => { setSettings(s); setShowSettings(false) }} />}
    </div>
  )
}

function SettingsModal({ settings, societeId, onClose, onSaved }: { settings: AgentSettings; societeId: string | null; onClose: () => void; onSaved: (s: AgentSettings) => void }) {
  const [instructions, setInstructions] = useState(settings.instructions)
  const [categories, setCategories] = useState(settings.categories.join(', '))
  const [signature, setSignature] = useState(settings.signature)
  const [tone, setTone] = useState(settings.tone)
  const [autoTriage, setAutoTriage] = useState(settings.auto_triage)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch('/api/nylas/agent/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId || null, instructions, categories: categories.split(',').map((c) => c.trim()).filter(Boolean), signature, tone, auto_triage: autoTriage }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Erreur')
      onSaved(d.settings)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Erreur') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Consignes de l'agent</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
          <div>
            <label className="text-sm font-medium">Consignes (le cerveau de l'assistant)</label>
            <p className="text-xs text-muted-foreground mb-1">Décris tes priorités, expéditeurs importants, ce qui doit être signalé, ta façon de travailler. L'agent s'y conforme pour trier, classer et répondre.</p>
            <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="w-full text-sm border rounded-md p-2 min-h-[140px] bg-background" placeholder="Ex : Les emails de la MRA et des banques sont toujours prioritaires. Signale tout ce qui parle d'échéance fiscale. Les factures fournisseurs vont en catégorie « Fournisseur ». Réponds toujours de façon courtoise et concise…" />
          </div>
          <div>
            <label className="text-sm font-medium">Catégories de classement</label>
            <p className="text-xs text-muted-foreground mb-1">Séparées par des virgules. Laisse vide pour laisser l'agent proposer.</p>
            <input value={categories} onChange={(e) => setCategories(e.target.value)} className="w-full text-sm border rounded-md p-2 bg-background" placeholder="Client, Fournisseur, Banque, Fiscal, RH, Juridique, Prospect, Interne…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Ton des réponses</label>
              <input value={tone} onChange={(e) => setTone(e.target.value)} className="w-full text-sm border rounded-md p-2 bg-background" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer py-2">
                <input type="checkbox" checked={autoTriage} onChange={(e) => setAutoTriage(e.target.checked)} />
                Tri automatique à l'ouverture
              </label>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Signature</label>
            <textarea value={signature} onChange={(e) => setSignature(e.target.value)} className="w-full text-sm border rounded-md p-2 min-h-[70px] bg-background" placeholder={"Cordialement,\nPrénom Nom\nDirection — Société"} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Enregistrer</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
