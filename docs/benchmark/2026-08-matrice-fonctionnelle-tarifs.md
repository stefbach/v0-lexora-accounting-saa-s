# Matrice fonctionnelle détaillée & tarifs — Lexora vs concurrents Maurice

_Août 2026 — annexe au [benchmark marché](./2026-08-benchmark-maurice.md)._

Ce document liste **l'intégralité des fonctionnalités de Lexora**, vérifiées
une par une dans le code du repo, et les confronte aux huit alternatives
présentes sur le marché mauricien, avec les grilles tarifaires au plan près.

---

## Avertissement méthodologique

**Colonne Lexora** : chaque ligne a été vérifiée dans le code (page, route
API ou module `lib/`). Aucune ligne n'est déclarative.

**Colonnes concurrentes** : évaluées à partir de la documentation publique
des éditeurs, de leurs grilles tarifaires et du registre EBS de la MRA.
Elles n'ont **pas** fait l'objet de tests en conditions réelles. Une case
peut donc sous-estimer un produit qui couvrirait un besoin par une voie non
documentée. Les cases « ◐ via intégrateur » signifient que la fonction
existe sur le marché mauricien, mais pas dans le produit : elle est fournie
par un tiers, sur une facture séparée.

**Marques** : ● natif · ◐ partiel, en option payante ou via un tiers ·
○ absent · — hors périmètre du produit.

**Colonnes** : QBO = QuickBooks Online · Zoho = Zoho Books ·
Sage = 50cloud Pastel / 200 Evolution / X3 · Odoo = Odoo via intégrateur
mauricien · Sicorax = Uniconsults et éditeurs locaux équivalents ·
EBS = middleware e-invoicing (Codeblix, ebsmauritius, vat-invoice.mu).

**Taux de conversion indicatifs** : ≈ Rs 46 / USD, ≈ Rs 2,50 / ZAR.

---

## 1. Comptabilité générale

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Plan comptable mauricien préconfiguré + templates | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ● | ○ |
| Saisie d'écritures / journaux | ● | ● | ● | ● | ● | ● | ● | ○ |
| Grand livre + export PDF et XLSX | ● | ● | ● | ● | ● | ● | ● | ○ |
| Balance générale + export XLSX | ● | ● | ● | ● | ● | ● | ● | ○ |
| États financiers (bilan, compte de résultat) | ● | ● | ● | ● | ● | ● | ● | ○ |
| Export FEC | ● | ○ | ○ | ○ | ◐ | ◐ | ◐ | ○ |
| Lettrage automatique et manuel | ● | ● | ● | ● | ● | ● | ● | ○ |
| Clôture d'exercice + snapshot figé | ● | ● | ● | ● | ● | ● | ● | ○ |
| Verrouillage de période | ● | ● | ● | ● | ● | ● | ● | ○ |
| Multi-exercices, exercices décalés | ● | ● | ● | ● | ● | ● | ● | ○ |
| Contrôles de santé du plan comptable | ● | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| Reclassement de comptes + audit de reclassement | ● | ○ | ○ | ○ | ◐ | ◐ | ○ | ○ |
| Comptes courants d'associés | ● | ◐ | ◐ | ◐ | ● | ● | ● | ○ |
| Immobilisations et amortissements | ● | ◐ | ◐ Premium+ | ◐ | ● | ● | ● | ○ |
| Inter-sociétés + réconciliation intercos | ● | ○ | ○ | ○ | ● | ● | ◐ | ○ |
| Précision monétaire décimale (pas de flottants) | ● | ● | ● | ● | ● | ● | ● | ◐ |

## 2. Facturation, achats et recouvrement

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Facturation client | ● | ● | ● | ● | ● | ● | ● | ● |
| Modèles de facture personnalisables + aperçu | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| Génération de facture assistée par IA (chat) | ● | ◐ | ◐ Zia | ○ | ○ | ◐ | ○ | ○ |
| Factures récurrentes | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| Relances automatiques + historique | ● | ● | ● | ● | ● | ● | ◐ | ○ |
| Paiements partiels et échéanciers | ● | ● | ● | ● | ● | ● | ● | ◐ |
| Envoi de facture par email | ● | ● | ● | ● | ● | ● | ● | ● |
| Export batch PDF de factures | ● | ◐ | ● | ◐ | ● | ● | ◐ | ◐ |
| Import CSV de factures | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| Détection de doublons de factures | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ○ | ○ |
| Règlement hors banque (espèces, compensation) | ● | ● | ● | ● | ● | ● | ● | ○ |
| Fournisseurs et factures d'achat | ● | ● | ● | ● | ● | ● | ● | ◐ |
| Catalogue articles / prix unitaires | ● | ● | ● | ● | ● | ● | ● | ◐ |
| Notes de frais (création automatique) | ● | ● | ● | ◐ Established | ● | ● | ◐ | ○ |
| **Devis / propositions commerciales** | **○** | ● | ● | ● | ● | ● | ● | ◐ |
| Bons de commande / sales orders | ○ | ◐ | ◐ Pro+ | ◐ | ● | ● | ● | ○ |

## 3. Conformité MRA et fiscale mauricienne

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Fiscalisation e-invoicing MRA (IRN + QR) | ◐ codé, non certifié | ◐ intégrateur | ◐ intégrateur | ◐ intégrateur | ◐ intégrateur | ◐ intégrateur | ◐ | ● |
| Annulation de facture fiscalisée | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ● |
| Journal d'audit de fiscalisation, rétention 7 ans | ● | ○ | ○ | ○ | ◐ | ◐ | ◐ | ◐ |
| Champs BRN / VAT number / TC01–TC06 | ● | ○ | ○ | ○ | ◐ | ◐ | ● | ● |
| Déclaration TVA au format EBS | ● | ◐ générique | ◐ | ◐ | ◐ | ◐ | ● | ○ |
| Régularisations et rattrapage de TVA | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | ○ |
| TDS : détection, scan, calcul, déclaration | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| CIT — impôt sur les sociétés et APS | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| IT Form 3 (statement of emoluments) | ● | ○ | ○ | ○ | ○ | ○ | ● | ○ |
| ROC / Annual Return, actionnaires, administrateurs | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| SFT (statement of financial transactions) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Calendrier fiscal MRA et échéancier légal | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ◐ |
| Bordereau de déclaration MRA | ● | ○ | ○ | ○ | ○ | ○ | ● | ○ |
| Appariement déclaration ↔ paiement suggéré | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Régime fiscal freelance / indépendant | ● | ◐ | ◐ | ◐ | ○ | ○ | ◐ | ○ |
| Audit des calculs MRA (traçabilité) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

## 4. Banque, rapprochement et trésorerie

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Import de relevés multi-formats | ● | ● | ● | ● | ● | ● | ● | ○ |
| **Feeds bancaires directs multi-banques** | **◐ MCB seul** | ● | ● | ● | ● | ◐ | ◐ | ○ |
| Extraction IA de relevés bancaires | ● | ● | ● | ● | ◐ | ◐ | ○ | ○ |
| Rapprochement déterministe par règles (R1–R7) | ● | ● | ● | ● | ● | ● | ◐ | ○ |
| Rapprochement sémantique par LLM | ● | ◐ | ◐ | ◐ | ○ | ○ | ○ | ○ |
| Rapprochement mensuel + vue d'ensemble | ● | ● | ● | ● | ● | ● | ◐ | ○ |
| Alias et patterns de tiers apprenants | ● | ● | ● | ● | ◐ | ◐ | ○ | ○ |
| KPIs de rapprochement, contrôle de cohérence | ● | ◐ | ◐ | ◐ | ◐ | ○ | ○ | ○ |
| Reclassification en masse / reset | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ○ | ○ |
| Validation IBAN / SWIFT | ● | ◐ | ◐ | ◐ | ● | ● | ● | ○ |
| Virements et génération de fichiers bancaires | ● | ◐ | ◐ | ◐ | ● | ● | ● | ○ |
| Santé des comptes bancaires (alertes d'écart) | ● | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| Trésorerie, prévisionnel, simulation de scénarios | ● | ◐ Advanced | ◐ Premium+ | ● | ● | ● | ◐ | ○ |

## 5. Multi-devises et change

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Comptabilité multi-devises | ● | ● Essentials+ | ● Pro+ | ● Established | ● | ● | ◐ | ◐ |
| Taux de change historiques | ● | ● | ● | ● | ● | ● | ◐ | ○ |
| **Connecteur Bank of Mauritius (taux officiels)** | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| Écarts de change automatiques | ● | ● | ● | ● | ● | ● | ◐ | ○ |
| Devise fonctionnelle IAS 21 | ● | ○ | ○ | ○ | ◐ X3 | ◐ | ○ | ○ |

## 6. Paie mauricienne

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Calcul de paie et bulletins PDF | ● | ○ | ○ | ○ | ◐ module | ◐ | ● | ○ |
| PAYE | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| CSG (Contribution Sociale Généralisée) | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| NSF (National Savings Fund) | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Training levy | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| **PRGF + exit statements + gratuity return** | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Exports MRA : PAYE, CSG, PACO, PRGF (CSV) | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Bonus de fin d'année (bulletins 25 % et 75 %) | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Severance / solde de tout compte (Workers' Rights Act) | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Départ : attestation, certificat, workfare, envoi | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Heures supplémentaires (saisie, aperçu, agrégation) | ● | ○ | ○ | ○ | ◐ | ◐ | ● | ○ |
| Primes : règles, import, affectation | ● | ○ | ○ | ○ | ◐ | ◐ | ● | ○ |
| Provisions congés (calcul + comptabilisation) | ● | ○ | ○ | ○ | ◐ | ○ | ◐ | ○ |
| Provisions bonus fin d'année IAS 19 | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Comptabilisation / décomptabilisation + log d'audit | ● | ○ | ○ | ○ | ◐ | ◐ | ◐ | ○ |
| Import de paie externe | ● | ○ | ○ | ○ | ◐ | ◐ | ● | ○ |
| Historique de paie + reconstruction depuis écritures | ● | ○ | ○ | ○ | ◐ | ○ | ◐ | ○ |
| Fichier de virement bancaire des salaires | ● | ○ | ○ | ○ | ● | ◐ | ● | ○ |
| Registres légaux S116 | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Congé maternité / paternité | ● | ○ | ○ | ○ | ◐ | ◐ | ● | ○ |
| Cash in lieu | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Disturbance allowance | ● | ○ | ○ | ○ | ○ | ○ | ◐ | ○ |
| Taux de paie assistés par IA | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

## 7. RH, temps et présence

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dossiers employés + import de masse | ● | ○ | ◐ Zoho People | ○ | ● | ● | ● | ○ |
| Comptes salariés + réinitialisation d'accès | ● | ○ | ◐ | ○ | ● | ● | ● | ○ |
| Congés : demandes, soldes, entitlements, règles | ● | ○ | ◐ | ○ | ● | ● | ● | ○ |
| Congés collectifs + certificats | ● | ○ | ◐ | ○ | ◐ | ◐ | ● | ○ |
| Types de congés paramétrables | ● | ○ | ◐ | ○ | ● | ● | ● | ○ |
| Planning + règles + presets | ● | ○ | ◐ | ○ | ◐ | ● | ● | ○ |
| Pointage : sessions, récapitulatif mensuel | ● | ○ | ◐ | ○ | ◐ | ● | ● | ○ |
| **Géolocalisation du pointage + insights IA** | ● | ○ | ◐ | ○ | ○ | ◐ | ◐ | ○ |
| Trajets et frais kilométriques + calcul de distance | ● | ◐ | ◐ | ◐ Established | ◐ | ◐ | ◐ | ○ |
| Jours fériés mauriciens intégrés | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |
| Groupes, départements, bureaux, managers | ● | ○ | ◐ | ○ | ● | ● | ● | ○ |
| Contrats de travail + PDF + signature électronique | ● | ○ | ◐ | ○ | ◐ | ● | ◐ | ○ |
| Annonces internes | ● | ○ | ◐ | ○ | ◐ | ● | ◐ | ○ |
| Chat RH | ● | ○ | ◐ | ○ | ○ | ● | ○ | ○ |
| Espace salarié en self-service | ● | ○ | ◐ | ○ | ● | ● | ● | ○ |
| Exports légaux RH | ● | ○ | ○ | ○ | ◐ | ○ | ● | ○ |

## 8. Global Business Companies (GBC)

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **PER 80 % (Partial Exemption Regime) + export PDF** | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Substance / CIGA + export PDF** | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Transfer pricing** | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **UBO / bénéficiaires effectifs + export PDF** | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **CRS / FATCA** | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Pillar Two (GloBE)** | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Consolidation GBC multi-entités | ● | ◐ Advanced | ○ | ◐ add-on | ● | ● | ◐ | ○ |
| Auto-tagging GBC des écritures | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Tiers offshore et consolidation de tiers | ● | ○ | ○ | ○ | ◐ | ◐ | ○ | ○ |
| Audit GBC : disclosures, mémo, statut, export PDF | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

## 9. IFRS complet

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| IFRS 9 — Expected Credit Loss | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| IFRS 10 — consolidation et éliminations | ● | ○ | ○ | ○ | ◐ X3 | ◐ | ○ | ○ |
| IFRS 13 — juste valeur | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| IFRS 15 — reconnaissance du revenu | ● | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| IFRS 16 — contrats de location | ● | ○ | ○ | ○ | ◐ | ◐ | ○ | ○ |
| IAS 7 — tableau des flux de trésorerie | ● | ◐ | ◐ | ◐ | ● | ● | ◐ | ○ |
| IAS 19 — provisions avantages du personnel | ● | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| IAS 21 — devise fonctionnelle | ● | ○ | ○ | ○ | ◐ | ◐ | ○ | ○ |
| IAS 36 — dépréciation d'actifs | ● | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| IAS 38 — immobilisations incorporelles | ● | ○ | ○ | ○ | ◐ | ◐ | ◐ | ○ |

## 10. Audit, contrôle interne et sécurité

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Workpapers d'audit | ● | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| Piste d'audit complète et immuable | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| Contrôles internes documentés + séparation des tâches | ● | ◐ | ◐ | ◐ | ● | ◐ | ◐ | ○ |
| RBAC hiérarchique (niveaux de rôle) | ● | ◐ | ◐ | ◐ | ● | ● | ◐ | ◐ |
| Isolation des données par société et par employé (RLS) | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| Conformité corporate : dirigeants, règles, alertes | ● | ○ | ○ | ○ | ◐ | ◐ | ◐ | ○ |
| Rétention légale 7 ans | ● | ◐ | ◐ | ◐ | ● | ◐ | ● | ◐ |
| Signature HMAC des endpoints externes | ● | ● | ● | ● | ● | ● | ○ | ◐ |

## 11. Cabinet comptable multi-dossiers

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Portefeuille multi-dossiers clients | ● | ● QBOA | ● | ● Xero HQ | ● | ◐ | ● | ○ |
| Affectation des dossiers à l'équipe | ● | ● | ● | ● | ● | ◐ | ◐ | ○ |
| Mode « agir pour le compte d'un client » | ● | ● | ● | ● | ◐ | ◐ | ◐ | ○ |
| Notes et tags internes de cabinet | ● | ● | ● | ● | ◐ | ◐ | ○ | ○ |
| Accès délégués et permissions granulaires | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| Alertes et tableau de bord cabinet | ● | ● | ● | ● | ◐ | ◐ | ◐ | ○ |
| Santé PCM par dossier | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

## 12. Juridique et corporate

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dossiers juridiques | ● | ○ | ○ | ○ | ○ | ◐ | ○ | ○ |
| Contentieux | ● | ○ | ○ | ○ | ○ | ◐ | ○ | ○ |
| Génération de contrats + assistant IA | ● | ○ | ○ | ○ | ○ | ◐ | ○ | ○ |
| Actes, PV, registres en PDF | ● | ○ | ○ | ○ | ○ | ◐ | ◐ | ○ |
| Conseil juridique et conseil RH assistés | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Référentiel juridique mauricien + RAG | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

## 13. IA, agents et automatisation

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| OCR de documents et pièces | ● | ● | ● | ● | ◐ | ◐ | ○ | ◐ |
| Agent comptable conversationnel | ● | ◐ | ◐ Zia | ◐ | ○ | ◐ | ○ | ○ |
| Agent de rapprochement bancaire | ● | ◐ | ◐ | ◐ | ○ | ○ | ○ | ○ |
| Agent d'audit | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Assistant de rédaction | ● | ○ | ◐ | ○ | ○ | ◐ | ○ | ○ |
| Mémoire contextuelle persistante | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Pilotage par Telegram (59 routes, HMAC)** | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Workflows n8n | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ○ | ○ |
| Serveur MCP (accès agentique aux données) | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| Génération automatique de tableaux de bord | ● | ◐ | ◐ | ◐ | ◐ | ◐ | ○ | ○ |

## 14. Plateforme, intégrations et périmètre géographique

| Fonction | Lexora | QBO | Zoho | Xero | Sage | Odoo | Sicorax | EBS |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Interface bilingue français / anglais | ● | ◐ | ◐ | ◐ | ● | ● | ● | ● |
| Boîte mail intégrée (Nylas / Aurinko) | ● | ○ | ◐ | ○ | ○ | ● | ○ | ○ |
| Agenda et calendrier | ● | ◐ | ◐ | ◐ | ◐ | ● | ○ | ○ |
| Prise de rendez-vous | ● | ○ | ◐ | ○ | ○ | ● | ○ | ○ |
| Notifications et alertes métier | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| Stockage et gestion documentaire | ● | ● | ● | ● | ● | ● | ◐ | ◐ |
| API publique documentée | ◐ | ● | ● | ● | ◐ | ● | ○ | ◐ |
| **Marketplace d'applications tierces** | **○** | ● 750+ | ● suite Zoho | ● 1000+ | ● | ● | ○ | ○ |
| **Application mobile native** | **○** | ● | ● | ● | ● | ● | ◐ | ◐ |
| Socle multi-juridiction | ● | ● | ● | ● | ● | ● | ○ | ○ |
| **Module OHADA (Afrique francophone)** | ● | ◐ | ◐ | ◐ | ● | ● | ○ | ○ |
| Support local, fuseau Maurice, en français | ● | ◐ revendeur | ○ | ○ | ● partenaire | ● | ● | ● |

## 15. Absences assumées de Lexora

Ces fonctions n'existent pas dans le produit. Elles ferment des segments
entiers et doivent être dites en rendez-vous, pas découvertes en
démonstration.

| Fonction absente | Conséquence commerciale |
|---|---|
| **Stock / inventaire valorisé** | Import-distribution, négoce et manufacturing hors périmètre |
| **POS / caisse** | Retail, restauration comptoir, commerce de détail hors périmètre |
| **Devis / propositions commerciales** | Toute activité de service qui devise avant de facturer doit sortir de l'outil |
| **Bons de commande fournisseurs** | Cycle achat incomplet pour les structures à procédure d'engagement formalisée |
| **E-commerce et canaux de vente en ligne** | Aucune connexion boutique |
| **Feeds bancaires directs au-delà de MCB** | Import manuel sur SBM, ABSA, MauBank, AfrAsia |
| **Marketplace d'applications tierces** | Aucun effet d'écosystème face à Xero et QuickBooks |
| **Application mobile native** | Usage terrain limité au navigateur — sauf pilotage Telegram |
| **CRM / pipeline commercial** | Le module contacts est un annuaire de tiers, pas un CRM |
| **Gestion de projet et temps facturable** | Cabinets de conseil au forfait horaire mal servis |

---

## 16. Tarifs au plan près

### 16.1 Lexora — grille 2026

Source applicative : `lib/pricing/packages.ts`, synchronisée avec la
migration `467_package_societe_gbc_unique.sql`.

| Package | Palier | Prix mensuel | Transactions/mois | Entités |
|---|---|---:|---:|---:|
| Société | Essentiel | **Rs 2 500** | 50 | 1 |
| Société | Croissance | **Rs 4 900** | 200 | 1 |
| Société | PME | **Rs 9 900** | 500 | 1 |
| Société | Corporate | **Rs 18 900** | 1 500 | 1 |
| Société | Enterprise | sur devis | illimité | 1 |
| GBC | Authorised | **Rs 8 500** | 100 | 1 |
| GBC | Standard | **Rs 15 000** | 500 | 1 |
| GBC | Groupe | **Rs 32 000** | 1 500 | 5 |
| GBC | Management Co | sur devis | illimité | illimité |

**Règles de facturation**

| Élément | Montant |
|---|---:|
| Mise en service, par société (paramétrage + 4 h de formation) | Rs 8 000 |
| Transaction au-delà du plafond | Rs 15, plafonné à l'écart avec le palier supérieur |
| Entité consolidée supplémentaire (packages GBC) | Rs 4 500 / mois |
| Consultation TIBOK (pay-as-you-go) | Rs 500 / acte |
| Engagement annuel | 12 mois d'usage, 10 mois facturés |

**Ce qui est illimité sur tous les paliers** : utilisateurs, salariés,
bulletins de paie, congés, pointages, contrats. Seul le volume de pièces
comptables est compté — une transaction = une écriture, une facture émise
ou reçue, une ligne de relevé importée, ou un document passé à l'OCR.

### 16.2 QuickBooks — prix mauriciens et prix mondiaux

Le prix opposable à Maurice est celui du revendeur local, en roupies.

| Offre | Prix | Utilisateurs |
|---|---:|---:|
| QBO Essentials (Quick Focus, MU) | **Rs 2 999 / mois** | 3 |
| QBO Plus (Quick Focus, MU) | **Rs 4 399 / mois** | 5 |
| QBO Advanced (Quick Focus, MU) | **Rs 9 599 / mois** | 25 |
| QuickBooks Desktop Pro 2020 | Rs 21 900 (achat) | 1, extensible à 5 |
| QuickBooks Desktop Premier 2020 | Rs 23 900 (achat) | 1, extensible à 5 |
| QuickBooks Desktop Accountant 2020 | Rs 24 900 (achat) | 1, extensible à 30 |
| Masterclass de formation | Rs 12 000 — **net Rs 3 000** après refund HRDC 75 % | — |
| QBO Simple Start (tarif public US) | $38 ≈ Rs 1 750 | 1 |
| QBO Essentials (US) | $85 ≈ Rs 3 910 | 3 |
| QBO Plus (US) | $140 ≈ Rs 6 440 | 5 |
| QBO Advanced (US) | $340 ≈ Rs 15 640 | 25 |

Non inclus dans toutes ces lignes : paie mauricienne, fiscalisation MRA,
déclarations TDS/CIT/ROC/SFT, GBC et IFRS.

### 16.3 Zoho Books

| Plan | Mensuel | Annuel (par mois) | Utilisateurs | Plafond factures/an | Points clés |
|---|---:|---:|---:|---:|---|
| Free | $0 | $0 | 1 + 1 comptable | 1 000 | Sous $50k de CA |
| Standard | $20 ≈ Rs 920 | $15 ≈ Rs 690 | 3 | 5 000 | API, bank feeds |
| Professional | $50 ≈ Rs 2 300 | $40 ≈ Rs 1 840 | 5 | 10 000 | **Multi-devises**, inventaire |
| Premium | $70 ≈ Rs 3 220 | $60 ≈ Rs 2 760 | 10 | 25 000 | Immobilisations, budget, cash-flow |
| Elite | $150 ≈ Rs 6 900 | $120 ≈ Rs 5 520 | 10 | 100 000 | Inventaire avancé, entrepôts |
| Ultimate | $275 ≈ Rs 12 650 | $240 ≈ Rs 11 040 | 15 | 100 000 | Analytics avancé |

Point de vigilance : le multi-devises, indispensable à Maurice, n'apparaît
qu'au plan Professional.

### 16.4 Xero

| Plan | Prix mensuel | Factures | Multi-devises | Autres limites |
|---|---:|---|:--:|---|
| Early | $25 ≈ Rs 1 150 | 20 / mois | ○ | 5 factures d'achat, prévision 30 j |
| Growing | $55 ≈ Rs 2 530 | illimitées | ○ | Prévision 60 j |
| Established | $90 ≈ Rs 4 140 | illimitées | ● | Projets, notes de frais, prévision 180 j |

Utilisateurs illimités sur tous les plans. Inventory Plus en option
payante. **Aucune paie mauricienne** — la paie native de Xero ne couvre que
quelques pays anglo-saxons.

### 16.5 Odoo

| Plan | Annuel | Mensuel | Périmètre |
|---|---:|---:|---|
| One App Free | $0 | $0 | Une seule application, utilisateurs illimités |
| Standard | $24,90 / user ≈ Rs 1 145 | $31,10 / user ≈ Rs 1 430 | Toutes les apps, Odoo Online |
| Custom | $49,00 / user ≈ Rs 2 254 | $61,00 / user ≈ Rs 2 806 | + Studio, multi-sociétés, API, on-premise |

**Le prix est par utilisateur.** Pour 20 collaborateurs en plan Standard
annuel : ≈ Rs 22 900 / mois, avant l'intégrateur et avant toute
localisation mauricienne.

### 16.6 Sage

| Offre | Prix | Remarque |
|---|---|---|
| Sage 50cloud Pastel Xpress | dès R 1 095 / mois ≈ **Rs 2 740** | Tarif Sage Afrique du Sud, indicatif |
| Sage 50cloud Pastel Partner | R 1 160 – 1 900 / mois ≈ **Rs 2 900 – 4 750** | Selon nombre d'utilisateurs, tarif SA |
| Sage 200 Evolution | sur devis | Première année en centaines de milliers de Rs à Maurice |
| Sage 300 / X3 | sur devis | Projet d'intégration, plusieurs mois |

Les prix mauriciens ne sont pas publiés : ils passent par un partenaire
(Software Concepts, BIC Solutions, SAV Consulting, Harel Mallac, FNA
Services). La paie mauricienne est un module séparé.

### 16.7 Éditeurs locaux et middleware EBS

| Offre | Prix | Périmètre |
|---|---|---|
| Sicorax (Uniconsults) | sur devis | Payroll, HRMS, Accounting, Fixed Assets — licences distinctes |
| Sicorax Payroll Outsourcing | forfait mensuel par salarié | Prestation, pas licence |
| vat-invoice.mu — Free | **Rs 0** | 3 factures / mois, export PDF |
| vat-invoice.mu — Starter | **Rs 990 / mois** | 50 factures, multi-devises MUR/EUR/USD |
| vat-invoice.mu — Pro | **Rs 2 490 / mois** | Factures et clients illimités, envoi email |
| Codeblix EBS | **≈ Rs 35 000 la 1ʳᵉ année**, setup inclus | Plan Business calibré 51–300 factures/mois, POS et inventaire |
| ebsmauritius.com | sur devis | Deux formules : intégrée à un ERP, ou standalone |

---

## 17. Coût réel comparé : trois profils types

Hypothèses communes : entreprise mauricienne assujettie TVA, franchissant
le seuil e-invoicing, comptabilité tenue en interne.

### Profil A — PME de service, 20 salariés, 200 pièces/mois

| Poste | Stack QuickBooks | Stack Sage / local | Stack Odoo | **Lexora** |
|---|---:|---:|---:|---:|
| Comptabilité | Rs 4 399 (Plus, 5 users) | Rs 2 900 – 4 750 | Rs 22 900 (20 users) | — |
| Paie 20 salariés | Rs 2 000 – 4 000 | Rs 2 000 – 5 000 | Rs 2 000 – 4 000 | — |
| E-invoicing MRA | Rs 1 000 – 2 900 | Rs 1 000 – 2 900 | inclus intégrateur | — |
| Déclarations MRA | Excel + cabinet | Excel + cabinet | Excel + cabinet | — |
| **Total mensuel** | **Rs 7 400 – 11 300** | **Rs 5 900 – 12 650** | **Rs 24 900 – 26 900** | **Rs 4 900** |
| Fournisseurs à gérer | 2 – 3 | 2 – 3 | 1 – 2 | **1** |

Palier Lexora : Société Croissance (200 transactions incluses).

### Profil B — Société de 60 salariés, 450 pièces/mois

| Poste | Stack QuickBooks | Stack Sage / local | **Lexora** |
|---|---:|---:|---:|
| Comptabilité | Rs 9 599 (Advanced) | Rs 4 750 + modules | — |
| Paie 60 salariés | Rs 5 000 – 9 000 | Rs 5 000 – 12 000 | — |
| E-invoicing MRA | Rs 2 000 – 2 900 | Rs 2 000 – 2 900 | — |
| **Total mensuel** | **Rs 16 600 – 21 500** | **Rs 11 750 – 19 650** | **Rs 9 900** |

Palier Lexora : Société PME. L'écart se creuse avec l'effectif, parce que
la paie n'entre pas dans l'assiette de facturation.

### Profil C — GBC administrée par une management company

Il n'existe aucune offre logicielle concurrente sur ce profil. Le point de
comparaison est le coût des travaux aujourd'hui réalisés sous Excel :
calcul PER, dossier de substance, documentation transfer pricing, registre
UBO, reporting CRS/FATCA, test Pillar Two, consolidation IFRS 10.

| | Aujourd'hui | **Lexora GBC Standard** |
|---|---|---:|
| Support | Excel + honoraires de management company | Produit |
| Coût | Plusieurs dizaines de milliers de Rs par exercice et par entité | **Rs 15 000 / mois**, 500 transactions |
| Entité supplémentaire | Refacturation intégrale | Rs 4 500 / mois |
| Traçabilité | Classeurs, versions, courriels | Piste d'audit, exports PDF horodatés |

---

## 18. Lecture des tableaux

**Trois lignes où Lexora est seul du panel** : le bloc GBC en entier
(PER, substance, transfer pricing, UBO, CRS/FATCA, Pillar Two), le bloc
IFRS complet, et la paie mauricienne combinée à la comptabilité dans un
même produit. C'est là qu'il faut argumenter — et nulle part ailleurs.

**Trois lignes où Lexora perd sans discussion** : devis, stock/POS,
marketplace d'apps et application mobile. Ce sont des segments à céder, pas
des lacunes à combler dans l'urgence.

**Une ligne à corriger vite** : les feeds bancaires. C'est le seul écart
qui touche un client Lexora tous les jours, sur un terrain où la
concurrence est visiblement meilleure.

---

## Sources tarifaires

- [Quick Focus Ltd — tarifs QuickBooks Mauritius](https://www.quickfocus.mu/pricing/)
- [QuickBooks Online — tarifs publics](https://quickbooks.intuit.com/pricing/)
- [Zoho Books — tarifs](https://www.zoho.com/books/pricing/)
- [Xero — tarifs](https://www.xero.com/us/pricing-plans/)
- [Odoo — tarifs](https://www.odoo.com/pricing)
- [Sage Afrique — 50cloud Pastel Xpress](https://www.sage.com/africa/products/sage-50cloud-pastel-xpress/)
- [Software Concepts Ltd — Sage 200 Evolution Maurice](https://sft.co.mu/our-solutions/sage-200-evolution)
- [vat-invoice.mu — tarifs](https://vat-invoice.mu/en/blog/vat-invoice-software-mauritius)
- [Codeblix EBS](https://codeblix.com/)
- [EBS Mauritius — tarifs et intégrations](https://www.ebsmauritius.com/pricing/)
- [Sicorax / Uniconsults — produits](https://www.sicorax.mu/en/products.html)
- [MRA — liste des fournisseurs EBS au 15 juillet 2026](https://www.mra.mu/download/eInvoicing/EBSSolutionProviders.pdf)
