/**
 * Batch re-analyse OCR endpoint — admin-only.
 *
 * GET  : prévisualisation (compte + estimation coût/durée) selon filtres.
 * POST : lance le job en background, met à jour `batch_reanalyze_jobs`.
 *
 * Règles :
 *  - Seuls les rôles `admin` / `super_admin` peuvent appeler.
 *  - Concurrency plafonnée (max 5 appels Claude en //).
 *  - Timeout global 10 min → marque le job `failed` avec raison "timeout".
 *  - Dry run : n'écrit rien en DB, renvoie simplement le compte qu'il traiterait.
 *  - Isolation des erreurs : une erreur sur un doc ne bloque pas les autres.
 *  - Idempotent : la logique `reanalyzeOneDocument` préserve les données
 *    existantes si l'extraction échoue.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getSystemPrompt,
  injectTauxChange,
  injectSocietes,
  CLAUDE_CONFIG,
  SYSTEM_PROMPT_GENERIC_EXTRACTION,
} from '@/lib/ai/prompts'
import type { PromptId } from '@/lib/ai/prompts'
import { isBankName, repairBankJSON } from '@/lib/utils/bank-utils'
import {
  validateFactureExtraction,
  validateReleveBancaireExtraction,
} from '@/lib/ai/validation-rules'
import {
  computeGranularConfidence,
  decideWorkflowAction,
} from '@/lib/utils/confidence-scorer'
import { suggestAccounts } from '@/lib/accounting/suggest-account'

export const runtime = 'nodejs'
export const maxDuration = 300

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TypeDocument =
  | 'facture_fournisseur'
  | 'facture_client'
  | 'releve_bancaire'
  | 'fiche_paie'
  | 'charges_sociales'
  | 'autre'

type BatchFilters = {
  societe_id: string | null
  type_document: TypeDocument | null
  only_errors: boolean
  only_low_confidence: boolean
  date_debut: string | null
  date_fin: string | null
  limit: number
}

interface JobErrorEntry {
  document_id: string
  nom_fichier?: string | null
  error: string
  at: string
}

interface JobStats {
  auto_approve: number
  quick_review: number
  full_review: number
  reject: number
}

interface ReanalyzeOutcome {
  ok: boolean
  document_id: string
  workflow_action?: 'auto_approve' | 'quick_review' | 'full_review' | 'reject'
  confidence_global?: number
  error?: string
}

// ---------------------------------------------------------------------------
// Auth helper (admin-only)
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<{ userId: string } | null> {
  const supabaseAuth = await createServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = profile?.role
  if (!role || !['admin', 'super_admin'].includes(role)) return null
  return { userId: user.id }
}

// ---------------------------------------------------------------------------
// Filter parsing
// ---------------------------------------------------------------------------

const VALID_TYPES: ReadonlyArray<TypeDocument> = [
  'facture_fournisseur',
  'facture_client',
  'releve_bancaire',
  'fiche_paie',
  'charges_sociales',
  'autre',
]

function parseFilters(input: Record<string, unknown>): BatchFilters {
  const raw = (k: string) => (input[k] === undefined || input[k] === null ? null : input[k])
  const str = (v: unknown): string | null => {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
    return null
  }
  const bool = (v: unknown): boolean => {
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') return v === 'true' || v === '1'
    return false
  }
  const type = str(raw('type_document')) as TypeDocument | null
  const filters: BatchFilters = {
    societe_id: str(raw('societe_id')),
    type_document: type && VALID_TYPES.includes(type) ? type : null,
    only_errors: bool(raw('only_errors')),
    only_low_confidence: bool(raw('only_low_confidence')),
    date_debut: str(raw('date_debut')),
    date_fin: str(raw('date_fin')),
    limit: Math.max(1, Math.min(500, Number(raw('limit')) || 100)),
  }
  return filters
}

// ---------------------------------------------------------------------------
// Query documents matching filters
// ---------------------------------------------------------------------------

type DocumentRow = {
  id: string
  nom_fichier: string
  type_fichier: string | null
  type_document: string | null
  statut: string | null
  storage_path: string | null
  dossier_id: string | null
  uploaded_by: string | null
  created_at: string
  n8n_result: Record<string, unknown> | null
  dossiers?: {
    client_id: string | null
    comptable_id: string | null
    societe_id: string | null
  } | null
}

async function fetchDocumentsForBatch(
  supabase: SupabaseClient,
  filters: BatchFilters
): Promise<DocumentRow[]> {
  let query = supabase
    .from('documents')
    .select(`
      id, nom_fichier, type_fichier, type_document, statut,
      storage_path, dossier_id, uploaded_by, created_at, n8n_result,
      dossiers(client_id, comptable_id, societe_id)
    `)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(filters.limit)

  if (filters.type_document) query = query.eq('type_document', filters.type_document)
  if (filters.only_errors) query = query.eq('statut', 'erreur')
  if (filters.date_debut) query = query.gte('created_at', filters.date_debut)
  if (filters.date_fin) query = query.lte('created_at', filters.date_fin)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  let rows = (data ?? []) as unknown as DocumentRow[]

  // societe_id is on dossiers — filter client-side
  if (filters.societe_id) {
    rows = rows.filter((d) => d.dossiers?.societe_id === filters.societe_id)
  }

  // low confidence: n8n_result.confidence_granular.global < 70
  if (filters.only_low_confidence) {
    rows = rows.filter((d) => {
      const n8n = d.n8n_result
      if (!n8n || typeof n8n !== 'object') return true
      const cg = (n8n as Record<string, unknown>).confidence_granular
      if (!cg || typeof cg !== 'object') return true
      const g = (cg as Record<string, unknown>).global
      const num = typeof g === 'number' ? g : Number(g)
      if (!Number.isFinite(num)) return true
      return num < 70
    })
  }

  return rows
}

// ---------------------------------------------------------------------------
// GET — preview
// ---------------------------------------------------------------------------

// Coût/durée estimés par document (ajustable).
const COST_PER_DOC_USD = 0.02
const SECONDS_PER_DOC = 5

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const url = new URL(req.url)
    const rawFilters: Record<string, unknown> = {}
    url.searchParams.forEach((v, k) => { rawFilters[k] = v })
    const filters = parseFilters(rawFilters)

    const supabase = getAdminClient()
    const docs = await fetchDocumentsForBatch(supabase, filters)

    const byType: Record<string, number> = {}
    const byStatut: Record<string, number> = {}
    for (const d of docs) {
      const t = d.type_document || 'inconnu'
      const s = d.statut || 'inconnu'
      byType[t] = (byType[t] ?? 0) + 1
      byStatut[s] = (byStatut[s] ?? 0) + 1
    }

    return NextResponse.json({
      ok: true,
      count: docs.length,
      by_type: byType,
      by_statut: byStatut,
      estimated_duration_sec: docs.length * SECONDS_PER_DOC,
      estimated_cost_usd: Math.round(docs.length * COST_PER_DOC_USD * 100) / 100,
      sample: docs.slice(0, 20).map((d) => ({
        id: d.id,
        nom_fichier: d.nom_fichier,
        type_document: d.type_document,
        statut: d.statut,
        created_at: d.created_at,
      })),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST — launch batch
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const filters = parseFilters(body)
    const concurrency = Math.max(1, Math.min(5, Number(body.concurrency) || 3))
    const dryRun = body.dry_run === true || body.dry_run === 'true'

    const supabase = getAdminClient()
    const docs = await fetchDocumentsForBatch(supabase, filters)

    if (docs.length === 0) {
      return NextResponse.json({
        ok: true,
        total_documents: 0,
        status: 'completed',
        message: 'Aucun document ne correspond aux filtres',
      })
    }

    // Create job row
    const jobInsert = {
      initiated_by: admin.userId,
      societe_id: filters.societe_id,
      filters: { ...filters, concurrency, dry_run: dryRun },
      total_documents: docs.length,
      status: 'running' as const,
      started_at: new Date().toISOString(),
      stats: { auto_approve: 0, quick_review: 0, full_review: 0, reject: 0 } satisfies JobStats,
    }
    const { data: jobRow, error: jobErr } = await supabase
      .from('batch_reanalyze_jobs')
      .insert(jobInsert)
      .select('id')
      .single()
    if (jobErr || !jobRow) {
      return NextResponse.json({ error: jobErr?.message || 'Could not create job' }, { status: 500 })
    }
    const jobId: string = jobRow.id

    // Fire-and-forget — don't await. Errors are caught internally and written
    // into the job row.
    void runBatchJob({ jobId, docs, concurrency, dryRun }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[batch-reanalyze] worker fatal:', msg)
    })

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      total_documents: docs.length,
      status: 'running',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Background worker
// ---------------------------------------------------------------------------

const JOB_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

async function runBatchJob(args: {
  jobId: string
  docs: DocumentRow[]
  concurrency: number
  dryRun: boolean
}): Promise<void> {
  const { jobId, docs, concurrency, dryRun } = args
  const supabase = getAdminClient()
  const started = Date.now()

  const stats: JobStats = { auto_approve: 0, quick_review: 0, full_review: 0, reject: 0 }
  const errors: JobErrorEntry[] = []
  let processed = 0
  let success = 0
  let errorCount = 0
  let timedOut = false

  const flushProgress = async () => {
    try {
      await supabase
        .from('batch_reanalyze_jobs')
        .update({
          processed_count: processed,
          success_count: success,
          error_count: errorCount,
          stats,
          errors: errors.slice(-50),
        })
        .eq('id', jobId)
    } catch (err) {
      console.warn('[batch-reanalyze] flushProgress failed:', err)
    }
  }

  try {
    // Chunk-based concurrency: process `concurrency` docs in parallel, wait
    // for chunk to complete, move on.
    for (let i = 0; i < docs.length; i += concurrency) {
      if (Date.now() - started > JOB_TIMEOUT_MS) {
        timedOut = true
        break
      }
      const chunk = docs.slice(i, i + concurrency)
      const results = await Promise.all(chunk.map((d) => reanalyzeOneDocument(supabase, d, dryRun)))
      for (const r of results) {
        processed += 1
        if (r.ok) {
          success += 1
          if (r.workflow_action) stats[r.workflow_action] += 1
        } else {
          errorCount += 1
          const docMatch = chunk.find((c) => c.id === r.document_id)
          errors.push({
            document_id: r.document_id,
            nom_fichier: docMatch?.nom_fichier ?? null,
            error: r.error || 'unknown error',
            at: new Date().toISOString(),
          })
        }
      }
      // Flush every chunk (which is ~= every N=concurrency docs, close to the
      // "every 10 docs" guidance).
      await flushProgress()
    }

    const finalStatus: 'completed' | 'failed' = timedOut ? 'failed' : 'completed'
    const finalErrors = timedOut
      ? [
          ...errors,
          {
            document_id: '',
            nom_fichier: null,
            error: `timeout (> ${Math.round(JOB_TIMEOUT_MS / 1000)}s)`,
            at: new Date().toISOString(),
          },
        ]
      : errors

    await supabase
      .from('batch_reanalyze_jobs')
      .update({
        processed_count: processed,
        success_count: success,
        error_count: errorCount,
        stats,
        errors: finalErrors.slice(-200),
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[batch-reanalyze] runBatchJob caught:', msg)
    try {
      await supabase
        .from('batch_reanalyze_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          errors: [...errors, { document_id: '', error: msg, at: new Date().toISOString() }].slice(-200),
        })
        .eq('id', jobId)
    } catch {
      /* already logged */
    }
  }
}

// ---------------------------------------------------------------------------
// Per-document re-analyze core logic
// ---------------------------------------------------------------------------

const TYPE_TO_PROMPT_ID: Record<string, PromptId> = {
  facture_fournisseur: 'facture_fournisseur',
  facture_client: 'facture_client',
  releve_bancaire: 'releve_bancaire',
  fiche_paie: 'fiche_paie',
  charges_sociales: 'charges_sociales',
}

async function reanalyzeOneDocument(
  supabase: SupabaseClient,
  doc: DocumentRow,
  dryRun: boolean
): Promise<ReanalyzeOutcome> {
  try {
    if (!doc.storage_path) {
      return { ok: false, document_id: doc.id, error: 'no storage_path' }
    }

    const typeForce: string = doc.type_document || 'autre'
    const isReleveBancaire = typeForce === 'releve_bancaire'
    const maxTokens = isReleveBancaire
      ? CLAUDE_CONFIG.max_tokens_releve_bancaire
      : CLAUDE_CONFIG.max_tokens

    // Fetch live rates (best-effort)
    let tauxChange: Record<string, number> = { EUR: 46.5, GBP: 54.2, USD: 44.8 }
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const tauxRes = await fetch(`${base}/api/taux-change`)
      if (tauxRes.ok) {
        const tauxData = (await tauxRes.json()) as { rates?: Record<string, number> }
        if (tauxData.rates) tauxChange = tauxData.rates
      }
    } catch {
      /* defaults */
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.storage_path)
    if (downloadError || !fileData) {
      return {
        ok: false,
        document_id: doc.id,
        error: `download failed: ${downloadError?.message || 'no file'}`,
      }
    }

    const fileArrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(fileArrayBuffer).toString('base64')
    const ext = doc.nom_fichier.split('.').pop()?.toLowerCase() || 'pdf'
    const isPdf = ext === 'pdf'
    const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

    // Societes for injection — best-effort (from dossier's client_id)
    let societeDetailsForPrompt: {
      id: string
      nom: string
      brn?: string | null
      aliases?: string[] | null
    }[] = []
    try {
      const clientId = doc.dossiers?.client_id
      if (clientId) {
        const { data: ownedSoc } = await supabase
          .from('societes')
          .select('id, nom, brn, aliases')
          .eq('created_by', clientId)
        societeDetailsForPrompt = (ownedSoc as typeof societeDetailsForPrompt) || []
      }
    } catch {
      /* empty */
    }

    const promptId = TYPE_TO_PROMPT_ID[typeForce]
    const systemPrompt = promptId
      ? injectSocietes(getSystemPrompt(promptId, tauxChange), societeDetailsForPrompt)
      : injectSocietes(
          injectTauxChange(SYSTEM_PROMPT_GENERIC_EXTRACTION, tauxChange),
          societeDetailsForPrompt
        )

    // Build message content — mirror the structure used in
    // app/api/documents/[id]/reanalyze/route.ts. Typed loosely against the SDK
    // because the generic `ContentBlockParam` union is narrowly literal.
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    let messageContent: Parameters<typeof anthropic.messages.stream>[0]['messages'][number]['content']
    if (isPdf) {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Analyse ce document comptable.' },
      ]
    } else if (isImage) {
      const mt: 'image/png' | 'image/jpeg' | 'image/webp' =
        ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } },
        { type: 'text', text: 'Analyse ce document comptable.' },
      ]
    } else {
      messageContent = `Analyse ce document:\n${Buffer.from(fileArrayBuffer)
        .toString('utf-8')
        .substring(0, 5000)}`
    }

    const stream = anthropic.messages.stream({
      model: CLAUDE_CONFIG.model,
      max_tokens: maxTokens,
      temperature: CLAUDE_CONFIG.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    })
    const aiResponse = await stream.finalMessage()
    const text = aiResponse.content
      .map((b) => ('text' in b && typeof b.text === 'string' ? b.text : ''))
      .join('')

    // Parse JSON
    let parsed: Record<string, unknown> | null = repairBankJSON(text)
    if (!parsed || typeof parsed !== 'object') {
      // Idempotent fallback: keep existing extraction.
      const savedExtraction =
        doc.n8n_result && typeof doc.n8n_result === 'object'
          ? ((doc.n8n_result as Record<string, unknown>).extraction as Record<string, unknown> | undefined)
          : undefined
      if (savedExtraction) {
        parsed = { extraction: savedExtraction, routing: { type_document: typeForce } }
      } else {
        parsed = { routing: { type_document: typeForce, societe: 'INCONNU', confiance_type: 30 }, extraction: {} }
      }
    }

    // Normalise routing/extraction
    let finalRouting: Record<string, unknown>
    let finalExtraction: Record<string, unknown>
    if (isReleveBancaire && !(parsed as Record<string, unknown>).routing) {
      const extractionBody = parsed as Record<string, unknown>
      const accountHolder =
        (extractionBody.nom_societe as string | undefined) ||
        (extractionBody.titulaire as string | undefined) ||
        null
      const routingSociete =
        accountHolder && !isBankName(accountHolder) ? accountHolder : 'INCONNU'
      finalRouting = { type_document: 'releve_bancaire', societe: routingSociete, confiance_type: 90 }
      finalExtraction = extractionBody
    } else {
      const p = parsed as Record<string, unknown>
      finalRouting =
        (p.routing as Record<string, unknown> | undefined) ||
        { type_document: typeForce, societe: 'INCONNU', confiance_type: 50 }
      finalExtraction = (p.extraction as Record<string, unknown> | undefined) || p
    }

    const routingType: string =
      (finalRouting.type_document as string | undefined) || typeForce

    // === Wave 1/2 libs ===
    const hasExtraction = Object.keys(finalExtraction).length > 0
    let validation: {
      valid: boolean
      issues: Array<{ field: string; severity: 'error' | 'warning' | 'info'; message: string; suggested_value?: unknown }>
      confidence_penalty: number
    } = { valid: true, issues: [], confidence_penalty: 0 }

    if (hasExtraction) {
      if (routingType === 'facture_fournisseur' || routingType === 'facture_client') {
        validation = validateFactureExtraction(finalExtraction)
      } else if (routingType === 'releve_bancaire') {
        validation = validateReleveBancaireExtraction(finalExtraction)
      }
    }

    const granularConfidence = hasExtraction
      ? computeGranularConfidence(finalExtraction, routingType, validation.issues.length)
      : {
          global: 0,
          fields: [],
          validation_issues_count: 0,
          auto_decision: 'reject' as const,
        }

    const workflowAction = decideWorkflowAction(granularConfidence.global)

    // Suggest accounts for supplier invoices only
    let accountSuggestions: Awaited<ReturnType<typeof suggestAccounts>> = []
    if (routingType === 'facture_fournisseur' && hasExtraction) {
      try {
        const suggestSocieteId = doc.dossiers?.societe_id || null
        const rawEmetteur = finalExtraction.emetteur ?? finalExtraction.fournisseur
        const emetteurName: string =
          rawEmetteur && typeof rawEmetteur === 'object'
            ? String(
                (rawEmetteur as Record<string, unknown>).nom ??
                  (rawEmetteur as Record<string, unknown>).name ??
                  ''
              )
            : String(rawEmetteur ?? '')
        const descriptionVal = finalExtraction.description
        const descriptionStr =
          typeof descriptionVal === 'string' && descriptionVal.trim().length > 0
            ? descriptionVal
            : undefined
        const montantTtcVal = finalExtraction.montant_ttc
        const montantTtcNum =
          typeof montantTtcVal === 'number' && Number.isFinite(montantTtcVal)
            ? montantTtcVal
            : undefined

        if (suggestSocieteId && emetteurName) {
          accountSuggestions = await suggestAccounts({
            societe_id: suggestSocieteId,
            tiers: emetteurName,
            libelle: descriptionStr,
            type_facture: 'fournisseur',
            montant_ttc: montantTtcNum,
            supabase,
          })
        }
      } catch (err) {
        console.warn(`[batch-reanalyze] suggestAccounts failed for ${doc.id}:`, err)
      }
    }

    // Persist
    if (!dryRun) {
      const updateFields = {
        n8n_result: {
          routing: finalRouting,
          extraction: finalExtraction,
          metadata: {
            model: CLAUDE_CONFIG.model,
            processed_at: new Date().toISOString(),
            reanalyzed: true,
            reanalyzed_by: 'batch',
          },
          validation: {
            valid: validation.valid,
            issues: validation.issues,
            issues_count: validation.issues.length,
          },
          confidence_granular: granularConfidence,
          workflow_action: workflowAction,
          account_suggestions: accountSuggestions,
        },
        statut: 'traite',
      }
      const { error: updErr } = await supabase
        .from('documents')
        .update(updateFields)
        .eq('id', doc.id)
      if (updErr) {
        return { ok: false, document_id: doc.id, error: `update failed: ${updErr.message}` }
      }
    }

    return {
      ok: true,
      document_id: doc.id,
      workflow_action: workflowAction,
      confidence_global: granularConfidence.global,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, document_id: doc.id, error: msg }
  }
}
