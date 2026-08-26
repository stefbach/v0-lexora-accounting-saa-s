# Reclassements PCM proposés — décision comptable

**Date :** 2026-08-26
**Contexte :** audit du plan comptable mauricien (chantier 2 — nettoyage
données). La migration `499_pcm_comptes_manquants_orphelins_data_quality.sql`
a **défini les comptes manquants** référencés par des écritures orphelines
(100 % additif, aucune écriture modifiée). Le présent document liste les
points qui relèvent d'une **décision comptable** et ne doivent PAS être
appliqués automatiquement sur les écritures en production.

> ⚠️ Aucun `UPDATE` / `DELETE` sur `ecritures_comptables_v2` n'a été exécuté.
> Ces propositions sont à valider par le comptable puis à passer, le cas
> échéant, via une écriture de reclassement datée (journal OD) — jamais par
> réécriture directe de l'historique.

---

## 1. Compte 656 → 666 (écart de change réalisé — perte)

**Constat.** Une écriture (société Digital Data Solutions Ltd,
`FT25288LM0RV`, 4 407,44 MUR, journal BNQ) est imputée au compte **656**,
absent du plan. Le libellé est explicite : « Écart de change réalisé
(perte) ».

**Analyse.** À Maurice comme en PCG, une perte de change réalisée relève de
la classe 66 (charges financières). Le plan comptable dispose déjà du compte
**666 « Pertes de change »**. Le code 656 (classe 65 — autres charges de
gestion courante) est une **mauvaise imputation**, pas un compte légitime
manquant : on ne l'a donc **pas** créé (créer 656 institutionnaliserait un
doublon de 666).

**Proposition.** Reclasser l'écriture de 656 vers **666** :

```
-- À VALIDER PAR LE COMPTABLE avant exécution
-- Écriture de reclassement (journal OD) OU correction directe si l'exercice
-- n'est pas verrouillé :
UPDATE ecritures_comptables_v2
   SET numero_compte = '666'
 WHERE societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'
   AND numero_compte = '656';
```

Montant : 1 ligne, 4 407,44 MUR au débit. Impact P&L nul (reste une charge
financière), améliore seulement la présentation (regroupée avec les autres
pertes de change en 666).

---

## 2. Compte 1101 — contrepartie À-Nouveaux (à vérifier)

**Constat.** 2 écritures (journal AN, « opening balance contrepartie -
mig 322 »), net **créditeur 80 558,49 MUR**, imputées au compte **1101**.

**Traitement retenu.** 1101 a été défini comme **Report à nouveau — solde
d'ouverture (contrepartie À-Nouveaux)** (classe 1, capitaux propres,
résultats non distribués). C'est le bon foyer IFRS pour un solde net
créditeur d'À-Nouveaux, et cela résout l'orphelin sans toucher les écritures.

**À vérifier par le comptable.** Confirmer que ces 80 558,49 MUR relèvent
bien du **report à nouveau** et non d'un apport en **capital** (compte 1010)
ou d'une autre rubrique de capitaux propres. Si une partie relève du capital,
passer une écriture de reclassement 1101 → 1010 pour le montant concerné.

---

## 3. Comptes courants associés / dirigeant — consolidation (4551 / 4671 / 455)

**Constat.** Le compte courant du dirigeant (Stéphane Bach) apparaît sous
**deux** codes distincts :

| Compte | Libellé écritures | Nb | Sens | Montant |
|--------|-------------------|----|------|---------|
| `4551` | « CCA Stéphane Bach — Google Cloud » | 10 | Crédit | 179 942,41 |
| `4671` | « cca — IB / Inward Transfer MR STEPHANE » | 6 | Mixte | net créditeur |

Le `4671` est logé sous **467 « Autres débiteurs/créditeurs »** alors qu'il
s'agit économiquement d'un **compte courant associé** (classe 455).

**Traitement retenu.** Les deux comptes ont été définis et marqués
`related_party = true` (traçabilité IAS 24). Le libellé de 4671 signale
« à reclasser en 455 ».

**Proposition (décision comptable).** Consolider le CCA du dirigeant sous un
seul compte de la famille **455** (p. ex. `4551`), pour une présentation
IAS 24 « parties liées » cohérente. Reclassement `4671 → 4551` à valider,
puis à passer par écriture datée si les exercices concernés ne sont pas
verrouillés.

---

## 4. Comptes définis sans réserve (aucune action comptable requise)

Résolus par la simple création du compte de référence — écritures inchangées,
rollups IFRS et export valorisé désormais corrects :

| Compte | Libellé | Nature |
|--------|---------|--------|
| `18 / 181 / 1811` | Comptes de liaison / créances interco | Partie liée (actif) |
| `451` | Comptes courants groupe (trésorerie interco) | Partie liée |
| `4091` | Fournisseurs divers — avances versées | Actif courant |
| `5811` | Virements internes — transit bancaire | Trésorerie (transit) |

---

## 5. Correctif de libellé appliqué (migration 499)

- **6454** « Training Levy HRDC (1%) » → **« Training Levy HRDC (1,5%) »**
  pour refléter le taux réellement appliqué par le moteur de paie
  (`PARAMS_MRA_DEFAUT.training_levy = 0.015`, en vigueur depuis 2021-07-01).
  Correction de libellé uniquement — aucun calcul de paie modifié.
