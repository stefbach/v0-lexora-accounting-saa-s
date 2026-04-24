# Audit OCR — Pipeline Relevés Bancaires Lexora

**Date** : avril 2026
**Scope** : pipeline complet upload PDF → OCR Claude → parsing → stockage → conversion MUR → écriture comptable
**Méthode** : audit statique du code TS et des prompts AI

## ⚠️ Résumé exécutif

L'audit révèle **3 findings CRITIQUES** dans le pipeline OCR qui peuvent créer des
écritures comptables avec des montants amplifiés × 46-55 (cause racine des bugs
observés en prod sur Digital Data : 641 à 200M MUR, 4330 à 13M MUR).

À corriger **avant d'élargir l'onboarding de nouvelles sociétés** — sinon chaque
nouveau client risque de reproduire les bugs qu'on a passé une session à nettoyer.

---

## A. Cartographie du flow

```
Client UI
   │
   v
POST /api/documents/upload
   │
   ├── isPdf → Claude Haiku 4.5 (quick classifier)
   ├── if releve_bancaire → SYSTEM_PROMPT_RELEVE_BANCAIRE (lib/ai/prompts.ts:318)
   │       max_tokens=128k, format JSON {banque, devise, lignes:[{date,libelle,debit,credit,...}]}
   │       ⚠ (F11) AUCUNE instruction sur format des nombres (1,234.56 vs 1.234,56)
   │       ⚠ (F2) "devise par défaut MUR" → hallucinations possibles
   │
   v
Parsing JSON + repair (Number(tx.debit), parseFloat(extraction.solde_cloture))
   ⚠ (F4) parseFloat locale-naive : parseFloat("1.234,56") = 1.234
   ⚠ (F5) Number("1,234.56") = NaN → tombe à 0 sans alerte
   │
   v
INSERT comptes_bancaires
   devise = extraction.devise || iban[-3:] || 'MUR'
   ⚠ (F3) iban[-3:] regex naïf → faux positifs sur IBAN UK/FR
   ⚠ (F10) devise NEVER updated après création initiale
   │
   v
INSERT releves_bancaires.transactions_json
   debit/credit stockés EN DEVISE D'ORIGINE (raw extraction)
   │
   v
GET /api/comptable/banque ou /api/comptable/rapprochement
   ├── enrichissement : devise = compte_bancaire.devise (PAS extraction.devise du relevé !)
   ├── multiplie par taux_change[devise]   → txAmountMUR
   │
   v
INSERT ecritures_comptables_v2 (journal=BNQ, debit_mur/credit_mur)
   ⚠ (F1) Si compte créé avec devise=MUR mais relevé était EUR → ×55 garanti
   ⚠ (F7) Aucun garde-fou sur txAmountMUR > 1M (pas de review humaine)
```

---

## B. TOP 11 Findings classés par sévérité

### 🔴 CRITIQUE

#### F1 — Mismatch devise compte vs devise relevé = ×55 garanti
**Fichiers** : `app/api/documents/upload/route.ts:1446-1604` + `app/api/comptable/rapprochement/route.ts:368, 419, 1216`

**Détail** : le `compte_bancaire` a un champ `devise` figé à la création. Toutes les
transactions futures sont converties via `toMUR(txAmount, compteDeviseMap[releve.compte_bancaire_id])`.
Si la 1re création a mis `devise='MUR'` par défaut alors que le relevé était EUR,
chaque écriture BNQ est multipliée ×46.5 (taux EUR).

**Exemple** : transaction 1000 EUR → stockée `debit:1000`, compte marqué MUR →
BNQ débite 1000 MUR (sous-évalué). Inversement : compte EUR alors que relevé MUR
→ 1000 MUR → 46500 MUR.

**Fix** : à chaque insert de relevé, comparer `bankDevise` extrait avec
`existingBank.devise` ; si différent → bloquer + flag review humaine. Stocker
`devise` AU NIVEAU DE CHAQUE TRANSACTION dans `transactions_json`.

#### F2 — Fallback `'MUR'` silencieux masque l'échec d'extraction
**Fichier** : `app/api/documents/upload/route.ts:1446`

**Détail** : `const rawDevise = extraction.devise || ibanCurrency || 'MUR'`. Le
prompt dit pourtant "Ne PAS utiliser EUR par défaut. À Maurice, la devise par
défaut est MUR" (`lib/ai/prompts.ts:410`). Du coup Claude renvoie souvent
`devise:""` ou null pour les relevés CIC/Barclays EUR → fallback MUR → compte
créé en MUR → cause F1.

**Exemple** : relevé CIC France (EUR) sans tag explicite → compte créé devise=MUR
→ 12 mois de transactions EUR converties par 1, puis dashboard multiplie par taux
EUR au refresh → ×55.

**Fix** : si `extraction.devise` vide ET IBAN non-MU → rejeter en erreur, demander
confirmation utilisateur. Ne jamais fallback silencieusement vers MUR.

#### F3 — Regex IBAN currency suffix faux positif
**Fichier** : `app/api/documents/upload/route.ts:1445`

**Détail** : `extraction.iban?.match(/[A-Z]{3}$/)?.[0]`. Format IBAN standard ne
contient PAS de code devise en suffixe. MCB Maurice ajoute parfois `MUR` mais
c'est une convention locale. Un IBAN avec BIC concaténé type
`MU17BOMM0101101030300200000USD` matche `USD` même si le compte est EUR.

**Fix** : whitelist explicite `['MUR','EUR','USD','GBP']` ET vérification croisée
avec `extraction.devise`. Sinon ignorer.

### 🟠 HIGH

#### F4 — `parseFloat` locale-naïve sur soldes
**Fichier** : `app/api/documents/upload/route.ts:1449`

**Détail** : `parseFloat(extraction.solde_cloture)`. Si Claude restitue
`"1.234.567,89"` (format européen sur relevés CIC/BOV) → `parseFloat` = 1.234.
Solde compte créé à 1.23 MUR au lieu de 1 234 567 → impact sur trésorerie + alertes.

**Fix** : helper `parseAmount(s)` qui détecte le séparateur (last non-digit char) et normalise.

#### F5 — `Number(tx.debit)` accepte string et tombe à 0 sans alerte
**Fichiers** : `app/api/comptable/banque/route.ts:85-86`, `app/api/documents/upload/route.ts:686-687`, `app/api/comptable/rapprochement/route.ts:122`

**Détail** : `Number("1,234.56") = NaN`, `Number("1 234.56") = NaN`. Le `|| 0`
masque l'erreur silencieusement → transaction perdue, écart de solde non détecté
si plusieurs lignes touchées.

**Exemple** : relevé avec 5 transactions formatées `"50,000.00"` → toutes à 0 →
écart_solde = 250 000 mais aucun blocage car `lignes_manquantes` n'est pas
trigger (les lignes existent, juste les montants sont nuls).

**Fix** : `parseAmount()` strict qui throw sur format inconnu.

#### F6 — `lignes_manquantes` est juste un console.warn, pas un blocage
**Fichier** : `app/api/documents/upload/route.ts:707-731`

**Détail** : Quand `nbExtracted < nbExpected`, on ajoute `lignes_manquantes:true`
dans le JSON, mais on continue d'insérer dans `releves_bancaires` avec statut
`en_attente`. Aucune mise à jour de `documents.statut = 'erreur'`, aucune
insertion dans `alertes`.

**Fix** : si `lignes_manquantes` ou `Math.abs(ecart_solde) > 1` →
`documents.statut = 'erreur_ocr'` + INSERT dans `alertes` avec sévérité haute.

#### F7 — Aucune borne sur les montants en sortie
**Fichiers** : `app/api/comptable/rapprochement/route.ts:1216, 1370, 1502-1509`

**Détail** : Pas de check `if (txAmountMUR > SEUIL_REVIEW)` nulle part. Une
transaction de 50M MUR (= 1M EUR ×55 par bug F1) va se faire créditer 444/421
sans aucun blocage.

**Fix** : seuil par société (ex : 5× la moyenne mensuelle) → statut
`a_verifier_montant`, ne pas créer l'écriture v2 tant que pas validé humain.

### 🟡 MEDIUM

#### F8 — Devise transaction != devise compte non gérée
**Fichiers** : `lib/accounting/matching-engine.ts:20`, `app/api/comptable/rapprochement/route.ts:419`

**Détail** : Le moteur prend la devise depuis `compte_bancaire.devise`, ignore
totalement `tx.devise_origine` que le prompt RELEVE_BANCAIRE demande pourtant
d'extraire (`lib/ai/prompts.ts:394`). Une opération Forex sur un compte MUR
(paiement EUR débité en MUR sur compte MUR) sera reconvertie ×46.5 alors qu'elle
est déjà en MUR.

**Fix** : utiliser `tx.devise_origine || compteDevise` et lire
`tx.taux_change_applique` quand présent.

#### F9 — Continuation de prompt après `max_tokens` peut dupliquer transactions
**Fichier** : `app/api/documents/upload/route.ts:480-505`

**Détail** : Quand `stop_reason === 'max_tokens'`, on demande à Claude de continuer
en lui montrant les 500 derniers chars. Concaténation brute `bankText + contText`
puis `JSON.parse`. Si Claude ré-émet l'objet entier au lieu de la suite, on a un
JSON malformé + on tente une réparation → dans certains cas on peut conserver des
transactions doublées.

**Fix** : exiger un format strict `{transactions: [...]}` dans la continuation et
merge propre après parsing séparé.

#### F10 — Compte_bancaire devise figée, jamais re-validée
**Fichier** : `app/api/documents/upload/route.ts:1567-1579`

**Détail** : L'update existant n'inclut JAMAIS `devise` dans `bankUpdate`. Si le
1er relevé a misclassifié la devise, c'est définitif. Le matching `existingBank`
se fait sur `numero_compte` SANS contrainte de devise → un relevé EUR peut être
rattaché à un compte MUR du même numéro.

**Fix** : matcher `numero_compte + devise` ; si conflit devise → créer un nouveau
compte (multi-devise) plutôt que d'update silencieusement.

### 🟢 LOW

#### F11 — Aucune instruction au prompt sur format des nombres
**Fichier** : `lib/ai/prompts.ts:318-454`

**Détail** : le prompt RELEVE_BANCAIRE n'impose pas `"format numérique : point
décimal, sans séparateur de milliers"`. Claude peut renvoyer 1,234.56 ou
1.234,56 selon la mise en page du PDF (CIC France utilise virgule décimale).

**Fix** : ajouter dans le prompt :
```
Tous les montants doivent être des nombres JSON valides : PAS de séparateur de
milliers, point décimal uniquement (ex : 1234.56, JAMAIS 1,234.56 ni 1.234,56).
```

---

## C. 3 Recommandations prioritaires

### Reco 1 — Stocker `devise` au niveau de chaque transaction
Stocker `transactions_json[i].devise` extraite directement par Claude, et arrêter
de relire `compte_bancaire.devise` au moment du rapprochement. La devise du
compte n'est pas nécessairement la devise de toutes les opérations (Forex,
virements internationaux). **Neutralise F1, F8, F10 d'un coup.**

### Reco 2 — Gate de validation "amount sanity" entre OCR et insertion écriture
- `parseAmount()` strict qui throw au lieu de tomber à 0
- Bornes par société (`if amount_mur > 5 * mean_monthly_volume → review`)
- Blocage dur si `lignes_manquantes || ecart_solde > 1 || extraction.devise vide`

Le document reste `statut='erreur_ocr'` tant qu'un humain n'a pas validé. **Les
fixes en aval ne rattraperont jamais un OCR raté.**

### Reco 3 — Renforcer le prompt RELEVE_BANCAIRE
- Exiger `devise` non-vide (sinon retourner `_extraction_failed:true`)
- Format numérique strict (point décimal, pas de séparateur)
- Exiger `devise_origine` + `montant_origine` pour CHAQUE transaction
- Ajouter une auto-vérification :
  `Σ(debit-credit) == solde_ouverture - solde_cloture` avec tolérance 1 unité,
  sinon retourner `lignes_manquantes:true`

---

## Fichiers clés à corriger

| Priorité | Fichier | Lignes |
|---|---|---|
| 🔴 | `app/api/documents/upload/route.ts` | 1442-1500, 1570-1610, 686-700, 1449 |
| 🔴 | `app/api/comptable/rapprochement/route.ts` | 358-370, 419, 1216, 1370, 1502 |
| 🟠 | `app/api/comptable/banque/route.ts` | 85-86, 130-141 |
| 🟠 | `lib/ai/prompts.ts` | SYSTEM_PROMPT_RELEVE_BANCAIRE ligne 318+ |
| 🟡 | `lib/accounting/matching-engine.ts` | toMUR, ligne 20 |
| 🟡 | `lib/taux-change.ts` | convertToMUR ligne 273 |
| 🆕 | `lib/utils/bank-utils.ts` | ajouter `parseAmount()` locale-aware |

---

## Effort estimé pour corriger les 3 CRITIQUES + Reco 1

**~2-3 jours de dev focus** :
- Reco 1 (devise par tx) : 1j (modif schéma + prompt + matching engine + rapprochement)
- F1+F2+F3 (devise compte) : 0.5j (validation à la création + rejet sur conflit)
- F4+F5 (`parseAmount()`) : 0.5j (helper + remplacements)
- F6+F7 (gates de blocage) : 0.5j
- Tests d'intégration : 0.5j

À faire **avant d'onboarder + de 5 nouvelles sociétés** sinon les bugs se reproduiront.
