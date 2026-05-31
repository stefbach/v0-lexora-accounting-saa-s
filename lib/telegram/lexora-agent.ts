/**
 * Agent LLM Telegram NATIF Lexora — bypass complet de n8n.
 *
 * Pourquoi : le node "AI Agent" de n8n a accumulé les pannes (model name
 * obsolète, 401, function calling absent, "Bad request - please check your
 * parameters"). À chaque incident l'utilisateur Telegram voyait un silence
 * total après /start. On internalise donc la boucle LLM directement dans
 * Lexora : Claude (Opus 4.8 par défaut) + tool-calling vers les endpoints
 * `/api/client/*` et `/api/comptable/*` via l'auth interne (callLexoraHeaders),
 * exactement comme le pont `/api/telegram/internal/mcp-call`.
 *
 * Architecture :
 *   1. webhook reçoit un message texte (ou vocal transcrit)
 *   2. runLexoraAgent() lance une boucle tool-calling :
 *        - Claude reçoit le message + les outils LECTURE
 *        - exécute les tools en appelant les endpoints Lexora (isolation tenant
 *          propagée via X-Internal-User-Id → assertSocieteAccess + RLS)
 *        - reboucle jusqu'à une réponse finale en langage naturel
 *   3. la réponse est envoyée à l'utilisateur via sendTelegramMessage
 *
 * Périmètre V1 : LECTURE/consultation (KPIs, factures, banque, grand livre,
 * balance, paie, employés, tiers, documents, alertes…). Les ÉCRITURES
 * (création facture, calcul/validation paie) restent gérées par les commandes
 * dédiées (/in, /out, notes de frais, boutons inline congés/paie) qui ont déjà
 * leur propre flux de confirmation.
 */

import Anthropic from '@anthropic-ai/sdk'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'
import { buildSignedHeaders } from '@/lib/security/hmac-auth'

/** Modèle par défaut. Surchargeable via TELEGRAM_AGENT_MODEL. */
const DEFAULT_MODEL = 'claude-opus-4-8'
const MAX_TURNS = 6

/** Filtre les params vides puis encode en query string. */
function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  return sp.toString()
}

/* -------------------------------------------------------------------------- */
/*  Outils LECTURE — mêmes endpoints que le pont mcp-call                      */
/* -------------------------------------------------------------------------- */
type ToolDef = {
  name: string
  description: string
  input_schema: Anthropic.Tool.InputSchema
  /**
   * 'read'           → GET /api/client|comptable|rh/* via auth interne (token)
   * 'internal_get'   → GET /api/telegram/internal/* via HMAC + chat_id (query)
   * 'internal_post'  → POST /api/telegram/internal/* via HMAC + chat_id (body)
   *
   * Les modes internal_* tapent EXACTEMENT les endpoints que n8n appelait :
   * parité fonctionnelle garantie, rôles + isolation tenant déjà gérés côté
   * endpoint (hasRole + withTelegramAuth + RLS).
   */
  kind?: 'read' | 'internal_get' | 'internal_post'
  /** Pour kind='read' : construit le path GET (query string, auth token). */
  endpoint?: (p: Record<string, any>) => string
  /** Pour kind='internal_*' : path de l'endpoint /api/telegram/internal/*. */
  internalPath?: string
  /** true = action sensible (écriture / envoi externe). Confirmation requise. */
  isAction?: boolean
}

const TOOLS: ToolDef[] = [
  {
    name: 'list_factures',
    description: 'Liste les factures de la société. Filtres optionnels : type_facture (client/fournisseur), statut (en_attente/paye/retard/partiel), type_document (devis/avoir), search (nom du tiers).',
    input_schema: {
      type: 'object',
      properties: {
        type_facture: { type: 'string', enum: ['client', 'fournisseur'] },
        statut: { type: 'string' },
        type_document: { type: 'string', enum: ['devis', 'avoir'] },
        search: { type: 'string' },
      },
    },
    endpoint: (p) => `/api/client/factures?${qs(p)}`,
  },
  {
    name: 'get_financial_summary',
    description: 'Synthèse financière de la société : chiffre d\'affaires, trésorerie, créances, dettes, résultat. Pour "kpis du mois", "trésorerie", "où on en est".',
    input_schema: { type: 'object', properties: { periode: { type: 'string', description: 'YYYY-MM (optionnel)' } } },
    endpoint: (p) => `/api/client/financial?${qs(p)}`,
  },
  {
    name: 'list_alertes',
    description: 'Alertes en cours : échéances MRA, factures en retard, anomalies. Pour "alertes", "qu\'est-ce qui urge".',
    input_schema: { type: 'object', properties: {} },
    endpoint: (p) => `/api/client/alertes?${qs(p)}`,
  },
  {
    name: 'list_comptes_bancaires',
    description: 'Liste des comptes bancaires de la société avec leurs soldes.',
    input_schema: { type: 'object', properties: {} },
    endpoint: (p) => `/api/client/comptes-bancaires?${qs(p)}`,
  },
  {
    name: 'list_releves_bancaires',
    description: 'Relevés bancaires (mouvements). Filtres : periode (YYYY-MM), compte_id.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' }, compte_id: { type: 'string' } },
    },
    endpoint: (p) => `/api/client/releves-bancaires?${qs(p)}`,
  },
  {
    name: 'list_ecritures',
    description: 'Écritures comptables (grand livre côté client). Filtres : compte, periode.',
    input_schema: {
      type: 'object',
      properties: { compte: { type: 'string' }, periode: { type: 'string' } },
    },
    endpoint: (p) => `/api/client/ecritures?${qs(p)}`,
  },
  {
    name: 'get_grand_livre',
    description: 'Grand livre comptable détaillé (débit/crédit par compte). Filtres : compte, date_debut, date_fin.',
    input_schema: {
      type: 'object',
      properties: { compte: { type: 'string' }, date_debut: { type: 'string' }, date_fin: { type: 'string' } },
    },
    endpoint: (p) => `/api/comptable/grand-livre?${qs(p)}`,
  },
  {
    name: 'get_rapprochement_status',
    description: 'État du rapprochement bancaire : transactions rapprochées / non identifiées. Pour "où en est le rapprochement".',
    input_schema: { type: 'object', properties: {} },
    endpoint: (p) => `/api/comptable/rapprochement/kpis?${qs(p)}`,
  },
  {
    name: 'get_plan_comptable',
    description: 'Plan comptable (PCM) de la société : numéros et intitulés de comptes. Filtre : search.',
    input_schema: { type: 'object', properties: { search: { type: 'string' } } },
    endpoint: (p) => `/api/client/plan-comptable?${qs(p)}`,
  },
  {
    name: 'list_tiers',
    description: 'Annuaire des tiers (clients/fournisseurs/contacts). Filtre : search.',
    input_schema: { type: 'object', properties: { search: { type: 'string' } } },
    endpoint: (p) => `/api/client/factures-contacts?${qs(p)}`,
  },
  {
    name: 'list_documents',
    description: 'Documents de la société (factures scannées, relevés, contrats). Filtre : type, search.',
    input_schema: { type: 'object', properties: { type: { type: 'string' }, search: { type: 'string' } } },
    endpoint: (p) => `/api/client/documents?${qs(p)}`,
  },
  {
    name: 'list_employes',
    description: 'Liste des employés de la société (RH).',
    input_schema: { type: 'object', properties: { search: { type: 'string' } } },
    endpoint: (p) => `/api/rh/employes?${qs(p)}`,
  },
  {
    name: 'list_bulletins_paie',
    description: 'Bulletins de paie. Filtres : periode (YYYY-MM), employe_id.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' }, employe_id: { type: 'string' } },
    },
    endpoint: (p) => `/api/rh/paie?${qs(p)}`,
  },
  {
    name: 'list_lettrage_non_lettrees',
    description: 'Écritures non lettrées (comptes tiers 401/411). Pour "qu\'est-ce qui n\'est pas lettré".',
    input_schema: { type: 'object', properties: {} },
    endpoint: (p) => `/api/comptable/lettrage?${qs(p)}`,
  },

  // ── KPIs / RAPPORTS / RECHERCHE (via endpoints internes HMAC) ────────
  {
    name: 'get_kpis',
    description: 'KPIs financiers du mois : CA, dépenses, résultat, trésorerie. period = YYYY-MM (optionnel).',
    input_schema: { type: 'object', properties: { period: { type: 'string', description: 'YYYY-MM' } } },
    kind: 'internal_get', internalPath: '/api/telegram/internal/kpis',
  },
  {
    name: 'get_report',
    description: 'Rapport financier ou opérationnel condensé (mensuel, trésorerie, créances…). Précise le type de rapport et la période voulus.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Type de rapport (ex: mensuel, tresorerie, creances)' },
        periode: { type: 'string', description: 'YYYY-MM (optionnel)' },
      },
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/report-get',
  },
  {
    name: 'search_db',
    description: 'Recherche universelle multi-tables (factures, documents, écritures, tiers, employés) quand la demande est floue. query = texte libre.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    kind: 'internal_post', internalPath: '/api/telegram/internal/db-search',
  },
  {
    name: 'get_tax_calendar',
    description: 'Échéances fiscales MRA à venir (PAYE, NSF, CSG, TVA, TDS). days_ahead (défaut 30, max 90).',
    input_schema: { type: 'object', properties: { days_ahead: { type: 'number' } } },
    kind: 'internal_get', internalPath: '/api/telegram/internal/tax-calendar',
  },
  {
    name: 'list_societes',
    description: 'Liste les sociétés accessibles à l\'utilisateur (avec indicateur de la société active).',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/societes-list',
  },
  {
    name: 'switch_societe',
    description: 'Change la société active du chat. Fournir societe_nom (recherche partielle) OU societe_id.',
    input_schema: {
      type: 'object',
      properties: { societe_nom: { type: 'string' }, societe_id: { type: 'string' } },
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/societes-list', isAction: true,
  },

  // ── FACTURATION (lecture + actions) ─────────────────────────────────
  {
    name: 'search_factures',
    description: 'Recherche filtrée de factures. type (client/fournisseur), statut, recherche tiers, periode.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['client', 'fournisseur'] },
        statut: { type: 'string' },
        tiers: { type: 'string' },
        periode: { type: 'string' },
      },
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/factures-search',
  },
  {
    name: 'get_facture_detail',
    description: 'Détail complet d\'une facture (lignes, paiements, statut). Fournir numero OU facture_id.',
    input_schema: {
      type: 'object',
      properties: { numero: { type: 'string' }, facture_id: { type: 'string' } },
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/facture-detail',
  },
  {
    name: 'create_invoice',
    description: 'Crée une facture client. UNIQUEMENT si l\'utilisateur demande clairement et que tu as : client, montant, devise, libellé/description. Demande les infos manquantes avant d\'appeler.',
    input_schema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Nom du client' },
        montant: { type: 'number', description: 'Montant HT ou TTC selon contexte' },
        devise: { type: 'string', description: 'MUR/EUR/USD… (défaut MUR)' },
        description: { type: 'string' },
        date_echeance: { type: 'string', description: 'YYYY-MM-DD (optionnel)' },
      },
      required: ['client', 'montant'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/invoice-create', isAction: true,
  },
  {
    name: 'send_invoice',
    description: 'Envoie une facture existante au client (email/PDF). Fournir numero ou facture_id.',
    input_schema: {
      type: 'object',
      properties: { numero: { type: 'string' }, facture_id: { type: 'string' } },
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/send-invoice', isAction: true,
  },
  {
    name: 'list_recurring_invoices',
    description: 'Liste les modèles de factures récurrentes et leur prochaine date d\'émission.',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/recurring-invoice-list',
  },
  {
    name: 'toggle_recurring_invoice',
    description: 'Active ou désactive un modèle de facture récurrente. Fournir modele_id + actif (true/false).',
    input_schema: {
      type: 'object',
      properties: { modele_id: { type: 'string' }, actif: { type: 'boolean' } },
      required: ['modele_id', 'actif'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/recurring-invoice-toggle', isAction: true,
  },

  // ── BANQUE ──────────────────────────────────────────────────────────
  {
    name: 'get_bank',
    description: 'État des comptes bancaires de la société (soldes, dernier relevé).',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/bank',
  },

  // ── RH / PAIE (lecture) ─────────────────────────────────────────────
  {
    name: 'list_employes_rh',
    description: 'Liste des employés de la société (RH).',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/employes-list',
  },
  {
    name: 'get_payslip_latest',
    description: 'Dernier bulletin de paie (montants). Pour l\'employé courant, ou pour un employé donné si RH+ (employe_nom).',
    input_schema: { type: 'object', properties: { employe_nom: { type: 'string' } } },
    kind: 'internal_get', internalPath: '/api/telegram/internal/payslip-latest',
  },
  {
    name: 'get_leave_balance',
    description: 'Soldes de congés (Annual/Sick/Vacation/Maternity/Paternity/Family Medical Leave) de l\'utilisateur.',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/leave-balance',
  },
  {
    name: 'list_leave_pending',
    description: 'Demandes de congé en attente d\'approbation (manager+ voit son équipe/société).',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/leave-pending',
  },
  {
    name: 'get_attendance',
    description: 'Présences du jour : présents, absents non justifiés, en congé. date = YYYY-MM-DD (défaut aujourd\'hui).',
    input_schema: { type: 'object', properties: { date: { type: 'string' } } },
    kind: 'internal_get', internalPath: '/api/telegram/internal/attendance-list',
  },

  // ── RH / PAIE (actions) ─────────────────────────────────────────────
  {
    name: 'request_leave',
    description: 'Crée une demande de congé pour l\'employé courant. Fournir date_debut, date_fin (YYYY-MM-DD), type (annual/sick/…), motif optionnel.',
    input_schema: {
      type: 'object',
      properties: {
        date_debut: { type: 'string' }, date_fin: { type: 'string' },
        type: { type: 'string' }, motif: { type: 'string' },
      },
      required: ['date_debut', 'date_fin'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/leave-create', isAction: true,
  },
  {
    name: 'decide_leave',
    description: 'Approuve ou refuse une demande de congé (manager+). Fournir demande_id + decision (approuve/refuse).',
    input_schema: {
      type: 'object',
      properties: { demande_id: { type: 'string' }, decision: { type: 'string', enum: ['approuve', 'refuse'] } },
      required: ['demande_id', 'decision'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/leave-decide', isAction: true,
  },
  {
    name: 'add_overtime',
    description: 'Ajoute des heures supplémentaires pour un employé (RH+). Fournir employe_nom, heures, taux (1.5/2), periode YYYY-MM.',
    input_schema: {
      type: 'object',
      properties: {
        employe_nom: { type: 'string' }, heures: { type: 'number' },
        taux: { type: 'number' }, periode: { type: 'string' },
      },
      required: ['employe_nom', 'heures'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/ot-add', isAction: true,
  },
  {
    name: 'add_bonus',
    description: 'Ajoute une prime pour un employé (RH+). Fournir employe_nom, montant, periode YYYY-MM, libellé optionnel.',
    input_schema: {
      type: 'object',
      properties: {
        employe_nom: { type: 'string' }, montant: { type: 'number' },
        periode: { type: 'string' }, libelle: { type: 'string' },
      },
      required: ['employe_nom', 'montant'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/bonus-add', isAction: true,
  },
  {
    name: 'compute_payroll',
    description: 'Calcule la masse salariale d\'une période (RH+). periode = YYYY-MM.',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } }, required: ['periode'] },
    kind: 'internal_post', internalPath: '/api/telegram/internal/payroll-compute', isAction: true,
  },
  {
    name: 'approve_payroll',
    description: 'Valide la paie d\'une période (direction). periode = YYYY-MM + confirm=true.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' }, confirm: { type: 'boolean' } },
      required: ['periode', 'confirm'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/payroll-approve', isAction: true,
  },
  {
    name: 'export_mra_payroll',
    description: 'Génère l\'export MRA (PAYE/NSF/CSG) d\'une période en pièce jointe. periode = YYYY-MM, type optionnel (paye/nsf/csg).',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' }, type: { type: 'string' } },
      required: ['periode'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/payroll-mra-export', isAction: true,
  },

  // ── NOTES DE FRAIS (lecture) ────────────────────────────────────────
  {
    name: 'list_expenses',
    description: 'Notes de frais en cours de l\'employé courant (brouillon / en validation).',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/expenses-list',
  },

  // ── CONNECTEURS EXTERNES : EMAIL ────────────────────────────────────
  {
    name: 'list_email_accounts',
    description: 'Liste les comptes email connectés (boîtes d\'envoi disponibles).',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/email-accounts-list',
  },
  {
    name: 'send_email',
    description: 'Envoie un email depuis un compte connecté. UNIQUEMENT quand l\'utilisateur le demande clairement et que tu as destinataire + objet + corps. Demande les infos manquantes avant.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' },
        account_email: { type: 'string', description: 'Compte expéditeur (optionnel)' },
      },
      required: ['to', 'subject', 'body'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/email-send', isAction: true,
  },
  {
    name: 'search_contacts',
    description: 'Recherche un contact (nom, email, téléphone) dans l\'annuaire pour récupérer son email avant un mail ou un RDV.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } }, required: ['query'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/contacts-search',
  },

  // ── CONNECTEURS EXTERNES : AGENDA / RDV ─────────────────────────────
  {
    name: 'list_calendar_accounts',
    description: 'Liste les agendas Google connectés disponibles.',
    input_schema: { type: 'object', properties: {} },
    kind: 'internal_get', internalPath: '/api/telegram/internal/calendar-accounts-list',
  },
  {
    name: 'list_calendar_events',
    description: 'Liste les RDV/événements à venir. days_ahead (1-60, défaut 7).',
    input_schema: {
      type: 'object',
      properties: { days_ahead: { type: 'number' }, account_email: { type: 'string' } },
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/calendar-list-events',
  },
  {
    name: 'find_calendar_slot',
    description: 'Trouve un créneau libre pour caler un RDV. Précise durée (min) et fenêtre (jours).',
    input_schema: {
      type: 'object',
      properties: {
        duration_minutes: { type: 'number' }, days_ahead: { type: 'number' },
        account_email: { type: 'string' },
      },
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/calendar-find-slot',
  },
  {
    name: 'create_calendar_event',
    description: 'Crée un RDV. UNIQUEMENT quand l\'utilisateur confirme le créneau. Fournir summary + start_iso + end_iso (ISO 8601, ex 2026-06-02T14:00:00). Si l\'heure n\'est pas sûre, propose d\'abord via find_calendar_slot.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' }, start_iso: { type: 'string' }, end_iso: { type: 'string' },
        description: { type: 'string' },
        attendee_emails: { type: 'array', items: { type: 'string' } },
        account_email: { type: 'string' },
      },
      required: ['summary', 'start_iso', 'end_iso'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/calendar-create-event', isAction: true,
  },
  {
    name: 'update_calendar_event',
    description: 'Modifie un RDV existant (horaire, titre). Fournir event_id + champs à changer.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' }, summary: { type: 'string' },
        start_iso: { type: 'string' }, end_iso: { type: 'string' }, account_email: { type: 'string' },
      },
      required: ['event_id'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/calendar-update-event', isAction: true,
  },
  {
    name: 'delete_calendar_event',
    description: 'Supprime/annule un RDV. Fournir event_id.',
    input_schema: {
      type: 'object',
      properties: { event_id: { type: 'string' }, account_email: { type: 'string' } },
      required: ['event_id'],
    },
    kind: 'internal_post', internalPath: '/api/telegram/internal/calendar-delete-event', isAction: true,
  },
]

const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]))

/* -------------------------------------------------------------------------- */
/*  Contexte d'exécution                                                       */
/* -------------------------------------------------------------------------- */
export type LexoraAgentContext = {
  chat_id: number
  user_id: string
  societe_id: string
  societe_name: string
  role: string
  role_label: string
  first_name?: string | null
  locale?: string | null
  memory_context?: string | null
}

/** Secret HMAC pour signer les appels aux endpoints /api/telegram/internal/*. */
function hmacSecret(): string {
  return process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_API_TOKEN || ''
}

function systemPrompt(ctx: LexoraAgentContext, today: string): string {
  const lang = ctx.locale === 'en' ? 'en anglais' : 'en français'
  return `Tu es l'assistant Lexora sur Telegram — expert-comptable et RH mauricien senior (IFRS for SMEs, Plan Comptable Mauricien, WRA 2019, MRA PAYE/NSF/CSG, multi-devises).

Utilisateur : ${ctx.first_name || 'client'} (rôle : ${ctx.role_label}).
Société active : ${ctx.societe_name}.
Date du jour : ${today}.

RÔLE :
- Tu réponds ${lang}, de façon claire, concise et directe — c'est du chat Telegram, pas un rapport. Va à l'essentiel.
- Tu peux CONSULTER (factures, banque, grand livre, balance, KPIs, paie, employés, congés, présences, tiers, documents, alertes, échéances MRA) ET AGIR (créer/envoyer une facture, demander/approuver un congé, saisir heures sup & primes, calculer/valider la paie, exporter MRA, envoyer un email, gérer l'agenda/RDV).
- Ne devine JAMAIS un chiffre : récupère-le via les outils. Formate les montants avec séparateur de milliers et la devise (ex: 1 250 000 MUR).
- Pour les listes longues, résume les points clés (totaux, top 5) plutôt que de tout dérouler.
- Tu peux enchaîner plusieurs outils (ex: chercher un contact → trouver un créneau → créer le RDV).

ACTIONS SENSIBLES (création/envoi/validation : facture, email, RDV, paie, congé, prime, heures sup) :
- N'exécute l'action QUE si l'utilisateur l'a demandée clairement et que tu as TOUTES les infos nécessaires.
- S'il manque une info (destinataire, montant, date, créneau…), DEMANDE-la d'abord — n'invente pas.
- Avant une action irréversible ou à impact externe (envoyer un email, créer/supprimer un RDV, valider la paie), reformule brièvement ce que tu vas faire ; si l'utilisateur vient de te le confirmer dans le message, exécute directement.
- Les rôles sont contrôlés côté serveur : si une action t'est refusée (rôle insuffisant), explique-le simplement à l'utilisateur.
- Si une donnée ou un connecteur n'est pas accessible, dis-le franchement plutôt que d'inventer.

Note : le pointage (/in, /out), l'envoi de documents (OCR) et les notes de frais photo se font aussi directement dans Telegram (commandes dédiées).

Utilise le format HTML Telegram léger si utile : <b>gras</b>, <code>code</code>. Pas de Markdown (#, *, tableaux).`
}

/* -------------------------------------------------------------------------- */
/*  Exécution d'un tool                                                        */
/* -------------------------------------------------------------------------- */
async function execTool(
  tool: ToolDef,
  input: Record<string, any>,
  ctx: LexoraAgentContext,
): Promise<unknown> {
  const params = { ...(input || {}) }
  const base = getLexoraBaseUrl()
  const kind = tool.kind || 'read'

  try {
    // ── Mode 'read' : GET /api/client|comptable|rh/* via token interne ──
    if (kind === 'read') {
      if (!params.societe_id) params.societe_id = ctx.societe_id
      const url = `${base}${tool.endpoint!(params)}`
      const res = await fetch(url, {
        method: 'GET',
        headers: callLexoraHeaders(ctx.user_id),
        cache: 'no-store',
      })
      if (!res.ok) {
        const details = await res.text().catch(() => '')
        return { error: `tool_failed_http_${res.status}`, details: details.slice(0, 400) }
      }
      return await res.json()
    }

    // ── Modes 'internal_*' : endpoints /api/telegram/internal/* (HMAC) ──
    const secret = hmacSecret()
    if (!secret) return { error: 'hmac_secret_missing' }

    if (kind === 'internal_get') {
      // chat_id en query ; corps vide → on signe ''.
      const query = qs({ ...params, chat_id: ctx.chat_id })
      const url = `${base}${tool.internalPath}${query ? `?${query}` : ''}`
      const { headers } = buildSignedHeaders('', secret)
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { error: `tool_failed_http_${res.status}`, data }
      return data
    }

    // internal_post : chat_id + params dans le body signé.
    const bodyObj = { ...params, chat_id: ctx.chat_id }
    const bodyText = JSON.stringify(bodyObj)
    const { headers } = buildSignedHeaders(bodyText, secret)
    const res = await fetch(`${base}${tool.internalPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: bodyText,
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: `tool_failed_http_${res.status}`, data }
    return data
  } catch (e) {
    return { error: 'tool_network_error', message: e instanceof Error ? e.message : 'unknown' }
  }
}

/* -------------------------------------------------------------------------- */
/*  Boucle agent                                                               */
/* -------------------------------------------------------------------------- */
export type LexoraAgentResult =
  | { ok: true; text: string; turns: number; tools_used: string[] }
  | { ok: false; error: string }

/**
 * Lance l'agent LLM sur un message utilisateur et retourne la réponse finale.
 * Best-effort : ne throw jamais, retourne { ok:false } en cas de souci pour que
 * le webhook puisse afficher un message d'erreur propre.
 */
export async function runLexoraAgent(
  userText: string,
  ctx: LexoraAgentContext,
): Promise<LexoraAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY manquant' }

  const model = process.env.TELEGRAM_AGENT_MODEL || DEFAULT_MODEL
  const anthropic = new Anthropic({ apiKey })
  const today = new Date().toISOString().slice(0, 10)

  // Injecte le contexte mémoire (rappels société/user) en préambule si présent.
  const firstUserContent = ctx.memory_context
    ? `${ctx.memory_context}\n\n---\nMessage de l'utilisateur :\n${userText}`
    : userText

  const convo: Anthropic.MessageParam[] = [
    { role: 'user', content: firstUserContent },
  ]
  const toolsUsed: string[] = []

  const anthropicTools: Anthropic.Tool[] = TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1500,
        system: systemPrompt(ctx, today),
        tools: anthropicTools,
        messages: convo,
      })

      const toolUses = response.content.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
      )
      const textBlocks = response.content.filter(
        (c): c is Anthropic.TextBlock => c.type === 'text',
      )
      const agentText = textBlocks.map(t => t.text).join('\n').trim()

      if (toolUses.length === 0) {
        return {
          ok: true,
          text: agentText || '(pas de réponse)',
          turns: turn + 1,
          tools_used: toolsUsed,
        }
      }

      // Exécute tous les tools demandés et reboucle.
      convo.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const tool = TOOL_MAP.get(tu.name)
        if (!tool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: `Outil inconnu: ${tu.name}`,
            is_error: true,
          })
          continue
        }
        toolsUsed.push(tu.name)
        const result = await execTool(tool, tu.input as Record<string, any>, ctx)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result).slice(0, 12_000),
        })
      }
      convo.push({ role: 'user', content: toolResults })
    }

    return {
      ok: true,
      text: 'Je n\'ai pas pu finaliser ta demande en quelques étapes. Reformule ou découpe-la.',
      turns: MAX_TURNS,
      tools_used: toolsUsed,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erreur agent LLM' }
  }
}

/** Liste des noms d'outils (pour debug / health-check). */
export const LEXORA_AGENT_TOOL_NAMES = TOOLS.map(t => t.name)
