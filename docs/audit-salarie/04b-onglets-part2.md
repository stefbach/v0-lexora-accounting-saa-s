# 04b — Fiches onglets (partie 2/3)

> Couvre : **Primes**, **Congés**, **Documents**, **Trajets km**.
> Suite de `04a-onglets-part1.md`. Références : `app/salarie/page.tsx`.

---

## 5. Primes (`tab = "primes"`)

**Rendu inline** — `page.tsx:1712-1795`.

### Vocation
Historique des heures supplémentaires, primes/allocations par mois,
primes individuelles saisies, et total annuel perçu.

### Rendu (3 cartes + 1 total)
| Bloc | Lignes | Source |
|---|---|---|
| Heures supplémentaires | 1714-1735 | `bulletins[].heures_sup_montant > 0` |
| Primes & allocations par mois | 1737-1755 | `bulletins[].special_allowance_1 > 0` |
| Primes individuelles saisies | 1757-1781 | `primes[]` (de `/api/rh/primes?type=saisie`) |
| Total primes + OT année | 1783-1793 | agrégat de `bulletins[]` |

### APIs
- Aucun fetch propre à cet onglet : tout vient de l'état `bulletins`
  et `primes` déjà peuplés par `load()` (voir Dashboard, 04a).
- Indirectement : `/api/rh/paie?action=list` et
  `/api/rh/primes?type=saisie`.

### État fonctionnel
- ✅ Rendu purement dérivé — pas de soucis d'aller-retour serveur.
- ⚠️ « Total année en cours » ne filtre pas sur l'année courante — il
  somme **tous** les bulletins présents, ce qui crée un faux total si
  l'historique dépasse 12 mois.
- ⚠️ Pas de tri explicite : l'ordre dépend de ce que l'API renvoie.

### Risques
- `P2` : libellé « année en cours » mensonger — bug de calcul.
- `P3` : UX redondante entre « Primes par mois » (agrégat bulletin) et
  « Primes individuelles saisies » (ligne par ligne) — risque de double
  compte pour l'utilisateur.

---

## 6. Congés (`tab = "conges"`)

**Composant** : `CongesTab` (`page.tsx:199-632`).

### Vocation
- Afficher les soldes (AL, SL + split employé/société).
- Poster une nouvelle demande (type, dates, demi-journée, motif, certificat).
- Lister l'historique des demandes avec statut et possibilité d'annuler
  ses propres demandes `en_attente`.

### Rendu (3 blocs)
1. **Cartes soldes** (329-368) — AL remaining/total, SL remaining/total,
   + sous-ligne « Pris / Moi / Imposé » si la société a imposé des AL.
2. **Formulaire "Nouvelle demande"** (371-503) :
   - pill selector `type_conge` (AL/SL/MAT/PAT/SANS_SOLDE) ;
   - toggle "demi-journée" (matin / après-midi) uniquement pour
     `AL`/`SL`/`SANS_SOLDE` — liste figée `DEMI_JOURNEE_ALLOWED`
     (ligne 224) ;
   - dates début/fin (fin lockée quand demi-journée) ;
   - textarea motif ;
   - **zone de dépôt certificat** quand `SL` et durée > 3 jours (218-221).
     ⚠️ Le `file` est stocké dans l'état mais **n'est jamais envoyé au
     serveur** dans le POST (voir 245-281). L'upload du certificat n'est
     pas implémenté — voir risques.
3. **Historique** (506-628) — table desktop + cartes mobile, filtres par
   statut (`approuve`/`en_attente`/`refuse`), badges `½ AM`/`½ PM`,
   `Imposé`, bouton "Annuler" si `isMine && statut === en_attente`.

### APIs
- `GET /api/rh/conges?action=balances&employe_id=X` (228).
- `GET /api/rh/conges?employe_id=X` (229) — liste.
- `POST /api/rh/conges` `{ action: "creer", employe_id, type_conge,
  date_debut, date_fin, motif, demi_journee, matin_ou_apres_midi }` (256).
- `POST /api/rh/conges` `{ action: "annuler", id }` (291).

### État fonctionnel
- ✅ UI riche, valide localement demi-journée + cohérence dates.
- ✅ Hypothèse anti-escalade : seul le propriétaire + `en_attente` peut
  annuler, imposé côté API (commentaire 284-285).
- 🔴 **Le certificat médical demandé n'est jamais transmis** :
  `setFile(f)` stocké, jamais joint à la requête ni posté ailleurs. Le
  backend reçoit une demande SL > 3j sans pièce justificative. Voir
  risques.
- ⚠️ Le fallback soldes `alDroit: 22 / slDroit: 15` (307-308) diverge
  potentiellement des entitlements Mauritius Employment Rights Act pour
  contrats < 12 mois.
- ⚠️ `onRefresh` (load du parent) rejoue les **6 fetch** — refresh
  complet pour une simple création.

### Risques
- `P0` : autorisations POST `creer`/`annuler` côté API doivent
  vérifier `employe_id`/`id` appartiennent à l'appelant. Voir 06 & 08.
- `P1` : certificat SL > 3j sans upload = non-conformité possible (WRA).
- `P2` : refresh complet à chaque mutation (perf + stabilité UX).

---

## 7. Documents (`tab = "documents"`)

**Composant** : `DocumentsTab` (`page.tsx:1019-1044`).

### Vocation
Placeholder — « Fonctionnalité à venir 🚧 ». Aucun fetch, aucun state.

### Rendu
Une carte centrée avec icône dossier, titre « Fonctionnalité à venir »,
et phrase d'attente.

### APIs
Aucune.

### État fonctionnel
- 🔴 Fonctionnalité **non implémentée**. Le lien sidebar existe
  pourtant — l'utilisateur arrive sur un écran vide.
- Suggestion : router vers Contrats tant que Documents n'existe pas, ou
  désactiver le lien dans la sidebar.

### Risques
- `P3` : incohérence feature vs navigation. Aucun impact sécurité.

---

## 8. Trajets km (`tab = "trajets"`)

**Composant** : `TrajetsTab` (`page.tsx:635-823`).

### Vocation
Saisie et suivi GPS des trajets professionnels (voiture/moto/vélo),
avec démarrage, checkpoints, terminaison, historique et calcul
d'indemnité.

### Rendu
- **Carte "Trajet en cours"** (731-759) : pulse vert, km parcourus,
  véhicule, boutons `Checkpoint` + `Terminer`.
- **Carte "Nouveau trajet"** (760-784) : sélecteur véhicule + motif,
  bouton `Démarrer`.
- **Stats** (786-795) : total km du mois (tous statuts ≠ rejete), total
  indemnités **validées** (statut=valide).
- **Historique** (797-820) : liste des trajets terminés avec badge
  statut (validé / rejeté / en attente).

### APIs
- `GET /api/rh/trajets-km?employe_id=X` (645).
- `POST /api/rh/trajets-km` `{ action: "demarrer", employe_id,
  societe_id, latitude, longitude, motif, vehicule }` (679).
- `POST /api/rh/trajets-km` `{ action: "checkpoint", trajet_id,
  latitude, longitude }` (698).
- `POST /api/rh/trajets-km` `{ action: "terminer", trajet_id, latitude,
  longitude }` (714).

> **Correction de l'inventaire 02** : les 3 écritures ne sont PAS des
> `PUT/DELETE` simulés — ce sont trois actions POST avec un discriminant
> `action`. À propager dans `02-apis-inventory.md` lors d'une future
> passe.

### Flux GPS
- `getPosition()` (658-667) → `navigator.geolocation.getCurrentPosition`
  avec `enableHighAccuracy`, timeout 15s.
- Toutes les actions réclament le GPS — un refus navigateur renvoie un
  `alert()` brutal.

### État fonctionnel
- ✅ Pattern démarrer / checkpoint / terminer cohérent.
- ✅ UI claire, badges de statut, agrégats visibles.
- ⚠️ `employe_id` + `societe_id` passés par le client dans le `demarrer`
  — à valider côté API (P0). Un salarié ne doit pas pouvoir créer un
  trajet pour un autre employé.
- ⚠️ Coordonnées GPS **fournies par le client** : potentiel de
  falsification (ex. simulateur GPS). Au-delà de la simple fraude
  déclarative, risque juridique sur la validation d'indemnités.
- ⚠️ `alert()` non-UX ; pas de feedback inline.
- ⚠️ `motif` par défaut « Déplacement » (ligne 681) si champ vide —
  valeur peu parlante côté validation RH.

### Risques
- `P0` : propriété du trajet côté API (`trajet_id` correspond à
  l'appelant pour `checkpoint`/`terminer`).
- `P1` : pas de contrôle anti-fraude GPS (vitesse aberrante, téléport).
- `P2` : la validation côté RH (validation/rejet) n'est pas exposée
  dans l'espace salarié — OK, mais le salarié ignore pourquoi un trajet
  est rejeté (pas de motif affiché dans l'historique).

---

## Note de sortie
Fiches suivantes : **Ma santé (TIBOK)**, **Mes contrats**
→ `04c-onglets-part3.md`.
