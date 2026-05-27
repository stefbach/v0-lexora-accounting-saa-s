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
export {};
