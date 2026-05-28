/**
 * Agent comptable conversationnel — définition des outils et exécuteurs.
 *
 * Deux familles :
 *   • READ  : exécutés directement par l'agent (consultation libre)
 *   • WRITE : nécessitent une confirmation explicite de l'utilisateur avant
 *             exécution (intégrité comptable). L'agent les PROPOSE, le client
 *             affiche, l'utilisateur valide.
 *
 * Les exécuteurs appellent directement les libs métier (pas de HTTP interne).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { reclassEcritures } from '@/lib/pcm/reclass'
import { createEcrituresReglementTiers } from '@/lib/accounting/reglement-tiers'

export const READ_TOOLS = new Set([
  'list_factures', 'get_balance', 'list_grand_livre', 'list_comptes_pcm', 'list_transactions_bancaires',
])
export const WRITE_TOOLS = new Set([
  'creer_ecriture', 'lettrer_ecritures', 'reclasser_ecritures',
])

export const AGENT_TOOLS = [
  // ── LECTURE ────────────────────────────────────────────────────────
  {
    name: 'list_factures',
    description: 'Liste les factures de la société (clients et/ou fournisseurs). Filtres : type (client/fournisseur), statut, recherche tiers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['client', 'fournisseur'] },
        statut: { type: 'string', enum: ['en_attente', 'paye', 'retard', 'partiel'] },
        tiers: { type: 'string', description: 'Recherche sur le nom du tiers' },
      },
    },
  },
  {
    name: 'get_balance',
    description: 'Balance des comptes (débit/crédit/solde par compte) sur la période courante, filtrable par classe (1-8).',
    input_schema: {
      type: 'object' as const,
      properties: { classe: { type: 'string', description: 'Classe comptable 1-8' } },
    },
  },
  {
    name: 'list_grand_livre',
    description: 'Écritures du grand livre. Filtres : compte, dates, unlettered_only (non lettrées).',
    input_schema: {
      type: 'object' as const,
      properties: {
        compte: { type: 'string' }, date_debut: { type: 'string' }, date_fin: { type: 'string' },
        unlettered_only: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_comptes_pcm',
    description: 'Comptes du plan comptable de la société (numéro, intitulé, classe). Pour savoir sur quel compte affecter.',
    input_schema: {
      type: 'object' as const,
      properties: { search: { type: 'string' }, classe: { type: 'number' } },
    },
  },
  {
    name: 'list_transactions_bancaires',
    description: 'Mouvements bancaires. Filtres : periode (YYYY-MM), statut (rapproche/non_identifie), min_montant.',
    input_schema: {
      type: 'object' as const,
      properties: { periode: { type: 'string' }, statut: { type: 'string' }, min_montant: { type: 'number' } },
    },
  },

  // ── ÉCRITURE (confirmation requise) ─────────────────────────────────
  {
    name: 'creer_ecriture',
    description: 'Crée une écriture comptable équilibrée (débit = crédit). Ex: affecter une avance/compte courant à une facture. Lignes [{compte, debit, credit, libelle?}].',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_ecriture: { type: 'string', description: 'YYYY-MM-DD' },
        journal: { type: 'string', description: 'Défaut OD' },
        libelle: { type: 'string' },
        lignes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              compte: { type: 'string' }, debit: { type: 'number' }, credit: { type: 'number' }, libelle: { type: 'string' },
            },
            required: ['compte'],
          },
        },
      },
      required: ['date_ecriture', 'libelle', 'lignes'],
    },
  },
  {
    name: 'lettrer_ecritures',
    description: 'Lettre un ensemble d\'écritures (les rapproche). Ex: lettrer une avance avec une facture. ecritures_ids: UUIDs.',
    input_schema: {
      type: 'object' as const,
      properties: { ecritures_ids: { type: 'array', items: { type: 'string' } } },
      required: ['ecritures_ids'],
    },
  },
  {
    name: 'reclasser_ecritures',
    description: 'Reclasse les écritures d\'un compte vers un autre. Ex: 471 → 4511.OCC. Filtre optionnel libelle_contains.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_compte: { type: 'string' }, to_compte: { type: 'string' },
        libelle_contains: { type: 'string' }, reason: { type: 'string' },
      },
      required: ['from_compte', 'to_compte', 'reason'],
    },
  },
]

interface ExecCtx {
  supabase: SupabaseClient
  societeId: string
  userId: string
}

const SELECT_GL = 'id, date_ecriture, journal, numero_compte, nom_compte, libelle, debit_mur, credit_mur, lettre'

/** Exécute un outil LECTURE. Retourne un objet JSON-sérialisable. */
export async function execReadTool(name: string, input: any, ctx: ExecCtx): Promise<unknown> {
  const { supabase, societeId } = ctx
  switch (name) {
    case 'list_factures': {
      let q = supabase.from('factures')
        .select('id, numero_facture, type_facture, tiers, statut, montant_ttc, solde_non_paye, devise, date_facture')
        .eq('societe_id', societeId)
      if (input.type) q = q.eq('type_facture', input.type)
      if (input.statut) q = q.eq('statut', input.statut)
      if (input.tiers) q = q.ilike('tiers', `%${input.tiers}%`)
      const { data } = await q.order('date_facture', { ascending: false }).limit(50)
      return { factures: data || [] }
    }
    case 'list_comptes_pcm': {
      let q = supabase.from('comptes_societes')
        .select('numero, intitule, classe, type, sens_normal').eq('societe_id', societeId).eq('archive', false)
      if (input.classe) q = q.eq('classe', input.classe)
      if (input.search) q = q.or(`numero.ilike.%${input.search}%,intitule.ilike.%${input.search}%`)
      const { data } = await q.order('numero').limit(100)
      return { comptes: data || [] }
    }
    case 'list_grand_livre': {
      let q = supabase.from('ecritures_comptables_v2').select(SELECT_GL).eq('societe_id', societeId)
      if (input.compte) q = q.eq('numero_compte', input.compte)
      if (input.date_debut) q = q.gte('date_ecriture', input.date_debut)
      if (input.date_fin) q = q.lte('date_ecriture', input.date_fin)
      if (input.unlettered_only) q = q.is('lettre', null)
      const { data } = await q.order('date_ecriture', { ascending: false }).limit(100)
      return { ecritures: data || [] }
    }
    case 'get_balance': {
      const acc = new Map<string, { numero: string; nom: string; debit: number; credit: number }>()
      let from = 0
      while (true) {
        let q = supabase.from('ecritures_comptables_v2').select('numero_compte, nom_compte, debit_mur, credit_mur').eq('societe_id', societeId).range(from, from + 999)
        const { data } = await q
        if (!data || data.length === 0) break
        for (const e of data) {
          if (input.classe && String(e.numero_compte)[0] !== String(input.classe)) continue
          if (!acc.has(e.numero_compte)) acc.set(e.numero_compte, { numero: e.numero_compte, nom: e.nom_compte || '', debit: 0, credit: 0 })
          const a = acc.get(e.numero_compte)!; a.debit += +e.debit_mur || 0; a.credit += +e.credit_mur || 0
        }
        if (data.length < 1000) break
        from += 1000
      }
      return { balance: [...acc.values()].map(b => ({ ...b, solde: Math.round((b.debit - b.credit) * 100) / 100 })).sort((a, b) => a.numero.localeCompare(b.numero)) }
    }
    case 'list_transactions_bancaires': {
      const { data: releves } = await supabase.from('releves_bancaires')
        .select('id, transactions_json').eq('societe_id', societeId).is('superseded_by_id', null)
      const txs: any[] = []
      for (const r of releves || []) {
        for (const [idx, tx] of (r.transactions_json || []).entries()) {
          if (input.periode && !(tx.date || '').startsWith(input.periode)) continue
          if (input.statut && (tx.statut || 'non_identifie') !== input.statut) continue
          const montant = Math.max(+tx.debit || 0, +tx.credit || 0)
          if (input.min_montant && montant < input.min_montant) continue
          txs.push({ id: `${r.id}-${idx}`, date: tx.date, libelle: tx.libelle, montant, statut: tx.statut || 'non_identifie', tiers: tx.tiers_detecte || null })
        }
      }
      return { transactions: txs.slice(0, 100), total: txs.length }
    }
    default:
      return { error: `Outil lecture inconnu: ${name}` }
  }
}

/** Exécute un outil ÉCRITURE (après confirmation utilisateur). */
export async function execWriteTool(name: string, input: any, ctx: ExecCtx): Promise<unknown> {
  const { supabase, societeId, userId } = ctx
  switch (name) {
    case 'creer_ecriture': {
      const lignes = Array.isArray(input.lignes) ? input.lignes : []
      const totalD = lignes.reduce((s: number, l: any) => s + (+l.debit || 0), 0)
      const totalC = lignes.reduce((s: number, l: any) => s + (+l.credit || 0), 0)
      if (Math.abs(totalD - totalC) > 0.01) return { ok: false, error: `Écriture déséquilibrée: D ${totalD} ≠ C ${totalC}` }
      const numeros = [...new Set(lignes.map((l: any) => l.compte))]
      const { data: comptes } = await supabase.from('comptes_societes').select('numero, intitule, archive').eq('societe_id', societeId).in('numero', numeros as string[])
      const cmap = new Map((comptes || []).map((c: any) => [c.numero, c]))
      for (const num of numeros) {
        const c = cmap.get(num as string)
        if (!c) return { ok: false, error: `Compte ${num} absent du PCM` }
        if (c.archive) return { ok: false, error: `Compte ${num} archivé` }
      }
      const refFolio = `OD-AGENT-${Date.now()}`
      const exercice = String(new Date(input.date_ecriture).getFullYear())
      const rows = lignes.map((l: any) => ({
        societe_id: societeId, date_ecriture: input.date_ecriture, journal: input.journal || 'OD',
        numero_piece: refFolio, ref_folio: refFolio, numero_compte: l.compte, nom_compte: cmap.get(l.compte)!.intitule,
        libelle: l.libelle || input.libelle, description: l.libelle || input.libelle,
        debit_mur: +l.debit || 0, credit_mur: +l.credit || 0, debit: +l.debit || 0, credit: +l.credit || 0,
        devise: 'MUR', exercice,
      }))
      const { error } = await supabase.from('ecritures_comptables_v2').insert(rows)
      if (error) return { ok: false, error: error.message }
      await supabase.from('audit_log_pcm').insert({
        societe_id: societeId, action: 'create_journal_entry', entity_type: 'ecriture', entity_id: refFolio,
        after_state: { ref_folio: refFolio, lignes: rows.length }, actor_id: userId, actor_type: 'mcp_llm',
        reason: `Agent conversationnel: ${input.libelle}`,
      })
      return { ok: true, ref_folio: refFolio, nb_lignes: rows.length }
    }
    case 'lettrer_ecritures': {
      const ids = input.ecritures_ids || []
      const { data: ecr } = await supabase.from('ecritures_comptables_v2').select('id, societe_id, debit_mur, credit_mur, lettre').in('id', ids)
      if (!ecr || ecr.length !== ids.length) return { ok: false, error: 'Écritures introuvables' }
      if (ecr.some(e => e.societe_id !== societeId)) return { ok: false, error: 'Écriture hors société' }
      if (ecr.some(e => e.lettre)) return { ok: false, error: 'Écritures déjà lettrées' }
      const code = `LA${String(Date.now()).slice(-5)}`
      const { error } = await supabase.from('ecritures_comptables_v2').update({ lettre: code, date_lettrage: new Date().toISOString().slice(0, 10) }).in('id', ids)
      if (error) return { ok: false, error: error.message }
      return { ok: true, code_lettre: code, nb: ids.length }
    }
    case 'reclasser_ecritures': {
      const res = await reclassEcritures(supabase as any, {
        societeId, fromCompte: input.from_compte, toCompte: input.to_compte,
        filter: input.libelle_contains ? { libelle_contains: input.libelle_contains } : undefined,
        dryRun: false,
      })
      return { ok: true, ...res }
    }
    default:
      return { ok: false, error: `Outil écriture inconnu: ${name}` }
  }
}
