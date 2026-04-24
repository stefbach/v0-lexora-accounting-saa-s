# 04c — Fiches onglets (partie 3/3)

> Couvre : **Ma santé (TIBOK)**, **Mes contrats**.
> Clôture la trilogie commencée avec 04a et 04b.
> Références : `app/salarie/page.tsx`.

---

## 9. Ma santé — TIBOK (`tab = "sante"`)

**Rendu inline** — `page.tsx:1810-2060` (≈ 250 lignes).

### Vocation
Hub "santé" co-brandé TIBOK : annonce de la téléconsultation,
raccourcis vers fonctionnalités TIBOK, et 3 process-flows pédagogiques
(Pharmacie, Laboratoire, Radiologie).

### Structure interne
Un sous-onglet `santeTab` (état local, ligne 1058) avec 12 items
définis par `santeNav` (1812-1825) :
`dashboard`, `salle_attente`, `rdv`, `consultations`, `pharmacie`,
`analyses`, `abonnement`, `famille`, `second_avis`, `assurance`,
`suivi`, `silentcheck`.

### Rendu
- **Sidebar TIBOK** desktop + barre d'onglets scrollable mobile
  (1852-1886). Branding TEAL `#2a9d8f`.
- **Dashboard** (1891-2023) :
  - CTA principal "Consultation immédiate ou sur rendez-vous" →
    `window.open("https://tibok.mu")`.
  - 2 cartes raccourcis (Consultations, Pharmacie).
  - Lien "Suivi Maladies Chroniques".
  - Composant réutilisé `ProcessFlow` (1827-1847) : Pharmacie,
    Laboratoire, Radiologie, + 2 grilles de 5 étapes supplémentaires.
- **Autres onglets** (2026-2056) : écran unique de type placeholder —
  "Cette section sera connectée à votre espace TIBOK", bouton vers
  `https://tibok.mu`.

### APIs
**Aucune**. Le bloc entier ne fait aucun `fetch` :
- pas de consommation de l'API Lexora ;
- pas d'appel à un endpoint TIBOK ;
- uniquement des redirections via `window.open`.

### État fonctionnel
- ✅ Pas de fuite d'information côté salarié (rien ne dépend d'un
  `employe_id` ici).
- 🔴 **Entièrement vitrine** : 11 sous-onglets sur 12 ne font rien.
  L'utilisateur clique partout et atterrit sur le même placeholder
  renvoyant vers tibok.mu. À considérer comme feature marketing
  plutôt que produit intégré.
- ⚠️ `santeNav.slice(0, 6)` côté mobile (1875) : les 6 derniers
  sous-onglets (`abonnement`, `famille`, `second_avis`, `assurance`,
  `suivi`, `silentcheck`) sont **inaccessibles en mobile**.
- ⚠️ `prenom` envoyé en titre mais onglet utilisable sans employé
  résolu (pas de garde) — bénin, mais à noter.

### Risques
- `P3` : UX mensongère (sous-onglets factices). Pas de risque sécurité.
- `P3` : lien externe `https://tibok.mu` ouvert sans `rel="noopener"`
  sur certaines occurrences — exposition à `window.opener` (faible
  impact, mais trivial à corriger).

### Opportunités (hors périmètre sprint immédiat)
- Brancher `consultations`, `rdv`, `pharmacie` à une API TIBOK si un
  contrat d'intégration existe.
- Sinon, masquer les sous-onglets non-fonctionnels et garder un seul
  CTA "Accéder à TIBOK".

---

## 10. Mes contrats (`tab = "contrats"`)

**Composant** : `ContratsTab` (`page.tsx:827-1011`).

### Vocation
- Lister les contrats de travail du salarié.
- Afficher le contenu HTML du contrat dans une modale.
- Télécharger le PDF officiel.
- **Signer son propre contrat** (`action: signer_self`).

### Rendu
1. **Liste** (885-943) : une carte par contrat affiche :
   - `type_contrat`, badge `statut` (mappés par `STATUT_LABELS` /
     `STATUT_COLORS`, 846-859 : brouillon → signé → contresigné…).
   - Dates début / fin (ou "Durée indéterminée").
   - Mentions "Signé par vous le …" / "Contresigné par l'employeur…".
   - Boutons `Voir` / `Voir & signer` (si `statut === brouillon`)
     et `PDF` (lien direct vers `/api/rh/contrats/[id]/pdf`).
2. **Modale de lecture + signature** (946-1008) :
   - `max-w-4xl h-[90vh]`, contenu scrollable.
   - Rendu HTML via `dangerouslySetInnerHTML` : 959-962 (voir §Risques).
   - Affichage éventuel de la signature employeur (image + nom).
   - Bouton **Signer le contrat** si `brouillon`.
   - Mention juridique : « Electronic Transactions Act 2000 — Maurice ».

### APIs
- `GET /api/rh/contrats?employe_id=X` (837).
- `POST /api/rh/contrats/[id]/signer` `{ action: "signer_self" }` (866).
- `GET /api/rh/contrats/[id]/pdf` (931).

### Logique de signature côté backend
`app/api/rh/contrats/[id]/signer/route.ts:117-158` (action `signer_self`) :

1. `user = await supabase.auth.getUser()` — 401 sinon.
2. Récupère `contrats_employes[id]` → `employe_id`.
3. Récupère `employes[employe_id]` → `auth_user_id`, `email`.
4. `isSelf = (emp.auth_user_id === user.id || emp.email === user.email)` — 403 sinon.
5. Refus si `statut === 'signe'` (déjà contresigné) ou
   `statut === 'signe_employe'` (double signature).
6. Update : `statut='signe_employe'`, `date_signature_employe=now()`,
   `ip_signature_employe = x-forwarded-for`, purge des tokens.

**Bonne pratique observée** : cette route applique le pattern "isSelf"
attendu (voir 03-auth-model §6). À prendre comme référence pour les
autres endpoints self-service.

### État fonctionnel
- ✅ Logique de signature côté API correcte et authentifiée.
- ✅ Capture de l'IP signataire (`x-forwarded-for`) — utile en preuve.
- ✅ Protection contre la re-signature (409 si déjà signé / en attente
  contresignature).
- 🔴 **`dangerouslySetInnerHTML` sur `html_content` et
  `html_content_modified`** (961) : si un utilisateur RH peut injecter
  du HTML dans ces champs (via l'éditeur de contrats) sans
  assainissement, il injecte un XSS persistant exécuté dans la session
  d'un salarié connecté. À vérifier côté `/rh/contrats` et côté
  schéma DB. Voir 06 et 08.
- ⚠️ `signature_image_dirigeant_url` affichée en `<img src>` sans
  CSP explicite : risque de tracking pixel si l'URL est externe.
- ⚠️ Pas d'empreinte (hash) du contenu HTML au moment de la signature ;
  l'employeur peut modifier `html_content_modified` après signature —
  valeur probatoire réduite. À confirmer avec les workflows RH.
- ⚠️ Le PDF servi par `/api/rh/contrats/[id]/pdf` doit lui aussi
  vérifier `isSelf` (route non lue dans ce passage) — à tracer.

### Risques
- `P0` — XSS via `dangerouslySetInnerHTML` si les champs
  `html_content[_modified]` ne sont pas assainis (DOMPurify ou policy
  stricte côté insertion).
- `P0` — Intégrité du contenu signé : hash SHA256 au moment du
  `signer_self` (ou snapshot immuable) à implémenter pour la valeur
  probatoire Electronic Transactions Act.
- `P1` — PDF endpoint : confirmer `isSelf` sur `/api/rh/contrats/[id]/pdf`.
- `P2` — UX : aucun indicateur "nouveau contrat à signer" sur le
  dashboard ; un salarié peut ignorer qu'il a un contrat en attente.

---

## Fin de la trilogie 04
Les 10 onglets sont documentés :
- 04a : Dashboard, Ma fiche, Bulletins, Planning.
- 04b : Primes, Congés, Documents, Trajets.
- 04c : Ma santé (TIBOK), Mes contrats.

Consolidation des risques → `06-risques-conflits.md`.
Agrégation transverse RH → `05-dependances-rh.md`.
