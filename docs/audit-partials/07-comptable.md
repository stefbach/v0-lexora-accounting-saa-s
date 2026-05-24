# AUDIT AGENT 7 — Espace COMPTABLE (34 URLs)

Repo : `/home/user/v0-lexora-accounting-saa-s`
Date : 2026-05-24
Périmètre : `app/comptable/**` + `app/api/comptable/**`

---

## Méthode

- Lecture de chaque page + repérage des `fetch(/api/...)` et `useParams`
- Vérif sélecteur société (multi-client/multi-société)
- Vérif RLS via API (`/api/comptable/clients` filtre par `role` : admin/comptable → tout ; comptable_dedie → uniquement `dossiers.comptable_id = user.id`)
- Détection mock/placeholder
- Notes /10 et modifs Hautes/Moyennes/Légères

Multi-tenant : la majorité des endpoints `app/api/comptable/**` utilisent
`getAdminClient()` (service role) + un filtre logique manuel sur
`dossiers.comptable_id` ou `assertSocieteAccess`. RLS Postgres est de fait
**bypassée**, c'est la couche API qui fait la sécurité. C'est cohérent mais
fragile : tout nouvel endpoint qui oublie le filtre = fuite de données.

---

## HUB / cabinet (6 URLs)

### 1. `/comptable` — Dashboard
`app/comptable/page.tsx` (532 l.) — Fetch `/api/comptable/clients` + `/documents` + `/alertes` + `/api/admin/users`. KPIs réels, table portefeuille, filtre par collaborateur. Multi-client OK (liste tous les clients accessibles). RLS via API filtrage par `comptable_id` pour `comptable_dedie`.
**Note : 8/10** — Mocks absents, données réelles. Modif L : `/api/admin/users` retourne 403 pour `comptable_dedie` (try/catch silencieux, mais assistants vide).

### 2. `/comptable/cabinet` — Dashboard cabinet Sprint 2
`app/comptable/cabinet/page.tsx` (583 l.) — Endpoint `/api/comptable/cabinet` dédié (KPIs CA YTD, impayés, retards, collaborateurs, tags). Onglets clients/collaborateurs/tags. Données réelles.
**Note : 8.5/10** — Code récent et propre. Le bouton « Entrer dans le dossier » (mode acting as client) est cité dans le commentaire pour Sprint 3 → vérifier statut. Modif M : exposer endpoint `/api/comptable/cabinet/acces` pour gérer les scopes.

### 3. `/comptable/equipe` — Gestion collaborateurs
`app/comptable/equipe/page.tsx` (1038 l.) — UI très lourde (clients + collaborateurs + dossiers + affectations). Endpoints `/api/admin/users` (POST/PATCH) + `/api/comptable/equipe/assign`. Multi-société OK.
**Note : 7/10** — Risque doublon partiel avec `/comptable/cabinet` (onglet collaborateurs). Modif M : factoriser dans un composant partagé.

### 4. `/comptable/societes` — Gestion sociétés
`app/comptable/societes/page.tsx` (463 l.) — CRUD sociétés + dossiers + liaison client. Fetch `/api/comptable/societes`. Multi-tenant correct.
**Note : 7.5/10** — Modif L : intégrer création société + dossier en une étape (actuellement séparé).

### 5. `/comptable/mes-clients` — Liste sociétés gérées (collaborateur)
`app/comptable/mes-clients/page.tsx` (131 l.) — Fetch `/api/comptable/mes-societes`. Vue compacte pour comptable_dedie avec actions rapides (GL/Documents/Paie/TVA).
**Note : 6.5/10** — **DOUBLON LOGIQUE** avec `/comptable/clients` (cf. ci-dessous). Liens internes redirigent vers `/comptable/grand-livre?societe_id=...` qui n'est **pas une route existante** (le grand livre est sous `/comptable/clients/[clientId]/[societeId]/grand-livre`). **Bug.**

### 6. `/comptable/clients` — Liste clients (admin)
`app/comptable/clients/page.tsx` (365 l.) — Table clients + dialog création + dossier. Endpoint `/api/comptable/clients` + `/api/admin/societes` + `/api/admin/dossiers`. Multi-tenant OK.
**Note : 8/10** — Bonne UX, création client + société groupée. **DOUBLON apparent** avec `mes-clients` (cf. plus bas).

---

## CLIENT > SOCIÉTÉ (11 URLs)

### 7. `/comptable/clients/[clientId]`
`app/comptable/clients/[clientId]/page.tsx` (709 l.) — Fiche client : infos + liste sociétés + alertes + financiers par société. Fetch `/api/comptable/clients` + `/api/client/financial?client_id=X&societe_id=Y` + `/api/comptable/etats-financiers`.
**Note : 8/10** — Données réelles, links modules présents.

### 8. `/comptable/clients/[clientId]/[societeId]` — Hub société
`app/comptable/clients/[clientId]/[societeId]/page.tsx` (1259 l.) — Mega-hub : fournisseurs, factures clients, banque, salaires, charges, TVA, GL, alertes. Multi-fetch sur 6+ endpoints. Très complet.
**Note : 8/10** — Hub volumineux. Modif L : découper en composants (1259 lignes).

### 9. `/comptable/clients/[clientId]/[societeId]/tableau-de-bord`
`app/comptable/clients/[clientId]/[societeId]/tableau-de-bord/page.tsx` (231 l.) — **100% MOCK** : scores A/B hardcodés, trésorerie hardcodée (MCB, SBM, CIC), `societeName = "TIBOK Ltd"`.
**Note : 2/10** — Modif H : brancher sur données réelles (`/api/client/financial` + scores calculés).

### 10. `/comptable/clients/[clientId]/[societeId]/balance` — Balance
`app/comptable/clients/[clientId]/[societeId]/balance/page.tsx` (384 l.) — Vrai fetch `/api/comptable/balance?societe_id=X`. Affichage par classe, équilibre D=C, filtres date/exercice.
**Note : 9/10** — Excellent. Données réelles.

### 11. `/comptable/clients/[clientId]/[societeId]/grand-livre` — Grand livre
`app/comptable/clients/[clientId]/[societeId]/grand-livre/page.tsx` (540 l.) — Fetch `/api/comptable/grand-livre` avec pagination, lettrage, filtres rapides par classe (411, 401, 512…). Export XLSX.
**Note : 9/10** — Top.

### 12. `/comptable/clients/[clientId]/[societeId]/bilan`
`app/comptable/clients/[clientId]/[societeId]/bilan/page.tsx` (347 l.) — **100% MOCK** : actifs/passifs hardcodés, `societeName = "TIBOK Ltd"`, exercices hardcodés. Aucun fetch.
**Note : 2/10** — Modif H : brancher sur `/api/comptable/etats-financiers?type=bilan`.

### 13. `/comptable/clients/[clientId]/[societeId]/far` — Financial Audit Report
`app/comptable/clients/[clientId]/[societeId]/far/page.tsx` (415 l.) — Annual Allowance Schedule MRA (catégories commercial_premises, motor_vehicles, etc. avec taux 5/25/20/50/20%). Fetch `/api/comptable/annual-allowance`. CRUD actifs, calcul TWDV.
**Note : 8/10** — FAR = en fait **Fixed Asset Register / Annual Allowance MRA**, pas un audit report. Naming trompeur. Données réelles.

### 14. `/comptable/clients/[clientId]/[societeId]/annual-return` — Annual Return ROC
`app/comptable/clients/[clientId]/[societeId]/annual-return/page.tsx` (866 l.) — Annual Return Registrar of Companies : actionnaires, administrateurs, capital social. Endpoints `/api/comptable/roc/*`. Très complet.
**Note : 8.5/10** — Sérieux. Modif L : génération PDF Companies Act.

### 15. `/comptable/clients/[clientId]/[societeId]/it-form3` — IT Form 3
`app/comptable/clients/[clientId]/[societeId]/it-form3/page.tsx` (445 l.) — Income Tax Form 3 (corporate). Calcul revenus, déductions, APS, CSR, impôt. Fetch `/api/comptable/it-form3`.
**Note : 8/10** — Formules MRA implémentées. Modif L : vérifier taux IS 2025-2026 + intégration FAR.

### 16. `/comptable/clients/[clientId]/[societeId]/previsionnel`
`app/comptable/clients/[clientId]/[societeId]/previsionnel/page.tsx` (375 l.) — Fetch `/api/client/previsionnel?client_id=X` (IA). Compare prévision vs réel, trésorerie J+30/60/90, analyses IA. Données dynamiques.
**Note : 7/10** — Modif M : prévisionnel devrait passer par `societe_id` aussi (pas seulement client_id) pour le multi-société.

### 17. `/comptable/clients/[clientId]/[societeId]/simulations`
`app/comptable/clients/[clientId]/[societeId]/simulations/page.tsx` (408 l.) — Simulations what-if (embauche, invest, emprunt). Fetch direct Supabase `simulations` table par `societe_id`. Génération via IA.
**Note : 7.5/10** — OK. Modif L : passer par API au lieu de `createClient()` direct.

---

## TRANSVERSE (17 URLs)

### 18. `/comptable/factures-clients`
`app/comptable/factures-clients/page.tsx` (327 l.) — Fetch `/api/comptable/factures?type=client`. Filtre par société, CRUD facture. Données réelles.
**Note : 8/10**.

### 19. `/comptable/fournisseurs`
`app/comptable/fournisseurs/page.tsx` (281 l.) — Idem côté fournisseur. `/api/comptable/factures?type=fournisseur`.
**Note : 8/10**.

### 20. `/comptable/banque`
`app/comptable/banque/page.tsx` (532 l.) — Multi-société (sélecteur). Comptes bancaires, soldes, releves, upload PDF. Fetch `/api/comptable/banque`. Miroir de `/client/banque`.
**Note : 8.5/10**.

### 21. `/comptable/rapprochement` — Lex Banque
`app/comptable/rapprochement/page.tsx` (1343 l.) — Agent IA "Lex Banque" : suggestions, validation, lettrage manuel. Fetch `/api/agent/rapprochement` + `/api/comptable/rapprochement?action=lettrer_manuel`. Critique métier (cf skill `lexora-rapprochement-rules`).
**Note : 8.5/10** — Modif M : exposer les règles R1-R7 dans la sidebar pour debug.

### 22. `/comptable/tva`
`app/comptable/tva/page.tsx` (490 l.) — Déclaration TVA MRA (9 boxes), statut, date_limite, pénalités retard. Fetch `/api/comptable/tva`. Multi-société.
**Note : 8.5/10**.

### 23. `/comptable/salaires`
`app/comptable/salaires/page.tsx` (187 l.) — Vue **agrégée** des comptes 64x via `/api/comptable/balance`. Estimation charges (CSG/NSF/HRDC) **basée sur taux moyens hardcodés** (CSG 4.5%, NSF 2.5%, HRDC 1%). **Pas de paie réelle par employé** (cf espace RH).
**Note : 6/10** — Modif M : brancher sur la paie réelle (`/api/rh/paie`) au lieu de proxy balance + estimations. Aujourd'hui c'est une approximation.

### 24. `/comptable/charges-sociales`
`app/comptable/charges-sociales/page.tsx` (213 l.) — **⚠️ FICHIER MAL NOMMÉ** : c'est en fait une page **Balance** (`/api/comptable/balance` + affichage par classe). Aucune logique charges sociales. Probablement un copier-coller cassé.
**Note : 3/10** — Modif H : soit renommer (mais URL `/charges-sociales` reste), soit réécrire avec vraies données CSG/NSF/PAYE depuis paie RH.

### 25. `/comptable/cloture`
`app/comptable/cloture/page.tsx` (248 l.) — Wrapper UI pour `/api/comptable/cloture` : clôture mensuelle (IAS 19, TDS, IFRS 15, IFRS 9 ECL), clôture annuelle (RAN auto), réévaluation change IAS 21, test dépréciation IAS 36.
**Note : 8.5/10** — Solide. UI affiche le JSON brut résultat (à embellir, modif L).

### 26. `/comptable/inter-societes`
`app/comptable/inter-societes/page.tsx` (431 l.) — Validation des **miroirs** auto-générés par le rapprochement bancaire (R5 — virements DDS→OCC). Lecture seule en V1, actions optimistes locales. Endpoint `/api/comptable/inter-societes`.
**Note : 7/10** — Modif M : routes write (valider/supprimer) à livrer (cité dans en-tête JSDoc V2).

### 27. `/comptable/interco`
`app/comptable/interco/page.tsx` (511 l.) — **Différent de `inter-societes`** : c'est la **réconciliation comptable inter-companies** (créances/dettes A↔B, écarts, statuts reconcilie/litige). Endpoint `/api/comptable/interco/reconciliation`.
**Note : 7.5/10**.

### 28. `/comptable/rapports` — ⚠️ MAL NOMMÉ
`app/comptable/rapports/page.tsx` (271 l.) — En réalité = **Immobilisations** (CRUD immo + amortissements). Fonctionnel. Mais le nom de la route suggère "Rapports" alors que la fonction est registre des immobilisations.
**Note : 5/10** — Modif M : renommer en `/comptable/immobilisations` OU créer un vrai hub "Rapports". Manque les rapports synthétiques (CA YTD, PNL, bilan, FAR, IT3) en un seul endroit.

### 29. `/comptable/documents`
`app/comptable/documents/page.tsx` (272 l.) — Liste documents tous clients, filtres statut/type. Fetch `/api/comptable/documents`. Multi-tenant via API.
**Note : 8/10**.

### 30. `/comptable/contrats`
`app/comptable/contrats/page.tsx` (337 l.) — Liste contrats avec statut (brouillon/révision/signé/archivé). Utilise `useSocieteActive`. CRUD via `/api/contrats` (à vérifier).
**Note : 7.5/10**.

### 31. `/comptable/contrats/[id]`
`app/comptable/contrats/[id]/page.tsx` (479 l.) — Détail contrat + versions + parties + montant. Édition statut.
**Note : 7.5/10**.

### 32. `/comptable/contrats/[id]/rediger`
`app/comptable/contrats/[id]/rediger/page.tsx` (431 l.) — Mode rédaction IA conversationnelle (`conversation_ia`, `contenu_html`). Sympa.
**Note : 8/10**.

### 33. `/comptable/alertes`
`app/comptable/alertes/page.tsx` (388 l.) — Alertes fiscales/comptables/sociales tous clients. Fetch `/api/comptable/alertes`. Filtres severity + deadline.
**Note : 8/10**.

### 34. `/comptable/sante-pcm` — Santé Plan Comptable Mauricien
`app/comptable/sante-pcm/page.tsx` (507 l.) — **Vraies vérifs** via vue SQL `migration 303` : déséquilibre D≠C global + par journal + par folio, écritures orphelines, comptes hors PCG. Score 0-100, couleur vert/orange/rouge. Cache 60s.
**Note : 9.5/10** — Excellent — c'est l'audit comptable temps réel.

---

## DOUBLONS / Conflits détectés

1. **🔴 `/comptable/inter-societes` vs `/comptable/interco`** (signalé en consigne)
   - `inter-societes` = validation des miroirs auto-générés par rapprochement (BNQ R5)
   - `interco` = réconciliation comptable inter-companies (créances/dettes A↔B)
   - **Pas un vrai doublon fonctionnel** mais **nommage très confus**. Recommandation : renommer en `/comptable/rapprochement-miroirs` et `/comptable/interco-reconciliation` pour clarté.

2. **🟠 `/comptable/clients` vs `/comptable/mes-clients`** (signalé en consigne)
   - `clients` = vue admin (toutes), avec création client + société
   - `mes-clients` = vue collaborateur (uniquement sociétés assignées)
   - **Pas un vrai doublon** mais **différenciation par rôle non explicite dans l'URL**. Le `dashboard /comptable` a déjà un filtre similaire. Recommandation : fusionner en une page unique avec switch admin/collab.
   - **Bug actif** : `mes-clients` génère des liens `/comptable/grand-livre?societe_id=...` qui n'existent pas (le GL est sous `/comptable/clients/[clientId]/[societeId]/grand-livre`).

3. **🟠 `/comptable/rapports` mal nommé** — c'est en fait Immobilisations.

4. **🔴 `/comptable/charges-sociales` mal nommé** — c'est un copier-coller de la Balance, aucune logique charges sociales réelle.

5. **🟠 `/comptable/salaires`** — utilise des estimations sur compte 64 au lieu de la paie réelle de l'espace RH.

---

## Synthèse

**Note moyenne : 7.3/10** (34 URLs, moyenne pondérée)

### 3 highlights critiques
1. **🔴 `/comptable/charges-sociales` n'est PAS une page charges sociales** : c'est un clone cassé de la Balance par classe. Aucune logique CSG/NSF/PAYE. À réécrire ou à supprimer si redondant avec `/comptable/salaires`.
2. **🔴 Pages 100% MOCK : `tableau-de-bord` et `bilan`** dans `/comptable/clients/[clientId]/[societeId]/*` — affichent "TIBOK Ltd" + chiffres en dur. À brancher sur `/api/client/financial` et `/api/comptable/etats-financiers?type=bilan`.
3. **🟠 Confusion sémantique massive** : `interco` vs `inter-societes`, `rapports` (=immo), `charges-sociales` (=balance), `mes-clients` vs `clients`. Renommer/fusionner pour réduire la dette mentale.

### Modifs Hautes
- Réécrire `charges-sociales` ou la supprimer (H)
- Brancher `tableau-de-bord` société sur données réelles (H)
- Brancher `bilan` société sur états financiers (H)
- Corriger lien cassé dans `mes-clients` vers `/comptable/grand-livre?societe_id=...` (H)

### Modifs Moyennes
- Renommer/fusionner `rapports` → `immobilisations`, ou créer un vrai hub rapports (M)
- `salaires` : connecter sur paie réelle RH au lieu de l'estimation 64x (M)
- `inter-societes` V2 : ajouter routes write valider/supprimer (M)
- Fusionner `clients` + `mes-clients` derrière un seul écran adaptatif (M)

### Modifs Légères
- Découper le hub société (1259 l.) en sous-composants (L)
- Le résultat `cloture` affiche du JSON brut → composer un récap visuel (L)
- `simulations` : passer par API au lieu de createClient() direct (L)

### Points forts
- `/comptable/sante-pcm` (9.5/10) — surveillance temps réel via vue SQL
- `/comptable/clients/[clientId]/[societeId]/balance` et `/grand-livre` (9/10) — propres
- `/comptable/cloture` — orchestre IFRS 9/15/19, IAS 21/36 correctement
- `/comptable/rapprochement` — agent Lex Banque + skill `lexora-rapprochement-rules` aligné
- Sécurité multi-client : API fait le filtrage par `dossiers.comptable_id` pour `comptable_dedie`. À auditer endpoint par endpoint car RLS Postgres est bypassée par service_role.

### Trous fonctionnels
- Pas de page "Rapports" unifiée (PNL/Bilan/CA/Marge consolidée)
- Pas de mode "acting as client" (Sprint 3 cité dans `/comptable/cabinet`)
- Pages mock (`tableau-de-bord`, `bilan`) cassent l'illusion de produit fini
