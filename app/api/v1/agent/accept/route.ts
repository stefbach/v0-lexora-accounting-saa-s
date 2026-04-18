import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { acceptAllocation } from '@/lib/agents/tools/writes'
import { recordLearningPattern } from '@/lib/agents/tools/patterns'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { allocation_id } = await request.json()
    if (!allocation_id) return NextResponse.json({ error: 'allocation_id requis' }, { status: 400 })

    const result = await acceptAllocation(allocation_id, user.id)

    // Enregistrer un pattern d'apprentissage positif
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: alloc } = await supabase
      .from('transaction_allocations')
      .select('transaction_id, societe_id, agent_name, third_party_name, account_code')
      .eq('id', allocation_id)
      .single()

    if (alloc) {
      const { data: tx } = await supabase
        .from('transactions_bancaires')
        .select('libelle_banque, counterparty_iban, classified_type')
        .eq('id', alloc.transaction_id)
        .single()

      if (tx && tx.classified_type) {
        await recordLearningPattern('client', {
          societeId: alloc.societe_id,
          patternType: tx.counterparty_iban ? 'iban_third_party' : 'label_third_party',
          labelPattern: tx.libelle_banque?.substring(0, 50) || undefined,
          counterpartyIban: tx.counterparty_iban || undefined,
          predictedClass: tx.classified_type as any,
          predictedThirdPartyName: alloc.third_party_name || undefined,
          predictedAccountCode: alloc.account_code || undefined,
        })
      }
    }

    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
