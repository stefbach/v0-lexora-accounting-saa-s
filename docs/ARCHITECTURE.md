# Architecture — Lexora

Ce document décrit l'architecture technique de la plateforme Lexora.
Mise à jour : 2 mai 2026.

## 1. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────┐
│                        Navigateur (React 19)                      │
└───────────────┬──────────────────────────────┬───────────────────┘
                │ HTTPS / TLS 1.2+             │ Realtime WebSocket
                ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Next.js 16 (App Router) — Vercel                │
│  - RSC pages & layouts                                           │
│  - Route handlers (app/api/*)                                    │
│  - Middleware: refresh session Supabase                          │
└──────────┬─────────────────────────────────┬─────────────────────┘
           │ supabase-js (SSR + browser)     │ direct fetch
           ▼                                 ▼
┌──────────────────────────────────────┐  ┌─────────────────────────┐
│      Supabase (Frankfurt, EU)        │  │ Services tiers          │
│  - Postgres 15                       │  │  - Resend (e-mails)     │
│  - Auth (JWT + MFA TOTP)             │  │  - Anthropic (Clara)    │
│  - Storage (justificatifs, PDF)      │  │  - Stripe (paiement)    │
│  - Realtime (notifications)          │  │                         │
│  - RLS: isolation multi-tenant       │  │                         │
└──────────────────────────────────────┘  └─────────────────────────┘
```

## 2. Couche applicative (Next.js)

### Routing

Le routing utilise l'**App Router** de Next.js 16 :

- `app/page.tsx` — landing publique
- `app/(public)/legal/*` — pages légales
- `app/help/*` — centre d'aide
- `app/comptable/*` — espace comptable (authentifié)
- `app/client/*` — espace client (authentifié, rôle restreint)
- `app/salarie/*` — espace salarié (authentifié, rôle minimal)
- `app/rh/*` — espace RH / paie
- `app/direction/*` — tableaux de bord direction
- `app/admin/*` — administration plateforme
- `app/api/*` — route handlers (server-only)

### Composants

- `components/ui` — design system (Radix + Tailwind, shadcn/ui)
- `components/layout` — layouts (sidebars par rôle, footer public)
- `components/legal` — composants pages légales
- `components/accounting`, `components/rh`, `components/tva`, etc. — composants métier

### Server Components & Server Actions

Les Server Components sont par défaut ; les Client Components sont marqués
`"use client"` (formulaires, interactions). Les mutations passent par des
**Server Actions** ou des route handlers POST sous `app/api`.

## 3. Couche données (Supabase)

### Modèle multi-tenant

Chaque entité métier porte une colonne `tenant_id uuid not null` qui référence
la société propriétaire. Une **Row Level Security policy** est attachée à
chaque table :

```sql
create policy "tenant_isolation"
on public.invoices
for all
using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

Le `tenant_id` est injecté dans le JWT par un trigger Supabase Auth lors du
choix de la société courante par l'utilisateur (table `profile_companies`
liant `user_id` ⇄ `tenant_id` ⇄ `role`).

### Rôles

| Rôle              | Périmètre                                       |
| ----------------- | ----------------------------------------------- |
| `super_admin`     | Plateforme (administration cross-tenant)        |
| `admin_tenant`    | Tous les modules d'une société                  |
| `comptable`       | Comptabilité, TVA, clôtures, factures           |
| `rh`              | Paie, contrats, congés                          |
| `juridique`       | Documents légaux, signatures                    |
| `direction`       | Lecture seule + tableaux de bord                |
| `client`          | Espace client (lecture + dépôt de pièces)       |
| `salarie`         | Espace salarié (bulletins, congés, frais)       |

### Migrations

Les migrations SQL sont versionnées dans `supabase/migrations/`.
Convention : `YYYYMMDDHHMMSS_description.sql`.

## 4. Authentification

- **Supabase Auth** avec e-mail/mot de passe.
- **MFA TOTP** obligatoire pour les rôles `admin_tenant`, `comptable`, `rh`.
- **Magic links** disponibles pour l'espace salarié.
- Le middleware `middleware.ts` rafraîchit le cookie de session à chaque
  requête (recommandation Supabase SSR).

## 5. Stockage de fichiers

- Buckets Supabase Storage pour les pièces justificatives, bulletins, PDF.
- Politiques RLS Storage répliquant l'isolation `tenant_id`.
- Fichiers chiffrés au repos (AES-256, géré par Supabase).
- Signed URLs limitées à 5 minutes pour le téléchargement côté client.

## 6. Observabilité

- **Vercel Analytics** : métriques web (vitals, page views).
- **Audit logs** : table `audit_log` enregistrant les actions sensibles
  (création/modification d'écriture, changement de rôle, export de données).
- **Health check** : route `/api/health` consommée par le monitoring Vercel.

## 7. Sécurité

- HTTPS obligatoire, HSTS activé.
- Headers de sécurité (CSP stricte, X-Frame-Options DENY) configurés dans
  `vercel.json`.
- Pas de secret en clair côté client. Les clés `SUPABASE_SERVICE_ROLE_KEY` et
  `ANTHROPIC_API_KEY` sont strictement server-side.
- Rotation trimestrielle des clés API.
- Sauvegardes Supabase quotidiennes, conservées 30 jours (point-in-time
  recovery 7 jours).

## 8. Performance

- Server Components par défaut → bundle JS minimal côté client.
- Streaming SSR pour les pages dashboard.
- Images : `next/image` désactivé en mode optimisation (`unoptimized: true`)
  pour compatibilité avec l'export statique.
- Cache HTTP : `revalidate` configuré par route lorsque pertinent.

## 9. CI/CD

- Branches : `main` (production), `claude/*` (fonctionnalités assistées),
  `feature/*` (manuel).
- Pull request → tests Vitest + tsc → preview Vercel.
- Merge sur `main` → déploiement production automatique Vercel.
