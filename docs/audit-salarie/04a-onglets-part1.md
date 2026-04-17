# 04a — Fiches onglets (partie 1/3)

> Couvre : **Dashboard**, **Ma fiche**, **Bulletins**, **Planning**.
> Format : vocation · rendu · APIs · état · risques immédiats.
> Toutes les références de ligne pointent vers `app/salarie/page.tsx`.

---

## 1. Dashboard (`tab = "dashboard"`)

**Fichier** : inline dans `EspaceEmployePage` — lignes **1269 → 1500**.
**Hash** : `#dashboard` (label sidebar : « Pointage »).

### Vocation
Vue d'atterrissage : pointage du jour, soldes de congés, annonces de
l'entreprise, prochains jours fériés, raccourcis vers les autres onglets,
aperçu du prochain salaire.

### Rendu (blocs principaux)
| Bloc | Lignes | Description |
|---|---|---|
| Prochain salaire estimé | 1294-1313 | Dérivé de `bulletins[0]` (dernier bulletin). |
| Carte pointage | 1316-1333 | 4 tuiles (Entrée / Pause / Sortie / Durée) + 4 boutons d'action. |
| Soldes de congés | 1336-1371 | Progrès circulaires AL + SL. |
| Annonces | 1373-1401 | Top 3 de `/api/rh/annonces` (filtre par `type`). |
| Prochains jours fériés | 1403-1451 | **Liste statique codée en dur** — `HOLIDAYS_2026`. |
| Raccourcis | 1453-1473 | 4 cartes → setTab (bulletins / conges / sante / planning). |
| Notifications (desktop) | 1476-1497 | Résumé du dernier bulletin. |

### État local utilisé
`pointageToday`, `bulletins`, `conges`, `annonces`, `feedback`,
`punching`.

### APIs consommées (via `load()` à 1091-1161)
- `GET /api/rh/employes/me` (résolution de `employe`).
- `GET /api/rh/pointage?date=YYYY-MM-DD&employe_id=X` (`line 1101`).
- `GET /api/rh/paie?action=list&employe_id=X` (`1102`).
- `GET /api/rh/primes?type=saisie&employe_id=X` (`1103`).
- `GET /api/rh/conges?action=balances&employe_id=X` (`1104`).
- `GET /api/rh/planning?periode=YYYY-MM&societe_id=X&employe_id=X` (`1105`).
- `GET /api/rh/conges?employe_id=X` (`1106`).
- `GET /api/rh/annonces` (`1157`).
- `POST /api/rh/pointage` via `doPunch("entree"|"pause_debut"|"pause_fin"|"sortie")` (`1165-1178`).

### État fonctionnel
- ✅ Fonctionne si `employe` est résolu.
- ⚠️ **Fallback soldes codé en dur** (`al_droit: 22`, `sl_droit: 15`,
  lignes 1053 & 1121-1123) — ne reflète pas les entitlements réels
  pour les contrats à temps partiel.
- ⚠️ Jours fériés codés en dur (2026) — ne s'appuie pas sur
  `/api/rh/jours-feries`.
- ⚠️ Payload pointage `heure_forcee: timeMauritius()` côté client :
  l'heure est donnée par le client, le serveur doit la valider ou
  la remplacer par `now()` (voir §risques 06).

### Risques
- `P1` : tout salarié peut forger `employe_id` dans les 6 GET du `load()`.
- `P1` : `heure_forcee` : si le backend ne l'écrase pas, un salarié peut
  antidater ses pointages.
- `P2` : jours fériés 2026 en dur — rupture en 2027.
- `P2` : soldes 22/15 en dur — incohérent avec contrat < 12 mois.

---

## 2. Ma fiche (`tab = "profil"`)

**Composant** : `MaFicheTab` (`page.tsx:41-197`), extrait du default
export.

### Vocation
Affichage + édition des infos personnelles de l'employé courant.

### Rendu
- Carte header (avatar + nom + poste + `code_employe`).
- Section **Coordonnées** : email, mobile, téléphone.
- Section **Adresse** : adresse / adresse2 / ville / code_postal.
- Section **Banque** : bank_name, bank_account, iban.
- Section **Infos personnelles** : date_naissance, genre, statut_marital,
  nationalite (lignes 144-197).
- Bouton « Enregistrer » (handleSave, 49-66).

### APIs
- `PATCH /api/rh/employes/me` (`line 52`).
  Body filtré côté client à 13 champs (voir `MaFicheTab.handleSave`).
  Re-filtré côté serveur par `EMPLOYEE_EDITABLE_FIELDS`
  (`employes/me/route.ts:16-22`, 16 champs autorisés : les 13 UI + 3
  contacts d'urgence non exposés par l'UI).

### État fonctionnel
- ✅ Whitelist côté serveur — pas d'escalade de privilège possible via
  le body.
- ⚠️ L'UI ne permet pas de modifier `contact_urgence_*` même si le
  serveur les accepte — trou côté UX ou fonctionnalité à exposer.
- ⚠️ Aucun feedback d'erreur typé : `alert()` brut en cas de réponse
  `data.error` (ligne 62).

### Risques
- `P3` : photo_url non éditable ici ; à confirmer s'il existe une
  route d'upload.
- `P3` : l'IBAN n'est pas validé côté client (regex MU / IBAN general).

---

## 3. Bulletins (`tab = "bulletins"`)

**Rendu inline** — `page.tsx:1508-1559`.

### Vocation
Liste des bulletins de paie du salarié, avec badge "Nouveau / Lu",
aperçu/téléchargement PDF et marquage en "lu".

### Rendu (carte par bulletin)
- Period label (mois en FR).
- Badge `Nouveau` (gold) ou `Lu` (green).
- Net à payer en gros + chips (Base, OT, Primes, Brut, Déductions).
- 2 boutons :
  - **Voir** → ouvre `GET /api/rh/paie/pdf?...&view=1` et déclenche
    `POST /api/rh/paie?action=mark_read` (`line 1544`).
  - **Télécharger** → ouvre `GET /api/rh/paie/pdf?...` sans `view`.

### APIs
- Liste alimentée par `load()` via `/api/rh/paie?action=list` (cf. Dashboard).
- `GET /api/rh/paie/pdf?employe_id=X&periode=YYYY-MM&bulletin_id=Y[&view=1]`.
- `POST /api/rh/paie?action=mark_read&bulletin_id=Y`.

### État fonctionnel
- ✅ Logique d'état "lu" explicite (`b.lu_le`).
- ⚠️ `employe_id` et `bulletin_id` forgeables → le backend **doit**
  vérifier que `bulletin_id` appartient bien à `auth.user` (→ P0 §06).
- ⚠️ Pas de pagination : si un employé a 5 ans d'historique, la route
  doit limiter ou paginer.

### Risques
- `P0` : `/api/rh/paie/pdf` et `?action=mark_read` doivent vérifier la
  propriété du bulletin.
- `P1` : absence de tri explicite côté client — hypothèse que l'API
  renvoie DESC sur `periode`.

---

## 4. Planning (`tab = "planning"`)

**Rendu inline** — `page.tsx:1562-1709`.

### Vocation
Vue calendrier **mois courant** du planning du salarié, avec fusion
automatique des congés approuvés (congé override shift).

### Rendu
- Header + 4 tuiles stats (jours travail / heures / congés / repos).
- Liste jour par jour triée par `jour`.
- Styles par type de shift (J/M/AM/N) et par type de congé (AL/SL/MAT/PAT/SANS_SOLDE).
- Mise en évidence du jour courant (ring GOLD).

### APIs
Lecture seule via `load()` (`line 1105`) :
`GET /api/rh/planning?periode=YYYY-MM&societe_id=X&employe_id=X`.

Fusion post-fetch (`1127-1154`) :
- `myPlanning = planning.filter(p => p.employe_id === emp.id)`
- `approvedLeaves = conges.filter(statut ∈ approuve/approved)`
- Pour chaque jour inclus dans un congé : réécrit `shift`, `leave_type`,
  remet `est_repos=false`, efface heures.

### État fonctionnel
- ✅ Planning + congés fusionnés côté client — logique lisible.
- ⚠️ La fusion est **purement client** : deux salariés voyant des
  données différentes si le calcul bouge. À déplacer côté API à terme.
- ⚠️ `planning.filter(p.employe_id === emp.id)` indique que l'API peut
  renvoyer plusieurs employés malgré le `employe_id=X` en query — donc
  soit l'API ignore le filtre, soit le client sur-filtre par prudence.
  **À vérifier** (risques §06).
- ⚠️ Pas de navigation mois précédent / suivant — uniquement mois courant.

### Risques
- `P1` : `employe_id` filtré côté client uniquement → si le serveur ne
  filtre pas, le salarié voit tout le planning de la société.
- `P2` : pas de sélecteur de mois (UX) ; pas de "publié/brouillon"
  visible.
- `P2` : fusion congé/planning en deux endroits (`/rh` + `/salarie`)
  — risque de divergence.

---

## Note de sortie
Fiches suivantes : **Primes**, **Congés**, **Documents**, **Trajets**
→ `04b-onglets-part2.md`.
