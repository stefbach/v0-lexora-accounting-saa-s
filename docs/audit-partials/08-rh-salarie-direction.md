# Audit AGENT 8 — RH + Salarié + Direction + Juridique

**Périmètre** : 45 URLs (RH hub, Paie, Déclarations MRA, Planning/Pointage, Salarié, Direction, Juridique, Pilotage Telegram, Signature contrat)

**Stack** : Next.js 15 App Router, Supabase (tables `employes`, `bulletins_paie`, `conges`, `pointages`, `planning_shifts`, `declarations_mra_*`, `contrats`, `exits_prgf`, `severances`, `ias19_*`), React PDF, i18n (FR/EN).

**Moteur de paie** (`lib/rh/paie.ts`) : conforme Finance Act 2025-2026 + WRA 2019.
- CSG salarié 1,5 % (≤ 50 K) / 3 % (> 50 K)
- CSG patronal 3 % / 6 % progressif
- NSF 1 % salarié / 2,5 % patronal, plafond Rs 28 570 (effective 2025-07-01)
- Training Levy 1,5 % basic
- PRGF max(4,5 % émoluments ; Rs 4,50/jour)
- PAYE 0 / 10 / 20 % avec annualisation × 13, deux bases distinctes (base_csg_nsf = basic, base_paye = basic + allowances), prorata absence intégré

---

## 1. RH Hub

### `/rh` — `app/rh/page.tsx` (991 l.)
Dashboard 6 onglets (dashboard, pointages, absences, primes, paie, paramètres). Widgets `MraDeadlineAlert`, `DocumentsEnAttenteWidget`, `EoyBonusWidget`, `IAS19ProvisionWidget`, `IAS19EoyProvisionWidget`, `DeclarationsMraWidget`. Charts recharts, animations counter, multi-sociétés. Data branchée `/api/rh/paie`, employes, conges. **9/10** — Modifs : L (clean up des onglets vs `/rh/manager`).

### `/rh/manager` — `app/rh/manager/page.tsx` (322 l.)
Dashboard manager/team_leader avec groupes, pointage du jour, soldes congés. Multi-sociétés + auto-detect groupe du manager. **8/10** — Modifs : L.

### `/rh/societe` — `app/rh/societe/page.tsx` (1 403 l.)
Paramétrage entité : adresses, RIB, ERN, registre, `PointageActifToggle`, signatures, logo. Champs sauvegardés via `onBlur` (UX fluide). **9/10** — Modifs : L.

### `/rh/employes` — `app/rh/employes/page.tsx` (1 626 l.)
Liste + création (form complexe : société, IBAN, NIC, TAN, primes fixes ×3, contrat, devise), bulk access, génération mdp, import XLSX. Banques Maurice (`BANQUES_MAURITIUS`). **9/10** — Modifs : L.

### `/rh/employes/[id]` — `app/rh/employes/[id]/page.tsx` (1 270 l.)
Fiche employé : tabs identité, contrat, paie, congés, documents, historique, protection légale. `ProtectionLegalePanel`, `DocumentsTabRH`. Ancienneté calculée. **9/10** — Modifs : L.

### `/rh/groupes` — `app/rh/groupes/page.tsx` (359 l.)
Création groupes + assignation employés + Team Leader (couronne). Endpoints `/api/rh/groupes` et `/api/rh/manager-groupes`. **9/10**.

### `/rh/annonces` — `app/rh/annonces/page.tsx` (256 l.)
Annonces internes (info/urgent/rh/celebration/rappel) avec visibilité et expiration. Dialog CRUD. **8/10**.

### `/rh/chat` — `app/rh/chat/page.tsx` (194 l.)
Assistant IA RH (renderMarkdown maison, pas de lib externe). Backend `/api/rh/chat`. **7/10** — Modifs : L (markdown lib).

### `/rh/juridique` — `app/rh/juridique/page.tsx` (940 l.)
Contrats internes employeur-employé. CRUD + statut (brouillon/signe_employe/signe/expire/resilie) + `ContractEditor` + signature en ligne via `/signer-contrat?token=`. Templates : `lib/rh/contratsTemplates.ts`. **8/10** — Modifs : L.

### `/rh/depart` — `app/rh/depart/page.tsx` (964 l.)
Fiche de sortie complète (preavis, certificat, exit statement PRGF, severance). PDF via `lib/rh/depart-pdf-shared.ts`. Branché vers `/rh/severance?employe_id=&date=`. **9/10** — Modifs : L.

### `/rh/severance` — `app/rh/severance/page.tsx` (468 l.)
Calcul indemnité licenciement WRA s.69-71 (motif justifié/non/restructuration). Deductions PRGF/pension/gratification. Sauvegarde + historique. `lib/rh/severance.ts`. **9/10**.

### `/rh/parametres` — `app/rh/parametres/page.tsx` (247 l.)
Hub navigation sous-modules (paie/congés/planning/société/jours fériés) + toggle pointage_actif inline. **8/10**.

---

## 2. Paie

### `/rh/paie` — `app/rh/paie/page.tsx` (1 358 l.)
**Page maîtresse**. 3 onglets (`bulletins`/`validation`/`historique`) sync URL. Calcul masse, génération bulletins, comptabilisation, PDF, workflow (`brouillon`/`valide`/`paye`/`declare_mra`), audit trail, `PaieValidationPanel`. Multi-sociétés, période avec mode personnalisé (25→24 ex.). Bandeau pointage_actif. **10/10**.

### `/rh/paie/parametres` — `app/rh/paie/parametres/page.tsx` (1 274 l.)
Configuration période paie + taux MRA + jours fériés liés. Champs `NumField` isolés (pas de re-render). **9/10**.

### `/rh/paie/primes` — `app/rh/paie/primes/page.tsx` (864 l.)
Primes fixes/variable/bonus/commission/meal/call/astreinte/night_shift. Import XLSX (`ImportPrimesDialog`). Section overtime. **9/10**.

### `/rh/paie/validation` — `app/rh/paie/validation/page.tsx` (15 l.)
Redirect → `/rh/paie?tab=validation`. **OK** (legacy preservation). **10/10**.

### `/rh/paie/edf` — `app/rh/paie/edf/page.tsx` (456 l.)
**Déclaration EDF annuelle** (Employer Declaration Form MRA). Totaux exercice FY (PAYE, CSG, NSF, Training Levy, PRGF). Référence MRA + date soumission. **PAS un doublon de eoy-bonus** (qui est le bonus de fin d'année salarié). **9/10**.

### `/rh/paie/exports-mra` — `app/rh/paie/exports-mra/page.tsx` (17 l.)
Redirect → `/rh/exports/paie`. **10/10**.

### `/rh/historique-paie` — `app/rh/historique-paie/page.tsx` (239 l.)
Historique par période, drill-down détails + écritures comptables associées. **8/10**.

### `/rh/import-paie` — `app/rh/import-paie/page.tsx` (437 l.)
Import bulletins externes (legacy migration). Mapping colonnes, preview, résultats. **8/10**.

### `/rh/salaires-compta` — `app/rh/salaires-compta/page.tsx` (232 l.)
Vue agrégée pour comptable : totaux salaires/charges par période. **7/10** — Modifs : L (peu interactive).

### `/rh/eoy-bonus` — `app/rh/eoy-bonus/page.tsx` (640 l.)
End-of-Year Bonus WRA s.27 (13e mois). Calcul + génération bulletins 75 % / 25 %. Lib `lib/rh/eoy-bonus.ts` + `eoy-bonus-bulletin.ts`. **9/10**.

### `/rh/provisions/conges` — `app/rh/provisions/conges/page.tsx` (519 l.)
**Provision IAS19** congés non pris. Snapshot mensuel + comptabilisation auto, charges patronales paramétrables (13 %). Lib `ias19-provisions.ts`. **9/10**.

### `/rh/provisions/eoy` — `app/rh/provisions/eoy/page.tsx` (509 l.)
**Provision IAS19** EOY (13e mois). Snapshot mensuel jusqu'à novembre (décembre bloqué — décaissement). Lib `ias19-eoy-provisions.ts`. **9/10**.

---

## 3. Déclarations / Exports

### `/rh/declarations-mra` — `app/rh/declarations-mra/page.tsx` (520 l.)
**Centrale MRA**. Calcul PAYE + CSG/NSF/Training Levy mensuel, sauvegarde, suivi paiement, deadlines. Lib `declarations-mra.ts`. Auth role `admin`/`rh`. **9/10**.

### `/rh/exports/paie` — `app/rh/exports/paie/page.tsx` (1 131 l.)
**Hub exports paie** avec 2 onglets : `virements` (formats bancaires Maurice : MCB BP-V1, SBM BizEdge, ABC, AfrAsia, MauBank, BankOne, ABSA, SCB, HSBC) + `mra` (PACO/PRGF NPS/CSG/PAYE). Endpoints `/api/rh/exports/{paco-mra,prgf-mra,csg-mra,paye-mra,virement}`. UTF-8 BOM géré (CSV) vs strict (txt MRA). **10/10**.

### `/rh/exports/virement` — `app/rh/exports/virement/page.tsx` (405 l.)
**Doublon partiel** : page dédiée virement uniquement (formats banques Maurice). Probablement legacy pré-fusion dans `/rh/exports/paie`. **6/10** — Modifs : M (envisager redirect).

### `/rh/exports-legaux` — `app/rh/exports-legaux/page.tsx` (297 l.)
**Registres S.116** (Hours, Salary, Leave, Overtime, Absence) format XLSX/PDF. Endpoint `/api/rh/exports/registre`. Réservé admin/rh. Lib `registres-s116.ts`. **9/10**. → **Pas un doublon** des exports paie (registres = obligation légale WRA).

### `/rh/prgf/exit-statements` — `app/rh/prgf/exit-statements/page.tsx` (410 l.)
PRGF Exit Statement (retraite/démission/décès) avec calcul retenu (dernier salaire / moyenne). Edit gratuity admin. **9/10**.

---

## 4. Planning / Pointage / Congés

### `/rh/planning` — `app/rh/planning/page.tsx` (2 377 l.)
Planning hebdo employés × jours, créneaux shift complexe (pause, OT), `PlanningShift` typé, conversion `Creneau`. Génération mensuelle, exports, validation. **9/10**.

### `/rh/planning/regles` — `app/rh/planning/regles/page.tsx` (522 l.)
Règles WRA légales (heures max, pause, jours consécutifs). `DEFAULT_REGLES_WRA`, presets UI, explications. **9/10**.

### `/rh/pointage` — `app/rh/pointage/page.tsx` (1 064 l.)
Pointages quotidiens, demi-congés, absent_justifie, en_conge. Sélection date, multi-employés. **9/10**.

### `/rh/pointage/mensuel` — `app/rh/pointage/mensuel/page.tsx` (518 l.)
Vue mensuelle calendrier avec coloration (OT, weekend/férié, absence injustifiée). Export. **8/10**.

### `/rh/conges` — `app/rh/conges/page.tsx` (2 744 l.)
**Page très complète**. AL/SL/UL/MAT/PAT/CAR/WI/COM/PH/ABS, eligibility WRA, cash-in-lieu, `JustificatifBouton`, calendrier joursOuvrables. Validation managers. **10/10**.

### `/rh/conges/parametres` — `app/rh/conges/parametres/page.tsx` (505 l.)
Configuration cycles, jours par cycle, paramètres maternité 14 sem, paternité 5j, etc. Endpoint config par type. **9/10**.

### `/rh/jours-feries` — `app/rh/jours-feries/page.tsx` (1 129 l.)
Jours fériés Maurice 2024-2026 (seed 15 fériés officiels), CRUD, gestion type (national/regional). **9/10**.

### `/rh/frais-km` — `app/rh/frais-km/page.tsx` (409 l.)
**Frais kilométriques validés** (tarif Rs/km — défaut 16). Workflow approbation. Approche **forfait/mensuel** (km déclaratif × tarif). **8/10**.

### `/rh/trajets-km` — `app/rh/trajets-km/page.tsx` (597 l.)
**Trajets GPS bruts** : voiture/moto/vélo, état en_cours/termine/valide/rejete. Approche **tracking automatisé**. → Complémentaire de `/rh/frais-km` (trajets = source, frais = consolidation/paiement). **Pas un vrai doublon, à clarifier UX.** **8/10**.

### `/rh/geolocalisation` — `app/rh/geolocalisation/page.tsx` (1 000 l.)
Carte Mauritius (Leaflet dynamic) positions employés temps réel + suggestions IA route/dispatch. **8/10**.

---

## 5. Salarié / Direction / Juridique / Telegram

### `/salarie` — `app/salarie/page.tsx` (364 l.) + `_components/tabs/*`
**Self-service complet** : MaFiche, Conges, Trajets, Contrats, Documents, Dashboard, Bulletins, Planning, Primes, Sante (10 onglets). Découpé en sous-composants. Pointage du jour, fetch `/api/rh/employes/me`. **9/10** — Pas du tout minimaliste, très complet.

### `/direction` — `app/direction/page.tsx` (177 l.)
Consolidation multi-sociétés : nb employés, masse salariale, CA, retards. Export management-accounts par société. CerveauTIBOK (IA) en panel. **8/10** — Modifs : L (densité d'info pourrait monter).

### `/juridique` — `app/juridique/page.tsx` (37 l.)
**Hub léger** : 4 cartes (contrats / documents / conformité / employés). Cartes `/juridique/documents` et `/juridique/conformite` semblent **non implémentées** (404 probables). **5/10** — Modifs : M (vérifier ces routes ou supprimer).

### `/juridique/contrats` — `app/juridique/contrats/page.tsx` (669 l.)
**Générateur contrats externes** (CDI/CDD/CDD_partiel/prestataire/client_saas/client_service/NDA) multi-juridictions (MU/MU+FR/CV), multi-langues, clauses requises + WRA references. → **Distinct de `/rh/juridique`** (qui est CRUD contrats employés signés). **9/10**.

### `/pilotage-telegram` — `app/pilotage-telegram/page.tsx` (481 l.)
**Landing/présentation** du Chief of Staff IA Telegram (agenda, emails, brief, OCR, pointage, contrats, comptabilité). → **Distinct de `/client/telegram-config`** (config technique/numero). Page commerciale + onboarding, pas de logique métier. **8/10**.

### `/signer-contrat` — `app/signer-contrat/page.tsx` (258 l.)
**Signature électronique opérationnelle** : URL `?token=&id=`, vérif token via `/api/rh/contrats/[id]/signer`, double POST signature + acceptation checkbox. États `pret/signe/deja_signe/erreur`. **9/10**.

---

## Verdict global

**Note moyenne pondérée : 8,6 / 10**

C'est le module le plus mature et complet de l'app. Le moteur de paie est aligné Finance Act 2025-2026 + WRA 2019, les exports MRA (PACO/PRGF/CSG/PAYE) et bancaires (9 banques Maurice) sont en place, les provisions IAS 19 (congés + EOY) sont branchées, le self-service salarié est riche.

### Top 3 highlights

1. **Moteur de paie de niveau production** (`lib/rh/paie.ts`) — Finance Act 2025-2026 implémenté avec doubles bases (csg_nsf vs paye), prorata absence, plafond NSF Rs 28 570, PAYE annualisé × 13. Documentation inline excellente.
2. **Exports MRA + bancaires complets** (`/rh/exports/paie`) — formats officiels BP-V1, BizEdge, PACO, PRGF, parseurs MRA strict (bom=false), registres S.116 (`/rh/exports-legaux`).
3. **Workflow paie end-to-end** (`/rh/paie`) — brouillon → validé → payé → déclaré MRA avec audit trail, PDF bulletins, comptabilisation, et `PaieValidationPanel` intégré dans la même page.

### Doublons / ambiguïtés détectés

| Suspicion | Statut réel |
|---|---|
| `/rh/paie/exports-mra` vs `/rh/exports/paie` vs `/rh/exports-legaux` | **Faux doublon**. `paie/exports-mra` est un **redirect** (17 l.) vers `/rh/exports/paie` (hub virements + MRA en 2 onglets). `/rh/exports-legaux` = registres S.116 WRA (obligation distincte). **OK.** |
| `/rh/eoy-bonus` vs `/rh/paie/edf` | **Faux doublon**. EOY = bonus 13e mois employé (WRA s.27). EDF = Employer Declaration Form annuelle MRA (totaux PAYE/CSG/NSF/TL/PRGF). **OK.** |
| `/rh/frais-km` vs `/rh/trajets-km` | **Doublon partiel**. Trajets-km = GPS brut, Frais-km = consolidation mensuelle Rs/km. Cohérent mais UX peu claire → **modif M : flow trajets → frais à matérialiser**. |
| `/rh/exports/virement` vs `/rh/exports/paie` (onglet virements) | **Vrai doublon**. La page autonome `/rh/exports/virement` (405 l.) fait double emploi avec l'onglet `virements` du hub. → **modif M : redirect ou suppression**. |
| `/rh/paie/validation` vs `/rh/paie?tab=validation` | **Redirect propre**. **OK.** |
| `/salarie` minimaliste ? | **Non**, 10 onglets self-service complets. |
| `/pilotage-telegram` vs `/client/telegram-config` | **Distinct**. Premier = landing produit, second = config technique. |
| `/juridique` hub | **2 liens cassés probables** (`/juridique/documents`, `/juridique/conformite` non implémentés). → **modif M**. |
| `/juridique/contrats` vs `/rh/juridique` | **Distinct**. Premier = générateur contrats (clients/CDI/CDD/NDA…), second = CRUD contrats employés signés. **OK.** |

### Modifs prioritaires

- **M** : `/rh/exports/virement` → soit supprimer/redirect vers `/rh/exports/paie?tab=virements`, soit clarifier la valeur ajoutée.
- **M** : `/juridique` → implémenter ou retirer les liens vers `/juridique/documents` et `/juridique/conformite`.
- **M** : flow `trajets-km → frais-km` à expliciter dans l'UI (étape de consolidation visible).
- **L** : `/rh/salaires-compta` peu interactif, peut être absorbé par `/rh/historique-paie`.
- **L** : `/rh/chat` markdown maison → migrer vers `react-markdown`.

### Tests non réalisés
Pas de test manuel navigateur (pas d'environnement). Tests recommandés : génération PDF bulletin, export CSV MCB BP-V1 (octets), workflow signature `/signer-contrat`, calcul severance avec gratuity/PRGF.
