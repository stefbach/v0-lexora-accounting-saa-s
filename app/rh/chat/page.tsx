"use client"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Send, Loader2, Bot, User } from "lucide-react"

export default function ChatCLARAPage() {
  const [messages, setMessages] = useState<Array<{role:"user"|"assistant",content:string}>>([
    {role:"assistant", content:"Bonjour ! Je suis CLARA, votre assistante RH. Je connais parfaitement le droit du travail mauricien (WRA 2019, MRA, CSG/PAYE). Comment puis-je vous aider ?"}
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [convId, setConvId] = useState<string|null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }) }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const msg = input.trim(); setInput("")
    setMessages(m => [...m, {role:"user", content:msg}])
    setLoading(true)
    try {
      const res = await fetch("/api/rh/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ message:msg, conversation_id:convId }) })
      const data = await res.json()
      if (data.conversation_id) setConvId(data.conversation_id)
      setMessages(m => [...m, {role:"assistant", content:data.reply}])
    } catch(e) { setMessages(m=>[...m,{role:"assistant",content:"Désolée, une erreur s'est produite."}]) }
    finally { setLoading(false) }
  }

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-2rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#1E2A4A] flex items-center gap-2"><Bot className="w-6 h-6 text-[#C9A84C]"/>Chat CLARA</h1>
        <p className="text-sm text-gray-500">Assistante RH IA — Droit du travail mauricien, paie, congés</p>
      </div>
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role==="user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.role==="assistant" ? "bg-[#1E2A4A]" : "bg-[#C9A84C]"}`}>
                {m.role==="assistant" ? <Bot className="w-4 h-4 text-white"/> : <User className="w-4 h-4 text-white"/>}
              </div>
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role==="assistant" ? "bg-gray-100 text-gray-800" : "bg-[#1E2A4A] text-white"}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1E2A4A] flex items-center justify-center"><Bot className="w-4 h-4 text-white"/></div>
              <div className="bg-gray-100 rounded-2xl px-4 py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-500"/></div>
            </div>
          )}
          <div ref={bottomRef}/>
        </CardContent>
        <div className="border-t p-4 flex gap-2">
          <Input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Posez votre question RH..." className="flex-1"/>
          <Button onClick={send} disabled={loading||!input.trim()} className="bg-[#1E2A4A] text-white"><Send className="w-4 h-4"/></Button>
        </div>
      </Card>
    </div>
  )
}
