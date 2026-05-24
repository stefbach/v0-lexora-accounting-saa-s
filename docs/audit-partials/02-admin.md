# Audit partiel — ADMIN (back-office Lexora)

**Périmètre** : 20 URLs sous `/admin` (super-admin Lexora).
**Auditeur** : Agent 2.
**Date** : 2026-05-24.

## Synthèse

L'espace `/admin` est globalement **bien structuré et solide** :

- Le layout `app/admin/layout.tsx` impose une garde serveur stricte (`admin` ou `super_admin` uniquement, sinon redirect `/redirect`). Aucune fuite côté layout.
- Les routes destructives critiques (**purge / repair / reset-societe**) implémentent le triple garde-fou attendu : (a) revérification du rôle dans le route handler avec service-role client, (b) confirmation textuelle obligatoire (`DELETE_HARD`, `RESET_COMPLET`, ou nom de société à retaper), (c) journalisation `audit_trail` + scoping `societe_id` pour empêcher un opérateur de wiper la mauvaise cible.
- `/admin/health` est une **véritable** sonde santé (10 check_ids exécutés en SQL, pas de mock), idempotente et `force-dynamic`.
- `/admin/lexora-billing` (facturation interne DDS → clients SaaS) couvre tout le cycle : KPI, table, paiement manuel, relance multi-canal, émission, rapprochement bancaire dédié, paramètres émetteur (BRN/IBAN/comptes compta).
- La majorité des endpoints `/api/admin/*` revérifient `role IN ('admin','super_admin')` (cf. `route.ts` de users / parametres / plans / lexora-billing / services / health / repair / cascade-delete).

**Points noirs** :

1. `/admin/ohada` est **100 % hardcodé** (mock pur — toutes les juridictions à `status: READY` et `companies: 0`).
2. `/admin/reset-societe` accepte **`comptable` et `comptable_dedie`** côté route (`/api/comptable/reset-complet`), pas seulement admin → un comptable d'un cabinet peut déclencher un reset nucléaire sur les sociétés auxquelles il a accès (mitigé par `assertSocieteAccess`, mais le périmètre est large vu la criticité).
3. `/admin/clients` (ainsi que `users`, `societes`) utilise des `window.confirm()` natifs pour des actions modifiables (changement de rôle, délier comptable, soft delete) — pas un blocker mais l'UX devrait converger vers `AlertDialog` à la `CascadeDeleteButton`.
4. `/admin/parametres` stocke des secrets (`wati_token`) en clair dans Supabase — il faudrait au minimum chiffrer côté DB (pgsodium) ou les sortir vers les env vars / Vault.
5. `audit_trail` n'est utilisé QUE par `cascade-delete` ; **`/admin/reset-societe` et `/admin/repair` ne loggent PAS** dans `audit_trail` (alors qu'ils sont tout aussi destructifs).

**Note moyenne** : **7.7 / 10**.

---

## /admin (dashboard) — 8/10

**Fichier** : `app/admin/page.tsx` (467 lignes).
**Données** : `profiles`, `societes`, `documents`, `dossiers`.

- Compile, imports OK, full client component avec `useEffect` qui chunque jamais.
- KPI réels (count exact pour societes/documents, comptage côté JS pour comptables/clients/dossiers).
- États loading (`Loader2` central) et empty handlés ; pas d'état d'erreur visuel — un `console.error` silencieux.
- Aucune action destructive, juste de la navigation. Pas de RLS pour les admins (table `profiles` interrogée directement côté client — admin est censé voir tout, OK si les policies `profiles` autorisent les admins).
- **Bémol** : 4 appels Supabase séquentiels (profiles, societes count, docs count, dossiers, documents) → 5 round-trips. Sur un grand tenant ça monte vite. Recommandation : un endpoint `/api/admin/dashboard-kpis` agrégé côté serveur.

**Modifs prio** :
- **M** Endpoint agrégé pour les KPIs.
- **L** Carte erreur si une des fetch échoue.

---

## /admin/clients — 7.5/10

**Fichier** : `app/admin/clients/page.tsx` (501 lignes).
**API** : `/api/admin/users`, `/api/admin/societes`, `/api/admin/dossiers`.

- Tabs Clients / Sociétés, CRUD complet (créer client, créer société, lier sociétés à un client existant via dossiers).
- Auto-création d'une société personnelle si pas de société pré-sélectionnée → bonne UX onboarding.
- Toasts de succès auto-dismiss (5 s), gestion erreur per-form.
- Tous les boutons branchés à de vrais endpoints. Pas de mock.
- **Bémol 1** : `Promise.allSettled` sur les `POST /api/admin/dossiers` masque les échecs partiels (`success` affiché même si certaines liaisons ont échoué).
- **Bémol 2** : pas d'action de **suppression** d'un client depuis cette page (il faut aller dans `/admin/users`) — l'UX est dispersée.

**Modifs prio** :
- **M** Remonter les échecs `Promise.allSettled` à l'utilisateur.
- **L** Action "déconnecter société" depuis la card.

---

## /admin/comptables — 7/10

**Fichier** : `app/admin/comptables/page.tsx` (461 lignes).
**API** : `/api/admin/comptables/assignations`, `/api/admin/comptables/profil`, `/api/rh/employes`.

- Assignations comptable ↔ société avec type d'accès (`comptable`, `read_only`, `dedie`), notes.
- Édition du `type_comptable` (interne / externe / dedié) avec dropdown employé interne quand `interne`.
- Le POST `assignations` track `assigne_par: adminUser.id` — bonne base pour l'audit.
- **Bémol** : pas de bouton "supprimer une assignation" visible sur la table (mais l'API DELETE existe au vu de la migration). Vérifié dans le code : on ne voit qu'un POST.
- **Bémol** : `setSaving(false)` arrive après `load()`, qui peut lui-même throw — pas catché.

**Modifs prio** :
- **M** Bouton "retirer assignation".
- **L** Try/catch propre autour de `assigner`.

---

## /admin/demandes-inscription — 8.5/10

**Fichier** : `app/admin/demandes-inscription/page.tsx` (454 lignes).
**API** : `/api/admin/demandes-inscription`, `/api/plans`.

- Workflow complet validation / refus avec raison obligatoire.
- Validation crée optionnellement la société, attribue plan + tarif final personnalisé.
- Tabs `en_attente` / `validee` / `refusee` avec compteurs.
- Dialog de validation avec ajustement de modules + tarif final → CRUD complet et bien conçu.
- **Excellent** sur la partie sécurisé : refus oblige une `rejected_reason` non vide.

**Modifs prio** : aucune urgente. Améliorer la doc UI sur les champs `cabinet_data` / `societe_data` (JSON brut affiché).

---

## /admin/documents — 7.5/10

**Fichier** : `app/admin/documents/page.tsx` (371 lignes).
**API** : `/api/admin/documents`, `/api/documents/bulk-delete`.

- Stats par statut (total / traité / en_attente / en_cours / erreur), filtres (type, statut, société), recherche par nom.
- Bulk delete avec confirmation (`window.confirm` — destructif → devrait être un AlertDialog).
- Action delete individuelle ligne par ligne via `/api/documents/${id}`.
- Aucun mock.
- **Bémol** : `confirm()` natif + `alert()` pour les échecs partiels → UX faible pour une action irréversible qui supprime aussi les écritures liées.

**Modifs prio** :
- **H** Remplacer `confirm`/`alert` par un AlertDialog avec input "SUPPRIMER" (déjà existant via `CascadeDeleteButton`).
- **L** Pagination/virtualisation au-dessus de 500 docs.

---

## /admin/forex — 6/10

**Fichier** : `app/admin/forex/page.tsx` (51 lignes).
**Composants** : `LiveRatesWidget`, `CurrencyConverter`.

- Affiche 3 widgets de taux temps réel (EUR/USD/MUR base) + un convertisseur.
- Read-only, données ECB/Frankfurter via composants.
- Liste hardcodée des 10 "devises principales" — purement décorative.
- Pas d'actions admin, pas de configuration. C'est plus un mini-outil qu'une vraie page admin → place dans `/admin` discutable.

**Modifs prio** :
- **M** Ajouter une vraie config admin : seuils d'alerte sur taux, override manuel de `taux_change_eur_mur` pour les écritures, historique d'audit des taux utilisés.

---

## /admin/health — 9.5/10

**Fichier** : `app/admin/health/page.tsx` (355 lignes).
**API** : `/api/admin/health/route.ts` (557 lignes).

- **VRAIE** sonde santé, pas un mock. 10 checks SQL réels : `factures_sans_ecriture_vte`, `factures_sans_ecriture_ach`, `factures_paye_sans_bnq`, `ecritures_3digit_bare`, `ecritures_6digit_bare`, `soldes_411_anormaux`, `ecritures_desequilibrees`, `factures_devise_non_mur_sans_montant_mur`, `classifications_doublons`, `comptes_resultat_lettres`.
- Auth strict (`requireAdmin` interne au handler), `maxDuration = 60`, `force-dynamic`.
- Idempotent — bouton Refresh inoffensif. Chunking sur les `in()` pour respecter les URL limits.
- UI : summary 4 cards (total/passed/failed/warnings), tri fail → warn → pass, badges sévérité, expand pour voir 10 détails par check au format JSON.
- Excellente couverture des bug classes connues (R03/R04 BNQ doublons, R7 P&L lettré, multi-devise sans montant_mur, écritures déséquilibrées hors BNQ).

**Modifs prio** :
- **L** Ajouter export CSV des occurrences anormales.
- **L** Programmer un cron quotidien qui poste le résumé sur Telegram/Slack admin.

---

## /admin/lexora-billing — 8.5/10

**Fichier** : `app/admin/lexora-billing/page.tsx` (470 lignes).
**API** : `/api/admin/lexora-billing` (route.ts + `[id]/` + `emit/` + `reconcile/` + `settings/`).

- KPIs (total facturé, payé, impayé, en retard) + table filtrable.
- Statuts complets : `brouillon`, `emise`, `partiellement_payee`, `payee`, `en_retard`, `annulee` + auto-passage en `en_retard` côté GET (`update().in('id', overdueIds)` — effet de bord lors d'un GET, légèrement non-RESTful mais pratique).
- Actions : voir PDF, marquer payée (avec ref), annuler, relancer multi-canal (`email` / `telegram` / `sms` / `whatsapp`), émettre une facture depuis un plan.
- Auth strict côté API.
- Customer snapshot stocké à l'émission (`customer_snapshot: jsonb`) → bon pattern pour figer le destinataire.
- **Bémol** : aucune protection anti-double-émission (rien n'empêche d'émettre 2 fois la même période).

**Modifs prio** :
- **M** Idempotency key sur `emit/` (societe_id + period + plan_id).
- **L** Sortir l'auto-update `en_retard` du GET vers un cron dédié.

---

## /admin/lexora-billing/parametres — 8/10

**Fichier** : `app/admin/lexora-billing/parametres/page.tsx` (179 lignes).
**API** : `/api/admin/lexora-billing/settings` (singleton `lexora_settings`).

- Form complet : identité DDS (raison sociale, BRN, VAT, capital, adresse), banque (IBAN/SWIFT/banque/compte), intégration compta (`societe_id`, `dossier_id`, comptes 411/706/4457, journal vente), facturation (préfixe, TVA défaut, délai), calendrier de relance.
- PUT idempotent, message succès/erreur, autosave OFF (explicite, save button).
- Note explicite : "Sans `dossier_id` renseigné, les factures sont émises mais aucune écriture comptable n'est créée" — bonne UX.
- **Bémol** : pas de validation BRN/IBAN/SWIFT côté front. Saisir un IBAN invalide est silencieusement accepté.

**Modifs prio** :
- **L** Validation regex BRN (`C\d{7,8}`) et IBAN (modulo 97).

---

## /admin/lexora-billing/rapprochement — 8/10

**Fichier** : `app/admin/lexora-billing/rapprochement/page.tsx` (212 lignes).
**API** : `/api/admin/lexora-billing/reconcile` (GET = suggestions, POST = lier).

- Vue 3-panneaux : suggestions auto (avec score 100/70/<70) → transactions non rapprochées → factures impayées.
- POST lier marque payée + crée écriture BNQ ↔ 411 (commentaire `Écriture compta créée`).
- États empty propres, warning bandeau, loading.
- **Bémol** : pas de mode "lier manuel avec montant partiel" — uniquement lier complet 1↔1.

**Modifs prio** :
- **L** Lien partiel (transaction couvre N factures ou facture couverte par N transactions).

---

## /admin/lexora-tooling — 6/10

**Fichier** : `app/admin/lexora-tooling/page.tsx` (345 lignes).

- Page **purement statique** (read-only) qui documente les 4 skills Claude Code et les 5 outils MCP exposés.
- Aucun fetch, aucune table DB → c'est un "datasheet" interne.
- Utile comme documentation mais ne fait rien de plus.
- **Pas un vrai outil admin** ; aurait sa place dans `/docs/` ou un Notion.

**Modifs prio** :
- **M** Soit l'enrichir avec un vrai "ping" sur l'endpoint MCP / dernière invocation skill, soit la déplacer hors de `/admin`.

---

## /admin/ohada — 2/10

**Fichier** : `app/admin/ohada/page.tsx` (117 lignes).

- **MOCK INTÉGRAL**. Le tableau `JURISDICTIONS` est hardcodé avec `companies: 0` partout et `status: 'READY'` partout sauf MU (`ACTIVE`).
- `STATS` également hardcodé (`totalCountries: 18`, `totalAccounts: 200`).
- Aucune connexion DB.
- C'est de la **publicité marketing** dans le back-office.

**Modifs prio** :
- **H** Soit on branche sur des stats réelles (`SELECT count(*) FROM societes WHERE pays = …`) soit on supprime/déplace cette page hors `/admin`.

---

## /admin/parametres — 6.5/10

**Fichier** : `app/admin/parametres/page.tsx` (278 lignes).
**API** : `/api/admin/parametres` (auth strict admin/super_admin).

- Form : org, WATI (token + phone + webhook), email from/reply-to, taux change USD/EUR, exercice fiscal, devise principale, 4 toggles notifications.
- Charge `parametres_admin` (singleton via upsert).
- Save status `idle/success/error`.
- **PROBLÈME SÉCURITÉ** : `wati_token` (clé d'API WhatsApp) saisie en clair → stockée en clair dans DB. Si la table `parametres_admin` est lisible par un autre rôle, fuite directe. Idem `wati_webhook_url` qui peut contenir un secret URL.
- **Bémol** : pas de masque sur le champ token (type="text" par défaut), pas de "test webhook" pour vérifier que la conf marche.

**Modifs prio** :
- **H** Chiffrer `wati_token` (pgsodium / env var override) ou au minimum masquer côté UI (`type="password"` + "révéler").
- **M** Bouton "tester la conf WATI" qui pingue un endpoint WhatsApp avec un message témoin.

---

## /admin/plans — 9/10

**Fichier** : `app/admin/plans/page.tsx` (661 lignes).
**API** : `/api/admin/plans` + `[id]/`.

- CRUD complet : créer, modifier, désactiver (`actif: false`), supprimer (DELETE).
- 11 modules toggleables, `populaire` (mise en avant), `ordre`, périodicité mensuelle/annuelle, taille entreprise, addon flag.
- Validations : code unique, prix > 0 implicite.
- Dialog plein écran avec preview tarifaire en temps réel.
- Auth strict côté API (admin/super_admin only).
- Aucun mock.

**Modifs prio** :
- **L** Confirmation supprimer plan utilisé par X sociétés (vérifier d'abord `SELECT count(*) FROM societes WHERE plan_id = ?`).

---

## /admin/purge — 9/10

**Fichier** : `app/admin/purge/page.tsx` (435 lignes).
**API** : `/api/admin/cascade-delete` + `lib/admin/cascade-delete.ts`.

- 3 tabs (Factures / Banque / Documents), filtres + recherche par société.
- **Triple garde-fou** :
  - UI : `CascadeDeleteButton` ouvre un AlertDialog avec mention "Mauritius Companies Act 7 ans", liste cascade textuelle, input "SUPPRIMER" obligatoire.
  - API : `confirm === 'DELETE_HARD'` requis dans le body.
  - Server : `assertAdminForSociete` revalide le rôle + le scope société.
- **Audit trail propre** : `lib/admin/cascade-delete.ts` insère dans `audit_trail` (user_id, role, ip, ua, old_values JSON) AVANT chaque DELETE, best-effort si la partition manque.
- `scopeIdsToSociete` filtre les IDs à ceux appartenant à la société → empêche un admin de wiper la mauvaise cible par accident ou injection.

**Modifs prio** :
- **L** Limite hardcodée 500 IDs côté lib — afficher cette limite côté UI quand on dépasse.

---

## /admin/repair — 8/10

**Fichier** : `app/admin/repair/page.tsx` (251 lignes).
**API** : `/api/admin/repair/route.ts` (804 lignes — 9 actions de réparation).

- 9 actions codifiées (backfill VTE/ACH, backfill BNQ paiements, purge CCA doublons, delete faux CCA, remap legacy comptes, lettrage par facture_id, purge montants amplifiés, purge classifications NPF/NSF, vider 580→4710).
- **Dry-run par défaut** — l'utilisateur doit explicitement cliquer "Appliquer".
- Confirmation `window.confirm` avec liste des actions et `societe_id`.
- Auth strict + `assertSocieteAccess` côté serveur.
- Severity tag (safe / destructive) sur chaque action.
- Résultats détaillés par action (status, affected, message, JSON detail).
- **Bémol 1** : pas de log dans `audit_trail` (alors que les actions destructives modifient la compta).
- **Bémol 2** : `window.confirm` pour l'application réelle au lieu d'un AlertDialog typed (incohérent avec `/admin/purge`).

**Modifs prio** :
- **H** Logger chaque action `repair` dans `audit_trail` avec `before/after` counts.
- **M** Remplacer `confirm()` par AlertDialog typed avec mention "DRY-RUN d'abord" mis en évidence.

---

## /admin/reset-societe — 7/10

**Fichier** : `app/admin/reset-societe/page.tsx` (298 lignes).
**API** : `/api/comptable/reset-complet/route.ts`.

- Dialog avec :
  - Liste explicite "ce qui sera toujours effacé" (écritures, factures, audit, rapprochements).
  - 6 toggles options (releves, documents, tva, bulletins, plan_comptable, immo).
  - Input "tapez le nom exact" pour activer le bouton.
  - Triple confirm body : `confirm: "RESET_COMPLET"` + `confirm_nom_societe` + `societe_id`.
- Côté serveur : `assertSocieteAccess` empêche le cross-tenant.
- **PROBLÈME 1 (criticité H)** : la route accepte `admin / super_admin / comptable / comptable_dedie` → un comptable peut wiper la compta complète d'une société qu'il gère. C'est volontaire (le commentaire mentionne "Conçu pour sortir d'un état corrompu") mais le path est `/admin/reset-societe` ce qui laisse penser que c'est admin-only depuis l'URL. Soit on restreint, soit on déplace sous `/comptable/reset-societe`.
- **PROBLÈME 2 (criticité H)** : **pas de log `audit_trail`**. Un reset complet ne laisse aucune trace formelle (à part les warnings console). Le seul "audit" est dans `stats` retournés au requester — éphémère.
- `deleteWithCount` est best-effort (warn si table inexistante, continue) → bon pour la robustesse mais risqué si la table existe mais le filtre est mauvais.

**Modifs prio** :
- **H** Insérer une ligne `audit_trail` avant le reset avec full `stats` snapshot (nb écritures avant, nb factures avant, etc.) + après.
- **H** Restreindre à admin/super_admin OU renommer la route + déplacer la page sous `/comptable/`.
- **M** Snapshot DB (pg_dump partiel `societe_id`) avant chaque reset → permettre un undo en cas de fausse manœuvre.

---

## /admin/services — 8/10

**Fichier** : `app/admin/services/page.tsx` (434 lignes).
**API** : `/api/admin/services` (auth admin/super_admin).

- Sélection société → modal d'abonnement (plan, périodicité, addons, prix calculés temps réel, modules effectifs merge).
- PUT `/api/admin/societes/[id]/subscription` met à jour `plan_id`, `addons_actifs`, `periodicite`, `prix_*_effectif`, `modules_actifs`.
- Lit la source de vérité unique `plans` (catalogue /tarifs) — pas de double-table.
- Liste les 12 packs + 2 addons + 3 cabinets correctement filtrés.

**Modifs prio** :
- **L** Historique des changements d'abonnement par société (audit_trail dédié `subscription_changes`).

---

## /admin/societes — 8.5/10

**Fichier** : `app/admin/societes/page.tsx` (954 lignes).
**API** : `/api/admin/societes`, `/api/admin/societes/[id]`, `/api/admin/dossiers`.

- CRUD complet société (nom, BRN, n°TVA, statut TVA), assignation comptable, liens clients via dossiers.
- Création société + invitation comptable + lien clients en un seul flow.
- Dialog d'édition complet avec délier comptable, supprimer société.
- **Bémol** : `window.confirm("Délier ${comptable} de la société ?")` au lieu d'AlertDialog.
- Recherche par nom et BRN.

**Modifs prio** :
- **L** AlertDialog pour les deux opérations destructives (délier comptable, supprimer société).

---

## /admin/users — 8.5/10

**Fichier** : `app/admin/users/page.tsx` (538 lignes).
**API** : `/api/admin/users/tree` (groupement serveur), `/api/admin/users/[id]`.

- **Excellente** vue hiérarchique : Plateforme (admin/super_admin) → Clients (accordéon) → Sociétés (sous-accordéon) → Utilisateurs.
- Section Orphelins pour les comptes non rattachés.
- Recherche globale avec deep-match auto-expand des parents.
- Actions par user : toggle actif, supprimer (soft/hard via flag `hard`), changer rôle (dropdown).
- Création utilisateur avec auto-fix du CHECK constraint `profiles.role` côté API (cf. migration 261 fallback).
- Génération mot de passe affichée avec carte "à transmettre".
- **Bémol** : `window.confirm` pour le soft delete et le hard delete — incohérent avec `CascadeDeleteButton`.
- Le hard delete user supprime via `auth.admin.deleteUser` + cascade DB → impact lourd mais pas d'audit_trail dédié.

**Modifs prio** :
- **M** AlertDialog pour suppression user (hard surtout, où la perte est irréversible).
- **H** Audit_trail pour `DELETE user` (avec snapshot du profile).

---

## Conclusion

| URL | Note |
|---|---|
| /admin | 8 |
| /admin/clients | 7.5 |
| /admin/comptables | 7 |
| /admin/demandes-inscription | 8.5 |
| /admin/documents | 7.5 |
| /admin/forex | 6 |
| /admin/health | 9.5 |
| /admin/lexora-billing | 8.5 |
| /admin/lexora-billing/parametres | 8 |
| /admin/lexora-billing/rapprochement | 8 |
| /admin/lexora-tooling | 6 |
| /admin/ohada | 2 |
| /admin/parametres | 6.5 |
| /admin/plans | 9 |
| /admin/purge | 9 |
| /admin/repair | 8 |
| /admin/reset-societe | 7 |
| /admin/services | 8 |
| /admin/societes | 8.5 |
| /admin/users | 8.5 |

**Moyenne pondérée** : **7.7 / 10**.

### Top 3 modifs prioritaires (criticité H)

1. **Audit trail manquant sur `/admin/reset-societe` et `/admin/repair`** (criticité **H**) — actions nucléaires sans traçabilité formelle. Insérer une ligne `audit_trail` avec snapshot avant/après pour chaque exécution.
2. **`/admin/reset-societe` accepte les comptables** (criticité **H**) — la page est sous `/admin` mais l'API accepte `comptable / comptable_dedie`. Soit restreindre à admin/super_admin uniquement, soit déplacer la page sous `/comptable/`.
3. **`/admin/ohada` 100 % mock** (criticité **H**) — soit brancher sur des vraies données (count par pays), soit retirer du back-office.

### Top 3 modifs prioritaires sécurité

1. **`wati_token` en clair dans `/admin/parametres`** — chiffrer (pgsodium) ou pousser vers env var.
2. **`window.confirm`/`alert` sur `/admin/documents`, `/admin/users`, `/admin/societes`** pour des actions destructives — converger vers `AlertDialog` typé comme `CascadeDeleteButton`.
3. **Audit trail à étendre** à `DELETE user`, `subscription_change`, `reset-societe`, `repair`, `lexora-billing emit/cancel`.
