-- =============================================================================
-- 443_pcm_declare_512101_banque_eur_mcb.sql
-- Déclaration du compte PCM 512101 « Banque EUR — MCB »
-- =============================================================================
-- Contexte : la convention applicative getCompteComptable() (voir
-- lib/accounting/comptes-bancaires.ts) génère les comptes banque au format
-- 512<code banque><code devise>. Pour MCB (code 10) + EUR (code 1) cela donne
-- 512101 — compte effectivement utilisé par les rapprochements et porteur des
-- écritures EUR (y compris l'ouverture, migration 322).
--
-- Or 512101 n'était PAS déclaré dans plan_comptable (le plan avait été semé
-- avec un schéma "par devise" : 512100=MUR, 512200=EUR, 512300=USD, jamais
-- alimenté). La balance affichait donc l'EUR sur un compte non déclaré.
--
-- Correctif : déclarer 512101 en clonant la structure de son frère 512100
-- (MCB MUR) — même type_compte, sens_normal, compte_parent et niveau. Aucune
-- écriture n'est déplacée. Idempotent (ON CONFLICT DO NOTHING).
--
-- NB : ce correctif a déjà été appliqué manuellement en prod le 2026-05-28 ;
-- cette migration le formalise pour la traçabilité et les autres environnements.
-- =============================================================================

INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau)
SELECT '512101', 'Banque EUR — MCB', type_compte, sens_normal, compte_parent, niveau
FROM public.plan_comptable
WHERE compte = '512100'
LIMIT 1
ON CONFLICT (compte) DO NOTHING;

-- =============================================================================
-- FIN 443
-- =============================================================================
