# Lexora — SaaS Comptable Maurice

**Lexora** est une plateforme SaaS de comptabilité, paie et gestion à destination
des entreprises mauriciennes. Elle couvre l'intégralité du cycle comptable
conforme aux _Mauritius Accounting Standards_ (IFRS et IFRS for SMEs), aux
obligations TVA / CIT auprès du _Mauritius Revenue Authority_ (MRA), et aux
exigences sociales du _Workers' Rights Act 2019_.

## Fonctionnalités principales

- **Comptabilité générale** : saisie multi-journaux, lettrage, balance, grand
  livre, plan comptable mauricien (PCM).
- **Facturation** : factures clients, avoirs, échéancier, relances automatisées.
- **TVA** : préparation et export des déclarations VAT 4 (mensuelles ou
  trimestrielles) au format MRA e-Tax.
- **Paie** : bulletins, charges sociales (NPS, NSF, CSG, PAYE), provisions
  IAS 19, déclaration PAYE.
- **Rapprochement bancaire** : import CSV / OFX / MT940, OCR PDF, appariement
  automatique.
- **Clôtures** : travaux d'inventaire, génération du bilan, du compte de
  résultat, du tableau de flux de trésorerie et des notes annexes IFRS.
- **Multi-tenant sécurisé** : isolation par tenant via _Row Level Security_
  Supabase, MFA, journalisation d'audit.
- **Espace client / espace salarié** : portails dédiés pour les clients
  cabinets et leurs salariés (bulletins, congés, notes de frais).

## Stack technique

| Couche             | Technologie                                |
| ------------------ | ------------------------------------------ |
| Framework          | Next.js 16 (App Router, RSC)               |
| Langage            | TypeScript 5 (strict)                      |
| Base de données    | Supabase (PostgreSQL 15) avec RLS          |
| Authentification   | Supabase Auth (email/password + MFA TOTP)  |
| UI                 | React 19, Radix UI, Tailwind CSS v4        |
| Tests              | Vitest                                     |
| PDF                | @react-pdf/renderer + html2pdf             |
| E-mail             | Resend (transactionnel) + Nodemailer       |
| Hébergement        | Vercel (frontend) + Supabase EU (Frankfurt)|

## Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Copier la configuration d'environnement
cp .env.local.example .env.local
# puis renseigner les variables ci-dessous

# 3. Lancer le serveur de développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

| Variable                              | Description                                    |
| ------------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | URL du projet Supabase                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`       | Clé anonyme Supabase (côté client)             |
| `SUPABASE_SERVICE_ROLE_KEY`           | Clé service role (côté serveur uniquement)    |
| `RESEND_API_KEY`                      | Clé API Resend pour l'envoi d'e-mails          |
| `ANTHROPIC_API_KEY`                   | Clé API Anthropic (assistant comptable Clara)  |
| `NEXT_PUBLIC_APP_URL`                 | URL canonique de l'application                  |

Voir [`.env.local.example`](./.env.local.example) pour la liste complète.

## Scripts npm

```bash
npm run dev            # serveur de développement
npm run build          # build production
npm run start          # serveur production
npm run lint           # ESLint
npm run test           # tests unitaires Vitest
npm run test:coverage  # couverture
```

## Déploiement

Le déploiement se fait automatiquement sur **Vercel** à chaque push sur la
branche `main`. Pour un déploiement manuel :

```bash
vercel --prod
```

Les migrations Supabase se trouvent dans [`supabase/migrations`](./supabase/migrations).
Pour les appliquer en production :

```bash
supabase db push --linked
```

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — architecture Next.js +
  Supabase + RLS multi-tenant.
- [`docs/COMPTABILITE.md`](./docs/COMPTABILITE.md) — workflow comptable Maurice
  (PCM, TVA, IAS / IFRS).
- [`docs/RGPD.md`](./docs/RGPD.md) — registre des traitements et conformité.
- Centre d'aide utilisateur — accessible via `/help`.

## Pages légales

Les versions canoniques sont accessibles aux URLs suivantes :

- `/legal/mentions-legales`
- `/legal/cgv`
- `/legal/cgu`
- `/legal/privacy`

## Support

- Bugs et incidents : [contact@lexora.finance](mailto:contact@lexora.finance)
- Données personnelles / RGPD : [dpo@lexora.finance](mailto:dpo@lexora.finance)
- Documentation utilisateur : `/help`

## Licence

Code propriétaire — © Digital Data Solutions Ltd. Tous droits réservés.
