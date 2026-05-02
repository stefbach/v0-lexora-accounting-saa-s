# Registre des traitements — Lexora

Document interne — version du 2 mai 2026.
Référent : DPO Lexora — `dpo@lexora.finance`.

Ce registre est tenu en application :

- de l'article **30 du RGPD** (Règlement européen 2016/679) ;
- de la section **31 du Mauritius Data Protection Act 2017**.

Il est complété par la
[Politique de confidentialité publique](../app/(public)/legal/privacy/page.tsx).

## 1. Identification du responsable

| Champ                     | Valeur                                                  |
| ------------------------- | ------------------------------------------------------- |
| Raison sociale            | Digital Data Solutions Ltd                              |
| Forme                     | Private Company Limited by Shares                       |
| BRN                       | C12345678                                                |
| Adresse                   | Cybercity, Ebène, République de Maurice                 |
| Représentant légal        | Le Directeur Général                                    |
| Délégué à la protection   | DPO joignable à `dpo@lexora.finance`                    |

Lexora agit en **responsable de traitement** pour ses propres données
(prospects, comptes utilisateurs, facturation) et en **sous-traitant** pour les
données comptables et de paie de ses Clients (Article 28 RGPD).

## 2. Traitements en qualité de responsable

### T1 — Gestion des comptes utilisateurs

| Élément                  | Détail                                                       |
| ------------------------ | ------------------------------------------------------------ |
| Finalité                 | Authentification, gestion des accès, support                 |
| Base légale              | Exécution du contrat (Art. 6.1.b)                            |
| Catégories de données    | Identité, e-mail, mot de passe haché, journaux de connexion  |
| Personnes concernées     | Utilisateurs autorisés des Clients                           |
| Destinataires            | Équipe support Lexora                                        |
| Transferts hors UE       | Vercel (US) — encadré par SCC Décision 2021/914              |
| Durée de conservation    | Durée du contrat + 3 ans après dernière connexion            |
| Mesures de sécurité      | TLS, hachage Argon2, MFA TOTP, RLS multi-tenant              |

### T2 — Facturation et recouvrement

| Élément                  | Détail                                                       |
| ------------------------ | ------------------------------------------------------------ |
| Finalité                 | Facturation des abonnements, recouvrement                    |
| Base légale              | Exécution du contrat + obligation légale                     |
| Catégories de données    | Identité juridique, RIB, historique de paiement              |
| Sous-traitants           | Stripe (paiement)                                             |
| Durée de conservation    | 10 ans (obligations comptables et fiscales)                  |

### T3 — Prospection commerciale

| Élément                  | Détail                                                       |
| ------------------------ | ------------------------------------------------------------ |
| Finalité                 | Démarchage de prospects B2B                                  |
| Base légale              | Intérêt légitime (B2B) ou consentement (UE)                  |
| Catégories de données    | Coordonnées professionnelles                                 |
| Durée de conservation    | 3 ans à compter du dernier contact significatif              |
| Droits                   | Opposition à tout moment via lien de désinscription          |

### T4 — Sécurité et journalisation d'audit

| Élément                  | Détail                                                       |
| ------------------------ | ------------------------------------------------------------ |
| Finalité                 | Détection de fraude, conformité, traçabilité                 |
| Base légale              | Intérêt légitime (Art. 6.1.f)                                |
| Catégories de données    | IP, agent, horodatage, action effectuée                      |
| Durée de conservation    | 12 mois                                                       |

## 3. Traitements en qualité de sous-traitant

Lexora traite les données suivantes pour le compte de ses Clients :

### S1 — Données comptables

- Pièces, journaux, comptes, états financiers.
- Personnes concernées : tiers du Client (clients, fournisseurs, salariés).
- Conservation : **10 ans** (Income Tax Act §96, VAT Act §65).
- Documentation Article 28 : annexe DPA (_Data Processing Addendum_) signée avec
  chaque Client à la souscription.

### S2 — Données de paie

- Salariés du Client : identité, NIC, salaires, bulletins, cotisations.
- Données sensibles potentielles : informations bancaires, situation familiale.
- Conservation : **10 ans** (Workers' Rights Act).
- Sous-traitance ultérieure : Resend pour la diffusion des bulletins par e-mail.

## 4. Sous-traitants ultérieurs

| Sous-traitant     | Service                       | Localisation     | Encadrement                |
| ----------------- | ----------------------------- | ---------------- | -------------------------- |
| Supabase Inc.     | Base de données, auth         | Frankfurt (UE)   | DPA Supabase + SCC         |
| Vercel Inc.       | Hébergement applicatif        | US / UE          | DPA Vercel + SCC + DPF     |
| Resend            | E-mails transactionnels       | UE               | DPA Resend                 |
| Stripe Payments   | Paiement par carte            | UE / US          | DPA Stripe + SCC + DPF     |
| Anthropic PBC     | Assistant IA Clara            | US               | DPA Anthropic + SCC        |

La liste à jour est tenue par le DPO et communiquée aux Clients sur demande.

## 5. Mesures de sécurité

- Chiffrement TLS 1.2+ en transit, AES-256 au repos.
- Isolation multi-tenant via _Row Level Security_ Supabase.
- MFA TOTP obligatoire pour les rôles à privilèges.
- Sauvegardes quotidiennes chiffrées, conservées 30 jours.
- Tests de restauration trimestriels.
- Revue d'accès trimestrielle.
- Plan de continuité d'activité (PCA) documenté.
- Procédure de notification d'incident sous **72 heures** auprès des autorités
  compétentes (Data Protection Office Maurice et/ou autorité de contrôle UE).

## 6. Droits des personnes

Toute personne concernée peut exercer ses droits auprès de
`dpo@lexora.finance`. Lexora répond sous **un (1) mois**, prolongeable de
deux mois en cas de complexité particulière.

| Droit               | Modalité                                                    |
| ------------------- | ----------------------------------------------------------- |
| Accès               | Export JSON / PDF des données du compte                     |
| Rectification       | Correction directement par l'utilisateur ou via support     |
| Effacement          | Sous réserve des obligations légales de conservation        |
| Limitation          | Verrouillage du traitement pendant l'instruction            |
| Portabilité         | Export structuré (CSV, JSON) sur demande                    |
| Opposition          | Désinscription des communications, opt-out cookies          |
| Réclamation         | Data Protection Office Maurice ou CNIL (UE)                 |

## 7. Analyse d'impact (DPIA)

Une **DPIA** a été réalisée pour les traitements suivants jugés à risque
élevé :

- traitement de données salariales à grande échelle (S2) ;
- usage de l'assistant IA Clara sur des données comptables.

Ces analyses sont disponibles en interne et peuvent être communiquées aux
autorités sur demande motivée.

## 8. Revue du registre

Le registre est revu **au moins annuellement** par le DPO et à chaque
changement significatif (nouveau traitement, nouveau sous-traitant, évolution
réglementaire). Date de prochaine revue : 2 mai 2027.
