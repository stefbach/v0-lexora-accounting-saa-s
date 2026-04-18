"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Zap } from "lucide-react"

export default function AgentTestPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const societeId = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'

  const runAgent = async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/v1/agent/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: societeId, batch: true, limit: 2 }),
      })
      const data = await res.json()
      setResult(data)
    } catch (e: any) {
      setError(e.message || 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#0B0F2E]">🤖 Test Agent IA</h1>
      <p className="text-gray-500">Société : Digital Data Solutions ({societeId.slice(0, 8)}…)</p>

      <Button onClick={runAgent} disabled={loading} className="bg-[#0B0F2E] text-white" size="lg">
        {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Agent en cours...</> : <><Zap className="w-4 h-4 mr-2" />Lancer l&apos;agent (2 tx)</>}
      </Button>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-red-700 text-sm font-mono whitespace-pre-wrap">{error}</CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto max-h-[600px]">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
