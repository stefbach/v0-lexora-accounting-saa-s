# Lexora MCP Server

## Description

Serveur MCP (Model Context Protocol) qui permet à Claude (Desktop, API, ou Code) de piloter directement votre instance Lexora.

Au lieu d'une API REST classique, MCP permet à Claude d'utiliser Lexora comme un outil natif — Claude voit les schémas TypeScript exactement, sans prompts élaborés, pour un pilotage conversationnel naturel de votre comptabilité et RH.

## Installation

```bash
npm install -g @lexora/mcp-server
```

Ou via npx (sans installation globale) :

```bash
npx @lexora/mcp-server
```

## Configuration Claude Desktop

Éditer le fichier de configuration Claude Desktop :

- **Mac** : `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** : `%APPDATA%/Claude/claude_desktop_config.json`
- **Linux** : `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "lexora": {
      "command": "npx",
      "args": ["@lexora/mcp-server"],
      "env": {
        "LEXORA_API_URL": "https://your-lexora-instance.com",
        "LEXORA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Redémarrer Claude Desktop après modification.

## Variables d'Environnement

| Variable | Description | Défaut |
|---|---|---|
| `LEXORA_API_URL` | URL de votre instance Lexora | `http://localhost:3000` |
| `LEXORA_API_KEY` | Clé API Bearer | *(vide)* |

## Outils Disponibles

### Comptabilité

#### `list_societes`
Liste toutes les sociétés accessibles à l'utilisateur courant.

```
Paramètres : aucun
Retour : tableau de sociétés avec id, nom, devise, framework comptable
```

#### `get_balance`
Solde d'un compte comptable pour une période donnée.

```
Paramètres requis : societeId, accountNumber
Paramètres optionnels : startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
Retour : solde débiteur/créditeur en MUR ou devise d'origine
```

#### `get_chart_of_accounts`
Plan comptable complet (PCM Mauritius ou SYSCOHADA).

```
Paramètres optionnels : framework (PCM|SYSCOHADA), classNumber (1-9)
Retour : liste des comptes avec numéro, libellé, classe, type
```

#### `search_journal_entries`
Recherche d'écritures GL avec filtres combinables.

```
Paramètres requis : societeId
Paramètres optionnels : startDate, endDate, accountNumber, journalCode (VTE|ACH|BNQ|SAL|OD), minAmount, maxAmount, limit
Retour : liste d'écritures avec détail des lignes
```

#### `post_journal_entry`
Crée une nouvelle écriture comptable. Passe par le workflow d'approbation Lexora.

```
Paramètres requis : societeId, date, description, journalCode, lines[]
Contrainte : total débit = total crédit (écriture équilibrée)
Retour : id écriture + statut workflow (pending_approval)
```

#### `generate_financial_statement`
Génère les états financiers réglementaires.

```
Paramètres requis : societeId, statementType, periodStart, periodEnd
statementType : balance_sheet | income_statement | cash_flow | tafire | all
Paramètres optionnels : comparativePeriod (boolean, N vs N-1)
Retour : état financier structuré au format PCM/SYSCOHADA
```

### RH & Paie

#### `list_employees`
Liste les employés d'une société.

```
Paramètres requis : societeId
Paramètres optionnels : active (boolean)
Retour : liste employés avec id, nom, poste, salaire brut, juridiction
```

#### `calculate_payslip`
Calcule un bulletin de paie en mode preview (ne sauvegarde pas).

```
Paramètres requis : jurisdictionCode (MU|SN|CI...), employeeId, grossSalary
Paramètres optionnels : bonuses, familyDependents, period {year, month}
Retour : décomposition brut→net (PAYE, NSF, CSG, cotisations patronales)
```

### Commercial

#### `search_invoices`
Recherche de factures avec filtres.

```
Paramètres requis : societeId
Paramètres optionnels : status (draft|sent|paid|overdue|cancelled), customerId, startDate, endDate
Retour : liste factures avec montant, client, échéance, statut
```

### Devises

#### `get_forex_rate`
Taux de change temps réel ou historique.

```
Paramètres requis : base (ex: EUR), quote (ex: MUR)
Paramètres optionnels : date (YYYY-MM-DD pour cours historique)
Retour : taux, variation, source
```

### Audit

#### `get_audit_trail`
Piste d'audit immuable pour toute entité.

```
Paramètres requis : entityType (invoice|journal_entry|payslip|employee), entityId
Retour : log chronologique des actions (qui, quoi, quand, depuis quelle IP)
```

## Exemples d'Usage avec Claude

### "Quel est le solde du compte 411 (clients) pour la société TIBOK ?"

Claude enchaîne automatiquement :
1. `list_societes` → trouve l'id de TIBOK
2. `get_balance` avec `accountNumber: "411"` → retourne le solde net

### "Calcule un bulletin pour Jean Dupont, salaire brut 500 000 XOF, Sénégal, 2 enfants"

Claude enchaîne :
1. `list_employees` → trouve l'id de Jean Dupont
2. `calculate_payslip` avec `jurisdictionCode: "SN"`, `grossSalary: 500000`, `familyDependents: 2`
3. Affiche la décomposition complète IRPP, IPRES, CSS

### "Génère le bilan comparatif 2024 vs 2023 pour OCC"

Claude appelle :
1. `list_societes` → trouve OCC
2. `generate_financial_statement` avec `statementType: "balance_sheet"`, `comparativePeriod: true`

### "Passe l'écriture de provisions pour congés payés de 250 000 MUR"

Claude appelle :
1. `post_journal_entry` avec les lignes débit 6619 / crédit 4280 équilibrées
2. Informe que l'écriture est en attente d'approbation

## Sécurité

- **Authentification** : API Key Bearer requise, jamais exposée dans les logs
- **Workflow d'approbation** : toutes les écritures POST passent par validation humaine
- **Audit trail immuable** : chaque appel MCP est tracé (utilisateur, timestamp, payload)
- **Rate limiting** : 100 requêtes/heure par clé API par défaut
- **Read-only par défaut** : seul `post_journal_entry` modifie des données

## Développement Local

```bash
git clone https://github.com/lexora/mcp-server
cd mcp-server
npm install
```

Démarrer en mode dev (hot reload) :

```bash
LEXORA_API_URL=http://localhost:3000 LEXORA_API_KEY=dev-key npm run dev
```

Compiler pour la production :

```bash
npm run build
npm start
```

## Pourquoi MCP plutôt qu'une API REST classique ?

| Critère | API REST | MCP |
|---|---|---|
| Intégration Claude | Prompts manuels | Native, schémas TypeScript |
| Découverte des outils | Documentation PDF | Auto-discovery à la connexion |
| Workflow conversationnel | Limité | Naturel, multi-étapes |
| Appels chaînés | Manuel | Automatique par Claude |
| Sécurité | Token dans prompt | Env vars isolées |

MCP transforme Lexora en co-pilote comptable : Claude comprend exactement quels outils sont disponibles, leurs paramètres, et les enchaîne intelligemment pour répondre aux questions métier.
