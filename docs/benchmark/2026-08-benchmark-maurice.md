# Benchmark Maurice — Lexora face à QuickBooks, Zoho, Xero, Sage, Odoo et aux éditeurs locaux

_Août 2026 — source de vérité : liste officielle MRA des fournisseurs EBS
au 15 juillet 2026, grilles tarifaires publiques, et inventaire du code de
ce repo._

---

## 1. Résumé exécutif

Le marché mauricien du logiciel comptable n'est pas un marché de logiciels
comptables. C'est un marché de **conformité locale**, sur lequel des
produits mondiaux non localisés sont maintenus à flot par un tissu
d'intégrateurs qui leur greffent la partie mauricienne.

Trois faits structurent tout le reste :

1. **Aucune des grandes suites internationales n'est nativement
   mauricienne.** Sur les 98 fournisseurs EBS enregistrés auprès de la MRA
   au 15 juillet 2026, QuickBooks, Xero, Zoho Books, Sage, Odoo,
   Manager.io et Dynamics n'apparaissent **jamais en leur nom propre** —
   toujours via un intégrateur local (HLB Fintech, TechInstra, B.Chamroo,
   Botventr, Software Concepts, Spoon Consulting…). Le produit mondial
   fournit le grand livre ; le local fournit la conformité.
2. **La paie mauricienne n'est couverte par aucun d'eux.** PAYE, CSG, NSF,
   PRGF, training levy, bonus de fin d'année, severance au sens du Workers'
   Rights Act : c'est le domaine réservé des éditeurs locaux (Sicorax /
   Uniconsults en tête). Un client qui achète QuickBooks achète en réalité
   QuickBooks **plus** un logiciel de paie **plus** un middleware EBS.
3. **Le segment GBC / IFRS complet n'est servi par personne en logiciel.**
   PER 80 %, substance CIGA, transfer pricing, UBO, CRS/FATCA, Pillar Two,
   consolidation IFRS 10 : aujourd'hui ce travail est fait par les
   management companies, sous Excel, facturé à l'heure.

**Position de Lexora.** Lexora est le seul produit du panel à couvrir
d'un seul tenant les trois couches — comptabilité + conformité MRA + paie
mauricienne + GBC/IFRS. C'est un avantage réel et difficile à rattraper :
il ne s'agit pas de fonctionnalités, mais de règles métier codées
(34 modules métier dans `lib/accounting`, 81 fichiers de tests unitaires,
379 migrations SQL).

**Mais deux réserves majeures, à traiter avant toute campagne commerciale :**

- ⚠️ **Lexora n'est pas sur la liste EBS de la MRA** (98 fournisseurs
  au 15 juillet 2026). Tant que l'enregistrement + auto-certification ne
  sont pas faits, l'argument « conforme MRA » n'est pas opposable à un
  prospect qui vérifie.
- ⚠️ **La fiscalisation tourne en mode mock par défaut**
  (`lib/mra-ifp.ts` : `MRA_USE_MOCK !== 'false'`). L'architecture est là,
  le branchement production ne l'est pas encore.

Ces deux points sont des tâches d'administratif et de configuration, pas
de développement — mais ils conditionnent la crédibilité de tout le
positionnement.

---

## 2. Ce que la réglementation mauricienne impose vraiment

C'est la grille de lecture du benchmark : chaque ligne ci-dessous est une
obligation qu'un logiciel couvre, ou ne couvre pas.

| Obligation | Contenu | Qui la porte |
|---|---|---|
| **E-invoicing MRA (EBS)** | Transmission temps réel en JSON structuré, fiscalisation avant émission, retour IRN + QR code. Factures, reçus, notes de crédit et de débit. | Seuil > Rs 100 M depuis le 15 mai 2024 ; > Rs 80 M sur l'exercice 2025-2026 ; phase 50–80 M annoncée |
| **TVA** | Déclaration périodique, output/input tax, net payable ou crédit | Toute entité assujettie |
| **PAYE / CSG / NSF / training levy** | Retour mensuel, paiement avant fin du mois suivant, plateforme MRA | Tout employeur |
| **PRGF** | Retour mensuel par salarié, Workers' Rights Act | Tout employeur du privé |
| **TDS** | Retenue à la source sur certains paiements | Payeurs concernés |
| **CIT / APS** | Impôt société, acomptes | Toute société |
| **IT Form 3 / ROC / SFT** | États annuels employeur, return of company, transactions financières | Selon profil |
| **GBC — PER 80 %** | Régime d'exemption partielle, conditions de substance | GBC licenciées FSC |
| **GBC — substance / CIGA** | Core Income Generating Activities démontrées à Maurice | GBC |
| **Transfer pricing / UBO / CRS-FATCA** | Documentation prix de transfert, bénéficiaires effectifs, échange automatique (dépôt MRA au 30 juin) | GBC, trusts, FI |
| **Pillar Two (GloBE)** | Taux effectif minimum 15 % | Groupes > 750 M€ |
| **IFRS complet** | Pas IFRS for SMEs pour les GBC : IFRS 9/10/13/15/16, IAS 7/19/21/36/38 | GBC, sociétés cotées, grandes entités |

Un produit qui ne couvre que les quatre premières lignes ne couvre pas le
marché : il couvre l'entrée de gamme du marché.

---

## 3. Les quatre familles d'acteurs

### A. Suites internationales cloud — le grand livre, rien d'autre

QuickBooks Online, Xero, Zoho Books, Sage 50cloud Pastel / 200 Evolution /
X3, Odoo, Manager.io, Dynamics 365 Business Central, SAP Business One.

Excellentes sur le cœur comptable, l'ergonomie, l'écosystème d'apps
tierces et les intégrations bancaires internationales. **Aucune
localisation mauricienne native** : ni champs BRN / transaction type
TC01–TC06, ni fiscalisation MRA, ni paie locale. La conformité arrive par
un intégrateur mauricien, en surcouche et en facture séparée.

Cas emblématique : **HLB Fintech (Mauritius) Ltd**, enregistrée à la MRA
pour QuickBooks Online, Sage, Xero, Zoho, Manager.io, Microsoft Dynamics
**et** Odoo — soit un pur rôle de passerelle de fiscalisation devant sept
produits qu'elle n'édite pas.

### B. Middleware EBS mauricien — la conformité, rien d'autre

Codeblix, ebsmauritius.com (Streak Technologies), envoice.mu,
vat-invoice.mu, Fertositeweb, Faktura (Interlogic), Swift Invoicing…

Nés du mandat e-invoicing. Ils font une chose et la font bien : émettre et
fiscaliser. Pas de grand livre complet, pas de paie, pas d'IFRS. Ce sont
des concurrents sur la facturation, jamais sur la comptabilité — et des
partenaires potentiels sur la fiscalisation.

### C. Éditeurs et intégrateurs locaux historiques — la profondeur locale

Uniconsults / **Sicorax** (leader payroll & HR mauricien : Payroll, HRMS,
Accounting, Fixed Assets), Software Concepts (Sage, 29 ans),
Harel Mallac Technologies, Rogers Capital, Leal Communications,
State Informatics, Seidor (SAP B1), Spoon Consulting (Odoo).

Ils connaissent le terrain, le PRGF, les habitudes des cabinets. Faiblesses
structurelles : produits souvent on-premise ou client-serveur, UX datée,
cycles de vente et d'implémentation longs, coûts de première année élevés,
et surtout **suites fragmentées** — la paie chez l'un, la compta chez
l'autre, l'e-invoicing chez un troisième.

### D. Lexora

Voir §4 et §5.

---

## 4. Inventaire fonctionnel de Lexora (vérifié dans le code)

| Domaine | Ce qui est implémenté | Où |
|---|---|---|
| **Fiscalisation MRA** | Intégration IFP : IRN, QR code scannable, annulation, log d'audit 7 ans (`mra_fiscalisation_logs`) | `lib/mra-ifp.ts`, `app/api/mra/fiscalise` |
| **TVA / EBS** | Génération du retour TVA depuis le grand livre, mapping par tags de comptes avec repli sur 4456/4457 | `lib/pcm/mra-ebs.ts` |
| **Déclarations MRA** | TDS, CIT, ROC, SFT, IT Form 3, hub MRA, échéancier des dates légales | `app/client/mra-*`, `lib/accounting/mra-deadlines.ts` |
| **Paie mauricienne** | PAYE/NSF/CSG, PRGF, bonus de fin d'année, severance, heures sup, jours fériés MU, congés, maternité, cash-in-lieu, provisions IAS 19, registres S116 | `lib/rh/*` (43 modules) |
| **Temps & présence** | Pointage, sessions, planning, géolocalisation, trajets & frais kilométriques | `app/rh/*` |
| **Comptabilité** | PCM mauricien, écritures, lettrage, grand livre, clôture, verrouillage de période, exercices | `lib/pcm`, `lib/accounting` |
| **Banque** | Import relevés, adaptateur MCB, IBAN/SWIFT, rapprochement déterministe (règles R1–R7) **et** sémantique LLM | `lib/banks`, `lib/accounting/rapprochement`, `semantic-rapprochement.ts` |
| **OCR / IA** | Extraction de relevés bancaires, OCR Mistral, agent comptable, assistant de rédaction | `lib/ai/*`, `app/client/lex-ocr` |
| **GBC** | PER 80 %, substance CIGA, transfer pricing, UBO, CRS/FATCA, Pillar Two GloBE, consolidation, auto-tagging GBC | `lib/accounting/{per,substance,transfer-pricing,ubo,crs-fatca,pillar-two,consolidation}.ts` |
| **IFRS complet** | IFRS 9 ECL, IFRS 10 éliminations, IFRS 13, IFRS 15, IFRS 16, IAS 7, IAS 19, IAS 21 devise fonctionnelle, IAS 36, IAS 38 | `lib/ifrs/*`, `lib/accounting/functional-currency.ts` |
| **Multi-devises** | Taux historiques, écarts de change, connecteur Bank of Mauritius | `lib/taux-change.ts`, `lib/connectors/bom-fx.ts` |
| **Audit** | Workpapers, piste d'audit, contrôles internes, séparation des tâches, RBAC hiérarchique (`ROLE_LEVEL`) | `lib/audit`, `docs/INTERNAL_CONTROLS_DOCUMENTATION.md` |
| **Pilotage** | Bot Telegram signé HMAC, workflows n8n, serveur MCP, 518 routes API | `app/api/telegram`, `mcp-server` |
| **Régional** | Socle multi-juridiction, module OHADA | `lib/jurisdictions/{mauritius,ohada}` |
| **Précision monétaire** | `decimal.js` — pas de flottants natifs sur la monnaie | `lib/money.ts` |

**Volumétrie** : 379 migrations SQL, 518 routes API, 81 fichiers de tests
unitaires, 12 suites e2e.

### Ce que Lexora ne fait pas

- **Pas de gestion de stock / inventaire** (le « catalogue » est un
  référentiel articles-prix, pas une gestion de stock valorisée).
- **Pas de POS** — segment retail entièrement hors périmètre.
- **Écosystème d'apps tierces quasi nul** face aux 750+ intégrations de
  Xero ou QuickBooks.
- **Pas de connexion bancaire directe généralisée** : un seul adaptateur
  (MCB) contre les feeds bancaires natifs des suites internationales.
- **Fiscalisation MRA non certifiée et en mode mock par défaut** (cf. §1).

---

## 5. Matrice comparative

Légende : ✅ natif · 🟡 partiel / via module payant / via intégrateur ·
❌ absent · — hors périmètre produit.

| Fonction | **Lexora** | QuickBooks Online | Zoho Books | Xero | Sage 50c / 200 Evo | Odoo (intégr. MU) | Sicorax (local) | Middleware EBS |
|---|---|---|---|---|---|---|---|---|
| Comptabilité générale / grand livre | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Plan comptable mauricien (PCM) préconfiguré | ✅ | 🟡 à paramétrer | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ❌ |
| Facturation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Fiscalisation MRA temps réel (IRN + QR)** | 🟡 codé, non certifié | 🟡 via intégrateur | 🟡 via intégrateur | 🟡 via intégrateur | 🟡 via intégrateur | 🟡 via intégrateur | 🟡 | ✅ |
| Champs BRN / TC01–TC06 | ✅ | ❌ | ❌ | ❌ | 🟡 | 🟡 | ✅ | ✅ |
| Déclaration TVA format MRA | ✅ | 🟡 rapport TVA générique | 🟡 | 🟡 | 🟡 | 🟡 | ✅ | ❌ |
| **PAYE / CSG / NSF / training levy** | ✅ | ❌ | ❌ | ❌ | 🟡 module MU tiers | 🟡 | ✅ | ❌ |
| **PRGF** | ✅ | ❌ | ❌ | ❌ | 🟡 | ❌ | ✅ | ❌ |
| Bonus fin d'année / severance (Workers' Rights Act) | ✅ | ❌ | ❌ | ❌ | 🟡 | ❌ | ✅ | ❌ |
| Congés / planning / pointage / géoloc | ✅ | ❌ | 🟡 Zoho People (autre produit) | ❌ | 🟡 | ✅ | ✅ | ❌ |
| TDS | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ |
| CIT / APS / IT Form 3 / ROC / SFT | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ |
| Multi-devises + taux Bank of Mauritius | ✅ | ✅ (générique) | ✅ dès plan Pro | ✅ | ✅ | ✅ | 🟡 | 🟡 |
| Rapprochement bancaire automatique | ✅ règles + LLM | ✅ feeds bancaires | ✅ | ✅ (référence) | ✅ | 🟡 | 🟡 | ❌ |
| Feeds bancaires directs multi-banques | 🟡 MCB seul | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | ❌ |
| OCR pièces / IA | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | ❌ | 🟡 |
| **GBC — PER 80 %** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **GBC — substance / CIGA** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Transfer pricing** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **UBO / CRS / FATCA** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Pillar Two (GloBE)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **IFRS complet (9/10/13/15/16, IAS 7/19/21/36/38)** | ✅ | ❌ | ❌ | ❌ | 🟡 X3 | 🟡 | ❌ | ❌ |
| Consolidation multi-entités | ✅ | 🟡 Advanced | ❌ | 🟡 add-on | ✅ 200/X3 | ✅ | 🟡 | ❌ |
| Gestion de stock / inventaire | ❌ | ✅ Plus+ | ✅ Premium+ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| POS | ❌ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | 🟡 | ✅ (Codeblix) |
| Immobilisations / amortissements | ✅ | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ✅ | ❌ |
| Piste d'audit / contrôles internes documentés | ✅ | 🟡 | 🟡 | ✅ | ✅ | 🟡 | 🟡 | 🟡 |
| Écosystème d'apps tierces | ❌ | ✅ 750+ | ✅ suite Zoho | ✅ 1000+ | ✅ | ✅ | ❌ | ❌ |
| API / MCP / automatisation agentique | ✅ | ✅ API | ✅ API | ✅ API | 🟡 | ✅ | ❌ | 🟡 |
| Pilotage conversationnel (Telegram / IA) | ✅ | ❌ | 🟡 Zia | ❌ | ❌ | ❌ | ❌ | ❌ |
| Support en français, fuseau Maurice | ✅ | 🟡 revendeur | ❌ | ❌ | ✅ partenaire | ✅ | ✅ | ✅ |
| Expansion régionale OHADA | ✅ socle | 🟡 | 🟡 | 🟡 | ✅ | ✅ | ❌ | ❌ |

---

## 6. Comparatif tarifaire (MUR, hors taxes)

Conversions internationales à titre indicatif au taux ≈ Rs 46 / USD.

### Lexora

| Package | Palier | Prix mensuel | Transactions incluses | Entités |
|---|---|---|---|---|
| Société | Essentiel | **Rs 2 500** | 50 | 1 |
| Société | Croissance | **Rs 4 900** | 200 | 1 |
| Société | PME | **Rs 9 900** | 500 | 1 |
| Société | Corporate | **Rs 18 900** | 1 500 | 1 |
| Société | Enterprise | sur devis | illimité | 1 |
| GBC | Authorised | **Rs 8 500** | 100 | 1 |
| GBC | Standard | **Rs 15 000** | 500 | 1 |
| GBC | Groupe | **Rs 32 000** | 1 500 | 5 |
| GBC | Management Co | sur devis | illimité | illimité |

Mise en service **Rs 8 000 par société** (paramétrage + 4 h de formation) ·
dépassement Rs 15/transaction, plafonné à l'écart avec le palier supérieur ·
Rs 4 500/mois par entité consolidée supplémentaire ·
engagement annuel : 12 mois d'usage, 10 mois facturés.

**Utilisateurs, salariés, bulletins, congés, contrats : illimités sur tous
les paliers.** C'est un point de vente décisif — voir §7.

### Concurrence

| Produit | Prix affiché | Équivalent MUR/mois | Ce qui n'est pas inclus |
|---|---|---|---|
| **QuickBooks Online Essentials** (Quick Focus, MU) | Rs 2 999/mois, 3 users | 2 999 | Paie MU, e-invoicing MRA, GBC/IFRS |
| **QuickBooks Online Plus** (MU) | Rs 4 399/mois, 5 users | 4 399 | idem |
| **QuickBooks Online Advanced** (MU) | Rs 9 599/mois, 25 users | 9 599 | idem |
| QuickBooks Desktop Pro / Premier / Accountant | Rs 21 900 / 23 900 / 24 900 (achat) | — | idem + pas de cloud |
| Formation QuickBooks (masterclass) | Rs 12 000 — net Rs 3 000 après refund HRDC 75 % | — | — |
| **QuickBooks Online (US, après hausse 1er mai 2026)** | $20 / 35 / 70 / 110 / 250 | ≈ 920 → 11 500 | Paie et paiements facturés à part |
| **Xero** | $25 / 55 / 90 | ≈ 1 150 → 4 140 | Paie MU inexistante (paie native AU/UK seulement) |
| **Zoho Books** | Gratuit (< $50k CA) · $15 / 40 / 60 · jusqu'à $275 Ultimate | ≈ 0 → 12 650 | Multi-devises seulement dès Professional ($40) |
| **vat-invoice.mu** | Rs 0 (3 factures) · Rs 990 (50 factures) · Rs 2 490 illimité | 0 → 2 490 | Facturation seule — ni compta, ni paie |
| **Codeblix EBS** | ≈ Rs 35 000 la 1re année (setup inclus) | ≈ 2 900 lissé | Plan « Business » calibré 51–300 factures/mois |
| **Sage 200 Evolution** (Software Concepts) | Première année en **centaines de milliers de roupies** | — | Paie MU en module séparé |
| **Sicorax** (Uniconsults) | Sur devis, payroll outsourcing au forfait mensuel/salarié | — | Compta et paie = licences distinctes |

### Le vrai comparatif : coût total de conformité

Une PME mauricienne de 20 salariés, assujettie TVA, franchissant le seuil
e-invoicing :

| Poste | Stack international | Stack local classique | **Lexora** |
|---|---|---|---|
| Comptabilité | QBO Plus — Rs 4 399 | Sage / Sicorax Accounting — licence | inclus |
| Paie 20 salariés | logiciel paie MU — Rs 2 000–4 000 | Sicorax Payroll — Rs 2 000–5 000 | **inclus, illimité** |
| E-invoicing MRA | middleware — Rs 1 000–2 900 | module EBS — Rs 1 000–2 900 | inclus |
| Déclarations MRA (TDS, ROC, SFT, IT3) | Excel + cabinet | Excel + cabinet | inclus |
| **Total mensuel** | **≈ Rs 7 400 – 11 300** | **≈ Rs 6 000 – 12 000** | **Rs 4 900 – 9 900** |
| Nombre de fournisseurs | 2–3 | 2–3 | **1** |
| Réconciliation inter-outils | à la charge du client | à la charge du client | néant |

Sur le segment GBC, la comparaison n'a pas lieu : il n'existe pas d'offre
logicielle concurrente. Le point de référence est le coût horaire d'une
management company sur des travaux Excel (PER, substance, TP, CRS/FATCA,
Pillar Two) — plusieurs dizaines de milliers de roupies par exercice et
par entité. Rs 15 000/mois pour un GBC Standard se compare à cela, pas à
Zoho Books.

---

## 7. Lecture stratégique

### Là où Lexora gagne, franchement

1. **Le bundle conformité complet.** Aucun concurrent du panel ne couvre
   simultanément compta + fiscalisation MRA + paie mauricienne complète +
   déclarations MRA. Le prospect ne compare pas des prix de licences, il
   compare **un fournisseur contre trois**.
2. **La paie illimitée.** Le prix est indexé sur le volume de
   transactions, pas sur les salariés ni les utilisateurs. Face à
   QuickBooks (3 users en Essentials, 5 en Plus, 25 en Advanced) et aux
   payrolls facturés au salarié, c'est structurellement gagnant sur toute
   entreprise à effectif significatif et faible volume de pièces —
   restauration, hôtellerie, sécurité, nettoyage, construction.
3. **Le monopole de fait sur le GBC.** PER, substance, TP, UBO,
   CRS/FATCA, Pillar Two, IFRS complet et consolidation dans un produit :
   c'est un segment à forte valeur, à faible sensibilité prix, où les
   acheteurs sont des management companies qui facturent ce travail à
   leurs clients.
4. **La profondeur réglementaire codée.** 379 migrations, 81 fichiers de
   tests. C'est le fossé : un concurrent international ne le franchira pas
   pour un marché de 1,3 M d'habitants ; un concurrent local n'a pas
   l'appareil IFRS.
5. **Le socle multi-juridiction (OHADA).** La même conformité codée est
   réplicable sur l'Afrique francophone — les concurrents locaux
   mauriciens n'ont pas ce chemin.

### Là où Lexora perd

1. **Crédibilité de conformité non établie** : absence de la liste EBS
   MRA, fiscalisation en mock. C'est le premier trou à boucher, et c'est
   l'objection n°1 que fera tout prospect > Rs 80 M de CA.
2. **Pas de stock, pas de POS** : import-distribution et retail sont hors
   jeu. Codeblix, Odoo et Sage prennent ce terrain sans concurrence.
3. **Un seul feed bancaire (MCB)**. Xero et QuickBooks ont bâti leur
   réputation là-dessus. Chaque banque non couverte est un import manuel
   de plus, donc un argument de moins.
4. **Ticket d'entrée**. Rs 2 500/mois + Rs 8 000 de mise en service face à
   un vat-invoice.mu gratuit ou un Zoho Books gratuit : le très petit
   commerçant ne sera jamais un client Lexora. Ce n'est pas un défaut,
   c'est une frontière de marché — mais il faut l'assumer explicitement
   dans le discours plutôt que de la subir en rendez-vous.
5. **Écosystème et effet de marque**. Un cabinet qui forme ses juniors sur
   QuickBooks a un coût de changement réel. La réponse est la formation
   incluse (4 h) et le refund HRDC — que les concurrents utilisent déjà
   (Quick Focus affiche Rs 12 000 ramenés à Rs 3 000).

### Angles morts du marché, exploitables

- **La phase e-invoicing 50–80 M** amènera une nouvelle vague
  d'entreprises à s'équiper. Fenêtre commerciale nette, à condition d'être
  sur la liste MRA avant.
- **Les intégrateurs sont des concurrents fragiles** : ils vendent une
  passerelle devant un produit qu'ils ne maîtrisent pas. HLB Fintech
  couvre sept produits — donc aucun en profondeur.
- **Les management companies sont des revendeurs, pas seulement des
  clients.** Une MC qui administre 40 GBC est un canal, avec un modèle de
  facturation par entité déjà en place dans la grille (Rs 4 500/entité).

---

## 8. Recommandations

**Priorité 1 — Débloquer la conformité (semaines, pas mois)**

1. Enregistrer Lexora comme fournisseur EBS auprès de la MRA
   (einvoicing@mra.mu) et procéder à l'auto-certification. Sans cela, tout
   l'argumentaire est contestable.
2. Valider en sandbox puis basculer `MRA_USE_MOCK=false` en production,
   avec le log d'audit `mra_fiscalisation_logs` actif (rétention 7 ans
   déjà prévue).

**Priorité 2 — Fermer les écarts qui coûtent des deals**

3. Étendre les adaptateurs bancaires au-delà de MCB (SBM, ABSA, MauBank,
   AfrAsia) — c'est l'écart le plus visible face à Xero/QuickBooks.
4. Décider explicitement du non-périmètre stock/POS et l'assumer dans le
   discours : « Lexora n'est pas un ERP de distribution ». Un partenariat
   avec un POS mauricien vaut mieux qu'un module bâclé.

**Priorité 3 — Positionner le prix sur le bon comparatif**

5. Ne jamais comparer Lexora à Zoho Books ou QuickBooks seuls. Le
   comparatif à afficher est le **coût total de conformité** du §6 :
   3 fournisseurs contre 1.
6. Sur le GBC, ancrer le prix sur les honoraires de management company
   remplacés, pas sur un prix de licence.
7. Faire figurer le refund HRDC 75 % sur la mise en service et la
   formation, comme le fait Quick Focus. Rs 8 000 affichés à Rs 2 000 nets
   change la conversation.

**Priorité 4 — Canaux**

8. Cibler les management companies FSC comme revendeurs sur le GBC.
9. Cibler les secteurs à fort effectif / faible volume de pièces, où la
   paie illimitée écrase mécaniquement les grilles concurrentes.

---

## Sources

- [MRA — Liste des fournisseurs EBS enregistrés au 15 juillet 2026 (PDF, 98 fournisseurs)](https://www.mra.mu/download/eInvoicing/EBSSolutionProviders.pdf)
- [MRA — e-Invoicing](https://www.mra.mu/index.php/e-invoicing)
- [MRA — Guide PRGF](https://www.mra.mu/download/PRGFGuide.pdf)
- [VATupdate — Mauritius Expands E-Invoicing Mandate to Businesses over MUR 80 Million](https://www.vatupdate.com/2025/07/04/mauritius-expands-e-invoicing-mandate-to-include-businesses-with-turnover-over-mur-80-million/)
- [Comarch — Mauritius Expands E-Invoicing Mandate to Broader Taxpayer Base](https://www.comarch.com/trade-and-services/data-management/legal-regulation-changes/mauritius-expands-e-invoicing-mandate-to-broader-taxpayer-base/)
- [Pagero — E-invoicing compliance in Mauritius](https://www.pagero.com/us/compliance/regulatory-updates/mauritius)
- [ClearTax — e-Invoicing in Mauritius: Timeline, Guidelines, Process](https://www.cleartax.com/mu/e-invoicing-mauritius)
- [Quick Focus Ltd — QuickBooks Mauritius, tarifs](https://www.quickfocus.mu/pricing/)
- [Quick Focus Ltd — QuickBooks vs Xero pour les PME mauriciennes](https://www.quickfocus.biz/quickbooks-vs-xero-the-ultimate-accounting-software-showdown-for-mauritian-small-businesses/)
- [Arnifi — Best Accounting Software for Mauritius GBLs and SMEs 2026](https://arnifi.com/blog/best-accounting-software-mauritius-gbl-sme-2026-guide/)
- [EBS Mauritius — pricing et intégrations](https://www.ebsmauritius.com/pricing/)
- [EBS Mauritius — QuickBooks Desktop et e-invoicing MRA](https://www.ebsmauritius.com/insights/guides/quickbooks-desktop-e-invoicing-mauritius/)
- [Codeblix EBS — MRA-Approved E-Invoicing & POS](https://codeblix.com/)
- [vat-invoice.mu — tarifs logiciel de facturation TVA](https://vat-invoice.mu/en/blog/vat-invoice-software-mauritius)
- [Sicorax / Uniconsults — produits](https://www.sicorax.mu/en/products.html)
- [Software Concepts Ltd — Sage Pastel Mauritius / Sage 200 Evolution](https://sft.co.mu/our-solutions/sage-200-evolution)
- [Zoho Books — tarifs 2026](https://www.g2.com/products/zoho-books/pricing)
- [QuickBooks Online — tarifs 2026 après la hausse du 1er mai](https://buyersprint.com/2026/05/07/quickbooks-online-pricing-2026/)
- [Xero vs QuickBooks Online — comparatif 2026](https://unibee.dev/blog/xero-vs-quickbooks-online-ultimate-comparison/)
- [Ramco — Mauritius Payroll & Tax Regulatory Updates](https://www.ramco.com/payce/payroll-compliance-mauritius)
- [RemotePeople — Mauritius Payroll Tax & Compliance Guide 2026](https://remotepeople.com/countries/mauritius/employer-of-record/payroll-tax/)
- [Sunibel — FATCA & CRS Compliance in Mauritius](https://www.creation-societe-maurice.com/en/taxation-mauritius/fatca-crs/)
- [MIPA — Mauritius Institute of Professional Accountants](https://www.mipa.mu/)
