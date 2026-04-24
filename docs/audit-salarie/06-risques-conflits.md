# 06 — Risques & zones de conflit

> Snapshot 2026-04-17. L'autre agent travaille sur la branche prévue
> `fix/sprint14-rh-conformite` (non publiée sur le remote à ce jour).
> Ce document liste (a) les risques de régression observés lors de
> l'audit /salarie et (b) les fichiers / domaines où les deux agents
> peuvent se croiser.

## 1. Registre des risques identifiés dans /salarie

| # | Zone | Description | Sévérité | Origine |
|---|---|---|---|---|
| R01 | `lib/rh/access.ts` | Fallback « rôle ∈ RH/client + 0 société trouvée → toutes les sociétés » (L.100-106). Un compte mal provisionné peut lire toute la base. | **P0** | 03 §5 |
| R02 | `/api/rh/paie/pdf` | `employe_id`, `bulletin_id` forgeables — vérification `isSelf` + propriété du bulletin à confirmer. | **P0** | 04a §3 |
| R03 | `/api/rh/pointage` (POST) | `heure_forcee` envoyée par le client ; le serveur doit l'ignorer/l'écraser, sinon anti-datage. | **P1** | 04a §1 |
| R04 | `/api/rh/planning` (GET) | Le client sur-filtre `employe_id` — à confirmer que le serveur filtre aussi. | **P1** | 04a §4 |
| R05 | `/api/rh/conges` (POST `creer`) | Certificat médical SL > 3j **jamais transmis** au serveur (stockage local oublié). | **P1** (non-conformité WRA potentielle) | 04b §6 |
| R06 | `/api/rh/trajets-km` | `employe_id`, `societe_id` + coordonnées GPS fournies par le client ; pas d'anti-fraude GPS. | **P1** | 04b §8 |
| R07 | `app/salarie/page.tsx` (ContratsTab) | `dangerouslySetInnerHTML` sur `html_content[_modified]` — XSS persistant si non sanitisé côté `/rh`. | **P0** | 04c §10 |
| R08 | Signature contrat | Pas de hash/snapshot du contenu au moment du `signer_self` → valeur probatoire ETA 2000 Maurice fragile. | **P0** | 04c §10 |
| R09 | `/api/rh/contrats/[id]/pdf` | `isSelf` à confirmer sur cet endpoint (non lu dans l'audit). | **P1** | 04c §10 |
| R10 | `/salarie` onglet Documents | Feature placeholder, aucune API — à cacher ou router ailleurs. | P3 | 04b §7 |
| R11 | `/salarie` Dashboard | Soldes AL=22/SL=15 codés en dur ; jours fériés 2026 en dur. | P2 | 04a §1 |
| R12 | `/salarie` Planning | Fusion planning/congés purement client — à terme à déporter serveur. | P2 | 04a §4 |
| R13 | `/salarie` Santé (TIBOK) | 11 sous-onglets /12 sont des placeholders ; les 6 derniers inaccessibles en mobile. | P3 | 04c §9 |

Les items P0/P1 d'impact **RH** (R01, R02, R03, R04, R05, R07, R08, R09)
sont consolidés dans `08-prerequis-p0-rh.md` — à corriger côté
`/api/rh/*` avant que le sprint /salarie ne soit considéré "livrable
en prod".

## 2. Zones de coordination avec l'agent /rh

### 2.1 — Cartographie des fichiers partagés

Fichiers touchés par les deux sprints prévus (à surveiller pour conflits de merge) :

| Fichier | Sprint /salarie | Sprint /rh (fix/sprint14-rh-conformite) | Risque |
|---|---|---|---|
| `app/salarie/page.tsx` | **Refactor majeur** (V0.1 → découpage) | Rarement touché (cf. commit main `47da50b` a touché 1 ligne) | Moyen — le refactor touche ~2100 lignes, tout hotfix RH ciblé sera un conflit minime |
| `components/layout/SalarieSidebar.tsx` | Retouche mineure (labels, ordre) | Non concerné | Faible |
| `lib/rh/access.ts` | Lecture seule (consomme `getUserSocieteIds`) | **Cible directe P0** (fix fallback ligne 100-106) | **Élevé** — toute modif casse le routing salarié, validation par tests conjoints |
| `app/api/rh/employes/me/route.ts` | Lecture + tests | Probable — autour de `EMPLOYEE_EDITABLE_FIELDS`, auto-linking email | **Élevé** — double source de vérité sur les champs whitelistés |
| `app/api/rh/conges/route.ts` | Lecture + tests d'intégration salarié | Déjà modifié (commits `85419e0`, `a6c263e`, `2a6cf5a`, `47da50b` sur main) | Moyen — convergence sur les actions `creer`/`annuler` + `isSelf` |
| `app/api/rh/contrats/[id]/signer/route.ts` | Lecture + tests (signer_self) | Possible — ajout de hash snapshot pour R08 | **Élevé** — bonnes pratiques inverses : l'agent /rh ajoute, /salarie consomme |
| `app/api/rh/paie/route.ts` et `paie/pdf/route.ts` | Lecture + tests (`action=list`, `mark_read`, PDF) | Probable — `isSelf` pour R02 | **Élevé** — tous les chemins de bulletins sont partagés |
| `app/api/rh/pointage/route.ts` | Tests (anti-datage R03) | Probable — durcissement `heure_forcee` | Moyen |
| `app/api/rh/planning/route.ts` | Tests (filtre `employe_id`, R04) | Probable — filtre côté serveur | Moyen |
| `app/api/rh/trajets-km/route.ts` | Tests (GPS, propriétaire, R06) | Probable — anti-fraude GPS | Moyen |
| `middleware.ts` | Lecture seule | Probable — ajustement rôles si R01 modifie la matrice | Faible à Moyen |
| `app/rh/contrats/page.tsx` (éditeur HTML) | Non concerné | **Cible directe P0** (sanitisation DOMPurify pour R07) | Faible (pas de overlap physique) — mais dépendance logique **critique** |

### 2.2 — Contrats partagés (API)

Pour éviter toute divergence, les deux agents doivent s'accorder sur :

1. **Format des réponses** (`{ conges: [...] }`, `{ bulletins: [...] }`,
   etc.) — ne pas renommer les clés de premier niveau.
2. **Valeurs des énums** : statuts (`approuve`/`refuse`/`en_attente`,
   `brouillon`/`signe_employe`/`signe`/`expire`/`resilie`), types
   (`AL`/`SL`/`MAT`/`PAT`/`SANS_SOLDE`), actions (`creer`/`annuler`,
   `demarrer`/`checkpoint`/`terminer`, `list`/`mark_read`,
   `signer_self`).
3. **Pattern `isSelf`** : implémentation cohérente via un helper partagé
   (ex. ajouter `userHasAccessToEmploye` et un nouveau
   `isCurrentEmployee(userId, employeId)` dans `lib/rh/access.ts`).
4. **Whitelist** `EMPLOYEE_EDITABLE_FIELDS` (`employes/me/route.ts`) :
   toute extension doit être propagée côté UI `MaFicheTab` (sinon
   les nouveaux champs seront refusés silencieusement).

### 2.3 — Découpage de responsabilité proposé

Pour éviter les doubles passages sur les mêmes lignes :

| Domaine | Qui a la main |
|---|---|
| Corrections P0/P1 des **APIs** `/api/rh/*` | Agent /rh (sprint `fix/sprint14-rh-conformite`) |
| Hash snapshot contrat + sanitisation HTML | Agent /rh |
| Refactor **UI** `/salarie` (Vague 0 → Vague 3) | Agent /salarie |
| Upload certificat SL (front + multipart) | Agent /salarie pour le front ; agent /rh pour le stockage serveur |
| Tests d'intégration end-to-end `/salarie` | Agent /salarie (exécute), agent /rh (fournit les fixtures) |

### 2.4 — Points de synchronisation

- **Point 1 — avant démarrage** : l'agent /rh publie la liste finale
  des endpoints durcis + le contrat d'API (schéma de réponse par route
  consommée dans `05-dependances-rh.md`). L'agent /salarie calque ses
  fixtures dessus.
- **Point 2 — mi-sprint** : revue croisée des PRs, surtout sur
  `lib/rh/access.ts` et `employes/me/route.ts`.
- **Point 3 — avant release** : tests de régression manuels sur les 5
  endpoints d'écriture salarié (§05 règle de séparation). Chacun valide
  qu'une action depuis son côté ne casse pas l'autre.

## 3. Risques de merge liés au refactor V0.1

Le refactor `app/salarie/page.tsx` (2145 lignes → N sous-fichiers)
touchera presque chaque ligne du fichier. Règles pour limiter la
casse :

1. Faire le refactor **avant** tout hotfix RH qui toucherait
   `app/salarie/page.tsx` ; l'agent /rh évite de lancer un fix sur ce
   fichier pendant la V0.1.
2. Un commit par onglet extrait → rollback ciblé possible.
3. Tests manuels après chaque extraction (les onglets doivent rester
   iso-fonctionnels).
4. Ne pas renommer les fonctions ni les props : c'est un déplacement,
   pas un refactor fonctionnel. On garde `MaFicheTab`, `CongesTab`,
   `TrajetsTab`, `ContratsTab`, `DocumentsTab`.
5. Les 5 onglets actuellement inline (dashboard, bulletins, planning,
   primes, sante) deviennent `DashboardTab.tsx`, `BulletinsTab.tsx`,
   etc. — avec le même pattern de `{ employe, onRefresh }` en props.

## 4. Risques hors-sprint (non abordés)

- **TIBOK** : si la plateforme TIBOK expose une API qu'on pourrait
  consommer, 11 sous-onglets pourraient devenir fonctionnels. **Hors
  périmètre** de ce sprint — reste un lien externe.
- **App mobile native** : pas dans la trajectoire ; le responsive
  mobile actuel est suffisant pour le MVP.
- **Documents RH** (`/api/rh/documents`) : route inexistante. Si un
  sprint dédié la crée, l'onglet Documents côté salarié pourra être
  activé en moins d'½ journée.

## 5. Checklist anti-régression pour le sprint /salarie

Pour chaque PR du sprint /salarie :

- [ ] Aucune modif de `app/api/rh/*` (réservé à l'agent /rh).
- [ ] Aucune migration SQL (`supabase/migrations/*`).
- [ ] Aucune modif de `lib/rh/access.ts`.
- [ ] Tests manuels des 5 écritures self-service + lecture du dashboard.
- [ ] Build Next.js passe (`npm run build` exit 0).
- [ ] Pas de `<Link>` introduit dans une sidebar (hotfix navigation
      hotfix commit `ae2fa1a`) — utiliser `router.push` + `<a>`.

---

Voir `07-plan-sprint.md` pour le plan détaillé et
`08-prerequis-p0-rh.md` pour la liste formelle des 4 prérequis P0.
