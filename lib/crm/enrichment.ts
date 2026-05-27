// =============================================================================
// lib/crm/enrichment.ts — Appel Claude pour enrichir sociétés et contacts
// =============================================================================

import Anthropic from '@anthropic-ai/sdk'
import { buildCompanyEnrichmentPrompt, buildContactEnrichmentPrompt } from './prompts'
import type { CrmCompany, CrmContact, CrmEnrichmentResult } from './types'

const MODEL = process.env.CRM_ENRICHMENT_MODEL || 'claude-sonnet-4-6'

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  return new Anthropic({ apiKey })
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return JSON.parse(trimmed)
  }
  // Fallback : extraire le 1er bloc {...}
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error('Réponse Claude non-JSON : ' + trimmed.slice(0, 200))
  }
  return JSON.parse(trimmed.slice(start, end + 1))
}

async function runClaude(prompt: string): Promise<CrmEnrichmentResult> {
  const anthropic = getAnthropicClient()
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.4,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  if (!block || block.type !== 'text') {
    throw new Error('Réponse Claude vide ou format inattendu')
  }
  const parsed = extractJson(block.text) as CrmEnrichmentResult
  parsed.generated_at = new Date().toISOString()
  parsed.model = MODEL
  return parsed
}

export async function enrichCompany(company: CrmCompany): Promise<CrmEnrichmentResult> {
  return runClaude(buildCompanyEnrichmentPrompt(company))
}

export async function enrichContact(
  contact: CrmContact,
  company?: CrmCompany | null,
): Promise<CrmEnrichmentResult> {
  return runClaude(buildContactEnrichmentPrompt(contact, company))
}

// -----------------------------------------------------------------------------
// Rendu d'une "stratégie" lisible à partir du résultat structuré
// -----------------------------------------------------------------------------
export function formatStrategy(result: CrmEnrichmentResult): string {
  const lines: string[] = []
  if (result.resume) lines.push('📌 ' + result.resume)
  if (result.niveau_priorite) lines.push(`Priorité : ${result.niveau_priorite}`)
  if (typeof result.score_qualification === 'number') {
    lines.push(`Score : ${result.score_qualification}/100`)
  }
  if (result.pain_points?.length) {
    lines.push('\n🔥 Pain points :')
    result.pain_points.forEach((p) => lines.push(`  • ${p}`))
  }
  if (result.opportunites_lexora?.length) {
    lines.push('\n✨ Modules Lexora pertinents :')
    result.opportunites_lexora.forEach((o) => lines.push(`  • ${o}`))
  }
  if (result.canal_recommande) {
    lines.push(`\n📞 Canal recommandé : ${result.canal_recommande}`)
  }
  if (result.timing_recommande) {
    lines.push(`⏰ Timing : ${result.timing_recommande}`)
  }
  if (result.accroches?.email_court) {
    lines.push('\n✉️ Accroche email courte :')
    lines.push(result.accroches.email_court)
  }
  if (result.accroches?.linkedin_dm) {
    lines.push('\n💬 LinkedIn DM :')
    lines.push(result.accroches.linkedin_dm)
  }
  return lines.join('\n')
}
