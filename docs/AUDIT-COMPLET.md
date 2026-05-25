# AUDIT COMPLET — Application SaaS Lexora

**Date** : 2026-05-24
**Branche** : `claude/kind-mccarthy-zknYB`
**Orchestration** : 11 agents vague 1 + 6 sous-agents vague 2 + chef d'orchestre
**Périmètre** : 198 URLs `app/**/page.tsx`, 408 routes API, 155 composants, ~40 tests, migrations Supabase `dqepdoimpqhmuhkklxva` (prod), stack Next.js 16.2 + React 19 + TS 5.7 + Tailwind v4 + Supabase + Vercel.

---

## 1. Note globale : **6.9 / 10**

Méthode de pondération :
- 8 audits d'espace (196 URLs) pondérés par nombre d'URLs : **7.7/10** brut UX-fonctionnel.
- 3 audits transversaux (Sécurité 4.0, Code quality 5.5, UX/UI 6.2) pondérés à 30 "points" chacun (pour ne pas écraser le fonctionnel par 3 notes basses, mais leur donner un poids significatif équivalent à un mid-espace).
- Moyenne pondérée finale : **6.92 / 10 → 6.9/10**.

| Bloc | Note | Poids |
|---|---|---|
| Public + Auth + Système (16 URLs) | 7.34 | 16 |
| Admin (20 URLs) | 7.70 | 20 |
| Client Compta + Banque + Société (24 URLs) | 7.60 | 24 |
| Client MRA + Fiscal (8 URLs) | 7.00 | 8 |
| Client GBC + Conso + International (12 URLs) | 7.25 | 12 |
| Client Facturation + Achats + RH-client + Direction (37 URLs) | 7.50 | 37 |
| Comptable (34 URLs) | 7.30 | 34 |
| RH + Salarié + Direction + Juridique (45 URLs) | 8.60 | 45 |
| **Sécurité (transversal)** | **4.00** | 30 |
| **Code quality (transversal)** | **5.50** | 30 |
| **UX/UI (transversal)** | **6.20** | 30 |

Lecture : fonctionnellement l'application est **mature (7.7)**, mais elle est **plombée par les trois axes transversaux (4.0 / 5.5 / 6.2)** qui sont précisément les domaines qui décident d'un go/no-go production.

---

## 2. Verdict exécutif

Lexora est un SaaS de comptabilité Maurice **fonctionnellement très avancé et différenciant** : moteur de paie WRA 2019 / Finance Act 2025-2026, pipeline OHADA/PCM/MRA cohérent, Pillar Two correctement implémenté, IFRS 9 ECL opérationnel, fiscalisation e-invoicing IFP avec retry/HMAC, multi-tenant correct sur 95 % des pages client, sidebars par rôle, i18n FR/EN structuré sur 80 % du code.

**Mais l'application ne peut PAS aller en production en l'état**. Trois bloqueurs critiques :

1. **SEC-001** : un simple `rh` ou `client_admin` peut prendre le compte super_admin via `/api/admin/users/[id]/password` en moins de 5 minutes — exploit fonctionnel documenté avec PoC curl.
2. **SEC-003** : 32 tables RH/compta encore en RLS "théâtre" (`USING auth.uid() IS NOT NULL`) — un `client_user` société A peut lire les pointages / demandes congés / mouvements de compte courant de la société B.
3. **Consolidation IFRS 10 cassée silencieusement** : les éliminations intra-groupe ne sont JAMAIS appliquées (commentaire `for now we keep it simple` dans `/api/comptable/gbc/consolidate/route.ts`), les états consolidés sont arithmétiquement faux pour tout client GBC.

Au-delà des bloqueurs, l'app souffre de dette structurelle : 9 doublons d'URL, 12 composants orphelins (~3000 lignes), 5 235 lignes dans `route.ts` rapprochement, 92,6 % de pages `"use client"` (anti-pattern App Router), 4 pages 100 % mock (tableau-de-bord comptable, bilan comptable, /admin/ohada, /comptable/charges-sociales), 1 page critique sans aucune persistance Supabase (`/client/parametres-rh`).

Après le hotfix sécurité (< 24h) + Sprint 1 (1-2 semaines) + Sprint 2 (1 mois), la note remonterait à **8.0-8.5/10** et l'app serait prête pour production.

---

## 3. Top 10 bloqueurs production (par ordre de criticité)

| # | Bloqueur | Source agent | Effort fix | Risque |
|---|----------|--------------|-----------|--------|
| 1 | **SEC-001** — escalade privilèges via `/api/admin/users/[id]/password` (10/10) | A9 / W2-F | 30 min hotfix + audit log | **CRITIQUE** (compromis 5 min) |
| 2 | **SEC-002** — RPC `exec_sql` ouvert, SQLi DDL arbitraire (9/10) | A9 / W2-F | 2 h migration `REVOKE` + refactor 5 routes | **CRITIQUE** |
| 3 | **SEC-003** — RLS "théâtre" sur 32 tables RH/compta (9/10) | A9 / W2-F | 2 jours migration 415 + tests E2E RLS | **CRITIQUE** (fuite cross-tenant) |
| 4 | **Consolidation IFRS 10 cassée** — éliminations non appliquées + IAS 21 absente | A5 / W2-E | V1 = 3 jours ; V2 complète = 2-3 sem | **MAJEUR** régulatoire FSC |
| 5 | `/client/parametres-rh` — 100 % localStorage, multi-user impossible | A6 / W2-C | 1.5-2 jours (3 tables SQL + 4 endpoints) | HAUT (paramétrage RH perdu) |
| 6 | `/admin/ohada`, `/comptable/tableau-de-bord`, `/comptable/bilan`, `/comptable/charges-sociales` — 100 % mock affiché en prod | A2 / A7 / W2-B | 5-7 h | HAUT (perte de confiance) |
| 7 | `/client/profil` boutons "Sauvegarder" et "Changer mdp" sans `onClick` | A3 / W2-B | 30-45 min | HAUT (régression silencieuse) |
| 8 | `/client/notifications` — `const notifications = []` hardcodé | A3 / W2-B | 15 min | HAUT (induit l'utilisateur en erreur) |
| 9 | IT Form 3 — APS + CSR calculs faux (W2-D #2a/2b) | A4 / W2-D | 30 min | HAUT régulatoire (amendes MRA) |
| 10 | `/api/comptable/rapprochement/route.ts` — 5 235 lignes, 35 `as any`, 50 `console.log` | A3 / A10 | 1-2 sem refactor en `lib/accounting/rapprochement/*` | MAJEUR maintenance |
| 11 (bis) | **SEC-004** — comparaisons tokens non timing-safe (15 sites) | A9 / W2-F | 1 jour helper + refactor | HAUT |
| 12 (bis) | **SEC-005** — `INTERNAL_API_TOKEN` partagé sur 56 endpoints sans HMAC | A9 / W2-F | 1 sem HMAC + nonces + migration n8n | HAUT |
| 13 (bis) | Liens cassés `/login → /dashboard`, `/ohada → /contact`, `/tarifs → /auth/login` au lieu de `/inscription` | A1 / W2-A | 25-35 min (5 patches) | MOYEN UX |

---

## 4. Tableau récapitulatif des 196 URLs avec note /10

### 4.1 Public + Auth (16 URLs) — Agent 1 — Moyenne 7.34

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/` | 9 | OK | Landing premium 2038 lignes (à splitter perf) |
| `/login` | 1 | ZOMBIE | Doublon mort, `<Link href="/dashboard">` cassé |
| `/auth/login` | 9 | OK | Implémentation propre, i18n, signInWithPassword |
| `/inscription` | 8.5 | OK | Wizard 3 étapes + Resend, anti-doublon, FR uniquement |
| `/tarifs` | 6.5 | OK partiel | CTAs pointent `/auth/login` au lieu de `/inscription` |
| `/cgu` | 9.5 | OK | i18n FR/EN, LegalShell |
| `/cgv` | 9.5 | OK | idem |
| `/mentions-legales` | 9 | OK | Layout custom (hors LegalShell) |
| `/protection-donnees` | 9 | OK | Pas de section cookies |
| `/ohada` | 4 | CASSÉE | CTAs `/admin/ohada` (privée) + `/contact` (404) |
| `/help` | 8.5 | OK | SSG content-driven, i18n TODO |
| `/help/[category]` | 8 | OK | i18n TODO |
| `/help/[category]/[slug]` | 8.5 | OK | Component embarqué dans article |
| `/redirect` | 9 | OK | Dispatch 15+ rôles, fallback défensif |
| `/profil` | 6 | KO | Pas de garde-auth client, alert() natif |
| `/onboarding/soldes-ouverture` | 8.5 | OK | Idempotent RPC, calcul temps réel |

### 4.2 Admin (20 URLs) — Agent 2 — Moyenne 7.7

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/admin` | 8 | OK | 5 round-trips Supabase (KPI agrégé recommandé) |
| `/admin/clients` | 7.5 | OK | `Promise.allSettled` masque les échecs partiels |
| `/admin/comptables` | 7 | OK | Pas de bouton "retirer assignation" |
| `/admin/demandes-inscription` | 8.5 | OK | Workflow validation/refus complet |
| `/admin/documents` | 7.5 | OK | `window.confirm` au lieu d'AlertDialog |
| `/admin/forex` | 6 | Outil | Liste devises hardcodées, pas de vraie config |
| `/admin/health` | 9.5 | EXCELLENT | 10 checks SQL réels, force-dynamic |
| `/admin/lexora-billing` | 8.5 | OK | Pas d'idempotency sur emit |
| `/admin/lexora-billing/parametres` | 8 | OK | Validation BRN/IBAN absente |
| `/admin/lexora-billing/rapprochement` | 8 | OK | Lien partiel manquant |
| `/admin/lexora-tooling` | 6 | Doc | Page datasheet statique, à déplacer |
| `/admin/ohada` | 2 | **MOCK** | 100 % hardcodé `companies: 0` partout |
| `/admin/parametres` | 6.5 | KO | `wati_token` en clair dans Supabase |
| `/admin/plans` | 9 | OK | CRUD complet 11 modules |
| `/admin/purge` | 9 | OK | Triple garde-fou, audit_trail propre |
| `/admin/repair` | 8 | OK | Pas d'audit_trail sur ces actions destructives |
| `/admin/reset-societe` | 7 | KO | Accepte `comptable/comptable_dedie`, pas d'audit |
| `/admin/services` | 8 | OK | Source unique `plans` |
| `/admin/societes` | 8.5 | OK | `window.confirm` au lieu d'AlertDialog |
| `/admin/users` | 8.5 | OK | Pas d'audit_trail sur hard delete |

### 4.3 Client Compta + Banque + Société (24 URLs) — Agent 3 — Moyenne 7.6

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/client` | 9 | OK | Redirect simple vers tableau-de-bord |
| `/client/tableau-de-bord` | 8.5 | OK | 6 fetches mois (endpoint series recommandé) |
| `/client/tableau-de-bord-financier` | 7 | OK | Pas de fallback erreur API IA |
| `/client/alertes` | 7 | KO | "Marquer lu" + "Archiver" non persistés (state React only) |
| `/client/notifications` | 2 | **MOCK** | `const notifications = []` hardcodé |
| `/client/select-societe` | 9 | OK | Logique 0/1/≥2 propre |
| `/client/ecritures` | 8.5 | OK | Pas de pagination |
| `/client/grand-livre` | 9 | OK | Lex Livre IA + export XLSX |
| `/client/bilan` | 8 | OK | N-1 en localStorage (à persister) |
| `/client/plan-comptable` | 9 | OK | PCM Maurice complet 7 classes |
| `/client/revenus-depenses` | 7.5 | OK | Vue agrégée |
| `/client/echeances` | 7.5 | OK | Factures retard/proches |
| `/client/tva` | 8.5 | OK | TVA 15 % MU + deadline 20, **pas d'export XML MRA** |
| `/client/leases` | 8 | OK | IFRS 16, lecture seule |
| `/client/banque` | 8 | OK | Scraping MCB à vérifier |
| `/client/rapprochement` | 7.5 | KO mainten | **2352 LOC** + API **5235 LOC** — refactor critique |
| `/client/rapprochement-mensuel` | 8 | OK | Workflow draft→submitted→validated→locked |
| `/client/compte-courant` | 8 | OK | CRUD CCA complet |
| `/client/societe` | 5 | KO | N'utilise PAS `useSocieteActive()` — désynchro multi-tenant |
| `/client/societes` | 8 | OK | regime GBC/IFRS bien câblé |
| `/client/contacts` | 8 | OK | Pas de fusion doublons UI |
| `/client/utilisateurs` | 8 | OK | Vérifier RequireRole pour client_user |
| `/client/profil` | 4 | KO | Boutons Save + ChangePassword sans `onClick` |
| `/client/assistant` | 8 | OK | Polling 10s (backoff recommandé) |

### 4.4 Client MRA + Fiscal (8 URLs) — Agent 4 — Moyenne 7.0

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/client/mra-hub` | 8 | OK | `TYPE_HREF` incomplet (PAYE/IT3/SFT) |
| `/client/mra-cit` | 7 | OK | Date limite hardcodée endYear-12-30 |
| `/client/mra-tds` | 8 | OK | 10 catégories TDS Maurice, export CSV |
| `/client/mra-sft` | 6 | KO | Détection 50k brute → faux positifs massifs |
| `/client/mra-roc` | 5 | INCOMPLET | Directors/Shareholders absents UI |
| `/client/mra-fiscalisation` | 9 | EXCELLENT | Retry exp + HMAC + audit log |
| `/client/it-form3` | 6.5 | KO | APS critère faux + CSR plafond Rs 10M illégal |
| `/client/fiscal-freelance` | 3 | STATIQUE | Tout hardcodé, aucune lecture DB |

### 4.5 Client GBC + Conso + International (12 URLs) — Agent 5 — Moyenne 7.25

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/client/gbc-dashboard` | 8.5 | OK | Filtrage régime parfaitement implémenté |
| `/client/gbc-per` | 7.5 | OK | Pas d'outil tagging `per_category` côté UI |
| `/client/gbc-substance` | 7.5 | OK | Pas de force `location=Mauritius` board meetings |
| `/client/gbc-transfer-pricing` | 7 | OK | Pas de Local File (Master File seulement) |
| `/client/gbc-ubo` | 7 | OK | Pas de screening OFAC/WorldCheck |
| `/client/gbc-pillar-two` | 8 | OK | SBIE phase-in correct, pas de safe harbours |
| `/client/gbc-crs-fatca` | 6.5 | KO | XML "squelette" non production-grade |
| `/client/gbc-consolidation` | 6 | **CASSÉ** | Éliminations non appliquées + IAS 21 absente |
| `/client/tiers-consolidation` | 7.5 | OK | Naming trompeur (= dédoublonnage tiers) |
| `/client/ifrs9-ecl` | 8 | OK | Override stages + macro factor |
| `/client/taux-change` | 6.5 | KO | "Mise à jour depuis BoM" appelle en réalité ExchangeRate-API |
| `/client/annual-return` | 7 | OK | `window.print()` au lieu de @react-pdf, GBC2 obsolète |

### 4.6 Client Facturation + Achats + RH + Contrats + Direction (37 URLs) — Agent 6 — Moyenne 7.5

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/client/factures` | 8.5 | OK | Vue agrégée client+fournisseur |
| `/client/factures/import` | 8 | OK | CSV/XLSX, erreurs FK non détaillées |
| `/client/nouvelle-facture` | 8.5 | OK | 1080 LOC à splitter |
| `/client/nouvelle-facture-ia` | 9 | OK | Claude Sonnet 4.6 + Haiku 4.5 réels |
| `/client/facture-preview` | 8 | OK | PDF route 511 LOC à factoriser |
| `/client/facture-template` | 7 | Redirect | Vers facturation-settings |
| `/client/facturation-settings` | 8 | OK | 1534 LOC monolithique |
| `/client/lex-factures` | 7.5 | OK | Règles déterministes 350 LOC |
| `/client/recurrences` | 8 | OK | Cron quotidien 06:00 UTC |
| `/client/relances` | 8 | OK | J+0/J+7/J+15 |
| `/client/fournisseurs` | 7 | Redirect | Vers `/factures?type=fournisseur` |
| `/client/lex-ocr` | 8 | OK | Audit OCR (n8n externe) |
| `/client/catalogue` | 8 | OK | CRUD services/produits |
| `/client/employes` | 7 | Wrapper | de `/rh/employes` |
| `/client/salaires` | 8.5 | OK | Bulletins par période |
| `/client/salaires-compta` | 8 | OK | Vue agrégée comptable |
| `/client/primes` | 7.5 | OK | CRUD règles primes |
| `/client/elaboration-paie` | 8 | OK | Wizard calcul masse |
| `/client/rapports-paie` | 7 | OK | Pas d'export CSV/PDF |
| `/client/exports-rh` | 8.5 | OK | Hub virements + MRA |
| `/client/conges` | 7 | Wrapper | de `/rh/conges` |
| `/client/planning` | 7.5 | OK | Pas de vue calendrier visuelle |
| `/client/pointage` | 7 | Wrapper | de `/rh/pointage` |
| `/client/demandes-rh` | 6.5 | INCOMPLET | Seul fetch ?statut=en_attente |
| `/client/chat-rh` | 7 | Wrapper | Chat CLARA |
| `/client/parametres-rh` | **3** | **CASSÉ** | **100 % localStorage, multi-user impossible** |
| `/client/declarations-sociales` | 7 | OK | Vue agrégée déclarations |
| `/client/contrats` | 8 | OK | Re-export `/comptable/contrats` |
| `/client/contrats/[id]` | 8 | OK | Détail contrat |
| `/client/contrats/[id]/rediger` | 8 | OK | IA Anthropic |
| `/client/documents` | 8.5 | OK | Polling 10s |
| `/client/documents/[id]` | 8 | OK | Détail document |
| `/client/email-accounts` | 8 | OK | IMAP/SMTP CRUD |
| `/client/settings/google-accounts` | 8 | OK | OAuth Google |
| `/client/telegram-config` | 8 | OK | Enrollment + alertes config |
| `/client/telegram-permissions` | 8.5 | OK | Permissions granulaires |
| `/client/direction/bank-credentials` | 9 | OK | AES-256-GCM |
| `/client/direction/mra-credentials` | 9 | OK | AES-256-GCM |
| `/client/direction/mcp-setup` | 8 | OK | Génération clés API |

### 4.7 Comptable (34 URLs) — Agent 7 — Moyenne 7.3

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/comptable` | 8 | OK | Dashboard portefeuille |
| `/comptable/cabinet` | 8.5 | OK | Dashboard Sprint 2 propre |
| `/comptable/equipe` | 7 | OK | 1038 LOC, doublon partiel cabinet |
| `/comptable/societes` | 7.5 | OK | CRUD société + dossiers |
| `/comptable/mes-clients` | 6.5 | KO | Lien `/comptable/grand-livre?societe_id=` inexistant |
| `/comptable/clients` | 8 | OK | Doublon partiel mes-clients |
| `/comptable/clients/[clientId]` | 8 | OK | Fiche client |
| `/comptable/clients/[clientId]/[societeId]` | 8 | OK | Mega-hub 1259 LOC |
| `…/tableau-de-bord` | **2** | **MOCK** | "TIBOK Ltd", scores hardcodés |
| `…/balance` | 9 | OK | Données réelles |
| `…/grand-livre` | 9 | OK | Pagination + lettrage |
| `…/bilan` | **2** | **MOCK** | "TIBOK Ltd", actifs/passifs hardcodés |
| `…/far` | 8 | OK | Annual Allowance Schedule MRA (mal nommé) |
| `…/annual-return` | 8.5 | OK | ROC complet |
| `…/it-form3` | 8 | OK | Formules MRA |
| `…/previsionnel` | 7 | OK | IA + societe_id à propager |
| `…/simulations` | 7.5 | OK | createClient direct à remplacer par API |
| `/comptable/factures-clients` | 8 | OK | CRUD facture |
| `/comptable/fournisseurs` | 8 | OK | idem fournisseur |
| `/comptable/banque` | 8.5 | OK | Multi-société |
| `/comptable/rapprochement` | 8.5 | OK | Lex Banque 1343 LOC |
| `/comptable/tva` | 8.5 | OK | 9 boxes MRA |
| `/comptable/salaires` | 6 | KO | Estimation taux moyens hardcodés au lieu de paie réelle RH |
| `/comptable/charges-sociales` | **3** | **MOCK** | Clone de Balance, aucune logique charges |
| `/comptable/cloture` | 8.5 | OK | IFRS 9/15/19, IAS 21/36 |
| `/comptable/inter-societes` | 7 | OK | Validation miroirs R5 |
| `/comptable/interco` | 7.5 | OK | Réconciliation interco (différent du précédent) |
| `/comptable/rapports` | 5 | MAL NOMMÉ | = Immobilisations |
| `/comptable/documents` | 8 | OK | Liste tous clients |
| `/comptable/contrats` | 7.5 | OK | useSocieteActive |
| `/comptable/contrats/[id]` | 7.5 | OK | Détail |
| `/comptable/contrats/[id]/rediger` | 8 | OK | IA conversation |
| `/comptable/alertes` | 8 | OK | Filtres severity |
| `/comptable/sante-pcm` | 9.5 | EXCELLENT | Audit comptable temps réel via vue SQL |

### 4.8 RH + Salarié + Direction + Juridique + Telegram (45 URLs) — Agent 8 — Moyenne 8.6

| URL | Note | Statut | Remarque principale |
|-----|------|--------|---------------------|
| `/rh` | 9 | OK | Hub 6 onglets, widgets MRA/IAS19 |
| `/rh/manager` | 8 | OK | Manager/team_leader dashboard |
| `/rh/societe` | 9 | OK | Paramétrage entité onBlur |
| `/rh/employes` | 9 | OK | 1626 LOC riche |
| `/rh/employes/[id]` | 9 | OK | Fiche complète + tabs |
| `/rh/groupes` | 9 | OK | Team Leader (couronne) |
| `/rh/annonces` | 8 | OK | CRUD annonces |
| `/rh/chat` | 7 | OK | Markdown maison à remplacer |
| `/rh/juridique` | 8 | OK | Contrats employeur-employé + signature |
| `/rh/depart` | 9 | OK | Preavis + certificat + PRGF |
| `/rh/severance` | 9 | OK | WRA s.69-71 |
| `/rh/parametres` | 8 | OK | Hub navigation sous-modules |
| `/rh/paie` | 10 | EXCELLENT | Page maîtresse 1358 LOC |
| `/rh/paie/parametres` | 9 | OK | Config période + taux MRA |
| `/rh/paie/primes` | 9 | OK | 8 types de primes + XLSX |
| `/rh/paie/validation` | 10 | Redirect | Vers `/rh/paie?tab=validation` |
| `/rh/paie/edf` | 9 | OK | Employer Declaration Form annuelle |
| `/rh/paie/exports-mra` | 10 | Redirect | Vers `/rh/exports/paie` |
| `/rh/historique-paie` | 8 | OK | Drill-down détails |
| `/rh/import-paie` | 8 | OK | Migration legacy |
| `/rh/salaires-compta` | 7 | OK | Doublon avec `/client/salaires-compta` |
| `/rh/eoy-bonus` | 9 | OK | WRA s.27 (13e mois) |
| `/rh/provisions/conges` | 9 | OK | IAS 19 snapshot mensuel |
| `/rh/provisions/eoy` | 9 | OK | IAS 19 EOY |
| `/rh/declarations-mra` | 9 | OK | PAYE/CSG/NSF/TL mensuel |
| `/rh/exports/paie` | 10 | EXCELLENT | 9 banques MU + 4 formats MRA |
| `/rh/exports/virement` | 6 | DOUBLON | de l'onglet virements de exports/paie |
| `/rh/exports-legaux` | 9 | OK | Registres S.116 WRA |
| `/rh/prgf/exit-statements` | 9 | OK | PRGF Exit Statement |
| `/rh/planning` | 9 | OK | 2377 LOC, shift complexe |
| `/rh/planning/regles` | 9 | OK | WRA + presets |
| `/rh/pointage` | 9 | OK | Multi-employés |
| `/rh/pointage/mensuel` | 8 | OK | Vue calendrier mensuel |
| `/rh/conges` | 10 | EXCELLENT | 2744 LOC, eligibility WRA |
| `/rh/conges/parametres` | 9 | OK | Config cycles |
| `/rh/jours-feries` | 9 | OK | 15 fériés MU |
| `/rh/frais-km` | 8 | OK | Forfait mensuel |
| `/rh/trajets-km` | 8 | OK | GPS tracking — flow à clarifier avec frais-km |
| `/rh/geolocalisation` | 8 | OK | Leaflet dynamic |
| `/salarie` | 9 | OK | 10 onglets self-service complets |
| `/direction` | 8 | OK | Consolidation multi-sociétés |
| `/juridique` | 5 | KO | Liens `/juridique/documents` + `/conformite` cassés |
| `/juridique/contrats` | 9 | OK | Générateur multi-juridictions (MU/MU+FR/CV) |
| `/pilotage-telegram` | 8 | OK | Landing Chief of Staff IA |
| `/signer-contrat` | 9 | OK | Signature électronique opérationnelle |

---

## 5. Synthèse par axe transversal

### 5.1 Sécurité — 4.0/10 (Agent 9 — STRIDE + OWASP Top 10)

- **Vulnérabilités** : 5 CRITIQUES + 8 HAUTES + 7 MOYENNES + 6 FAIBLES/Info
- **408 routes API auditées** ; **1 seule** utilise Zod (0.25 %)
- **Rate limiting** : 0 occurrence dans tout le repo
- **RLS Postgres** : 39 tables reconnues en "théâtre" (Phase 1 corrige 7, **Phase 2 jamais livrée → 32 tables vulnérables**)

**Top 5 vulnérabilités** :

| ID | Titre | Note | Fichier | Hotfix ? |
|---|---|---|---|---|
| SEC-001 | Escalade privilèges via reset password (n'importe quel `rh` → `super_admin`) | 10/10 | `app/api/admin/users/[id]/password/route.ts:24-72` | **OUI < 24h** |
| SEC-002 | RPC `exec_sql` ouvert (SQLi DDL arbitraire) | 9/10 | `app/api/admin/{fix-db,diag-team-leader,users,diagnostic}/route.ts` + `app/api/client/users/route.ts` | OUI (2h) |
| SEC-003 | RLS "théâtre" sur 32 tables RH/compta (Phase 2 non livrée) | 9/10 | `supabase/migrations/404_fix_rls_policies_phase1.sql` | NON (sprint 2 sem) |
| SEC-004 | Comparaisons tokens non timing-safe (15 sites) | 8/10 | `lib/lexora-internal-auth.ts:38`, `lib/telegram/auth.ts:8`, `lib/claude.ts:64` … | NON (1 jour) |
| SEC-005 | `INTERNAL_API_TOKEN` partagé non-HMAC sur 56 endpoints Telegram | 8/10 | `lib/telegram/internal-auth.ts:55-154` | NON (1 sem) |

**Autres findings notables** :
- SEC-006 Cookie `active_societe_id` JS-accessible (non HttpOnly, non Secure)
- SEC-007/008 `/api/contact` + `/api/inscription` sans rate limit ni captcha
- SEC-010 `cascade-delete` / `reset-complet` : pas de MFA, pas de 4-eyes
- SEC-014 Zod sur 1/408 routes
- SEC-018 Pas de purge RGPD (soft delete éternel)
- SEC-019 Stack traces DB renvoyées au client sur 50+ routes

**Domaines** : Auth 6/10, Authz/RBAC 3/10, RLS multi-tenant 3/10, Secrets 6/10, API security 3/10, Telegram 5/10.

### 5.2 Code quality — 5.5/10 (Agent 10)

| Indicateur | Valeur |
|---|---|
| Erreurs TypeScript `tsc --noEmit` | **0** ✅ |
| `as any` | **689** sur 213 fichiers |
| `@ts-ignore` / `@ts-expect-error` | 0 ✅ |
| `console.log` en prod | 217 |
| TODO/FIXME | 9 (excellent) |
| Fichiers > 1000 lignes | 39 |
| Pages dupliquées | 9 clusters |
| Composants orphelins confirmés | 12 (~3000 lignes) |
| Endpoints API morts | ~11 + ~30 douteux |
| Tests automatisés | 40 fichiers |
| Pages `"use client"` | **176/190 (92.6 %)** — anti-pattern App Router |
| `"use server"` actions | **0** |

**Top hotspots** :
1. `app/api/comptable/rapprochement/route.ts` — **5235 lignes** + 35 `as any` + 50 `console.log`
2. `app/api/rh/paie/route.ts` — 2473 lignes + 12 `as any`
3. `app/api/documents/upload/route.ts` — 2458 lignes + 15 `as any`
4. `app/client/rapprochement/page.tsx` — 2352 lignes
5. `app/rh/conges/page.tsx` — 2744 lignes + 23 `as any`

**Doublons fonctionnels** : `/comptable/inter-societes` vs `/interco`, `/client/salaires-compta` vs `/rh/salaires-compta` (vrai doublon, factorisable), `/rh/exports/virement` vs `/rh/exports/paie?tab=virements`, `/client/gbc-consolidation` vs `/client/tiers-consolidation` (naming), `/rh/eoy-bonus` vs `/rh/paie/edf` vs `/rh/provisions/eoy` (3 pages domaine 13e mois).

**Composants orphelins** (à supprimer) : `components/dashboard/dashboard-nav.tsx`, `document-upload.tsx`, `components/video/*` × 4, `components/editable/*` × 4, `AdminSidebarUnified.tsx`, `ComptableSidebar.tsx`.

**Endpoints API morts** : `/api/admin/{backfill-releves-bancaires, diag-team-leader, diagnostic, recompute-conges-nb-jours, repair-orphan-documents, wra-statut-rapport}`, `/api/alertes/generate`, `/api/generer-previsionnel`, `/api/me`, `/api/messages`, `/api/publier-document`.

**Stack** : Next 16.2, React 19.2.4, TS 5.7.3, Supabase JS ^2.100, Tailwind v4 — **toutes versions à jour, 0 dette de version**.

### 5.3 UX/UI — 6.2/10 (Agent 11)

| Indicateur | Note |
|---|---|
| Cohérence design system | 5.5/10 |
| Accessibilité estimée | 5/10 |
| Responsive | 6.5/10 |
| Performance UI | **4/10** |
| Robustesse (loading/error/404) | **3/10** |
| i18n FR/EN | 8/10 |

**3 maladies systémiques** :
1. **199 fichiers `"use client"` pour 198 pages** → App Router utilisé comme SPA legacy. **0 Server Action**, 10 `dynamic()`, 11 `Suspense`, 2 `Skeleton`.
2. **44 % des couleurs hardcodées** : 559 inline `style={{ color: "#hex" }}` + 569 classes Tailwind `bg-emerald-*` / `bg-teal-*` / `bg-cyan-*` etc. → dark mode futur impossible.
3. **0 `loading.tsx` / 0 `error.tsx` / 0 `not-found.tsx`** dans tout `app/` → pas de streaming RSC, pas d'error boundary, pas de 404 brandée.

**Détails** : 0 usage de `next/image`, 6 `<img>` natifs. 35 `htmlFor=` sur ~71 inputs (a11y fragile). 8 sidebars dont 2 orphelines. Poppins chargée via `@import url()` (bloquant) au lieu de `next/font/google`. ParticleField actif par défaut sur toutes les pages client.

**Points positifs** : Sonner unifié (290 toasts), 59 composants shadcn/ui, i18n FR/EN 13 chunks structurés, tokens motion/shadows/z-index dans `app/globals.css`, `prefers-reduced-motion` respecté, `<html lang="fr">` correct.

---

## 6. Forces de l'application

1. **Moteur de paie production-grade** (`lib/rh/paie.ts`) aligné Finance Act 2025-2026 + WRA 2019 : CSG progressif, NSF plafonné Rs 28 570, PAYE annualisé × 13, double base CSG/NSF vs PAYE, prorata absence. Note RH globale **8.6/10**.
2. **Exports MRA + bancaires complets** : 9 banques Maurice (MCB BP-V1, SBM BizEdge, ABC, AfrAsia, MauBank, BankOne, ABSA, SCB, HSBC), formats PACO/PRGF/CSG/PAYE MRA strict, registres S.116 WRA.
3. **Module GBC le plus mature** : Pillar Two (SBIE phase-in 2022→2024+), IFRS 9 ECL (stages + override + macro), filtrage par régime, audit trail UBO/ECL, tests unitaires.
4. **Fiscalisation IFP e-invoicing** (`lib/mra-ifp.ts`) : retry exponentiel 1s/2s/4s, timeout 15s, idempotency-key, audit log systématique, mode mock vs réel via `MRA_USE_MOCK`.
5. **`/admin/health`** (9.5/10) : 10 checks SQL réels factures sans écriture, soldes 411 anormaux, écritures déséquilibrées, classifications doublons.
6. **`/comptable/sante-pcm`** (9.5/10) : audit comptable temps réel via vue SQL, score 0-100, cache 60s.
7. **Workflow paie end-to-end** : brouillon → validé → payé → déclaré MRA avec audit trail, PDF bulletins, comptabilisation.
8. **Self-service salarié** (`/salarie`) : 10 onglets complets (MaFiche, Conges, Trajets, Contrats, Documents, Dashboard, Bulletins, Planning, Primes, Sante).
9. **Multi-tenant correct sur 95 % des pages client** via `useSocieteActive()` + `assertSocieteAccess` API.
10. **Chiffrement AES-256-GCM** sur bank credentials + MRA credentials (`lib/crypto/symmetric.ts`).
11. **IA réellement branchée** : Anthropic SDK (Claude Sonnet 4.6 + Haiku 4.5) sur `/client/nouvelle-facture-ia`, `/client/contrats/rediger`, Lex Banque, Lex Livre, Lex Factures, Lex OCR.
12. **Stack moderne** : Next 16.2 + React 19 + TS 5.7 strict + Tailwind v4 + Supabase ^2.100, 0 erreur TypeScript, 0 `@ts-ignore`.

---

## 7. Roadmap de remédiation priorisée

### 7.1 Hotfix (< 24h) — bloqueurs prod

| # | Item | Source | Effort |
|---|---|---|---|
| 1 | **SEC-001** patch route password + migration `413_password_reset_audit.sql` + audit log 90 derniers jours | W2-F | 30 min + review |
| 2 | **SEC-004** helper `lib/security/safe-equal.ts` + refactor 15 sites de comparaison secrets | W2-F | 1 jour |
| 3 | Quick wins liens cassés : `/login → /auth/login`, `/ohada → /inscription`, `/tarifs CTAs → /inscription`, `/juridique` retirer 2 liens cassés, `/rh/exports/virement → permanent redirect` | W2-A | 25-35 min, **-444 LOC** |
| 4 | IT Form 3 — corriger critère APS (revenu N-1 strict, pas CA) + plafond CSR (retirer le `> 10M`) | W2-D #2a/2b | 30 min |

### 7.2 Sprint 1 (1-2 semaines) — critiques fonctionnels

| # | Item | Source | Effort |
|---|---|---|---|
| 1 | **IFRS 10 consolidation V1** : appliquer les éliminations + translation IAS 21 (closing/avg rate) | W2-E | 3 jours |
| 2 | **SEC-002** migration `414_revoke_exec_sql` + retirer 5 callers | W2-F | 2 h |
| 3 | **SEC-003** migration `415_fix_rls_policies_phase2.sql` (32 tables) + tests E2E RLS | W2-F | 2 jours |
| 4 | Pages 100 % mock à brancher : `/admin/ohada`, `/comptable/tableau-de-bord`, `/comptable/bilan`, `/comptable/charges-sociales`, `/client/notifications` | W2-B | 5-7 h |
| 5 | `/client/profil` brancher Save + ChangePassword | W2-B #2 | 30-45 min |
| 6 | `/client/alertes` persister état lu/archivé (localStorage → table `client_alertes_state`) | W2-B #3 | 20 min - 3 h |
| 7 | `/client/parametres-rh` migration localStorage → Supabase (3 nouvelles tables `departements_rh`, `bureaux_rh`, `calendriers_travail` + réutilisation `conges_regles`, `jours_feries`, `groupes_employes` + 4 endpoints) | W2-C #1 | 1.5-2 jours |
| 8 | `/client/societe` brancher sur `useSocieteActive()` | W2-C #2 | 30 min - 1 h |
| 9 | CIT date_limite dynamique selon `cloture_exercice` société | W2-D #3 | 45 min |
| 10 | ROC directors/shareholders UI complète | W2-D #5 | 1 jour |

### 7.3 Sprint 2 (mois suivant) — refactor structurel

| # | Item | Source | Effort |
|---|---|---|---|
| 1 | **SEC-005** HMAC sur 56 endpoints internes Telegram + nonce store + migration n8n | W2-F | 1 semaine |
| 2 | **Découpage `app/api/comptable/rapprochement/route.ts`** (5235 lignes) vers `lib/accounting/rapprochement/*` | A10 | 1-2 semaines |
| 3 | Soumission MRA réelle (CIT/TDS/SFT/ROC) via robot Playwright `lib/telegram/mra-robot.ts` | W2-D #1 | 3-4 jours |
| 4 | SFT typologies réelles (cash > X, immobilier, devises…) | W2-D #4 | 2 jours |
| 5 | Migration partielle Server Components (cibles dashboard : `/client/tableau-de-bord`, `/direction`, `/admin`, `/comptable`) | A11 | 1 semaine |
| 6 | DataTable générique `@tanstack/react-table` + virtualisation pour factures/employes/fournisseurs | A11 | 1-2 semaines |
| 7 | Bannir couleurs hex inline + classes Tailwind hardcodées (44 % du codebase) | A11 | 3-5 jours |
| 8 | Ajouter `loading.tsx` + `error.tsx` + `not-found.tsx` par espace (`client`, `comptable`, `rh`, `admin`, `salarie`, `direction`) | A11 | 1 jour |
| 9 | Supprimer 12 composants orphelins (~3000 LOC) + 11 endpoints API morts | A10 | 2 h |
| 10 | Standardiser formulaires `react-hook-form + zod` sur `/client/nouvelle-facture` (1080 LOC) et `/rh/employes` (1626 LOC) | A11 | 1-2 semaines |

### 7.4 Backlog (3-6 mois) — refonte structurelle

| # | Item | Source | Effort |
|---|---|---|---|
| 1 | Refonte UX/UI loading/error/empty states (Skeletons partout, Loader2 plein-écran banni) | A11 | 1 semaine |
| 2 | Refonte design system tokens (dark mode prêt) | A11 | 1-2 semaines |
| 3 | IFRS 10 V2 : page de saisie éliminations + RPC `consolidate_aggregate_per_societe` + IFRS 3 fair value adjustment + IAS 36 impairment goodwill | W2-E | 2-3 semaines |
| 4 | CRS/FATCA XML schéma OCDE 2.0 complet (MessageSpec, ReportingFI, signature) | A5 | 1-2 semaines |
| 5 | Pillar Two : safe harbours (CbCR transitional 2024-2026), génération XML GIR OCDE, séparer IIR/UTPR/QDMTT | A5 | 1-2 semaines |
| 6 | TVA MRA export XML officiel (actuellement uniquement XLSX) | A3 | 1 semaine |
| 7 | Zod systématique sur 50 routes critiques (admin/*, comptable/*, telegram/webhook) | A9 | 1-2 semaines |
| 8 | Rate limiting global @upstash/ratelimit + Vercel KV | A9 | 3-5 jours |
| 9 | MFA TOTP/Telegram obligatoire pour admin/super_admin/direction/comptable + step-up sur cascade-delete/reset | A9 | 1-2 semaines |
| 10 | Migration partielle vers Server Components ciblée (dashboard + pages liste agrégat) | A10/A11 | 4-6 semaines |
| 11 | Refactor sidebars (9 fichiers → 1 `<RoleSidebar role="..." />`) | A10/A11 | 3-5 jours |
| 12 | Tests E2E Playwright sur les flux critiques (login → dashboard → facture → rapprochement → TVA → paie) | A10 | 2-3 semaines |
| 13 | Anonymisation utilisateur RGPD (cron mensuel `purge_anonymize_inactive_users(90d)`) | A9 | 3-5 jours |
| 14 | Cookie `active_societe_id` côté serveur (httpOnly + secure + samesite=strict) | A9 | 1-2 jours |
| 15 | Bilan IFRS 16 : intégrer ROU + lease liability dans actif/passif | A3 | 3-5 jours |
| 16 | Pentest externe 5 jours (Synacktiv / Lexfo / CERT-FR) | A9 | 5 jours externe |

---

## 8. Coûts estimés total

Hypothèses :
- 1 jour-h = 7 h dev senior fullstack TypeScript
- 1 sprint = 2 semaines = 10 jours-h
- Équipe cible : 2-3 développeurs + 1 review/QA

| Phase | Effort | Calendrier équipe 3 devs |
|---|---|---|
| Hotfix | ~2.5 jours-h | 24-48 h |
| Sprint 1 | ~12 jours-h | 1-2 semaines |
| Sprint 2 | ~35-40 jours-h | 1 mois |
| Backlog (16 items) | ~80-120 jours-h | 3-6 mois |
| **Total** | **~130-175 jours-h** | **5-7 mois** (équipe 3 devs) |

Hotfix tenable en 1 semaine avec 1 dev sécu. Sprint 1+2 tenable en 6 semaines avec 2-3 devs. Backlog réaliste sur trimestre 2 + trimestre 3.

---

## 9. Doublons et dead code à supprimer

### 9.1 URLs / pages

| URL/Fichier | Source | Action |
|-------------|--------|--------|
| `/login` (63 LOC) | A1 / W2-A | Redirect 308 → `/auth/login` (-51 LOC) |
| `/rh/exports/virement` (405 LOC) | A8 / W2-A | Redirect 308 → `/rh/exports/paie?tab=virements` (-394 LOC) |
| `/comptable/charges-sociales` (213 LOC) | A7 / W2-B | Redirect ou réécrire (clone de Balance) |
| `/comptable/rapports` (271 LOC) | A7 | Renommer en `/comptable/immobilisations` |
| `/client/tiers-consolidation` | A5 | Renommer en `/client/tiers-deduplication` |
| `/client/mra-fiscalisation` | A4 | Renommer en `/client/mra-ebs` ou `/client/einvoicing-mra` |
| `/client/mra-roc` | A4 | Renommer en `/roc-annual` (Companies Act, pas MRA) |
| `/comptable/mes-clients` (131 LOC) | A7 / A10 | Fusionner avec `/comptable/clients` (vue admin/collab adaptative) + corriger lien cassé `/comptable/grand-livre?societe_id=` |
| `/admin/ohada` (117 LOC) | A2 | Brancher sur données réelles OU supprimer |
| `/admin/lexora-tooling` (345 LOC) | A2 | Déplacer hors `/admin` (datasheet documentaire) |

### 9.2 Composants orphelins (12 fichiers, ~3000 LOC)

| Fichier | Source |
|---|---|
| `components/dashboard/dashboard-nav.tsx` | A10 |
| `components/dashboard/document-upload.tsx` | A10 |
| `components/video/HoverVideoCard.tsx` | A10 |
| `components/video/LazyVideo.tsx` | A10 |
| `components/video/ScrollVideo.tsx` | A10 |
| `components/video/VideoHero.tsx` | A10 |
| `components/editable/approval-workflow.tsx` | A10 |
| `components/editable/editable-bilan.tsx` | A10 |
| `components/editable/editable-chart-of-accounts.tsx` | A10 |
| `components/editable/editable-journal-entry.tsx` | A10 |
| `components/layout/AdminSidebarUnified.tsx` | A10 / A11 |
| `components/layout/ComptableSidebar.tsx` | A10 / A11 (remplacé par `ComptableSidebarNew`) |

### 9.3 Endpoints API morts (~11)

`/api/admin/backfill-releves-bancaires`, `/api/admin/diag-team-leader`, `/api/admin/diagnostic`, `/api/admin/recompute-conges-nb-jours`, `/api/admin/repair-orphan-documents`, `/api/admin/wra-statut-rapport`, `/api/alertes/generate`, `/api/generer-previsionnel`, `/api/me`, `/api/messages`, `/api/publier-document`.

### 9.4 Lib orphelines

`lib/tresorerie.ts`, `lib/process-document.ts`, `lib/bankFormats.ts`, `lib/tokens.ts`, `lib/types/index.ts`, `lib/credentials/employee-passwords.ts`, `lib/planning/presets.ts` (vs `ui-presets.ts`), `lib/ifrs/*` (7 moteurs uniquement référencés par leurs tests — code prod réimplémente).

### 9.5 Toast système

`components/ui/toaster.tsx` + `toast.tsx` + `use-toast.ts` → supprimer, garder uniquement Sonner.

---

## 10. Quick wins immédiats (< 1 jour total)

- 5 patches W2-A liens cassés → **-444 lignes** dead code, 25-35 min
- Hotfix SEC-001 (1h) → ferme la vulnérabilité critique
- IT Form 3 APS + CSR (30 min) → ferme risque régulatoire MRA
- `/client/profil` boutons Save + ChangePassword (30-45 min)
- `/client/notifications` brancher fetch (15 min)
- `/client/alertes` persister localStorage (20 min)
- `/comptable/mes-clients` corriger lien `/comptable/grand-livre?societe_id=` cassé (15 min)
- Supprimer 12 composants orphelins (~3000 LOC) + 11 endpoints morts (2 h)
- Refactor 9 sidebars en 1 composant `<RoleSidebar role="..." />` (~2000 LOC économisées) — 1 jour
- Ajouter `loading.tsx` + `error.tsx` + `not-found.tsx` à chaque espace — 1 jour

Total < 1 jour pour les 7 premiers items. Sur une semaine complète, on est à **-10 000 lignes** mortes/redondantes + 5 vulnérabilités critiques fermées + 4 pages mock branchées.

---

## 11. Recommandations finales

**Stratégie de remédiation** — 3 phases parallélisables :

**Phase 1 — Hotfix sécurité (semaine 1)** : Un dev sécu sur les CVEs SEC-001 à SEC-005 + un dev fullstack sur les quick wins W2-A (liens cassés) + corrections IT Form 3 (APS/CSR). Ces deux chantiers se font en parallèle sans interférence et fermeraient les 5 plus gros risques en 5 jours. La PR sécurité doit être reviewée par un 2e dev. La migration RLS Phase 2 (SEC-003) doit être déployée hors heures et testée avec ≥ 5 utilisateurs de sociétés différentes — c'est l'item le plus risqué techniquement.

**Phase 2 — Sprint fonctionnel (semaines 2-3)** : Focaliser sur les 4 pages mock (`/admin/ohada`, `/comptable/tableau-de-bord`, `/comptable/bilan`, `/comptable/charges-sociales`) + `/client/parametres-rh` (le seul item localStorage critique) + `/client/profil` + IFRS 10 V1 (éliminations + translation IAS 21). À l'issue de ces 2 semaines, l'app est cohérente fonctionnellement : plus aucune page n'affiche de mock en prod, et la consolidation IFRS 10 produit des états justes.

**Phase 3 — Sprint refactor (mois 2)** : Découpage `rapprochement/route.ts` (5235 lignes), migration partielle Server Components sur dashboards, refonte couleurs (44 % hardcodées → tokens DS), DataTable générique. Ce sprint est plus risqué (touche du code chaud) — recommander un freeze des features pendant 2 semaines + une suite de tests E2E sur les flux critiques avant de démarrer.

**Risques principaux** :
1. **Régression silencieuse** : 689 `as any` → un refactor peut casser des choses sans alerter TypeScript. Mitigation : tests E2E Playwright sur factures, paie, rapprochement, TVA en amont du sprint refactor.
2. **Coordination multi-sessions** : CLAUDE.md mentionne plusieurs domaines actifs en parallèle (RH/paie, comptable/PCM, banque, Telegram). Toutes les remédiations doivent se faire en branches courtes, mergées via PR dans `main` avec rebase systématique.
3. **Prod = pas de staging** : `dqepdoimpqhmuhkklxva` est la prod. Toute migration SQL impacte directement les vrais clients. Procéder par migrations idempotentes (`IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`) et tester en local avec un dump.

**Verdict GO/NO-GO** :
- **NO-GO production en l'état** (note 6.9/10) à cause des 5 CVE critiques + IFRS 10 cassée + 4 pages mock visibles utilisateurs.
- **GO conditionnel** après hotfix + Sprint 1 (~3 semaines) — note attendue **8.0/10**.
- **GO solide** après Sprint 1 + Sprint 2 (~6 semaines) — note attendue **8.5/10**.
- **Production-grade complète** après backlog (~5-7 mois) — note cible **9.0/10**.

Le SaaS Lexora a un produit **différenciant pour le marché mauricien** (PCM, MRA, IFRS Maurice, paie WRA, GBC Pillar Two, télégram-as-CFO). Le travail de remédiation est important mais bien cadré et concentré sur des items connus. Avec 3 devs et 6 semaines, l'app est en production solide.

---

## Annexes

### A.1 Index des 17 rapports détaillés

Tous dans `/home/user/v0-lexora-accounting-saa-s/docs/audit-partials/` :

**Vague 1 (11 audits)** :
- `01-public-auth.md` (21 KB, Agent 1 — 16 URLs)
- `02-admin.md` (22 KB, Agent 2 — 20 URLs)
- `03-client-compta-banque.md` (21 KB, Agent 3 — 24 URLs)
- `04-client-mra-fiscal.md` (18 KB, Agent 4 — 8 URLs)
- `05-client-gbc-conso.md` (24 KB, Agent 5 — 12 URLs)
- `06-client-fact-rh-contrats.md` (14 KB, Agent 6 — 37 URLs)
- `07-comptable.md` (16 KB, Agent 7 — 34 URLs)
- `08-rh-salarie-direction.md` (15 KB, Agent 8 — 45 URLs)
- `09-securite.md` (26 KB, Agent 9 — transversal STRIDE/OWASP)
- `10-code-quality.md` (16 KB, Agent 10 — transversal)
- `11-ux-ui.md` (22 KB, Agent 11 — transversal)

**Vague 2 (6 patches de remédiation)** :
- `wave2-A-quickwins.md` (19 KB — 5 patches liens cassés, -444 LOC)
- `wave2-B-mocks.md` (27 KB — 6 patches pages mock)
- `wave2-C-persistence.md` (26 KB — parametres-rh + societe)
- `wave2-D-mra-fiscal.md` (32 KB — 5 patches MRA fiscal)
- `wave2-E-ifrs10-conso.md` (25 KB — IFRS 10 consolidation V1)
- `wave2-F-secu-critique.md` (73 KB — 5 CVE SEC-001 à SEC-005)

### A.2 Skills Lexora référencées dans les audits

- **`lexora-mra-tds`** — règles TDS Section 111A ITA 1995 (10 catégories, taux, seuils) ; utilisée par `/client/mra-tds` et `lib/accounting/tds.ts`
- **`lexora-rapprochement-rules`** — règles R1-R7 du rapprochement Lex Banque (DDS→OCC miroirs, lettrage automatique, anomalies) ; utilisée par `/client/rapprochement`, `/comptable/rapprochement`, `app/api/comptable/rapprochement/route.ts`
- **`lexora-gbc-ifrs-complete`** — phases A→I (IAS 21 / PER / Substance/CIGA / TP / UBO / IFRS 10 conso / CRS-FATCA / Pillar Two / IFRS 16 leases) ; utilisée par tout le module `/client/gbc-*`
- **`lexora-ifrs9-ecl`** — moteur Expected Credit Loss IFRS 9 (stages 1/2/3, SICR, PD/LGD/EAD, macro scenarios) ; utilisée par `/client/ifrs9-ecl` et `lib/ifrs/ifrs9-ecl-engine.ts`

### A.3 Notes méthodologiques

- Audits réalisés en **statique uniquement** (aucun navigateur, aucune exécution). Pas de Lighthouse, pas de axe-core DevTools.
- Note globale = moyenne pondérée par nombre d'URLs (espaces fonctionnels) + 30 points par axe transversal (sécurité, code quality, UX/UI).
- Le périmètre couvre **196 URLs** sur les 198 pages `app/**/page.tsx` détectées (2 pages mineures non audited car layouts purs).
- Les patches Wave 2 sont des **propositions diffs**, non appliquées au code (mission strictement diagnostique).

---

**Fin du rapport AUDIT COMPLET — Lexora SaaS — 2026-05-24.**
