"use client"

/**
 * Page /client/agent-comptable — Agent comptable conversationnel.
 *
 * Chat en langage naturel : l'utilisateur explique son besoin
 * ("affecte cette avance à la facture X"), l'agent consulte, propose,
 * et exécute APRÈS confirmation explicite. S'appuie sur
 * /api/comptable/agent-chat (boucle tool-calling Claude + outils Lexora).
 */

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Loader2, Send, Bot, User, CheckCircle2, XCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Msg { role: "user" | "assistant"; content: string }
interface PendingAction { name: string; input: any; resume: string }

export default function AgentComptablePage() {
  const { societeId } = useSocieteActive()
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Bonjour 👋 Je suis votre **Expert Lexora** (compta, RH, paie, MRA + droit Maurice). Demandez-moi par exemple : « affecte l'avance de 50 000 du client Dupont à sa facture FA-2026-012 », « solde de congés de Mélanie ? », « où en est ma conformité MRA ? », ou « calcule le net pour 50 000 brut »." },
  ])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)

  // Handoff Telegram → web : si l'URL contient ?handoff=<token>, on consomme
  // le token et pré-charge le message dans le chat (mig 458).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const token = sp.get('handoff')
    if (!token) return
    ;(async () => {
      try {
        const r = await fetch(`/api/agent/handoff/${token}?consume=1`)
        const j = await r.json()
        if (!r.ok || !j?.message) return
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `🔗 Lien Telegram reçu : *${j.message}*` },
        ])
        setInput(j.message)
        // Nettoie l'URL
        const url = new URL(window.location.href)
        url.searchParams.delete('handoff')
        window.history.replaceState({}, '', url.toString())
      } catch { /* noop */ }
    })()
  }, [])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages, pending])

  const callAgent = async (msgs: Msg[], confirmedAction?: { name: string; input: any }) => {
    setBusy(true); setPending(null)
    try {
      const res = await fetch("/api/comptable/agent-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, messages: msgs, confirmed_action: confirmedAction }),
      })
      const d = await res.json()
      if (!res.ok) {
        setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${d?.error || "Erreur"}` }])
        return
      }
      if (d.type === "confirmation") {
        setMessages(prev => [...prev, { role: "assistant", content: d.message }])
        setPending(d.action)
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: d.message }])
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ ${e?.message || "Erreur réseau"}` }])
    } finally { setBusy(false) }
  }

  const send = () => {
    const text = input.trim()
    if (!text || busy || !societeId) return
    const next = [...messages, { role: "user" as const, content: text }]
    setMessages(next); setInput("")
    callAgent(next)
  }

  const confirm = () => {
    if (!pending) return
    const next = [...messages, { role: "user" as const, content: "✅ Je confirme cette action." }]
    setMessages(next)
    callAgent(next, { name: pending.name, input: pending.input })
  }

  const cancel = () => {
    setPending(null)
    setMessages(prev => [...prev, { role: "user", content: "❌ Annule cette action." },
      { role: "assistant", content: "D'accord, action annulée. Que souhaitez-vous faire ?" }])
  }

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
        <div className="flex items-center gap-3 pb-4">
          <div className="rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 p-3 text-white"><Bot className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-bold text-[#0B0F2E]">Agent comptable</h1>
            <p className="text-sm text-gray-500">Demandez en langage naturel — je consulte, propose et exécute après votre validation</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && <div className="rounded-full bg-purple-100 p-2 h-8 w-8 flex-shrink-0"><Bot className="h-4 w-4 text-purple-700" /></div>}
              <div className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-[#0B0F2E] text-white" : "bg-gray-100 text-gray-900"}`}>{m.content}</div>
              {m.role === "user" && <div className="rounded-full bg-[#0B0F2E] p-2 h-8 w-8 flex-shrink-0"><User className="h-4 w-4 text-white" /></div>}
            </div>
          ))}

          {pending && (
            <Card className="border-amber-300 bg-amber-50 p-4 ml-11">
              <div className="text-sm font-medium text-amber-900 mb-1">Action à confirmer</div>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap mb-3">{pending.resume}</pre>
              <div className="flex gap-2">
                <Button size="sm" onClick={confirm} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white"><CheckCircle2 className="h-4 w-4 mr-1" />Confirmer</Button>
                <Button size="sm" variant="outline" onClick={cancel} disabled={busy}><XCircle className="h-4 w-4 mr-1" />Annuler</Button>
              </div>
            </Card>
          )}

          {busy && <div className="flex gap-3"><div className="rounded-full bg-purple-100 p-2 h-8 w-8"><Bot className="h-4 w-4 text-purple-700" /></div><div className="rounded-2xl bg-gray-100 px-4 py-2.5"><Loader2 className="h-4 w-4 animate-spin text-gray-500" /></div></div>}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Ex: affecte l'avance de 50 000 du client Dupont à sa facture…" disabled={busy || !societeId} />
          <Button onClick={send} disabled={busy || !input.trim() || !societeId} className="bg-[#0B0F2E] text-white"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </ClientPageShell>
  )
}
