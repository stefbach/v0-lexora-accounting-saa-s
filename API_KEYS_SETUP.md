# 🔑 Setup Système de Clés API pour MCP Lexora

Ce guide t'explique comment initialiser et utiliser le nouveau système de génération de clés API pour intégrer Lexora avec Claude Desktop (MCP).

## ✅ Qu'a été créé

### 1. **Base de données** (`supabase/migrations/011_api_keys_management.sql`)
- Table `api_keys` — stockage sécurisé des clés hashées
- Table `api_keys_audit` — piste d'audit immuable
- RLS policies — isolation des données par utilisateur
- Fonctions utilitaires (hash, preview, validation)

### 2. **Endpoints API**
| Route | Méthode | Fonction |
|-------|---------|----------|
| `/api/auth/api-keys` | GET | Lister tes clés API |
| `/api/auth/api-keys` | POST | Créer une nouvelle clé |
| `/api/auth/api-keys/[id]` | DELETE | Révoquer une clé |
| `/api/auth/api-keys/[id]` | PATCH | Modifier une clé (nom, description) |
| `/api/auth/validate-api-key` | POST | Valider une clé (utilisé par MCP) |

### 3. **UI Interfaces**
| Page | URL | Accès | Fonction |
|------|-----|-------|----------|
| **Admin** | `/admin/api-keys` | Admin/tech | Gestion centralisée |
| **Client** | `/client/api-keys` | Tout utilisateur | Autogestion des clés |

### 4. **Middleware MCP**
- `mcp-server/src/auth-middleware.ts` — validation des clés
- Contrôle granulaire des scopes (read, write)
- Logging de chaque utilisation

---

## 🚀 Étapes d'initialisation

### 1️⃣ Appliquer la migration Supabase

```bash
# Via la CLI Supabase locale
supabase migration up

# OU via l'outil MCP (depuis la session Claude)
# L'appel se fera automatiquement via apply_migration
```

### 2️⃣ Redéployer sur Vercel

```bash
git add -A
git commit -m "feat: API keys management system for MCP"
git push origin claude/rotate-supabase-keys-YPd5x
```

Vercel va auto-déployer et appliquer les migrations.

### 3️⃣ Créer ta première clé API

#### Option A: Via l'UI Admin
1. Va sur `https://your-lexora-instance.com/admin/api-keys`
2. Clique sur "Créer une clé"
3. Donne un nom (ex: "Claude Desktop MCP")
4. **⚠️ Copie la clé immédiatement** — elle ne sera pas réaffichée

#### Option B: Via l'UI Client
1. Va sur `https://your-lexora-instance.com/client/api-keys`
2. Même process

#### Option C: Via API (CLI)
```bash
curl -X POST https://your-lexora-instance.com/api/auth/api-keys \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Claude Desktop",
    "description": "For MCP integration"
  }'
```

---

## 🔧 Connecter Claude Desktop

### Étape 1: Trouver le fichier de config

| OS | Chemin |
|----|--------|
| **Mac** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

### Étape 2: Éditer la config

Ajoute ce bloc (ou remplace le bloc existant `"lexora"`):

```json
{
  "mcpServers": {
    "lexora": {
      "command": "node",
      "args": [
        "/CHEMIN/ABSOLU/vers/v0-lexora-accounting-saa-s/mcp-server/dist/index.js"
      ],
      "env": {
        "LEXORA_API_URL": "https://your-lexora-instance.com",
        "LEXORA_API_KEY": "sk_live_xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

**Remplace:**
- `/CHEMIN/ABSOLU/...` par le chemin réel sur ta machine
- `sk_live_...` par ta clé créée à l'étape 3️⃣

### Étape 3: Redémarrer Claude Desktop

Quitter complètement (Cmd+Q / Ctrl+Q), puis relancer.

Vérifie que tu vois une icône 🔌 en bas à droite du chat Claude — c'est le signe que le MCP est connecté.

---

## 💬 Utiliser Lexora dans Claude

Voici quelques exemples de questions que tu peux poser à Claude:

### Comptabilité
```
"Quel est le solde du compte 411 (clients) pour TIBOK au 31 mai ?"
→ Claude appelle list_societes + get_balance

"Génère le bilan comparatif 2024 vs 2023 pour OCC"
→ Claude appelle generate_financial_statement avec comparativePeriod=true

"Passe l'écriture de provisions pour congés de 150k MUR"
→ Claude appelle post_journal_entry avec workflow d'approbation
```

### RH / Paie
```
"Calcule un bulletin pour Jean Dupont, salaire 600k MUR, Mauritius, 3 enfants"
→ Claude appelle calculate_payslip automatiquement

"Liste tous les employés actifs de TIBOK"
→ Claude appelle list_employees
```

### Devises
```
"Quel est le taux EUR → MUR aujourd'hui ?"
→ Claude appelle get_forex_rate

"Convertis 10 000 USD en MUR au cours d'aujourd'hui"
→ Claude enchaîne get_forex_rate + calcul
```

---

## 🔒 Sécurité

### Bonnes pratiques
1. **Ne partage JAMAIS ta clé API** — elle est aussi puissante qu'un mot de passe
2. **Révoque les clés inutilisées** via `/admin/api-keys` ou `/client/api-keys`
3. **Monitore l'usage** — chaque clé enregistre `last_used_at` et l'audit trail
4. **Rotate régulièrement** — crée une nouvelle clé, supprime l'ancienne

### Ce que la clé API permet
- Lire les comptes, les employés, les factures
- Poster des écritures comptables (avec workflow d'approbation)
- Calculer les bulletins
- Récupérer les états financiers

### Ce que la clé API NE permet PAS
- Accéder aux mots de passe
- Contourner le workflow d'approbation
- Modifier les paramètres système
- Supprimer les données

---

## 📝 Structure de la clé

Les clés Lexora ont le format: `sk_live_<32 hex chars>`

Exemple: `sk_live_a7f3d8e2c5b9f1a4d7e6c3b8a9f2d1e0`

### Métadonnées stockées (hashées)
```sql
- id: UUID unique
- user_id: Qui l'a créée
- key_hash: SHA256 de la clé (jamais la clé en clair)
- key_preview: "sk_live_..." visible en UI
- created_at: Quand
- last_used_at: Dernière utilisation
- expires_at: (optionnel) Date d'expiration
- scopes: Permissions granulaires (read, write, etc)
- is_active: true/false
```

---

## 🛠️ Dépannage

### La clé ne fonctionne pas
```bash
# Vérifie que:
1. La clé commence par sk_live_
2. Elle n'a pas expiré (check expires_at)
3. Elle est marquée is_active=true
4. LEXORA_API_URL est correct en config Claude

# Debug en CLI:
curl -X POST https://your-lexora.com/api/auth/validate-api-key \
  -H "Content-Type: application/json" \
  -d '{"key":"sk_live_..."}'

# Doit retourner: {"valid":true, "user_id":"...", "scopes":[...]}
```

### Le MCP n'apparaît pas en bas à droite de Claude
```bash
# 1. Vérifier la config JSON (pas de typos)
cat ~/.config/Claude/claude_desktop_config.json

# 2. Redémarrer Claude Desktop complètement
# (Cmd+Q / Ctrl+Q, pas juste fermer l'onglet)

# 3. Vérifier que le chemin vers mcp-server/dist/index.js existe
ls /chemin/vers/mcp-server/dist/index.js

# 4. Vérifier que la clé API est valide
# (elle doit passer la validation ci-dessus)
```

---

## 📚 Références

- **Lexora MCP Docs** → `mcp-server/README.md`
- **API Keys Schema** → `supabase/migrations/011_api_keys_management.sql`
- **Admin UI** → `app/admin/api-keys/page.tsx`
- **Client UI** → `app/client/api-keys/page.tsx`
- **Endpoints** → `app/api/auth/api-keys/`

---

## ✨ Prochaines étapes

- [ ] Créer une clé API
- [ ] Configurer Claude Desktop
- [ ] Tester une requête simple ("Quel est le solde du compte 411 ?")
- [ ] Monitorer l'audit trail en BD
- [ ] Envisager la rotation des clés (créer nouvelle, supprimer ancienne)

C'est bon ! 🚀
