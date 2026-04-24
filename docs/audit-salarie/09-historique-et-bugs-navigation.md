# 09 — Historique git & bug de navigation

> Enquête menée pendant l'audit, après signalement en prod d'un bug de
> navigation sidebar (URL se met à jour, contenu ne change pas).
> Le fix est aujourd'hui déployé en main (merge commit `ae2fa1a`,
> branche source `hotfix/salarie-navigation`).

## 1. Historique git — A-t-il existé des sous-pages `/salarie/*` ?

### 1.1 — Commits ayant touché `app/salarie/`

```
$ git log --all --oneline -- "app/salarie/"
85309bd feat(rh/juridique): édition + signature contrat (éditeur + dirigeant + employé)
67ab315 feat(employee+manager): premium redesign of salarié & manager interfaces
fef2cb4 fix(rapprochement): actions manquantes sur factures + a verifier + ecritures
```

**Seuls 3 commits** ont jamais touché ce dossier dans toute l'histoire
du repo (181 commits totaux scannés).

### 1.2 — Chronologie

| Commit | Date | Impact sur `/salarie` |
|---|---|---|
| `fef2cb4` | 2026-04-14 | **Création** de `layout.tsx` (64 l.) + `page.tsx` (2032 l.). Message « fix(rapprochement) » — commit fourre-tout. **Monolithique dès la naissance.** |
| `67ab315` | 2026-04-15 | Redesign premium sidebar (+117 l.) + 5 l. cosmétiques sur `page.tsx`. |
| `85309bd` | récent | Ajout onglet Contrats dans `page.tsx` (+200 l.) → taille finale 2145 l. |

### 1.3 — Suppressions de sous-pages ?

```
$ git log --all --oneline --diff-filter=D -- "app/salarie/**"
(aucun résultat)
```

**Aucune suppression jamais enregistrée.** Recherche élargie
(`app/employe`, `app/mon-espace`, `app/espace-salarie`, tout pattern
contenant `salari` ou `employe`) :

```
$ git log --all --full-history --oneline --name-only \
  | grep -E "^app/.*salari|^app/.*employe" | sort -u
app/api/admin/create-user-employee/route.ts
app/api/rh/employes/[id]/route.ts
app/api/rh/employes/import/route.ts
app/api/rh/employes/me/route.ts
app/api/rh/employes/route.ts
app/client/employes/page.tsx
app/rh/employes/[id]/page.tsx
app/rh/employes/page.tsx
app/salarie/layout.tsx
app/salarie/page.tsx
```

**Conclusion** : `app/salarie/` n'a jamais contenu autre chose que
`layout.tsx` + `page.tsx`. Aucune sous-page n'a jamais été poussée
sur ce repo git. Si une version antérieure (`/salarie/primes/page.tsx`,
etc.) a existé, c'était dans un autre repo ou une branche locale
jamais poussée.

## 2. Bug de navigation — diagnostic

### 2.1 — Symptômes observés en prod

- Clic sur un item sidebar (ex. « Mes primes »).
- URL bascule bien à `/salarie#primes`.
- Item « Mes primes » passe en surlignage or.
- **Mais** le contenu affiché reste l'onglet précédent.
- Observation ultérieure : l'URL pouvait devenir
  `/salarie#primes#dashboard` (double hash).

### 2.2 — 3 causes racines identifiées (empilées)

**Cause A — `hashchange` non émis par `<Link>` Next**
`components/layout/SalarieSidebar.tsx` utilisait `<Link href="/salarie#primes">`.
Next.js 14 App Router change l'URL via son router interne, qui
**n'émet pas** d'événement natif `hashchange` sur `window`. Le
`useEffect` de `page.tsx` (qui écoutait uniquement `hashchange`) ne
re-tirait donc jamais après le premier montage.

**Cause B — `usePathname`/`useSearchParams` stables sur hash-only nav**
Ajout de dépendances `[pathname, searchParams]` → insuffisant, car Next
14 ne met pas toujours à jour ces contextes lors d'une navigation qui
ne change que le hash.

**Cause C — race condition entre deux useEffect opposés**
Un second `useEffect` (tab → URL) écrivait `/salarie#${tab}` dès que
`tab` changeait. Au montage, `tab = "dashboard"` → écrit `#dashboard`.
Clic sidebar → URL bascule à `#primes` → mais `tab` est toujours
`"dashboard"` → le 2e effet réécrit `#dashboard` → **double hash**
visible et contenu figé sur le dashboard.

### 2.3 — Fichiers fautifs (avant hotfix)

| Fichier | Lignes | Problème |
|---|---|---|
| `components/layout/SalarieSidebar.tsx` | 139-179 | `<Link>` Next asynchrone, sans `router.push` synchrone. |
| `app/salarie/page.tsx` | 1067-1089 (pré-hotfix) | useEffect `hashchange` seul + useEffect `tab → URL` qui luttaient. |
| `app/salarie/page.tsx` | ~1276, 1456-1459, 2084, 2127 | Quick Actions / tab bars utilisaient `setTab()` au lieu de pousser l'URL. |

## 3. Fix appliqué — `hotfix/salarie-navigation` (→ main `ae2fa1a`)

### 3.1 — Série de 4 commits

1. `424f891` — `fix(salarie): sync tab state with URL on sidebar navigation`
   Ajout `usePathname` + `useSearchParams` en deps du useEffect hash.
2. `15d7fc8` — `fix(salarie): add click listener fallback for sidebar nav`
   Écoute `document.click` sur `a[href^="/salarie#"]` + `requestAnimationFrame(applyHash)`.
3. `bcedb92` — `fix(salarie): remove bidirectional tab↔URL effect causing navigation race condition`
   Suppression du 2e useEffect ; remplacement des 7 `setTab(...)` internes par `router.push("/salarie#...")`.
4. `438f38a` — `fix(salarie): replace Link with router.push in sidebar to sync tab state`
   `<Link>` → `<a>` + `onClick` synchrone avec `router.push`, `preventDefault` sauf modifieurs
   (Ctrl/⌘/Maj/clic milieu conservent le comportement natif).

### 3.2 — Commit de merge

```
commit ae2fa1a052a036c2fc10659d317a67ef24d356a9
Merge: 47da50b 438f38a
merge: hotfix/salarie-navigation - fix broken sidebar navigation
```

Merge `--no-ff` → commit de merge explicite, rollback possible si
régression future.

### 3.3 — Diff net du hotfix

```
 app/salarie/page.tsx                 | 36 ++++++------------
 components/layout/SalarieSidebar.tsx | 12 ++++++----
 2 files changed, ~44 insertions(+), ~28 deletions(-)
```

**Aucune autre zone touchée** : pas de modification d'`app/api/*`, pas
de migration SQL, pas de changement du middleware, pas d'évolution des
rôles ni des contrats d'API.

### 3.4 — État actuel de la navigation

- Barre d'onglets top : `router.push(\`/salarie#\${t.id}\`)` → fonctionne.
- Sidebar desktop : `<a>` + `onClick` qui fait `router.push` → fonctionne.
- Menu More mobile : `router.push` → fonctionne.
- Bottom tab bar mobile : `router.push` → fonctionne.
- Boutons « Quick Actions » du dashboard : `router.push` → fonctionnent.
- Ctrl+clic / clic milieu / Maj+clic : ouvrent un nouvel onglet
  (comportement natif préservé grâce au garde sur les modifieurs).
- Pas de régression connue.

## 4. Dette résiduelle liée à ce bug

- **Listener `document.click` dans `page.tsx`** : introduit au commit
  `15d7fc8` pour rattraper les `<Link>` asynchrones. Après le commit
  `438f38a`, il n'y a plus de `<Link>` sidebar → ce listener est
  devenu **inutile**. Le nettoyer est **quick win** pour la Vague 1
  du sprint (≈5 minutes).
- **`usePathname` / `useSearchParams`** dans les deps : gardés en
  défense en profondeur. Pas de dette, pas d'impact perf notable.
- **Sidebar `<a>` vs Next `<Link>`** : la sidebar a perdu le préfetch
  Next au passage. Coût négligeable pour la navigation intra-
  `/salarie` (toutes les routes sont des hash sur la même page, pas
  de vrai navigate). Pas de dette fonctionnelle.

## 5. Leçons retenues

1. **`<Link>` Next + hash-only ≠ hashchange** : toujours combiner avec
   `router.push` synchrone si un state doit suivre.
2. **Ne pas créer d'effets bidirectionnels** (A→B et B→A) sur la même
   source de vérité. Décider qui pilote (ici : l'URL).
3. **Un composant monolithique de 2145 lignes** rend ce genre de bug
   difficile à diagnostiquer. Le refactor V0.1 du sprint va réduire
   drastiquement la surface d'erreur.
4. **Le déploiement preview Vercel** sur chaque push a permis trois
   itérations rapides (2 tentatives erronées avant la racine). Garder
   ce cycle court pour les hotfix.

---

Voir `07-plan-sprint.md` — Vague 0/1 absorbe le nettoyage de la dette
résiduelle (listener inutile).
