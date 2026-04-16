"use client"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Send, Loader2, Bot, User, Trash2 } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

// Simple markdown to HTML renderer (no external deps)
function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Headers (must be before other replacements)
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-bold mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold mt-4 mb-2 border-b border-gray-200 pb-1">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, '<div class="border-l-4 border-amber-400 bg-amber-50 pl-3 py-2 my-2 text-sm italic">$1</div>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-gray-200"/>')
    // Unordered list items
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm py-0.5">$1</li>')
    // Table handling
    .replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map((c: string) => c.trim())
      if (cells.every((c: string) => /^[-:]+$/.test(c))) return '' // separator row
      const isHeader = cells.some((c: string) => c.startsWith('**') && c.endsWith('**'))
      const tag = isHeader ? 'th' : 'td'
      const cls = isHeader
        ? 'class="px-3 py-1.5 text-left text-xs font-semibold bg-gray-100 border border-gray-200"'
        : 'class="px-3 py-1.5 text-xs border border-gray-200"'
      const row = cells.map((c: string) => `<${tag} ${cls}>${c}</${tag}>`).join('')
      return `<tr>${row}</tr>`
    })
    // Remove emojis
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2702}-\u{27B0}]|[\u{24C2}-\u{1F251}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]|[✅⚠️⚖️📋📌📈💡🌴]/gu, '')

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="my-2">$1</ul>')

  // Wrap consecutive <tr> in <table>
  html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/g, '<table class="w-full border-collapse my-3 rounded overflow-hidden">$1</table>')

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p class="my-1">').replace(/\n/g, '<br/>')

  return `<div class="space-y-1"><p class="my-1">${html}</p></div>`
}

export default function ChatCLARAPage() {
  const [messages, setMessages] = useState<Array<{role:"user"|"assistant",content:string}>>([
    {role:"assistant", content:"Bonjour, je suis CLARA, votre assistante RH specialisee en droit du travail mauricien (Workers' Rights Act 2019, MRA, CSG/PAYE). Comment puis-je vous aider ?"}
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
      const res = await fetch("/api/rh/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          message: msg,
          conversation_id: convId,
          system_hint: "Reponds de maniere structuree et professionnelle. Utilise des tableaux et listes quand necessaire. Ne mets PAS d'emojis. Utilise des tirets (-) pour les listes. Cite les articles de loi pertinents."
        })
      })
      const data = await res.json()
      if (data.conversation_id) setConvId(data.conversation_id)
      setMessages(m => [...m, {role:"assistant", content:data.reply || data.message || "Pas de reponse"}])
    } catch { setMessages(m=>[...m,{role:"assistant",content:"Une erreur s'est produite. Veuillez reessayer."}]) }
    finally { setLoading(false) }
  }

  const clearChat = () => {
    setMessages([{role:"assistant", content:"Bonjour, je suis CLARA. Comment puis-je vous aider ?"}])
    setConvId(null)
  }

  const suggestions = [
    "Combien de jours de conge annuel pour 4 ans d'anciennete ?",
    "Quels sont les taux CSG/NSF en vigueur ?",
    "Calcul du PAYE pour un salaire de 45 000 MUR",
    "Regles de licenciement selon le WRA 2019",
    "Droits maternite a Maurice",
  ]

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <Bot className="w-6 h-6" style={{ color: GOLD }}/>
            Assistant RH — CLARA
          </h1>
          <p className="text-sm text-gray-500">Droit du travail mauricien, paie, conges, contrats</p>
        </div>
        <Button variant="outline" size="sm" onClick={clearChat} className="gap-1">
          <Trash2 className="w-4 h-4"/>Nouveau chat
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-gray-200">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role==="user" ? "flex-row-reverse" : ""}`}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: m.role==="assistant" ? NAVY : GOLD }}
              >
                {m.role==="assistant" ? <Bot className="w-4 h-4 text-white"/> : <User className="w-4 h-4 text-white"/>}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.role==="assistant" ? "bg-gray-50 border border-gray-200" : "text-white"}`}
                style={m.role==="user" ? { backgroundColor: NAVY } : undefined}
              >
                {m.role === "assistant" ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-800 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed">{m.content}</p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: NAVY }}>
                <Bot className="w-4 h-4 text-white"/>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-500"/>
                  <span className="text-sm text-gray-500">CLARA analyse votre question...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </CardContent>

        {/* Suggestions (only show when few messages) */}
        {messages.length <= 2 && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
            <p className="text-xs text-gray-400 mb-2">Suggestions :</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => { setInput(s); }} className="text-xs px-3 py-1.5 rounded-full border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-gray-600 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t p-4 flex gap-2">
          <Input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&send()}
            placeholder="Posez votre question RH (conges, paie, contrats, droit du travail)..."
            className="flex-1"
          />
          <Button onClick={send} disabled={loading||!input.trim()} style={{ backgroundColor: NAVY }} className="text-white">
            <Send className="w-4 h-4"/>
          </Button>
        </div>
      </Card>
    </div>
    </ClientPageShell>
  )
}
