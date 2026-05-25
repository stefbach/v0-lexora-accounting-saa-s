# Audit Agent 6 — CLIENT : Facturation + Achats + RH-client + Contrats + Direction

**Périmètre** : 37 URLs sous `/client/*` (facturation, achats, RH côté
client, contrats, paramètres direction).
**Date** : 2026-05-24
**Stack** : Next.js App Router 15, TypeScript, Supabase, `@react-pdf/renderer`,
Anthropic SDK (`@anthropic-ai/sdk`), n8n (OCR).

---

## Vue d'ensemble

| Catégorie | URLs | Note moyenne |
|---|---|---|
| Facturation/ventes (10) | majoritairement aboutie | 8.0/10 |
| Achats (3) | OK, fournisseurs = redirect | 7.7/10 |
| RH client (14) | 4 wrappers, paramètres-rh non persisté | 6.6/10 |
| Contrats / docs (5) | wrappers vers `/comptable/contrats`, IA branchée | 7.6/10 |
| Direction (7) | identifiants chiffrés AES-256-GCM | 8.4/10 |

**Note globale moyenne (37 URLs) : 7.5/10**

---

## Facturation / ventes (10)

### `/client/factures` — `app/client/factures/page.tsx` (763 l.)
Vue agrégée client + fournisseur via `/api/client/financial?societe_id=`.
Filtres type/statut/recherche, badges MRA, dialog paiement, action
"fiscalise" (POST `/api/client/factures/[id]/fiscalise`). Loading +
empty states OK. Lien préview PDF (`?refresh=1`).
**Note 8.5/10** — utile au quotidien, riche.

### `/client/factures/import` — `app/client/factures/import/page.tsx` (279 l.)
Import CSV/XLSX (parsing custom in-browser), template téléchargeable,
POST `/api/comptable/factures/import-csv`. Validation des colonnes
requises, affichage des lignes en erreur.
**Note 8/10** — fonctionnel, manque export retour d'erreur ligne par
ligne en cas de violation FK Supabase.

### `/client/nouvelle-facture` — `app/client/nouvelle-facture/page.tsx` (1080 l.)
Formulaire classique : tiers, lignes, devise, taux change live
(`/api/taux-change`), template via `/api/client/facture-template`,
catalogue services, contacts, conversion devis → facture. POST/PATCH
`/api/client/factures`. Édition existante via `?id=`.
**Note 8.5/10** — très complet ; le fichier est lourd (1080 lignes),
mériterait split en sous-composants.

### `/client/nouvelle-facture-ia` — `app/client/nouvelle-facture-ia/page.tsx` (407 l.)
Assistant IA factures : `/api/client/factures-ia/{contexte,chat,generer}`.
Backend `lib/factures/ia-assistant.ts` utilise **`@anthropic-ai/sdk`
(claude-sonnet-4-6 + claude-haiku-4-5)** pour extraire les paramètres
et générer le brouillon. Pas un stub.
**Note 9/10** — chaîne IA réelle, contexte société/contacts/catalogue
chargé. Justifié vs page classique : audience non-comptable.

### `/client/facture-preview` — `app/client/facture-preview/page.tsx` (738 l.)
Aperçu PDF via iframe sur `/api/client/factures/[id]/pdf` (route avec
`renderToBuffer` de `@react-pdf/renderer` — 511 l. de code PDF dédié).
Bouton fiscalisation MRA, impression. Hydratation du template + société
+ contact.
**Note 8/10** — fonctionnel, le code aurait gain à factoriser le PDF
dans `lib/factures/`.

### `/client/facture-template` — redirect → `/client/facturation-settings?tab=modeles`
**Note 7/10** — redirect propre, backward compat.

### `/client/facturation-settings` — 1534 l.
Sept onglets : modèles PDF, MRA (URL prod/sandbox, test fiscalisation),
contacts (import existing via API), conditions paiement, settings TVA,
counters facture/devis/avoir. POST `/api/client/facture-template`,
`/api/client/societes`, `/api/client/comptes-bancaires`,
`/api/mra/fiscalise?facture_id=test`. URL hardcodée MRA correcte
(sandbox `sandboxifp.mra.mu/api/v1` / prod `ifp.mra.mu/api/v1`).
**Note 8/10** — page très chargée ; séparer en sous-routes améliorerait
la maintenance.

### `/client/lex-factures` — `app/client/lex-factures/page.tsx` (869 l.)
Agent "Lex Factures" — détection anomalies (échéances dépassées,
doublons, montants suspects, fiscalisation manquante). POST
`/api/agent/factures` (350 l. d'analyse déterministe, pas d'IA).
**Note 7.5/10** — règles métier solides, bouton action sur alertes.

### `/client/recurrences` — 323 l.
CRUD modèles récurrents, fréquence, prochaine échéance.
GET/POST `/api/client/recurrences`. Cron `/api/cron/factures-recurrentes`
quotidien (06:00 UTC), `verifyCronSecret` bearer.
**Note 8/10** — bien branché, cycle complet UI → cron → factures.

### `/client/relances` — 548 l.
Workflow relances clients : J+0, J+7, J+15. GET
`/api/client/relances` + historique. POST relance manuelle. Cron
`/api/cron/relances-factures` automatise.
**Note 8/10** — workflow complet, historique persisté.

---

## Achats (3)

### `/client/fournisseurs` — `redirect("/client/factures?type=fournisseur")`
**Note 7/10** — consolidation justifiée, page d'ancien design supprimée.

### `/client/lex-ocr` — `app/client/lex-ocr/page.tsx` (636 l.)
Page d'audit qualité OCR — **PAS un moteur OCR**. L'OCR réel se fait
côté n8n (champ `n8n_result.extraction` lu dans `/api/agent/ocr`).
L'agent compare extraction n8n ↔ insertion Supabase et alerte sur les
mismatches (montant > 1 %, dates, devises, tiers). 346 l. côté API.
**Note 8/10** — agent solide, dépendance n8n bien isolée.

### `/client/catalogue` — 588 l.
CRUD services/produits, prix HT MUR/EUR, TVA, unité, catégorie.
GET/POST/PUT/DELETE `/api/client/catalogue`, bulk POST supporté.
**Note 8/10** — UI propre, persistance OK.

---

## RH côté client (14)

### `/client/employes` — wrapper dynamic SSR off de `/rh/employes`
**Note 7/10** — re-use intentionnel.

### `/client/salaires` — 887 l.
Bulletins par période, validation, paiement, exports MRA (CSG/PAYE/NSF).
GET/POST/PATCH `/api/rh/paie`. Comparaison période précédente.
**Note 8.5/10** — page très complète.

### `/client/salaires-compta` — 222 l.
Vue agrégée par période (totaux brut, net, charges, PAYE, levy, PRGF) —
destinée au comptable, regroupe les bulletins de `salaires`.
**Note 8/10** — **différence claire** : `salaires` = gestion par
bulletin/employé, `salaires-compta` = consolidation comptable.

### `/client/primes` — 432 l.
CRUD règles de primes + historique, POST/PUT/DELETE
`/api/rh/primes/regles`.
**Note 7.5/10** — complet, manque preview d'effet sur bulletin.

### `/client/elaboration-paie` — 434 l.
Wizard de calcul masse salariale pour une période : POST
`/api/rh/paie` (calcul), génération bulletins, ZIP PDF
(`/api/rh/paie/bulletins-zip`), PDF individuel (`/api/rh/paie/pdf`).
**Note 8/10** — orchestration claire.

### `/client/rapports-paie` — 779 l.
KPI/graphes par employé/département/période. Données via
`/api/rh/paie`. Pas d'export CSV/PDF natif sur ce dashboard.
**Note 7/10** — riche en visualisation, à compléter par export.

### `/client/exports-rh` — 969 l.
Hub exports : virements bancaires (`/api/rh/exports/virement`,
plusieurs formats), CSG/PAYE MRA (`/api/rh/exports/csg-mra`,
`/api/rh/exports/paye-mra`). Sélection comptes bancaires.
**Note 8.5/10** — central, branché.

### `/client/conges` — wrapper de `/rh/conges`
**Note 7/10**.

### `/client/planning` — 350 l.
Génération planning auto par `/api/rh/planning/generate`, employés via
`/api/rh/employes`.
**Note 7.5/10** — manque vue calendrier visuel.

### `/client/pointage` — wrapper de `/rh/pointage`
**Note 7/10**.

### `/client/demandes-rh` — 344 l.
Liste demandes congés en attente via `/api/rh/conges?statut=en_attente`,
mais **seul fetch détecté → vues approbation/rejet à vérifier**.
**Note 6.5/10** — sous-développé.

### `/client/chat-rh` — wrapper de `/rh/chat` (Chat CLARA)
**Note 7/10**.

### `/client/parametres-rh` — 697 l.
**Critique** : tout en `localStorage` (départements, bureaux, leave
types, fériés, groupes de paie, calendriers). **Aucun appel API**, aucune
persistance Supabase. Données perdues entre navigateurs/sessions/
utilisateurs.
**Note 3/10** — H : brancher sur Supabase (`/api/rh/societe` ou table
dédiée).

### `/client/declarations-sociales` — 302 l.
Vue agrégée des déclarations sociales par période, GET
`/api/rh/paie` + `/api/rh/employes`. Pas d'envoi MRA direct depuis
cette page (les exports sont sur `/client/exports-rh`).
**Note 7/10**.

---

## Contrats / docs (5)

### `/client/contrats` — re-export de `/comptable/contrats/page.tsx`
GET/POST `/api/contrats`. URL conservée pour ne pas sortir l'utilisateur
de l'espace client.
**Note 8/10**.

### `/client/contrats/[id]` — re-export de `/comptable/contrats/[id]/page.tsx`
Détail contrat, PATCH, génération `/api/contrats/[id]/generer`.
**Note 8/10**.

### `/client/contrats/[id]/rediger` — re-export de
`/comptable/contrats/[id]/rediger/page.tsx`
Assistant IA contrat : POST `/api/contrats/[id]/chat`, génération via
`/api/contrats/[id]/generer`. `/api/generate-contract` utilise
`callClaude` (`lib/claude`).
**Note 8/10** — chaîne IA branchée Anthropic.

### `/client/documents` — 1075 l.
Upload `/api/documents/upload`, listing `/api/client/documents`,
ré-analyse `/api/documents/[id]/reanalyze`, bulk-delete, polling toutes
les 10 s. Loading + reassign dialog OK.
**Note 8.5/10**.

### `/client/documents/[id]` — 543 l.
Détail document avec metadata, PATCH classification, reanalyze, viewer.
**Note 8/10**.

---

## Direction (7)

### `/client/email-accounts` — 378 l.
CRUD comptes email (IMAP/SMTP) `/api/client/email-accounts`, test
connexion `/test`. PATCH/DELETE OK.
**Note 8/10** — chiffrement à vérifier côté API (probable
`encryptSecret`).

### `/client/settings/google-accounts` — 173 l.
OAuth Google `/api/auth/google/init`, list/set-default/disconnect.
**Note 8/10**.

### `/client/telegram-config` — 243 l.
Enrollment user (`/api/telegram/enroll` GET/POST/DELETE) + config
alertes par société (`/api/client/telegram-alerts-config`). Bot
opérationnel (webhook + send-with-buttons + cron-alerts existent).
**Note 8/10**.

### `/client/telegram-permissions` — 841 l.
Permissions granulaires par employé/groupe pour le bot Telegram :
employee-code, autorisations société, attribution. Endpoints
`/api/client/telegram-permissions` + `/employee-code`.
**Note 8.5/10** — page la plus poussée du dossier.

### `/client/direction/bank-credentials` — 401 l.
Identifiants bancaires (username, password, secondary PIN). **Chiffrés
serveur via `encryptSecret` (AES-256-GCM, `lib/crypto/symmetric.ts`).**
Action scrape `/scrape?compte_id=`.
**Note 9/10** — bonne hygiène crypto.

### `/client/direction/mra-credentials` — 206 l.
Identifiants MRA (password, TAN, API key) **tous chiffrés via
`encryptSecret`**.
**Note 9/10**.

### `/client/direction/mcp-setup` — 351 l.
Génération/listing/suppression clés API utilisateur pour MCP
`/api/client/user-api-keys`.
**Note 8/10**.

---

## Points spécifiques demandés

### 1. Deux pages "nouvelle facture" — justifié ?
**Oui**. `/client/nouvelle-facture` = formulaire pro pour comptable
(taux change live, contacts, templates). `/client/nouvelle-facture-ia`
= assistant chat pour non-comptable (Anthropic Claude Sonnet/Haiku
branché). Audiences différentes, pas de doublon de logique.

### 2. `salaires` vs `salaires-compta`
**Différence claire**. `salaires` = liste bulletins par employé avec
actions (valider/payer/exporter MRA). `salaires-compta` = consolidation
par période (totaux brut/net/charges) pour comptable. Pas de duplication.

### 3. Telegram bot opérationnel ?
**Oui**. Endpoints existants : `enroll`, `webhook`, `send`,
`send-with-buttons`, `cron-alerts`, `system-prompt`, `memory`,
`internal`, `log`. Pages config + permissions branchées. Bot lié à
n8n (workflows externes).

### 4. Chiffrement des identifiants stockés
**Bank + MRA credentials chiffrés AES-256-GCM** via
`lib/crypto/symmetric.ts` (clé via env). Aucun secret en clair dans
les colonnes `*_enc`. Bonne pratique respectée.

---

## Modifications recommandées

### HAUT (H)
1. **`/client/parametres-rh`** : tout migrer de `localStorage` vers
   Supabase. Risque : perte de paramétrage RH (départements, fériés,
   leave types) entre sessions/devices. Bloquant pour multi-utilisateur.
2. **`/client/demandes-rh`** : page sous-développée (seul fetch
   `?statut=en_attente`) — ajouter actions approve/reject et historique.
3. **`/client/facturation-settings` (1534 l.)** : trop chargée — fragmenter
   en sous-routes par onglet pour faciliter la maintenance et limiter le
   bundle client.

### MOYEN (M)
4. **`/client/rapports-paie`** : ajouter export CSV/PDF natif (actuelle-
   ment uniquement visualisation).
5. **`/client/facture-preview`** : factoriser le code PDF (route 511 l. +
   page 738 l.) dans `lib/factures/invoice-pdf.tsx` à l'instar de
   `lib/lexora-billing/invoice-pdf.tsx`.
6. **`/client/nouvelle-facture` (1080 l.)** : extraire les sous-formulaires
   en composants (lignes, tiers, devise) — fichier devenu monolithique.
7. **`/client/factures/import`** : remonter les erreurs ligne-par-ligne
   en cas de violation FK Supabase (actuellement échec global).

### BAS (L)
8. **`/client/planning`** : ajouter vue calendrier visuelle (actuellement
   liste générée).
9. **`/client/email-accounts`** : confirmer chiffrement côté API (probable
   mais à auditer).
10. **`/client/lex-ocr`** : documenter dans la page que l'OCR est externe
    (n8n) — actuellement l'utilisateur peut croire que la page fait
    l'extraction.

---

## Highlights critiques

1. **`/client/parametres-rh` n'est PAS persisté** (localStorage only) →
   paramétrage RH critique perdu entre sessions/devices/utilisateurs.
   Régression silencieuse à corriger en priorité.
2. **Chaîne IA réellement branchée** (Anthropic SDK, Claude Sonnet 4.6
   + Haiku 4.5) sur `nouvelle-facture-ia` et `contrats/rediger`. Pas de
   stub — vrai coût API en prod.
3. **Identifiants bancaires + MRA chiffrés AES-256-GCM** (bonne
   hygiène). En revanche, **`/client/demandes-rh` quasi vide** et
   **`facturation-settings` monolithique (1534 l.)** demandent travail
   de structure.
