"use client"

/**
 * FloatingAgentChat — widget chat flottant de l'agent comptable.
 *
 * Bouton flottant en bas à droite, ouvre un panneau compact. Permet de
 * poser une question sans quitter la page courante (grand livre, factures…).
 * Même backend que la page dédiée (/api/comptable/agent-chat) :
 * lecture libre + confirmation avant écriture.
 */

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Loader2, Send, Bot, X, CheckCircle2, XCircle, MessageCircle } from "lucide-react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Msg { role: "user" | "assistant"; content: string }
interface PendingAction { name: string; input: any; resume: string }

export function FloatingAgentChat() {
  const { societeId } = useSocieteActive()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Une question sur cette page ? Demandez-moi (ex: « ce solde 4511 est-il normal ? », « lettre l'avance du client X avec sa facture »)." },
  ])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages, pending, open])

  const callAgent = async (msgs: Msg[], confirmedAction?: { name: string; input: any }) => {
    setBusy(true); setPending(null)
    try {
      const res = await fetch("/api/comptable/agent-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, messages: msgs, confirmed_action: confirmedAction }),
      })
      const d = await res.json()
      if (!res.ok) { setMessages(p => [...p, { role: "assistant", content: `⚠️ ${d?.error || "Erreur"}` }]); return }
      setMessages(p => [...p, { role: "assistant", content: d.message }])
      if (d.type === "confirmation") setPending(d.action)
    } catch (e: any) {
      setMessages(p => [...p, { role: "assistant", content: `⚠️ ${e?.message || "Erreur réseau"}` }])
    } finally { setBusy(false) }
  }

  const send = () => {
    const text = input.trim()
    if (!text || busy || !societeId) return
    const next = [...messages, { role: "user" as const, content: text }]
    setMessages(next); setInput(""); callAgent(next)
  }
  const confirm = () => {
    if (!pending) return
    const next = [...messages, { role: "user" as const, content: "✅ Je confirme." }]
    setMessages(next); callAgent(next, { name: pending.name, input: pending.input })
  }
  const cancel = () => {
    setPending(null)
    setMessages(p => [...p, { role: "assistant", content: "Action annulée." }])
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 p-4 text-white shadow-2xl hover:scale-105 transition-transform"
        title="Agent comptable"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-3rem)] flex flex-col rounded-2xl border bg-white shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 p-1.5 text-white"><Bot className="h-4 w-4" /></div>
          <span className="font-semibold text-sm text-[#0B0F2E]">Agent comptable</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`rounded-2xl px-3 py-2 max-w-[85%] text-xs whitespace-pre-wrap ${m.role === "user" ? "bg-[#0B0F2E] text-white" : "bg-gray-100 text-gray-900"}`}>{m.content}</div>
          </div>
        ))}
        {pending && (
          <Card className="border-amber-300 bg-amber-50 p-3">
            <div className="text-xs font-medium text-amber-900 mb-1">Action à confirmer</div>
            <pre className="text-[11px] text-gray-700 whitespace-pre-wrap mb-2">{pending.resume}</pre>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirm} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Confirmer</Button>
              <Button size="sm" variant="outline" onClick={cancel} disabled={busy} className="h-7 text-xs"><XCircle className="h-3 w-3 mr-1" />Annuler</Button>
            </div>
          </Card>
        )}
        {busy && <div className="flex"><div className="rounded-2xl bg-gray-100 px-3 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" /></div></div>}
      </div>

      <div className="flex gap-2 p-3 border-t">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Posez votre question…" disabled={busy || !societeId} className="text-sm h-9" />
        <Button onClick={send} disabled={busy || !input.trim() || !societeId} className="bg-[#0B0F2E] text-white h-9 px-3"><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}
