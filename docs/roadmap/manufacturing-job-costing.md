# Roadmap — Manufacturing (transformation & nomenclatures) & Job Costing

**Statut** : proposition de spec, aucun code ni migration livrés dans ce document.
**Périmètre** : deux modules absents de Lexora aujourd'hui — (C) Manufacturing
(transformation de produits en un autre produit, nomenclatures), (D) Job costing
(coûts et temps passé par job/projet client, avec imputation du temps RH).
Document de cadrage produit + technique, à valider avant tout chantier
d'implémentation. Numérotation des modules poursuivie à partir de
`docs/roadmap/inventaire-pos.md` (Module A = Stock/Inventaire, Module B = POS)
avec lequel ce document a une dépendance forte (§0, §1.6).

---

## 0. Constats sur l'existant (base du dimensionnement ci-dessous)

- **Aucun module Stock/Inventaire n'existe encore** dans le repo — confirmé en
  §0 de `docs/roadmap/inventaire-pos.md`. Le Manufacturing décrit ici **ne peut
  pas être construit avant** ce socle (`produits`, `depots`, `stock_niveaux`,
  `mouvements_stock`, RPC atomique de mouvement) : une transformation de
  produit *est* une consommation + une production de stock. Voir §1.6.
- **Aucun compte de classe 3 (stocks) n'existe** dans le plan comptable
  (`202_plan_comptable_strict_canonique.sql`, `478_plan_comptable_ifrs_maurice.sql`).
  Le module A propose déjà `3701` (marchandises) / `6037` (variation). Ce
  document propose des comptes **distincts** pour matières premières, en-cours
  et produits finis (§4) — une entreprise qui fabrique ne doit pas confondre le
  stock de marchandises achetées-revendues avec le stock de sa propre
  production (traitement comptable différent : achats/variation de stocks vs
  production stockée, cf. §1.4).
- **`ecritures_comptables_v2`** (moteur unique depuis la migration 120) n'a
  aujourd'hui **aucune colonne analytique** (pas de `job_id`, pas de
  `centre_cout_id`). Toute ventilation d'écritures par job ou par ordre de
  fabrication nécessite une extension additive (nouvelles colonnes nullable),
  jamais une refonte de la table — cohérent avec l'esprit des migrations
  478/479 ("couche additive") déjà en cours sur ce repo.
- **`pointages`** (`017_pointeuse_conges_chat.sql`) capture des heures
  d'horloge (`heure_entree`/`heure_sortie`) par employé et par jour, **sans
  aucune notion d'affectation** (job, client, ordre de fabrication, tâche). Le
  moteur de paie (`generer_ecritures_paie`, `lib/rh/paie.ts`) calcule un coût
  salarial agrégé par bulletin, pas par heure imputable. C'est le trou
  fonctionnel que les deux modules ci-dessous doivent combler côté RH.
- **`employes.salaire_base`** est le seul champ de coût direct disponible —
  il n'existe pas de "coût horaire chargé" (salaire + charges patronales
  NSF/PRGF/Training Levy, cf. comptes `4321`-`4324`) précalculé et exposé. Les
  deux modules ont besoin de cette donnée ; elle doit être **dérivée** du
  moteur de paie existant (`lib/rh/accrual-mensuel.ts`, `ias19-provisions.ts`),
  pas recalculée indépendamment — risque de dérive sinon (§2.8, §6).
- **`contrats_clients`** (migration 125) est un module de **rédaction** de
  lettres de mission/contrats (IA + PDF + signature) — ce n'est **pas** un
  référentiel "job/projet client" facturable à l'heure ou au forfait. Le
  module Job Costing introduit une entité distincte (`jobs`), avec un lien
  optionnel vers `dossiers` (le dossier client comptable existant) et vers
  `contrats_clients` (le contrat qui a donné lieu au job), sans dupliquer ni
  modifier ces tables.
- **`factures`** reste une table à plat sans lignes (cf. §0 de
  `inventaire-pos.md`) — la refacturation d'un job (temps + dépenses) vers le
  client produira une facture agrégée (montant HT/TVA/TTC), pas une facture
  détaillée ligne par ligne, tant que ce chantier séparé n'est pas fait.
- Le moteur d'écritures (`assertEquilibre` R1, `lib/money.ts` en Decimal.js,
  journaux VTE/ACH/BNQ/OD/SAL/CLS/AN, `ref_folio`, R5 clôture de période) est
  mûr et **doit être réutilisé** par les deux modules, jamais réimplémenté.

---

## 1. Module C — Manufacturing (transformation & nomenclatures)

### 1.1 Objectifs & périmètre

**Dans le périmètre v1** :
- Nomenclatures (Bill of Materials) **à un seul niveau** : un produit fini
  consomme une liste de composants (matières premières ou produits achetés),
  pas de sous-assemblages imbriqués.
- Ordres de fabrication (OF) : planification, consommation de matières,
  affectation de main d'œuvre directe, clôture avec calcul du coût de revient
  réel et entrée en stock du produit fini.
- Valorisation du produit fini au coût de revient réel (matières + main
  d'œuvre directe), pas de coûts indirects/frais généraux de production en v1.
- Écritures comptables automatiques pour chaque étape (consommation, transfert
  analytique de main d'œuvre, entrée en stock du produit fini).
- Écart de fabrication (rebut/perte de matière) constaté et comptabilisé.

**Hors périmètre v1** (dette assumée, cf. §7) :
- Nomenclatures multi-niveaux / sous-assemblages (produit fini A qui contient
  un produit fini B lui-même fabriqué) — nécessite une explosion récursive et
  un contrôle anti-cycle ; à ne traiter qu'une fois le besoin confirmé.
- Coûts indirects de production (amortissement machine, énergie, frais
  généraux d'atelier affectés au prorata) — v2, nécessite une méthode
  d'imputation (taux horaire machine, clé de répartition) non triviale.
- Ordonnancement/planification capacitaire (gammes opératoires, postes de
  charge, séquencement multi-OF) — v1 reste un simple statut planifié → en
  cours → terminé, sans calcul de charge d'atelier.
- Gestion des rebuts avec valorisation de sous-produits/recyclage.
- Traçabilité par lot/numéro de série (utile agro-alimentaire/pharma) — hérite
  de la même limite que le Module A (CUMP seul, pas de FIFO/lots en v1).

### 1.2 Modèle de données proposé

Toutes les tables : `societe_id UUID REFERENCES societes(id)`, RLS via
`user_has_societe_access(societe_id)` (SEC-003), `created_at`/`updated_at`
standards. Dépend directement de `produits`, `depots`, `mouvements_stock`
(Module A) — voir §1.6.

**`nomenclatures`** — en-tête de BOM
```
id                     UUID PK
societe_id             UUID FK societes
produit_fini_id        UUID FK produits          -- le produit obtenu
version                TEXT NOT NULL DEFAULT '1'
libelle                TEXT
quantite_produite      NUMERIC(15,3) NOT NULL DEFAULT 1   -- BOM définie "pour produire N unités" (fabrication par lot)
statut                 TEXT DEFAULT 'brouillon'   -- CHECK IN ('brouillon','active','obsolete')
cout_matieres_estime   NUMERIC(15,4)              -- indicatif, recalculé depuis les lignes ; le coût réel vient des OF
actif                  BOOLEAN DEFAULT TRUE
cree_par               UUID FK profiles
UNIQUE(produit_fini_id, version)
```
Une seule version `statut = 'active'` par `produit_fini_id` (index unique
partiel `WHERE statut = 'active'`) — c'est celle utilisée par défaut à la
création d'un OF.

**`lignes_nomenclature`** — composants
```
id                       UUID PK
nomenclature_id          UUID FK nomenclatures
produit_composant_id     UUID FK produits    -- CHECK produit_composant_id <> (nomenclatures.produit_fini_id correspondant) — anti-cycle direct minimal
quantite                 NUMERIC(15,4) NOT NULL CHECK (quantite > 0)
unite                    TEXT
taux_perte_pct           NUMERIC(5,2) DEFAULT 0   -- majore la quantité théorique consommée (rebut normal attendu)
ordre                    INTEGER DEFAULT 0
```
Contrôle applicatif obligatoire à la création : `produit_composant_id` ne doit
pas lui-même avoir une nomenclature active dont `produit_fini_id` remonte au
produit fini de la BOM courante (anti-cycle) — trivial en v1 puisqu'il n'y a
qu'un niveau, mais **doit être verrouillé dès v1** pour ne pas complexifier une
migration v2 vers le multi-niveaux avec des BOM déjà cycliques en base.

**`ordres_fabrication`** — ordre de fabrication (OF)
```
id                        UUID PK
societe_id                UUID FK societes
depot_id                  UUID FK depots            -- dépôt de sortie matières / entrée produit fini
nomenclature_id           UUID FK nomenclatures
numero_of                 TEXT NOT NULL             -- UNIQUE(societe_id, numero_of)
quantite_a_produire       NUMERIC(15,3) NOT NULL CHECK (quantite_a_produire > 0)
quantite_produite         NUMERIC(15,3) DEFAULT 0
statut                    TEXT DEFAULT 'planifie'    -- CHECK IN ('planifie','en_cours','termine','cloture','annule')
job_id                    UUID FK jobs NULL          -- fabrication à la commande pour un job client (lien vers Module D, §2)
date_planifiee            DATE
date_debut_reel           TIMESTAMPTZ NULL
date_fin_reel             TIMESTAMPTZ NULL
cout_matieres_reel        NUMERIC(15,2) DEFAULT 0    -- cumul maintenu par RPC, jamais recalculé côté client
cout_main_oeuvre_reel     NUMERIC(15,2) DEFAULT 0    -- cumul maintenu par RPC (Σ imputations_temps liées)
cout_unitaire_revient     NUMERIC(15,4) NULL         -- figé à la clôture = (cout_matieres_reel + cout_main_oeuvre_reel) / quantite_produite
responsable_id            UUID FK profiles
notes                     TEXT
```
Immuable après `statut = 'cloture'` (même logique que R6) : toute correction
post-clôture passe par un OF de régularisation, jamais par UPDATE.

**`consommations_of`** — matières consommées (une ligne par composant réellement sorti)
```
id                       UUID PK
ordre_fabrication_id     UUID FK ordres_fabrication
produit_id                UUID FK produits
quantite_theorique        NUMERIC(15,4)   -- lignes_nomenclature.quantite × (quantite_a_produire / nomenclatures.quantite_produite) × (1 + taux_perte_pct)
quantite_reelle           NUMERIC(15,4)   -- saisie à la consommation, peut différer (rebut, casse)
cout_unitaire              NUMERIC(15,4)   -- CUMP du composant au moment de la consommation
mouvement_stock_id         UUID FK mouvements_stock   -- type_mouvement = 'sortie_fabrication' (extension de l'ENUM du Module A)
date_consommation          DATE
```

**`productions_of`** — produit fini obtenu (peut être partiel, plusieurs entrées sur un même OF)
```
id                       UUID PK
ordre_fabrication_id     UUID FK ordres_fabrication
produit_id                UUID FK produits    -- = nomenclatures.produit_fini_id
quantite                  NUMERIC(15,3) NOT NULL CHECK (quantite > 0)
cout_unitaire_revient      NUMERIC(15,4)       -- coût de revient au moment de cette entrée (peut différer entre deux entrées partielles du même OF)
mouvement_stock_id         UUID FK mouvements_stock   -- type_mouvement = 'entree_production' (extension de l'ENUM du Module A)
date_production            DATE
```

**Imputation de main d'œuvre directe** : réutilise la table `imputations_temps`
décrite en détail au §2.2 (Module D) — une même table sert les deux modules
(`job_id` **ou** `ordre_fabrication_id`, l'un des deux, jamais les deux) pour
éviter deux mécanismes parallèles de saisie de temps sur une même heure de
travail. C'est la réponse directe au besoin "imputation du temps RH sur un
job/OF" demandé dans le périmètre de mission.

### 1.3 Écrans principaux

1. **Nomenclatures** — liste par produit fini, éditeur de BOM (ajout/retrait
   de composants, quantités, taux de perte), activation d'une version,
   duplication pour créer une v2.
2. **Ordres de fabrication — liste** — filtrable par statut/dépôt/période,
   indicateurs d'avancement (quantité produite / à produire).
3. **Ordre de fabrication — détail** — création depuis une nomenclature
   (préremplissage des composants théoriques), lancement (statut `en_cours`,
   génère les mouvements de sortie matière), saisie des quantités réelles
   consommées, saisie des entrées de production (partielles ou totales),
   bouton de clôture (calcule et fige `cout_unitaire_revient`).
4. **Imputation de temps sur OF** — écran (ou onglet du détail OF) listant les
   employés et heures affectées, avec sélection depuis les pointages du jour
   non encore imputés (partage l'écran/composant avec le Module D, §2.3).
5. **Écart de fabrication** — vue de synthèse théorique vs réel par OF clôturé
   (quantités matières, coût), utile pour le contrôle de gestion.
6. **Rapport de coût de revient** — historique des `cout_unitaire_revient`
   par produit fini dans le temps (détecter une dérive de coût matière ou de
   main d'œuvre).

### 1.4 Intégration avec la comptabilité existante

Principe : méthode de l'inventaire permanent, avec une distinction volontaire
entre stock de **matières premières/marchandises achetées** (logique
achats-et-variations, classe 60, comme le Module A) et stock de **production
propre** (logique production-stockée, classe 71) — c'est la convention PCG
standard et elle change la présentation IFRS (la production stockée n'est pas
un coût des ventes, c'est un ajustement du chiffre d'affaires/production de
l'exercice, cf. `comptes_ifrs` migration 478).

| Événement | Débit | Crédit |
|---|---|---|
| Réception matière première (bon de réception, réutilise le circuit du Module A) | 3100 Matières premières *(nouveau)* | 6031 Variation des stocks de matières premières *(nouveau, symétrique de 6037)* |
| Consommation matière sur un OF (lancement) | 3300 En-cours de production *(nouveau)* | 3100 Matières premières |
| Affectation main d'œuvre directe à l'OF | 3300 En-cours de production | 6412 Charges de personnel — production *(nouveau, reclassement interne, ne modifie pas le total des charges de personnel)* |
| Entrée en stock du produit fini (production partielle ou clôture) | 3500 Produits finis *(nouveau)* | 3300 En-cours de production |
| Vente du produit fini (COGS, au coût de revient figé) | 7135 Production stockée (variation) *(nouveau)* | 3500 Produits finis |
| Écart matière constaté (quantité réelle > théorique) | 6586 Pertes sur stocks *(réutilisé depuis Module A)* | 3100 Matières premières |
| Écart matière constaté (quantité réelle < théorique — moins consommé que prévu) | 3100 Matières premières | 6586 Pertes sur stocks *(contre-passation, signe inverse)* |

Points d'attention transposés du moteur existant :
- `assertEquilibre` (R1) et R5 (clôture de période) s'appliquent à toutes ces
  écritures, sans exception.
- `ref_folio = 'OF-<ordre_fabrication_id>'`, journal proposé **`PRD`**
  (nouveau code, cohérent avec VTE/ACH/BNQ/OD/SAL/CLS/AN/POS) — à valider avec
  la session "Comptable/PCM" avant création (zone de coordination CLAUDE.md).
- Le compte `3300 En-cours de production` doit être soldé à zéro pour tout OF
  `cloture` : `Σ débits (matière + main d'œuvre) = Σ crédits (entrées produit
  fini)`. Un OF clôturé avec un solde 3300 non nul est un bug de calcul de
  coût de revient, pas un cas métier valide — à couvrir par un test.
- Aucun calcul flottant : `cout_unitaire`, `cout_unitaire_revient`,
  `quantite_theorique` transitent par `lib/money.ts` (Decimal.js) et des
  colonnes `NUMERIC` strictes, y compris dans les fonctions/RPC Postgres.
- Extension de `comptes_ifrs` (migration 478) : `3100`/`3300`/`3500` en
  `categorie_ifrs = 'actif_courant'` (poste `SOFP.ActifCourant.Stocks`), et
  `7135` comme composante de la production de l'exercice au compte de
  résultat — distincte de `701`/`6037` (marchandises) pour ne pas fausser la
  marge commerciale par la marge industrielle dans les états financiers.

### 1.5 Intégration avec la paie existante

- La main d'œuvre directe **n'est pas un nouveau flux de paie** — elle est un
  **reclassement analytique** d'un coût déjà généré par `generer_ecritures_paie`
  (journal `SAL`, comptes 641x charges de personnel). Le module Manufacturing
  ne recrée jamais d'écriture de salaire ; il tague/reclasse une fraction du
  coût salarial déjà comptabilisé.
- Chaque ligne d'`imputations_temps` (§2.2) rattachée à un `ordre_fabrication_id`
  porte un `cout_horaire_charge` figé au moment de la saisie (dérivé du moteur
  de paie, cf. §2.5 — même mécanisme que pour un job).
- À la clôture d'un OF (ou en tâche mensuelle, au choix produit), le total des
  imputations de temps sur cet OF génère l'écriture de reclassement
  3300 / 6412 du §1.4 — **une seule écriture agrégée par OF**, pas une écriture
  par imputation horaire (volumétrie).
- **Contrainte de cohérence** : la somme des heures imputées sur des OF/jobs
  pour un employé et une date donnée ne doit jamais dépasser les heures
  réellement pointées ce jour-là (`pointages.heure_entree`/`heure_sortie` moins
  pause) — contrôle applicatif à la saisie, pas seulement une contrainte SQL,
  car les pointages peuvent être corrigés a posteriori (`pointages.correction`).
- Les employés en atelier n'ayant pas nécessairement de compte utilisateur
  Lexora (contrainte terrain courante) : prévoir une saisie par le
  responsable/chef d'atelier pour le compte des employés, pas uniquement une
  auto-déclaration — impact sur le design des permissions (rôle "chef
  d'atelier" à positionner dans `ROLE_LEVEL`, SEC-001).

### 1.6 Dépendances

- **Bloquant, non négociable** : Module A (Stock/Inventaire) doit être livré
  au moins pour `produits`, `depots`, `stock_niveaux`, `mouvements_stock` et
  la RPC atomique de mouvement, **avant** tout développement du Manufacturing
  — un OF n'est qu'un générateur spécialisé de `mouvements_stock`
  (`sortie_fabrication`/`entree_production`, deux nouvelles valeurs d'ENUM à
  ajouter à la liste `type_mouvement` existante).
- Dépend de la RPC de valorisation CUMP du Module A pour connaître le coût
  unitaire des composants consommés.
- Dépend de la table `imputations_temps` du Module D (§2.2) pour la main
  d'œuvre — les deux modules doivent être conçus **ensemble** même s'ils sont
  livrés dans un ordre différent (recommandation §5 : livrer la table
  `imputations_temps` en même temps que le socle Job Costing, avant les OF).
- Dépend du moteur d'écritures existant (`lib/accounting/*`, `lib/money.ts`,
  `ecritures_comptables_v2`) — aucune dépendance nouvelle hors du repo.
- Aucune dépendance directe sur le Module B (POS) — un produit fini fabriqué
  peut être vendu via une facture classique ou, si le POS est livré, via une
  vente au détail ; les deux circuits de vente consomment le même
  `mouvements_stock` en sortie.

### 1.7 Effort estimé (1 dev senior full-stack, jours ouvrés)

Hypothèse : Module A (Stock/Inventaire) déjà en production. Estimation en
sus, incrémentale.

| Lot | Jours |
|---|---|
| Modélisation, migrations SQL, RLS, extension ENUM `mouvements_stock` | 3 |
| Plan comptable (comptes 3100/3300/3500/6031/6412/7135, mapping `comptes_ifrs`, journal `PRD`) | 1,5 |
| Nomenclatures — CRUD + éditeur BOM + contrôle anti-cycle | 4 |
| Ordres de fabrication — cycle de vie (créer/lancer/consommer/produire/clôturer) | 6 |
| RPC de calcul de coût de revient à la clôture (Decimal.js, transactionnel) | 3 |
| Génération d'écritures (consommation, transfert MO, entrée produit fini) + tests | 3 |
| Table partagée `imputations_temps` (partie OF) — cf. effort détaillé §2.7 | *(mutualisé avec Module D)* |
| Écran imputation de temps sur OF (réutilise le composant du Module D) | 1 |
| Rapport écart théorique/réel + rapport coût de revient historique | 2 |
| Tests unitaires Vitest + QA | 3 |
| Revue sécurité RLS (SEC-003) + rôle chef d'atelier (SEC-001) | 1 |
| **Total (hors Module A, hors socle `imputations_temps` partagé)** | **≈ 27,5 j (~5,5 semaines)** |

### 1.8 Risques

- **Dépendance dure au Module A non livré** : tout démarrage anticipé du
  Manufacturing sans le socle Stock aboutit à réinventer `produits`/
  `mouvements_stock` en double — à proscrire explicitement (cf. §1.6).
- **Cycle dans les nomenclatures** : même limité à un niveau en v1, une saisie
  erronée (produit composant = produit fini de sa propre BOM) doit être
  bloquée en base et pas seulement côté UI — sinon une v2 multi-niveaux
  hérite de données corrompues impossibles à faire remonter par explosion
  récursive.
- **Coût de revient figé vs coût recalculé** : `cout_unitaire_revient` est
  figé à la clôture de l'OF et ne doit **jamais** être recalculé
  rétroactivement si le CUMP d'un composant change après coup (sinon la marge
  d'une vente déjà comptabilisée devient incohérente avec l'écriture déjà
  postée) — contrainte de conception à documenter clairement pour l'équipe
  dev (immuabilité post-clôture, cf. R6).
- **3300 non soldé** : toute divergence entre débits (matière + MO) et
  crédits (produit fini) sur un OF clôturé est un bug silencieux de calcul de
  marge industrielle — nécessite un test d'intégrité systématique avant
  clôture, pas seulement en QA manuelle.
- **Confusion 6037 (Module A) vs 6031/7135 (ce module)** : un développeur
  pressé pourrait réutiliser les comptes du Module A pour la production
  propre par simplicité — à documenter explicitement dans le code
  (commentaire + validation de type de compte) car l'impact IFRS diffère
  (marge commerciale vs production stockée).
- **Employés d'atelier sans compte utilisateur** : si la saisie de temps
  dépend d'une auto-déclaration par l'employé via son compte Lexora, le
  module est inutilisable pour une partie du terrain — à trancher en amont
  (cf. §7, question sur le rôle "chef d'atelier").
- **Coordination multi-sessions** : nouveaux comptes, nouveau journal `PRD`,
  extension de `comptes_ifrs` — zone "Comptable/PCM" active en parallèle
  (CLAUDE.md) ; toute création de compte doit être synchronisée avec le
  chantier IFRS/PCM en cours (migrations 476-479) pour éviter un conflit de
  numérotation.

---

## 2. Module D — Job Costing (coûts & temps par job/projet client)

### 2.1 Objectifs & périmètre

**Dans le périmètre v1** :
- Référentiel `jobs` (projets/mandats facturables), lien optionnel vers
  `dossiers` (client comptable existant) et `contrats_clients` (contrat
  d'origine).
- Imputation du temps RH sur un job (table partagée `imputations_temps`,
  cf. §1.2), avec circuit de validation (saisie → soumission → validation par
  un responsable).
- Coût horaire chargé par employé, dérivé du moteur de paie existant (pas de
  ressaisie manuelle d'un taux "à la main" en usage normal).
- Dépenses non-salariales imputables à un job (achats, sous-traitance, notes
  de frais existantes).
- Rapport de rentabilité par job : coût réel (temps + dépenses) vs budget vs
  montant facturé.
- Écritures analytiques (tag `job_id` sur les écritures existantes +
  reclassement agrégé optionnel à la clôture du job).

**Hors périmètre v1** (dette assumée, cf. §7) :
- Facturation détaillée du job ligne par ligne dans `factures` (dépend de
  l'itemisation de `factures`, chantier séparé, cf. §0) — v1 produit une
  facture agrégée, avec le détail du temps/dépenses consultable côté job mais
  pas reporté ligne par ligne sur la facture PDF.
- Comptabilisation en avancement (IFRS 15 méthode du pourcentage d'avancement
  pour les contrats pluriannuels) — v1 reste en méthode "coûts constatés",
  pas de reconnaissance de revenu à l'avancement. À qualifier séparément si
  des clients ont des contrats long-terme concernés par IFRS 15.
- Budgets détaillés par tâche/phase (v1 : un seul budget heures + un seul
  budget montant par job, pas de budget par ligne de tâche).
- Refacturation multi-devises d'un job (v1 : un job = une devise).

### 2.2 Modèle de données proposé

**`jobs`** — projet/mandat facturable
```
id                    UUID PK
societe_id            UUID FK societes           -- entité qui exécute le job (le client de Lexora, ou le cabinet lui-même pour ses propres mandats internes)
dossier_id            UUID FK dossiers NULL       -- lien optionnel vers le dossier client comptable existant
contrat_id            UUID FK contrats_clients NULL  -- contrat d'origine si applicable
code                  TEXT NOT NULL               -- UNIQUE(societe_id, code), ex: JOB-2026-014
libelle               TEXT NOT NULL
client_nom            TEXT                        -- libre, si pas de dossier_id (job interne, prospect, etc.)
type_facturation      TEXT DEFAULT 'temps_materiel'  -- CHECK IN ('temps_materiel','forfait','abonnement')
statut                TEXT DEFAULT 'ouvert'       -- CHECK IN ('ouvert','en_cours','en_pause','cloture','facture','annule')
responsable_id        UUID FK profiles            -- chef de projet / associé responsable
date_debut            DATE
date_fin_prevue       DATE NULL
date_cloture          DATE NULL
budget_heures         NUMERIC(9,2) NULL
budget_montant        NUMERIC(15,2) NULL
devise                TEXT DEFAULT 'MUR'
facture_id            UUID FK factures NULL       -- facture agrégée générée à la facturation du job
cout_temps_reel       NUMERIC(15,2) DEFAULT 0     -- cumul maintenu par RPC (Σ imputations_temps.cout_total)
cout_depenses_reel    NUMERIC(15,2) DEFAULT 0     -- cumul maintenu par RPC (Σ depenses_job.montant_ht)
montant_facturable    NUMERIC(15,2) DEFAULT 0     -- cumul (Σ heures facturables × taux_horaire_facture + Σ dépenses facturables)
```

**`imputations_temps`** — table **partagée** avec le Module C (§1.2)
```
id                       UUID PK
societe_id               UUID FK societes
job_id                   UUID FK jobs NULL
ordre_fabrication_id     UUID FK ordres_fabrication NULL
                          -- CHECK (num_nonnulls(job_id, ordre_fabrication_id) = 1) : exactement l'un des deux
employe_id               UUID FK employes
pointage_id              UUID FK pointages NULL     -- lien optionnel vers le pointage source (traçabilité, pas obligatoire pour un consultant en régie sans pointeuse)
date_prestation          DATE NOT NULL
heures                   NUMERIC(6,2) NOT NULL CHECK (heures > 0)
type_heures              TEXT DEFAULT 'normale'     -- CHECK IN ('normale','heures_sup','deplacement')
tache                    TEXT
description              TEXT
facturable               BOOLEAN DEFAULT TRUE        -- pertinent seulement si job_id renseigné
taux_horaire_facture     NUMERIC(10,2) NULL          -- prix de vente, si facturable
cout_horaire_charge      NUMERIC(10,4) NOT NULL      -- coût interne, figé au moment de la saisie (snapshot, cf. §2.5)
cout_total               NUMERIC(15,2) GENERATED ALWAYS AS (heures * cout_horaire_charge) STORED
statut_validation        TEXT DEFAULT 'brouillon'    -- CHECK IN ('brouillon','soumis','valide','rejete','facture')
valide_par               UUID FK profiles NULL
valide_at                TIMESTAMPTZ NULL
saisi_par                UUID FK profiles
```
Immuable une fois `statut_validation = 'facture'` (correction par ligne
compensatoire, pas UPDATE). Contrôle applicatif (§1.5) : somme des heures
imputées (job + OF confondus) pour un `(employe_id, date_prestation)` ≤ heures
réellement pointées ce jour, avec tolérance configurable si l'entreprise
autorise du temps hors-pointeuse (régie/consultants).

**`depenses_job`** — coûts non-salariaux imputés à un job
```
id                        UUID PK
societe_id                UUID FK societes
job_id                    UUID FK jobs
type_depense              TEXT  -- CHECK IN ('achat_materiel','sous_traitance','frais_deplacement','autre')
description                TEXT
montant_ht                 NUMERIC(15,2)
devise                     TEXT DEFAULT 'MUR'
facture_fournisseur_id      UUID FK factures NULL     -- lien vers la facture fournisseur source
note_frais_id               UUID FK notes_de_frais NULL  -- réutilise le module existant (migration 272), pas de duplication
facturable                  BOOLEAN DEFAULT TRUE
marge_refacturation_pct      NUMERIC(5,2) DEFAULT 0    -- majoration appliquée à la refacturation client
cree_par                    UUID FK profiles
```

**`couts_horaires_employes`** — historique des taux chargés (snapshot périodique, pas recalculé rétroactivement)
```
id                     UUID PK
societe_id             UUID FK societes
employe_id             UUID FK employes
date_effet             DATE NOT NULL
cout_horaire_charge    NUMERIC(10,4) NOT NULL   -- cf. formule §2.5
methode_calcul         TEXT DEFAULT 'auto_bulletin'  -- CHECK IN ('auto_bulletin','manuel')
UNIQUE(employe_id, date_effet)
```
Alimentée automatiquement après chaque clôture de bulletin de paie (trigger ou
tâche mensuelle) ; `imputations_temps.cout_horaire_charge` recopie la valeur
en vigueur à `date_prestation` au moment de la saisie — jamais un JOIN live
sur le taux courant, pour ne pas faire bouger le coût d'un job déjà clôturé
quand un salaire change ensuite.

### 2.3 Écrans principaux

1. **Liste des jobs** — filtrable par statut/responsable/client, indicateurs
   (budget vs réel, % avancement heures).
2. **Fiche job** — en-tête (client, contrat, budget, responsable), onglets
   Temps / Dépenses / Rentabilité, bouton "Facturer" (génère une facture
   agrégée `factures` + passe le job en `facture`).
3. **Saisie de temps** (feuille de temps / timesheet) — vue employé (saisie
   personnelle, jour/semaine, sélection du job) et vue responsable (saisie
   pour un tiers, cas atelier/terrain sans compte utilisateur, partagée avec
   l'écran d'imputation OF du Module C, §1.3).
4. **File de validation des temps** — pour le responsable de job : liste des
   imputations `soumis`, valider/rejeter en masse ou ligne à ligne.
5. **Saisie de dépenses de job** — formulaire simple, lien optionnel vers une
   facture fournisseur ou une note de frais existante.
6. **Rapport de rentabilité par job** — coût réel (temps au coût chargé +
   dépenses) vs budget vs montant facturé/facturable, marge en %, export XLSX
   (réutilise le pattern export déjà en place côté balance/grand-livre).
7. **Rapport de rentabilité par employé/période** — heures imputées vs heures
   pointées (taux d'utilisation), utile pilotage cabinet.

### 2.4 Intégration avec la comptabilité existante

Approche additive, pas de refonte du moteur d'écritures :

1. **Colonne analytique additive sur `ecritures_comptables_v2`** :
   `job_id UUID REFERENCES jobs(id) NULL` et
   `ordre_fabrication_id UUID REFERENCES ordres_fabrication(id) NULL`
   (nullable, migration additive pure, aucun impact sur les écritures
   existantes ni sur `assertEquilibre`). Permet de taguer directement une
   écriture d'achat (journal `ACH`) ou de salaire (`SAL`) comme rattachée à un
   job, pour un reporting analytique **sans générer d'écriture supplémentaire**
   dans le cas le plus courant (une dépense de job = une écriture déjà
   existante, juste taguée).
2. **Écriture de reclassement de main d'œuvre** (optionnelle, au choix
   produit, à la clôture du job ou mensuellement) — même mécanisme que le
   Module C §1.4 :

   | Événement | Débit | Crédit |
   |---|---|---|
   | Coût de main d'œuvre affecté à un job (reclassement analytique) | 6413 Charges de personnel — jobs facturables *(nouveau, miroir de 6412)* | 641x Charges de personnel (compte d'origine, déjà porté par `SAL`) |

   Ce reclassement est **optionnel en v1** : une société qui se contente du
   reporting analytique via `job_id` (sans double écriture) peut l'activer ou
   non par paramétrage — évite de complexifier le compte de résultat pour les
   cabinets qui n'ont pas besoin d'un P&L par job détaillé.
3. **Refacturation au client** : à la clôture du job, génération d'une
   facture (`factures`, `type_facture = 'client'`) au montant agrégé
   `montant_facturable`, `dossier_id` repris du job si présent — réutilise
   `createEcrituresForFacture` sans modification (411/706-ou-4xx selon le
   mapping PCM en vigueur/4457).
4. Tout journal `PRD`/reclassement respecte `assertEquilibre` (R1) et R5
   (clôture de période) comme le reste du moteur.

### 2.5 Intégration avec la paie existante

Point central du module (mission explicite : "imputation du temps RH sur un
job") :

- **Formule du coût horaire chargé** (alimente `couts_horaires_employes`,
  §2.2) :
  `cout_horaire_charge = (salaire_base_mensuel + primes_fixes_recurrentes + charges_patronales_estimees) / heures_contractuelles_mensuelles`
  où `charges_patronales_estimees` (NSF patronal 4321, PRGF 4323, Training
  Levy 4324) et `heures_contractuelles_mensuelles` sont **calculées en
  réutilisant les fonctions existantes de `lib/rh/`** (`accrual-mensuel.ts`,
  logique déjà utilisée pour les provisions IAS 19) plutôt que réimplémentées
  — pour ne pas faire diverger deux moteurs de calcul de charges patronales
  dans le même repo (risque explicite, cf. §2.8 et §6).
- **Snapshot, pas de lien live** : `imputations_temps.cout_horaire_charge`
  copie la valeur de `couts_horaires_employes` en vigueur à la date de
  prestation. Un job déjà clôturé ne doit jamais changer de coût rétroactivement
  parce qu'un salaire a évolué depuis (même principe d'immuabilité que le
  Module C §1.8).
- **Lien avec `pointages`** : `imputations_temps.pointage_id` permet de
  dériver une saisie de temps depuis un pointage existant (l'employé badge
  8h, puis répartit ces 8h entre deux jobs) — mais reste optionnel, car un
  consultant en régie peut ne pas avoir de pointeuse et saisir directement ses
  heures sur le job.
- **Aucune double comptabilisation de charge sociale** : le module ne
  recalcule jamais de PAYE/NSF/CSG — ces montants restent exclusivement
  produits par le moteur de paie existant (`declarations-mra*.ts`). Le job
  costing ne fait que répartir analytiquement un coût déjà calculé.
- Rôles : la saisie de temps pour compte d'un tiers (responsable qui saisit
  pour son équipe) et la validation des feuilles de temps nécessitent un
  positionnement clair dans `ROLE_LEVEL` (SEC-001) — un `comptable` ne doit
  pas pouvoir valider les heures d'un job sur lequel il n'est pas responsable
  sans droit explicite.

### 2.6 Dépendances

- Dépend du moteur de paie existant pour la formule de coût horaire chargé
  (§2.5) — **pas un développement bloquant en soi**, mais nécessite une
  factorisation du calcul de charges patronales actuellement implicite dans
  `lib/rh/paie.ts` en une fonction réutilisable et testée indépendamment.
- Dépend de `dossiers`/`contrats_clients`/`factures` existants (liens
  optionnels, aucune modification de schéma sur ces tables).
- Dépend de `notes_de_frais` (migration 272) pour le lien optionnel des
  dépenses de job.
- **Aucune dépendance sur le Module A (Stock)** ni sur le Module C — le Job
  Costing a de la valeur seul (cabinet comptable qui facture des mandats au
  temps passé), c'est le Module C qui dépend de lui (via `imputations_temps`)
  pour la main d'œuvre directe, pas l'inverse.
- La colonne analytique additive sur `ecritures_comptables_v2` (§2.4) est une
  dépendance légère mais transverse — à coordonner avec toute autre migration
  en cours sur cette table (zone "Comptable/PCM", CLAUDE.md).

### 2.7 Effort estimé (1 dev senior full-stack, jours ouvrés)

| Lot | Jours |
|---|---|
| Modélisation, migrations SQL (`jobs`, `imputations_temps`, `depenses_job`, `couts_horaires_employes`), RLS | 4 |
| Factorisation du calcul de charges patronales depuis `lib/rh/paie.ts` en fonction réutilisable + tests | 2,5 |
| RPC/tâche de calcul du coût horaire chargé (post-clôture bulletin) | 2 |
| Colonne analytique additive `job_id`/`ordre_fabrication_id` sur `ecritures_comptables_v2` + migration | 1 |
| Écran liste + fiche job (Temps/Dépenses/Rentabilité) | 5 |
| Écran saisie de temps (timesheet employé + saisie pour tiers) | 5 |
| File de validation des temps | 2 |
| Écran saisie de dépenses de job | 2 |
| Écriture de reclassement analytique (optionnelle) + tests | 2 |
| Génération de la facture agrégée à la clôture (réutilise `createEcrituresForFacture`) | 2 |
| Rapport de rentabilité par job + par employé, export XLSX | 3 |
| Tests unitaires Vitest + QA | 3 |
| Revue sécurité RLS (SEC-003) + rôles (SEC-001) | 1 |
| **Total** | **≈ 34,5 j (~7 semaines)** |

Ce total **inclut** la table `imputations_temps` (socle partagé avec le
Module C) — c'est pourquoi le Module C ne la re-chiffre pas en §1.7.

### 2.8 Risques

- **Double moteur de charges patronales** : si la formule de coût horaire
  chargé (§2.5) est réimplémentée indépendamment de `lib/rh/paie.ts` plutôt
  que factorisée, tout changement de taux NSF/PRGF/Training Levy (loi de
  finances mauricienne) doit être répliqué à deux endroits — risque élevé
  d'oubli et de coûts de job silencieusement faux. **À traiter comme un
  prérequis, pas une optimisation.**
- **Heures imputées > heures pointées** : sans contrôle applicatif strict
  (§1.5), un employé peut déclarer plus d'heures sur des jobs que ce qu'il a
  réellement travaillé — fausse à la fois la rentabilité du job et, si le
  reclassement analytique est activé, la répartition du compte de résultat.
- **Snapshot du coût horaire non respecté** : un développeur qui joint
  `imputations_temps` à `employes.salaire_base` en live (au lieu du snapshot
  `couts_horaires_employes`) fait bouger rétroactivement la marge de jobs déjà
  clôturés et déjà facturés à chaque augmentation de salaire — bug silencieux
  difficile à détecter sans un test dédié.
- **Consultants sans pointeuse** : le module doit permettre une saisie de
  temps *sans* `pointage_id` (régie, terrain client) — si le design force un
  lien obligatoire vers `pointages`, une partie des utilisateurs cibles (RH/
  paie/planning est une zone active en parallèle, CLAUDE.md) ne peut pas
  utiliser le module.
- **Refacturation agrégée seulement** : tant que `factures` n'est pas
  itemisée, un client qui demande le détail des heures sur sa facture PDF
  devra recevoir ce détail via un document annexe (export du job), pas
  directement sur la facture — à communiquer clairement au produit pour
  éviter une attente non couverte.
- **Volumétrie `imputations_temps`** : une ligne par employé/jour/job, potentiellement
  multipliée par de nombreux jobs pour un cabinet avec plusieurs dizaines de
  clients — prévoir un index `(societe_id, job_id, date_prestation)` et
  `(employe_id, date_prestation)` dès la première migration.
- **Coordination multi-sessions** : colonne additive sur
  `ecritures_comptables_v2`, nouveaux comptes 6412/6413 — zone "Comptable/PCM"
  active en parallèle (CLAUDE.md), à synchroniser avant merge.

---

## 3. Dépendances entre les deux modules (et avec A/B)

```
Module A — Stock/Inventaire (fondation, cf. inventaire-pos.md)
   produits, depots, stock_niveaux, mouvements_stock
        │
        │ (référentiel produit + mouvement de stock)
        ▼
Module D — Job Costing (autonome, pas de dépendance sur A)
   jobs, imputations_temps, depenses_job, couts_horaires_employes
        │
        │ (table imputations_temps réutilisée pour la main d'œuvre directe)
        ▼
Module C — Manufacturing
   nomenclatures, ordres_fabrication, consommations_of, productions_of
   (dépend directement de Module A pour le stock, et de Module D pour le temps)
```

- **Module D (Job Costing) est autonome** : il peut être livré indépendamment
  des Modules A/B/C — un cabinet comptable qui facture ses mandats au temps
  passé n'a besoin ni de stock ni de fabrication.
- **Module C (Manufacturing) dépend des deux autres** : du Module A pour tout
  ce qui touche au stock (composants, produit fini), du Module D pour la
  table `imputations_temps` (main d'œuvre directe). C'est le module le plus
  contraint en séquencement.
- **Séquencement recommandé** si les quatre modules (A/B/C/D) sont
  envisagés : Module A d'abord (fondation), puis Module D (autonome, peut
  démarrer en parallèle par un deuxième développeur dès que le schéma
  `jobs`/`imputations_temps` est stabilisé), puis Module C en dernier
  (consomme A + D). Module B (POS) peut être développé en parallèle de D,
  sans lien avec C/D.
- **Si seul le Job Costing est demandé** (cas fréquent pour un cabinet
  comptable pur, sans activité de fabrication) : le Module D est livrable
  seul, sans aucune dépendance sur A/B/C — c'est le point d'entrée le plus
  rapide à valeur métier pour Lexora elle-même (facturation de ses propres
  mandats clients).

---

## 4. Plan comptable — comptes à créer / à réutiliser

| Compte | Libellé | Statut | Usage |
|---|---|---|---|
| 601 / 401 / 4456 | Achats de marchandises / Fournisseurs / TVA déductible | **existant** | Achat de matière première (facture fournisseur, inchangé) |
| 706 / 411 / 4457 | Prestations de services / Clients / TVA collectée (ou équivalent PCM) | **existant** | Facturation d'un job au client |
| 641x | Charges de personnel | **existant** | Coût salarial d'origine (`SAL`), avant tout reclassement analytique |
| **3100** | Matières premières | **à créer** | Stock de composants (Module C) |
| **3300** | En-cours de production | **à créer** | Valeur des OF non clôturés (Module C) |
| **3500** | Produits finis | **à créer** | Stock de produits fabriqués (Module C) |
| **6031** | Variation des stocks de matières premières | **à créer** | Symétrique de 6037 (Module A), pour matières premières |
| **6412** | Charges de personnel — production | **à créer** | Reclassement analytique MO directe fabrication (Module C) |
| **6413** | Charges de personnel — jobs facturables | **à créer** | Reclassement analytique MO directe job costing (Module D, optionnel) |
| **7135** | Production stockée (variation) | **à créer** | Contrepartie entrée/sortie de stock de produits finis (Module C) |
| 6586 | Pertes sur stocks | **réutilisé** (proposé par Module A) | Écarts matière constatés en fabrication |

Colonnes additives proposées : `ecritures_comptables_v2.job_id` (nullable),
`ecritures_comptables_v2.ordre_fabrication_id` (nullable) — migration
additive pure, à faire valider avec la session "Comptable/PCM" (coordination
CLAUDE.md) avant de la fusionner avec les migrations 476-479 en cours.

Ces comptes doivent être ajoutés via une migration `supabase/migrations/48x_*.sql`
dédiée, numérotée après le dernier fichier existant au moment de
l'implémentation, revue en PR, avec leur classification IFRS correspondante
dans `comptes_ifrs` (migration 478) — en particulier veiller à ce que `7135`
soit classé comme composante de la production de l'exercice et non comme un
coût des ventes, pour ne pas fausser la marge commerciale affichée dans les
états financiers IFRS.

---

## 5. Récapitulatif effort & phasage

| Phase | Contenu | Durée (1 dev) |
|---|---|---|
| Phase 0 | Module A — Stock/Inventaire (prérequis, cf. `inventaire-pos.md`) | ≈ 5,5 semaines |
| Phase 1 | Module D — Job Costing complet (autonome, démarrable en parallèle de la Phase 0 par un 2ᵉ développeur, sauf la partie qui touche `ecritures_comptables_v2` à coordonner) | ≈ 7 semaines |
| Phase 2 | Module C — Manufacturing (démarrable seulement quand Phases 0 et 1 sont stables) | ≈ 5,5 semaines |
| **Total séquentiel (A → D → C)** | | **≈ 18 semaines** |
| **Total avec 2 devs** (D en parallèle de A dès le départ, C démarre dès que A et D sont stables) | | **≈ 12-13 semaines calendaires** |
| **Job Costing seul** (sans Stock ni Manufacturing, cas cabinet comptable pur) | Module D uniquement | **≈ 7 semaines, aucun prérequis** |

Non inclus dans ces chiffres : itemisation de `factures` (facturation
détaillée par job/ligne de vente), conformité IFRS 15 à l'avancement pour les
contrats pluriannuels, nomenclatures multi-niveaux, coûts indirects de
production (frais généraux d'atelier).

---

## 6. Risques transverses

- **Coordination multi-sessions** : les deux modules touchent
  `lib/accounting/**`, `lib/rh/**`, `supabase/migrations/**` et potentiellement
  `app/api/comptable/**`/`app/api/rh/**` — zones signalées "actives en
  parallèle" dans CLAUDE.md. Tout développement doit `git fetch && git merge
  origin/main` avant push, et se synchroniser avec les sessions en charge des
  chantiers IFRS/PCM (migrations 476-479) et RH/paie avant de créer de
  nouveaux comptes ou de toucher `lib/rh/paie.ts`.
- **Précision monétaire** : coût de revient, coût horaire chargé, écarts
  matière — tous des calculs financiers, obligation stricte `Decimal.js`/
  `lib/money.ts`, y compris dans les fonctions Postgres (NUMERIC, jamais
  FLOAT/REAL), cohérent avec CLAUDE.md §3.E.
- **RLS** : toutes les nouvelles tables via `user_has_societe_access(societe_id)`
  / `user_has_employe_access(employe_id)` (SEC-003) dès la première migration.
- **Clôture** : extension de la règle R5 (`period-lock.ts`) aux nouvelles
  tables (`ordres_fabrication`, `imputations_temps`, `depenses_job`) — sans
  quoi une imputation de temps ou une consommation matière pourrait être
  postdatée sur une période déjà clôturée et fausser un état déjà transmis.
- **exec_sql / DDL** : aucune migration de ce chantier ne doit recréer une
  fonction équivalente à `exec_sql` (SEC-002, définitivement supprimée) —
  tout DDL passe par un fichier de migration revu en PR, jamais par RPC
  client ni par les outils `mcp Supabase execute_sql`/`apply_migration`
  directement sur la base de production.
- **SEC-001 (`ROLE_LEVEL`)** : les nouveaux rôles/permissions implicites
  ("chef d'atelier", "responsable de job") doivent être positionnés
  explicitement dans la hiérarchie avant tout développement d'écran de
  validation, pour éviter qu'un rôle inférieur ne valide ses propres heures
  ou celles d'un rôle supérieur.

---

## 7. Questions ouvertes à trancher avant implémentation

1. Le Job Costing est-il demandé pour un usage interne (Lexora facture ses
   propres mandats clients), pour un client de Lexora (PME cliente qui
   facture ses propres jobs), ou les deux ? Impacte le modèle de permissions
   et l'urgence relative par rapport au Manufacturing.
2. Nomenclatures multi-niveaux nécessaires dès le départ, ou le périmètre
   "un seul niveau" (matières premières uniquement) suffit-il pour le(s)
   client(s) cible(s) ?
3. Coûts indirects de production (frais généraux d'atelier) à intégrer au
   coût de revient dès v1, ou acceptable de ne valoriser que matières +
   main d'œuvre directe ?
4. Le reclassement analytique comptable (écritures 6412/6413) est-il
   réellement demandé par les clients cabinets, ou le tag `job_id`/
   `ordre_fabrication_id` seul (reporting analytique sans double écriture)
   suffit-il en v1 ? Impacte directement l'effort §1.7/§2.7.
5. Faut-il couvrir des jobs/contrats pluriannuels avec reconnaissance de
   revenu à l'avancement (IFRS 15) — impact majeur hors chiffrage ci-dessus,
   nécessite une expertise IFRS 15 dédiée (voir skill
   `lexora-gbc-ifrs-complete` pour le cadrage GBC/IFRS général, à compléter
   spécifiquement sur IFRS 15 si confirmé).
6. Quel positionnement des nouveaux rôles ("chef d'atelier", "responsable de
   job") dans `ROLE_LEVEL` (SEC-001) — qui peut saisir du temps pour un
   tiers, qui valide, qui clôture un OF ou un job ?
7. Séquencement business réel : le besoin le plus pressant est-il le Job
   Costing (valeur immédiate pour Lexora elle-même) ou le Manufacturing
   (valeur pour un client industriel spécifique) ? Détermine si Phase 1
   (Job Costing) doit réellement précéder Phase 2 (Manufacturing), ou si un
   client prioritaire impose l'inverse malgré la dépendance technique décrite
   en §1.6/§3.
