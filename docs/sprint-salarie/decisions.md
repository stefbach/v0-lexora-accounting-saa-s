# Décisions produit pendant le sprint salarié

Chaque entrée : **Contexte / Options / Choix / Raison**.
L'humain validera ou ajustera lundi.

---

## D01 — Emplacement du GET Documents côté salarié

**Contexte**
V1.5 demande la lecture des documents RH (contrats signés, PDF paie,
attestations, certificats) côté salarié. L'endpoint doit éviter
`/api/rh/*` qui est réservé à l'agent RH ce weekend.

**Options**
1. `GET /api/salarie/documents` — nouveau namespace, zéro conflit avec RH.
2. Étendre un endpoint RH existant — hors périmètre ce weekend.

**Choix** — Option 1 : `app/api/salarie/documents/route.ts`.

**Raison**
- Respecte la règle « je ne touche pas à /api/rh ».
- Crée une base pour un futur namespace `/api/salarie/*` propre aux
  écritures self-service.
- Côté code : lit `documents_juridiques` (table existante) filtrée sur
  l'employé courant via `isSelf`.

---

## D02 — Structure du dossier des tabs extraits

**Contexte**
V0.1 demande de découper `app/salarie/page.tsx` (2145 lignes) en
sous-composants.

**Options**
1. `app/salarie/_components/tabs/XxxTab.tsx` — Next-friendly (préfixe
   `_` exclu du routing).
2. `components/salarie/tabs/XxxTab.tsx` — en dehors de `app/`.

**Choix** — Option 1.

**Raison**
- Convention Next.js 14 App Router : les dossiers préfixés par `_`
  sont privés au routing, parfait pour des sous-composants d'une
  route.
- Garde le voisinage code/route clair.

---

## D03 — Props des tabs extraits

**Contexte**
Les 5 onglets inline (dashboard, bulletins, planning, primes, sante)
consomment massivement le state du parent. Comment les extraire sans
casser la logique ?

**Choix**
- `DashboardTab({ employe, pointageToday, bulletins, primes, conges, annonces, planning, now, feedback, punching, doPunch, router })`
- `BulletinsTab({ bulletins, employe, onRefresh })`
- `PlanningTab({ planning })`
- `PrimesTab({ bulletins, primes })`
- `SanteTab({ employe })`
- Les 5 autres (`MaFicheTab`, `CongesTab`, `TrajetsTab`, `ContratsTab`,
  `DocumentsTab`) gardent leur signature actuelle.

**Raison**
- Iso-fonctionnel : pas de hook ni context introduits.
- Refactor minimal : on déplace, on ne réécrit pas.
- Plus tard (hors sprint) : possibilité d'introduire un
  `SalarieContext` pour éliminer le prop drilling.

---

## D04 — Écriture de nouveaux endpoints sous `/api/salarie`

**Contexte** : D01 a introduit `app/api/salarie/documents/route.ts`.

**Règle pour la suite** : tout endpoint *lecture-seule self-service*
nécessaire au front salarié peut vivre sous `/api/salarie/*` tant que
l'agent RH monopolise `/api/rh/*`. Les écritures restent côté
`/api/rh/*` (à livrer par l'agent RH).

---
