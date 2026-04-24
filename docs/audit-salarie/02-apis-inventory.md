# 02 — Inventaire des APIs appelées par l'Espace Salarié

> Extraction exhaustive des `fetch(...)` présents dans
> `app/salarie/page.tsx`. Réf. ligne = fichier `page.tsx`.

## 1. Résumé

- **11 endpoints distincts** consommés.
- **Aucun endpoint `/api/salarie/*`** : tout passe par `/api/rh/*`.
- **Un seul endpoint "self"** dédié : `/api/rh/employes/me`. Tous les autres
  exposent une API "admin/RH" et reçoivent un `employe_id` explicite en
  query — l'API est donc **à la charge du client** pour ne pas taper sur
  un autre employé (voir risques en §4).

## 2. Endpoints consommés

### 2.1 `/api/rh/employes/me`
| Méthode | Verbes impl. | Appelé par | Ligne |
|---|---|---|---|
| GET | `route.ts:24` | chargement initial | 1094 |
| PATCH | `route.ts:105` | `MaFicheTab.handleSave` | 52 |

PATCH body (whitelist) :
`mobile, telephone, email, adresse, adresse2, ville, code_postal,
date_naissance, genre, statut_marital, nationalite, bank_name,
bank_account, iban`.

### 2.2 `/api/rh/conges`
| Méthode | Query | Usage | Ligne |
|---|---|---|---|
| GET | `?action=balances&employe_id=X` | Soldes (CA, maladie…) | 228, 1104 |
| GET | `?employe_id=X` | Liste des demandes | 229, 1106 |
| POST | `{ action: "creer", … }` (défaut) | Créer une demande | 256 |
| POST | `{ action: "annuler", id }` | Annuler sa demande | 291 |

Actions backend recensées (`route.ts`) : `balances`, `absents_today`,
`modifier_solde`, `modifier_demande`, `creer`, `approuver`, `refuser`,
`annuler`, `sick_retroactif`, `absence_injustifiee`.

Seules `creer`, `annuler`, et `balances`/liste sont appelées depuis
l'espace salarié.

### 2.3 `/api/rh/pointage`
| Méthode | Paramètres | Usage | Ligne |
|---|---|---|---|
| GET | `?date=YYYY-MM-DD&employe_id=X` | Pointages du jour | 1101 |
| POST | `{ action: "entree"|"sortie"|"pause_debut"|"pause_fin" }` | Clock in/out/pause | 1169 |

(Les actions sont inférées du payload construit autour de la ligne 1169 ;
voir fiche onglet Dashboard.)

### 2.4 `/api/rh/paie`
| Méthode | Query | Usage | Ligne |
|---|---|---|---|
| GET | `?action=list&employe_id=X` | Liste des bulletins du salarié | 1102 |
| POST | `?action=mark_read&bulletin_id=X` | Marquer bulletin comme lu | 1544 |

Actions backend totales : `list`, `calculer`, `calculer_batch`,
`modifier_employe`, `supprimer_bulletin`, `modifier_bulletin`, `valider`,
`valider_tous`, `verrouiller`, `deverrouiller`, `workflow_status`,
`mark_step`. La majorité ne doit pas être atteignable par un rôle salarié
(→ voir 06-risques).

### 2.5 `/api/rh/primes`
| Méthode | Query | Usage | Ligne |
|---|---|---|---|
| GET | `?type=saisie&employe_id=X` | Primes saisies pour le salarié | 1103 |

### 2.6 `/api/rh/planning`
| Méthode | Query | Usage | Ligne |
|---|---|---|---|
| GET | `?periode=YYYY-MM&societe_id=X&employe_id=X` | Planning du mois | 1105 |

Filtre `societe_id` + `employe_id` côté client — l'API doit vérifier
que l'`employe_id` demandé correspond bien à l'utilisateur connecté
(ou à son périmètre manager).

### 2.7 `/api/rh/trajets-km`
| Méthode | Payload | Usage | Ligne |
|---|---|---|---|
| GET | `?employe_id=X` | Liste des trajets | 645 |
| POST | body | Créer un trajet | 679 |
| POST `{method: "PUT"}` (HTTP POST avec override) | `{ id, … }` | Mettre à jour | 698 |
| POST `{method: "DELETE"}` | `{ id }` | Supprimer | 714 |

Les verbes PUT/DELETE semblent simulés via un body — à confirmer dans
la fiche onglet **Trajets**.

### 2.8 `/api/rh/contrats`
| Méthode | Query | Usage | Ligne |
|---|---|---|---|
| GET | `?employe_id=X` | Liste des contrats du salarié | 837 |

### 2.9 `/api/rh/contrats/[id]/signer`
| Méthode | Usage | Ligne |
|---|---|---|
| POST | Signer un contrat | 866 |
| GET | (impl. route.ts:204) — non appelé depuis salarie | — |

### 2.10 `/api/rh/annonces`
| Méthode | Usage | Ligne |
|---|---|---|
| GET | Liste des annonces entreprise | 1157 |

Aucun filtre `employe_id` : endpoint "broadcast". L'autorisation de lecture
dépend de la RLS (voir 03-auth-model).

### 2.11 *(indirect)* `/api/rh/employes/me` → `profiles` → `employes`
Le GET résout l'employé courant côté backend (via `auth.getUser()` puis
`profiles.employe_id`). C'est le seul endroit où **le client ne passe
pas** d'`employe_id` explicite.

## 3. Endpoints RH NON consommés par l'espace salarié

Présents côté backend mais non exposés dans l'UI salarié :

- `/api/rh/audit`
- `/api/rh/chat`
- `/api/rh/depart`
- `/api/rh/employes/import`
- `/api/rh/exports`
- `/api/rh/frais-km`
- `/api/rh/geolocalisation`
- `/api/rh/groupes`, `/api/rh/manager-groupes`
- `/api/rh/heures-sup`
- `/api/rh/import-paie`
- `/api/rh/jours-feries`
- `/api/rh/paie/{ai-rates,comptabiliser,import,parametres,pdf,validate}`
- `/api/rh/planning/regles`
- `/api/rh/pointage/[id]`, `/api/rh/pointage/recap-mensuel`
- `/api/rh/primes/regles`, `/api/rh/primes/[id]`
- `/api/rh/shifts`
- `/api/rh/societe`
- `/api/rh/conges/collectif`, `/api/rh/conges/entitlements`, `/api/rh/conges/[id]`
- `/api/rh/contrats/[id]/pdf`

Ils doivent tout de même être protégés contre les rôles `employe`/`salarie` :
→ voir `06-risques-conflits.md`.

## 4. Signaux à valider (prérequis P0)

Ces points deviennent des "to-check" prioritaires pour l'autre agent
(cf. `08-prerequis-p0-rh.md`) :

1. **Sur chaque endpoint recevant `employe_id` en query**, le backend
   vérifie-t-il que l'appelant est soit l'employé concerné, soit un
   rôle RH/manager autorisé ?
   (`/api/rh/conges`, `/pointage`, `/paie`, `/primes`, `/planning`,
   `/trajets-km`, `/contrats`.)
2. **Actions sensibles `/api/rh/paie`** (`valider`, `verrouiller`,
   `supprimer_bulletin`, `modifier_bulletin`, `modifier_employe`) :
   filtrage explicite par rôle côté route ?
3. **`/api/rh/conges` action `modifier_solde`** : jamais accessible à
   un simple salarié ?
4. **`/api/rh/trajets-km`** : le pattern POST avec `method: "PUT"` /
   `"DELETE"` dans le body — l'API vérifie-t-elle que le trajet ciblé
   appartient à l'appelant avant mutation ?
