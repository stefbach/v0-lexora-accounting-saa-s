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
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { createHash } from 'node:crypto';
/**
 * Confirmation 2-step pour les outils modificateurs.
 * Token déterministe = hash des arguments (hors token). Le LLM doit renvoyer
 * exactement ce token pour confirmer l'exécution — stateless, pas de stockage.
 */
function makeConfirmToken(toolName, args) {
    const { confirmation_token: _omit, ...rest } = args;
    const payload = JSON.stringify({ tool: toolName, args: rest });
    return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
function confirmGuard(toolName, a, previewLabel) {
    const expected = makeConfirmToken(toolName, a);
    const provided = a.confirmation_token;
    if (provided === expected)
        return { confirmed: true, token: expected };
    return {
        confirmed: false,
        token: expected,
        response: {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        requires_confirmation: true,
                        action: toolName,
                        preview: previewLabel,
                        confirmation_token: expected,
                        instructions: `Pour exécuter, rappelle ${toolName} avec confirmation_token: "${expected}"`,
                    }, null, 2),
                }],
        },
    };
}
const LEXORA_API_URL = (process.env.LEXORA_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const LEXORA_API_KEY = process.env.LEXORA_API_KEY ?? '';
if (!LEXORA_API_KEY) {
    console.error('[lexora-mcp] LEXORA_API_KEY est requis dans l\'env (format "lex_...")');
    console.error('[lexora-mcp] Génère-en une depuis Lexora → Direction → Connecter à Claude Desktop');
    process.exit(1);
}
if (!LEXORA_API_KEY.startsWith('lex_')) {
    console.error('[lexora-mcp] LEXORA_API_KEY doit commencer par "lex_" — clé invalide');
    process.exit(1);
}
async function lexoraFetch(path, init = {}) {
    const url = `${LEXORA_API_URL}${path.startsWith('/') ? path : '/' + path}`;
    const headers = {
        'Content-Type': 'application/json',
        'X-Lexora-Api-Key': LEXORA_API_KEY,
        ...init.headers,
    };
    const res = await fetch(url, { ...init, headers });
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
        const detail = typeof body === 'string' ? body : JSON.stringify(body);
        throw new Error(`Lexora ${res.status} sur ${path}: ${detail}`);
    }
    return body;
}
const server = new Server({ name: 'lexora-mcp', version: '0.8.0' }, { capabilities: { tools: {} } });
// ============================================================
// Liste des outils exposés à Claude
// ============================================================
const TOOLS = [
    {
        name: 'list_societes',
        description: 'Liste les sociétés accessibles à l\'utilisateur Lexora connecté. Retourne id, nom, BRN, VAT, devise, régime fiscal.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_financial_summary',
        description: 'Synthèse financière d\'une société pour une période : revenus, dépenses, TVA, masse salariale, trésorerie, créances, dettes. Source identique au Dashboard et P&L Lexora.',
        inputSchema: {
            type: 'object',
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
        description: 'Liste les factures (clients et fournisseurs) d\'une société. Filtres optionnels par type, statut, période.',
        inputSchema: {
            type: 'object',
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
        description: 'Alertes financières et de conformité actives pour une société : TVA en retard, créances anciennes, ratio liquidité dégradé, échéances MRA à venir, etc.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'list_releves_bancaires',
        description: 'Liste les relevés bancaires d\'une société Lexora pour une période donnée. Permet d\'accéder aux transactions bancaires pour analyse comptable, rapprochement, ou audit. Retourne aussi la liste des comptes bancaires de la société.',
        inputSchema: {
            type: 'object',
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
        description: 'Taux de change actuels MUR vers devises étrangères (USD, EUR, GBP, JPY, AUD, CAD, CNY, INR, ZAR...). Source : Bank of Mauritius officielle, fallback ExchangeRate-API.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_transactions_bancaires',
        description: 'Liste les MOUVEMENTS bancaires (transactions à plat) d\'une société pour une période. Plus pratique que list_releves_bancaires quand on veut juste les transactions individuelles. Filtres puissants : compte, période, statut rapprochement (rapproche/non_identifie/a_verifier/propose/tous), plage de montant, ilike libellé. Idéal pour répondre à "Donne-moi les mouvements bancaires de DDS pour mai 2026 supérieurs à 100k MUR".',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string', description: 'UUID société (requis)' },
                compte_id: { type: 'string', description: 'UUID compte bancaire (optionnel)' },
                periode: { type: 'string', description: 'YYYY-MM (alternative à date_debut/date_fin)' },
                date_debut: { type: 'string', description: 'YYYY-MM-DD' },
                date_fin: { type: 'string', description: 'YYYY-MM-DD' },
                statut: {
                    type: 'string',
                    enum: ['tous', 'rapproche', 'non_identifie', 'a_verifier', 'propose'],
                    description: 'Filtre statut rapprochement. Défaut: tous.',
                },
                min_montant: { type: 'number', description: 'Filtre |max(debit,credit)| >=' },
                max_montant: { type: 'number', description: 'Filtre |max(debit,credit)| <=' },
                libelle: { type: 'string', description: 'Filtre ilike sur libellé (insensitive contains)' },
                limit: { type: 'number', description: 'Max résultats. Défaut 200, max 1000.' },
            },
            required: ['societe_id'],
        },
    },
    // ============================================================
    // v0.5.0 — Couverture complète comptable + RH + banque (14 nouveaux outils)
    // ============================================================
    {
        name: 'list_comptes_bancaires',
        description: 'Liste les comptes bancaires d\'une société Lexora avec leur banque, IBAN, devise, solde et configuration (compte principal, actif/inactif).',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string', description: 'UUID de la société (cf. list_societes)' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'list_factures_clients',
        description: 'Liste les factures CLIENTS (ventes) d\'une société. Filtres optionnels par statut et période.',
        inputSchema: {
            type: 'object',
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
        description: 'Liste les factures FOURNISSEURS (achats) d\'une société. Filtres optionnels par statut et période.',
        inputSchema: {
            type: 'object',
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
        description: 'Liste les DEVIS (quotations) émis par une société.',
        inputSchema: {
            type: 'object',
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
        description: 'Liste les AVOIRS (notes de crédit) émis par une société.',
        inputSchema: {
            type: 'object',
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
        description: 'Liste les écritures comptables (journal général V2) d\'une société pour une période. Filtres optionnels par journal (AC, VTE, BQ, OD, SAL...) et compte.',
        inputSchema: {
            type: 'object',
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
        description: 'Récupère le grand livre comptable d\'une société (toutes les écritures par compte avec soldes progressifs et ouvertures). Filtres : période, exercice (Jul-Jun), plage de comptes, journal.',
        inputSchema: {
            type: 'object',
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
        description: 'KPIs du rapprochement bancaire d\'une société : taux d\'auto-rapprochement, transactions inconnu, lettrage 401/411, solde 580 transit, alertes conformité.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'list_tiers',
        description: 'Liste les tiers (comptes auxiliaires) d\'une société : clients et fournisseurs depuis l\'annuaire de contacts factures, avec entreprise, BRN, VAT, contact, devise, conditions de paiement.',
        inputSchema: {
            type: 'object',
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
        description: 'Liste les documents PDF (factures, justificatifs, relevés, contrats) accessibles à l\'utilisateur courant. Inclut nom de fichier, type, statut de traitement, société détectée.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'list_employes',
        description: 'Liste les employés d\'une société (par défaut actifs uniquement). Filtres : statut (presents/sortis/tous), recherche par nom/prénom/poste.',
        inputSchema: {
            type: 'object',
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
        description: 'Liste les bulletins de paie d\'une société pour une période. Filtre optionnel par employé. Retourne salaire brut/net, cotisations NSF/CSG/PAYE.',
        inputSchema: {
            type: 'object',
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
        description: 'Récupère le plan comptable mauricien (PCM) d\'une société : comptes globaux + overrides spécifiques. Inclut numéro, libellé, classe, type, sens normal.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string', description: 'Optionnel — sans → uniquement comptes globaux PCM' },
            },
        },
    },
    {
        name: 'list_lettrage_non_lettrees',
        description: 'Liste les écritures comptables non lettrées d\'une société, groupées par compte. Permet d\'identifier les soldes à apurer (clients 411, fournisseurs 401, transit 580...).',
        inputSchema: {
            type: 'object',
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
        description: 'Balance des comptes d\'une société pour une période ou un exercice. Retourne pour chaque compte : débit cumulé, crédit cumulé, solde.',
        inputSchema: {
            type: 'object',
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
        description: 'Bilan comptable d\'une société pour un exercice donné. Actif (immobilisations, créances, trésorerie) vs Passif (capitaux propres, dettes).',
        inputSchema: {
            type: 'object',
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
        description: 'Compte de résultat (P&L) détaillé d\'une société : produits classes 7, charges classes 6, résultat net.',
        inputSchema: {
            type: 'object',
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
            type: 'object',
            properties: { societe_id: { type: 'string' } },
            required: ['societe_id'],
        },
    },
    {
        name: 'list_conges',
        description: 'Liste les demandes/soldes de congés. Filtres par employé, statut, type, période.',
        inputSchema: {
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
            type: 'object',
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
        description: 'Paiements (partiels ou complets) enregistrés sur les factures d\'une société.',
        inputSchema: {
            type: 'object',
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
        description: 'Comptes courants d\'associés (CCA) d\'une société : associés, soldes courants, dernier mouvement.',
        inputSchema: {
            type: 'object',
            properties: { societe_id: { type: 'string' } },
            required: ['societe_id'],
        },
    },
    {
        name: 'list_comptes_paiement_tiers',
        description: 'Whitelist des comptes de paiement tiers (associés, sociétés liées, exploitant) utilisés pour les règlements hors banque.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                actif: { type: 'boolean', description: 'Filtre actif/inactif.' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'list_declarations_mra',
        description: 'Déclarations MRA mensuelles (PAYE, NSF, CSG, Training Levy, PRGF, TDS) d\'une société.',
        inputSchema: {
            type: 'object',
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
        description: 'Audit trail des actions sur le rapprochement bancaire (lettrer, classer, regler_hors_banque, déletrer).',
        inputSchema: {
            type: 'object',
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
        description: 'Outil GÉNÉRIQUE pour interroger n\'importe quelle table Lexora whitelistée en SELECT. Utiliser après avoir consulté get_mcp_tables pour la liste des tables disponibles et leur structure. Filtres : eq, in, gte, lte, ilike. Toujours SELECT-only, sécurisé. Idéal pour les requêtes ad-hoc que les outils dédiés ne couvrent pas.',
        inputSchema: {
            type: 'object',
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
        description: 'Retourne la liste des tables Lexora interrogeables via query_lexora, avec leur domaine (compta/paie/banque/tiers/docs/fiscal/gbc/system), description, et colonnes par défaut. À appeler en premier pour découvrir ce qui est disponible.',
        inputSchema: { type: 'object', properties: {} },
    },
    // ============================================================
    // v0.7.0 — PCM (Plan Comptable Mauricien) éditable
    // ============================================================
    {
        name: 'list_comptes_pcm',
        description: 'Liste les comptes du Plan Comptable (PCM) éditable d\'une société. Filtres : classe (1-8), recherche (numéro/intitulé), include_archived, parent (sous-comptes). Différent de get_plan_comptable qui retourne le référentiel global figé.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                classe: { type: 'number', description: 'Classe comptable 1-8' },
                search: { type: 'string', description: 'Recherche numéro ou intitulé' },
                include_archived: { type: 'boolean', description: 'Inclure comptes archivés. Défaut false.' },
                parent: { type: 'string', description: 'Numéro parent pour lister les sous-comptes (ex: 4511)' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'initialize_pcm',
        description: 'Initialise le PCM d\'une société en appliquant le template CORE Maurice + modules optionnels (module_gbc1, module_holding, module_b2b_tech, module_health_clinic). Idempotent : ré-appel ne crée pas de doublon. MODIFICATION — retourne requires_confirmation au 1er appel, exécute avec confirmation_token.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                template_code: { type: 'string', description: 'Template CORE. Défaut core_maurice.' },
                modules: { type: 'array', items: { type: 'string' }, description: 'Modules à activer.' },
                confirmation_token: { type: 'string', description: 'Token retourné au 1er appel pour confirmer.' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'create_compte_pcm',
        description: 'Crée un compte dans le PCM d\'une société. MODIFICATION — retourne requires_confirmation au 1er appel, exécute avec confirmation_token. Sous-comptes via pattern 4511.OCC (le parent 4511 doit exister).',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                numero: { type: 'string', description: 'Numéro (ex: 4511.OCC). Doit commencer par le chiffre de sa classe.' },
                intitule: { type: 'string' },
                classe: { type: 'number', description: '1-8' },
                type: { type: 'string', enum: ['actif', 'passif', 'charge', 'produit', 'mixte', 'tresorerie'] },
                nature: { type: 'string' },
                sens_normal: { type: 'string', enum: ['debit', 'credit', 'mixte'] },
                lettrable: { type: 'boolean' },
                tags: { type: 'array', items: { type: 'string' } },
                confirmation_token: { type: 'string' },
            },
            required: ['societe_id', 'numero', 'intitule', 'classe', 'type'],
        },
    },
    {
        name: 'archive_compte_pcm',
        description: 'Archive un compte PCM (jamais de suppression). Si le compte a des écritures, fournir target_compte pour reclasser automatiquement les écritures vers le compte cible avant archivage. MODIFICATION — retourne requires_confirmation au 1er appel.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                numero: { type: 'string', description: 'Numéro du compte à archiver' },
                reason: { type: 'string', description: 'Justification métier' },
                target_compte: { type: 'string', description: 'Compte de reclassement si écritures présentes' },
                confirmation_token: { type: 'string' },
            },
            required: ['societe_id', 'numero', 'reason'],
        },
    },
    {
        name: 'audit_pcm',
        description: 'Audite la conformité du PCM d\'une société. Retourne errors (comptes obligatoires manquants, écritures sur comptes archivés ou hors PCM), warnings (sous-comptes orphelins), suggestions (comptes inutilisés), et stats. Lecture seule.',
        inputSchema: {
            type: 'object',
            properties: { societe_id: { type: 'string' } },
            required: ['societe_id'],
        },
    },
    {
        name: 'list_modules_actifs',
        description: 'Liste les modules PCM actuellement activés sur une société (template_code, version, date activation).',
        inputSchema: {
            type: 'object',
            properties: { societe_id: { type: 'string' } },
            required: ['societe_id'],
        },
    },
    {
        name: 'activate_module',
        description: 'Active un module PCM sur une société (module_gbc1, module_holding, module_b2b_tech, module_health_clinic). Vérifie les prérequis (core_maurice requis). Idempotent. MODIFICATION — confirmation 2-step.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                module_code: { type: 'string', description: 'module_gbc1 | module_holding | module_b2b_tech | module_health_clinic' },
                confirmation_token: { type: 'string' },
            },
            required: ['societe_id', 'module_code'],
        },
    },
    // ============================================================
    // v0.8.0 — Grand Livre éditable
    // ============================================================
    {
        name: 'list_grand_livre',
        description: 'Liste les écritures du grand livre d\'une société. Filtres : compte, date_debut, date_fin, journal, lettre, unlettered_only. Retourne aussi les totaux débit/crédit.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                compte: { type: 'string', description: 'Numéro de compte PCM' },
                date_debut: { type: 'string', description: 'YYYY-MM-DD' },
                date_fin: { type: 'string', description: 'YYYY-MM-DD' },
                journal: { type: 'string', description: 'Code journal (OD, BNQ, VTE, ACH, OD-PAIE...)' },
                lettre: { type: 'string', description: 'Code de lettrage' },
                unlettered_only: { type: 'boolean', description: 'Seulement les écritures non lettrées' },
                limit: { type: 'number', description: 'Max 1000. Défaut 200.' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'get_balance_grand_livre',
        description: 'Balance des comptes du grand livre (débit/crédit/solde par compte) sur une période, optionnellement filtrée par classe. Vérifie l\'équilibre global.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                date_debut: { type: 'string' },
                date_fin: { type: 'string' },
                classe: { type: 'string', description: 'Classe 1-8' },
            },
            required: ['societe_id'],
        },
    },
    {
        name: 'create_journal_entry',
        description: 'Crée une écriture comptable équilibrée (somme débits = somme crédits). MODIFICATION — confirmation 2-step. Les comptes doivent exister dans le PCM de la société.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                date_ecriture: { type: 'string', description: 'YYYY-MM-DD' },
                journal: { type: 'string', description: 'Code journal. Défaut OD.' },
                numero_piece: { type: 'string' },
                libelle: { type: 'string' },
                lignes: {
                    type: 'array',
                    description: 'Lignes [{compte, debit, credit, libelle?}]. Au moins 2, équilibrées.',
                    items: {
                        type: 'object',
                        properties: {
                            compte: { type: 'string' },
                            debit: { type: 'number' },
                            credit: { type: 'number' },
                            libelle: { type: 'string' },
                        },
                    },
                },
                confirmation_token: { type: 'string' },
            },
            required: ['societe_id', 'date_ecriture', 'libelle', 'lignes'],
        },
    },
    {
        name: 'reclass_ecritures',
        description: 'Reclasse les écritures d\'un compte vers un autre. TOUJOURS faire un dry_run=true d\'abord pour prévisualiser (nb écritures, totaux, échantillon), puis dry_run=false pour exécuter. Filtre optionnel par dates, journal, libellé.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                from_compte: { type: 'string' },
                to_compte: { type: 'string' },
                filter: {
                    type: 'object',
                    properties: {
                        date_debut: { type: 'string' },
                        date_fin: { type: 'string' },
                        libelle_contains: { type: 'string' },
                        journal: { type: 'string' },
                    },
                },
                dry_run: { type: 'boolean', description: 'true = preview (défaut), false = exécute' },
                reason: { type: 'string', description: 'Justification métier (requis)' },
            },
            required: ['societe_id', 'from_compte', 'to_compte', 'reason'],
        },
    },
    {
        name: 'lettrer_ecritures',
        description: 'Lettre un ensemble d\'écritures avec un code commun. Vérifie l\'équilibre (débit=crédit) sauf si force_desequilibre. MODIFICATION — confirmation 2-step.',
        inputSchema: {
            type: 'object',
            properties: {
                societe_id: { type: 'string' },
                ecritures_ids: { type: 'array', items: { type: 'string' }, description: 'UUIDs des écritures (≥2)' },
                code_lettre: { type: 'string', description: 'Code lettrage. Auto-généré si absent.' },
                force_desequilibre: { type: 'boolean' },
                confirmation_token: { type: 'string' },
            },
            required: ['societe_id', 'ecritures_ids'],
        },
    },
];
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args || {});
    try {
        switch (name) {
            case 'list_societes': {
                const data = await lexoraFetch('/api/client/societes');
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_financial_summary': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.exercice)
                    params.set('exercice', String(a.exercice));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                const data = await lexoraFetch(`/api/client/financial?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_factures': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.type_facture)
                    params.set('type', String(a.type_facture));
                if (a.statut)
                    params.set('statut', String(a.statut));
                if (a.limit)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/client/factures?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_alertes': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                const data = await lexoraFetch(`/api/client/alertes?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_releves_bancaires': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.periode)
                    params.set('periode', String(a.periode));
                if (a.compte_id)
                    params.set('compte_id', String(a.compte_id));
                const data = await lexoraFetch(`/api/client/releves-bancaires?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_taux_change': {
                const data = await lexoraFetch('/api/taux-change');
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_transactions_bancaires': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.compte_id)
                    params.set('compte_id', String(a.compte_id));
                if (a.periode)
                    params.set('periode', String(a.periode));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.statut)
                    params.set('statut', String(a.statut));
                if (a.min_montant !== undefined)
                    params.set('min_montant', String(a.min_montant));
                if (a.max_montant !== undefined)
                    params.set('max_montant', String(a.max_montant));
                if (a.libelle)
                    params.set('libelle', String(a.libelle));
                if (a.limit !== undefined)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/mcp/transactions-bancaires?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            // ============================================================
            // v0.5.0 — 14 nouveaux outils comptables / RH / banque
            // ============================================================
            case 'list_comptes_bancaires': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                const data = await lexoraFetch(`/api/client/comptes-bancaires?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_factures_clients': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                params.set('type_facture', 'client');
                if (a.statut)
                    params.set('statut', String(a.statut));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.limit)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/client/factures?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_factures_fournisseurs': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                params.set('type_facture', 'fournisseur');
                if (a.statut)
                    params.set('statut', String(a.statut));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.limit)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/client/factures?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_devis': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                params.set('type_document', 'devis');
                if (a.statut)
                    params.set('statut', String(a.statut));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.limit)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/client/factures?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_avoirs': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                params.set('type_document', 'avoir');
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.limit)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/client/factures?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_ecritures': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.journal)
                    params.set('journal', String(a.journal));
                if (a.compte)
                    params.set('compte', String(a.compte));
                if (a.mois)
                    params.set('mois', String(a.mois));
                if (a.limit)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/client/ecritures?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_grand_livre': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.compte_debut)
                    params.set('compte_debut', String(a.compte_debut));
                if (a.compte_fin)
                    params.set('compte_fin', String(a.compte_fin));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.journal)
                    params.set('journal', String(a.journal));
                if (a.exercice)
                    params.set('exercice', String(a.exercice));
                if (a.page !== undefined)
                    params.set('page', String(a.page));
                if (a.limit !== undefined)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/comptable/grand-livre?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_rapprochement_status': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                const data = await lexoraFetch(`/api/comptable/rapprochement/kpis?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_tiers': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.q)
                    params.set('q', String(a.q));
                if (a.include_inactifs)
                    params.set('include_inactifs', '1');
                const data = await lexoraFetch(`/api/client/factures-contacts?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_documents': {
                const data = await lexoraFetch('/api/client/documents');
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_employes': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.statut)
                    params.set('statut', String(a.statut));
                if (a.search)
                    params.set('search', String(a.search));
                const data = await lexoraFetch(`/api/rh/employes?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_bulletins_paie': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.periode)
                    params.set('periode', String(a.periode));
                if (a.employe_id)
                    params.set('employe_id', String(a.employe_id));
                if (a.include_archived)
                    params.set('include_archived', 'true');
                const data = await lexoraFetch(`/api/rh/paie?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_plan_comptable': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                const data = await lexoraFetch(`/api/client/plan-comptable?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_lettrage_non_lettrees': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                const data = await lexoraFetch(`/api/comptable/lettrage?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
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
                });
                // Agrégation simple côté client : group by numero_compte
                const rows = data.rows || [];
                const acc = new Map();
                for (const r of rows) {
                    const k = r.numero_compte;
                    if (!acc.has(k))
                        acc.set(k, { numero_compte: k, nom_compte: r.nom_compte, debit: 0, credit: 0 });
                    acc.get(k).debit += +r.debit_mur || 0;
                    acc.get(k).credit += +r.credit_mur || 0;
                }
                const balance = [...acc.values()]
                    .map(b => ({ ...b, solde: +(b.debit - b.credit).toFixed(2) }))
                    .sort((a, b) => a.numero_compte.localeCompare(b.numero_compte));
                return { content: [{ type: 'text', text: JSON.stringify({ balance, truncated: data.truncated }, null, 2) }] };
            }
            case 'get_bilan': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.exercice)
                    params.set('exercice', String(a.exercice));
                if (a.date_arrete)
                    params.set('date_arrete', String(a.date_arrete));
                const data = await lexoraFetch(`/api/comptable/etats-financiers?type=bilan&${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_compte_resultat': {
                const params = new URLSearchParams();
                if (a.societe_id)
                    params.set('societe_id', String(a.societe_id));
                if (a.exercice)
                    params.set('exercice', String(a.exercice));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                const data = await lexoraFetch(`/api/comptable/etats-financiers?type=compte_resultat&${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_exercices': {
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({ table: 'exercices', societe_id: a.societe_id, limit: 50 }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_conges': {
                const filters = {};
                if (a.employe_id)
                    filters.employe_id = a.employe_id;
                if (a.statut)
                    filters.statut = a.statut;
                if (a.type)
                    filters.type = a.type;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({
                        table: 'conges', societe_id: a.societe_id,
                        filters,
                        filters_gte: a.date_debut ? { date_debut: a.date_debut } : undefined,
                        filters_lte: a.date_fin ? { date_fin: a.date_fin } : undefined,
                        limit: 200,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_pointages': {
                const filters = {};
                if (a.employe_id)
                    filters.employe_id = a.employe_id;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({
                        table: 'pointages', societe_id: a.societe_id,
                        filters,
                        filters_gte: a.date_debut ? { date_pointage: a.date_debut } : undefined,
                        filters_lte: a.date_fin ? { date_pointage: a.date_fin } : undefined,
                        limit: 500,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_heures_sup': {
                const filters = {};
                if (a.employe_id)
                    filters.employe_id = a.employe_id;
                if (a.periode)
                    filters.periode = a.periode;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({ table: 'heures_sup', societe_id: a.societe_id, filters, limit: 300 }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_contrats': {
                const filters = {};
                if (a.employe_id)
                    filters.employe_id = a.employe_id;
                if (a.actif_seulement)
                    filters.actif = true;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({ table: 'contrats', societe_id: a.societe_id, filters, limit: 200 }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_paiements': {
                const filters = {};
                if (a.facture_id)
                    filters.facture_id = a.facture_id;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({
                        table: 'factures_paiements', societe_id: a.societe_id,
                        filters,
                        filters_gte: a.date_debut ? { date_paiement: a.date_debut } : undefined,
                        filters_lte: a.date_fin ? { date_paiement: a.date_fin } : undefined,
                        limit: 300,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_comptes_courants_associes': {
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({ table: 'comptes_courants_associes', societe_id: a.societe_id, limit: 100 }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_comptes_paiement_tiers': {
                const filters = {};
                if (typeof a.actif === 'boolean')
                    filters.actif = a.actif;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({ table: 'comptes_paiement_tiers', societe_id: a.societe_id, filters, limit: 100 }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_declarations_mra': {
                const filters = {};
                if (a.type_declaration)
                    filters.type_declaration = a.type_declaration;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({
                        table: 'declarations_mra', societe_id: a.societe_id,
                        filters,
                        filters_gte: a.date_debut ? { periode: a.date_debut } : undefined,
                        filters_lte: a.date_fin ? { periode: a.date_fin } : undefined,
                        limit: 100,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_audit_log': {
                const filters = {};
                if (a.action)
                    filters.action = a.action;
                if (a.user_id)
                    filters.user_id = a.user_id;
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify({
                        table: 'rapprochement_audit_log', societe_id: a.societe_id,
                        filters,
                        filters_gte: a.date_debut ? { created_at: a.date_debut } : undefined,
                        filters_lte: a.date_fin ? { created_at: a.date_fin } : undefined,
                        limit: Number(a.limit) || 100,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            // ─── Outil générique ─────────────────────────────────────────────
            case 'query_lexora': {
                const data = await lexoraFetch('/api/mcp/query', {
                    method: 'POST',
                    body: JSON.stringify(a),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_mcp_tables': {
                const data = await lexoraFetch('/api/mcp/query', { method: 'GET' });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            // ─── v0.7.0 — PCM éditable ───────────────────────────────────────
            case 'list_comptes_pcm': {
                const params = new URLSearchParams();
                if (a.classe !== undefined)
                    params.set('classe', String(a.classe));
                if (a.search)
                    params.set('search', String(a.search));
                if (a.include_archived)
                    params.set('include_archived', 'true');
                if (a.parent)
                    params.set('parent', String(a.parent));
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/pcm/comptes?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'initialize_pcm': {
                const guard = confirmGuard('initialize_pcm', a, `Initialiser PCM société ${a.societe_id} : template ${a.template_code || 'core_maurice'} + modules [${a.modules?.join(', ') || 'aucun'}]`);
                if (!guard.confirmed)
                    return guard.response;
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/pcm/initialize`, {
                    method: 'POST',
                    body: JSON.stringify({
                        template_code: a.template_code || 'core_maurice',
                        modules: a.modules || [],
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'create_compte_pcm': {
                const guard = confirmGuard('create_compte_pcm', a, `Créer compte ${a.numero} "${a.intitule}" (classe ${a.classe}, ${a.type}) pour société ${a.societe_id}`);
                if (!guard.confirmed)
                    return guard.response;
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/pcm/comptes`, {
                    method: 'POST',
                    body: JSON.stringify({
                        numero: a.numero, intitule: a.intitule, classe: a.classe, type: a.type,
                        nature: a.nature, sens_normal: a.sens_normal, lettrable: a.lettrable, tags: a.tags,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'archive_compte_pcm': {
                const guard = confirmGuard('archive_compte_pcm', a, `Archiver compte ${a.numero} société ${a.societe_id}${a.target_compte ? ` + reclasser écritures vers ${a.target_compte}` : ''}`);
                if (!guard.confirmed)
                    return guard.response;
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/pcm/comptes/${encodeURIComponent(String(a.numero))}/archive`, {
                    method: 'POST',
                    body: JSON.stringify({ reason: a.reason, target_compte: a.target_compte }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'audit_pcm': {
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/pcm/audit`, { method: 'POST', body: JSON.stringify({}) });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_modules_actifs': {
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/pcm/modules/activate`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'activate_module': {
                const guard = confirmGuard('activate_module', a, `Activer module ${a.module_code} sur société ${a.societe_id}`);
                if (!guard.confirmed)
                    return guard.response;
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/pcm/modules/activate`, { method: 'POST', body: JSON.stringify({ module_code: a.module_code }) });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            // ─── v0.8.0 — Grand Livre éditable ───────────────────────────────
            case 'list_grand_livre': {
                const params = new URLSearchParams();
                if (a.compte)
                    params.set('compte', String(a.compte));
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.journal)
                    params.set('journal', String(a.journal));
                if (a.lettre)
                    params.set('lettre', String(a.lettre));
                if (a.unlettered_only)
                    params.set('unlettered_only', 'true');
                if (a.limit !== undefined)
                    params.set('limit', String(a.limit));
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/grand-livre?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_balance_grand_livre': {
                const params = new URLSearchParams();
                if (a.date_debut)
                    params.set('date_debut', String(a.date_debut));
                if (a.date_fin)
                    params.set('date_fin', String(a.date_fin));
                if (a.classe)
                    params.set('classe', String(a.classe));
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/grand-livre/balance?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'create_journal_entry': {
                const guard = confirmGuard('create_journal_entry', a, `Créer écriture ${a.journal || 'OD'} "${a.libelle}" (${a.lignes?.length || 0} lignes) société ${a.societe_id}`);
                if (!guard.confirmed)
                    return guard.response;
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/grand-livre`, {
                    method: 'POST',
                    body: JSON.stringify({
                        date_ecriture: a.date_ecriture, journal: a.journal, numero_piece: a.numero_piece,
                        libelle: a.libelle, lignes: a.lignes,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'reclass_ecritures': {
                // dry_run par défaut true. Si dry_run explicitement false → confirmation.
                const isExecute = a.dry_run === false;
                if (isExecute) {
                    const guard = confirmGuard('reclass_ecritures', a, `EXÉCUTER reclassement ${a.from_compte} → ${a.to_compte} société ${a.societe_id}`);
                    if (!guard.confirmed)
                        return guard.response;
                }
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/grand-livre/reclass`, {
                    method: 'POST',
                    body: JSON.stringify({
                        from_compte: a.from_compte, to_compte: a.to_compte,
                        filter: a.filter, dry_run: a.dry_run !== false, reason: a.reason,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'lettrer_ecritures': {
                const guard = confirmGuard('lettrer_ecritures', a, `Lettrer ${a.ecritures_ids?.length || 0} écritures société ${a.societe_id}`);
                if (!guard.confirmed)
                    return guard.response;
                const data = await lexoraFetch(`/api/societes/${encodeURIComponent(String(a.societe_id))}/grand-livre/lettrage`, {
                    method: 'POST',
                    body: JSON.stringify({
                        ecritures_ids: a.ecritures_ids, code_lettre: a.code_lettre,
                        force_desequilibre: a.force_desequilibre,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            default:
                return {
                    content: [{ type: 'text', text: `Outil inconnu : ${name}` }],
                    isError: true,
                };
        }
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            content: [{ type: 'text', text: `Erreur : ${msg}` }],
            isError: true,
        };
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[lexora-mcp] Server started (v0.5.0) — ${TOOLS.length} tools: ` +
    TOOLS.map(t => t.name).join(', '));
