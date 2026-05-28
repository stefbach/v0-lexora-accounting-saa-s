"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { CrmEnrichmentResult } from "@/lib/crm/types"

interface Props {
  kind: "company" | "contact"
  targetId: string
  initialEnrichment?: CrmEnrichmentResult | null
  initialStrategy?: string | null
  onEnriched?: (data: { enrichment: CrmEnrichmentResult; strategy: string }) => void
}

export function EnrichButton({ kind, targetId, initialEnrichment, initialStrategy, onEnriched }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [enrichment, setEnrichment] = useState<CrmEnrichmentResult | null | undefined>(initialEnrichment)
  const [strategy, setStrategy] = useState<string | null | undefined>(initialStrategy)

  const run = async () => {
    setLoading(true)
    try {
      const url = kind === "company"
        ? `/api/crm/companies/${targetId}/enrich`
        : `/api/crm/contacts/${targetId}/enrich`
      const res = await fetch(url, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur enrichissement")
      const data = json?.data || {}
      setEnrichment(data.enrichment ?? null)
      setStrategy(data.strategy ?? null)
      onEnriched?.(data)
      toast({ title: "Analyse Claude terminee" })
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message || String(err), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Strategie IA</h3>
          <p className="text-xs text-muted-foreground">Analyse Claude pour identifier les opportunites et personnaliser l'approche</p>
        </div>
        <Button onClick={run} disabled={loading} style={{ backgroundColor: "#0B0F2E", color: "#fff" }}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {enrichment ? "Re-analyser" : "Analyser avec Claude"}
        </Button>
      </div>

      {enrichment && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enrichment.resume && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Resume</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-700">{enrichment.resume}</CardContent>
            </Card>
          )}
          {enrichment.persona && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Persona</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-700">{enrichment.persona}</CardContent>
            </Card>
          )}
          {enrichment.pain_points && enrichment.pain_points.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Pain points</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc list-inside text-gray-700">
                  {enrichment.pain_points.map((p, i) => (<li key={i}>{p}</li>))}
                </ul>
              </CardContent>
            </Card>
          )}
          {enrichment.opportunites_lexora && enrichment.opportunites_lexora.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Opportunites Lexora</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc list-inside text-gray-700">
                  {enrichment.opportunites_lexora.map((p, i) => (<li key={i}>{p}</li>))}
                </ul>
              </CardContent>
            </Card>
          )}
          {enrichment.motivations && enrichment.motivations.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Motivations</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc list-inside text-gray-700">
                  {enrichment.motivations.map((p, i) => (<li key={i}>{p}</li>))}
                </ul>
              </CardContent>
            </Card>
          )}
          {enrichment.objections_probables && enrichment.objections_probables.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Objections probables</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc list-inside text-gray-700">
                  {enrichment.objections_probables.map((p, i) => (<li key={i}>{p}</li>))}
                </ul>
              </CardContent>
            </Card>
          )}
          {enrichment.accroches && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Accroches suggerees</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {enrichment.accroches.email_court && (
                  <div><div className="text-xs font-semibold text-gray-500 mb-1">Email court</div><p className="text-gray-700 whitespace-pre-wrap">{enrichment.accroches.email_court}</p></div>
                )}
                {enrichment.accroches.email_long && (
                  <div><div className="text-xs font-semibold text-gray-500 mb-1">Email long</div><p className="text-gray-700 whitespace-pre-wrap">{enrichment.accroches.email_long}</p></div>
                )}
                {enrichment.accroches.linkedin_dm && (
                  <div><div className="text-xs font-semibold text-gray-500 mb-1">LinkedIn DM</div><p className="text-gray-700 whitespace-pre-wrap">{enrichment.accroches.linkedin_dm}</p></div>
                )}
                {enrichment.accroches.whatsapp && (
                  <div><div className="text-xs font-semibold text-gray-500 mb-1">WhatsApp</div><p className="text-gray-700 whitespace-pre-wrap">{enrichment.accroches.whatsapp}</p></div>
                )}
              </CardContent>
            </Card>
          )}
          {(enrichment.canal_recommande || enrichment.timing_recommande || enrichment.niveau_priorite || enrichment.score_qualification != null) && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recommandations</CardTitle></CardHeader>
              <CardContent className="text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
                {enrichment.canal_recommande && (<div><div className="text-xs text-muted-foreground">Canal</div><div className="font-medium">{enrichment.canal_recommande}</div></div>)}
                {enrichment.timing_recommande && (<div><div className="text-xs text-muted-foreground">Timing</div><div className="font-medium">{enrichment.timing_recommande}</div></div>)}
                {enrichment.niveau_priorite && (<div><div className="text-xs text-muted-foreground">Priorite</div><div className="font-medium uppercase">{enrichment.niveau_priorite}</div></div>)}
                {enrichment.score_qualification != null && (<div><div className="text-xs text-muted-foreground">Score</div><div className="font-medium">{enrichment.score_qualification}/100</div></div>)}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {strategy && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Strategie complete</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap text-gray-700">{strategy}</CardContent>
        </Card>
      )}

      {!enrichment && !loading && (
        <div className="text-sm text-muted-foreground italic">Aucune analyse pour le moment. Cliquez sur "Analyser avec Claude" pour generer une strategie personnalisee.</div>
      )}
    </div>
  )
}
