# 🤖 Lexora Telegram Bot — Setup Guide

> Intégration Telegram multi-tenant (1 bot, N sociétés) avec AI Agent Claude Sonnet 4.6 via n8n.

## Pré-requis

- ✅ Lexora déployé (Vercel) avec accès à Supabase
- ✅ Une instance n8n accessible (self-host ou n8n Cloud) — minimum v1.50+
- ✅ Un compte Anthropic (API key Claude)
- ✅ Un compte Telegram

## Étape 1 — Créer le bot Telegram

1. Ouvre Telegram, cherche **@BotFather**
2. Tape `/newbot`
3. Choisis un nom (ex: "Lexora Assistant") et un username (ex: `LexoraBot`)
4. BotFather te donne un **token** (ex: `8123456789:AAH...`). **Sauvegarde-le.**
5. Tape `/setdescription`, sélectionne ton bot, puis colle :
   > Assistant IA Lexora — pilote ta compta, ta paie, ton OCR et tes échéances MRA depuis Telegram. Tape /start CODE pour te connecter.
6. Tape `/setcommands`, sélectionne ton bot, colle :
   ```
   start - Lier ton compte Lexora avec un code
   societe - Changer de société active
   help - Liste des commandes et exemples
   logout - Délier le compte
   ```
7. (Optionnel) `/setuserpic` pour le logo Lexora.

## Étape 2 — Appliquer la migration Supabase

```bash
psql "$DATABASE_URL" -f supabase/migrations/262_telegram_bot.sql
```

Vérifications :

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'telegram%';
-- → telegram_users, telegram_sessions, telegram_actions, telegram_alerts_config

SELECT count(*) FROM telegram_alerts_config;
-- → autant que de sociétés (seed inséré)
```

## Étape 3 — Variables d'environnement Vercel/Lexora

Ajoute dans Vercel (Settings → Environment Variables) :

| Variable | Valeur | Notes |
|----------|--------|-------|
| `TELEGRAM_BOT_TOKEN` | `8123...AAH...` | Token BotFather |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | `LexoraBot` | Sans `@` |
| `TELEGRAM_WEBHOOK_SECRET` | (genère 32 chars random) | `openssl rand -hex 32` |
| `INTERNAL_API_TOKEN` | (génère 32 chars random) | Auth interne entre n8n et /api/telegram/send et /cron-alerts |
| `N8N_TELEGRAM_AGENT_WEBHOOK` | `https://n8n.tonsite.com/webhook/lexora-telegram-agent` | URL du webhook n8n |

Redéploie après ajout.

## Étape 4 — Configurer le webhook Telegram

Telegram doit envoyer les updates à `/api/telegram/webhook`. Exécute une fois :

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://lexora.finance/api/telegram/webhook",
    "secret_token": "'$TELEGRAM_WEBHOOK_SECRET'",
    "allowed_updates": ["message", "callback_query", "edited_message"]
  }'
```

Vérification : `curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"`

## Étape 5 — Importer le workflow n8n

1. Dans ton n8n, **Workflows → Import from File** → choisir `docs/n8n/lexora-telegram-bot.json`
2. Configurer les **credentials** dans n8n :
   - **Anthropic API** : ta clé sk-ant-…
   - **Supabase Postgres** : host/port/db/user/password (utilise le pooler Supabase, port 6543)
   - **Header Auth** (générique pour les tools HTTP) : header `X-Internal-Token: <INTERNAL_API_TOKEN>`
3. Configurer les **variables d'environnement n8n** (Settings → Variables) :
   - `LEXORA_API_BASE` = `https://lexora.finance`
   - `TELEGRAM_BOT_TOKEN` = même que Vercel
4. Charge le system prompt :
   - Soit copie le contenu de `docs/telegram/SYSTEM_PROMPT.md` dans un node **Set** en remplaçant le node "Load System Prompt"
   - Soit monte le fichier en volume `/data/lexora-system-prompt.md`
5. **Activate** le workflow.
6. L'URL du webhook (Production URL) doit matcher `N8N_TELEGRAM_AGENT_WEBHOOK` dans Vercel.

## Étape 6 — Cron alertes proactives

Ajoute un workflow n8n **Schedule** (toutes les heures) qui appelle :

```
GET https://lexora.finance/api/telegram/cron-alerts
Header: X-Internal-Token: <INTERNAL_API_TOKEN>
```

OU utilise Vercel Cron (recommandé) — dans `vercel.json` :

```json
{
  "crons": [{
    "path": "/api/telegram/cron-alerts",
    "schedule": "0 8,18 * * *"
  }]
}
```
(2× par jour : 08h et 18h Mauritius).

> Note : Vercel Cron n'envoie pas le header `X-Internal-Token`. Pour le rendre opérant, modifie l'endpoint pour accepter aussi le header `User-Agent: vercel-cron/1.0` OU utilise n8n schedule à la place.

## Étape 7 — Test bout-en-bout

1. Connecte-toi à Lexora
2. Va dans **Mon Compte → Telegram Bot**
3. Clique **Générer un code de liaison** → tu obtiens un code (ex: `ABC123`)
4. Ouvre Telegram, va sur ton bot, tape `/start ABC123`
5. Le bot doit répondre "✅ Compte lié à <nom société>"
6. Tape `/help` pour voir toutes les commandes
7. Essaye : "kpis du mois" → le bot doit te répondre avec CA/dépenses

## Étape 8 — Onboarding des clients

Pour qu'une société active la fonctionnalité :
1. Le dirigeant client va dans **Mon Compte → Telegram Bot**
2. Génère un code, lie son compte
3. Active les alertes qu'il veut recevoir (échéances MRA, factures en retard, solde bancaire, etc.)
4. Invite ses employés à faire pareil pour qu'ils puissent poser leurs demandes de congé via Telegram

## Surveillance & audit

Toute action exécutée par le bot est tracée dans `telegram_actions` :

```sql
SELECT created_at, chat_id, intent, status, error_msg
FROM telegram_actions
ORDER BY created_at DESC LIMIT 50;
```

Sessions conversationnelles dans `telegram_sessions` (mémoire IA, 20 derniers messages utilisés à chaque tour).

## Coûts estimés

| Composant | Coût |
|-----------|------|
| Bot Telegram | **Gratuit** |
| n8n self-host | **5-15€/mois** (Hetzner Cloud) |
| Anthropic Claude Sonnet 4.6 | ~**$0.003 par message court**, ~$0.02 pour gros prompt + tools |
| Supabase (existant) | inclus dans abonnement actuel |

À 1000 sociétés × 10 messages/jour : ~$900/mois LLM. Facturer dans un forfait Lexora + ou en option dédiée.

## Sécurité

- Token webhook : `X-Telegram-Bot-Api-Secret-Token` vérifié à chaque update
- Auth interne entre n8n et Lexora : header `X-Internal-Token`
- RLS Supabase : aucune fuite de données entre sociétés possible
- Audit log immuable dans `telegram_actions`
- Code de liaison : 6 chars, valide 15 min, one-shot

## Désactivation d'urgence

```bash
# Désactiver le webhook (le bot ne reçoit plus rien)
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"

# OU désactiver le workflow n8n (Stop button)
```

## Évolutions futures

- [ ] Option B : 1 bot par société (white-label premium)
- [ ] Inline buttons pour Approuver/Refuser congé direct dans Telegram
- [ ] Signature électronique de contrats via lien Telegram
- [ ] OCR par album de photos (batch ingestion factures fournisseurs)
- [ ] Push notifications sur événements Supabase (Realtime → webhook → Telegram)
- [ ] Commande `/kpis` rapide sans LLM (pure SQL)
