# 07 — Plan de sprint `fix/sprint-salarie-complet`

> Snapshot post-hotfix navigation (merge `ae2fa1a` sur main).
> L'espace salarié est **navigable** en prod ; il reste des trous
> fonctionnels et un refactor structurel.

## Résumé

Le hotfix `hotfix/salarie-navigation` a rétabli la navigation sidebar
en prod (4 commits, mergé `ae2fa1a`). Le fichier `app/salarie/page.tsx`
reste un monolithe de 2145 lignes, certains onglets sont des
placeholders (Documents, 11/12 sous-onglets TIBOK) et plusieurs
fonctionnalités utilisateur sont incomplètes (certificat SL non
transmis, photo de profil non éditable, bugs visuels UX). Ce sprint
doit rendre l'espace salarié **iso-périmètre UX et cohérent**, sans
introduire de régression côté RH.

**Estimation globale** : 2-3 semaines développeur (selon refactor).

### Notation effort
- **S** : ≤ ½ journée
- **M** : 1-2 jours
- **L** : 3-5 jours
- **XL** : > 1 semaine

---

## Vague 0 — Refactor fondation (≈ 1 jour)

### V0.1 — Découpage de `page.tsx` en sous-composants

- **Effort** : M (1-2 jours)
- **Dépendances** : aucune ; doit être fait **avant** toute autre
  vague (sinon chaque fix re-touche un fichier 2145 lignes).
- **Périmètre**
  - Créer `app/salarie/_components/tabs/` :
    - `DashboardTab.tsx` (ex-inline)
    - `BulletinsTab.tsx` (ex-inline)
    - `PlanningTab.tsx` (ex-inline)
    - `PrimesTab.tsx` (ex-inline)
    - `SanteTab.tsx` (ex-inline)
    - `MaFicheTab.tsx` (déplacé depuis `page.tsx:41-197`)
    - `CongesTab.tsx` (déplacé)
    - `TrajetsTab.tsx` (déplacé)
    - `ContratsTab.tsx` (déplacé)
    - `DocumentsTab.tsx` (déplacé)
  - Un commit par onglet extrait — rollback ciblé.
  - `page.tsx` devient un orchestrateur (< 200 l.) qui charge
    l'employé, le state global (`bulletins`, `conges`, etc.), et
    branche l'onglet sélectionné.
  - **Iso-fonctionnel** : pas de rename, pas de changement d'API,
    pas de refactor "pendant qu'on y est".
- **Critères d'acceptation**
  - `page.tsx` < 300 lignes.
  - `npm run build` exit 0.
  - Test manuel des 10 onglets en preview Vercel : comportement
    inchangé côté utilisateur.
  - Git `git blame` reste lisible (1 extraction = 1 commit).

### V0.2 — Fix overflow barre d'onglets top (desktop)

- **Effort** : S (≈ 1-2 h)
- **Dépendances** : V0.1 recommandée (pour isoler la barre top dans
  son propre composant) — mais pas bloquant.
- **Problème constaté** (screenshot produit) : sur desktop large, la
  barre horizontale des 10 onglets en haut du contenu déborde à
  droite — « Mes contrats » coupé, « Documents » hors cadre.
- **Périmètre**
  - Auditer `page.tsx:1263-1281` (`<div className="hidden md:flex …">`).
  - Appliquer `overflow-x-auto` ou `flex-wrap` sur le conteneur ;
    réduire les labels (« Mes contrats » → « Contrats », etc.) ;
    ou passer à 2 lignes sur breakpoint `md`.
  - Vérifier la sidebar responsive ≥ 1024 px.
- **Critères d'acceptation**
  - Tous les labels d'onglets sont visibles sans scroll horizontal
    entre 1024 px et 1920 px.
  - Pas de régression mobile (≤ 768 px).

---

## Vague 1 — Quick wins (≈ 2-3 jours)

### V1.1 — Nettoyage dette du hotfix navigation

- **Effort** : S
- **Dépendances** : V0.1.
- **Périmètre** : supprimer le `document.click` listener introduit
  au commit `15d7fc8` (devenu inutile après `438f38a`). Voir
  `09-historique-et-bugs-navigation.md` §4.
- **Critères d'acceptation**
  - Navigation sidebar + top + quick actions toujours fonctionnelles
    après suppression.
  - `page.tsx` perd ~15 lignes.

### V1.2 — Upload photo de profil

- **Effort** : M
- **Dépendances** : côté serveur, création de `/api/rh/employes/me/photo`
  (POST multipart, whitelist owner) — coordonnée avec agent /rh.
- **Périmètre**
  - Ajouter un composant `<AvatarUploader>` dans `MaFicheTab`.
  - Upload vers Supabase Storage bucket `avatars/`,
    patch `photo_url` sur `employes` via le service role.
  - Preview locale + validation taille/type.
- **Critères d'acceptation**
  - Un salarié peut remplacer son avatar ; propagé immédiatement
    dans le header et la sidebar.
  - Fichier ≤ 2 MB, formats `image/jpeg|png|webp`.
  - Ancien avatar nettoyé du bucket après remplacement.

### V1.3 — Exposer `contact_urgence_*` dans « Ma fiche »

- **Effort** : S
- **Dépendances** : aucune — les 3 champs sont déjà dans la
  whitelist serveur (`EMPLOYEE_EDITABLE_FIELDS`), il manque
  l'UI.
- **Critères d'acceptation**
  - 3 nouveaux inputs (`nom`, `téléphone`, `relation`) dans
    `MaFicheTab`.
  - PATCH correctement transmis au serveur.

### V1.4 — Remplacer les `alert()` par des toasts

- **Effort** : S
- **Dépendances** : V0.1.
- **Périmètre** : `CongesTab`, `TrajetsTab` utilisent `alert()`
  (4-5 occurrences). Migrer vers `<Toaster>` (shadcn/sonner déjà
  utilisé ailleurs dans le projet).
- **Critères d'acceptation**
  - Aucun `alert()` restant dans `app/salarie/_components/`.
  - Feedback visuel inline cohérent avec le reste de l'app.

### V1.5 — Désactiver ou router le lien « Documents »

- **Effort** : S
- **Dépendances** : aucune — décision produit.
- **Périmètre** : soit cacher l'onglet, soit router vers
  `#contrats` tant que l'API `/api/rh/documents` n'existe pas.
- **Critères d'acceptation**
  - Plus d'écran « Fonctionnalité à venir 🚧 » en navigation normale.

---

## Vague 2 — Fonctionnalités cœur (≈ 1-2 semaines)

### V2.1 — Congés : upload certificat médical SL > 3j

- **Effort** : M
- **Dépendances** : endpoint multipart `POST /api/rh/conges` ou
  sous-route `/api/rh/conges/:id/certificat` (coordonnée avec
  agent /rh).
- **Périmètre** : le `file` déjà stocké en state (`CongesTab:210`)
  **n'est jamais envoyé** (04b §6). Ajouter un upload, renvoyer
  l'URL stockée avec la demande.
- **Critères d'acceptation**
  - Demande SL > 3j refusée côté serveur sans pièce jointe.
  - Certificat stocké dans Supabase Storage (bucket
    `conges-certificats/` privé, URL signée).
  - Visible par le RH dans `/rh/conges` sur la demande.

### V2.2 — Bulletins : pagination + tri

- **Effort** : S
- **Dépendances** : convention avec agent /rh sur `?page=`/`?limit=`.
- **Périmètre** : listing actuel charge tout. Dès 12-24 mois
  d'historique ça devient lourd.
- **Critères d'acceptation**
  - Pagination côté API et côté UI (10 par page, "Voir plus").
  - Tri desc garanti (`ORDER BY periode DESC`).

### V2.3 — Planning : sélecteur de mois

- **Effort** : M
- **Dépendances** : `/api/rh/planning` accepte déjà `?periode=YYYY-MM`.
- **Périmètre** : l'onglet n'affiche que le mois courant. Ajouter
  navigation précédent / suivant + picker.
- **Critères d'acceptation**
  - Navigation fluide 6 mois en arrière / 2 mois en avant.
  - Fusion congés/planning fonctionne sur tous les mois consultés.

### V2.4 — Planning : déporter la fusion congés côté serveur

- **Effort** : L (dépend d'agent /rh)
- **Dépendances** : endpoint RH qui renvoie un planning déjà fusionné,
  ou ajout d'un `?merge_leaves=1`.
- **Périmètre** : aujourd'hui côté client (`page.tsx:1127-1154`).
  Risque de divergence RH/salarié.
- **Critères d'acceptation**
  - La fusion n'est plus dans `page.tsx`.
  - Les vues RH et salarié voient les mêmes jours de congé sur le
    planning.

### V2.5 — Congés : refresh partiel au lieu de `load()` complet

- **Effort** : S
- **Dépendances** : V0.1.
- **Périmètre** : aujourd'hui `onRefresh` relance les 6 fetch du
  parent après chaque création/annulation (04b §6). Refresh ciblé
  suffit (balances + history).
- **Critères d'acceptation**
  - Network tab ne montre plus que 2 requêtes après une action.

### V2.6 — Documents : activation si API dispo

- **Effort** : M (seulement si `/api/rh/documents` existe)
- **Dépendances** : création côté RH.
- **Périmètre** : écran de listing + upload, tags (contrat, certificat,
  fiche d'identité…).
- **Critères d'acceptation**
  - Le salarié voit ses documents personnels et peut en téléverser.

---

## Vague 3 — Fonctionnalités secondaires (≈ 3-5 jours)

### V3.1 — Primes : correction « année en cours »

- **Effort** : S
- **Dépendances** : aucune.
- **Périmètre** : le total agrège **tous** les bulletins (04b §5).
  Filtrer sur l'année en cours.
- **Critères d'acceptation**
  - Libellé exact : « Total primes & OT perçus <année> ».
  - Chiffre correspond à la somme de Jan-Déc de l'année courante.

### V3.2 — Trajets KM : motif de rejet visible

- **Effort** : S
- **Dépendances** : le serveur retourne déjà un `motif_rejet`
  (à confirmer côté /rh).
- **Périmètre** : afficher le motif dans l'historique quand
  `statut === 'rejete'`.
- **Critères d'acceptation**
  - Le salarié sait pourquoi son trajet a été rejeté.

### V3.3 — Trajets KM : feedback inline (remplace `alert`)

- **Effort** : S
- **Dépendances** : V1.4 (toasts).
- Inclus dans V1.4 en fait, doublon — à fusionner.

### V3.4 — Santé TIBOK : réduire à 1 CTA unique

- **Effort** : S
- **Dépendances** : produit (décision).
- **Périmètre** : masquer les 11 sous-onglets placeholder, garder
  un seul écran « Accéder à TIBOK » (iframe ou `window.open`).
- **Critères d'acceptation**
  - L'utilisateur n'atterrit plus sur « Cette section sera
    connectée… ».

### V3.5 — Contrats : indicateur « nouveau contrat à signer »

- **Effort** : S
- **Dépendances** : aucune.
- **Périmètre** : badge sur l'onglet Contrats (et le tile dashboard)
  quand un contrat `brouillon` existe.
- **Critères d'acceptation**
  - Badge visible dès la connexion si un contrat attend signature.
  - Se résorbe après signature.

### V3.6 — Contrats : désactiver les boutons pendant contre-signature

- **Effort** : S
- **Dépendances** : aucune.
- **Périmètre** : état `signe_employe` doit afficher clairement « En
  attente de contresignature » (déjà dans les labels) et désactiver
  le bouton « Signer ».
- **Critères d'acceptation**
  - Impossible de re-cliquer « Signer » après sa propre signature.

---

## Hors périmètre de ce sprint

- **Intégration TIBOK native** (XL) — nécessite un sprint dédié avec
  contrat d'API TIBOK.
- **Migration React Native / app mobile dédiée** (XL) — non planifié.
- **Refactor global des APIs `/api/rh/*`** — traité par l'agent /rh
  dans `fix/sprint14-rh-conformite`.
- **Sanitisation HTML des contrats** (R07) — agent /rh.
- **Anti-fraude GPS** (R06) — agent /rh.
- **Onglet Chat salarié** — prévu mais pas dans ce sprint.

---

## Prérequis bloquants

Les fixes **P0** listés dans `08-prerequis-p0-rh.md` doivent être
livrés par l'agent /rh **avant** la mise en prod des items suivants :

- V0.1 / V0.2 / V1.1 / V1.3 / V1.4 / V1.5 / V2.3 / V3.1 → **pas
  bloqués** (pur front, pas d'impact sécurité).
- V1.2 (upload photo) → bloqué par création `POST /api/rh/employes/me/photo`.
- V2.1 (certificat SL) → bloqué par endpoint multipart.
- V2.6 (documents) → bloqué par `/api/rh/documents`.
- V2.2 / V2.4 → dépendent de conventions côté API /rh.
- **Tous** les items consommant `/api/rh/paie/pdf`, `/api/rh/contrats/[id]/pdf`,
  `/api/rh/trajets-km`, `/api/rh/planning` → doivent attendre le
  durcissement `isSelf` côté /rh (P0 R02, P1 R04, P1 R09).

---

## Ordre d'exécution recommandé

```
V0.1 → V0.2 → V1.1 → V1.3 → V1.4 → V1.5 → V1.2 → V3.1 → V3.4 → V3.5
  → V3.6 → V3.2 → V2.5 → V2.2 → V2.3 → V2.1 → V2.4 → V2.6
```

Rationale :
1. Vague 0 (fondation) avant tout — sinon chaque modif re-touche
   un fichier 2145 l.
2. Vague 1 en premier pour un ressenti utilisateur rapide (toasts,
   photo, contacts d'urgence).
3. Les items P0 /rh sont distribués dans l'ordre ; on attaque V2.1
   (upload certificat) quand l'agent /rh a livré l'endpoint
   multipart.
4. Vague 3 en dernier : elle n'apporte pas de valeur bloquante.
