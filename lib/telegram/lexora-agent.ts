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
/**
 * Modèle de repli si le modèle principal est inaccessible (clé API sans accès
 * Opus, ID inconnu…). Sonnet 4.6 est largement disponible. Surchargeable via
 * TELEGRAM_AGENT_MODEL_FALLBACK.
 */
const FALLBACK_MODEL = 'claude-sonnet-4-6'
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
   * 'read'      → appel REST direct sur /api/client|comptable|rh/* (auth token interne).
   *               Supporte GET/POST/PATCH/DELETE selon `method`.
   * 'download'  → comme 'read' mais la réponse est BINAIRE (PDF/Excel/CSV) :
   *               on bufferize et on renvoie un artifact que le webhook expédie
   *               en pièce jointe Telegram.
   * 'internal_get'   → GET /api/telegram/internal/* via HMAC + chat_id (query)
   * 'internal_post'  → POST /api/telegram/internal/* via HMAC + chat_id (body)
   *
   * Les modes internal_* tapent EXACTEMENT les endpoints que n8n appelait :
   * parité fonctionnelle garantie, rôles + isolation tenant déjà gérés côté
   * endpoint (hasRole + withTelegramAuth + RLS).
   */
  kind?: 'read' | 'download' | 'internal_get' | 'internal_post'
  /** Verbe HTTP pour 'read'/'download' (défaut: GET). */
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Pour kind='read'/'download' : construit le path (query string si GET, sinon ignore). */
  endpoint?: (p: Record<string, any>) => string
  /** Pour kind='internal_*' : path de l'endpoint /api/telegram/internal/*. */
  internalPath?: string
  /** Pour 'download' : nom de fichier + caption + type MIME — résolus à partir
   * de l'input et de la réponse. Si non fournis, on déduit du Content-Type/URL. */
  downloadFilename?: (p: Record<string, any>) => string
  downloadCaption?: (p: Record<string, any>) => string
  downloadContentType?: string
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

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 1 — PILOTAGE COMPLET (téléchargements + édition + workflows)
  // ══════════════════════════════════════════════════════════════════════

  // ── 📥 TÉLÉCHARGEMENTS (PDF / Excel envoyés en pièce jointe) ─────────
  {
    name: 'download_facture_pdf',
    description: 'Télécharge le PDF d\'une facture (envoyée en pièce jointe dans Telegram). Fournir facture_id (UUID).',
    input_schema: {
      type: 'object',
      properties: { facture_id: { type: 'string', description: 'UUID de la facture' } },
      required: ['facture_id'],
    },
    kind: 'download',
    method: 'GET',
    endpoint: (p) => `/api/client/factures/${p.facture_id}/pdf`,
    downloadFilename: (p) => `facture-${String(p.facture_id || 'document').slice(0, 8)}.pdf`,
    downloadContentType: 'application/pdf',
    downloadCaption: () => '🧾 Facture PDF',
  },
  {
    name: 'download_factures_batch_pdf',
    description: 'Génère un ZIP contenant plusieurs factures en PDF. Fournir factures_ids (liste d\'UUIDs).',
    input_schema: {
      type: 'object',
      properties: {
        factures_ids: { type: 'array', items: { type: 'string' }, description: 'Liste d\'UUIDs' },
      },
      required: ['factures_ids'],
    },
    kind: 'download',
    method: 'POST',
    endpoint: () => `/api/client/factures/export-batch`,
    downloadFilename: () => `factures-batch-${new Date().toISOString().slice(0, 10)}.zip`,
    downloadContentType: 'application/zip',
    downloadCaption: () => '📦 Factures (batch ZIP)',
  },
  {
    name: 'download_factures_xlsx',
    description: 'Exporte les factures de la société en Excel. Filtres optionnels : type (client/fournisseur), periode (YYYY-MM), statut.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['client', 'fournisseur'] },
        periode: { type: 'string' }, statut: { type: 'string' },
      },
    },
    kind: 'download',
    method: 'GET',
    endpoint: (p) => `/api/comptable/factures/export-xlsx?${qs(p)}`,
    downloadFilename: () => `factures-${new Date().toISOString().slice(0, 10)}.xlsx`,
    downloadContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    downloadCaption: () => '📊 Factures (Excel)',
  },
  {
    name: 'download_releves_bancaires_xlsx',
    description: 'Exporte les relevés bancaires en Excel. Filtres : periode (YYYY-MM), compte_id.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' }, compte_id: { type: 'string' } },
    },
    kind: 'download',
    method: 'GET',
    endpoint: (p) => `/api/client/releves-bancaires/export-xlsx?${qs(p)}`,
    downloadFilename: (p) => `releves-${p.periode || new Date().toISOString().slice(0, 10)}.xlsx`,
    downloadContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    downloadCaption: () => '🏦 Relevés bancaires (Excel)',
  },
  {
    name: 'download_financial_pdf',
    description: 'Télécharge la synthèse financière (P&L / situation) en PDF. Filtre : periode (YYYY-MM optionnel).',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' } },
    },
    kind: 'download',
    method: 'GET',
    endpoint: (p) => `/api/client/financial/export-pdf?${qs(p)}`,
    downloadFilename: (p) => `synthese-financiere-${p.periode || new Date().toISOString().slice(0, 10)}.pdf`,
    downloadContentType: 'application/pdf',
    downloadCaption: () => '📈 Synthèse financière (PDF)',
  },
  {
    name: 'download_financial_xlsx',
    description: 'Exporte la synthèse financière (P&L) en Excel.',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } } },
    kind: 'download',
    method: 'GET',
    endpoint: (p) => `/api/client/financial/export-xlsx?${qs(p)}`,
    downloadFilename: (p) => `synthese-financiere-${p.periode || new Date().toISOString().slice(0, 10)}.xlsx`,
    downloadContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    downloadCaption: () => '📈 Synthèse financière (Excel)',
  },
  {
    name: 'download_grand_livre_pdf',
    description: 'Télécharge le grand livre comptable en PDF. Filtres : compte, date_debut, date_fin (YYYY-MM-DD).',
    input_schema: {
      type: 'object',
      properties: {
        compte: { type: 'string' }, date_debut: { type: 'string' }, date_fin: { type: 'string' },
      },
    },
    kind: 'download',
    method: 'GET',
    endpoint: (p) => `/api/comptable/grand-livre/export-pdf?${qs(p)}`,
    downloadFilename: () => `grand-livre-${new Date().toISOString().slice(0, 10)}.pdf`,
    downloadContentType: 'application/pdf',
    downloadCaption: () => '📚 Grand livre (PDF)',
  },
  {
    name: 'download_payroll_mra_paye',
    description: 'Génère et envoie l\'export MRA PAYE (CSV/XML) pour une période. Fournir periode YYYY-MM.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' } },
      required: ['periode'],
    },
    kind: 'download',
    method: 'POST',
    endpoint: () => `/api/rh/exports/paye-mra`,
    downloadFilename: (p) => `paye-mra-${p.periode}.csv`,
    downloadContentType: 'text/csv',
    downloadCaption: (p) => `📤 PAYE MRA ${p.periode}`,
    isAction: true,
  },
  {
    name: 'download_payroll_mra_csg',
    description: 'Génère et envoie l\'export MRA CSG pour une période. Fournir periode YYYY-MM.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' } },
      required: ['periode'],
    },
    kind: 'download',
    method: 'POST',
    endpoint: () => `/api/rh/exports/csg-mra`,
    downloadFilename: (p) => `csg-mra-${p.periode}.csv`,
    downloadContentType: 'text/csv',
    downloadCaption: (p) => `📤 CSG MRA ${p.periode}`,
    isAction: true,
  },
  {
    name: 'download_payroll_mra_prgf',
    description: 'Génère et envoie l\'export MRA PRGF pour une période. Fournir periode YYYY-MM.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' } },
      required: ['periode'],
    },
    kind: 'download',
    method: 'POST',
    endpoint: () => `/api/rh/exports/prgf-mra`,
    downloadFilename: (p) => `prgf-mra-${p.periode}.csv`,
    downloadContentType: 'text/csv',
    downloadCaption: (p) => `📤 PRGF MRA ${p.periode}`,
    isAction: true,
  },
  {
    name: 'download_payroll_virement_file',
    description: 'Génère le fichier de virement bancaire de la paie (format banque MUR) pour une période. Fournir periode YYYY-MM.',
    input_schema: {
      type: 'object',
      properties: { periode: { type: 'string' } },
      required: ['periode'],
    },
    kind: 'download',
    method: 'GET',
    endpoint: (p) => `/api/rh/exports/virement?${qs(p)}`,
    downloadFilename: (p) => `virement-paie-${p.periode}.csv`,
    downloadContentType: 'text/csv',
    downloadCaption: (p) => `🏦 Virement paie ${p.periode}`,
  },

  // ── 🧾 FACTURES — édition / suppression / paiements ──────────────────
  {
    name: 'update_facture',
    description: 'Modifie une facture existante. Fournir facture_id + champs à changer (date_facture, date_echeance, libelle, montant_ht, montant_ttc, tva, statut, devise, taux_change…). Avant un changement de montant, demande confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        facture_id: { type: 'string' },
        date_facture: { type: 'string' }, date_echeance: { type: 'string' },
        libelle: { type: 'string' },
        montant_ht: { type: 'number' }, montant_ttc: { type: 'number' }, tva: { type: 'number' },
        statut: { type: 'string' }, devise: { type: 'string' }, taux_change: { type: 'number' },
      },
      required: ['facture_id'],
    },
    kind: 'read', method: 'PATCH', endpoint: () => `/api/client/factures`, isAction: true,
  },
  {
    name: 'delete_facture',
    description: 'Supprime une facture (uniquement si elle n\'est pas comptabilisée). Demande toujours confirmation explicite avant d\'appeler.',
    input_schema: {
      type: 'object',
      properties: { facture_id: { type: 'string' } },
      required: ['facture_id'],
    },
    kind: 'read', method: 'DELETE', endpoint: (p) => `/api/client/factures?id=${p.facture_id}`, isAction: true,
  },
  {
    name: 'list_facture_payments',
    description: 'Liste les paiements enregistrés sur une facture. Fournir facture_id.',
    input_schema: {
      type: 'object',
      properties: { facture_id: { type: 'string' } },
      required: ['facture_id'],
    },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/client/factures/${p.facture_id}/paiements`,
  },
  {
    name: 'add_facture_payment',
    description: 'Enregistre un paiement reçu sur une facture (marque la facture payée/partielle + écriture banque). Fournir facture_id, montant, mode (virement/cheque/cash/cb), date (YYYY-MM-DD), compte_bancaire_id optionnel, reference optionnelle.',
    input_schema: {
      type: 'object',
      properties: {
        facture_id: { type: 'string' },
        montant: { type: 'number' },
        mode: { type: 'string', enum: ['virement', 'cheque', 'cash', 'cb', 'autre'] },
        date: { type: 'string' },
        compte_bancaire_id: { type: 'string' },
        reference: { type: 'string' },
      },
      required: ['facture_id', 'montant', 'mode'],
    },
    kind: 'read', method: 'POST', endpoint: (p) => `/api/client/factures/${p.facture_id}/paiements`, isAction: true,
  },

  // ── 👥 TIERS / CONTACTS — CRUD ───────────────────────────────────────
  {
    name: 'create_tiers',
    description: 'Crée un tiers (client ou fournisseur). Fournir nom, type (client/fournisseur), email optionnel, telephone, adresse, brn (BRN Maurice), tva_number.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string' },
        type: { type: 'string', enum: ['client', 'fournisseur', 'both'] },
        email: { type: 'string' }, telephone: { type: 'string' },
        adresse: { type: 'string' }, brn: { type: 'string' }, tva_number: { type: 'string' },
      },
      required: ['nom'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/client/factures-contacts`, isAction: true,
  },
  {
    name: 'update_tiers',
    description: 'Modifie un tiers existant. Fournir id + champs à changer (nom, email, telephone, adresse, actif, brn, tva_number).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        nom: { type: 'string' }, email: { type: 'string' }, telephone: { type: 'string' },
        adresse: { type: 'string' }, actif: { type: 'boolean' },
        brn: { type: 'string' }, tva_number: { type: 'string' },
      },
      required: ['id'],
    },
    kind: 'read', method: 'PATCH', endpoint: (p) => `/api/client/factures-contacts/${p.id}`, isAction: true,
  },
  {
    name: 'delete_tiers',
    description: 'Supprime un tiers. ATTENTION : préférer "update_tiers actif=false" si le tiers a des factures historiques. Demande confirmation.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    kind: 'read', method: 'DELETE', endpoint: (p) => `/api/client/factures-contacts/${p.id}`, isAction: true,
  },

  // ── 📒 ÉCRITURES COMPTABLES ──────────────────────────────────────────
  {
    name: 'update_ecriture',
    description: 'Modifie une écriture comptable existante (libellé, date, montants débit/crédit). Fournir id + champs.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        libelle: { type: 'string' }, date_ecriture: { type: 'string' },
        debit: { type: 'number' }, credit: { type: 'number' },
      },
      required: ['id'],
    },
    kind: 'read', method: 'PATCH', endpoint: () => `/api/client/ecritures`, isAction: true,
  },
  {
    name: 'delete_ecriture',
    description: 'Supprime une écriture (par id) OU tout un batch (par ref_folio). Demande confirmation. Fournir id OU folio.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' }, folio: { type: 'string' },
      },
    },
    kind: 'read', method: 'DELETE',
    endpoint: (p) => p.folio ? `/api/client/ecritures?folio=${encodeURIComponent(p.folio)}` : `/api/client/ecritures?id=${p.id}`,
    isAction: true,
  },

  // ── 🔁 RECURRENCES (factures auto) ───────────────────────────────────
  {
    name: 'preview_recurrences',
    description: 'Liste les factures récurrentes dues à générer pour la société (preview, ne génère rien).',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/recurrences`,
  },
  {
    name: 'run_recurrences',
    description: 'Génère les factures récurrentes dues. Par défaut dry_run=true (simulation). Pour exécuter pour de vrai, passer dry_run=false explicitement après confirmation utilisateur.',
    input_schema: {
      type: 'object',
      properties: { dry_run: { type: 'boolean', description: 'Défaut true' } },
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/client/recurrences`, isAction: true,
  },

  // ── 📨 RELANCES CLIENTS ──────────────────────────────────────────────
  {
    name: 'preview_relances',
    description: 'Liste les factures à relancer (échues non payées) pour la société.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/relances`,
  },
  {
    name: 'send_relances',
    description: 'Envoie les relances clients. dry_run=true par défaut (simulation). dry_run=false pour vraiment envoyer les emails (demander confirmation avant).',
    input_schema: {
      type: 'object',
      properties: { dry_run: { type: 'boolean' } },
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/client/relances`, isAction: true,
  },
  {
    name: 'list_relances_history',
    description: 'Historique des relances envoyées.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/relances/historique`,
  },

  // ── 💸 VIREMENTS ──────────────────────────────────────────────────────
  {
    name: 'list_virements',
    description: 'Liste les virements préparés / effectués pour la société.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/virements`,
  },
  {
    name: 'create_virement',
    description: 'Prépare un virement (interne ou externe). Fournir beneficiaire_nom, iban OU compte, montant, devise, motif. Demander confirmation avant d\'appeler.',
    input_schema: {
      type: 'object',
      properties: {
        beneficiaire_nom: { type: 'string' },
        iban: { type: 'string' }, compte: { type: 'string' },
        montant: { type: 'number' }, devise: { type: 'string' },
        motif: { type: 'string' },
        date_virement: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['beneficiaire_nom', 'montant'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/client/virements`, isAction: true,
  },

  // ── 📄 DOCUMENTS ──────────────────────────────────────────────────────
  {
    name: 'list_documents_v2',
    description: 'Liste les documents de la société (factures scannées, relevés, contrats, etc.). Filtres : type, search.',
    input_schema: {
      type: 'object',
      properties: { type: { type: 'string' }, search: { type: 'string' } },
    },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/client/documents?${qs(p)}`,
  },

  // ── 👨‍💼 RH — création employé / départ ──────────────────────────────
  {
    name: 'create_employe',
    description: 'Crée un employé. Fournir prenom, nom, email, telephone, date_embauche (YYYY-MM-DD), salaire_base, contrat_type (CDI/CDD/STAGE), poste.',
    input_schema: {
      type: 'object',
      properties: {
        prenom: { type: 'string' }, nom: { type: 'string' },
        email: { type: 'string' }, telephone: { type: 'string' },
        date_embauche: { type: 'string' },
        salaire_base: { type: 'number' },
        contrat_type: { type: 'string' }, poste: { type: 'string' },
      },
      required: ['prenom', 'nom', 'date_embauche'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/rh/employes`, isAction: true,
  },
  {
    name: 'compute_departure_stc',
    description: 'Calcule le Solde de Tout Compte (STC) pour un départ employé (WRA Maurice). Fournir employe_id, date_depart (YYYY-MM-DD), motif (demission/licenciement/fin_cdd/retraite).',
    input_schema: {
      type: 'object',
      properties: {
        employe_id: { type: 'string' },
        date_depart: { type: 'string' },
        motif: { type: 'string' },
      },
      required: ['employe_id', 'date_depart'],
    },
    kind: 'read', method: 'POST',
    endpoint: () => `/api/rh/depart`,
    isAction: true,
  },

  // ── 💰 PAIE — calcul individuel + reset ──────────────────────────────
  {
    name: 'compute_employee_payroll',
    description: 'Calcule le bulletin d\'UN employé pour une période. Fournir action="calculer", employe_id, periode (YYYY-MM).',
    input_schema: {
      type: 'object',
      properties: {
        employe_id: { type: 'string' },
        periode: { type: 'string' },
      },
      required: ['employe_id', 'periode'],
    },
    kind: 'read', method: 'POST',
    endpoint: () => `/api/rh/paie`,
    isAction: true,
  },

  // ── 🏦 COMPTES BANCAIRES (lecture détaillée) ─────────────────────────
  {
    name: 'list_bank_accounts',
    description: 'Liste les comptes bancaires de la société avec leurs derniers soldes.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/comptes-bancaires`,
  },

  // ── 📊 PRÉVISIONNEL / TRÉSORERIE ─────────────────────────────────────
  {
    name: 'get_previsionnel',
    description: 'Prévisionnel de trésorerie / cash-flow forecast.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/previsionnel`,
  },

  // ── 📈 ÉCHÉANCES (factures à venir) ──────────────────────────────────
  {
    name: 'list_echeances',
    description: 'Échéances de factures à venir (clients à encaisser / fournisseurs à payer).',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/echeances`,
  },

  // ── 🎯 CONSEILS / RECOMMANDATIONS ────────────────────────────────────
  {
    name: 'get_conseils',
    description: 'Conseils & recommandations Lexora pour la société (optimisations fiscales, alertes business…).',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/conseils`,
  },

  // ── 🏷️ CATALOGUE PRODUITS/SERVICES ──────────────────────────────────
  {
    name: 'list_catalogue',
    description: 'Catalogue produits/services de la société (utile pour créer une facture).',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/catalogue`,
  },

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 2 — GBC compliance + Admin + Documents + Banque scrape
  // ══════════════════════════════════════════════════════════════════════

  // ── 🌐 GBC COMPLIANCE (Global Business Companies Maurice) ────────────
  {
    name: 'get_gbc_per_computation',
    description: 'Calcul du PER (Partial Exemption Regime 80%) pour GBC : impôt préférentiel sur revenus étrangers. Filtre : periode (annuelle).',
    input_schema: { type: 'object', properties: { periode: { type: 'string', description: 'Année YYYY' } } },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/comptable/gbc/per-computation?${qs(p)}`,
  },
  {
    name: 'download_gbc_per_pdf',
    description: 'Télécharge le PDF du calcul PER 80% (en pièce jointe Telegram).',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } } },
    kind: 'download', method: 'GET',
    endpoint: (p) => `/api/comptable/gbc/per-computation/export-pdf?${qs(p)}`,
    downloadFilename: (p) => `gbc-per-${p.periode || new Date().getFullYear()}.pdf`,
    downloadContentType: 'application/pdf',
    downloadCaption: (p) => `📑 PER 80% ${p.periode || ''}`,
  },
  {
    name: 'save_gbc_per_computation',
    description: 'Enregistre/met à jour le calcul PER 80% (après validation des chiffres). Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string' },
        foreign_income: { type: 'number' }, total_income: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['periode'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/comptable/gbc/per-computation`, isAction: true,
  },
  {
    name: 'get_gbc_substance',
    description: 'État de conformité Substance (CIGA — Core Income Generating Activities) pour le GBC : exigences FSC (employés, dépenses, locaux à Maurice).',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } } },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/comptable/gbc/substance?${qs(p)}`,
  },
  {
    name: 'download_gbc_substance_pdf',
    description: 'Télécharge le rapport de conformité Substance (PDF).',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } } },
    kind: 'download', method: 'GET',
    endpoint: (p) => `/api/comptable/gbc/substance/export-pdf?${qs(p)}`,
    downloadFilename: (p) => `gbc-substance-${p.periode || new Date().getFullYear()}.pdf`,
    downloadContentType: 'application/pdf',
    downloadCaption: () => '📑 Substance compliance',
  },
  {
    name: 'save_gbc_substance',
    description: 'Met à jour la déclaration Substance (CIGA, employés MUR, dépenses locales, locaux). Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string' },
        ciga_activities: { type: 'array', items: { type: 'string' } },
        nb_employes_mauritius: { type: 'number' },
        local_expenses_mur: { type: 'number' },
        office_address: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['periode'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/comptable/gbc/substance`, isAction: true,
  },
  {
    name: 'list_gbc_beneficial_owners',
    description: 'Registre UBO (Ultimate Beneficial Owners) du GBC. Liste les bénéficiaires effectifs (>25% détention) déclarés au FSC.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/comptable/gbc/beneficial-owners`,
  },
  {
    name: 'download_gbc_ubo_pdf',
    description: 'Télécharge le registre UBO en PDF.',
    input_schema: { type: 'object', properties: {} },
    kind: 'download', method: 'GET',
    endpoint: () => `/api/comptable/gbc/beneficial-owners/export-pdf`,
    downloadFilename: () => `gbc-ubo-${new Date().toISOString().slice(0, 10)}.pdf`,
    downloadContentType: 'application/pdf',
    downloadCaption: () => '📑 Registre UBO',
  },
  {
    name: 'add_gbc_beneficial_owner',
    description: 'Ajoute un UBO. Fournir nom, prenom, date_naissance, nationalite, pct_ownership (>25%), pays_residence, passport_number optionnel.',
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string' }, prenom: { type: 'string' },
        date_naissance: { type: 'string' }, nationalite: { type: 'string' },
        pct_ownership: { type: 'number' }, pays_residence: { type: 'string' },
        passport_number: { type: 'string' },
      },
      required: ['nom', 'prenom', 'pct_ownership'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/comptable/gbc/beneficial-owners`, isAction: true,
  },
  {
    name: 'get_gbc_transfer_pricing',
    description: 'État Transfer Pricing du GBC : conformité OCDE pour transactions intra-groupe (master file, local file, CbC report).',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } } },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/comptable/gbc/transfer-pricing?${qs(p)}`,
  },
  {
    name: 'save_gbc_transfer_pricing',
    description: 'Enregistre une déclaration Transfer Pricing. Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string' },
        intra_group_revenue_mur: { type: 'number' },
        intra_group_expenses_mur: { type: 'number' },
        related_parties: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['periode'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/comptable/gbc/transfer-pricing`, isAction: true,
  },
  {
    name: 'get_gbc_pillar_two',
    description: 'Statut BEPS Pillar Two (GloBE — taux d\'imposition minimum 15%) pour le GBC : ETR calculé, top-up tax éventuel.',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } } },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/comptable/gbc/pillar-two?${qs(p)}`,
  },
  {
    name: 'save_gbc_pillar_two',
    description: 'Met à jour les paramètres Pillar Two (ETR, jurisdictional adjustments). Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string' },
        gloBE_income_mur: { type: 'number' },
        covered_taxes_mur: { type: 'number' },
        etr_pct: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['periode'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/comptable/gbc/pillar-two`, isAction: true,
  },
  {
    name: 'get_gbc_crs_fatca',
    description: 'État CRS / FATCA du GBC (déclarations automatiques OCDE + IRS).',
    input_schema: { type: 'object', properties: { periode: { type: 'string' } } },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/comptable/gbc/crs-fatca?${qs(p)}`,
  },
  {
    name: 'save_gbc_crs_fatca',
    description: 'Met à jour la déclaration CRS/FATCA. Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string' },
        nb_account_holders_reportable: { type: 'number' },
        total_balance_mur: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['periode'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/comptable/gbc/crs-fatca`, isAction: true,
  },
  {
    name: 'get_gbc_consolidation',
    description: 'Consolidation IFRS 10 (états financiers consolidés holding + filiales). Filtres : periode, entity_ids.',
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string' },
        entity_ids: { type: 'array', items: { type: 'string' } },
      },
    },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/comptable/gbc/consolidate?${qs(p)}`,
  },
  {
    name: 'run_gbc_consolidation',
    description: 'Lance la consolidation IFRS 10 pour la période. Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        periode: { type: 'string' },
        entity_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['periode'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/comptable/gbc/consolidate`, isAction: true,
  },

  // ── 📑 DOCUMENTS étendus (RH + bulk delete + OCR) ────────────────────
  {
    name: 'list_documents_rh',
    description: 'Liste les documents RH (contrats, fiches employés, attestations…). Filtre : type, employe_id.',
    input_schema: {
      type: 'object',
      properties: { type: { type: 'string' }, employe_id: { type: 'string' } },
    },
    kind: 'read', method: 'GET', endpoint: (p) => `/api/documents-rh?${qs(p)}`,
  },
  {
    name: 'delete_document_rh',
    description: 'Supprime un document RH (par id). Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    kind: 'read', method: 'DELETE', endpoint: (p) => `/api/documents-rh/${p.id}`, isAction: true,
  },
  {
    name: 'bulk_delete_documents',
    description: 'Supprime PLUSIEURS documents d\'un coup (cascade sur factures/écritures/relevés). ATTENTION : irréversible — toujours reformuler la liste et demander confirmation explicite avant.',
    input_schema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/documents/bulk-delete`, isAction: true,
  },

  // ── ⚙️ ADMINISTRATION : utilisateurs / accès ─────────────────────────
  {
    name: 'list_admin_clients',
    description: 'Liste les clients/utilisateurs Lexora gérés (admin uniquement). Pour vue d\'ensemble des sociétés et leurs comptables assignés.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/admin/clients`,
  },
  {
    name: 'create_user_for_employee',
    description: 'Crée un compte Lexora pour un employé existant (rôle "employe"). Fournir employe_id + email + mot de passe initial. Demander confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        employe_id: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['employe_id', 'email', 'password'],
    },
    kind: 'read', method: 'POST', endpoint: () => `/api/admin/create-user-employee`, isAction: true,
  },
  {
    name: 'list_admin_dossiers',
    description: 'Liste les dossiers comptables Lexora (admin / comptable).',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/admin/dossiers`,
  },
  {
    name: 'admin_health_check',
    description: 'État système Lexora : DB, RLS, env vars critiques. Pour le debug. Admin uniquement.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/admin/health`,
  },

  // ── 🏦 BANQUE — scrape automatique ───────────────────────────────────
  {
    name: 'list_bank_credentials',
    description: 'Liste les credentials bancaires configurés (direction/admin uniquement). N\'expose pas les mots de passe, juste les comptes liés et leur statut.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/direction/bank-credentials`,
  },
  {
    name: 'trigger_bank_scrape',
    description: 'Déclenche un scrape bancaire manuel pour récupérer les nouvelles transactions. Fournir compte_id. Direction/admin uniquement. Asynchrone : le résultat arrive ensuite dans les relevés.',
    input_schema: {
      type: 'object',
      properties: { compte_id: { type: 'string' } },
      required: ['compte_id'],
    },
    kind: 'read', method: 'POST',
    endpoint: (p) => `/api/client/direction/bank-credentials/scrape?compte_id=${encodeURIComponent(p.compte_id)}`,
    isAction: true,
  },
  {
    name: 'list_mra_credentials',
    description: 'Credentials MRA configurés (direction/admin). Pour vérifier que la connexion MRA est OK.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/direction/mra-credentials`,
  },

  // ── 📅 TAX CALENDAR détaillé + alertes config ────────────────────────
  {
    name: 'get_telegram_alerts_config',
    description: 'Configuration des alertes Telegram pour la société (échéances MRA, factures en retard, etc.).',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/telegram-alerts-config`,
  },

  // ── 📞 PERMISSIONS TELEGRAM (qui a accès au bot) ─────────────────────
  {
    name: 'list_telegram_permissions',
    description: 'Liste les utilisateurs ayant accès au bot Telegram pour la société, leurs rôles et capabilities.',
    input_schema: { type: 'object', properties: {} },
    kind: 'read', method: 'GET', endpoint: () => `/api/client/telegram-permissions`,
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
- Tu pilotes Lexora comme depuis le web : CONSULTER, CRÉER, MODIFIER, SUPPRIMER, TÉLÉCHARGER. Tu peux enchaîner plusieurs outils dans une même réponse (ex: chercher un contact → créer une facture → la télécharger en PDF → l'envoyer par mail).
- Domaines couverts : factures (CRUD + paiements + PDF), tiers/contacts (CRUD), écritures comptables, banque & relevés (+ scrape auto), grand livre, balance, KPIs & rapports, prévisionnel, échéances, paie & bulletins (+ STC), employés, congés, présences, échéances MRA, exports MRA (PAYE/CSG/PRGF/virement bancaire), recurrences, relances clients, virements, documents (+ documents RH + bulk delete), catalogue, email, agenda/RDV, GBC compliance (PER 80%, Substance/CIGA, UBO, Transfer Pricing, Pillar Two, CRS/FATCA, consolidation IFRS 10), administration (users, dossiers, health, permissions Telegram, alertes).
- TÉLÉCHARGEMENTS : utilise les outils download_* pour envoyer un PDF/Excel/CSV en pièce jointe Telegram. Confirme en 1 phrase ("voici le PDF…") quand un fichier part — pas besoin de répéter le contenu.
- Ne devine JAMAIS un chiffre : récupère-le via les outils. Formate les montants avec séparateur de milliers et la devise (ex: 1 250 000 MUR).
- Pour les listes longues, résume les points clés (totaux, top 5) plutôt que de tout dérouler.

ACTIONS SENSIBLES (création / modification / suppression / envoi : facture, écriture, tiers, employé, paie, congé, virement, email, RDV, MRA, relances…) :
- N'exécute l'action QUE si l'utilisateur l'a demandée clairement et que tu as TOUTES les infos nécessaires.
- S'il manque une info (destinataire, montant, date, créneau, employe_id…), DEMANDE-la d'abord — n'invente pas.
- Avant toute action IRRÉVERSIBLE (delete_*, send_relances dry_run=false, run_recurrences dry_run=false, supprimer/annuler facture/écriture/RDV, valider la paie, envoyer email/MRA) : reformule en 1 phrase ce que tu vas faire et demande confirmation explicite. Si l'utilisateur vient de te confirmer dans son dernier message, exécute directement.
- Pour les delete_* : préfère toujours désactiver/marquer inactif si possible. Avertir l'utilisateur quand un hard delete a un historique attaché.
- Les rôles sont contrôlés côté serveur : si une action est refusée (rôle insuffisant), explique-le simplement à l'utilisateur.
- Si une donnée ou un connecteur n'est pas accessible, dis-le franchement plutôt que d'inventer.

Note : le pointage (/in, /out), l'envoi de documents (OCR) et les notes de frais photo se font aussi directement dans Telegram (commandes dédiées).

Utilise le format HTML Telegram léger si utile : <b>gras</b>, <code>code</code>. Pas de Markdown (#, *, tableaux).`
}

/* -------------------------------------------------------------------------- */
/*  Exécution d'un tool                                                        */
/* -------------------------------------------------------------------------- */
type ExecToolResult = {
  /** Donnée à renvoyer à Claude (string ou JSON sérialisable). */
  toolContent: unknown
  /** Pièce jointe produite (mode download uniquement). */
  artifact?: LexoraAgentArtifact
}

async function execTool(
  tool: ToolDef,
  input: Record<string, any>,
  ctx: LexoraAgentContext,
): Promise<ExecToolResult> {
  const params = { ...(input || {}) }
  const base = getLexoraBaseUrl()
  const kind = tool.kind || 'read'

  try {
    // ── Modes 'read' / 'download' : appel REST direct (token interne) ──
    if (kind === 'read' || kind === 'download') {
      if (!params.societe_id) params.societe_id = ctx.societe_id
      const method = tool.method || 'GET'
      const path = tool.endpoint!(params)
      const url = `${base}${path}`
      const init: RequestInit = {
        method,
        headers: callLexoraHeaders(ctx.user_id),
        cache: 'no-store',
      }
      if (method !== 'GET' && method !== 'DELETE') {
        init.body = JSON.stringify(params)
      }
      const res = await fetch(url, init)
      if (!res.ok) {
        const details = await res.text().catch(() => '')
        return {
          toolContent: { error: `tool_failed_http_${res.status}`, details: details.slice(0, 400) },
        }
      }

      // Mode download : on bufferize et on remonte un artifact + un résumé pour Claude.
      if (kind === 'download') {
        const ct = (res.headers.get('content-type') || tool.downloadContentType || 'application/octet-stream').split(';')[0].trim()
        const buf = await res.arrayBuffer()
        const filename = tool.downloadFilename ? tool.downloadFilename(params) : 'lexora-export'
        const caption = tool.downloadCaption?.(params)
        return {
          toolContent: {
            artifact_sent: true,
            filename,
            size_bytes: buf.byteLength,
            content_type: ct,
            note: 'Le fichier est envoyé en pièce jointe Telegram juste après ta réponse. Confirme simplement à l\'utilisateur que c\'est envoyé (1 phrase).',
          },
          artifact: { buffer: buf, filename, contentType: ct, caption },
        }
      }

      // 'read' classique → JSON ou texte
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        return { toolContent: await res.json() }
      }
      return { toolContent: await res.text() }
    }

    // ── Modes 'internal_*' : endpoints /api/telegram/internal/* (HMAC) ──
    const secret = hmacSecret()
    if (!secret) return { toolContent: { error: 'hmac_secret_missing' } }

    if (kind === 'internal_get') {
      // chat_id en query ; corps vide → on signe ''.
      const query = qs({ ...params, chat_id: ctx.chat_id })
      const url = `${base}${tool.internalPath}${query ? `?${query}` : ''}`
      const { headers } = buildSignedHeaders('', secret)
      const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { toolContent: { error: `tool_failed_http_${res.status}`, data } }
      return { toolContent: data }
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
    if (!res.ok) return { toolContent: { error: `tool_failed_http_${res.status}`, data } }
    return { toolContent: data }
  } catch (e) {
    return { toolContent: { error: 'tool_network_error', message: e instanceof Error ? e.message : 'unknown' } }
  }
}

/* -------------------------------------------------------------------------- */
/*  Boucle agent                                                               */
/* -------------------------------------------------------------------------- */
/** Pièce jointe produite par un outil download (PDF/Excel/CSV). */
export type LexoraAgentArtifact = {
  /** Données brutes — envoyées au webhook qui appelle sendTelegramDocumentBuffer. */
  buffer: ArrayBuffer
  /** Nom de fichier proposé (ex: 'facture-INV-001.pdf'). */
  filename: string
  /** MIME (ex: 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'). */
  contentType: string
  /** Légende courte affichée sous le doc Telegram. */
  caption?: string
}

export type LexoraAgentResult =
  | { ok: true; text: string; turns: number; tools_used: string[]; artifacts?: LexoraAgentArtifact[] }
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

  const primaryModel = process.env.TELEGRAM_AGENT_MODEL || DEFAULT_MODEL
  const fallbackModel = process.env.TELEGRAM_AGENT_MODEL_FALLBACK || FALLBACK_MODEL
  // Modèle effectif : bascule sur le fallback si le principal est rejeté
  // (clé sans accès Opus, ID inconnu…). Persiste pour les tours suivants.
  let model = primaryModel
  let triedFallback = false
  const anthropic = new Anthropic({ apiKey })
  const today = new Date().toISOString().slice(0, 10)

  /** True si l'erreur Anthropic concerne le modèle (404/not_found/invalid model). */
  const isModelError = (e: any): boolean => {
    const status = e?.status || e?.statusCode
    const msg = String(e?.message || e?.error?.message || '').toLowerCase()
    return status === 404 || /model|not_found|not found/.test(msg)
  }

  /** Appel Claude avec bascule auto vers le fallback en cas d'erreur modèle. */
  const createMessage = async (): Promise<Anthropic.Message> => {
    try {
      return await anthropic.messages.create({
        model,
        max_tokens: 1500,
        system: systemPrompt(ctx, today),
        tools: anthropicTools,
        messages: convo,
      })
    } catch (e: any) {
      if (!triedFallback && model !== fallbackModel && isModelError(e)) {
        triedFallback = true
        model = fallbackModel
        return await anthropic.messages.create({
          model,
          max_tokens: 1500,
          system: systemPrompt(ctx, today),
          tools: anthropicTools,
          messages: convo,
        })
      }
      throw e
    }
  }

  // Injecte le contexte mémoire (rappels société/user) en préambule si présent.
  const firstUserContent = ctx.memory_context
    ? `${ctx.memory_context}\n\n---\nMessage de l'utilisateur :\n${userText}`
    : userText

  const convo: Anthropic.MessageParam[] = [
    { role: 'user', content: firstUserContent },
  ]
  const toolsUsed: string[] = []
  const artifacts: LexoraAgentArtifact[] = []

  const anthropicTools: Anthropic.Tool[] = TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await createMessage()

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
          artifacts: artifacts.length > 0 ? artifacts : undefined,
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
        if (result.artifact) artifacts.push(result.artifact)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result.toolContent).slice(0, 12_000),
        })
      }
      convo.push({ role: 'user', content: toolResults })
    }

    return {
      ok: true,
      text: 'Je n\'ai pas pu finaliser ta demande en quelques étapes. Reformule ou découpe-la.',
      turns: MAX_TURNS,
      tools_used: toolsUsed,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
    }
  } catch (e: any) {
    // Détail riche pour diagnostic (status + message Anthropic + modèles tentés).
    const status = e?.status || e?.statusCode || ''
    const msg = e?.message || e?.error?.message || 'Erreur agent LLM'
    const detail = `${status ? `[${status}] ` : ''}${msg} (modèle=${model}${triedFallback ? `, fallback depuis ${primaryModel}` : ''})`
    return { ok: false, error: detail }
  }
}

/** Liste des noms d'outils (pour debug / health-check). */
export const LEXORA_AGENT_TOOL_NAMES = TOOLS.map(t => t.name)
