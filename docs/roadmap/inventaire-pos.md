# Roadmap — Gestion de stock/inventaire & Point de vente (POS)

**Statut** : proposition de spec, aucun code ni migration livrés dans ce document.
**Périmètre** : deux modules absents de Lexora aujourd'hui — (A) Stock/Inventaire,
(B) Point de vente. Document de cadrage produit + technique, à valider avant tout
chantier d'implémentation.

---

## 0. Constats sur l'existant (base du dimensionnement ci-dessous)

Avant de proposer un modèle de données, quelques faits vérifiés dans le repo qui
contraignent fortement les deux modules :

- **`factures` est une table à plat, sans lignes.** Il n'existe aucune table
  `lignes_facture`/`facture_items` — une facture porte un `montant_ht` /
  `montant_tva` / `montant_ttc` agrégés, pas une liste de produits avec quantités
  (`supabase/migrations/034_create_factures_table.sql`). Conséquence directe :
  on **ne peut pas** déduire du stock automatiquement à partir d'une facture
  client "classique" tant que ce module n'est pas itemisé — voir périmètre §2.1.
- **`factures_catalogue`** (migration `099_complete_setup.sql`) existe déjà mais
  n'est qu'un référentiel de descriptions/prix pour l'autocomplétion des
  factures — pas de SKU, pas de quantité, pas de suivi de stock. Les nouveaux
  modules doivent le traiter comme un voisin (lien optionnel), pas comme une
  base à étendre.
- **Le plan comptable a deux couches qui coexistent** : les codes "historiques"
  utilisés par le moteur d'écritures actuel (`lib/accounting/ecritures-factures.ts` :
  411/706/4457 côté ventes, 607/4456/401 côté achats) et le plan "canonique
  strict" (`supabase/migrations/202_plan_comptable_strict_canonique.sql`) qui
  définit **701 = Ventes de marchandises** et **601 = Achats de marchandises**
  (607 y est réservé aux achats de services). La couche IFRS en cours
  (`478_plan_comptable_ifrs_maurice.sql`) confirme ce mapping (`ancien_code_pcg
  = '701'` pour `PROD-VENTES-MARCHANDISES`). **Aucun compte de classe 3 (stocks)
  n'existe nulle part dans le repo** — à créer intégralement.
- Le moteur d'écritures (`assertEquilibre`, `lib/money.ts` en `Decimal.js`,
  `journal` typé VTE/ACH/BNQ/OD/SAL/CLS/AN, `ref_folio` pour le lien
  facture↔écriture, R1-R7 dans `lib/accounting/accounting-rules.ts`) est mûr et
  doit être **réutilisé**, pas réinventé, pour les deux nouveaux modules.
- RLS actuelle sur les tables comptables/factures : pattern faible hérité
  `USING (auth.uid() IS NOT NULL)` + filtrage côté API — documenté comme
  "gotcha" dans `supabase/docs/schema/01-tables.md`. **Les nouvelles tables ne
  doivent pas reproduire ce pattern** : utiliser `user_has_societe_access(societe_id)`
  (SEC-003, `supabase/migrations/415_*`), conformément à CLAUDE.md.

Ces constats motivent les choix de périmètre pris ci-dessous (notamment : POS
comme flux itemisé autonome plutôt que refonte de `factures`).

---

## 1. Module A — Stock / Inventaire

### 1.1 Objectifs & périmètre

**Dans le périmètre v1** :
- Référentiel produits (catalogue avec SKU, gestion ou non en stock).
- Entrées de stock (réception fournisseur) et sorties (vente POS, casse, transfert).
- Valorisation en coût unitaire moyen pondéré (CUMP).
- Niveaux de stock par dépôt, alertes de seuil bas/rupture.
- Inventaire physique (comptage périodique, écarts).
- Écritures comptables générées automatiquement pour chaque mouvement valorisé.

**Hors périmètre v1** (à documenter comme dette assumée, cf. §7) :
- FIFO/lots/péremption (utile agro-alimentaire/pharma) — v2 si besoin confirmé.
- Sortie de stock déclenchée par une facture client "classique" multi-produits
  (nécessite l'itemisation de `factures`, chantier séparé).
- Nomenclatures/production (BOM, assemblage) — hors sujet ici, différent d'un
  besoin de revente simple.
- Multi-entrepôts avec règles de réapprovisionnement automatique inter-dépôts
  (le transfert manuel simple est dans le périmètre, le réassort automatique non).

### 1.2 Modèle de données proposé

Toutes les tables : `societe_id UUID REFERENCES societes(id)`, RLS via
`user_has_societe_access(societe_id)`, `created_at`/`updated_at` standards.

**`produits`** — référentiel articles
```
id                       UUID PK
societe_id               UUID FK societes
sku                      TEXT NOT NULL              -- UNIQUE(societe_id, sku)
code_barre               TEXT
designation              TEXT NOT NULL
description              TEXT
categorie                TEXT
unite_mesure             TEXT DEFAULT 'unite'
gere_en_stock            BOOLEAN DEFAULT TRUE        -- FALSE = service/produit non stocké, vendable en POS sans déduction
methode_valorisation     TEXT DEFAULT 'CUMP'         -- CHECK IN ('CUMP')  -- FIFO = v2
cout_unitaire_moyen      NUMERIC(15,4) DEFAULT 0     -- CUMP courant, maintenu par RPC (jamais par le front)
prix_vente_ht            NUMERIC(15,2) DEFAULT 0
taux_tva                 NUMERIC(5,2) DEFAULT 15     -- Maurice VAT standard
compte_stock             VARCHAR(10) DEFAULT '3701'  -- classe 3 à créer, cf. §4
compte_achat             VARCHAR(10) DEFAULT '601'   -- canonique existant
compte_vente             VARCHAR(10) DEFAULT '701'   -- canonique existant
compte_variation_stock   VARCHAR(10) DEFAULT '6037'  -- à créer, cf. §4
stock_mini               NUMERIC(15,3) DEFAULT 0
stock_maxi               NUMERIC(15,3)
seuil_alerte             NUMERIC(15,3)
catalogue_id             UUID FK factures_catalogue NULL  -- lien optionnel, pas de duplication
actif                    BOOLEAN DEFAULT TRUE
```

**`depots`** — points de stockage (entrepôt, arrière-boutique, point de vente)
```
id            UUID PK
societe_id    UUID FK societes
nom           TEXT NOT NULL
type          TEXT DEFAULT 'entrepot'   -- CHECK IN ('entrepot','boutique','point_de_vente')
adresse       TEXT
est_defaut    BOOLEAN DEFAULT FALSE
actif         BOOLEAN DEFAULT TRUE
```

**`stock_niveaux`** — solde courant dénormalisé (lecture rapide UI/POS)
```
id             UUID PK
societe_id     UUID FK societes
produit_id     UUID FK produits
depot_id       UUID FK depots
quantite       NUMERIC(15,3) NOT NULL DEFAULT 0
valeur_stock   NUMERIC(15,2) NOT NULL DEFAULT 0   -- quantite × cout_unitaire_moyen
updated_at     TIMESTAMPTZ
UNIQUE(produit_id, depot_id)
```
⚠️ Table **écrite exclusivement via une fonction RPC Postgres atomique**
(`SELECT ... FOR UPDATE` sur la ligne produit×dépôt) appelée par tout créateur
de `mouvements_stock` — jamais de `UPDATE` direct depuis une route API, pour
éviter les races entre une vente POS et une réception simultanées.

**`mouvements_stock`** — journal immuable, source de vérité
```
id                    UUID PK
societe_id            UUID FK societes
dossier_id            UUID FK dossiers NULL
produit_id            UUID FK produits
depot_id              UUID FK depots
depot_destination_id  UUID FK depots NULL          -- renseigné seulement pour un transfert
type_mouvement        TEXT NOT NULL  -- CHECK IN ('entree_achat','sortie_vente',
                                     --   'ajustement_inventaire_plus','ajustement_inventaire_moins',
                                     --   'transfert_sortie','transfert_entree',
                                     --   'retour_client','retour_fournisseur','perte_casse')
sens                  CHAR(1) NOT NULL  -- CHECK IN ('E','S')
quantite              NUMERIC(15,3) NOT NULL CHECK (quantite > 0)
cout_unitaire          NUMERIC(15,4) NOT NULL   -- coût d'achat réel (entrée) ou CUMP au moment du mouvement (sortie)
valeur_mouvement       NUMERIC(15,2) NOT NULL
reference_type         TEXT   -- 'bon_reception' | 'vente_pos' | 'inventaire_physique' | 'transfert' | 'manuel'
reference_id           UUID
date_mouvement         DATE NOT NULL
motif                  TEXT
cree_par               UUID FK profiles
```
Immuable après création (même esprit que R6 — irréversibilité du lettrage) :
une correction se fait par un mouvement compensatoire, jamais par UPDATE/DELETE.
Aucun mouvement sur une date ≤ date de clôture du dossier (extension de R5,
`lib/accounting/period-lock.ts`).

**`bons_reception`** / **`lignes_bon_reception`** — entrée de stock fournisseur
(nécessaire car `factures` n'est pas itemisée — voir §0) :
```
bons_reception:
  id                     UUID PK
  societe_id             UUID FK societes
  depot_id               UUID FK depots
  fournisseur            TEXT
  facture_fournisseur_id UUID FK factures NULL   -- rapprochement 401/4456 quand la facture arrive
  statut                 TEXT DEFAULT 'brouillon'  -- CHECK IN ('brouillon','receptionne','annule')
  date_reception         DATE

lignes_bon_reception:
  id                UUID PK
  bon_reception_id  UUID FK bons_reception
  produit_id        UUID FK produits
  quantite          NUMERIC(15,3)
  cout_unitaire     NUMERIC(15,4)
```

**`inventaires_physiques`** / **`lignes_inventaire_physique`** — comptage
```
inventaires_physiques:
  id            UUID PK
  societe_id    UUID FK societes
  depot_id      UUID FK depots
  libelle       TEXT
  date_inventaire DATE
  statut        TEXT DEFAULT 'brouillon'  -- CHECK IN ('brouillon','en_cours','valide','annule')
  valide_par    UUID FK profiles NULL
  valide_at     TIMESTAMPTZ NULL

lignes_inventaire_physique:
  id                   UUID PK
  inventaire_id        UUID FK inventaires_physiques
  produit_id           UUID FK produits
  quantite_theorique   NUMERIC(15,3)   -- snapshot de stock_niveaux au lancement
  quantite_comptee     NUMERIC(15,3) NULL
  ecart                NUMERIC(15,3) GENERATED ALWAYS AS (quantite_comptee - quantite_theorique) STORED
  valeur_ecart         NUMERIC(15,2)
  commentaire          TEXT
```

**`alertes_stock`**
```
id                  UUID PK
societe_id          UUID FK societes
produit_id          UUID FK produits
depot_id            UUID FK depots NULL
type_alerte         TEXT  -- CHECK IN ('seuil_bas','rupture','surstockage')
seuil_reference      NUMERIC(15,3)
quantite_constatee   NUMERIC(15,3)
statut               TEXT DEFAULT 'active'  -- CHECK IN ('active','resolue','ignoree')
declenchee_at        TIMESTAMPTZ
resolue_at           TIMESTAMPTZ NULL
```
Génération : job cron (réutilise l'infra `app/api/cron/*` existante) qui compare
`stock_niveaux.quantite` à `produits.seuil_alerte`, notifie via le canal
Telegram existant (`app/api/telegram/**`, avec `verifyTelegramSignature` si un
nouvel endpoint est créé, SEC-005) ou email.

### 1.3 Écrans principaux

1. **Catalogue produits** — liste/recherche, fiche produit (SKU, prix, comptes,
   seuils), activation/désactivation.
2. **Niveaux de stock** — tableau par dépôt, filtrable, badges seuil bas/rupture.
3. **Réception marchandises** — création d'un bon de réception, rapprochement
   optionnel avec la facture fournisseur.
4. **Transfert entre dépôts** — sortie d'un dépôt + entrée dans un autre en une
   transaction.
5. **Inventaire physique** — lancement d'un comptage (snapshot théorique),
   saisie des quantités comptées (idéalement mobile-friendly), écran de
   validation des écarts avant impact comptable.
6. **Journal des mouvements** — vue d'audit, filtrable produit/dépôt/type/période.
7. **Alertes stock** — liste, statut, action rapide "créer un bon de réception".
8. **Rapport de valorisation** — état à une date (quantité × CUMP par produit/
   dépôt), export XLSX (réutilise le pattern `export-xlsx` déjà présent côté
   balance/grand-livre), utile pour la clôture mensuelle.

### 1.4 Intégration avec la comptabilité existante

Principe retenu : **méthode de l'inventaire permanent avec compte de variation
de stock**, cohérente avec le PCG mauricien déjà en place (classe 60 "Achats et
variations de stocks", `018_plan_comptable_paie.sql`) et avec la transparence/
auditabilité exigée par CLAUDE.md §3.E.

| Événement | Débit | Crédit |
|---|---|---|
| Réception marchandise (bon de réception validé) | 3701 Stock marchandises | 6037 Variation des stocks de marchandises |
| Vente (POS ou, en v2, facture client itemisée) — ligne marchandise | 411/530/512 (TTC) | 701 Ventes de marchandises (HT) + 4457 TVA collectée |
| Sortie de stock correspondante (COGS, au CUMP) | 6037 Variation des stocks | 3701 Stock marchandises |
| Écart d'inventaire positif | 3701 Stock marchandises | 6588 Écarts d'inventaire *(nouveau compte)* |
| Écart d'inventaire négatif | 6588 Écarts d'inventaire | 3701 Stock marchandises |
| Perte / casse | 6586 Pertes sur stocks *(nouveau compte)* | 3701 Stock marchandises |
| Transfert inter-dépôts | — | — *(mouvement de quantité uniquement, pas d'écriture : même compte 3701 société)* |

L'achat lui-même (607/4456/401 côté fournisseur) continue d'être généré par
`createEcrituresForFacture` **sans modification de sa logique** — le seul
changement est que le compte de charge doit être **601** (Achats de
marchandises) au lieu de 607 quand la facture est liée à des produits
`gere_en_stock=true` (aujourd'hui 607 est utilisé indistinctement pour tout
achat, biens et services confondus — à confirmer avec la session "Comptable/PCM"
avant de toucher ce mapping, cf. zone de coordination CLAUDE.md).

Toutes les écritures générées par le module stock utilisent `ref_folio =
'STK-<mouvement_stock_id>'` (distinct de `FAC-<facture_id>`), passent par
`assertEquilibre` (R1) et respectent la clôture de période (R5). Aucun calcul
flottant : `cout_unitaire_moyen` et toute valorisation transitent par
`lib/money.ts` (Decimal.js), y compris côté fonctions Postgres (NUMERIC strict).

Le poste "Stocks" alimente le SOFP — nécessite d'ajouter une ligne dans
`comptes_ifrs` (migration 478, `categorie_ifrs = 'actif_courant'`, poste
`SOFP.ActifCourant.Stocks`) et une intégration avec
`lib/accounting/exercice-snapshot.ts` / la clôture mensuelle (migration 445).

### 1.5 Effort estimé (1 dev senior full-stack, jours ouvrés)

| Lot | Jours |
|---|---|
| Modélisation, migrations SQL, RLS, RPC atomique de mouvement | 4 |
| Plan comptable (nouveaux comptes classe 3/60, mapping `comptes_ifrs`) | 1 |
| Génération d'écritures + tests (`lib/accounting`) | 3 |
| Écrans catalogue produits + niveaux de stock + journal mouvements | 5 |
| Réception marchandises + transfert dépôts | 3 |
| Inventaire physique (comptage + écarts + validation) | 3 |
| Alertes seuil (cron + notification) | 2 |
| Rapport de valorisation + export | 2 |
| Tests unitaires Vitest + QA | 3 |
| Revue sécurité RLS (SEC-003) | 1 |
| **Total** | **≈ 27 j (~5,5 semaines)** |

### 1.6 Risques

- **Race condition stock_niveaux** : vente POS et réception simultanées sur le
  même produit → obligatoire de passer par une RPC Postgres avec verrou de
  ligne, jamais par un calcul côté client/API sans transaction.
- **Ambiguïté du plan comptable** (607 générique vs 601 marchandises, 4456/4457
  legacy vs couche IFRS 478 en cours) : risque de créer des écritures
  incohérentes avec le futur plan cible si non clarifié en amont avec la
  session "Comptable / PCM".
- **`factures` non itemisée** : toute tentation de "brancher" le stock sur les
  factures clients existantes sans refonte du module facturation produira des
  déductions de stock incorrectes ou approximatives — à exclure explicitement
  du périmètre v1 (cf. §0, §7).
- **Clôture mensuelle** : sans extension explicite de la règle R5 aux nouvelles
  tables, un mouvement de stock pourrait être créé sur une période déjà clôturée
  et fausser un état financier déjà transmis.
- **Multi-devise** : achats de marchandises en devise étrangère (fournisseurs
  offshore) doivent réutiliser `historical-rates.ts` pour le coût unitaire —
  sinon le CUMP dérive silencieusement.
- **Volume** : `mouvements_stock` est un journal qui grossit vite (chaque vente
  POS = au moins une ligne) — prévoir dès la conception les index
  `(societe_id, produit_id, depot_id, date_mouvement)` et une politique
  d'archivage/partition à moyen terme.

---

## 2. Module B — Point de vente (POS)

### 2.1 Objectifs & périmètre

**Décision de cadrage** (cf. §0) : le POS est un flux **itemisé et autonome**,
avec ses propres tables de lignes de vente. Il ne cherche pas à réutiliser la
table `factures` comme support de ses lignes — il peut, optionnellement,
produire une `facture` agrégée en fin de ticket (si le client demande une
facture formelle) exactement comme `bulletins_paie` alimente `OD-PAIE` sans que
la paie soit elle-même itemisée dans `factures`.

**Dans le périmètre v1** :
- Écran caisse tactile : recherche produit, panier, calcul TVA, remise.
- Encaissement multi-moyens de paiement (espèces, carte, mobile money —
  **enregistrement du moyen**, pas d'intégration réelle avec une passerelle de
  paiement).
- Déduction de stock en temps réel à la validation du ticket.
- Sessions de caisse (ouverture/fermeture, comptage, écart).
- Remboursements/avoirs avec retour de stock.
- Génération automatique des écritures comptables (vente + COGS).

**Hors périmètre v1** :
- Intégration passerelle de paiement carte réelle (Juice, MCB, etc.).
- Mode hors-ligne / PWA avec synchronisation différée (risque de double
  déduction de stock, cf. §6).
- Conformité MRA "Electronic Billing System" (facturation électronique
  temps réel) — à vérifier séparément, cf. §6, avant toute mise en prod
  commerciale.
- Programme de fidélité, gestion de coupons/promotions complexes.

### 2.2 Modèle de données proposé

**`sessions_caisse`** — un "shift" de caisse
```
id                          UUID PK
societe_id                  UUID FK societes
depot_id                    UUID FK depots               -- type='point_de_vente'
caissier_id                 UUID FK profiles
statut                      TEXT DEFAULT 'ouverte'  -- CHECK IN ('ouverte','fermee')
fond_ouverture              NUMERIC(15,2)
fond_fermeture_theorique    NUMERIC(15,2)   -- calculé = fond_ouverture + Σ paiements especes du shift
fond_fermeture_compte       NUMERIC(15,2)   -- comptage réel saisi par le caissier
ecart_caisse                NUMERIC(15,2)   -- GENERATED = fond_fermeture_compte - fond_fermeture_theorique
ouverte_at                  TIMESTAMPTZ
fermee_at                   TIMESTAMPTZ NULL
notes                       TEXT
```

**`ventes_pos`** — ticket de caisse
```
id                UUID PK
societe_id        UUID FK societes
session_caisse_id UUID FK sessions_caisse
depot_id          UUID FK depots
numero_ticket     TEXT NOT NULL   -- UNIQUE(societe_id, numero_ticket)
client_id         UUID FK factures_contacts NULL   -- vente anonyme autorisée
facture_id        UUID FK factures NULL             -- si facture formelle demandée
date_vente        TIMESTAMPTZ
montant_ht        NUMERIC(15,2)
montant_tva       NUMERIC(15,2)
montant_ttc       NUMERIC(15,2)
statut            TEXT DEFAULT 'validee'  -- CHECK IN ('brouillon','validee','annulee','remboursee','remboursee_partiel')
```

**`lignes_vente_pos`**
```
id                     UUID PK
vente_pos_id           UUID FK ventes_pos
produit_id             UUID FK produits
quantite               NUMERIC(15,3)
prix_unitaire_ht        NUMERIC(15,2)
remise_pct              NUMERIC(5,2) DEFAULT 0
taux_tva                NUMERIC(5,2)
montant_ht              NUMERIC(15,2)
montant_tva             NUMERIC(15,2)
montant_ttc             NUMERIC(15,2)
cout_unitaire_cumul      NUMERIC(15,4)   -- CUMP capturé au moment de la vente (COGS)
mouvement_stock_id       UUID FK mouvements_stock NULL
```

**`paiements_pos`** — un ticket peut être réglé en plusieurs moyens
```
id                UUID PK
vente_pos_id      UUID FK ventes_pos
moyen_paiement    TEXT  -- CHECK IN ('especes','carte','mobile_money','virement','avoir_client')
montant           NUMERIC(15,2)
reference         TEXT NULL   -- 4 derniers chiffres carte, réf transaction mobile money
compte_comptable  VARCHAR(10)  -- 530 (especes) / 5118 (carte, transit) / 512x (virement)
```

**`remboursements_pos`** / **`lignes_remboursement_pos`**
```
remboursements_pos:
  id                  UUID PK
  vente_pos_id_origine UUID FK ventes_pos
  motif                TEXT
  montant_ttc          NUMERIC(15,2)
  cree_par             UUID FK profiles
  created_at           TIMESTAMPTZ

lignes_remboursement_pos:
  id                        UUID PK
  remboursement_id          UUID FK remboursements_pos
  ligne_vente_pos_id        UUID FK lignes_vente_pos
  quantite_remboursee       NUMERIC(15,3)
  retour_en_stock           BOOLEAN DEFAULT TRUE   -- FALSE si produit défectueux détruit
```

### 2.3 Écrans principaux

1. **Écran caisse** (tactile, plein écran) — recherche/scan produit, panier,
   remise ligne/ticket, sélection moyen(s) de paiement, validation, impression
   ou envoi du ticket par email.
2. **Ouverture/fermeture de caisse** — saisie du fond d'ouverture, comptage de
   fermeture avec calcul d'écart, clôture de session (verrouille la caisse).
3. **Historique des tickets** — recherche, réimpression, détail, lancement d'un
   remboursement.
4. **Écran remboursement/avoir** — sélection des lignes à rembourser, motif,
   choix retour en stock ou non.
5. **Dashboard journalier caisse** — total ventes, ventilation par moyen de
   paiement, top produits vendus, écart de caisse du jour.
6. **Paramétrage point de vente** — dépôt associé, imprimante ticket, TVA par
   défaut, rôle(s) autorisés à ouvrir/fermer une caisse.

### 2.4 Intégration avec la comptabilité existante

Nouveau code journal **`POS`** (cohérent avec les codes existants VTE/ACH/BNQ/
OD/SAL/CLS/AN), généré à la validation du ticket, `ref_folio =
'POS-<vente_pos_id>'` :

| Écriture | Débit | Crédit |
|---|---|---|
| Encaissement (par moyen de paiement) | 530 Caisse *(nouveau)* / 5118 Monétique en transit *(nouveau)* / 512x Banque | 701 Ventes de marchandises (HT) + 4457 TVA collectée |
| COGS (sortie de stock, au CUMP) | 6037 Variation des stocks | 3701 Stock marchandises |
| Clôture de session — écart de caisse | 6588/758 Écarts de caisse *(nouveau, selon signe)* | 530 Caisse |
| Remboursement | 701 Ventes de marchandises (HT) + 4457 TVA collectée | 530/512x (moyen d'origine) |
| Retour en stock (si applicable) | 3701 Stock marchandises | 6037 Variation des stocks |

Le compte 5118 "Monétique en transit" est nécessaire si l'encaissement carte
n'est pas crédité en banque le jour même (cas standard Maurice) — il est soldé
plus tard par le rapprochement bancaire existant (`lib/accounting/*rapprochement*`)
quand le relevé fait apparaître le virement de l'acquéreur carte.

Chaque ticket passe par `assertEquilibre` (R1) avant écriture, comme tout
autre flux. La génération d'écriture ventes réutilise au maximum les mêmes
primitives que `createEcrituresForFacture` (mêmes helpers `lib/money.ts`,
même table `ecritures_comptables_v2`) plutôt que de dupliquer la logique —
seul le déclencheur et le modèle de lignes source diffèrent.

### 2.5 Effort estimé (1 dev senior full-stack, jours ouvrés)

| Lot | Jours |
|---|---|
| Modélisation, migrations SQL, RLS | 3 |
| Rôle "caissier" + permissions (SEC-001 `ROLE_LEVEL`) | 1 |
| Écran caisse tactile (recherche, panier, raccourcis/scan) | 8 |
| Encaissement multi-moyens + calcul TVA/remises | 2 |
| Intégration stock temps réel (déduction atomique, blocage rupture) | 3 |
| Génération écritures ventes + COGS (journal POS) | 3 |
| Ticket PDF (react-pdf) + impression/email | 2 |
| Sessions de caisse (ouverture/fermeture, écarts) | 3 |
| Remboursements/avoirs | 2 |
| Dashboard journalier + rapport de clôture caisse | 2 |
| Tests unitaires Vitest + QA | 3 |
| **Total** | **≈ 32 j (~6,5 semaines)** |

### 2.6 Risques

- **Conformité fiscale Maurice (EBS)** : la MRA impose progressivement la
  facturation électronique temps réel (Electronic Billing System) à certains
  commerces assujettis TVA — risque de non-conformité si le(s) client(s) cible(s)
  sont concernés et que le POS ne s'y raccorde pas. À qualifier **avant** mise
  en prod commerciale, indépendamment de l'effort ci-dessus.
- **Concurrence sur le stock** : plusieurs postes de caisse simultanés sur le
  même dépôt → même exigence de RPC atomique que côté stock (§1.6), sinon
  risque de vente d'un produit déjà en rupture.
- **Écart de caisse récurrent** : sans seuil de tolérance défini avec le métier,
  chaque écart, même d'1 MUR, génère une écriture — à calibrer.
- **Rôle caissier dans SEC-001** : positionnement dans `ROLE_LEVEL` non
  trivial — un caissier ne doit ni voir la compta générale ni pouvoir modifier
  un rôle supérieur ; décision produit à trancher avant le développement des
  permissions.
- **Mode hors-ligne non couvert v1** : si le point de vente cible a des
  coupures réseau fréquentes, l'absence de mode dégradé peut rendre le POS
  inutilisable en usage réel — à cadrer explicitement en amont si c'est un
  besoin (impact effort significatif, non chiffré ici).
- **Ticket sans facture formelle** : le POS produit des `ventes_pos` hors du
  cycle `factures` — les rapports "chiffre d'affaires" qui interrogent
  aujourd'hui uniquement `factures` devront être étendus pour inclure
  `ventes_pos`, sous peine de sous-déclarer le CA dans les tableaux de bord
  existants.

---

## 3. Dépendances entre les deux modules

```
Module A — Stock/Inventaire (fondation)
   produits, depots, stock_niveaux, mouvements_stock
        │
        │  (référentiel produit + déduction de stock temps réel)
        ▼
Module B — Point de vente
   sessions_caisse, ventes_pos, lignes_vente_pos, paiements_pos
```

- **Le POS dépend intégralement du module Stock** : il ne peut pas exister sans
  `produits`, `stock_niveaux` et la RPC de mouvement atomique — la vente POS
  *est* un des types de `mouvements_stock` (`sortie_vente`).
- **Le module Stock ne dépend pas du POS** : il a de la valeur seul (suivi de
  stock pour un client qui facture en B2B classique et reçoit de la
  marchandise via `bons_reception`, avec ajustements manuels).
- **Séquencement recommandé** : livrer le Stock en premier (au moins
  `produits` + `stock_niveaux` + `mouvements_stock` + RPC atomique + écritures
  de base) avant d'entamer l'écran caisse du POS. Un deuxième développeur peut
  démarrer l'UI caisse dès que ce socle est stable, sans attendre l'inventaire
  physique ni les alertes (non bloquants pour le POS).

---

## 4. Plan comptable — comptes à créer / à réutiliser

| Compte | Libellé | Statut | Usage |
|---|---|---|---|
| 601 | Achats de marchandises | **existant** (`202_plan_comptable_strict_canonique.sql`) | Achat fournisseur d'un produit `gere_en_stock=true` |
| 701 | Ventes de marchandises | **existant** | Vente POS et vente B2B de marchandises |
| 4456 / 4457 | TVA déductible / collectée | **existant** | Inchangé |
| 401 / 411 | Fournisseurs / Clients | **existant** | Inchangé |
| **3701** | Stock de marchandises | **à créer** | Valeur du stock (SOFP actif courant) |
| **6037** | Variation des stocks de marchandises | **à créer** | Contrepartie de chaque mouvement de stock valorisé |
| **6586** | Pertes sur stocks | **à créer** | Casse/perte constatée |
| **6588** | Écarts d'inventaire / de caisse | **à créer** | Écarts de comptage physique et de caisse |
| **530** | Caisse (espèces) | **à créer** | Encaissement espèces POS |
| **5118** | Monétique en transit | **à créer** | Encaissement carte avant crédit bancaire effectif |

Ces comptes doivent être ajoutés via une migration `supabase/migrations/48x_*.sql`
dédiée (numérotée après le dernier fichier existant — vérifier au moment de
l'implémentation, la séquence actuelle saute de 467 à 476), revue en PR, **et**
recevoir leur classification IFRS correspondante dans `comptes_ifrs` (migration
478) pour ne pas créer d'angle mort dans les futurs états financiers IFRS.

---

## 5. Récapitulatif effort & phasage

| Phase | Contenu | Durée (1 dev) |
|---|---|---|
| Phase 1 | Module Stock complet (§1.5) | ≈ 5,5 semaines |
| Phase 2 | Module POS complet (§2.5), démarrable dès le socle stock stable | ≈ 6,5 semaines |
| **Total séquentiel** | | **≈ 12 semaines** |
| **Total avec 2 devs** (POS démarre à mi-parcours du Stock) | | **≈ 9-10 semaines calendaires** |

Non inclus dans ces chiffres : qualification de conformité MRA/EBS (§2.6),
mode hors-ligne POS si requis, itemisation du module `factures` pour la vente
B2B avec stock (hors périmètre v1, cf. §0/§7).

---

## 6. Risques transverses

- **Coordination multi-sessions** : les deux modules touchent
  `lib/accounting/**`, `supabase/migrations/**` et potentiellement
  `app/api/comptable/**` — zone signalée "active en parallèle" dans CLAUDE.md.
  Tout développement doit `git fetch && git merge origin/main` avant push et
  se synchroniser avec la session en charge du chantier IFRS/PCM (migrations
  476-479) avant de créer les nouveaux comptes du §4, pour éviter un conflit
  de numérotation ou de mapping.
- **Précision monétaire** : CUMP, COGS, écarts d'inventaire et de caisse sont
  tous des calculs financiers — obligation stricte `Decimal.js`/`lib/money.ts`,
  y compris dans les fonctions Postgres (NUMERIC, jamais FLOAT/REAL), par
  cohérence avec CLAUDE.md §3.E et le reste du moteur comptable existant.
- **RLS** : nouvelles tables → `user_has_societe_access(societe_id)` dès la
  première migration, pas le pattern legacy faible (cf. §0).
- **Clôture** : extension de la règle R5 (`period-lock.ts`) aux nouvelles
  tables — sans quoi un mouvement de stock ou un ticket POS pourrait être
  postdaté sur une période déjà clôturée et fausser un état déjà transmis au
  client/à la MRA.
- **exec_sql / DDL** : aucune migration de ce chantier ne doit recréer une
  fonction équivalente à `exec_sql` (SEC-002, définitivement supprimée) pour
  simplifier le développement des RPC de mouvement de stock — tout DDL passe
  par un fichier de migration revu en PR.

---

## 7. Questions ouvertes à trancher avant implémentation

1. Le périmètre v1 du POS (vente au détail itemisée, sans branchement sur les
   factures B2B classiques) est-il suffisant, ou faut-il aussi couvrir la
   vente B2B multi-produits avec sortie de stock via une facture "classique"
   (impact majeur : itemisation de `factures`, hors chiffrage ci-dessus) ?
2. CUMP seul en v1, ou FIFO/lots/péremption nécessaire dès le départ (secteur
   agro-alimentaire, pharmacie) ?
3. Mode hors-ligne du POS requis (coupures réseau fréquentes sur le lieu de
   vente) ?
4. Intégration réelle d'une passerelle de paiement carte (Juice/MCB) prévue,
   ou simple enregistrement du moyen de paiement en v1 (recommandé) ?
5. Le(s) commerce(s) cible(s) sont-ils dans le périmètre d'assujettissement à
   l'Electronic Billing System de la MRA ?
6. Mono-dépôt par société en v1 (fortement recommandé pour limiter l'effort),
   ou multi-dépôts avec transferts dès le départ ?
7. Qui peut ouvrir/fermer une session de caisse et valider un remboursement —
   quel positionnement du rôle "caissier" dans `ROLE_LEVEL` (SEC-001) ?
