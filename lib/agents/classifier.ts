import { readFileSync } from 'fs'
import { join } from 'path'
import { runAgent, AgentError } from '@/lib/agents/core/agent-runner'
import { CLASSIFIER_TOOLS } from '@/lib/agents/tools/schemas'
import { getBankTransaction, getEmployeeByIban, getSupplierByName, getCustomerByName, getShareholderByName } from '@/lib/agents/tools/queries'
import { getHistoricalPatterns, computeFingerprint } from '@/lib/agents/tools/patterns'
import { updateTransactionClass } from '@/lib/agents/tools/writes'
import type { ClassificationResult } from '@/lib/types/reconciliation'

let SYSTEM_PROMPT: string | null = null
function getSystemPrompt(): string {
  if (!SYSTEM_PROMPT) {
    try {
      SYSTEM_PROMPT = readFileSync(join(process.cwd(), 'lib/agents/prompts/classifier.md'), 'utf-8')
    } catch {
      SYSTEM_PROMPT = 'Tu es un classificateur de transactions bancaires. Classe chaque transaction en utilisant les outils disponibles, puis appelle classify() avec ta décision.'
    }
  }
  return SYSTEM_PROMPT
}

async function executeTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  switch (toolName) {
    case 'get_transaction':
      return getBankTransaction(input.transaction_id as string)

    case 'match_employee_iban':
      return getEmployeeByIban(input.iban as string, input.societe_id as string)

    case 'match_supplier':
      return getSupplierByName(input.name as string, input.societe_id as string)

    case 'match_customer':
      return getCustomerByName(input.name as string, input.societe_id as string)

    case 'match_shareholder':
      return getShareholderByName(input.name as string, input.societe_id as string)

    case 'get_historical_patterns': {
      return getHistoricalPatterns(input.societe_id as string, input.fingerprint as string)
    }

    case 'classify': {
      const txId = input.transaction_id as string
      const classType = input.class as string
      const confidence = Number(input.confidence)
      const rationale = input.rationale as string

      await updateTransactionClass(txId, classType, confidence, rationale)

      return {
        transaction_id: txId,
        class: classType as ClassificationResult['class'],
        confidence,
        rationale,
        needs_review: confidence < 85,
      } satisfies ClassificationResult
    }

    default:
      throw new AgentError(`Outil inconnu: ${toolName}`, 'unknown_tool')
  }
}

export async function classifyTransaction(
  transactionId: string,
  societeId: string
): Promise<ClassificationResult> {
  // Pré-charger la tx pour enrichir le message
  const tx = await getBankTransaction(transactionId)
  if (!tx) throw new AgentError(`Transaction ${transactionId} introuvable`, 'tx_not_found')

  const fingerprint = computeFingerprint({
    libelle_banque: tx.libelle_banque,
    debit: Number(tx.debit) || 0,
    credit: Number(tx.credit) || 0,
    counterparty_iban: tx.counterparty_iban,
  })

  const userMessage = `Classifie la transaction ${transactionId}.

Détails :
- Date : ${tx.date_transaction}
- Libellé : ${tx.libelle_banque}
- Débit : ${tx.debit} ${tx.devise || 'MUR'}
- Crédit : ${tx.credit} ${tx.devise || 'MUR'}
- Tiers identifié : ${tx.tiers_identifie || 'non identifié'}
- IBAN contrepartie : ${tx.counterparty_iban || 'inconnu'}
- Société : ${societeId}
- Fingerprint : ${fingerprint}

Commence par get_historical_patterns pour vérifier si cette transaction a déjà été vue. Puis analyse les signaux et appelle classify() avec ta décision.`

  const result = await runAgent(
    {
      agent_name: 'classifier',
      system_prompt: getSystemPrompt(),
      tools: CLASSIFIER_TOOLS,
      user_message: userMessage,
      max_iterations: 8,
      timeout_ms: 25_000,
      terminal_tool_names: ['classify'],
    },
    executeTool,
    { societeId, transactionId }
  )

  if (!result.final_result) {
    throw new AgentError('Le classificateur n\'a pas appelé classify()', 'no_classification')
  }

  return result.final_result as unknown as ClassificationResult
}
