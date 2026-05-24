# AUDIT 1 — PUBLIC + AUTH + SYSTÈME (16 URLs)

> Auditeur : Agent 1
> Date : 2026-05-24
> Branche : `claude/kind-mccarthy-zknYB`
> Périmètre : pages publiques marketing, légal, auth, redirect, profil, onboarding initial.

## Synthèse
- **Note moyenne : 7.3/10**
- **URLs fonctionnelles : 14/16** (deux pages publient des CTA cassés)
- **URLs avec mocks / placeholders : 2** (`/login` legacy, `/tarifs` footer)
- **URLs cassées (lien mort sur la page) : 2** (`/login` → `/dashboard`, `/ohada` → `/contact`)
- **Top 3 problèmes critiques :**
  1. `app/login/page.tsx` existe en **doublon mort** de `app/auth/login/page.tsx` — formulaire HTML sans onSubmit, bouton CTA `<Link href="/dashboard">` (route inexistante). Risque SEO + UX : un crawler ou un utilisateur arrivant via cet ancien lien atterrit sur un faux login.
  2. `app/ohada/page.tsx` pointe vers `/contact` (404) et `/admin/ohada` (route privée admin) depuis une page publique. CTA principal cassé.
  3. `app/profil/page.tsx` ne fait **aucun redirect d'auth** : si `/api/profil` renvoie 401, la page set `loading=false` et reste affichée avec un profil partiel `null`. Les badges/sections échouent silencieusement au lieu de rediriger vers `/auth/login`.

---

## /  (`app/page.tsx`)
**Note : 9/10**
- Existence : ✅ Compile, 2038 lignes, hautement designée (Reveal, ParticleField, BrainOrb3D…).
- Données : i18n via `lib/i18n` (FR/EN), données affichées 100% statiques marketing + un widget `LiveEconomicWidget` qui consomme `/api/public/economic-snapshot`.
- Actions : tous les CTAs branchés (`/inscription`, `/auth/login`, `/tarifs`, `/pilotage-telegram`, `#features`…). Menu mobile fonctionnel via Radix Sheet.
- Mocks : aucun TODO ; AnimatedCounter affiche `6` (agents) et `100%` (MRA) — chiffres marketing assumés, pas un mock technique.
- États : pas de loading/error states nécessaires (page statique). Le widget économique gère son propre fallback.
- Justification note : page extrêmement soignée (responsive, dark hero, AAA contrast §6, focus a11y `aria-label`, scroll progress). Seul point faible : 2038 lignes dans un single client component — devrait être éclatée en sections (hero, features, ai-section, telegram, cta…) pour Tree-shaking + lazy loading et maintenabilité.
- Modifs recommandées :
  - [M] Splitter `app/page.tsx` en sous-composants serveur + lazy client islands (perf, FCP).
  - [L] Vérifier que `LiveEconomicWidget` ne provoque pas de layout shift au mount.
  - [L] Ajouter `metadata` (title/description/openGraph) côté server component parent — actuellement page entière en `"use client"`, donc le `<title>` est par défaut.

---

## /login  (`app/login/page.tsx`)
**Note : 1/10**
- Existence : ✅ Compile (63 lignes), mais c'est un **fossile** doublon de `/auth/login`.
- Données : aucune — formulaire statique.
- Actions : ❌ Le bouton "Sign in" est `<Link href="/dashboard">` — `/dashboard` n'existe PAS dans `app/`. Le formulaire `<form>` n'a aucun handler. Saisir email/password n'a aucun effet. Le lien "contactez votre RH" pointe vers `href="#"`.
- Mocks : tout est mock — placeholder `name@company.com`, "••••••••".
- États : aucun (loading/error absents).
- Justification note : page **trompeuse pour l'utilisateur**. Existe encore dans la routing, indexable. Boutons inopérants = pire qu'un 404.
- Modifs recommandées :
  - [H] **Supprimer le fichier** `app/login/page.tsx` ou le transformer en redirect serveur `redirect('/auth/login')`.
  - [H] Vérifier qu'aucun autre code interne ne référence `/login` (préférer `/auth/login`).

---

## /auth/login  (`app/auth/login/page.tsx`)
**Note : 9/10**
- Existence : ✅ 141 lignes, propre, focused.
- Données : aucune table chargée, l'authent passe par `supabase.auth.signInWithPassword`.
- Actions : ✅ `handleSubmit` branché, redirection `window.location.href = "/redirect"` (qui dispatch par rôle). Switch langue FR/EN fonctionnel. Lien "S'inscrire" vers `/inscription`. Bouton "Retour à l'accueil" vers `/`.
- Mocks : aucun. Le message "Mot de passe oublié" est volontairement non-cliquable (décision produit : reset par RH, commentaire inline du code).
- États : loading + error states gérés, messages d'erreur localisés (`error_invalid`, `error_email`, `error_generic`).
- Justification note : implémentation correcte, sobre, i18n. Pas de captcha / rate-limit côté Supabase visible.
- Modifs recommandées :
  - [M] Activer un vrai flux "reset password" — actuellement le label "forgot" n'est qu'un texte informatif. Alternative : afficher un mailto vers RH ou un modal d'instructions.
  - [L] Sur succès, `window.location.href = "/redirect"` provoque un full page reload — préférer `router.push('/redirect')` puis laisser le RedirectPage gérer (sauf si volontaire pour purger le state). Documenter le choix.
  - [L] Ajouter un attribut `autoComplete="current-password"` + `autoComplete="username"` pour les password managers.

---

## /inscription  (`app/inscription/page.tsx`)
**Note : 8.5/10**
- Existence : ✅ 515 lignes, wizard 3 étapes (profil → infos → plan) + écran success.
- Données : `GET /api/plans?type=dirigeant|comptable` (route Supabase admin réelle). Submit → `POST /api/inscription` (route avec validation, anti-doublon, insert `demandes_inscription`, envoi email Resend prospect + admin).
- Actions : tous les boutons sont câblés (transitions d'étape, submit JSON, retour étape, CGU/CGV toggles obligatoires, mailto contact en succès).
- Mocks : ❌ Aucun. Endpoints API réels et fonctionnels.
- États : loading plans, loading submitting, errors affichés en bannière rouge top-card, écran success avec email de confirmation et `mailto:` fallback.
- Justification note : workflow complet et abouti. Validation email regex côté client + serveur. IP/UA capturés côté serveur pour audit. Anti-doublon par statut `en_attente`. Petits points : i18n FR uniquement (toute la page est en français hardcodé, contraire au reste du site bilingue).
- Modifs recommandées :
  - [M] Ajouter le **support EN** (toute la page contient des chaînes FR hardcodées — `"Quel est votre profil ?"`, `"Continuer"`, etc.). Inconsistant avec `/` et `/auth/login`.
  - [M] Pré-charger `setLoadingPlans(true)` au début du `useEffect` pour éviter le "saut" d'affichage si plans = [].
  - [L] La query `?role=expert` (footer/tarifs) est référencée ailleurs mais le wizard ne lit pas `useSearchParams()` pour pré-sélectionner `type='comptable'`. Ajouter ce pré-fill.

---

## /tarifs  (`app/tarifs/page.tsx`)
**Note : 6.5/10**
- Existence : ✅ Compile (1882 lignes). Page très lourde, multi-sections.
- Données : 100% statique. Prix hardcodés dans les constantes `frTexts`/`enTexts`. Pas d'appel à `/api/plans`.
- Actions : CTAs principaux pointent **tous vers `/auth/login`** au lieu de `/inscription` (le wizard d'inscription est la vraie page de signup). Footer dispose d'une map `footerLinkHref` qui mappe des labels statiques vers des routes ; certains pointent vers `/#features` (existant), d'autres vers `mailto:contact@lexora.finance`.
- Mocks : aucun TODO mais : Footer liens `"Sécurité" → /protection-donnees`, `"Support" → mailto` — OK. En revanche, "Sécurité"/"Bien-être"/"Téléconsultation" pointent tous vers la même ancre `/#features` (recyclage paresseux).
- États : pas de loading nécessaire (page statique).
- Justification note : visuel premium + i18n FR/EN complet. Mais :
  1. La page **duplique la source de vérité prix** (devrait lire `/api/plans` pour cohérence avec `/inscription`).
  2. Les CTAs `"Démarrer"` / `"Voir une démo"` vont vers `/auth/login` au lieu de `/inscription` — confus pour un nouveau prospect.
  3. Footer liens "recyclés" donnent l'impression de pages dédiées qui n'existent pas.
- Modifs recommandées :
  - [H] Rediriger les CTAs hero/section "calcul" / "cta finale" vers `/inscription` (et pas `/auth/login`). `/auth/login` est pour les utilisateurs existants.
  - [M] Charger les plans depuis `/api/plans` plutôt que hardcoder. Sinon la moindre modif prix nécessite un redéploiement et un risque d'incohérence avec le wizard.
  - [L] Créer de vraies ancres ou pages dédiées (Bien-être, Téléconsultation) ou retirer ces labels du footer pour éviter le "fake link".

---

## /cgu  (`app/cgu/page.tsx`)
**Note : 9.5/10**
- Existence : ✅ 146 lignes, structurée en 12 sections via `<LegalShell>` + `<LegalSection>`.
- Données : 100% i18n via `lib/i18n/public.ts` (clés `pub.cgu.*`, FR + EN vérifiées présentes lignes 70 + 509).
- Actions : aucune (page légale statique). Email `contact@lexora.finance` cliquable.
- Mocks : aucun. Coordonnées société présentes (Digital Data Solutions Ltd, C20173522, VAT 27816949, +230 4687378).
- États : N/A statique.
- Justification note : conformité légale bien structurée, AAA, branding cohérent (`LegalShell` partagé avec `/cgv` et `/protection-donnees`). Couvre IA (s12), sécurité, PI, suspension.
- Modifs recommandées :
  - [L] Ajouter `export const metadata = { title: 'CGU — Lexora', ... }` car composant `"use client"` empêche d'avoir un `<title>` SEO propre.
  - [L] `dangerouslySetInnerHTML` partout — si les clés i18n sont éditables par admin un jour, prévoir un sanitizer (DOMPurify). Pour l'instant tout est côté code, OK.

---

## /cgv  (`app/cgv/page.tsx`)
**Note : 9.5/10**
- Existence : ✅ 154 lignes, même structure `LegalShell`.
- Données : i18n `pub.cgv.*` (FR + EN présents).
- Actions : email contact.
- Mocks : aucun. VAT + tel inclus.
- États : N/A.
- Justification note : identique à `/cgu`, qualité élevée.
- Modifs recommandées :
  - [L] Idem `/cgu` — ajouter `metadata`.
  - [L] Vérifier que la section paiement référence bien Stripe / virement / mode réel utilisé.

---

## /mentions-legales  (`app/mentions-legales/page.tsx`)
**Note : 9/10**
- Existence : ✅ 454 lignes, structure plus riche (hero custom + nav sticky + sections).
- Données : i18n `pub.ml.*` (vérifié lignes 255 + 694).
- Actions : retour accueil, mailto contact.
- Mocks : aucun. Identité complète : Digital Data Solutions Ltd, C20173522, VAT, adresse Grand Baie, OVH/Vercel pour hébergement (à vérifier dans le texte).
- États : N/A.
- Justification note : page plus designée que `cgu/cgv` (utilise son propre layout au lieu de `LegalShell`). Légère incohérence visuelle dans la suite légale, mais pas bloquant.
- Modifs recommandées :
  - [L] Migrer vers `LegalShell` pour cohérence visuelle avec `/cgu`, `/cgv`, `/protection-donnees`.
  - [L] Ajouter `metadata` SEO.

---

## /protection-donnees  (`app/protection-donnees/page.tsx`)
**Note : 9/10**
- Existence : ✅ 119 lignes, structure `LegalShell`.
- Données : i18n `pub.pd.*` (FR + EN présents).
- Actions : DPO mailto `dpo@lexora.finance`.
- Mocks : aucun.
- États : N/A.
- Justification note : RGPD-compliant : finalités, nature, consentement, sécurité, durée, droits, DPO, IA. Bien.
- Modifs recommandées :
  - [M] Ajouter une section spécifique "Cookies / Tracking" (actuellement absente — la home utilise des animations canvas/WebGL mais aucune mention cookies).
  - [L] `metadata` SEO.

---

## /ohada  (`app/ohada/page.tsx`)
**Note : 4/10**
- Existence : ✅ 147 lignes, server component (pas `"use client"`), `metadata` correctement déclaré.
- Données : 100% statique (liste des 18 pays inline).
- Actions : ❌
  - CTA principal "Voir la démo" → `/admin/ohada` — page **admin/privée** depuis une landing publique ! Soit ça crashe (unauthorized), soit ça redirige login. UX cassée.
  - CTA final "Demander une démo" → `/contact` — **route inexistante** (404 confirmé : `app/contact/` n'existe pas).
  - Lien interne `#features` OK.
- Mocks : tableau comparatif Sage X3 avec valeurs marketing (`'80-150k€'`, `'15-25k€'`) — assumé.
- États : N/A.
- Justification note : page bien rédigée, hors-charte (icônes emoji `🌍📊` au lieu de Lucide, gradients génériques bleu) mais les **deux CTA principaux sont cassés**. Page orpheline qui ne suit pas le design system du reste du site (pas de header dark navy, pas de `LexoraLogo`, pas d'i18n FR/EN).
- Modifs recommandées :
  - [H] Remplacer `href="/admin/ohada"` par `/inscription?source=ohada` ou `#features`.
  - [H] Remplacer `href="/contact"` par `/inscription` ou `mailto:contact@lexora.finance`.
  - [M] Refondre à la charte navy/gold avec `LegalShell` ou structure home (hero dark + sections).

---

## /help  (`app/help/page.tsx`)
**Note : 8.5/10**
- Existence : ✅ 89 lignes, server component statique, `metadata` propre.
- Données : `HELP_CATEGORIES` + `HELP_ARTICLES` depuis `@/content/help` (vérifié : 6 catégories `clotures, comptabilite, paie, premiers-pas, rapprochement, tva` + `index.ts`).
- Actions : Cartes catégorie + 6 articles populaires linkés correctement.
- Mocks : `// TODO i18n: server component — strings are static FR.` (commentaire explicite).
- États : N/A.
- Justification note : architecture propre (content-driven, MDX-like via `article-shell.tsx`). `generateStaticParams` utilisé sur les sous-routes pour le SSG.
- Modifs recommandées :
  - [M] Implémenter l'i18n (clés `pub.help.*` mentionnées dans le TODO comme existantes).
  - [L] Ajouter une recherche client-side (filtre fuzzy sur articles).

---

## /help/[category]  (`app/help/[category]/page.tsx`)
**Note : 8/10**
- Existence : ✅ 57 lignes, server component avec `generateStaticParams` + `generateMetadata`.
- Données : `getCategory`, `getArticlesByCategory` (helpers content/help).
- Actions : Liens vers articles, breadcrumb.
- Mocks : `// TODO i18n` même commentaire.
- États : `notFound()` natif Next.js si catégorie inconnue.
- Justification note : SSG correct, breadcrumb, fallback "Aucun article". Simple et fonctionnel.
- Modifs recommandées :
  - [M] i18n (TODO existant).
  - [L] Afficher un sous-comptage d'articles (ex: 3/6 articles dans la catégorie).

---

## /help/[category]/[slug]  (`app/help/[category]/[slug]/page.tsx`)
**Note : 8.5/10**
- Existence : ✅ 63 lignes, server component avec `generateStaticParams` sur tous les articles.
- Données : `getArticle` → `article.Component` rendu comme React component.
- Actions : Breadcrumb, articles liés.
- Mocks : aucun.
- États : `notFound()` si inconnu.
- Justification note : très propre. Le pattern "Component" embarqué dans l'article permet un MDX-like sans dépendance MDX.
- Modifs recommandées :
  - [M] i18n.
  - [L] Ajouter "Dernière mise à jour" / `updatedAt` par article (faire en sorte que `HelpArticle` ait ce champ et l'afficher sous le `readingTime`).

---

## /redirect  (`app/redirect/page.tsx`)
**Note : 9/10**
- Existence : ✅ 71 lignes.
- Données : `supabase.auth.getUser()` + `select role, employe_id from profiles`.
- Actions : dispatch par rôle via map `ROLE_DASHBOARD` (admin, super_admin, comptable, comptable_dedie, client_admin, client_user, client_assistant, rh, juridique, manager, team_leader, employe, direction, rh_manager, salarie). Auto-link employe via `/api/rh/employes/me` (fire-and-forget). Fallback `/client/tableau-de-bord` si rôle inconnu.
- Mocks : aucun.
- États : loader visuel pendant la résolution. Pas d'écran d'erreur explicite — en cas d'exception, redirect au fallback client.
- Justification note : robuste, défensif (`maybeSingle` au lieu de `single`, fallback employe via `employe_id`, fail-safe redirect). Commentaires inline expliquent les décisions.
- Modifs recommandées :
  - [M] Si `user` est `null`, redirect vers `/auth/login` — OK déjà fait. Mais si exception réseau Supabase, on tombe sur `/client/tableau-de-bord` qui re-redirect vers `/auth/login` → boucle potentielle si Supabase est down. Ajouter un état d'erreur avec bouton "Réessayer".
  - [L] Logger côté serveur (Sentry/console) les redirects vers le fallback pour repérer les rôles non mappés.

---

## /profil  (`app/profil/page.tsx`)
**Note : 6/10**
- Existence : ✅ 175 lignes.
- Données : `GET /api/profil` (Supabase server-side, retourne `{profile, email}`). Endpoint OK (50 lignes, auth check, `PATCH` whitelisté à `full_name, phone, avatar_url, preferences`).
- Actions : Save (PATCH), Logout (supabase signOut + redirect), Send password reset (`resetPasswordForEmail`). Bouton "Mon espace" → dashboard rôle.
- Mocks : aucun.
- États : ⚠️ Loader OK initialement. MAIS si l'API renvoie 401 (utilisateur non connecté), le code fait `setLoading(false)` sans `profile` et **affiche la page avec profile=null** → `(profile?.full_name || profile?.email || '?')[0].toUpperCase()` fonctionne avec le `?`, mais tout le reste affiche `—` ou vide. Pas de redirect auth.
- Justification note : fonctionnel pour un utilisateur connecté, mais zéro garde-fou pour non-auth. La page devrait soit être protégée par middleware, soit rediriger en cas de 401.
- Modifs recommandées :
  - [H] Ajouter `if (res.status === 401) { window.location.href = '/auth/login'; return; }` dans le fetch initial OU s'assurer que `lib/supabase/middleware.ts` protège `/profil`.
  - [M] Le bouton "Send reset email" utilise `alert()` (peu UX). Remplacer par un toast Radix.
  - [L] Ajouter `redirectTo` à `resetPasswordForEmail` pour qu'après reset l'utilisateur revienne sur `/auth/login` du même domaine.

---

## /onboarding/soldes-ouverture  (`app/onboarding/soldes-ouverture/page.tsx`)
**Note : 8.5/10**
- Existence : ✅ 472 lignes, complexe mais bien documenté.
- Données :
  - `GET /api/comptable/societes` (liste sociétés accessibles)
  - `GET /api/onboarding/soldes-ouverture?societe_id=X` (charge société + date_debut_exercice)
  - `GET /api/onboarding/soldes-ouverture?societe_id=X&exercice=AAAA-AAAA` (check idempotence)
  - `POST /api/onboarding/soldes-ouverture` (RPC `enregistrer_soldes_ouverture` migration 301)
- Actions : Submit calcule lignes (banques 512x, clients 411, fournisseurs 401, immobilisations 2xx), construit le payload, gère 409 (déjà saisi).
- Mocks : aucun.
- États : loading, submitting, error, result, dejaSaisi, totaux (actif/passif/écart) calculés via `useMemo`. Alert destructive si déjà saisi.
- Justification note : très complet, idempotent côté serveur (`(societe_id, exercice)` unique). Calcul d'exercice automatique selon mois de début (juillet pivot). Affichage des écarts actif/passif en temps réel. Compose `<SoldeOuvertureCard>` réutilisable.
- Modifs recommandées :
  - [M] Si `nbLignesValides === 0`, désactiver visuellement le bouton submit (actuellement on attend l'erreur post-clic).
  - [M] Afficher en temps réel le détail des écritures qui SERONT créées (preview) avant le submit (debit/credit par compte).
  - [L] Brancher un "Save as draft" pour ne pas perdre la saisie si l'utilisateur rafraîchit (localStorage).

---

## Conclusion espace

### Forces
- **Auth & redirect** : `/auth/login` + `/redirect` forment un duo robuste avec dispatch rôle complet (15+ rôles mappés), fallback défensif, et i18n.
- **Inscription** : workflow 3-étapes complet et branché (API réelle, Supabase, emails Resend, audit IP/UA, anti-doublon). Production-ready.
- **Pages légales** (`/cgu`, `/cgv`, `/mentions-legales`, `/protection-donnees`) : excellente qualité, i18n FR+EN intégral, design system cohérent via `LegalShell`. Coordonnées société correctes (Digital Data Solutions Ltd).
- **Centre d'aide** (`/help` + sous-routes) : architecture content-driven SSG propre, `generateStaticParams`, breadcrumb, articles liés.
- **Home** (`/`) : extrêmement designée (3D, particles, motion, AAA contrast, responsive, mobile menu Sheet).
- **Onboarding soldes-ouverture** : un des écrans les plus aboutis — idempotent, temps réel, audit-ready.

### Faiblesses
- **Page `/login` zombie** : doublon mort de `/auth/login`, formulaire inerte, lien `/dashboard` mort. Source de confusion + risque SEO.
- **Page `/ohada` orpheline** : design hors-charte, CTA cassés (`/contact` 404, `/admin/ohada` page privée).
- **Page `/tarifs` désynchronisée** : prix hardcodés + CTA pointent vers `/auth/login` au lieu du wizard `/inscription`.
- **`/inscription` mono-langue** : tout en FR alors que le reste du site est bilingue. Incohérent pour un prospect anglophone.
- **`/profil` sans garde d'auth client** : affiche un shell vide si 401 au lieu de rediriger.

### Priorité de refonte (par criticité)
1. **[H — bloquant]** Supprimer ou rediriger `/login` → `/auth/login`. Corriger les 2 CTAs cassés de `/ohada`. Reroute CTAs `/tarifs` vers `/inscription`.
2. **[H — UX]** Ajouter garde-fou d'auth dans `/profil` (redirect si 401).
3. **[M — produit]** Refondre `/tarifs` pour consommer `/api/plans` (source unique de vérité, alignée sur `/inscription`).
4. **[M — i18n]** Compléter `/inscription` en EN + `/help` sous-routes (clés `pub.help.*` existent déjà selon TODO).
5. **[M — design system]** Migrer `/ohada` et `/mentions-legales` vers le pattern `LegalShell` ou la charte home navy/gold pour homogénéité.
6. **[L — perf]** Splitter `app/page.tsx` (2038 lignes single client component) en sous-composants/lazy islands.
