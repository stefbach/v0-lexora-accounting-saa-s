# Roadmap 9 → 10 — Les 10 derniers points vers la perfection

> **Contexte** : la roadmap V5 a fait passer Lexora d'une note ~7/10 à
> **9/10** (sécurité RLS, tests Playwright, docs conformité, audit
> trail, SOD, CI/CD durcie). Ce document liste les **10 axes restants**
> pour atteindre 10/10 et un **backlog d'évolutions** ultérieures.
>
> Date : 2026-05-24 — Branche : `roadmap/v5-tests-docs`

---

## 🎯 Les 10 points pour atteindre 10/10

### 1. Refactor `SocieteActiveProvider` → cookie httpOnly + RSC
- **Problème actuel** : société active stockée en `localStorage`, force
  tout l'arbre en `"use client"` (≈90% du code en client components).
- **Cible** : cookie httpOnly signé, lecture en Server Component via
  `cookies()`, mutation via Server Action.
- **Impact** : -30% bundle JS first-load, gain SEO + LCP.
- **Effort** : 3-5 j (gros refactor providers + hooks).

### 2. Refactor i18n `localStorage` → cookie
- **Problème** : la langue est lue côté client → flash de contenu (FOUC)
  et pages publiques bloquées en client.
- **Cible** : cookie `lexora-locale` lu en RSC, dictionnaire chargé
  côté serveur (`next-intl` ou maison).
- **Impact** : pages marketing/login en pur RSC, SEO multilingue propre.
- **Effort** : 2 j.

### 3. Migration RSC complète (90% client → 50% RSC)
- **Objectif** : convertir toutes les pages de listing (`/comptable/factures`,
  `/rh/salaries`, `/comptable/ecritures`…) en Server Components avec
  pagination/filtres via `searchParams`.
- **Dépend de** : #1 et #2.
- **Impact** : -40% bundle JS global, TTI <2 s.
- **Effort** : 5-8 j (refactor par module).

### 4. Performance — Core Web Vitals verts
- **Cibles** : **LCP < 2.5 s**, **INP < 200 ms**, **CLS < 0.1** sur
  les 10 routes les plus visitées (mesuré via Vercel Speed Insights).
- **Actions** : lazy-load des `@react-pdf/renderer`, code-split des
  graphiques Recharts, `next/image` partout, font-display swap, suppression
  des polices non utilisées.
- **Effort** : 3 j + monitoring continu.

### 5. Internationalisation EN complète
- **État actuel** : ~70% des clés traduites en anglais, le reste tombe
  en français.
- **Cible** : 100% des clés FR/EN, script CI qui échoue si une clé EN
  est manquante.
- **Bonus** : ajouter ES, PT (utile pour OHADA + Mauritius offshore).
- **Effort** : 2 j (extraction + traduction assistée IA + revue humaine).

### 6. Multi-juridiction — finaliser OHADA (15 pays)
- **État actuel** : socle OHADA en place (PCG SYSCOHADA, TVA générique).
- **Manque** : taux TVA spécifiques par pays (CI 18%, SN 18%, CM 19.25%,
  BJ 18%…), déclarations fiscales locales (DGI Côte d'Ivoire, DGID
  Sénégal), formats e-invoicing locaux.
- **Effort** : 1-2 j par pays × 15 = ~20 j (peut être étalé / priorisé
  par marché commercial).

### 7. AI assistant — Lex IA conversationnelle
- **Vision** : chatbot intégré (sidebar global) capable de :
  - répondre aux questions comptables ("où passer cet achat ?")
  - générer écritures à partir de description naturelle
  - expliquer un solde, un rapprochement, une déclaration
  - guider l'onboarding nouveaux utilisateurs.
- **Stack** : Claude API + RAG sur PCG + historique société + skills
  Lexora (`lexora-mra-tds`, `lexora-ifrs9-ecl`, `lexora-gbc-ifrs-complete`).
- **Effort** : 8-10 j MVP + itérations.

### 8. Reporting avancé — pivot tables + exports BI
- **Manque actuel** : reports figés (balance, GL, compte de résultat).
- **Cible** : moteur de pivot type Excel, drill-down, export
  Parquet/CSV vers Power BI / Metabase / Looker, dataset modèle
  sémantique.
- **Effort** : 5 j (intégrer `@silevis/reactgrid` ou WebDataRocks).

### 9. Mobile — PWA + Capacitor iOS/Android
- **Étape 1** : PWA complète (manifest, service worker, offline-first
  pour saisie note de frais).
- **Étape 2** : wrapper Capacitor pour App Store / Play Store
  (notifications push natives, scan OCR via caméra native).
- **Effort** : 4 j PWA + 6 j Capacitor.

### 10. Audit externe — validation par cabinet sécurité tiers
- **Cible** : pentest + audit SOC 2 type I par cabinet certifié
  (ex : Synacktiv, Wavestone, ou cabinet local Maurice/France).
- **Livrables** : rapport de pentest, plan de remédiation, attestation
  utilisable commercialement (gros comptes / GBC clients).
- **Coût indicatif** : 15-30 k€ / 30-60 k MUR selon scope.
- **Effort interne** : 2 j préparation + 5 j remédiation post-audit.

---

## 📚 Backlog évolutions (post-10/10)

- **Open Banking temps réel** : intégration AISP (Bridge API, Tink,
  Budget Insight) pour récupérer relevés bancaires automatiquement
  plutôt que via upload PDF/CSV.
- **Signature électronique qualifiée (eIDAS)** : intégration Yousign /
  DocuSign Advanced pour signatures juridiquement opposables (contrats
  RH, conventions, lettres de mission).
- **Marketplace de templates contrats** : bibliothèque communautaire
  (CDI Maurice, CDI OHADA par pays, contrats fournisseur, NDA…), avec
  système de notation + revue juridique.
- **Workflow approval avancé** : moteur de workflow configurable
  (approbations multi-niveaux, délégations en cas d'absence, seuils
  par montant/centre de coût, escalade automatique).
- **Notifications push web** : Web Push API pour alertes temps réel
  (échéance facture, validation requise, anomalie rapprochement) sans
  besoin d'app mobile.
- **Module immobilisations avancé** : amortissements dégressifs,
  composants IAS 16, réévaluation, cessions partielles.
- **Consolidation multi-sociétés** : IFRS 10 full consolidation,
  élimination des intra-groupe, conversion devises IAS 21.
- **Module budgétaire** : prévisionnel par centre de coût, suivi
  budget/réalisé, projections cash 13 semaines.

---

## 📊 Synthèse priorisation

| # | Axe | Effort | Impact | Priorité |
|---|-----|--------|--------|----------|
| 1 | SocieteActiveProvider cookie | 3-5 j | 🔥🔥🔥 | P0 |
| 2 | i18n cookie | 2 j | 🔥🔥 | P0 |
| 3 | Migration RSC | 5-8 j | 🔥🔥🔥 | P1 (dépend #1, #2) |
| 4 | Core Web Vitals | 3 j | 🔥🔥 | P1 |
| 5 | i18n EN 100% | 2 j | 🔥 | P2 |
| 6 | OHADA 15 pays | 20 j | 🔥🔥 | P2 (commercial-driven) |
| 7 | Lex IA chatbot | 8-10 j | 🔥🔥🔥 | P1 |
| 8 | Reporting BI | 5 j | 🔥 | P2 |
| 9 | PWA + Capacitor | 10 j | 🔥🔥 | P2 |
| 10 | Audit externe | 7 j + budget | 🔥🔥🔥 | P0 (vente B2B) |

**Quick wins (Q3 2026)** : #1, #2, #4, #10
**Mid-term (Q4 2026)** : #3, #5, #7
**Long-term (2027)** : #6, #8, #9 + backlog
