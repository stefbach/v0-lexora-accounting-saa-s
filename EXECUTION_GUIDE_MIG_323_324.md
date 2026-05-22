# Guide d'Exécution — Migrations 323-324

## ⚡ OPTION 1: Exécution Rapide

### Prérequis ✅
- [ ] Migrations 319-322 déjà exécutées en Supabase
- [ ] Accès à Supabase SQL Editor
- [ ] Sauvegarde/snapshot recommandée (au cas où)

---

## 📋 ÉTAPE 1: Exécuter Migration 323 (Audit)

### 1️⃣ Ouvrir Supabase
```
https://supabase.com → Dashboard → SQL Editor
```

### 2️⃣ Copier le contenu de Migration 323

**Fichier:** `supabase/migrations/323_audit_complet_et_reclassement.sql`

(Contenu complet ci-dessous pour copie rapide)

### 3️⃣ Coller dans SQL Editor et exécuter

Cliquer **RUN** et attendre la fin.

### 4️⃣ Examiner les rapports

Vérifier les sorties des 10 sections d'audit:

```
=== AUDIT 1. EXISTENCE COMPTES 5800 & 455 ===
→ Montrer si comptes existent encore (doivent être vides/0)

=== AUDIT 2. BALANCE GLOBALE ACTUELLE ===
→ Doit montrer le déséquilibre actuel (~-151.27)

=== AUDIT 3. SOLDES BANCAIRES vs COMPTABLES ===
→ Montrer écarts entre soldes réels et comptables

=== AUDIT 4. VIREMENTS RÉELS DÉTECTÉS ===
→ Nombre et montant des virements inter-sociétés

=== AUDIT 5. VIREMENTS PAR SOCIETE & TYPE ===
→ Détail par DDS/OCC

=== AUDIT 6. ÉCRITURES SUSPECT ===
→ Comptes mal affectés

=== AUDIT 7. PROPOSITION RECLASSEMENT ===
→ Stratégie proposée

=== AUDIT 8. MONTANTS À RECLASSER ===
→ Montants exacts à reclasser par compte

=== AUDIT 9. IMPACT ESTIMÉ ===
→ Résumé des impacts

=== AUDIT 10. RECOMMANDATIONS ===
→ Prochaines étapes
```

**✅ Si tout semble bon → Passer à Étape 2**

---

## 📋 ÉTAPE 2: Exécuter Migration 324 (Reclassement)

### 1️⃣ Copier le contenu de Migration 324

**Fichier:** `supabase/migrations/324_reclasser_affectations_incorrectes.sql`

### 2️⃣ Coller et exécuter

Cliquer **RUN** et attendre.

### 3️⃣ Vérifier les résultats

Sections clés à vérifier:

```
=== BALANCE GLOBALE APRÈS RECLASSEMENT ===
→ DOIT être: 0.00 ✅

=== SOLDES PAR CLASSE APRÈS RECLASSEMENT ===
→ Classe 1: Réduit (Mig 322 réversée)
→ Classe 4: Avec 4411/4412/455 corrects
→ Classe 5: Banks (inchangé)

=== SOLDES COMPTES CLÉS APRÈS RECLASSEMENT ===
→ 455: Solde associé
→ 4411: Créances inter-sociétés
→ 4412: Dettes inter-sociétés

=== SOLDES BANCAIRES vs COMPTABLES ===
→ Écarts doivent être minimaux (~0.01)
```

---

## ✅ VALIDATION FINALE

Si Mig 324 est OK:

1. **Balance globale = 0.00** ✅
2. **Comptes 512 alignés** (écart < 0.01) ✅
3. **Comptes 4411/4412/455 créés** ✅
4. **Traçabilité via ref_folio** ✅

---

## 🔙 EN CAS DE PROBLÈME

### Si Audit (Mig 323) montre quelque chose d'inattendu:
```
❌ N'exécutez PAS Mig 324!
→ Examinez les rapports
→ Posez questions/clarifications
→ Créez Mig 325 si ajustements nécessaires
```

### Si Reclassement (Mig 324) échoue:
```
1. Vérifier le message d'erreur
2. Rollback possible (git revert le commit de Mig 324)
3. Créer Mig 325 avec ajustements
```

### Si balance ≠ 0 après Mig 324:
```
❌ Quelque chose est incorrect
→ Vérifier les logs Mig 324
→ Identifier la source du déséquilibre
→ Créer Mig 325 pour corriger
```

---

## 📊 SCRIPT COMPLET — Migration 323

```sql
-- COPIER TOUT DEPUIS supabase/migrations/323_audit_complet_et_reclassement.sql
```

**Taille:** ~1800 lignes

---

## 📊 SCRIPT COMPLET — Migration 324

```sql
-- COPIER TOUT DEPUIS supabase/migrations/324_reclasser_affectations_incorrectes.sql
```

**Taille:** ~1500 lignes

---

## 📝 CHECKLIST EXÉCUTION

### Avant Mig 323:
- [ ] Migrations 319-322 vérifiées comme exécutées
- [ ] Sauvegarde/snapshot effectuée
- [ ] Accès SQL Editor confirmé

### Après Mig 323:
- [ ] Audit reports examinés
- [ ] Aucune erreur SQL
- [ ] Montants de reclassement identifiés

### Avant Mig 324:
- [ ] Décision: APPROUVÉ pour reclasser
- [ ] Audit results acceptés

### Après Mig 324:
- [ ] Balance = 0.00 ✅
- [ ] Soldes bancaires alignés ✅
- [ ] Comptes 4411/4412/455 créés ✅
- [ ] Traçabilité vérifiée ✅

---

## 🎯 RÉSUMÉ

| Étape | Migration | Action | Résultat |
|-------|-----------|--------|----------|
| 1 | 323 | Audit (lecture seule) | 10 rapports analysés |
| 2 | 324 | Reclasser | Balance = 0.00 |
| 3 | Validation | Contrôle | Comptabilité saine |

---

## ❓ QUESTIONS AVANT EXÉCUTION?

Si vous avez des doutes:
1. Relire `AUDIT_RECLASSEMENT_STRATEGY.md`
2. Examiner les migrations SQL (fichiers 323-324)
3. Poser questions avant exécution

**Une fois OK → Lancer Mig 323 → 324 en séquence!** 🚀
