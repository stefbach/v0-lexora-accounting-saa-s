"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ShieldOff, KeyRound, Link2, Sparkles, Send, CheckCircle2, XCircle } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

interface ConnectorInfo {
  name: string
  configured?: boolean
  description?: string
}

export default function CrmSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([])

  useEffect(() => {
    fetch("/api/crm/internal/connectors-search")
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((j) => {
        const list: ConnectorInfo[] = Array.isArray(j.data)
          ? j.data
          : Array.isArray(j.connectors)
          ? j.connectors
          : []
        setConnectors(list)
      })
      .catch(() => setConnectors([]))
      .finally(() => setLoading(false))
  }, [])

  const envVars = [
    { name: "ANTHROPIC_API_KEY", icon: Sparkles, desc: "Enrichissement IA Claude (analyse societes & contacts)" },
    { name: "INTERNAL_HMAC_SECRET", icon: KeyRound, desc: "Signature HMAC pour ingestion N8N / connecteurs" },
    { name: "APOLLO_API_KEY", icon: Link2, desc: "Connecteur Apollo (optionnel)" },
    { name: "N8N_CRM_WEBHOOK_URL", icon: Send, desc: "Declencheur outreach via N8N (optionnel)" },
  ]

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: NAVY }}>Parametres CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">Configuration des connecteurs et conformite</p>
      </div>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base">Connecteurs disponibles</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>
          ) : connectors.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aucun connecteur disponible.</p>
          ) : (
            <ul className="divide-y">
              {connectors.map((c) => (
                <li key={c.name} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: NAVY }}>{c.name}</div>
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                  </div>
                  {c.configured ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-1">
                      <CheckCircle2 className="h-3 w-3" /> Configure
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2 py-1">
                      <XCircle className="h-3 w-3" /> Non configure
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base">Variables d'environnement</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">A configurer cote serveur (Vercel env vars). Les valeurs ne sont jamais affichees ici pour des raisons de securite.</p>
          <ul className="space-y-2">
            {envVars.map((v) => {
              const Icon = v.icon
              return (
                <li key={v.name} className="flex items-start gap-3 rounded-md border bg-white px-3 py-2">
                  <Icon className="h-4 w-4 mt-0.5" style={{ color: GOLD }} />
                  <div>
                    <code className="text-xs font-mono font-semibold" style={{ color: NAVY }}>{v.name}</code>
                    <div className="text-xs text-muted-foreground">{v.desc}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldOff className="h-4 w-4" /> Conformite DPA Maurice 2017</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 mb-3">
            Le Data Protection Act 2017 impose le respect des demandes d'opt-out commerciales. Tout contact ajoute au registre des opt-outs ne peut plus etre sollicite.
          </p>
          <Link href="/crm/settings/opt-outs" className="inline-flex items-center gap-2 text-sm font-medium rounded-md px-3 py-2" style={{ backgroundColor: NAVY, color: "#fff" }}>
            <ShieldOff className="h-4 w-4" /> Gerer le registre des opt-outs
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
