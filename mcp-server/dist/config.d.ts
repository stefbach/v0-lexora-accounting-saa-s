/**
 * Validation de la configuration d'environnement du MCP Lexora.
 *
 * Cas réel observé : la clé API ("lex_...") collée dans LEXORA_API_URL.
 * Sans validation, chaque appel construit une URL du type
 * "lex_xxx/api/client/societes" et échoue avec une erreur de parsing
 * opaque. On échoue donc au démarrage avec un message actionnable.
 */
export interface LexoraConfig {
    apiUrl: string;
    apiKey: string;
}
export type ConfigResult = {
    ok: true;
    config: LexoraConfig;
} | {
    ok: false;
    errors: string[];
};
export declare function resolveLexoraConfig(env: Record<string, string | undefined>): ConfigResult;
