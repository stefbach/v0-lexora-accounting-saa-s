# Audit Complet & Stratégie de Reclassement (Mig 323-324)

## 📋 RÉSUMÉ EXÉCUTIF

**Votre intuition était correcte!** ✅ Le problème vient des **AFFECTATIONS INITIALES INCORRECTES**, pas des données bancaires.

Les migrations précédentes (319-322) ont supprimé des écritures sans résoudre la cause racine.

**Solution**: Reclasser les écritures vers les comptes corrects plutôt que de créer des contreparties artificielles.

---

## 🔍 DIAGNOSTIC: Qu'est-ce qui a disparu?

### Comptes supprimés:
- **5800** (Virements internes) ❌ — Utilisé incorrectement pour virements inter-sociétés
- **455** (Compte courant associé) ❌ — Utilisé incorrectement pour virements internes

### Pourquoi c'est un problème:
Ces comptes ne devaient pas être supprimés! Ils doivent être **RECRÉÉS avec les bonnes affectations**.

---

## 📊 MAUVAISES AFFECTATIONS IDENTIFIÉES

### ❌ Affectation 1: Virements DDS ↔ OCC sur 5800

**Ce qui s'est passé:**
```
Virement DDS → OCC:
  DR 5800 (Virements internes - MAUVAIS!)
  CR 512100 DDS

Virement OCC → DDS:
  DR 512100 OCC
  CR 5800 (Virements internes - MAUVAIS!)
```

**Ce qui devrait être:**
```
Virement DDS → OCC (DDS paie):
  DR 4412 (Dettes envers OCC) ← CORRECT
  CR 512100 DDS
  Journal: BNQ

Virement OCC → DDS (OCC reçoit):
  DR 512100 OCC
  CR 4411 (Créances sur DDS) ← CORRECT
  Journal: BNQ
```

### ❌ Affectation 2: Retraits d'associé sur 5800

**Ce qui s'est passé:**
```
Retrait associé:
  DR 5800 (Virements internes - MAUVAIS!)
  CR 512xxx Banque
```

**Ce qui devrait être:**
```
Retrait associé:
  DR 455 (Compte courant associé) ← CORRECT
  CR 512xxx Banque
  Journal: BNQ
```

---

## 📈 STRUCTURE COMPTABLE CORRECTE

### Pour deux sociétés **NON consolidées** avec mêmes actionnaires:

| Type | Société A (DR) | Société A (CR) | Société B (DR) | Société B (CR) |
|------|---|---|---|---|
| **Virement A→B** | 4412 (Dettes) | 512 (Bank) | 512 (Bank) | 4411 (Créances) |
| **Retrait Associé** | 455 (Current) | 512 (Bank) | — | — |
| **Journal** | BNQ | BNQ | BNQ | BNQ |

### Définition des comptes:

| Compte | Libellé | Usage |
|--------|---------|-------|
| **4411** | Créances inter-sociétés | Argent que votre entreprise attend de l'autre |
| **4412** | Dettes inter-sociétés | Argent que votre entreprise doit à l'autre |
| **455** | Compte courant associé | Argent de/vers les associés/partenaires |
| **5800** | Virements internes (TRANSIT) | ⚠️ SEULEMENT pour virements INTRA-SOCIÉTÉ (512100 → 512101) |

---

## 🔄 STRATÉGIE DE RECLASSEMENT (Mig 323-324)

### Phase 1: Migration 323 — AUDIT COMPLET
```
✓ Détecte les virements bancaires réels (source de vérité)
✓ Identifie les affectations incorrectes
✓ Calcule les montants à reclasser
✓ Propose la structure correcte
```

**Sortie**: Rapport d'audit avec propositions de reclassement

### Phase 2: Migration 324 — RECLASSEMENT RÉEL
```
✓ Crée écritures sur 4411/4412/455 avec montants corrects
✓ Préserve la double-entry (balance = 0)
✓ Traçable via ref_folio "RECLASSEMENT-324-"
✓ Valide les soldes bancaires vs comptables
```

---

## 📝 IMPACT PRÉVISIONNEL

### ✅ Avant Reclassement (État actuel après Mig 322):
```
Balance globale:  -151.27 MUR  ⚠️
Classe 1 (Capital):  -113,578.64  (dû à Mig 322)
Classe 4 (Dettes):  -3,005,773.93
Classe 5 (Banks):  113,578.64  ✓
Classe 6 (Charges):  13,020,997.92
Classe 7 (Revenus):  -10,015,375.26
```

### ✅ Après Reclassement (Mig 324):
```
Balance globale:  0.00  ✅
Classe 1 (Capital):  Réduit (Mig 322 réversée)
Classe 4 (Dettes):  Exact (4411/4412 correctes)
Classe 4 (Associés):  Correct (455)
Classe 5 (Banks):  Aligné avec réalité ✓
Classes 6-7 (P&L):  Inchangées
```

---

## 🎯 ACTIONS REQUISES

### Option 1: Exécuter les migrations immédiatement ✅ **RECOMMANDÉE**

```sql
-- Exécuter dans Supabase (dans l'ordre):
1. Migration 323 (audit - non destructive)
2. Migration 324 (reclassement - réversible via rollback)
```

**Avantages:**
- ✅ Résout le root cause (pas des symptômes)
- ✅ Structure comptable standard internationale
- ✅ Traçable et documenté
- ✅ Réversible si besoin
- ✅ Balance = 0 vérifiée

### Option 2: Audit d'abord (prudent)

1. Exécuter **SEULEMENT Mig 323**
2. Valider le rapport d'audit avec votre comptable
3. Si OK → Exécuter Mig 324
4. Si problèmes → Créer Mig 325 pour ajustements

---

## 📌 NOTES IMPORTANTES

### ⚠️ Avant exécution:
- [ ] Vérifier que Mig 319-322 ont été exécutées en Supabase
- [ ] Confirmer que c'est OK de modifier la structure comptable
- [ ] Garder trace des migrations pour audit

### ✅ Après exécution:
- [ ] Valider balance globale = 0
- [ ] Vérifier rapprochement bancaire 512 vs réalité
- [ ] Contrôler soldes 4411/4412/455 vs virements réels
- [ ] Générer rapport d'audit pour comptable

---

## 🔐 Traçabilité

Toutes les écritures reclassées auront:
- **ref_folio**: `RECLASSEMENT-324-<societe_id>-<compte_cible>`
- **journal**: `BNQ` (Virements/Banque)
- **description**: "Reclassement correct après audit (mig 324)"
- **created_at**: Timestamp automatique

Cela permet de:
- ✅ Tracer exactement ce qui a changé
- ✅ Reverser les changements si nécessaire (`git revert`)
- ✅ Auditer la transformation

---

## 📚 Références

| Fichier | Contenu |
|---------|---------|
| `321_solution_finale_conservative.sql` | Nettoyage (supprimé 5800/455) |
| `322_ecritures_ouverture_banques.sql` | Créé soldes d'ouverture (1101) |
| **`323_audit_complet_et_reclassement.sql`** | **← Audit identifie le problème** |
| **`324_reclasser_affectations_incorrectes.sql`** | **← Solution: reclasse les écritures** |

---

## ❓ Questions?

Si vous avez des doutes:
1. Exécutez Mig 323 (lecture seule, pas de changements)
2. Examinez les rapports d'audit
3. Posez des questions avant Mig 324
4. Exécutez Mig 324 une fois confirmé
