# AUDIT — Agent 3 — Espace CLIENT (Cœur, Comptabilité, Banque, Société)

> Périmètre : 24 URLs sous `/client/**` (hors RH, hors facturation/factures dédiées).
> Repo : `/home/user/v0-lexora-accounting-saa-s` · stack Next.js 15 App Router + Supabase `dqepdoimpqhmuhkklxva`.
> Date : 2026-05-24.

---

## Synthèse globale

| Bloc | Note moyenne | Verdict |
|---|---|---|
| Cœur (6 URLs) | **7.7 / 10** | Bonne couverture, mais notifications est un placeholder vide et profil ne persiste rien. |
| Comptabilité (8 URLs) | **8.0 / 10** | Très solide. PCM correctement câblé, exports XLSX/PDF branchés, audit IA "Lex Livre". |
| Banque (4 URLs) | **8.0 / 10** | `rapprochement` et `rapprochement-mensuel` font DEUX choses différentes (✓ pas un doublon). |
| Société / admin (6 URLs) | **6.7 / 10** | `/client/societe` n'utilise pas le SocieteActiveProvider, profil cosmétique, assistant fonctionnel. |

**Note globale espace CLIENT compta+banque : ~7.6 / 10.**

Points forts :
- Multi-tenant globalement correct via `useSocieteActive()` + `assertSocieteAccess` côté API.
- Pipeline `documents → factures → écritures → grand-livre → bilan → TVA` 100% câblé sur tables Supabase réelles (`ecritures_comptables_v2`, `factures`, `comptes_bancaires`, `releves_bancaires`, `plan_comptable`, `lease_contracts`).
- TVA correctement à **15 %** Maurice avec reverse-charge fournisseurs étrangers, et deadline MRA au 20 du mois.
- IFRS 16 (leases) câblé sur `/api/comptable/leases`.

Points faibles structurels :
- `/client/notifications` : liste hardcodée `const notifications = []` → page de démo non fonctionnelle.
- `/client/profil` : `Sauvegarder` et `Changer mot de passe` n'ont AUCUN `onClick`. Les switches notifications ne persistent pas.
- `/client/societe` : ignore `useSocieteActive()`, refait son propre fetch (`/api/comptable/societes` + `/api/client/societes`) — **risque de désynchro** avec la société active du provider.
- `/client/alertes` : `marquer comme lu` et `archiver` sont LOCAUX (state React uniquement), pas de persistance.
- Aucun export XML MRA de la déclaration TVA (seulement XLSX).
- Lourdeur de `app/client/rapprochement/page.tsx` (**2352 lignes**) et `app/api/comptable/rapprochement/route.ts` (**5235 lignes**) — maintenabilité critique.

---

## URL par URL

### Cœur (6)

#### 1. `/client` — `app/client/page.tsx` (10 lignes) — **Note : 9/10**
Simple redirect vers `/client/tableau-de-bord`. Documenté (ancienne page de 691 lignes supprimée). RAS.

#### 2. `/client/tableau-de-bord` — 490 lignes — **Note : 8.5/10**
- Données réelles via `/api/client/financial?societe_id=...` (multi-tenant OK).
- 7 KPIs mensuels (CA, dépenses, résultat, trésorerie multi-devises, TVA nette, masse salariale, alertes).
- Bar chart 6 mois (recharts).
- 5 types d'alertes générés en client : factures en retard / proches / déclaration TVA (entre 15 et 20) / solde bancaire faible (seuils 50 000 MUR / 500 EUR — **hardcodés**).
- Loading skeleton, empty state, filtre par mois/exercice.
- Redirige `client_assistant` vers `/client/assistant`.

**Modifs recommandées :**
- (M) Externaliser les seuils d'alerte (par société, table `alertes_config` ou colonne).
- (L) Les 6 fetches du chart (1 par mois) sont parallèles mais alourdissent l'API ; créer `/api/client/financial/series?months=6`.

#### 3. `/client/tableau-de-bord-financier` — 121 lignes — **Note : 7/10**
- Vue IA "CFO" qui appelle `POST /api/generer-tableau-de-bord`.
- Affiche KPIs, alertes, recommandations IA, résumé textuel.
- Conditionnée à `societeId`.
- **Pas de fallback** si l'API est lente ou échoue silencieusement (try/catch console.error sans toast).
- Pas d'historique : chaque clic regénère.

**Modifs recommandées :**
- (M) Affichage toast erreur + historisation des analyses (table `analyses_ia`).
- (L) Persister la dernière analyse pour ne pas regénérer à chaque visite.

#### 4. `/client/alertes` — 315 lignes — **Note : 7/10**
- Fetch `/api/client/alertes?societe_id=...` qui est une vraie route rule-based (cf. `app/api/client/alertes/route.ts` : lit `ecritures_comptables_v2` + `documents` + `comptes_bancaires`).
- Multi-tenant OK (`assertSocieteAccess`).
- Tabs (toutes/non lues/urgent/attention/info/archives).
- Empty state OK.

**Problème critique :** "Marquer comme lu" et "Archiver" modifient **uniquement le state React** (`setAlerts(prev => prev.map(...))`), pas de PATCH API. Au refresh, tout revient.

**Modifs recommandées :**
- (H) Persister état lu/archivé → table `alertes_user_state(user_id, alert_signature, lue, archivee)`.
- (M) Lier les alertes à une action (bouton "Voir la facture" → `/client/factures?id=...`).

#### 5. `/client/notifications` — 226 lignes — **Note : 2/10**
- `const notifications: NotificationItem[] = []` en dur ligne 28.
- AUCUN fetch, AUCUNE API. Toujours affiche "0 notifications".
- KPIs (WhatsApp/Email/Pending) calculés sur tableau vide → toujours 0.
- Logique de filtres présente mais inutile.

**Modifs recommandées :**
- (H) Créer `/api/client/notifications` lisant `whatsapp_messages` + `email_notifications` (les tables existent dans `n8n-workflows/`).
- (H) Ou supprimer la page tant qu'inactive — induit l'utilisateur en erreur.

#### 6. `/client/select-societe` — 203 lignes — **Note : 9/10**
- Logique propre : 0 → onboarding, 1 → auto-redirect, ≥2 → grille.
- Utilise `useSocieteActive()`. Branche `MonEspaceSalarieBouton` pour multi-rôles.
- Erreur gérée (`error` du provider).

**Modifs recommandées :**
- (L) Bug mineur : `MonEspaceSalarieBouton` est défini avant l'import `getLocale` (lignes 14 vs 28) — fonctionne en hoisting mais l'ordre est sale.

---

### Comptabilité (8)

#### 7. `/client/ecritures` — 560 lignes — **Note : 8.5/10**
- Lit `financial.ecritures` depuis `/api/client/financial` (alias V2 → V1 propre).
- PATCH `/api/client/ecritures` (modifier) + DELETE par ligne ou par folio (`ref_folio`).
- Filtre par journal (VTE/ACH/BNQ/SAL/OD/CLS), search texte, badge Lex Banque sur BNQ.
- Liaison filtre `?compte=X` depuis le grand-livre.
- Modal d'édition propre, toast feedback.
- Affichage devise d'origine + taux change si ≠ MUR.

**Modifs recommandées :**
- (M) Pas de pagination — au-delà de quelques milliers de lignes, perfo client dégradée. `useMemo` filter fonctionne mais le DOM render est lourd.
- (M) `confirm()` natif pour suppression — remplacer par un Dialog accessible.
- (L) Le PATCH n'envoie pas le `journal` modifiable — uniquement num compte/libellé/montants/date.

#### 8. `/client/grand-livre` — 995 lignes — **Note : 9/10**
- Très complet : balance générale, 7 classes collapsibles, drill-down par compte vers écritures.
- Lit `/api/client/plan-comptable` + `/api/client/financial` en parallèle.
- Audit IA "Lex Livre" via `POST /api/agent/grand-livre {action: 'audit'}` avec mode explicatif (`explain: true`).
- Lettrage auto via `{action: 'lettrer'}`.
- Export Excel branché (`/api/comptable/grand-livre/export-xlsx`).
- Calcul résultat = produits (classe 7) − charges (classe 6).
- Détection écart débit/crédit.

**Modifs recommandées :**
- (L) Pas d'export PDF du grand livre (seulement XLSX).
- (L) Le résultat calculé ne prend pas en compte les comptes 8 (exceptionnels).

#### 9. `/client/bilan` — 833 lignes — **Note : 8/10**
- Bilan + P&L + tableau de flux probable. Source : `/api/client/financial`.
- Mode exercice OU mensuel (toggle).
- N-1 fetché automatiquement si exercice précédent dispo.
- **OCR Bilan PDF** : import PDF du bilan année passée → stocké dans **localStorage** (`lexora_bilan_prev_${exercice}`) pour comparatif.
- Exports XLSX + PDF branchés (`/api/client/financial/export-xlsx` et `export-pdf`).
- Tax 15 % appliqué (`incomeTax = profitBeforeTax * 0.15`).
- Bouton purge exercice → `/api/comptable/ecritures?action=purge_exercice` (danger zone).

**Problèmes :**
- Le N-1 OCR via localStorage n'est **pas multi-device/multi-user** : si l'utilisateur change de browser, les données N-1 disparaissent. Devrait être en base.
- Pas d'IFRS 16 brokered dans le bilan (le ROU asset des leases n'apparaît pas).

**Modifs recommandées :**
- (M) Persister les données N-1 OCR en base (`bilan_historique`).
- (M) Intégrer ROU + lease liability dans actif/passif (lien avec `/client/leases`).
- (L) Tax 15 % est hardcodé — devrait suivre `regime` société (GBC1 a PER 80 %, donc 3 % effectif).

#### 10. `/client/plan-comptable` — 513 lignes — **Note : 9/10**
- Lit `/api/client/plan-comptable` — endpoint qui retourne `plan_comptable` Supabase (globaux + overrides société).
- Confirmé : c'est bien le **PCM** (Plan Comptable Mauricien) — classes 1 à 7, sens normaux D/C, hiérarchie parent/enfant.
- 7 classes collapsibles avec icônes par classe, drill-down ouvrant l'usage du compte (nb écritures + solde).
- Search full-text, ouvre auto les classes avec matches.

**Modifs recommandées :**
- (L) Pas d'UI pour ajouter un compte société (override). Le GET est lecture seule.
- (L) Le `est_analytique` est lu mais pas exposé visuellement.

#### 11. `/client/revenus-depenses` — 320 lignes — **Note : 7.5/10**
- Lit `/api/client/financial?societe_id=...`.
- Vue agrégée revenus vs dépenses, sans doute par catégorie.

#### 12. `/client/echeances` — 343 lignes — **Note : 7.5/10**
- Lit `/api/client/financial?societe_id=...` (table `factures`, filtre `date_echeance`).
- Affichage factures en retard / proches.

#### 13. `/client/tva` — 904 lignes — **Note : 8.5/10**
- TVA **15 %** confirmé (`const TVA_RATE = 0.15` ligne 46).
- Deadline MRA au **20 du mois** (`getDeadlineInfo`), badge urgence (rouge si overdue, orange < 7 jours).
- Distinction client/fournisseur, fournisseurs locaux vs étrangers (reverse charge).
- 4 KPIs : collectée / déductible / nette à payer / crédit reportable.
- Exports XLSX en 3 vues (normale / déductible / reverse charge).
- Crédit reporté période précédente géré.
- Lecture des `factures` (avec `montant_tva_mur`) en source de vérité, fallback `ecritures`.

**Problème :** Pas d'export XML/format MRA officiel — uniquement XLSX. La déclaration en ligne MRA reste manuelle (copier-coller).

**Modifs recommandées :**
- (H) Générer XML format MRA (`mra_vat_return.xml`) ou PDF estampillé.
- (M) `handleCalculerTVA` est un `setTimeout(1500)` factice (ligne 378-382) — placeholder bouton "Calculer".
- (L) Période trimestrielle T1-T4 hardcodée — vérifier si seuil 6M MUR pour passage trimestre→mois est géré.

#### 14. `/client/leases` — 92 lignes — **Note : 8/10**
- IFRS 16. Lit `/api/comptable/leases?societe_id=...`.
- 3 KPIs : nb actifs, total ROU MUR, total liability MUR.
- Table portfolio (lessor, asset, monthly, term, ROU initial, statut).
- Badge exemption (short-term ou low-value).

**Modifs recommandées :**
- (M) Lecture seule — pas de bouton "Ajouter un contrat de lease". Voir si admin/comptable le fait via une autre page.
- (M) Pas de schedule de paiements affiché par contrat.

---

### Banque (4)

#### 15. `/client/banque` — 982 lignes — **Note : 8/10**
- Lit `/api/client/releves-bancaires?societe_id=...` (comptes + relevés).
- Conversion multi-devises via `/api/taux-change` (cumul des soldes en MUR).
- Upload relevé PDF → `/api/documents/upload` (pipeline n8n).
- 4 KPIs : nb comptes actifs, solde cumulé, dernier import, tx en attente.
- Panneau "3 chemins pour alimenter" (manuel / import PDF / scraping auto MCB).
- Détection comptes "stale" (> 35 jours sans relevé).

**Modifs recommandées :**
- (M) Le scraping auto MCB (mentionné ligne 945 "Lexora connects every night at 02:00 UTC") — vérifier que c'est branché côté backend ou que c'est aspirationnel.
- (L) Pas de page de détail par compte bancaire (transactions paginées).

#### 16. `/client/rapprochement` — **2352 lignes** — **Note : 7.5/10**
- **Lex Banque** : matching IA transaction par transaction (bank_tx → factures).
- Workflow : période → `POST /api/agent/rapprochement` → suggestions onglet "À valider" → "Valider" → `/api/comptable/rapprochement?action=lettrer_manuel` crée l'écriture BNQ.
- Onglets : à valider, validées, anomalies.
- Match auto, reclassify, edit manuel, multi-facture par tx.
- API `/api/comptable/rapprochement/route.ts` fait **5235 lignes** — refactor critique.

**Modifs recommandées :**
- (H) Le composant est ingérable à 2352 lignes — fractionner en sous-composants (`<AValider/>`, `<Anomalies/>`, `<TxRow/>`).
- (H) L'API `/api/comptable/rapprochement` à 5235 lignes contient probablement de la logique métier qui devrait être dans `lib/accounting/`.
- (M) Pas de tests visibles pour les règles R1-R7 mentionnées dans CLAUDE.md.

#### 17. `/client/rapprochement-mensuel` — 413 lignes — **Note : 8/10**
- **DIFFÉRENT** de `/client/rapprochement` : ici c'est le rapprochement bancaire formel **mensuel** (solde relevé vs solde livres).
- Workflow : créer rapprochement (date + solde relevé) → ajouter items en attente (côté banque / côté compta) → résiduel doit être 0 → submit/validate/lock.
- Calcule `gl_balance` côté API + `residual_gap`.
- Status : draft / submitted / validated / locked (verrouillage définitif).

**Pas de doublon.** Les deux pages couvrent :
- `/rapprochement` = matching tx → facture (granularité transaction)
- `/rapprochement-mensuel` = état formel à fin de période (granularité période)

**Modifs recommandées :**
- (M) Pas de lien croisé entre les deux pages — ajouter un lien "Voir matching détaillé" dans rapprochement-mensuel.
- (M) `confirm()` natif pour le lock — Dialog accessible.
- (L) Pas d'export PDF du rapport de rapprochement mensuel.

#### 18. `/client/compte-courant` — 553 lignes — **Note : 8/10**
- Lit `/api/comptable/compte-courant?societe_id=...` + factures fournisseur impayées.
- CRUD compte courant (associé / dirigeant).
- Avance / Remboursement avec liaison facture optionnelle.
- 100% branché aux APIs.

**Modifs recommandées :**
- (L) Pas de relevé PDF par associé.

---

### Société / admin (6)

#### 19. `/client/societe` — 375 lignes — **Note : 5/10**
- 4 onglets : Details / Contact / Payroll / Bank.
- **PROBLÈME multi-tenant** : la page **n'utilise PAS `useSocieteActive()`**. Elle fait `Promise.all([fetch('/api/comptable/societes'), fetch('/api/client/societes')])` et sélectionne `unique[0]` par défaut.
- Si l'utilisateur a 3 sociétés et a `societeId='X'` actif dans le provider, cette page peut afficher la société Y → **désynchro silencieuse**.
- Selector société présent (si ≥2), mais sa valeur n'est pas synchronisée avec le provider global.
- PUT `/api/admin/societes` pour sauvegarder.

**Modifs recommandées :**
- (H) Brancher sur `useSocieteActive()` pour cohérence multi-tenant avec le reste de l'app.
- (M) Confirmer que `PUT /api/admin/societes` est bien accessible aux rôles client_admin (ou changer vers `PATCH /api/client/societes`).

#### 20. `/client/societes` — 415 lignes — **Note : 8/10**
- Liste + CRUD (création/édition).
- Dialog avec champs : nom, BRN, ERN, TVA MRA, secteur, adresse, téléphone, email, statut_tva, **regime** (domestic / gbc1 / authorised_company / holding / branch_foreign_pe), devise fonctionnelle, FSC license.
- Le `regime` est branché à des compétences GBC/IFRS — bon point pour Maurice.

**Modifs recommandées :**
- (L) Pas de soft-delete visible.
- (L) Validation BRN format pas vérifiée côté UI.

#### 21. `/client/contacts` — 683 lignes — **Note : 8/10**
- CRUD complet sur `factures_contacts` (clients/fournisseurs facturation).
- Auto-import depuis localStorage (migration ancienne).
- Bulk import via dialog (`ContactsImportDialog`).
- Champs riches : VAT, BRN, kbis, devise, conditions paiement, offshore.

**Modifs recommandées :**
- (L) Pas de fusion de doublons UI.

#### 22. `/client/utilisateurs` — 1014 lignes — **Note : 8/10**
- CRUD complet utilisateurs sous la société active.
- Lit `/api/client/users?societe_id=...`.
- Rôles : client_admin, client_user, client_assistant, etc.
- Multi-société (un user peut avoir plusieurs sociétés via `societe_ids`).
- Création + reset password + modules (permissions).
- KPIs : total, actifs ce mois, top rôles, dernier ajout.
- Filtre par rôle + search + tri.

**Modifs recommandées :**
- (M) Vérifier que `client_user` ne peut PAS accéder à cette page (RequireRole non visible dans l'extrait).
- (L) Pas de log d'audit des changements de rôle/permissions.

#### 23. `/client/profil` — 267 lignes — **Note : 4/10**
- **Boutons cosmétiques** : `Sauvegarder les modifications` (ligne 129) et `Changer le mot de passe` (ligne 258) n'ont **AUCUN `onClick`**.
- Les 5 Switches notifications (email/whatsapp/tva/docs/salaires) ne persistent rien.
- L'affichage société est en lecture seule (correct).
- Card affichage comptable assigné.

**Modifs recommandées :**
- (H) Brancher Save → `PATCH /api/client/profile` (full_name, phone, prefs_notifications).
- (H) Brancher Change Password → `PATCH /api/admin/users/[id]/password` (déjà utilisé dans utilisateurs).
- (M) Persister les préférences notifications dans `profiles.preferences_notifications` (JSONB).

#### 24. `/client/assistant` — 838 lignes — **Note : 8/10**
- Page documents OCR pour `client_assistant` (rôle redirigé ici depuis dashboard).
- Lit `/api/client/documents`, polling 10s.
- Upload `/api/documents/upload`, ré-analyse `/api/documents/[id]/reanalyze`.
- Réassignation dossier `/api/documents/[id]` PATCH.
- Dossiers par type (factures, relevés, fiches paie, contrats, etc.).
- Inclut composant `MonEspacePersonnel` (RH).

**Modifs recommandées :**
- (L) Polling 10s = 360 req/h/user — backoff ou WebSocket souhaitable.
- (L) Pas de bulk-upload visible.

---

## Vérifications transversales demandées

### Multi-société (SocieteActiveProvider)

| Page | Utilise `useSocieteActive()` ? | Filtre par société active ? |
|---|---|---|
| Cœur (6) | 5/6 ✓ (`/notifications` n'en a pas besoin car vide) | OK |
| Compta (8) | 8/8 ✓ | OK |
| Banque (4) | 4/4 ✓ | OK |
| Société (6) | 5/6 — **`/client/societe` NON** | **KO partiel** |

`/client/societe` est l'**exception notable** : refetch maison `unique[0]` → incohérence possible.

### TVA Maurice

- Taux : **15 %** ✓ (hardcodé `TVA_RATE = 0.15`)
- Deadline : 20 du mois ✓
- Reverse charge fournisseurs étrangers : ✓
- Trimestre/mensuel : géré
- Export XML MRA officiel : **MANQUANT** (seulement XLSX)
- Seuil 6M MUR pour passage trimestre→mois : non vérifié dans l'UI

### Plan comptable mauricien (PCM)

- Table `plan_comptable` avec globaux + overrides société ✓
- 7 classes (1=trésorerie/financement, 2=immobilisations, 3=stocks, 4=tiers, 5=banque/caisse, 6=charges, 7=produits) ✓
- Hiérarchie parent/niveau ✓

### Bilan / Grand-livre exports

| Document | XLSX | PDF |
|---|---|---|
| Bilan (`/api/client/financial/export-*`) | ✓ | ✓ |
| Grand livre (`/api/comptable/grand-livre/export-xlsx`) | ✓ | manquant |
| TVA | ✓ (3 vues) | manquant |
| Rapprochement mensuel | manquant | manquant |

### Rapprochement — doublon ?

**Non.**
- `/client/rapprochement` (Lex Banque) = matching transactionnel tx ↔ facture, génère écritures BNQ.
- `/client/rapprochement-mensuel` = état formel mensuel, solde relevé vs solde compta, validation/verrouillage de période.

Les deux pages **doivent rester séparées**. Recommandation : ajouter des liens croisés UX entre elles.

---

## Top 10 actions correctives prioritaires

| # | Page | Sévérité | Action |
|---|---|---|---|
| 1 | `/client/notifications` | H | Brancher sur vraies tables (whatsapp_messages, email_notifications) OU retirer du menu. |
| 2 | `/client/profil` | H | Boutons Save et Change Password sans `onClick` — les brancher. |
| 3 | `/client/alertes` | H | Persister état lu/archivé en base. |
| 4 | `/client/societe` | H | Aligner sur `useSocieteActive()` pour cohérence multi-tenant. |
| 5 | `/client/tva` | H | Générer export XML MRA officiel. |
| 6 | `/client/rapprochement` (page + API) | H | Refactor : 2352 + 5235 lignes — extraire en sous-modules. |
| 7 | `/client/bilan` | M | Persister données N-1 OCR en base (pas localStorage). |
| 8 | `/client/bilan` | M | Intégrer ROU/lease liability IFRS 16. |
| 9 | `/client/tableau-de-bord` | M | Endpoint unique series 6 mois au lieu de 6 fetches. |
| 10 | `/client/tva` | M | Bouton "Calculer TVA" est un `setTimeout` factice — supprimer ou brancher. |

---

## Conclusion

L'espace CLIENT comptabilité/banque/société de Lexora est **fonctionnellement très avancé** (~8/10) : la majorité des pages branchent de vraies données Supabase, le pipeline OHADA/PCM/MRA est cohérent, l'IA "Lex Banque" et "Lex Livre" sont opérationnelles, IFRS 16 et IFRS 9 (vu en sidebar) sont câblés.

Les principales faiblesses sont :
1. **3 pages "cosmétiques"** qui trompent l'utilisateur : `/client/notifications` (vide), `/client/profil` (boutons morts), `/client/alertes` (état non persisté).
2. **`/client/societe`** : seule page client qui ignore le provider de société active — bug multi-tenant en attente.
3. **Refactor critique** sur les deux pages monstres rapprochement (page 2352 LOC + API 5235 LOC).
4. **TVA MRA** : pas d'export XML officiel, juste XLSX.

Le reste est globalement de très bon niveau pour un SaaS de comptabilité Maurice.

---

**Note moyenne pondérée espace CLIENT (24 URLs) : 7.6 / 10**
