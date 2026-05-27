#!/usr/bin/env node
/**
 * Lexora MCP Server — Model Context Protocol pour Claude Desktop, n8n, API.
 *
 * Permet à Claude (et autres clients MCP) d'utiliser Lexora comme un outil
 * natif. Read-only par défaut — pas d'écriture en compta sans approbation
 * humaine côté Lexora UI.
 *
 * AUTH : header `X-Lexora-Api-Key` (mig 308 — user_api_keys).
 * La clé est générée par l'utilisateur dans Lexora :
 *   /client/direction/mcp-setup → "Créer une nouvelle clé"
 * Elle est liée à son user_id, révocable, et hashée en DB.
 *
 * ENV CÔTÉ MCP (à mettre dans claude_desktop_config.json) :
 *   LEXORA_API_URL    URL de l'instance Lexora (ex: https://lexora.vercel.app)
 *   LEXORA_API_KEY    Clé générée dans Lexora (format "lex_...")
 *
 * USAGE Claude Desktop (~/.config/Claude/claude_desktop_config.json) :
 *   {
 *     "mcpServers": {
 *       "lexora": {
 *         "command": "node",
 *         "args": ["/chemin/absolu/v0-lexora-accounting-saa-s/mcp-server/dist/index.js"],
 *         "env": {
 *           "LEXORA_API_URL": "https://ton-instance.vercel.app",
 *           "LEXORA_API_KEY": "lex_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const LEXORA_API_URL = (process.env.LEXORA_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const LEXORA_API_KEY = process.env.LEXORA_API_KEY ?? ''

if (!LEXORA_API_KEY) {
  console.error('[lexora-mcp] LEXORA_API_KEY est requis dans l\'env (format "lex_...")')
  console.error('[lexora-mcp] Génère-en une depuis Lexora → Direction → Connecter à Claude Desktop')
  process.exit(1)
}

if (!LEXORA_API_KEY.startsWith('lex_')) {
  console.error('[lexora-mcp] LEXORA_API_KEY doit commencer par "lex_" — clé invalide')
  process.exit(1)
}

async function lexoraFetch(path: string, init: RequestInit = {}) {
  const url = `${LEXORA_API_URL}${path.startsWith('/') ? path : '/' + path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Lexora-Api-Key': LEXORA_API_KEY,
    ...(init.headers as Record<string, string> | undefined),
  }

  const res = await fetch(url, { ...init, headers })
  const contentType = res.headers.get('content-type') || ''
  const body = contentType.includes('json') ? await res.json() : await res.text()
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body)
    throw new Error(`Lexora ${res.status} sur ${path}: ${detail}`)
  }
  return body
}

const server = new Server(
  { name: 'lexora-mcp', version: '0.6.0' },
  { capabilities: { tools: {} } },
)

// ============================================================
// Liste des outils exposés à Claude
// ============================================================
const TOOLS = [
  {
    name: 'list_societes',
    description:
      'Liste les sociétés accessibles à l\'utilisateur Lexora connecté. Retourne id, nom, BRN, VAT, devise, régime fiscal.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_financial_summary',
    description:
      'Synthèse financière d\'une société pour une période : revenus, dépenses, TVA, masse salariale, trésorerie, créances, dettes. Source identique au Dashboard et P&L Lexora.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string', description: 'UUID de la société (cf. list_societes)' },
        exercice: { type: 'string', description: 'Exercice fiscal mauricien (Jul-Jun), ex: "2025-2026". Optionnel.' },
        date_debut: { type: 'string', description: 'Début période YYYY-MM-DD, alternative à exercice' },
        date_fin: { type: 'string', description: 'Fin période YYYY-MM-DD' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_factures',
    description:
      'Liste les factures (clients et fournisseurs) d\'une société. Filtres optionnels par type, statut, période.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        type_facture: { type: 'string', enum: ['client', 'fournisseur'], description: 'Filtre par type. Par défaut : tous.' },
        statut: { type: 'string', enum: ['brouillon', 'en_attente', 'paye', 'retard', 'annule'] },
        limit: { type: 'number', description: 'Max résultats. Défaut 50.' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_alertes',
    description:
      'Alertes financières et de conformité actives pour une société : TVA en retard, créances anciennes, ratio liquidité dégradé, échéances MRA à venir, etc.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_releves_bancaires',
    description:
      'Liste les relevés bancaires d\'une société Lexora pour une période donnée. Permet d\'accéder aux transactions bancaires pour analyse comptable, rapprochement, ou audit. Retourne aussi la liste des comptes bancaires de la société.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: {
          type: 'string',
          description: 'UUID de la société (récupérer via list_societes)',
        },
        periode: {
          type: 'string',
          description: 'Période YYYY-MM (optionnel — filtre sur date_fin du relevé). Défaut : tous les relevés.',
        },
        compte_id: {
          type: 'string',
          description: 'UUID du compte bancaire (optionnel — filtre sur un compte spécifique).',
        },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'get_taux_change',
    description:
      'Taux de change actuels MUR vers devises étrangères (USD, EUR, GBP, JPY, AUD, CAD, CNY, INR, ZAR...). Source : Bank of Mauritius officielle, fallback ExchangeRate-API.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  // ============================================================
  // v0.5.0 — Couverture complète comptable + RH + banque (14 nouveaux outils)
  // ============================================================
  {
    name: 'list_comptes_bancaires',
    description:
      'Liste les comptes bancaires d\'une société Lexora avec leur banque, IBAN, devise, solde et configuration (compte principal, actif/inactif).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string', description: 'UUID de la société (cf. list_societes)' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_factures_clients',
    description:
      'Liste les factures CLIENTS (ventes) d\'une société. Filtres optionnels par statut et période.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        statut: { type: 'string', enum: ['brouillon', 'en_attente', 'paye', 'retard', 'annule'] },
        date_debut: { type: 'string', description: 'YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max résultats. Défaut 200.' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_factures_fournisseurs',
    description:
      'Liste les factures FOURNISSEURS (achats) d\'une société. Filtres optionnels par statut et période.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        statut: { type: 'string', enum: ['brouillon', 'en_attente', 'paye', 'retard', 'annule'] },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_devis',
    description:
      'Liste les DEVIS (quotations) émis par une société.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        statut: { type: 'string' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_avoirs',
    description:
      'Liste les AVOIRS (notes de crédit) émis par une société.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_ecritures',
    description:
      'Liste les écritures comptables (journal général V2) d\'une société pour une période. Filtres optionnels par journal (AC, VTE, BQ, OD, SAL...) et compte.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        date_debut: { type: 'string', description: 'YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'YYYY-MM-DD' },
        journal: { type: 'string', description: 'Code journal (AC, VTE, BQ, OD, SAL...)' },
        compte: { type: 'string', description: 'Numéro de compte PCM' },
        mois: { type: 'string', description: 'Format YYYY-MM (alternative à date_debut/date_fin)' },
        limit: { type: 'number', description: 'Max 1000. Défaut 200.' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'get_grand_livre',
    description:
      'Récupère le grand livre comptable d\'une société (toutes les écritures par compte avec soldes progressifs et ouvertures). Filtres : période, exercice (Jul-Jun), plage de comptes, journal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        compte_debut: { type: 'string', description: 'Numéro de compte début de plage' },
        compte_fin: { type: 'string', description: 'Numéro de compte fin de plage' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
        journal: { type: 'string' },
        exercice: { type: 'string', description: 'Ex: "2025-2026" (juillet 2025 → juin 2026)' },
        page: { type: 'number' },
        limit: { type: 'number', description: '0 = pas de pagination' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'get_rapprochement_status',
    description:
      'KPIs du rapprochement bancaire d\'une société : taux d\'auto-rapprochement, transactions inconnu, lettrage 401/411, solde 580 transit, alertes conformité.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_tiers',
    description:
      'Liste les tiers (comptes auxiliaires) d\'une société : clients et fournisseurs depuis l\'annuaire de contacts factures, avec entreprise, BRN, VAT, contact, devise, conditions de paiement.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        q: { type: 'string', description: 'Recherche par nom ou entreprise' },
        include_inactifs: { type: 'boolean', description: 'Inclure les tiers inactifs. Défaut false.' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_documents',
    description:
      'Liste les documents PDF (factures, justificatifs, relevés, contrats) accessibles à l\'utilisateur courant. Inclut nom de fichier, type, statut de traitement, société détectée.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_employes',
    description:
      'Liste les employés d\'une société (par défaut actifs uniquement). Filtres : statut (presents/sortis/tous), recherche par nom/prénom/poste.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        statut: { type: 'string', enum: ['presents', 'sortis', 'tous'], description: 'Par défaut : presents' },
        search: { type: 'string', description: 'Recherche par nom, prénom ou poste' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_bulletins_paie',
    description:
      'Liste les bulletins de paie d\'une société pour une période. Filtre optionnel par employé. Retourne salaire brut/net, cotisations NSF/CSG/PAYE.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        periode: { type: 'string', description: 'Format YYYY-MM' },
        employe_id: { type: 'string', description: 'UUID employé (optionnel)' },
        include_archived: { type: 'boolean', description: 'Inclure les bulletins archivés (versions superseded)' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'get_plan_comptable',
    description:
      'Récupère le plan comptable mauricien (PCM) d\'une société : comptes globaux + overrides spécifiques. Inclut numéro, libellé, classe, type, sens normal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string', description: 'Optionnel — sans → uniquement comptes globaux PCM' },
      },
    },
  },
  {
    name: 'list_lettrage_non_lettrees',
    description:
      'Liste les écritures comptables non lettrées d\'une société, groupées par compte. Permet d\'identifier les soldes à apurer (clients 411, fournisseurs 401, transit 580...).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },

  // ============================================================
  // v0.6.0 — Outils ciblés workflows fréquents + query générique
  // ============================================================
  {
    name: 'get_balance_comptes',
    description:
      'Balance des comptes d\'une société pour une période ou un exercice. Retourne pour chaque compte : débit cumulé, crédit cumulé, solde.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        exercice: { type: 'string', description: 'Ex: "2025-2026"' },
        date_debut: { type: 'string', description: 'YYYY-MM-DD' },
        date_fin: { type: 'string', description: 'YYYY-MM-DD' },
        compte_debut: { type: 'string', description: 'Plage compte début' },
        compte_fin: { type: 'string', description: 'Plage compte fin' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'get_bilan',
    description:
      'Bilan comptable d\'une société pour un exercice donné. Actif (immobilisations, créances, trésorerie) vs Passif (capitaux propres, dettes).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        exercice: { type: 'string' },
        date_arrete: { type: 'string', description: 'YYYY-MM-DD (alternative à exercice)' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'get_compte_resultat',
    description:
      'Compte de résultat (P&L) détaillé d\'une société : produits classes 7, charges classes 6, résultat net.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        exercice: { type: 'string' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_exercices',
    description: 'Liste les exercices fiscaux (Jul-Jun) d\'une société : ouverts, clôturés, dates.',
    inputSchema: {
      type: 'object' as const,
      properties: { societe_id: { type: 'string' } },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_conges',
    description:
      'Liste les demandes/soldes de congés. Filtres par employé, statut, type, période.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        employe_id: { type: 'string' },
        statut: { type: 'string', enum: ['en_attente', 'valide', 'refuse', 'annule'] },
        type: { type: 'string', description: 'Code du type de congé (annuel, maladie, maternite...)' },
        date_debut: { type: 'string', description: 'YYYY-MM-DD' },
        date_fin: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_pointages',
    description: 'Pointages quotidiens (présence, heures, absences) sur une période.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        employe_id: { type: 'string' },
        date_debut: { type: 'string', description: 'YYYY-MM-DD' },
        date_fin: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_heures_sup',
    description: 'Heures supplémentaires saisies/validées par employé et période.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        employe_id: { type: 'string' },
        periode: { type: 'string', description: 'YYYY-MM' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_contrats',
    description: 'Contrats employés actifs (CDI, CDD, freelance...) avec dates, salaires.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        employe_id: { type: 'string' },
        actif_seulement: { type: 'boolean', description: 'Si true, ne retourne que les contrats actuellement actifs.' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_paiements',
    description:
      'Paiements (partiels ou complets) enregistrés sur les factures d\'une société.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        facture_id: { type: 'string', description: 'Filtre sur une facture précise.' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_comptes_courants_associes',
    description:
      'Comptes courants d\'associés (CCA) d\'une société : associés, soldes courants, dernier mouvement.',
    inputSchema: {
      type: 'object' as const,
      properties: { societe_id: { type: 'string' } },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_comptes_paiement_tiers',
    description:
      'Whitelist des comptes de paiement tiers (associés, sociétés liées, exploitant) utilisés pour les règlements hors banque.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        actif: { type: 'boolean', description: 'Filtre actif/inactif.' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_declarations_mra',
    description:
      'Déclarations MRA mensuelles (PAYE, NSF, CSG, Training Levy, PRGF, TDS) d\'une société.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        type_declaration: { type: 'string', enum: ['paye', 'nsf_csg', 'training_levy', 'prgf', 'tds', 'tva'] },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_audit_log',
    description:
      'Audit trail des actions sur le rapprochement bancaire (lettrer, classer, regler_hors_banque, déletrer).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        action: { type: 'string', description: 'Filtre par type d\'action.' },
        user_id: { type: 'string' },
        date_debut: { type: 'string' },
        date_fin: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['societe_id'],
    },
  },

  // ─── Outil générique : query SELECT sur whitelist de tables ────────
  {
    name: 'query_lexora',
    description:
      'Outil GÉNÉRIQUE pour interroger n\'importe quelle table Lexora whitelistée en SELECT. Utiliser après avoir consulté get_mcp_tables pour la liste des tables disponibles et leur structure. Filtres : eq, in, gte, lte, ilike. Toujours SELECT-only, sécurisé. Idéal pour les requêtes ad-hoc que les outils dédiés ne couvrent pas.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          description: 'Nom de la table à interroger (cf. get_mcp_tables pour la liste complète : ecritures_comptables_v2, factures, bulletins_paie, conges, pointages, etc.)',
        },
        societe_id: { type: 'string', description: 'OBLIGATOIRE pour la plupart des tables (sauf référentiels globaux comme plan_comptable_pcm, taux_change).' },
        filters: { type: 'object', additionalProperties: true, description: 'Filtres d\'égalité, ex: {"statut": "paye", "type_facture": "fournisseur"}' },
        filters_in: { type: 'object', additionalProperties: true, description: 'Filtres IN, ex: {"statut": ["paye", "retard"]}' },
        filters_gte: { type: 'object', additionalProperties: true, description: 'Filtres >=, ex: {"date_facture": "2026-01-01"}' },
        filters_lte: { type: 'object', additionalProperties: true, description: 'Filtres <=' },
        filters_ilike: { type: 'object', additionalProperties: true, description: 'Filtres ILIKE (insensitive), ex: {"tiers": "%apple%"}' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Colonnes à retourner. Par défaut, colonnes pré-sélectionnées par la whitelist.' },
        order_by: { type: 'string', description: 'Colonne d\'ordre.' },
        order_dir: { type: 'string', enum: ['asc', 'desc'], description: 'Direction. Défaut desc.' },
        limit: { type: 'number', description: 'Nombre max de lignes (1-500). Défaut 100.' },
      },
      required: ['table'],
    },
  },
  {
    name: 'get_mcp_tables',
    description:
      'Retourne la liste des tables Lexora interrogeables via query_lexora, avec leur domaine (compta/paie/banque/tiers/docs/fiscal/gbc/system), description, et colonnes par défaut. À appeler en premier pour découvrir ce qui est disponible.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
]

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args || {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'list_societes': {
        const data = await lexoraFetch('/api/client/societes')
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_financial_summary': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.exercice) params.set('exercice', String(a.exercice))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        const data = await lexoraFetch(`/api/client/financial?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_factures': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.type_facture) params.set('type', String(a.type_facture))
        if (a.statut) params.set('statut', String(a.statut))
        if (a.limit) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/client/factures?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_alertes': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        const data = await lexoraFetch(`/api/client/alertes?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_releves_bancaires': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.periode) params.set('periode', String(a.periode))
        if (a.compte_id) params.set('compte_id', String(a.compte_id))
        const data = await lexoraFetch(`/api/client/releves-bancaires?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_taux_change': {
        const data = await lexoraFetch('/api/taux-change')
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      // ============================================================
      // v0.5.0 — 14 nouveaux outils comptables / RH / banque
      // ============================================================
      case 'list_comptes_bancaires': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        const data = await lexoraFetch(`/api/client/comptes-bancaires?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_factures_clients': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        params.set('type_facture', 'client')
        if (a.statut) params.set('statut', String(a.statut))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        if (a.limit) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/client/factures?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_factures_fournisseurs': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        params.set('type_facture', 'fournisseur')
        if (a.statut) params.set('statut', String(a.statut))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        if (a.limit) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/client/factures?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_devis': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        params.set('type_document', 'devis')
        if (a.statut) params.set('statut', String(a.statut))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        if (a.limit) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/client/factures?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_avoirs': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        params.set('type_document', 'avoir')
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        if (a.limit) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/client/factures?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_ecritures': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        if (a.journal) params.set('journal', String(a.journal))
        if (a.compte) params.set('compte', String(a.compte))
        if (a.mois) params.set('mois', String(a.mois))
        if (a.limit) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/client/ecritures?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_grand_livre': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.compte_debut) params.set('compte_debut', String(a.compte_debut))
        if (a.compte_fin) params.set('compte_fin', String(a.compte_fin))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        if (a.journal) params.set('journal', String(a.journal))
        if (a.exercice) params.set('exercice', String(a.exercice))
        if (a.page !== undefined) params.set('page', String(a.page))
        if (a.limit !== undefined) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/comptable/grand-livre?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_rapprochement_status': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        const data = await lexoraFetch(`/api/comptable/rapprochement/kpis?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_tiers': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.q) params.set('q', String(a.q))
        if (a.include_inactifs) params.set('include_inactifs', '1')
        const data = await lexoraFetch(`/api/client/factures-contacts?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_documents': {
        const data = await lexoraFetch('/api/client/documents')
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_employes': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.statut) params.set('statut', String(a.statut))
        if (a.search) params.set('search', String(a.search))
        const data = await lexoraFetch(`/api/rh/employes?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_bulletins_paie': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.periode) params.set('periode', String(a.periode))
        if (a.employe_id) params.set('employe_id', String(a.employe_id))
        if (a.include_archived) params.set('include_archived', 'true')
        const data = await lexoraFetch(`/api/rh/paie?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_plan_comptable': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        const data = await lexoraFetch(`/api/client/plan-comptable?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_lettrage_non_lettrees': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        const data = await lexoraFetch(`/api/comptable/lettrage?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      // ─── v0.6.0 — outils ciblés via query générique ──────────────────
      case 'get_balance_comptes': {
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({
            table: 'ecritures_comptables_v2',
            societe_id: a.societe_id,
            filters_gte: a.date_debut ? { date_ecriture: a.date_debut } : undefined,
            filters_lte: a.date_fin ? { date_ecriture: a.date_fin } : undefined,
            columns: ['numero_compte', 'nom_compte', 'debit_mur', 'credit_mur', 'date_ecriture'],
            limit: 500,
          }),
        })
        // Agrégation simple côté client : group by numero_compte
        const rows = (data as any).rows || []
        const acc = new Map<string, { numero_compte: string; nom_compte: string; debit: number; credit: number }>()
        for (const r of rows) {
          const k = r.numero_compte
          if (!acc.has(k)) acc.set(k, { numero_compte: k, nom_compte: r.nom_compte, debit: 0, credit: 0 })
          acc.get(k)!.debit += +r.debit_mur || 0
          acc.get(k)!.credit += +r.credit_mur || 0
        }
        const balance = [...acc.values()]
          .map(b => ({ ...b, solde: +(b.debit - b.credit).toFixed(2) }))
          .sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))
        return { content: [{ type: 'text', text: JSON.stringify({ balance, truncated: (data as any).truncated }, null, 2) }] }
      }

      case 'get_bilan': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.exercice) params.set('exercice', String(a.exercice))
        if (a.date_arrete) params.set('date_arrete', String(a.date_arrete))
        const data = await lexoraFetch(`/api/comptable/etats-financiers?type=bilan&${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_compte_resultat': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.exercice) params.set('exercice', String(a.exercice))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        const data = await lexoraFetch(`/api/comptable/etats-financiers?type=compte_resultat&${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_exercices': {
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({ table: 'exercices', societe_id: a.societe_id, limit: 50 }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_conges': {
        const filters: Record<string, any> = {}
        if (a.employe_id) filters.employe_id = a.employe_id
        if (a.statut) filters.statut = a.statut
        if (a.type) filters.type = a.type
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({
            table: 'conges', societe_id: a.societe_id,
            filters,
            filters_gte: a.date_debut ? { date_debut: a.date_debut } : undefined,
            filters_lte: a.date_fin ? { date_fin: a.date_fin } : undefined,
            limit: 200,
          }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_pointages': {
        const filters: Record<string, any> = {}
        if (a.employe_id) filters.employe_id = a.employe_id
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({
            table: 'pointages', societe_id: a.societe_id,
            filters,
            filters_gte: a.date_debut ? { date_pointage: a.date_debut } : undefined,
            filters_lte: a.date_fin ? { date_pointage: a.date_fin } : undefined,
            limit: 500,
          }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_heures_sup': {
        const filters: Record<string, any> = {}
        if (a.employe_id) filters.employe_id = a.employe_id
        if (a.periode) filters.periode = a.periode
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({ table: 'heures_sup', societe_id: a.societe_id, filters, limit: 300 }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_contrats': {
        const filters: Record<string, any> = {}
        if (a.employe_id) filters.employe_id = a.employe_id
        if (a.actif_seulement) filters.actif = true
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({ table: 'contrats', societe_id: a.societe_id, filters, limit: 200 }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_paiements': {
        const filters: Record<string, any> = {}
        if (a.facture_id) filters.facture_id = a.facture_id
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({
            table: 'factures_paiements', societe_id: a.societe_id,
            filters,
            filters_gte: a.date_debut ? { date_paiement: a.date_debut } : undefined,
            filters_lte: a.date_fin ? { date_paiement: a.date_fin } : undefined,
            limit: 300,
          }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_comptes_courants_associes': {
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({ table: 'comptes_courants_associes', societe_id: a.societe_id, limit: 100 }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_comptes_paiement_tiers': {
        const filters: Record<string, any> = {}
        if (typeof a.actif === 'boolean') filters.actif = a.actif
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({ table: 'comptes_paiement_tiers', societe_id: a.societe_id, filters, limit: 100 }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_declarations_mra': {
        const filters: Record<string, any> = {}
        if (a.type_declaration) filters.type_declaration = a.type_declaration
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({
            table: 'declarations_mra', societe_id: a.societe_id,
            filters,
            filters_gte: a.date_debut ? { periode: a.date_debut } : undefined,
            filters_lte: a.date_fin ? { periode: a.date_fin } : undefined,
            limit: 100,
          }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_audit_log': {
        const filters: Record<string, any> = {}
        if (a.action) filters.action = a.action
        if (a.user_id) filters.user_id = a.user_id
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify({
            table: 'rapprochement_audit_log', societe_id: a.societe_id,
            filters,
            filters_gte: a.date_debut ? { created_at: a.date_debut } : undefined,
            filters_lte: a.date_fin ? { created_at: a.date_fin } : undefined,
            limit: Number(a.limit) || 100,
          }),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      // ─── Outil générique ─────────────────────────────────────────────
      case 'query_lexora': {
        const data = await lexoraFetch('/api/mcp/query', {
          method: 'POST',
          body: JSON.stringify(a),
        })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_mcp_tables': {
        const data = await lexoraFetch('/api/mcp/query', { method: 'GET' })
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      default:
        return {
          content: [{ type: 'text', text: `Outil inconnu : ${name}` }],
          isError: true,
        }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      content: [{ type: 'text', text: `Erreur : ${msg}` }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(
  `[lexora-mcp] Server started (v0.5.0) — ${TOOLS.length} tools: ` +
  TOOLS.map(t => t.name).join(', ')
)
