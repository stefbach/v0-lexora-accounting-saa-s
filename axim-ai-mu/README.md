# AXIM AI MU

Scaffold Next.js 14 (App Router) + Supabase + Tailwind CSS + TypeScript,
prêt à déployer sur Vercel.

> **Note** : ce dossier a été généré de façon isolée, sans toucher au code
> existant du repo Lexora dans lequel il vit temporairement. Il est conçu
> pour être extrait vers son propre repo GitHub `axim-ai-mu`.

---

## Contenu

```
axim-ai-mu/
├── .env.example
├── .eslintrc.json
├── .gitignore
├── README.md                     ← ce fichier
├── middleware.ts                 ← refresh session Supabase à chaque request
├── next.config.mjs
├── package.json                  ← Next 14 + three.js + R3F + framer-motion
├── postcss.config.mjs
├── tailwind.config.ts            ← palette AXON + keyframes custom
├── tsconfig.json
├── vercel.json
├── app/
│   ├── globals.css
│   ├── layout.tsx                ← fonts Syne+Inter+JetBrains, OG metadata
│   ├── page.tsx                  ← landing AXON AI modernisée (3D+video)
│   ├── login/page.tsx            ← formulaire email + password / signup
│   ├── auth/callback/route.ts    ← OAuth / email-confirm callback
│   ├── auth/sign-out/route.ts    ← POST /auth/sign-out
│   └── protected/page.tsx        ← exemple page protégée
├── components/
│   ├── landing/
│   │   ├── Nav.tsx               ← nav glassmorphism sticky
│   │   ├── NeuralHero.tsx        ← hero + 3D neural (client, dynamic)
│   │   ├── Reveal.tsx            ← wrapper Framer Motion on-scroll
│   │   └── Sections.tsx          ← Promise/Agents/Proof/Process/CTA/Footer
│   ├── three/
│   │   ├── NeuralField3D.tsx     ← @react-three/fiber — réseau 3D + bloom
│   │   └── VideoBackground.tsx   ← bg vidéo/gradient animé + grille + noise
│   └── ui/button.tsx
├── hooks/use-user.ts
├── lib/
│   ├── utils.ts                  ← cn() helper
│   └── supabase/
│       ├── client.ts             ← createBrowserClient
│       ├── server.ts             ← createServerClient(cookies)
│       └── middleware.ts         ← updateSession()
├── types/database.ts             ← typed schema (regénérable)
└── supabase/migrations/
    └── 0001_initial_schema.sql   ← profiles + trigger + RLS
```

### Landing AXON AI — stack visuelle

- **3D** : `@react-three/fiber` + `@react-three/drei` + `three.js` 0.169
  - `components/three/NeuralField3D.tsx` — sphère de 120 nœuds en Fibonacci,
    arêtes tressées, signaux additifs en déplacement, bloom post-processing.
- **Background vidéo** : `components/three/VideoBackground.tsx` — 3 couches
  (orbes flottants, grille avec mask radial, noise SVG fractal). Slot `<video>`
  prêt à recevoir `/public/media/neural-loop.mp4` en uncomment.
- **Animations** : `framer-motion` pour reveals on-scroll + transitions.
- **Glassmorphism** : cartes `bg-white/[0.02]` + `backdrop-blur-xl` partout.
- **Typo** : Syne (display), Inter (body), JetBrains Mono (code/tags).

> Pour ajouter une vraie vidéo de fond, déposer `neural-loop.mp4` (≤ 2 Mo,
> 10s loop) dans `public/media/` et décommenter le bloc `<video>` dans
> `VideoBackground.tsx`.

---

## 1. Extraction vers un nouveau repo GitHub

Comme ce scaffold vit actuellement dans un sous-dossier du repo Lexora,
il faut le déplacer vers son propre repo.

### Option A — copie simple (recommandée)

```bash
# Depuis la racine du repo Lexora
cp -r axim-ai-mu ~/axim-ai-mu
cd ~/axim-ai-mu

git init
git add .
git commit -m "chore: initial scaffold — Next.js 14 + Supabase + Tailwind + TS"
git branch -M main
git remote add origin https://github.com/stefbach/axim-ai-mu.git
git push -u origin main

# Optionnel : créer branche develop
git checkout -b develop
git push -u origin develop
git checkout main
```

> Créez d'abord le repo **private** `stefbach/axim-ai-mu` sur
> https://github.com/new (avec "Initialize with README" **décoché**).

### Option B — `git subtree`

Si vous voulez garder l'historique git du scaffold :

```bash
# Depuis le repo Lexora
git subtree split --prefix=axim-ai-mu -b axim-ai-mu-split
cd ..
git clone --single-branch --branch axim-ai-mu-split \
  /path/to/v0-lexora-accounting-saa-s axim-ai-mu
cd axim-ai-mu
git remote set-url origin https://github.com/stefbach/axim-ai-mu.git
git branch -M main
git push -u origin main
```

---

## 2. Installation locale

```bash
cd axim-ai-mu
npm install
cp .env.example .env.local
# éditer .env.local avec les valeurs Supabase
npm run dev
# → http://localhost:3000
```

---

## 3. Supabase — création du projet

1. https://supabase.com/dashboard → **New project**
   - Name : `axim-ai-mu`
   - Region : Paris ou Francfort (proche UE/Maurice)
   - Password DB : générer + sauvegarder dans un gestionnaire de mots de passe

2. Une fois prêt (~2 min), récupérer dans **Project Settings → API** :
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`

3. Appliquer la migration initiale :
   - **SQL Editor → New query**
   - Copier-coller tout `supabase/migrations/0001_initial_schema.sql`
   - **Run**

4. Authentication → **URL Configuration** :
   - Site URL : `http://localhost:3000` (dev) puis le domaine Vercel
   - Additional redirect URLs : `https://<votre-domaine-vercel>/auth/callback`

5. Authentication → **Providers → Email** : activer "Confirm email" selon
   votre préférence.

---

## 4. Vercel — déploiement

### Via l'UI (plus simple)

1. https://vercel.com/new → **Import Git Repository**
2. Sélectionner `stefbach/axim-ai-mu` (autoriser l'app Vercel sur le repo si
   nécessaire)
3. Team : `bachs-projects-25b173f6`
4. Framework Preset : Next.js (auto-détecté)
5. Root Directory : `.`
6. **Environment Variables** (tous : Production + Preview + Development) :

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | votre Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (cochez "Encrypted") |
   | `NEXT_PUBLIC_SITE_URL` | `https://<domaine-vercel>.vercel.app` |

7. **Deploy**. Le premier build prend ~2 min.

### Via la CLI

```bash
npm i -g vercel
vercel login
cd axim-ai-mu
vercel link       # choisir team bachs-projects-25b173f6
vercel env add NEXT_PUBLIC_SUPABASE_URL production preview development
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production preview development
vercel env add SUPABASE_SERVICE_ROLE_KEY production preview development
vercel env add NEXT_PUBLIC_SITE_URL production
vercel --prod
```

---

## 5. CI/CD — push-to-deploy

Une fois Vercel lié au repo :
- push sur `main` → déploiement **Production**
- push sur `develop` ou PR → **Preview deployment** avec URL unique

Aucun GitHub Actions requis pour le déploiement de base.

---

## 6. Vérification post-déploiement

- [ ] L'URL de prod charge la home avec le bouton "Se connecter"
- [ ] `/login` permet de créer un compte → email de confirmation reçu
- [ ] Après confirmation, redirect vers `/protected` avec données user
- [ ] Dans Supabase → Table Editor → `profiles`, voir une ligne créée
      automatiquement (trigger `on_auth_user_created`)
- [ ] RLS activée sur `profiles` (Supabase affiche un cadenas vert)

---

## 7. Règles — à savoir

- `.env.local` est **ignoré par git** (cf `.gitignore`). Ne jamais le commit.
- `SUPABASE_SERVICE_ROLE_KEY` ne doit **jamais** apparaître côté client.
  Utiliser uniquement dans des Route Handlers / Server Actions.
- Toujours utiliser `supabase.auth.getUser()` (pas `getSession()`) pour
  vérifier l'auth côté serveur — c'est plus sûr car ça valide le JWT auprès
  de Supabase.

---

## 8. Prochaines étapes suggérées

- Générer les types DB typés : `npx supabase gen types typescript --project-id <ref> > types/database.ts`
- Ajouter shadcn/ui : `npx shadcn@latest init`
- Ajouter un provider OAuth (Google, GitHub) dans Supabase Auth
- Activer Vercel Analytics : `npm i @vercel/analytics`

---

## Stack

- **Next.js** 14.2 (App Router, Server Components)
- **React** 18.3
- **TypeScript** 5.6 (strict)
- **Tailwind CSS** 3.4
- **Supabase** — `@supabase/ssr` 0.5 + `@supabase/supabase-js` 2.45
- **Vercel** (déploiement, analytics ready)
