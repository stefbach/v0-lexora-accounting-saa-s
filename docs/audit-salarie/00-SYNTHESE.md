# 00 — Synthèse audit Espace Salarié

> Audit au 2026-04-17 · lecture seule · branche
> `claude/fix-lexora-audit-timeout-Uq4qB`.
> Un hotfix `hotfix/salarie-navigation` (merge `ae2fa1a`) a été
> déployé en main pendant l'audit pour débloquer la navigation.

## Ce qu'est l'Espace Salarié aujourd'hui

- **Périmètre** : 10 onglets accessibles sur `/salarie` via sidebar
  + barre top + bottom tab bar mobile.
- **Architecture** : **1 seul fichier `app/salarie/page.tsx`**
  (2145 lignes) + `layout.tsx` (garde de rôle) + `SalarieSidebar.tsx`.
  Aucune sous-page n'a jamais existé dans git.
- **APIs** : exclusivement `/api/rh/*` (22 routes existantes). Aucun
  endpoint `/api/salarie/*` dédié.
- **Auth** : Supabase SSR, rôles `employe`/`salarie` + RH/admin en
  « view as », fallback `profiles.employe_id` si rôle vide.
- **Écritures self-service** : 5 endpoints whitelistés
  (pointage, congés créer/annuler, trajets km, fiche, signer contrat).

## Ce qui marche

- Navigation (depuis le hotfix `ae2fa1a`).
- Onglets **Ma fiche**, **Congés** (création + annulation + soldes),
  **Contrats** (lecture + `signer_self`).
- Onglets **Trajets km** (démarrer/checkpoint/terminer via GPS),
  **Bulletins** (liste + PDF + mark_read), **Dashboard** (pointage +
  KPI + annonces + quick actions), **Planning** (mois courant avec
  fusion congés côté client), **Primes** (dérivé bulletins).

## Ce qui ne marche pas ou est incomplet

- **Documents** : placeholder « Fonctionnalité à venir ».
- **Santé (TIBOK)** : 11 sous-onglets sur 12 sont des placeholders ;
  les 6 derniers inaccessibles en mobile.
- **Congés SL > 3j** : le certificat médical est demandé dans l'UI
  mais **jamais envoyé au serveur** — risque P1 de non-conformité WRA.
- **Barre d'onglets top desktop** : déborde à droite (« Mes contrats »
  coupé).
- **Photo de profil** : non éditable.
- **Jours fériés 2026 et soldes AL=22/SL=15** : codés en dur.

## Les 4 failles P0 bloquantes (périmètre /rh)

Consolidées dans `08-prerequis-p0-rh.md` — à livrer par l'agent
`fix/sprint14-rh-conformite` :

| # | Faille | Impact |
|---|---|---|
| P0-01 | Fallback « toutes les sociétés » dans `lib/rh/access.ts` | Fuite multi-tenant |
| P0-02 | `/api/rh/paie/pdf` sans check propriétaire | Fuite bulletins |
| P0-03 | XSS persistant `dangerouslySetInnerHTML` sur contrats | Exfiltration session |
| P0-04 | Signature contrat sans hash/snapshot | Valeur probatoire ETA 2000 fragile |

## Le plan de sprint en un regard

Détaillé dans `07-plan-sprint.md` :

- **Vague 0** (≈ 1 j) : V0.1 refactor `page.tsx` → `_components/tabs/*` ;
  V0.2 fix overflow barre top.
- **Vague 1** (≈ 2-3 j) : quick wins — toasts, photo profil, contacts
  d'urgence, nettoyage dette hotfix, décision onglet Documents.
- **Vague 2** (≈ 1-2 sem) : certificat SL upload, pagination bulletins,
  sélecteur de mois planning, fusion planning serveur, refresh partiel
  congés, activation Documents si API livrée.
- **Vague 3** (≈ 3-5 j) : primes année en cours, motif rejet trajets,
  TIBOK simplifié, badge contrat à signer.

**Estimation globale** : 2-3 semaines développeur, conditionné aux
livraisons P0 côté /rh.

## Organisation du dossier `docs/audit-salarie/`

```
00-SYNTHESE.md                      ← vous êtes ici
01-cartographie-code.md             points d'entrée, structure, NAV
02-apis-inventory.md                inventaire des APIs consommées
03-auth-model.md                    auth + rôles + isSelf + multi-société
04a-onglets-part1.md                Dashboard, Profil, Bulletins, Planning
04b-onglets-part2.md                Primes, Congés, Documents, Trajets
04c-onglets-part3.md                Santé (TIBOK), Contrats
05-dependances-rh.md                matrice /salarie ↔ /rh
06-risques-conflits.md              registre R01-R13 + coordination
07-plan-sprint.md                   plan 4 vagues avec effort/acceptation
08-prerequis-p0-rh.md               4 failles P0 détaillées pour /rh
09-historique-et-bugs-navigation.md enquête git + bug navigation + hotfix
```

## Liens rapides

- **Démarrer le sprint** : ouvrir `07-plan-sprint.md` → V0.1.
- **Briefer l'agent /rh** : lui transmettre `08-prerequis-p0-rh.md` +
  `06-risques-conflits.md §2` (coordination).
- **Comprendre un onglet spécifique** : `04a`/`04b`/`04c`.
- **Expliquer pourquoi le hotfix navigation a 4 commits** : `09`.
