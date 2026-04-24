# 08 — Prérequis P0 côté `/api/rh/*`

> Document destiné à l'agent `fix/sprint14-rh-conformite`.
> 4 failles classées P0 identifiées lors de l'audit `/salarie`.
> **Prérequis** à la mise en prod du sprint `/salarie` (cf. 07).

## Index des 4 P0

| # | Faille | Fichier cible | Pattern |
|---|---|---|---|
| **P0-01** | Fallback « toutes les sociétés » dans `getUserSocieteIds` | `lib/rh/access.ts` L.100-106 | Autorisation |
| **P0-02** | `/api/rh/paie/pdf` — propriété bulletin non vérifiée | `app/api/rh/paie/pdf/route.ts` + `paie/route.ts` (action `mark_read`) | Autorisation |
| **P0-03** | XSS persistant via `html_content[_modified]` des contrats | `app/rh/contrats/**` (éditeur) + rendu `ContratsTab` | Entrée utilisateur non assainie |
| **P0-04** | Signature de contrat sans hash/snapshot — valeur probatoire fragile | `app/api/rh/contrats/[id]/signer/route.ts` action `signer_self` | Intégrité / ETA 2000 Maurice |

---

## P0-01 — Fallback d'accès multi-société trop permissif

### Contexte
Lors de l'audit du modèle d'auth (03 §5), l'inspection de
`lib/rh/access.ts` a révélé un **fallback ultime** qui, lorsqu'aucune
société n'a pu être résolue pour un utilisateur d'un rôle RH/client,
**renvoie l'intégralité des sociétés** de la base.

### Localisation
```ts
// lib/rh/access.ts, lignes 100-106
// Ultimate fallback: if still empty, get sociétés from employes the user might manage
if (ids.size === 0) {
  const { data: allSocietes } = await supabase.from('societes').select('id')
  // If user has any role that implies RH access, give them all sociétés
  if (['client_admin', 'client_user', 'rh', 'rh_manager',
       'comptable', 'comptable_dedie'].includes(profile.role)) {
    for (const s of allSocietes || []) ids.add(s.id)
  }
}
```

### Pourquoi c'est P0
- Un compte `client_admin` mal provisionné (ex. `profiles.client_id`
  vide, pas d'entrée `user_societes`, pas de `dossiers` créés, pas
  de `societes.created_by`) reçoit **l'accès à TOUTES les sociétés**.
- Toutes les routes `/api/rh/*` consomment `getUserSocieteIds` ; un
  `client_admin` dans cette situation peut lister employés, paie,
  contrats, bulletins, tous clients confondus.
- En conditions prod, Lexora sert plusieurs clients (multi-tenant).
  Cette faille casse l'isolation.

### Impact sur `/salarie`
Indirect : `employes/me`, `conges`, `paie`, etc. passent par
`getUserSocieteIds(user.id)` en fallback si `isSelf` échoue. Un
salarié standard n'a pas les rôles concernés (`employe`/`salarie`),
donc R01 n'élargit pas son périmètre. **Mais** un `client_assistant`
(accepté sur `/salarie`) pourrait être `client_user` ailleurs → fuite
cross-client sur des lectures.

### Correctif attendu
1. Supprimer le fallback ligne 100-106. Un utilisateur sans société
   doit voir **aucune donnée**, pas toutes les données.
2. Ajouter un log d'alerte (`console.warn` ou Sentry) quand un
   utilisateur d'un rôle RH/client tombe à `ids.size === 0`.
3. Prévoir un endpoint admin pour diagnostiquer le cas.

### Critères d'acceptation
- Après fix, un `client_admin` sans lien société renvoie `[]`
  depuis `getUserSocieteIds`.
- Toutes les routes `/api/rh/*` renvoient des collections vides
  (pas d'erreur) pour ce compte.
- Aucun test d'intégration existant ne régresse.

---

## P0-02 — `/api/rh/paie/pdf` et `mark_read` sans vérification de propriété

### Contexte
L'onglet Bulletins (04a §3) appelle :
- `GET /api/rh/paie/pdf?employe_id=X&periode=YYYY-MM&bulletin_id=Y[&view=1]`
- `POST /api/rh/paie?action=mark_read&bulletin_id=Y`

Les paramètres `employe_id` et `bulletin_id` sont **forgeables** — un
salarié authentifié peut substituer n'importe quel ID.

### Localisation
- `app/api/rh/paie/pdf/route.ts` (non lu pendant l'audit — à auditer).
- `app/api/rh/paie/route.ts` (action `mark_read`) — à auditer.

### Pourquoi c'est P0
- **Fuite du bulletin d'un autre salarié** : un employé A lit le
  bulletin d'un employé B en passant `bulletin_id=B`.
- **Altération d'état** : A marque « lu » un bulletin qui ne lui
  appartient pas → métriques faussées côté RH.
- Le bulletin de paie contient : salaire, déductions fiscales, CSG,
  numéro bancaire, adresse. Divulgation à portée élevée.

### Impact sur `/salarie`
Direct : l'onglet Bulletins repose sur ces deux routes. Tant que le
fix n'est pas livré, tout salarié peut lire les bulletins de
n'importe quel autre salarié de la même société (ou potentiellement
d'autres sociétés si P0-01 s'applique).

### Correctif attendu
Dans les deux routes :

```ts
// Pseudo-code
const user = await getUser()
const { data: bulletin } = await admin
  .from('bulletins_paie')
  .select('id, employe_id, periode')
  .eq('id', bulletin_id).maybeSingle()
if (!bulletin) return 404

const { data: emp } = await admin
  .from('employes')
  .select('auth_user_id, email, societe_id')
  .eq('id', bulletin.employe_id).maybeSingle()
const isSelf = emp && (emp.auth_user_id === user.id || emp.email === user.email)
if (!isSelf) {
  // Escalade admin/RH : autorisée si accès à la société
  if (!(await userHasAccessToSociete(user.id, emp.societe_id))) return 403
}
```

Étendre ce pattern à **toute route** prenant un `employe_id` ou un
`bulletin_id` en query depuis `/salarie`.

### Critères d'acceptation
- Appel avec `bulletin_id` qui n'appartient pas à l'appelant → 403.
- Appel admin/RH avec accès société → 200 (inchangé).
- Appel du salarié propriétaire → 200 (inchangé).
- Test d'intégration : 2 salariés, chacun ne voit que ses bulletins.

---

## P0-03 — XSS persistant via `html_content[_modified]` des contrats

### Contexte
L'onglet Contrats (04c §10) rend le contenu HTML du contrat
directement dans une modale via `dangerouslySetInnerHTML` :

```tsx
// app/salarie/page.tsx (ContratsTab)
<div
  className="prose prose-sm max-w-none p-4 text-sm text-gray-800"
  dangerouslySetInnerHTML={{ __html: viewing.html_content_modified || viewing.html_content }}
/>
```

### Localisation
- Source (écriture) : éditeur de contrats RH/juridique — à identifier
  dans `app/rh/contrats/`, `app/rh/juridique/**`, `app/juridique/**`.
- Sink (rendu) : `ContratsTab` côté salarié (et probablement
  symétrique côté `/rh/contrats`).

### Pourquoi c'est P0
- L'éditeur de contrat côté RH accepte du HTML (riche, c'est le
  design). Sans sanitation, un acteur RH malveillant (ou un client
  administrateur compromis) peut injecter du HTML/JS qui s'exécutera
  dans **la session d'un salarié** consultant son contrat.
- Vecteurs : `<script>`, `<img onerror>`, `<iframe src>`, attributs
  `style` avec `expression()` (anciens navigateurs), `<a href="javascript:">`.
- Le salarié est authentifié Supabase → XSS = exfiltration du
  cookie d'auth, actions self-service non désirées (annulation
  de congé, modification de fiche).

### Impact sur `/salarie`
Direct et critique.

### Correctif attendu
1. **Assainir à la saisie côté RH** avec DOMPurify ou équivalent
   (whitelist stricte : `p h1 h2 h3 strong em ul ol li br span table
   tbody tr td th`, pas d'attributs `on*`, pas de `style` avec
   url/expression).
2. **Re-assainir au rendu** côté `/salarie` et `/rh/contrats` (défense
   en profondeur).
3. Alternative : compiler le contrat en PDF côté serveur et
   afficher **l'image PDF** — plus de HTML rendu en dynamique.
   Choix produit/sécurité.

### Critères d'acceptation
- Un `<script>alert(1)</script>` inséré via l'éditeur RH n'exécute
  aucun JS lors de la lecture côté salarié ou RH.
- Un balisage HTML "normal" (paragraphes, listes, tables de
  rémunération) reste affiché correctement.
- Un pentest XSS sur les vecteurs DOMPurify standard passe.

---

## P0-04 — Signature de contrat sans hash/snapshot du contenu

### Contexte
`signer_self` (`app/api/rh/contrats/[id]/signer/route.ts:117-158`)
marque le contrat comme signé par l'employé — mais **n'archive pas**
le contenu au moment de la signature. Le champ
`html_content_modified` peut ensuite être réécrit par un acteur RH
sans que la signature ne se rompe.

### Localisation
```ts
// app/api/rh/contrats/[id]/signer/route.ts action signer_self
const { data: signed } = await adminSupabase
  .from('contrats_employes')
  .update({
    statut: 'signe_employe',
    date_signature_employe: new Date().toISOString(),
    ip_signature_employe: ip,
    token_signature: null,
    token_signature_employe: null,
  })
  .eq('id', id)
```

Aucun hash, aucun clone immuable du `html_content` au moment T.

### Pourquoi c'est P0
- La mention légale affichée au salarié invoque **Electronic
  Transactions Act 2000 — Maurice** ; la valeur probatoire d'une
  signature électronique exige que le document signé soit
  **identifiable de manière unique** et **inaltéré**.
- Sans hash, rien n'interdit à un agent RH (ou à un acteur
  compromis) de modifier le contrat après signature ; l'employé se
  retrouve engagé sur un contenu différent de celui qu'il a vu.
- Non-conformité potentielle : litiges prud'hommes, Data Protection
  Office.

### Impact sur `/salarie`
Indirect mais systémique : tous les contrats signés via l'espace
salarié sont légalement fragiles.

### Correctif attendu
1. Au moment du `signer_self`, calculer `sha256(html_content_modified || html_content)`
   et stocker dans une colonne `hash_signe_employe` (`TEXT`) sur
   `contrats_employes`.
2. Optionnel mais recommandé : stocker le **snapshot intégral** du
   HTML signé dans une colonne `html_signe_employe` (`TEXT`) — zéro
   ambiguïté, coût stockage minimal.
3. Même traitement pour `signer` (token WhatsApp) et pour la
   contresignature dirigeant → `hash_signe_dirigeant` /
   `html_signe_dirigeant`.
4. UI de contestation : au PDF / modale de lecture, afficher le
   hash (préfixe 12 caractères) comme preuve d'intégrité.

### Critères d'acceptation
- Après signature, `hash_signe_employe` est peuplé et
  reproductible (recalcul SHA256 = match).
- Toute modification ultérieure de `html_content_modified` laisse
  la signature **détectablement obsolète** (hash mismatch).
- PDF généré inclut le hash signé sur le pied-de-page.
- Migration sans downtime : colonnes ajoutées nullable, backfill
  optionnel sur les contrats déjà signés (hash du contenu actuel —
  imparfait mais mieux que rien).

---

## Coordination avec le sprint `/salarie`

### Ordre de livraison recommandé

1. **P0-01** en premier — pas de dépendance UI, règle d'auth globale.
2. **P0-02** ensuite — nécessaire avant d'ouvrir plus largement les
   bulletins dans le sprint `/salarie`.
3. **P0-04** avant que le flux de signature soit utilisé en volume
   (pendant que peu de contrats sont en base, on peut encore
   backfill proprement).
4. **P0-03** indépendant ; à prioriser si un RH externe / client-admin
   peut injecter du contenu.

### Déploiement
- Tous les fixes **déployables sans downtime**.
- Migrations SQL nécessaires pour P0-04 (2 colonnes sur
  `contrats_employes`). Pas de migration pour les autres.
- Aucun changement de contrat d'API externe → pas d'impact
  consommateurs tiers.

### Tests communs
- L'agent `/salarie` fournira un jeu de tests manuels (5
  scénarios) à l'agent `/rh` pour validation croisée.
- Une checklist anti-régression est dans `06-risques-conflits.md §5`.

---

**Rappel** : tant que les 4 P0 ne sont pas livrés, le sprint
`/salarie` peut continuer en pur front (V0.1, V0.2, V1.1, V1.3, V1.4,
V1.5, V3.1, V3.4, V3.5, V3.6), mais **les items impliquant l'accès
aux bulletins, contrats ou documents** ne peuvent pas être
considérés « livrables en prod » avant résolution.
