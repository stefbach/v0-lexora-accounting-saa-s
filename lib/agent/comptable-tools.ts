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
import { enregistrerPaiement } from '@/lib/accounting/paiements-factures'
import { checkPeriodLock } from '@/lib/accounting/period-lock'
import { sendGmail } from '@/lib/google/gmail-client'
import { getGoogleAccount, listGoogleAccounts, googleCalendarFetch, extractMeetUrl } from '@/lib/google/calendar-client'
import { nylasListEvents, nylasCreateEvent, nylasSend } from '@/lib/nylas/agent-bridge'

/**
 * Clé déterministe courte pour l'idempotence de creer_ecriture : un même
 * contenu (date + journal + libellé + lignes) produit le même ref_folio, ce
 * qui permet de détecter et ignorer un appel rejoué (double-clic / retry).
 */
function ecritureContentKey(payload: string): string {
  let h = 0
  for (let i = 0; i < payload.length; i++) h = (Math.imul(31, h) + payload.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export const READ_TOOLS = new Set([
  'list_factures', 'get_balance', 'list_grand_livre', 'list_comptes_pcm', 'list_transactions_bancaires',
  'list_comptes_bancaires',
  'lancer_rapprochement_auto', 'analyser_cloture',
  // RH / paie / MRA (fusion Cerveau → Expert Lexora)
  'list_bulletins', 'list_employes_rh', 'get_leave_balance_rh', 'get_mra_compliance', 'calc_paye_net',
  // Cross-channel (Expert ↔ Telegram) — mig 458
  'recall_other_channel',
  // Google Workspace (lecture) — compte OAuth lib/google
  'list_evenements_calendar',
])
export const NOTIFY_TOOLS = new Set([
  // Actions externes mais SANS impact comptable → bypass confirmation classique.
  // Toujours marquées isAction côté UI pour transparence.
  'notify_telegram', 'web_handoff_link',
])
export const WRITE_TOOLS = new Set([
  'creer_ecriture', 'lettrer_ecritures', 'reclasser_ecritures', 'enregistrer_paiement_facture',
  // Effets de bord externes (push Telegram, lien magique) — passent aussi par confirmation
  'notify_telegram', 'web_handoff_link',
  // Google Workspace (effets de bord externes irréversibles) → confirmation obligatoire
  'envoyer_email', 'creer_evenement_calendar',
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
  {
    name: 'list_comptes_bancaires',
    description: 'Liste les comptes bancaires de la société, TOUTES devises (MUR, EUR, USD…), avec banque, devise, solde actuel DANS la devise du compte, IBAN et compte comptable (512xxx). Utiliser pour « quels sont mes comptes bancaires », « solde du compte en euros », « le compte EUR ». Le compte EUR/USD a son solde dans sa propre devise (≠ MUR).',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'lancer_rapprochement_auto',
    description: 'Lance le moteur de rapprochement bancaire automatique (mode analyse, ne valide rien). Retourne le nombre de transactions traitables, les matchs factures proposés et les classifications PCM suggérées. Utile pour "rapproche automatiquement" ou "que peux-tu rapprocher ?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_debut: { type: 'string', description: 'YYYY-MM-DD (optionnel)' },
        date_fin: { type: 'string', description: 'YYYY-MM-DD (optionnel)' },
      },
    },
  },
  {
    name: 'analyser_cloture',
    description: 'Diagnostique ce qui manque pour clôturer le bilan : transactions bancaires non rapprochées, comptes tiers (401/411) non lettrés, solde du compte de transit 580 non nul, mois sans relevé bancaire, équilibre de la balance. Utile pour "qu\'est-ce qui manque pour clôturer ?" ou "le bilan est-il prêt ?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_debut: { type: 'string', description: 'YYYY-MM-DD (optionnel, défaut: exercice courant)' },
        date_fin: { type: 'string', description: 'YYYY-MM-DD (optionnel)' },
      },
    },
  },

  // ── ÉCRITURE (confirmation requise) ─────────────────────────────────
  {
    name: 'creer_ecriture',
    description: 'Crée une écriture comptable équilibrée (débit = crédit). Ex: affecter une avance/compte courant à une facture. Lignes [{compte, debit, credit, libelle?}]. Si un compte n\'existe pas encore (ex: 455 compte courant associé "Stéphane Bach"), AJOUTE-LE dans nouveaux_comptes — il sera créé automatiquement avant l\'écriture, pas besoin de revenir. Ne bloque jamais sur un compte manquant : crée-le.',
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
        nouveaux_comptes: {
          type: 'array',
          description: 'Comptes à créer à la volée avant l\'écriture (s\'ils n\'existent pas). Chaque compte: {numero, intitule, classe?, type?}. Ex: {numero:"455.STEPHANE", intitule:"CCA Stéphane Bach", classe:4, type:"mixte"}.',
          items: {
            type: 'object',
            properties: {
              numero: { type: 'string' }, intitule: { type: 'string' },
              classe: { type: 'number' }, type: { type: 'string' },
            },
            required: ['numero', 'intitule'],
          },
        },
      },
      required: ['date_ecriture', 'libelle', 'lignes'],
    },
  },
  {
    name: 'enregistrer_paiement_facture',
    description: 'Enregistre le PAIEMENT d\'une facture (client ou fournisseur) et met automatiquement à jour son statut à "payé" (ou "partiel" si paiement incomplet) sur l\'interface factures. À UTILISER dès que l\'utilisateur veut payer / régler / encaisser / marquer payée une facture — N\'UTILISE PAS creer_ecriture pour ça. Cet outil crée la ligne de paiement, génère l\'écriture comptable banque (512 ↔ 401/411) liée à la facture (visible au grand livre) ET synchronise le statut de la facture. Récupère d\'abord facture_id via list_factures.',
    input_schema: {
      type: 'object' as const,
      properties: {
        facture_id: { type: 'string', description: 'UUID de la facture (obtenu via list_factures)' },
        montant: { type: 'number', description: 'Montant payé dans la devise d\'origine de la facture. OMETTRE pour solder entièrement le restant dû.' },
        date_paiement: { type: 'string', description: 'YYYY-MM-DD. Défaut: aujourd\'hui.' },
        mode_paiement: { type: 'string', enum: ['virement', 'cheque', 'espece', 'carte', 'prelevement', 'autre'], description: 'Défaut: virement.' },
        compte_banque: { type: 'string', description: 'Compte trésorerie (ex: 512100). Défaut: 512.' },
        reference: { type: 'string', description: 'Référence du paiement (n° virement, chèque…).' },
      },
      required: ['facture_id'],
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

  // ── RH / PAIE / MRA (Expert Lexora — fusion Cerveau) ────────────────
  {
    name: 'list_bulletins',
    description: 'Liste les bulletins de paie de la société. Filtres : periode (YYYY-MM), employe_nom (recherche), statut. Utile pour "regarde le bulletin de Jean en mai", "quels bulletins j\'ai pour décembre ?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        periode: { type: 'string', description: 'YYYY-MM' },
        employe_nom: { type: 'string' },
        statut: { type: 'string', enum: ['brouillon', 'valide', 'paye', 'declare_mra'] },
      },
    },
  },
  {
    name: 'list_employes_rh',
    description: 'Liste les employés actifs de la société (nom, prénom, poste, salaire de base, date d\'embauche, statut). Pour "donne-moi l\'équipe", "qui est dans la société ?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string' },
        actif_only: { type: 'boolean', description: 'défaut true' },
      },
    },
  },
  {
    name: 'get_leave_balance_rh',
    description: 'Soldes de congés d\'un employé (Annual Leave, Sick, Vacation Leave WRA s.47, Maternity, Paternity). Fournir employe_nom ou employe_id. Pour "combien de congés pour Mélanie ?".',
    input_schema: {
      type: 'object' as const,
      properties: { employe_nom: { type: 'string' }, employe_id: { type: 'string' } },
    },
  },
  {
    name: 'get_mra_compliance',
    description: 'État de conformité MRA (PAYE/CSG/NSF/TDS/TVA) : déclarations en cours, échéances, montants dus, retards. Pour "où en est ma conformité MRA ?", "qu\'est-ce que je dois à la MRA ?".',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'calc_paye_net',
    description: 'Calcule le PAYE et le net à payer pour un salaire brut mensuel donné, selon les bandes Maurice : 0-32500 MUR exo, 32500-75000 10%, 75000+ 15%. Inclut CSG salarié (1.5%/3% selon seuil 50k) et NSF salarié 1%. Pour "calcule le net pour 50000 brut".',
    input_schema: {
      type: 'object' as const,
      properties: {
        salaire_brut_mensuel: { type: 'number' },
      },
      required: ['salaire_brut_mensuel'],
    },
  },

  // ── Cross-canal (Expert ↔ Telegram) — mig 458 ────────────────────────
  {
    name: 'notify_telegram',
    description: 'Envoie un message Telegram à l\'utilisateur (et aux dirigeants direction/admin de la société). Pour "envoie-moi le résumé sur Telegram", "préviens-moi sur Telegram quand X". Fournir message (texte clair, peut contenir <b>HTML</b> léger).',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Texte du message Telegram' },
        roles: {
          type: 'array', items: { type: 'string' },
          description: 'Rôles destinataires (défaut: l\'utilisateur courant). Ex: ["direction","admin"]',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'web_handoff_link',
    description: 'Crée un lien magique (24h, à usage unique) qui ouvre l\'agent web Lexora avec un message pré-chargé. Pour finir une action sur le web depuis Telegram (ex: validation visuelle, signature, upload de pièce). Fournir message à pré-charger + canal cible (web par défaut).',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'Message à pré-charger dans l\'agent cible' },
        target_canal: { type: 'string', enum: ['web', 'telegram'], description: 'Défaut: web (handoff Telegram→web)' },
        context: { type: 'object', description: 'Meta libre (ex: facture_id, action proposée)' },
      },
      required: ['message'],
    },
  },

  // ── Google Workspace (compte OAuth lié via /client/settings/google-accounts) ──
  {
    name: 'list_evenements_calendar',
    description: 'Liste les prochains événements du Google Calendar lié à l\'utilisateur (RDV, échéances, réunions). Pour "qu\'ai-je au programme ?", "mes RDV cette semaine", "prochaine réunion". Si l\'utilisateur a plusieurs comptes Google et ne précise pas lequel, l\'outil retourne la liste des comptes disponibles pour que l\'agent demande lequel utiliser.',
    input_schema: {
      type: 'object' as const,
      properties: {
        jours: { type: 'number', description: 'Fenêtre en jours à partir d\'aujourd\'hui (défaut 7, max 90)' },
        max: { type: 'number', description: 'Nombre max d\'événements (défaut 10, max 25)' },
        compte: { type: 'string', description: 'Adresse email du compte Google à utiliser (optionnel si un seul compte)' },
      },
    },
  },
  {
    name: 'envoyer_email',
    description: 'Envoie un email professionnel depuis le compte Gmail lié de l\'utilisateur (relance client, transmission de document, réponse). Pour "envoie un email à X", "relance ce client par email". L\'agent rédige un corps HTML soigné. ACTION EXTERNE IRRÉVERSIBLE → toujours confirmée par l\'utilisateur avant envoi. Si plusieurs comptes Google liés et expéditeur non précisé, demander lequel utiliser.',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Destinataire(s) email' },
        subject: { type: 'string', description: 'Objet de l\'email' },
        html: { type: 'string', description: 'Corps de l\'email en HTML léger (paragraphes <p>, gras <b>). Soigné, professionnel, signé.' },
        cc: { type: 'array', items: { type: 'string' }, description: 'Copie(s) (optionnel)' },
        from_email: { type: 'string', description: 'Adresse email expéditrice — obligatoire si plusieurs comptes Google liés' },
      },
      required: ['to', 'subject', 'html'],
    },
  },
  {
    name: 'creer_evenement_calendar',
    description: 'Crée un événement dans le Google Calendar lié (RDV client, rappel d\'échéance MRA, réunion). Pour "planifie un RDV le 12 à 14h", "ajoute un rappel TVA le 20". ACTION EXTERNE → confirmée avant création. Dates au format ISO 8601 (ex: 2026-07-12T14:00:00). Si plusieurs comptes Google liés et compte non précisé, demander lequel utiliser.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titre: { type: 'string', description: 'Titre de l\'événement' },
        debut: { type: 'string', description: 'Début ISO 8601 (ex: 2026-07-12T14:00:00)' },
        fin: { type: 'string', description: 'Fin ISO 8601 (optionnel : défaut +1h)' },
        description: { type: 'string', description: 'Description / notes (optionnel)' },
        invites: { type: 'array', items: { type: 'string' }, description: 'Emails des invités (optionnel)' },
        avec_meet: { type: 'boolean', description: 'Ajouter un lien Google Meet (optionnel)' },
        compte: { type: 'string', description: 'Adresse email du compte Google Calendar à utiliser (optionnel si un seul compte)' },
      },
      required: ['titre', 'debut'],
    },
  },
  {
    name: 'recall_other_channel',
    description: 'Récupère les derniers échanges de l\'utilisateur sur L\'AUTRE canal (si tu es l\'Expert web → récupère les tours Telegram récents, et inversement). Pour "qu\'est-ce qu\'on s\'était dit sur Telegram ?", "rappelle-toi notre conversation web". Défaut: 15 derniers tours.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Nombre de tours à charger (défaut 15, max 30)' },
        hours_back: { type: 'number', description: 'Fenêtre en heures (défaut 72)' },
      },
    },
  },
]

interface ExecCtx {
  supabase: SupabaseClient
  societeId: string
  userId: string
  origin?: string   // base URL pour les appels server-to-server (rapprochement auto)
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
      // Vue EXHAUSTIVE des comptes disponibles, fusion de 3 sources pour que
      // l'agent voie un maximum de comptes (le PCM éditable peut être vide) :
      //   1. comptes_societes (PCM éditable, prioritaire — intitulé custom)
      //   2. plan_comptable_pcm (référentiel global mauricien)
      //   3. ecritures_comptables_v2 (comptes réellement utilisés)
      const merged = new Map<string, { numero: string; intitule: string; classe: number; source: string }>()

      const { data: cs } = await supabase.from('comptes_societes')
        .select('numero, intitule, classe').eq('societe_id', societeId).eq('archive', false)
      for (const c of cs || []) merged.set(c.numero, { numero: c.numero, intitule: c.intitule, classe: c.classe, source: 'societe' })

      const { data: ref } = await supabase.from('plan_comptable_pcm')
        .select('compte, libelle, classe').eq('actif', true).limit(500)
      for (const p of ref || []) if (!merged.has(p.compte)) merged.set(p.compte, { numero: p.compte, intitule: p.libelle || `Compte ${p.compte}`, classe: p.classe ?? Number(String(p.compte)[0]), source: 'referentiel' })

      // Comptes utilisés en écritures mais absents des deux sources ci-dessus
      let from = 0
      const seenEcr = new Set<string>()
      while (from < 3000) {
        const { data: ecr } = await supabase.from('ecritures_comptables_v2')
          .select('numero_compte, nom_compte').eq('societe_id', societeId).range(from, from + 999)
        if (!ecr || ecr.length === 0) break
        for (const e of ecr) {
          if (!e.numero_compte || seenEcr.has(e.numero_compte)) continue
          seenEcr.add(e.numero_compte)
          if (!merged.has(e.numero_compte)) merged.set(e.numero_compte, { numero: e.numero_compte, intitule: e.nom_compte || `Compte ${e.numero_compte}`, classe: Number(String(e.numero_compte)[0]) || 0, source: 'grand_livre' })
        }
        if (ecr.length < 1000) break
        from += 1000
      }

      let list = [...merged.values()]
      if (input.classe) list = list.filter(c => c.classe === Number(input.classe))
      if (input.search) {
        const s = String(input.search).toLowerCase()
        list = list.filter(c => c.numero.toLowerCase().includes(s) || (c.intitule || '').toLowerCase().includes(s))
      }
      list.sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))
      return { comptes: list.slice(0, 200), total: list.length }
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
    case 'list_comptes_bancaires': {
      const { data, error } = await supabase.from('comptes_bancaires')
        .select('banque, nom_compte, devise, solde_actuel, iban, compte_comptable, actif, compte_principal')
        .eq('societe_id', societeId)
        .order('compte_principal', { ascending: false })
      if (error) return { error: error.message }
      const comptes = (data || []).map((c: any) => ({
        banque: c.banque,
        libelle: c.nom_compte,
        devise: c.devise || 'MUR',
        solde: Number(c.solde_actuel || 0),
        iban: c.iban || null,
        compte_comptable: c.compte_comptable,
        principal: !!c.compte_principal,
        actif: c.actif !== false,
      }))
      // Total uniquement en MUR (on ne somme pas des devises différentes).
      const total_mur = comptes
        .filter(c => c.devise === 'MUR')
        .reduce((s, c) => s + c.solde, 0)
      return { comptes, total: comptes.length, total_mur: Math.round(total_mur * 100) / 100 }
    }
    case 'lancer_rapprochement_auto': {
      const secret = process.env.LEXORA_AGENT_SECRET
      if (!ctx.origin || !secret) {
        return { error: 'Rapprochement auto indisponible (config server-to-server manquante)' }
      }
      try {
        const res = await fetch(`${ctx.origin}/api/agent/rapprochement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
          body: JSON.stringify({
            societe_id: societeId, dry_run: true,
            date_debut: input.date_debut || null, date_fin: input.date_fin || null,
          }),
        })
        const d = await res.json()
        if (!res.ok) return { error: d?.error || `HTTP ${res.status}` }
        return {
          transactions_a_traiter: d?.inputs?.transactions_a_traiter ?? null,
          factures_impayees: d?.inputs?.factures_impayees ?? null,
          stats: d?.stats ?? null,
          matchs_proposes: (d?.semantic?.matches || []).length + (d?.stats?.matched ?? 0),
          classifications_pcm: d?.semantic?.classifications || [],
          note: 'Mode analyse — aucune écriture validée. Pour appliquer, l\'utilisateur valide depuis la page Rapprochement.',
        }
      } catch (e: any) {
        return { error: e?.message || 'Erreur rapprochement auto' }
      }
    }

    case 'analyser_cloture': {
      const findings: { bloquant: string[]; avertissements: string[]; ok: string[] } = { bloquant: [], avertissements: [], ok: [] }

      // 1. Transactions bancaires non rapprochées
      const { data: releves } = await supabase.from('releves_bancaires')
        .select('periode, transactions_json').eq('societe_id', societeId).is('superseded_by_id', null)
      let nonRapprochees = 0, totalTx = 0
      const moisAvecReleve = new Set<string>()
      for (const r of releves || []) {
        if (r.periode) moisAvecReleve.add(String(r.periode).slice(0, 7))
        for (const tx of r.transactions_json || []) {
          totalTx++
          if ((tx.statut || 'non_identifie') !== 'rapproche') nonRapprochees++
        }
      }
      if (nonRapprochees > 0) findings.bloquant.push(`${nonRapprochees} transaction(s) bancaire(s) non rapprochée(s) sur ${totalTx}`)
      else if (totalTx > 0) findings.ok.push(`Toutes les transactions bancaires (${totalTx}) sont rapprochées`)

      // 2. Comptes tiers 401/411 non lettrés (solde non nul + écritures sans lettre)
      const agg = new Map<string, { debit: number; credit: number; nonLettre: number }>()
      let from = 0
      while (true) {
        let q = supabase.from('ecritures_comptables_v2')
          .select('numero_compte, debit_mur, credit_mur, lettre').eq('societe_id', societeId).range(from, from + 999)
        if (input.date_debut) q = q.gte('date_ecriture', input.date_debut)
        if (input.date_fin) q = q.lte('date_ecriture', input.date_fin)
        const { data } = await q
        if (!data || data.length === 0) break
        for (const e of data) {
          const num = String(e.numero_compte || '')
          const k = num.startsWith('401') ? '401' : num.startsWith('411') ? '411' : num.startsWith('580') ? '580' : null
          if (!k) continue
          if (!agg.has(k)) agg.set(k, { debit: 0, credit: 0, nonLettre: 0 })
          const a = agg.get(k)!
          a.debit += +e.debit_mur || 0; a.credit += +e.credit_mur || 0
          if (!e.lettre) a.nonLettre++
        }
        if (data.length < 1000) break
        from += 1000
      }
      for (const tiers of ['401', '411']) {
        const a = agg.get(tiers)
        if (a && a.nonLettre > 0) findings.avertissements.push(`${a.nonLettre} écriture(s) ${tiers} (${tiers === '401' ? 'fournisseurs' : 'clients'}) non lettrée(s) — solde ${(a.debit - a.credit).toFixed(2)} MUR`)
      }
      // 3. Compte 580 transit doit être soldé
      const t580 = agg.get('580')
      if (t580) {
        const solde580 = Math.round((t580.debit - t580.credit) * 100) / 100
        if (Math.abs(solde580) > 0.01) findings.bloquant.push(`Compte 580 (virements en transit) non soldé : ${solde580} MUR — doit être à 0 pour clôturer`)
        else findings.ok.push('Compte 580 transit soldé à 0')
      }

      // 4. Mois sans relevé bancaire (sur les 12 derniers mois)
      const moisManquants: string[] = []
      const now = new Date()
      for (let i = 1; i <= 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!moisAvecReleve.has(ym)) moisManquants.push(ym)
      }
      if (moisManquants.length > 0) findings.avertissements.push(`Relevé bancaire manquant pour : ${moisManquants.join(', ')}`)

      const pret = findings.bloquant.length === 0
      return {
        pret_a_cloturer: pret,
        resume: pret
          ? 'Aucun blocage majeur détecté pour la clôture.'
          : `${findings.bloquant.length} blocage(s) à résoudre avant clôture.`,
        bloquant: findings.bloquant,
        avertissements: findings.avertissements,
        ok: findings.ok,
      }
    }

    // ── RH / PAIE / MRA — Expert Lexora ─────────────────────────────────
    case 'list_bulletins': {
      let q = supabase.from('bulletins_paie')
        .select('id, employe_id, periode, salaire_base, salaire_brut, salaire_net, eoy_bonus, csg_salarie, csg_patronal, nsf_salarie, nsf_patronal, paye, training_levy, prgf, statut, comptabilise, is_archived, source')
        .eq('societe_id', societeId)
        .or('is_archived.is.null,is_archived.eq.false')
        .order('periode', { ascending: false })
        .limit(50)
      if (input?.periode && /^\d{4}-\d{2}$/.test(String(input.periode))) {
        const start = `${input.periode}-01`
        const [y, m] = String(input.periode).split('-').map(Number)
        const end = `${input.periode}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
        q = q.gte('periode', start).lte('periode', end)
      }
      if (input?.statut) q = q.eq('statut', String(input.statut))
      const { data: buls, error } = await q
      if (error) return { error: error.message }
      // Si filtre par nom, on filtre côté JS après lookup employés.
      let result = buls || []
      if (input?.employe_nom) {
        const ids = result.map((b: any) => b.employe_id).filter(Boolean)
        const { data: emps } = await supabase
          .from('employes').select('id, nom, prenom').in('id', ids)
        const byId = new Map((emps || []).map((e: any) => [e.id, e]))
        const needle = String(input.employe_nom).toLowerCase()
        result = result.filter((b: any) => {
          const e = byId.get(b.employe_id) as any
          return e && (`${e.prenom || ''} ${e.nom || ''}`.toLowerCase().includes(needle))
        }).map((b: any) => {
          const e = byId.get(b.employe_id) as any
          return { ...b, employe: e ? `${e.prenom} ${e.nom}` : null }
        })
      }
      return { bulletins: result, total: result.length }
    }

    case 'list_employes_rh': {
      let q = supabase.from('employes')
        .select('id, nom, prenom, code, poste, departement, salaire_base, date_arrivee, date_depart, telephone, email')
        .eq('societe_id', societeId).order('nom').limit(200)
      if (input?.actif_only !== false) {
        q = q.is('date_depart', null)
      }
      const { data: emps, error } = await q
      if (error) return { error: error.message }
      let result = emps || []
      if (input?.search) {
        const s = String(input.search).toLowerCase()
        result = result.filter((e: any) =>
          (`${e.prenom || ''} ${e.nom || ''} ${e.code || ''} ${e.poste || ''}`).toLowerCase().includes(s))
      }
      return { employes: result, total: result.length }
    }

    case 'get_leave_balance_rh': {
      // Résout l'employé (par id direct ou par nom dans la société)
      let employeId = input?.employe_id ? String(input.employe_id) : ''
      let employeLabel = ''
      if (!employeId && input?.employe_nom) {
        const needle = String(input.employe_nom).toLowerCase()
        const { data: emps } = await supabase
          .from('employes').select('id, nom, prenom')
          .eq('societe_id', societeId).is('date_depart', null)
        const match = (emps || []).find((e: any) =>
          (`${e.prenom || ''} ${e.nom || ''}`).toLowerCase().includes(needle))
        if (match) {
          employeId = (match as any).id
          employeLabel = `${(match as any).prenom} ${(match as any).nom}`
        }
      }
      if (!employeId) return { error: 'Employé introuvable (fournir employe_id ou employe_nom)' }
      // Soldes : table soldes_conges (snapshot mensuel)
      const { data: soldes } = await supabase
        .from('soldes_conges')
        .select('type_conge, jours_acquis, jours_pris, jours_solde, periode')
        .eq('employe_id', employeId)
        .order('periode', { ascending: false }).limit(20)
      // Garde le dernier solde par type
      const dernierParType = new Map<string, any>()
      for (const s of (soldes || []) as any[]) {
        if (!dernierParType.has(s.type_conge)) dernierParType.set(s.type_conge, s)
      }
      return {
        employe_id: employeId,
        employe: employeLabel || undefined,
        soldes: Array.from(dernierParType.values()),
      }
    }

    case 'get_mra_compliance': {
      // Lit la matrice de conformité MRA (vw_mra_compliance_status, mig 457)
      const { data, error } = await supabase
        .from('vw_mra_compliance_status')
        .select('type, periode, date_echeance, montant_du, statut, priorite, jours_restants')
        .eq('societe_id', societeId)
        .order('date_echeance', { ascending: false }).limit(60)
      if (error) return { error: error.message, hint: 'Vérifier que la migration 457 (MRA hub) est appliquée.' }
      const list = (data || []) as any[]
      const groups: Record<string, any[]> = { retard: [], urgent: [], bientot: [], futur: [], done: [] }
      let total_du = 0, total_retard = 0
      for (const r of list) {
        const p = r.priorite
        if (p === 'paye' || p === 'sans_objet' || p === 'declare') groups.done.push(r)
        else if (groups[p]) groups[p].push(r)
        if (['retard', 'urgent', 'bientot', 'futur'].includes(p)) total_du += Number(r.montant_du) || 0
        if (p === 'retard') total_retard += Number(r.montant_du) || 0
      }
      const prochaine = list
        .filter(r => ['retard', 'urgent', 'bientot', 'futur'].includes(r.priorite))
        .sort((a, b) => String(a.date_echeance).localeCompare(String(b.date_echeance)))[0] || null
      return {
        groups,
        kpis: {
          total_a_traiter: list.filter(r => ['retard', 'urgent', 'bientot', 'futur'].includes(r.priorite)).length,
          nb_retard: groups.retard.length,
          montant_du: Math.round(total_du * 100) / 100,
          montant_retard: Math.round(total_retard * 100) / 100,
        },
        prochaine_echeance: prochaine,
      }
    }

    case 'calc_paye_net': {
      // Calcul net Maurice à partir d'un brut mensuel.
      // Bandes PAYE (annualisées) :
      //   0–390 000 : 0%   ; 390 001–700 000 : 10% ; 700 001+ : 15%
      // CSG salarié : 1.5% si brut < 50 000 ; 3% si ≥ 50 000.
      // NSF salarié : 1% (capé sur base réglementaire — on garde 1% simple ici).
      const brutM = Math.max(0, Number(input?.salaire_brut_mensuel) || 0)
      const brutAnnuel = brutM * 12
      let payeAnnuel = 0
      if (brutAnnuel > 700_000) {
        payeAnnuel = (brutAnnuel - 700_000) * 0.15 + (700_000 - 390_000) * 0.10
      } else if (brutAnnuel > 390_000) {
        payeAnnuel = (brutAnnuel - 390_000) * 0.10
      }
      const paye = Math.round((payeAnnuel / 12) * 100) / 100
      const csgRate = brutM >= 50_000 ? 0.03 : 0.015
      const csg = Math.round(brutM * csgRate * 100) / 100
      const nsf = Math.round(brutM * 0.01 * 100) / 100
      const net = Math.round((brutM - paye - csg - nsf) * 100) / 100
      return {
        salaire_brut_mensuel: brutM,
        retenues: {
          paye, csg, nsf,
          total_retenues: Math.round((paye + csg + nsf) * 100) / 100,
        },
        salaire_net_mensuel: net,
        explication: `PAYE bandes 0-390k/10%/15% sur base annuelle ; CSG ${csgRate * 100}% (seuil 50k MUR mensuel) ; NSF 1%.`,
      }
    }

    case 'recall_other_channel': {
      // Lit la timeline Telegram (l'autre canal pour l'Expert web) sur la
      // fenêtre récente. vw_agent_history_unified (mig 458) agrège web+telegram.
      const limit = Math.min(30, Math.max(1, Number(input?.limit) || 15))
      const hoursBack = Math.min(720, Math.max(1, Number(input?.hours_back) || 72))
      const sinceIso = new Date(Date.now() - hoursBack * 3600_000).toISOString()
      const { data, error } = await supabase
        .from('vw_agent_history_unified')
        .select('canal, role, content, created_at')
        .eq('societe_id', societeId)
        .eq('user_id', ctx.userId)
        .eq('canal', 'telegram')           // depuis l'Expert web → l'autre = Telegram
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false }).limit(limit)
      if (error) return { error: error.message, hint: 'Vérifier que la migration 458 est appliquée.' }
      return {
        other_canal: 'telegram',
        nb_tours: (data || []).length,
        tours: [...(data || [])].reverse(), // ordre chronologique pour le LLM
      }
    }

    case 'list_evenements_calendar': {
      try {
        const jours = Math.min(90, Math.max(1, Number(input?.jours) || 7))
        const max = Math.min(25, Math.max(1, Number(input?.max) || 10))
        // Priorité Nylas (agenda unifié) ; fallback Google si pas de boîte Nylas.
        const viaNylas = await nylasListEvents(ctx.userId, ctx.societeId, jours, max)
        if (viaNylas) return { ok: true, source: 'nylas', compte: viaNylas.compte, nb: viaNylas.evenements.length, evenements: viaNylas.evenements }

        const compteEmail = String(input?.compte || '').trim() || undefined
        const accounts = await listGoogleAccounts(ctx.userId)
        if (accounts.length === 0) return { ok: false, error: 'Aucun compte Google lié. Connecte-le via /client/settings/google-accounts.' }
        if (accounts.length > 1 && !compteEmail) {
          return { ok: false, choix_compte: true, comptes: accounts.map(a => ({ email: a.account_email, label: a.label || a.account_email, defaut: a.is_default_for_calendar })), message: 'Plusieurs comptes Google liés. Lequel utiliser pour l\'agenda ?' }
        }
        const account = compteEmail ? accounts.find(a => a.account_email === compteEmail) ?? null : accounts[0]
        if (!account) return { ok: false, error: `Compte Google "${compteEmail}" introuvable.` }
        const timeMin = new Date().toISOString()
        const timeMax = new Date(Date.now() + jours * 86_400_000).toISOString()
        const data = await googleCalendarFetch(ctx.userId, account.account_email, '/calendars/primary/events', {
          method: 'GET',
          query: { timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: max },
        })
        const events = (data?.items || []).map((e: any) => ({
          titre: e.summary || '(sans titre)',
          debut: e.start?.dateTime || e.start?.date,
          fin: e.end?.dateTime || e.end?.date,
          lieu: e.location || null,
          meet: extractMeetUrl(e),
        }))
        return { ok: true, compte: account.account_email, nb: events.length, evenements: events }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur list_evenements_calendar' }
      }
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
      // Garde-fou période verrouillée
      {
        const lock = await checkPeriodLock(supabase, societeId, input.date_ecriture)
        if (lock.locked) return { ok: false, error: `Période verrouillée — ${lock.reason}. Écriture refusée.` }
      }
      const numeros = [...new Set(lignes.map((l: any) => l.compte))] as string[]

      // Contrainte DB ecritures_comptables_v2 : numero_compte ~ ^[1-8][0-9]{2,5}$
      // (3 à 6 chiffres, commençant par 1-8, PAS de point ni lettres).
      // Les sous-comptes type "455.OCC" sont refusés par la base. On valide
      // ici pour renvoyer un message clair à l'agent plutôt qu'une erreur SQL.
      const FORMAT = /^[1-8][0-9]{2,5}$/
      const invalides = numeros.filter(n => !FORMAT.test(n))
      if (invalides.length > 0) {
        return {
          ok: false,
          error: `Numéro(s) de compte invalide(s) pour les écritures : ${invalides.join(', ')}. Les comptes doivent être 3 à 6 CHIFFRES (ex: 455, 4551, 512), sans point ni lettres. Pour distinguer un associé, utilise un sous-compte numérique (4551, 4552…) avec son nom dans l'intitulé.`,
        }
      }
      // Comptes à créer à la volée (fournis par l'agent) — best-effort dans
      // comptes_societes, et toujours pris en compte pour le nom de compte.
      const nouveaux: Array<{ numero: string; intitule: string; classe?: number; type?: string }> =
        Array.isArray(input.nouveaux_comptes) ? input.nouveaux_comptes : []
      const nouveauxMap = new Map<string, { intitule: string; classe?: number; type?: string }>()
      for (const nc of nouveaux) {
        if (nc?.numero && nc?.intitule) nouveauxMap.set(String(nc.numero), { intitule: String(nc.intitule), classe: nc.classe, type: nc.type })
      }
      // Créer les nouveaux comptes dans le PCM éditable (best-effort : si la
      // table/migration n'existe pas encore, on continue — le compte sera quand
      // même porté par l'écriture via nom_compte).
      for (const [numero, meta] of nouveauxMap) {
        const classe = meta.classe && meta.classe >= 1 && meta.classe <= 8 ? meta.classe : Number(numero[0])
        if (!Number.isInteger(classe) || classe < 1 || classe > 8) continue
        await supabase.from('comptes_societes').upsert({
          societe_id: societeId, numero,
          numero_parent: numero.includes('.') ? numero.split('.')[0] : null,
          intitule: meta.intitule, intitule_custom: true,
          classe, type: meta.type || (classe === 4 ? 'mixte' : classe === 6 ? 'charge' : classe === 7 ? 'produit' : classe === 5 ? 'tresorerie' : classe <= 2 ? 'actif' : 'mixte'),
          sens_normal: 'mixte', lettrable: classe === 4, obligatoire: false,
          template_source: 'agent', created_by: userId, updated_by: userId,
        }, { onConflict: 'societe_id,numero' }).then(() => {}, () => {})
      }

      // Résolution du libellé de compte avec FALLBACK multi-sources :
      //   0. nouveaux_comptes fournis par l'agent (priorité)
      //   1. comptes_societes (PCM éditable) — refuse si archivé
      //   2. plan_comptable_pcm (référentiel global mauricien)
      //   3. ecritures_comptables_v2 (compte déjà utilisé dans le grand livre)
      const nomCompte = new Map<string, string>()
      const archivedSet = new Set<string>()
      for (const [numero, meta] of nouveauxMap) nomCompte.set(numero, meta.intitule)

      const { data: cs } = await supabase.from('comptes_societes')
        .select('numero, intitule, archive').eq('societe_id', societeId).in('numero', numeros)
      for (const c of cs || []) {
        if (c.archive) archivedSet.add(c.numero)
        else if (!nomCompte.has(c.numero)) nomCompte.set(c.numero, c.intitule)
      }

      const manquants1 = numeros.filter(n => !nomCompte.has(n) && !archivedSet.has(n))
      if (manquants1.length > 0) {
        const { data: pcm } = await supabase.from('plan_comptable_pcm')
          .select('compte, libelle').in('compte', manquants1)
        for (const p of pcm || []) if (!nomCompte.has(p.compte)) nomCompte.set(p.compte, p.libelle || `Compte ${p.compte}`)
      }

      const manquants2 = numeros.filter(n => !nomCompte.has(n) && !archivedSet.has(n))
      if (manquants2.length > 0) {
        const { data: usedEcr } = await supabase.from('ecritures_comptables_v2')
          .select('numero_compte, nom_compte').eq('societe_id', societeId).in('numero_compte', manquants2).limit(manquants2.length * 3)
        for (const e of usedEcr || []) if (!nomCompte.has(e.numero_compte)) nomCompte.set(e.numero_compte, e.nom_compte || `Compte ${e.numero_compte}`)
      }

      for (const num of numeros) {
        if (archivedSet.has(num)) return { ok: false, error: `Compte ${num} archivé` }
        if (!nomCompte.has(num)) return { ok: false, error: `Compte ${num} introuvable — fournis-le dans nouveaux_comptes pour le créer automatiquement` }
      }
      // ref_folio DÉTERMINISTE (idempotence) : même contenu → même ref → on
      // détecte un appel rejoué et on évite le doublon (cf. doublons OD-AGENT
      // observés en prod avant ce garde-fou).
      const contentKey = ecritureContentKey(JSON.stringify({
        d: input.date_ecriture, j: input.journal || 'OD', lib: input.libelle || '',
        l: lignes.map((l: any) => ({ c: l.compte, d: +l.debit || 0, cr: +l.credit || 0 })),
      }))
      const refFolio = `OD-AGENT-${contentKey}`
      const { data: dupExist } = await supabase
        .from('ecritures_comptables_v2')
        .select('id').eq('societe_id', societeId).eq('ref_folio', refFolio).limit(1)
      if (dupExist && dupExist.length > 0) {
        return { ok: true, ref_folio: refFolio, nb_lignes: 0, note: 'Écriture déjà existante (idempotent) — aucun doublon créé.' }
      }
      const exercice = String(new Date(input.date_ecriture).getFullYear())
      const rows = lignes.map((l: any) => ({
        societe_id: societeId, date_ecriture: input.date_ecriture, journal: input.journal || 'OD',
        numero_piece: refFolio, ref_folio: refFolio, numero_compte: l.compte, nom_compte: nomCompte.get(l.compte) || `Compte ${l.compte}`,
        libelle: l.libelle || input.libelle, description: l.libelle || input.libelle,
        debit_mur: +l.debit || 0, credit_mur: +l.credit || 0,
        exercice,
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
    case 'enregistrer_paiement_facture': {
      const factureId = input.facture_id
      if (!factureId) return { ok: false, error: 'facture_id requis' }

      // Charger la facture pour vérifier la société et, si le montant n'est pas
      // fourni, solder entièrement le restant dû (converti en devise d'origine).
      const { data: facture, error: fErr } = await supabase
        .from('factures')
        .select('id, societe_id, numero_facture, devise, taux_change, montant_ttc, montant_mur, solde_non_paye, statut')
        .eq('id', factureId)
        .maybeSingle()
      if (fErr || !facture) return { ok: false, error: 'Facture introuvable' }
      if (facture.societe_id !== societeId) return { ok: false, error: 'Facture hors société' }
      if (facture.statut === 'annule') return { ok: false, error: 'Facture annulée — paiement impossible' }
      if (facture.statut === 'paye') return { ok: false, error: 'Facture déjà soldée' }

      const taux = Number(facture.taux_change) > 0 ? Number(facture.taux_change) : 1
      let montant = Number(input.montant)
      if (!Number.isFinite(montant) || montant <= 0) {
        const resteMur = facture.solde_non_paye !== null && facture.solde_non_paye !== undefined
          ? Number(facture.solde_non_paye)
          : (Number(facture.montant_mur) || Number(facture.montant_ttc) * taux || 0)
        montant = Math.round((resteMur / taux) * 100) / 100
      }
      if (montant <= 0) return { ok: false, error: 'Aucun montant à payer (facture déjà soldée)' }

      const datePaiement = input.date_paiement || new Date().toISOString().slice(0, 10)
      {
        const lock = await checkPeriodLock(supabase, societeId, datePaiement)
        if (lock.locked) return { ok: false, error: `Période verrouillée — ${lock.reason}. Paiement refusé.` }
      }

      const res = await enregistrerPaiement(supabase, {
        facture_id: factureId,
        montant,
        date_paiement: datePaiement,
        mode_paiement: input.mode_paiement || 'virement',
        reference: input.reference || null,
        compte_banque: input.compte_banque || null,
        source: 'manuel',
      }, userId)
      if (!res.ok) return { ok: false, error: res.error }
      return {
        ok: true,
        facture: facture.numero_facture,
        montant,
        paiement_id: res.paiement_id,
        ecriture_id: res.ecriture_id,
        note: 'Statut de la facture mis à jour automatiquement (payé/partiel) et écriture banque créée au grand livre.',
      }
    }
    case 'lettrer_ecritures': {
      const ids = input.ecritures_ids || []
      const { data: ecr } = await supabase.from('ecritures_comptables_v2').select('id, societe_id, debit_mur, credit_mur, lettre, date_ecriture').in('id', ids)
      if (!ecr || ecr.length !== ids.length) return { ok: false, error: 'Écritures introuvables' }
      if (ecr.some(e => e.societe_id !== societeId)) return { ok: false, error: 'Écriture hors société' }
      if (ecr.some(e => e.lettre)) return { ok: false, error: 'Écritures déjà lettrées' }
      // Le groupe à lettrer DOIT être équilibré (sinon faux rapprochement /
      // solde fantôme). Tolérance 1 MUR pour les arrondis.
      const lettD = ecr.reduce((s, e) => s + (Number(e.debit_mur) || 0), 0)
      const lettC = ecr.reduce((s, e) => s + (Number(e.credit_mur) || 0), 0)
      if (Math.abs(lettD - lettC) > 1) {
        return { ok: false, error: `Lettrage refusé : groupe non équilibré (D ${lettD.toFixed(2)} ≠ C ${lettC.toFixed(2)}).` }
      }
      // Garde-fou période verrouillée (sur toute date concernée).
      for (const d of new Set(ecr.map(e => (e as any).date_ecriture).filter(Boolean))) {
        const lock = await checkPeriodLock(supabase, societeId, d as string)
        if (lock.locked) return { ok: false, error: `Période verrouillée — ${lock.reason}. Lettrage refusé.` }
      }
      const code = `LA${String(Date.now()).slice(-5)}`
      const { error } = await supabase.from('ecritures_comptables_v2')
        .update({ lettre: code, date_lettrage: new Date().toISOString().slice(0, 10) })
        .eq('societe_id', societeId)
        .in('id', ids)
      if (error) return { ok: false, error: error.message }
      return { ok: true, code_lettre: code, nb: ids.length }
    }
    case 'reclasser_ecritures': {
      // Garde-fou période verrouillée : on refuse si une écriture du compte
      // source (avec le filtre éventuel) tombe dans une période verrouillée.
      {
        let q = supabase.from('ecritures_comptables_v2')
          .select('date_ecriture')
          .eq('societe_id', societeId)
          .eq('numero_compte', input.from_compte)
        if (input.libelle_contains) q = q.ilike('libelle', `%${input.libelle_contains}%`)
        const { data: affected } = await q
        for (const d of new Set((affected || []).map((e: any) => e.date_ecriture).filter(Boolean))) {
          const lock = await checkPeriodLock(supabase, societeId, d as string)
          if (lock.locked) return { ok: false, error: `Période verrouillée — ${lock.reason}. Reclassement refusé.` }
        }
      }
      const res = await reclassEcritures(supabase as any, {
        societeId, fromCompte: input.from_compte, toCompte: input.to_compte,
        filter: input.libelle_contains ? { libelle_contains: input.libelle_contains } : undefined,
        dryRun: false,
      })
      return { ok: true, ...res }
    }

    // ── Cross-canal — mig 458 ────────────────────────────────────────────
    case 'notify_telegram': {
      // Push Telegram via pushTo. Destinataires = l'utilisateur courant
      // (s'il a un chat_id) + les rôles demandés sur la société.
      try {
        const message = String(input?.message || '').trim()
        if (!message) return { ok: false, error: 'message requis' }
        const { chatIdsForRole, pushTo } = await import('@/lib/telegram/notify')
        const roles = Array.isArray(input?.roles) && input.roles.length > 0
          ? input.roles.map((r: any) => String(r))
          : ['direction', 'client_admin', 'admin', 'super_admin']
        const recipients = await chatIdsForRole(societeId, roles)
        // + chat_id de l'utilisateur courant s'il est lié à Telegram
        const { data: myTg } = await supabase
          .from('telegram_users').select('chat_id')
          .eq('user_id', ctx.userId).eq('verified', true).maybeSingle()
        const chatIds = new Set<number>(recipients.map((r: any) => Number(r.chat_id)))
        if (myTg?.chat_id) chatIds.add(Number(myTg.chat_id))
        if (chatIds.size === 0) {
          return { ok: false, error: 'Aucun destinataire Telegram (l\'utilisateur et la direction ne sont pas reliés au bot).' }
        }
        let sent = 0
        for (const cid of chatIds) {
          const ok = await pushTo(cid, message, societeId, 'expert.notify_telegram')
          if (ok) sent++
        }
        return { ok: true, sent, nb_recipients: chatIds.size }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur notify_telegram' }
      }
    }

    case 'web_handoff_link': {
      // Crée un token 24h single-use qui pré-charge un message dans l'autre canal.
      try {
        const message = String(input?.message || '').trim()
        if (!message) return { ok: false, error: 'message requis' }
        const target = String(input?.target_canal || 'web') as 'web' | 'telegram'
        const source: 'web' | 'telegram' = target === 'web' ? 'telegram' : 'web'
        const tokenBytes = await import('crypto').then(c => c.randomBytes(18))
        const token = tokenBytes.toString('base64url')
        const expires = new Date(Date.now() + 24 * 3600_000).toISOString()
        const { error } = await supabase.from('agent_handoff_tokens').insert({
          token, societe_id: societeId, user_id: ctx.userId,
          source_canal: source, target_canal: target,
          message, context: input?.context || {},
          expires_at: expires, created_by: ctx.userId,
        })
        if (error) return { ok: false, error: error.message, hint: 'Vérifier mig 458 appliquée.' }
        const base = process.env.NEXT_PUBLIC_APP_URL || process.env.LEXORA_BASE_URL || ''
        const url = target === 'web'
          ? `${base}/client/agent-comptable?handoff=${token}`
          : `${base}/api/agent/handoff/${token}` // côté Telegram, le bot lit le token et reprend
        return { ok: true, token, url, target_canal: target, expires_at: expires }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur web_handoff_link' }
      }
    }

    case 'envoyer_email': {
      try {
        const to = (Array.isArray(input?.to) ? input.to : [input?.to]).map((x: any) => String(x || '').trim()).filter(Boolean)
        if (to.length === 0) return { ok: false, error: 'Destinataire (to) requis' }
        const subject = String(input?.subject || '').trim()
        const html = String(input?.html || '').trim()
        if (!subject || !html) return { ok: false, error: 'subject et html requis' }
        const cc0 = Array.isArray(input?.cc) ? input.cc.map((x: any) => String(x || '').trim()).filter(Boolean) : undefined

        // Priorité Nylas ; fallback Gmail si pas de boîte Nylas.
        const viaNylas = await nylasSend(ctx.userId, ctx.societeId, { to, cc: cc0, subject, html })
        if (viaNylas) return { ok: true, source: 'nylas', message_id: viaNylas.message_id, from: viaNylas.from, to, subject }

        let from_email = String(input?.from_email || '').trim()
        if (!from_email) {
          const accounts = await listGoogleAccounts(ctx.userId)
          if (accounts.length === 0) return { ok: false, error: 'Aucun compte Google lié. Connecte-le via /client/settings/google-accounts.' }
          if (accounts.length > 1) {
            return { ok: false, choix_compte: true, comptes: accounts.map(a => ({ email: a.account_email, label: a.label || a.account_email, defaut: a.is_default_for_calendar })), message: 'Plusieurs comptes Gmail liés. Depuis lequel envoyer ?' }
          }
          from_email = accounts[0].account_email
        }
        const res = await sendGmail(ctx.userId, { from_email, to, cc: cc0, subject, html })
        return { ok: true, message_id: res.message_id, from: from_email, to, subject }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur envoyer_email' }
      }
    }

    case 'creer_evenement_calendar': {
      try {
        const titre = String(input?.titre || '').trim()
        const debut = String(input?.debut || '').trim()
        if (!titre || !debut) return { ok: false, error: 'titre et debut (ISO 8601) requis' }
        const debutMs = Date.parse(debut)
        if (Number.isNaN(debutMs)) return { ok: false, error: `Date de début invalide: "${debut}" (attendu ISO 8601)` }
        const fin = String(input?.fin || '').trim() || new Date(debutMs + 3_600_000).toISOString()
        const finMs = Date.parse(fin)
        const invites = Array.isArray(input?.invites) ? input.invites.map((e: any) => String(e || '').trim()).filter(Boolean) : undefined

        // Priorité Nylas ; fallback Google si pas de boîte Nylas.
        const viaNylas = await nylasCreateEvent(ctx.userId, ctx.societeId, {
          titre, debutMs, finMs, description: input?.description ? String(input.description) : undefined,
          invites, avecMeet: !!input?.avec_meet,
        })
        if (viaNylas) return { ok: true, source: 'nylas', event_id: viaNylas.event_id, titre: viaNylas.titre, debut: viaNylas.debut, fin: viaNylas.fin, meet: viaNylas.meet, compte: viaNylas.compte }

        const compteEmail = String(input?.compte || '').trim() || undefined
        const accounts = await listGoogleAccounts(ctx.userId)
        if (accounts.length === 0) return { ok: false, error: 'Aucun compte Google lié. Connecte-le via /client/settings/google-accounts.' }
        if (accounts.length > 1 && !compteEmail) {
          return { ok: false, choix_compte: true, comptes: accounts.map(a => ({ email: a.account_email, label: a.label || a.account_email, defaut: a.is_default_for_calendar })), message: 'Plusieurs comptes Google liés. Dans quel agenda créer l\'événement ?' }
        }
        const account = compteEmail ? accounts.find(a => a.account_email === compteEmail) ?? null : accounts[0]
        if (!account) return { ok: false, error: `Compte Google "${compteEmail}" introuvable.` }

        const body: any = {
          summary: titre,
          description: input?.description ? String(input.description) : undefined,
          start: { dateTime: new Date(debutMs).toISOString() },
          end: { dateTime: new Date(Date.parse(fin)).toISOString() },
        }
        if (Array.isArray(input?.invites) && input.invites.length > 0) {
          body.attendees = input.invites.map((e: any) => ({ email: String(e || '').trim() })).filter((a: any) => a.email)
        }
        if (input?.avec_meet) {
          body.conferenceData = { createRequest: { requestId: `lexora-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
        }
        const created = await googleCalendarFetch(ctx.userId, account.account_email, '/calendars/primary/events', {
          method: 'POST',
          json: body,
          query: input?.avec_meet ? { conferenceDataVersion: 1, sendUpdates: 'all' } : { sendUpdates: 'all' },
        })
        return {
          ok: true, event_id: created?.id, titre, debut: body.start.dateTime, fin: body.end.dateTime,
          lien: created?.htmlLink || null, meet: extractMeetUrl(created),
        }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Erreur creer_evenement_calendar' }
      }
    }

    default:
      return { ok: false, error: `Outil écriture inconnu: ${name}` }
  }
}
