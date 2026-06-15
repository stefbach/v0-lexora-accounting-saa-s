# CONFIGURATION REPO & DIRECTIVES AGENTIQUES CRITIQUES (JS/TS MULTI-DOMAINS)

## 1. Raisonnement et Résolution de Problèmes
* Avant de modifier ou d'écrire du code, lance une réflexion invisible étape par étape (Chain of Thought).
* Identifie explicitement les dépendances, les cas limites (edge cases) et les impacts architecturaux globaux.
* Ne suppose jamais qu'une fonction externe ou une API marche sans vérifier sa signature ou son implémentation.
* Si une erreur survient, analyse la cause racine avant de proposer un correctif ; évite les patchs temporaires.

## 2. Standards de Code et Qualité (Anti-Slop)
* Produis un code modulaire, typé (TypeScript privilégié), propre et documenté selon les standards de l'industrie.
* Évite la sur-ingénierie : ne crée pas d'abstractions complexes si une solution simple existe.
* Reste concis : ne réécris pas un fichier entier si seule une fonction a besoin d'être modifiée.
* Assure-toi que chaque nouvelle fonctionnalité intègre une gestion des erreurs robuste (try/catch explicites).

## 3. Directives Métier Spécifiques

### A. Santé & Applications Médicales
* **Sécurité & Confidentialité** : Assure une traçabilité totale des flux de données et le strict respect du secret médical (normes type RGPD / HIPAA). Anonymise obligatoirement les données de santé.
* **Garde-fous Cliniques** : Ne permets jamais à l'application de poser un diagnostic définitif autonome. Formule systématiquement des clauses de non-responsabilité (disclaimers) et prévois une validation par un professionnel humain.

### B. Expertise Financière & Fintech
* **Précision Absolue** : Interdiction d'utiliser les nombres flottants natifs de JS pour les transactions. Utilise obligatoirement des bibliothèques de calcul à précision arbitraire (ex: `Big.js`, `Decimal.js`) pour éviter les erreurs d'arrondi boursières.
* **Conformité & Audit** : Tout calcul de taux, d'intérêt, de score de risque ou de flux monétaire doit être modulaire, explicite et auditable pour répondre aux exigences des régulateurs.

### C. Jeux Vidéo & Moteurs de Jeu
* **Séparation des Préoccupations** : Maintiens une étanchéité stricte entre la logique des données du jeu (State/Core) et la logique d'affichage ou d'interface (UI/Render).
* **Game Loop & Cycles** : Optimise la boucle de jeu (`requestAnimationFrame`). Prévois une gestion propre de l'état du jeu (pause, sauvegarde, gestion du delta-time pour la fluidité).

### D. Géospatial & Cartographie 3D (Type Google Earth)
* **Systèmes de Coordonnées** : Gère rigoureusement les projections géographiques (WGS84, Web Mercator EPSG:3857, coordonnées cartésiennes ECEF). Assure des conversions sans perte.
* **Streaming & Performance** : Implémente des structures d'arbres spatiales (Quadtrees / Octrees) pour le chargement dynamique des tuiles de terrain et des bâtiments 3D (LOD).
* **Anti-Jittering** : Utilise des techniques de "Floating Origin" ou double précision simulée en shader (WebGL/WebGPU) pour éviter les tremblements graphiques lors des zooms profonds.

### E. Biostatistiques & Algorithmes Lourds
* **Big Data** : Optimise le traitement des grands volumes de données cliniques ou démographiques (structures itératives performantes et parallélisation via les Web Workers).
* **Rigueur Scientifique** : Intègre des calculs statistiques certifiés (p-value, intervalles de confiance, régressions) en t'appuyant sur des bibliothèques scientifiques robustes.

## 4. Cycle de Test Automatisé et Validation (Self-Correction)
* Après chaque modification de code, exécute impérativement les tests unitaires via le terminal.
* Si aucun test n'existe pour la nouvelle fonctionnalité, crée le fichier de test correspondant avant de valider.
* En cas d'échec d'un test, applique la méthode "Analyse-Correction-Vérification" (Analyse des logs -> Correction -> Relance immédiate).
* Ne considère une tâche comme "Terminée" que lorsque 100% des tests du module passent avec succès.

## 5. Commandes et Écosystème du Projet
* Commande pour installer les dépendances : `npm install`
* Commande pour lancer les tests : `npm test`
* Commande pour vérifier les types / linting : `npm run lint`
* Commande pour lancer le projet en local : `npm run dev`
* **Technologies recommandées par domaine** : CesiumJS / Three.js (3D & Géo), Turf.js / simple-statistics (Stats), Big.js (Finance).
