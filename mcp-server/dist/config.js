/**
 * Validation de la configuration d'environnement du MCP Lexora.
 *
 * Cas réel observé : la clé API ("lex_...") collée dans LEXORA_API_URL.
 * Sans validation, chaque appel construit une URL du type
 * "lex_xxx/api/client/societes" et échoue avec une erreur de parsing
 * opaque. On échoue donc au démarrage avec un message actionnable.
 */
const HELP_KEY = 'Génère-en une depuis Lexora → Direction → Connecter à Claude Desktop';
export function resolveLexoraConfig(env) {
    const rawUrl = (env.LEXORA_API_URL ?? '').trim();
    const apiKey = (env.LEXORA_API_KEY ?? '').trim();
    const errors = [];
    if (!apiKey) {
        errors.push(`LEXORA_API_KEY est requis dans l'env (format "lex_..."). ${HELP_KEY}`);
    }
    else if (!apiKey.startsWith('lex_')) {
        errors.push(/^https?:\/\//i.test(apiKey)
            ? 'LEXORA_API_KEY contient une URL : LEXORA_API_URL et LEXORA_API_KEY semblent inversées dans la config du connecteur'
            : `LEXORA_API_KEY doit commencer par "lex_" — clé invalide. ${HELP_KEY}`);
    }
    let apiUrl = 'http://localhost:3000';
    if (rawUrl.startsWith('lex_')) {
        errors.push('LEXORA_API_URL contient une clé API ("lex_...") au lieu d\'une adresse. ' +
            'Mets l\'URL de ton instance (ex: https://lexora.vercel.app) dans LEXORA_API_URL ' +
            'et la clé dans LEXORA_API_KEY');
    }
    else if (rawUrl) {
        let parsed = null;
        try {
            parsed = new URL(rawUrl);
        }
        catch {
            parsed = null;
        }
        if (!parsed || (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')) {
            errors.push(`LEXORA_API_URL invalide ("${rawUrl}") — attendu une URL http(s), ex: https://lexora.vercel.app`);
        }
        else {
            apiUrl = rawUrl.replace(/\/+$/, '');
        }
    }
    return errors.length ? { ok: false, errors } : { ok: true, config: { apiUrl, apiKey } };
}
