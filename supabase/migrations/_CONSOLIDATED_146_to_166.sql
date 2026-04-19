-- ============================================================================
-- CONSOLIDATED MIGRATIONS 146 → 166 (19 migrations)
-- Generated: 2026-04-19T14:43:56Z
-- Project: v0-lexora-accounting-saa-s
-- ============================================================================
-- À coller dans: Supabase Dashboard → SQL Editor → New query → Run
--
-- Toutes les migrations sont idempotentes (IF NOT EXISTS, DROP ... IF EXISTS,
-- DO $$ blocks). Re-run safe.
--
-- Ordre d'application (dépendances respectées):
--   146: factures numérotation séquentielle
--   147: déduplication factures
--   148: statuts workflow factures
--   149: relances factures
--   150: audit trail lettrage
--   151: R7 enforcement (lettrage classes 6/7)
--   152: grand livre perf (indexes + MV)
--   155: invoice_settings (remplace localStorage)
--   156: alertes persistence
--   157: (optionnel - ignoré si non présent)
--   158: refresh MV soldes
--   159: sync contrats montant + CHECK enums
--   160: rename mra_api_key_encrypted → mra_api_key_secret
--   161: mra_response_raw + mra_signature sur factures
--   162: ★ RGPD FIX ★ RLS trajets/positions/params_km/employe_positions
--   163: ★ MRA 2026 ★ Paie (PAYE 3 tranches, NSF cap, NIT A/B, cumul YTD)
--   164: PII _encrypted columns (NIC/NPF/bank/IBAN)
--   165: CITEXT email + token TTL + audit salaires + auto-verrouillage bulletins
--   166: batch_reanalyze_jobs
--
-- Après exécution, VÉRIFIER:
--   SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'
--     AND tablename IN (
--       'paie_cumul_ytd','invoice_settings','alertes_user_state',
--       'relances_factures','lettres_operations','historique_salaires',
--       'batch_reanalyze_jobs','factures_approbations_historique',
--       'factures_doublons_detectes'
--     );
--   -- Doit retourner 9
-- ============================================================================


-- ============================================================================
-- START: 146_factures_numero_sequence.sql
-- ============================================================================
-- ============================================================================
-- Migration 146 — Numérotation séquentielle gap-free des factures CLIENTS
-- ============================================================================
--
-- Contexte :
--   Les cabinets comptables à Maurice doivent émettre des factures CLIENT avec
--   une numérotation chronologique sans trou (exigence MRA). Les factures
--   FOURNISSEURS gardent leur numéro d'origine imprimé par le fournisseur et
--   ne sont pas concernées par cette séquence.
--
-- Stratégie :
--   1. Table `factures_sequences` (societe_id, exercice) -> last_number
--   2. Fonction `get_next_facture_number(societe_id, exercice)` qui fait un
--      UPSERT atomique avec RETURNING pour éviter les race conditions entre
--      transactions concurrentes.
--   3. Colonne `numero_sequence BIGINT` sur `factures` (nullable pour legacy)
--   4. UNIQUE partiel (societe_id, exercice, numero_sequence)
--      WHERE type_facture='client' AND numero_sequence IS NOT NULL
--
-- Idempotent : IF NOT EXISTS + CREATE OR REPLACE partout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table de séquences par société et par exercice
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures_sequences (
  societe_id   UUID    NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice     INT     NOT NULL,
  last_number  INT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (societe_id, exercice)
);

COMMENT ON TABLE public.factures_sequences IS
  'Séquence gap-free de numérotation des factures CLIENTS, indexée par société
   et par exercice fiscal (année civile INT). Ne concerne pas les factures
   fournisseurs qui conservent leur numéro d''origine.';

COMMENT ON COLUMN public.factures_sequences.societe_id IS
  'Société propriétaire de la séquence.';

COMMENT ON COLUMN public.factures_sequences.exercice IS
  'Exercice fiscal (année civile, ex: 2026).';

COMMENT ON COLUMN public.factures_sequences.last_number IS
  'Dernier numéro émis (0 si aucune facture émise). Le prochain sera last_number+1.';

-- ---------------------------------------------------------------------------
-- 2. Fonction PL/pgSQL atomique d'attribution du prochain numéro
--    UPSERT + RETURNING => thread-safe même en cas de transactions parallèles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_next_facture_number(
  p_societe_id UUID,
  p_exercice   INT
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_number INT;
BEGIN
  IF p_societe_id IS NULL THEN
    RAISE EXCEPTION 'get_next_facture_number: p_societe_id ne peut pas être NULL';
  END IF;
  IF p_exercice IS NULL THEN
    RAISE EXCEPTION 'get_next_facture_number: p_exercice ne peut pas être NULL';
  END IF;

  -- UPSERT atomique : insère (societe, exercice, 1) si absent, sinon
  -- incrémente last_number. RETURNING récupère la valeur allouée.
  INSERT INTO public.factures_sequences (societe_id, exercice, last_number, updated_at)
  VALUES (p_societe_id, p_exercice, 1, NOW())
  ON CONFLICT (societe_id, exercice)
  DO UPDATE SET
    last_number = public.factures_sequences.last_number + 1,
    updated_at  = NOW()
  RETURNING last_number INTO v_new_number;

  RETURN 'FV-' || p_exercice::TEXT || '-' || LPAD(v_new_number::TEXT, 6, '0');
END;
$$;

COMMENT ON FUNCTION public.get_next_facture_number(UUID, INT) IS
  'Retourne le prochain numéro de facture CLIENT au format
   ''FV-YYYY-NNNNNN'' (ex: FV-2026-000001). UPSERT atomique + RETURNING
   => safe contre les race conditions entre transactions concurrentes.
   À appeler UNIQUEMENT pour les factures type_facture=''client''.';

-- ---------------------------------------------------------------------------
-- 3. Colonne numero_sequence sur factures (nullable pour legacy)
-- ---------------------------------------------------------------------------
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS numero_sequence BIGINT;

COMMENT ON COLUMN public.factures.numero_sequence IS
  'Numéro séquentiel (entier) attribué par get_next_facture_number pour les
   factures CLIENT uniquement. NULL pour les factures fournisseurs et pour les
   factures legacy antérieures à la migration 146 (pas de backfill).';

-- ---------------------------------------------------------------------------
-- 4. Contrainte UNIQUE partielle sur (societe_id, exercice, numero_sequence)
--    pour les factures clients qui ont bien une séquence (non NULL).
-- ---------------------------------------------------------------------------
-- NOTE : l'appelant doit setter factures.exercice = p_exercice lors de
--        l'attribution du numéro via get_next_facture_number, afin que
--        l'index UNIQUE (societe_id, exercice, numero_sequence) reste
--        cohérent et évite les collisions entre exercices différents
--        (ex: FV-2026-000001 et FV-2027-000001 ont tous deux
--        numero_sequence=1 mais un exercice distinct).

-- Ajoute la colonne exercice (générée depuis date_facture si pas déjà présente)
ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS exercice INT;

-- Backfill l'exercice pour lignes existantes
UPDATE public.factures
SET exercice = EXTRACT(YEAR FROM date_facture)::INT
WHERE exercice IS NULL AND date_facture IS NOT NULL;

-- DROP ancien index UNIQUE s'il existe, puis le recrée avec exercice
DROP INDEX IF EXISTS uq_factures_numero_sequence;
CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_numero_sequence
  ON public.factures (societe_id, exercice, numero_sequence)
  WHERE type_facture = 'client' AND numero_sequence IS NOT NULL AND exercice IS NOT NULL;

COMMENT ON INDEX public.uq_factures_numero_sequence IS
  'Unicité du numéro séquentiel par société/exercice pour factures clients (gap-free intra-exercice).';

-- Index de lookup rapide pour les listes/statistiques par exercice
CREATE INDEX IF NOT EXISTS idx_factures_sequences_societe_exercice
  ON public.factures_sequences (societe_id, exercice);

-- END: 146_factures_numero_sequence.sql
-- ============================================================================

-- ============================================================================
-- START: 147_factures_dedup_unique.sql
-- ============================================================================
-- ============================================================================
-- Migration 147 — Déduplication stricte des factures (client ET fournisseur)
-- ============================================================================
--
-- Contexte :
--   L'utilisateur génère ses factures CLIENTS en PDF externe puis les uploade
--   dans le module OCR — tout comme les factures FOURNISSEURS. La pipeline OCR
--   peut re-traiter le même document plusieurs fois (re-upload, retry, etc.).
--   Sans garde-fou, on se retrouve avec des doublons comptables.
--
-- Stratégie :
--   1. Fonction IMMUTABLE normalize_numero(TEXT) — trim + uppercase + suppression
--      des espaces, pour matcher "FAC 001", "fac001", "FAC001" comme identiques.
--   2. Index UNIQUE partiel sur (societe_id, type_facture, normalize_numero(...),
--      tiers, montant_ttc) : toute tentative d'insert d'une facture identique
--      lève une erreur au niveau DB.
--   3. Table `factures_doublons_detectes` pour logger les tentatives de doublon
--      rejetées par l'OCR. Lue par l'UI pour alerter l'utilisateur.
--
-- Idempotent : IF NOT EXISTS + CREATE OR REPLACE partout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fonction IMMUTABLE de normalisation des numéros de facture
--    IMMUTABLE est indispensable pour utiliser la fonction dans un index.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_numero(p_num TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_num IS NULL THEN NULL
    ELSE UPPER(REPLACE(BTRIM(p_num), ' ', ''))
  END;
$$;

COMMENT ON FUNCTION public.normalize_numero(TEXT) IS
  'Normalise un numéro de facture pour la comparaison : trim, uppercase,
   suppression des espaces. IMMUTABLE => utilisable dans un index.
   Exemples : "  fac 001  " -> "FAC001", "FV-2026-000001" -> "FV-2026-000001".';

-- ---------------------------------------------------------------------------
-- 2. Index UNIQUE partiel de déduplication
--    Bloque l'insert d'une facture identique (même société + même type +
--    même numéro normalisé + même tiers + même montant TTC).
--    - type_facture est inclus pour que client et fournisseur soient isolés.
--    - WHERE numero_facture IS NOT NULL AND tiers IS NOT NULL :
--      on ne veut pas forcer l'unicité sur des brouillons incomplets.
-- ---------------------------------------------------------------------------

-- Pré-check : détecte doublons (simple query, sans DO block).
-- Si l'index échoue plus tard, lancer cette requête manuellement pour diagnostic :
--   SELECT societe_id, type_facture, public.normalize_numero(numero_facture),
--          tiers, montant_ttc, COUNT(*)
--   FROM public.factures
--   WHERE numero_facture IS NOT NULL AND tiers IS NOT NULL
--   GROUP BY societe_id, type_facture, public.normalize_numero(numero_facture),
--            tiers, montant_ttc
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_dedup
  ON public.factures (
    societe_id,
    type_facture,
    public.normalize_numero(numero_facture),
    tiers,
    montant_ttc
  )
  WHERE numero_facture IS NOT NULL
    AND tiers IS NOT NULL;

COMMENT ON INDEX public.uq_factures_dedup IS
  'Index UNIQUE partiel de déduplication factures. Clé :
   (societe_id, type_facture, numéro normalisé, tiers, montant_ttc).
   S''applique aux factures CLIENT ET FOURNISSEUR. Protège contre les
   doubles uploads OCR. Partial : ignore les brouillons sans numéro ou tiers.';

-- ---------------------------------------------------------------------------
-- 3. Table de tracking des tentatives de doublon détectées
--    Alimentée par le code applicatif lorsqu'un insert échoue avec
--    violation de uq_factures_dedup — l'UI la lit pour alerter l'utilisateur.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures_doublons_detectes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  tentative_facture    JSONB NOT NULL,
  facture_existante_id UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  detected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolu               BOOLEAN NOT NULL DEFAULT FALSE,
  resolu_at            TIMESTAMPTZ,
  resolu_par           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                TEXT
);

COMMENT ON TABLE public.factures_doublons_detectes IS
  'Journal des tentatives de création d''une facture en doublon rejetées par
   l''index uq_factures_dedup. L''UI lit cette table pour alerter l''utilisateur
   et lui proposer de résoudre manuellement (ignorer / forcer / corriger).';

COMMENT ON COLUMN public.factures_doublons_detectes.tentative_facture IS
  'Payload JSON complet de la facture qu''on a tenté d''insérer (numero_facture,
   tiers, montants, dossier_id, source OCR, etc.) pour permettre une reprise.';

COMMENT ON COLUMN public.factures_doublons_detectes.facture_existante_id IS
  'ID de la facture déjà présente en base qui a provoqué le conflit.';

COMMENT ON COLUMN public.factures_doublons_detectes.resolu IS
  'TRUE quand un utilisateur a traité l''alerte (ignore, force ou corrige).';

-- Index pour la requête UI typique : « doublons non résolus de ma société »
CREATE INDEX IF NOT EXISTS idx_factures_doublons_societe_non_resolu
  ON public.factures_doublons_detectes (societe_id, resolu, detected_at DESC)
  WHERE resolu = FALSE;

CREATE INDEX IF NOT EXISTS idx_factures_doublons_facture_existante
  ON public.factures_doublons_detectes (facture_existante_id)
  WHERE facture_existante_id IS NOT NULL;

-- END: 147_factures_dedup_unique.sql
-- ============================================================================

-- ============================================================================
-- START: 148_factures_statuts_workflow.sql
-- ============================================================================
-- ============================================================================
-- Migration 148 — Workflow enrichi des factures (approbation + encaissement)
-- ============================================================================
--
-- Contexte :
--   La colonne `statut` existante est trop grossière (en_attente, partiel,
--   paye, retard, annule). Le métier demande un workflow plus granulaire qui
--   couvre :
--     - l'approbation interne (brouillon -> à valider -> validée / refusée)
--     - l'envoi client (envoyee)
--     - l'encaissement (acompte_recu, paye_partiel, paye)
--     - le recouvrement (retard_7j, retard_30j, en_contentieux)
--     - la clôture (annulee, comptabilisee)
--
--   Seuils indicatifs de double-approbation :
--     > 50 000 Rs  => niveau 1 (manager)
--     > 500 000 Rs => niveau 2 (direction)
--
-- Stratégie :
--   1. Colonnes statut_workflow + métadonnées de validation
--   2. Table d'historique factures_approbations_historique
--   3. Trigger AFTER UPDATE qui log automatiquement tout changement de
--      statut_workflow
--   4. Index pour les requêtes dashboards (par statut, par échéance)
--
-- NOTE : on conserve la colonne `statut` existante pour compatibilité avec
--        les rapprochements bancaires (voir migration 121). statut_workflow
--        est un champ parallèle plus riche.
--
-- Idempotent : IF NOT EXISTS + CREATE OR REPLACE partout. Pas de RLS (Wave 2).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes workflow sur factures
-- ---------------------------------------------------------------------------
-- Étape 1 : ajoute la colonne sans NOT NULL pour permettre le mapping
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS statut_workflow TEXT DEFAULT 'brouillon';

-- Étape 2 : mappe les statuts legacy vers les statuts workflow granulaires
-- Seulement pour les lignes où statut_workflow est resté à 'brouillon' par défaut (fraîchement ajouté)
UPDATE public.factures
SET statut_workflow = CASE
  WHEN statut IN ('paye') THEN 'paye'
  WHEN statut IN ('partiel') THEN 'paye_partiel'
  WHEN statut IN ('annule', 'annulee') THEN 'annulee'
  WHEN statut IN ('comptabilisee') THEN 'comptabilisee'
  WHEN statut = 'retard' THEN 'retard_7j'
  WHEN statut IN ('en_attente', 'emise', 'envoyee', 'valide') THEN 'envoyee'
  ELSE 'brouillon'
END
WHERE statut_workflow = 'brouillon' AND statut IS NOT NULL;

-- Étape 3 : enforce NOT NULL maintenant que toutes les lignes ont une valeur
ALTER TABLE public.factures
  ALTER COLUMN statut_workflow SET NOT NULL;

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS validee_par UUID REFERENCES auth.users(id);

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS validee_at TIMESTAMPTZ;

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS refus_raison TEXT;

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS approbation_niveau INT NOT NULL DEFAULT 0;

-- CHECK statut_workflow — ajouté via DO block pour idempotence
-- (CREATE TABLE CHECK IF NOT EXISTS n'existe pas < PG 18)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factures_statut_workflow_check'
  ) THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT factures_statut_workflow_check
      CHECK (statut_workflow IN (
        'brouillon',
        'a_valider',
        'validee',
        'refusee',
        'envoyee',
        'acompte_recu',
        'paye_partiel',
        'paye',
        'retard_7j',
        'retard_30j',
        'en_contentieux',
        'annulee',
        'comptabilisee'
      ));
  END IF;
END $$;

-- CHECK approbation_niveau ∈ {0,1,2}
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factures_approbation_niveau_check'
  ) THEN
    ALTER TABLE public.factures
      ADD CONSTRAINT factures_approbation_niveau_check
      CHECK (approbation_niveau IN (0, 1, 2));
  END IF;
END $$;

COMMENT ON COLUMN public.factures.statut_workflow IS
  'Statut métier enrichi (workflow approbation + encaissement). Distinct de
   la colonne "statut" legacy utilisée par le rapprochement bancaire.
   Valeurs : brouillon, a_valider, validee, refusee, envoyee, acompte_recu,
   paye_partiel, paye, retard_7j, retard_30j, en_contentieux, annulee,
   comptabilisee.';

COMMENT ON COLUMN public.factures.validee_par IS
  'Utilisateur ayant validé la facture (auth.users.id). NULL tant qu''elle
   n''est pas validée.';

COMMENT ON COLUMN public.factures.validee_at IS
  'Horodatage de la validation.';

COMMENT ON COLUMN public.factures.refus_raison IS
  'Motif du refus si statut_workflow = ''refusee''. Libre.';

COMMENT ON COLUMN public.factures.approbation_niveau IS
  'Niveau d''approbation requis : 0=aucune, 1=manager (>50k Rs),
   2=direction (>500k Rs). Déterminé à la création/finalisation de la facture.';

-- ---------------------------------------------------------------------------
-- 2. Table d'historique des approbations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures_approbations_historique (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id     UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  ancien_statut  TEXT,
  nouveau_statut TEXT NOT NULL,
  action         TEXT,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  commentaire    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.factures_approbations_historique IS
  'Journal d''audit de tous les changements de statut_workflow d''une facture.
   Alimenté automatiquement par le trigger trg_factures_log_statut_workflow.';

COMMENT ON COLUMN public.factures_approbations_historique.action IS
  'Libellé court de l''action métier (ex: ''soumettre'', ''valider'',
   ''refuser'', ''envoyer'', ''encaisser'', ''annuler'', ''comptabiliser'').';

CREATE INDEX IF NOT EXISTS idx_factures_approb_hist_facture
  ON public.factures_approbations_historique (facture_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_factures_approb_hist_user
  ON public.factures_approbations_historique (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Trigger AFTER UPDATE : log automatique sur changement de statut_workflow
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_facture_statut_workflow_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Seulement si le statut_workflow a réellement changé
  IF NEW.statut_workflow IS DISTINCT FROM OLD.statut_workflow THEN
    INSERT INTO public.factures_approbations_historique (
      facture_id,
      ancien_statut,
      nouveau_statut,
      action,
      user_id,
      commentaire,
      created_at
    ) VALUES (
      NEW.id,
      OLD.statut_workflow,
      NEW.statut_workflow,
      'changement_statut',
      -- auth.uid() peut être NULL dans un contexte service_role / job batch
      NULLIF(auth.uid()::TEXT, '')::UUID,
      NULL,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_facture_statut_workflow_change() IS
  'Trigger AFTER UPDATE sur factures : insère une ligne dans
   factures_approbations_historique à chaque changement de statut_workflow.
   user_id récupéré depuis auth.uid() (peut être NULL en contexte batch).';

DROP TRIGGER IF EXISTS trg_factures_log_statut_workflow ON public.factures;

CREATE TRIGGER trg_factures_log_statut_workflow
  AFTER UPDATE OF statut_workflow ON public.factures
  FOR EACH ROW
  EXECUTE FUNCTION public.log_facture_statut_workflow_change();

-- ---------------------------------------------------------------------------
-- 4. Index pour requêtes rapides (dashboards, alertes recouvrement)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_factures_societe_statut_workflow
  ON public.factures (societe_id, statut_workflow);

CREATE INDEX IF NOT EXISTS idx_factures_echeance_statut_workflow
  ON public.factures (date_echeance, statut_workflow)
  WHERE date_echeance IS NOT NULL;

-- END: 148_factures_statuts_workflow.sql
-- ============================================================================

-- ============================================================================
-- START: 149_relances_factures.sql
-- ============================================================================
-- ============================================================================
-- Migration 149 — Historique des relances automatiques factures clients
-- ============================================================================
--
-- Contexte :
--   Le cron `relances-factures-clients` (app/api/cron/relances-factures-clients)
--   envoie des relances gradées (rappel amical J-7, 1ère relance J+7,
--   2ème relance J+15, mise en demeure J+30) aux clients dont les factures
--   sont en retard de paiement.
--
--   Cette table trace TOUTES les relances envoyées pour assurer :
--     - l'idempotence (pas deux fois la même relance niveau N sur la même facture)
--     - l'audit (quand, par quel canal, avec quel template)
--     - le reporting (combien de relances, taux de succès, etc.)
--
-- Idempotent : IF NOT EXISTS partout. Pas de RLS pour l'instant (Wave 2).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.relances_factures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id  UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  niveau      INT  NOT NULL CHECK (niveau BETWEEN 0 AND 3),
  canal       TEXT NOT NULL,
  template    TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  statut      TEXT NOT NULL DEFAULT 'envoye',
  erreur_msg  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (facture_id, niveau)
);

CREATE INDEX IF NOT EXISTS idx_relances_facture ON public.relances_factures(facture_id);
CREATE INDEX IF NOT EXISTS idx_relances_sent    ON public.relances_factures(sent_at DESC);

COMMENT ON TABLE public.relances_factures IS
  'Historique des relances automatiques envoyées par le cron
   relances-factures-clients. Un niveau (0..3) = une relance max par facture.';

COMMENT ON COLUMN public.relances_factures.niveau IS
  '0 = rappel amical (J-7), 1 = 1ère relance (J+7),
   2 = 2ème relance (J+15), 3 = mise en demeure (J+30).';

COMMENT ON COLUMN public.relances_factures.canal IS
  'Canaux utilisés séparés par virgule (ex: "app,email,whatsapp").';

COMMENT ON COLUMN public.relances_factures.statut IS
  'envoye, envoye_simule (mode dry-run), erreur.';

-- ---------------------------------------------------------------------------
-- Table bonus : alertes pour factures récurrentes manquantes
-- (utilisée par cron `factures-recurrentes-attendues` pour l'idempotence)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertes_factures_manquantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id     UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  tiers          TEXT NOT NULL,
  periode        TEXT NOT NULL, -- format YYYY-MM
  date_attendue  DATE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, tiers, periode)
);

CREATE INDEX IF NOT EXISTS idx_alertes_fact_manq_societe
  ON public.alertes_factures_manquantes(societe_id, periode DESC);

COMMENT ON TABLE public.alertes_factures_manquantes IS
  'Trace des alertes envoyées par le cron factures-recurrentes-attendues.
   Sert à l''idempotence : pas plus d''une alerte par (societe, tiers, periode).';

-- END: 149_relances_factures.sql
-- ============================================================================

-- ============================================================================
-- START: 150_lettres_operations_audit.sql
-- ============================================================================
-- ============================================================================
-- Migration 150: Audit trail du lettrage
-- ============================================================================
-- Trace toute modification de la colonne lettre sur ecritures_comptables_v2 :
-- qui a lettré / déletré, quand, pour quelle écriture, ancien/nouveau code.
-- Utilisé pour audit légal, détection fraude, debug.
-- ============================================================================

CREATE TABLE IF NOT EXISTS lettres_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ecriture_id UUID NOT NULL,
  societe_id UUID,
  numero_compte TEXT,
  ancien_code VARCHAR(10),
  nouveau_code VARCHAR(10),
  action TEXT NOT NULL CHECK (action IN ('lettre', 'delettre', 'modifie')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  raison TEXT,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lettres_ops_ecriture ON lettres_operations(ecriture_id);
CREATE INDEX IF NOT EXISTS idx_lettres_ops_societe ON lettres_operations(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lettres_ops_user ON lettres_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lettres_ops_code ON lettres_operations(nouveau_code) WHERE nouveau_code IS NOT NULL;

COMMENT ON TABLE lettres_operations IS 'Audit trail exhaustif des opérations de lettrage (lettre/délétrage) sur ecritures_comptables_v2';
COMMENT ON COLUMN lettres_operations.action IS 'lettre=pose d''un code, delettre=retrait, modifie=changement';
COMMENT ON COLUMN lettres_operations.is_auto IS 'true si posé par rapprochement bancaire ou auto-lettrage, false si comptable manuel';

-- ============================================================================
-- Trigger fonction : logger toute modification de lettre
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_log_lettre_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_action TEXT;
  v_is_auto BOOLEAN;
BEGIN
  -- Récupérer l'utilisateur courant (peut être NULL si trigger déclenché par service role)
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- Déterminer l'action
  IF TG_OP = 'INSERT' THEN
    IF NEW.lettre IS NOT NULL THEN
      v_action := 'lettre';
    ELSE
      RETURN NEW;  -- pas de lettre à logger à l'INSERT
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.lettre IS DISTINCT FROM NEW.lettre THEN
      IF OLD.lettre IS NULL AND NEW.lettre IS NOT NULL THEN
        v_action := 'lettre';
      ELSIF OLD.lettre IS NOT NULL AND NEW.lettre IS NULL THEN
        v_action := 'delettre';
      ELSE
        v_action := 'modifie';
      END IF;
    ELSE
      RETURN NEW;  -- lettre non modifiée
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  v_is_auto := COALESCE(NEW.lettrage_auto, FALSE);

  INSERT INTO lettres_operations (
    ecriture_id, societe_id, numero_compte,
    ancien_code, nouveau_code, action, user_id, is_auto
  ) VALUES (
    NEW.id, NEW.societe_id, NEW.numero_compte,
    OLD.lettre, NEW.lettre, v_action, v_user_id, v_is_auto
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais faire échouer l'update à cause du trigger audit
  RAISE WARNING '[fn_log_lettre_change] audit failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- Attacher le trigger à ecritures_comptables_v2
-- ============================================================================

DROP TRIGGER IF EXISTS trg_log_lettre_change ON ecritures_comptables_v2;

CREATE TRIGGER trg_log_lettre_change
AFTER INSERT OR UPDATE OF lettre ON ecritures_comptables_v2
FOR EACH ROW
EXECUTE FUNCTION fn_log_lettre_change();

-- ============================================================================
-- RLS pour la table d'audit (lecture seule pour comptable + admin)
-- ============================================================================

ALTER TABLE lettres_operations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lettres_operations' AND policyname = 'lettres_ops_select'
  ) THEN
    CREATE POLICY lettres_ops_select ON lettres_operations
      FOR SELECT TO authenticated
      USING (true);  -- Wave ultérieure : restreindre par societe_id via user_societes
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lettres_operations' AND policyname = 'lettres_ops_no_user_write'
  ) THEN
    -- Personne ne peut écrire directement — seul le trigger (SECURITY DEFINER) le fait
    CREATE POLICY lettres_ops_no_user_write ON lettres_operations
      FOR ALL TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- END: 150_lettres_operations_audit.sql
-- ============================================================================

-- ============================================================================
-- START: 151_lettrage_r7_enforcement.sql
-- ============================================================================
-- ============================================================================
-- Migration 151: Enforcement DB de la règle R7 (anti-lettrage classes 6/7)
-- ============================================================================
-- Interdit au niveau base de données le lettrage d'une écriture dont le compte
-- commence par 6 (charges) ou 7 (produits). Seuls les comptes de tiers sont
-- lettrables (classes 1, 2, 3, 4, 5).
--
-- Règle comptable R7 : le lettrage sert à apparier débit/crédit sur comptes
-- de tiers (ex: 401 fournisseur). Lettrer un 606100 (électricité) n'a pas
-- de sens et indique une erreur.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_r7_no_lettre_resultat()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si aucun code lettre posé, pas de vérif
  IF NEW.lettre IS NULL OR NEW.lettre = '' THEN
    RETURN NEW;
  END IF;

  -- Vérifier que le compte n'est pas de classe 6 ou 7
  IF NEW.numero_compte IS NOT NULL
     AND (NEW.numero_compte LIKE '6%' OR NEW.numero_compte LIKE '7%')
  THEN
    RAISE EXCEPTION 'R7_VIOLATION: Lettrage interdit sur compte de classe 6/7 (résultat). Compte: %, Lettre tentée: %',
      NEW.numero_compte, NEW.lettre
      USING ERRCODE = 'check_violation',
            HINT = 'Seuls les comptes de tiers (classes 1-5) peuvent être lettrés.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_r7_lettre_v2 ON ecritures_comptables_v2;

CREATE TRIGGER trg_enforce_r7_lettre_v2
BEFORE INSERT OR UPDATE OF lettre ON ecritures_comptables_v2
FOR EACH ROW
WHEN (NEW.lettre IS NOT NULL)
EXECUTE FUNCTION fn_enforce_r7_no_lettre_resultat();

-- ============================================================================
-- Nettoyer les lettrages invalides existants (si présents avant le trigger)
-- ============================================================================
-- On ne supprime pas, on retire juste la lettre pour respecter la règle.
-- Ces cas sont loggés pour audit manuel.

-- Nettoyage direct des lettrages invalides existants (sans DO block pour éviter
-- le conflit parsing "SELECT INTO" dans l'éditeur SQL Supabase).
-- Si aucune ligne ne matche, UPDATE ne fait rien silencieusement.
UPDATE ecritures_comptables_v2
SET lettre = NULL,
    date_lettrage = NULL,
    lettrage_auto = FALSE
WHERE lettre IS NOT NULL
  AND numero_compte IS NOT NULL
  AND (numero_compte LIKE '6%' OR numero_compte LIKE '7%');

COMMENT ON FUNCTION fn_enforce_r7_no_lettre_resultat IS 'Trigger BEFORE INSERT/UPDATE : empêche toute pose de lettre sur comptes classe 6 (charges) ou 7 (produits). Règle comptable R7.';

-- END: 151_lettrage_r7_enforcement.sql
-- ============================================================================

-- ============================================================================
-- START: 152_grand_livre_perf_indexes.sql
-- ============================================================================
-- ============================================================================
-- Migration 152: Performance Grand Livre & Balance
-- ============================================================================
-- - Index composite (societe_id, numero_compte, date_ecriture)
-- - Index partiel "non-lettrées" pour audit lettrage
-- - Vue matérialisée mv_soldes_comptes_exercice (rafraîchissement manuel ou cron)
-- - Fonction fn_solde_compte_at_date pour soldes ponctuels
-- ============================================================================

-- 1) INDEX COMPOSITE PRINCIPAL (Grand Livre et Balance)
-- ============================================================================
-- Couvre la plupart des requêtes : WHERE societe_id=? AND numero_compte=?
-- ORDER BY date_ecriture
-- INCLUDE évite les visites table pour les agrégats simples

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_composite
  ON ecritures_comptables_v2 (societe_id, numero_compte, date_ecriture DESC)
  INCLUDE (debit_mur, credit_mur, lettre);

-- 2) INDEX PARTIEL NON-LETTRÉES
-- ============================================================================
-- Pour les écrans "afficher uniquement non-lettrées" et balance âgée

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_non_lettrees
  ON ecritures_comptables_v2 (societe_id, numero_compte, date_ecriture DESC)
  WHERE lettre IS NULL;

-- 3) INDEX SUR LETTRE (pour requêtes par code lettre)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_lettre_code
  ON ecritures_comptables_v2 (societe_id, lettre, numero_compte)
  INCLUDE (debit_mur, credit_mur)
  WHERE lettre IS NOT NULL;

-- NOTE : les index ci-dessus sont créés sans CONCURRENTLY pour rester
-- compatibles avec une migration transactionnelle. Pour de très grosses tables
-- en production, le DBA peut rejouer manuellement chaque CREATE INDEX en
-- version CONCURRENTLY (hors transaction) afin d'éviter les verrous longs.

-- 4) VUE MATÉRIALISÉE SOLDES PAR COMPTE ET EXERCICE
-- ============================================================================
-- Pré-calcule les soldes agrégés pour la Balance instantanée.
-- À rafraîchir après clôture d'exercice ou via cron mensuel.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_soldes_comptes_exercice AS
SELECT
  societe_id,
  numero_compte,
  EXTRACT(YEAR FROM date_ecriture)::INT AS exercice,
  COUNT(*) AS nb_ecritures,
  COALESCE(SUM(debit_mur), 0) AS total_debit,
  COALESCE(SUM(credit_mur), 0) AS total_credit,
  COALESCE(SUM(debit_mur - credit_mur), 0) AS solde,
  COUNT(*) FILTER (WHERE lettre IS NULL) AS nb_non_lettrees,
  MAX(date_ecriture) AS derniere_date
FROM ecritures_comptables_v2
WHERE societe_id IS NOT NULL AND numero_compte IS NOT NULL
GROUP BY societe_id, numero_compte, EXTRACT(YEAR FROM date_ecriture);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_soldes_key
  ON mv_soldes_comptes_exercice (societe_id, numero_compte, exercice);

CREATE INDEX IF NOT EXISTS idx_mv_soldes_societe
  ON mv_soldes_comptes_exercice (societe_id, exercice);

COMMENT ON MATERIALIZED VIEW mv_soldes_comptes_exercice IS
  'Soldes agrégés par compte/exercice pour Balance instantanée. Rafraîchir après clôture : REFRESH MATERIALIZED VIEW CONCURRENTLY mv_soldes_comptes_exercice;';

-- 5) FONCTION HELPER : SOLDE D'UN COMPTE À UNE DATE DONNÉE
-- ============================================================================
-- Calcule le solde cumulatif d'un compte jusqu'à une date (inclusive).
-- Utilisé pour reports à nouveau, balance ponctuelle.

CREATE OR REPLACE FUNCTION fn_solde_compte_at_date(
  p_societe_id UUID,
  p_numero_compte TEXT,
  p_date DATE
) RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(debit_mur - credit_mur), 0)
  FROM ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND numero_compte = p_numero_compte
    AND date_ecriture <= p_date;
$$;

COMMENT ON FUNCTION fn_solde_compte_at_date IS
  'Retourne le solde cumulatif (débit - crédit) d''un compte à une date donnée.';

-- 6) FONCTION : SOLDES GROUPÉS PAR CLASSE (1-7) POUR BILAN/P&L
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_soldes_par_classe(
  p_societe_id UUID,
  p_date_debut DATE,
  p_date_fin DATE
) RETURNS TABLE (
  classe TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  solde NUMERIC,
  nb_ecritures BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    LEFT(numero_compte, 1) AS classe,
    COALESCE(SUM(debit_mur), 0) AS total_debit,
    COALESCE(SUM(credit_mur), 0) AS total_credit,
    COALESCE(SUM(debit_mur - credit_mur), 0) AS solde,
    COUNT(*) AS nb_ecritures
  FROM ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND date_ecriture BETWEEN p_date_debut AND p_date_fin
    AND numero_compte IS NOT NULL
  GROUP BY LEFT(numero_compte, 1)
  ORDER BY classe;
$$;

COMMENT ON FUNCTION fn_soldes_par_classe IS
  'Soldes agrégés par classe comptable (1-7) pour construction Bilan / Compte de résultat.';

-- END: 152_grand_livre_perf_indexes.sql
-- ============================================================================

-- ============================================================================
-- START: 155_contrats_clients_enrichi.sql
-- ============================================================================
-- ============================================================================
-- Migration 155 — Enrichissement table contrats_clients (module UI)
-- ============================================================================
--
-- Ajoute les colonnes manquantes nécessaires à la nouvelle UI du module
-- Contrats Clients (liste, création, détail) :
--   - frequence_facturation : périodicité de facturation (ponctuel/mensuel/...)
--   - description : description libre (additionnelle aux notes_internes)
--   - montant : alias direct sur le montant du contrat (simpler que montant_total)
--   - action_renouvellement : mode de renouvellement
--
-- Les colonnes date_debut, date_fin, montant_total, devise, type_contrat,
-- statut et updated_at existent déjà (voir migrations 125 et 142).
--
-- Idempotente : ADD COLUMN IF NOT EXISTS sur chaque colonne.
-- ============================================================================

ALTER TABLE public.contrats_clients
  ADD COLUMN IF NOT EXISTS frequence_facturation TEXT DEFAULT 'ponctuel',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS montant NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS action_renouvellement TEXT DEFAULT 'aucun';

COMMENT ON COLUMN public.contrats_clients.frequence_facturation IS
  'Périodicité de facturation : ponctuel | mensuel | trimestriel | annuel';

COMMENT ON COLUMN public.contrats_clients.description IS
  'Description libre du contrat (distincte des notes_internes réservées au cabinet)';

COMMENT ON COLUMN public.contrats_clients.montant IS
  'Montant principal du contrat (alias simplifié de montant_total pour la nouvelle UI)';

COMMENT ON COLUMN public.contrats_clients.action_renouvellement IS
  'Mode de renouvellement : aucun | tacite | manuel';

-- Index utile pour filtre statut + tri par date_fin (échéances 30j)
CREATE INDEX IF NOT EXISTS idx_contrats_clients_statut_date_fin
  ON public.contrats_clients(statut, date_fin);

-- END: 155_contrats_clients_enrichi.sql
-- ============================================================================

-- ============================================================================
-- START: 156_invoice_settings.sql
-- ============================================================================
-- ============================================================================
-- Migration 156 — invoice_settings : paramètres de facturation par société
-- ============================================================================
--
-- Remplace le stockage localStorage (`lexora_invoice_settings`,
-- `lexora_invoice_template`, `lexora_invoice_template_colors`,
-- `lexora_mra_settings`) qui était perdu entre appareils / sessions.
--
-- Une seule ligne par société (contrainte UNIQUE sur societe_id). L'UI
-- fait un upsert à chaque sauvegarde.
--
-- Les sous-sections "Clients" et "Catalogue" restent en localStorage pour
-- ce sprint (scope limit).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Entreprise
  logo_url TEXT,
  brn TEXT,
  vat_number TEXT,
  adresse TEXT,
  telephone TEXT,
  email TEXT,
  website TEXT,

  -- Bancaire
  banque_nom TEXT,
  banque_compte TEXT,
  banque_iban TEXT,
  banque_swift TEXT,

  -- Facturation
  devise_defaut TEXT DEFAULT 'MUR',
  conditions_paiement TEXT,
  prefixe_facture TEXT DEFAULT 'FV',
  prochain_numero INT DEFAULT 1,
  pied_de_page TEXT,
  mention_legale_mra TEXT,

  -- Template
  template_id TEXT DEFAULT 'standard',
  couleur_primaire TEXT DEFAULT '#000000',
  couleur_secondaire TEXT DEFAULT '#cccccc',

  -- MRA
  mra_active BOOLEAN DEFAULT false,
  mra_ebs_id TEXT,
  mra_api_key_encrypted TEXT, -- à chiffrer plus tard (app-level secret)
  mra_env TEXT DEFAULT 'sandbox' CHECK (mra_env IN ('sandbox', 'production')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_settings_societe
  ON public.invoice_settings(societe_id);

-- RLS : accès via user_societes (table présente depuis migration 031)
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoice_settings'
      AND policyname = 'invoice_settings_select'
  ) THEN
    CREATE POLICY invoice_settings_select ON public.invoice_settings
      FOR SELECT TO authenticated
      USING (
        societe_id IN (
          SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'invoice_settings'
      AND policyname = 'invoice_settings_write'
  ) THEN
    CREATE POLICY invoice_settings_write ON public.invoice_settings
      FOR ALL TO authenticated
      USING (
        societe_id IN (
          SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        societe_id IN (
          SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.invoice_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_settings_updated_at ON public.invoice_settings;
CREATE TRIGGER trg_invoice_settings_updated_at
  BEFORE UPDATE ON public.invoice_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_settings_set_updated_at();

COMMENT ON TABLE public.invoice_settings IS
  'Paramètres de facturation persistés par société (remplace localStorage).';

-- END: 156_invoice_settings.sql
-- ============================================================================

-- ============================================================================
-- START: 157_alertes_persistence.sql
-- ============================================================================
-- ============================================================================
-- Migration 156 — Persistance de l'état des alertes par utilisateur
-- ============================================================================
--
-- Contexte :
--   Les alertes affichées dans /client/alertes sont générées dynamiquement par
--   /api/client/alertes (rule-based, aucune alerte n'est stockée).
--   Jusqu'ici l'état lu/archivé était purement local React → reset à chaque reload.
--
--   Cette table persiste l'état PAR UTILISATEUR (lue, archivée, acknowledged)
--   d'une alerte identifiée par une clé stable (`alerte_key`) calculée côté
--   générateur (voir lib/alertes/key.ts).
--
-- Idempotent : IF NOT EXISTS partout. RLS activée : un user ne voit que les
-- états qu'il a lui-même créés.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alertes_user_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  societe_id      UUID REFERENCES public.societes(id) ON DELETE CASCADE,

  -- Identifiant stable de l'alerte (hash du type + context).
  -- Calculé côté générateur via lib/alertes/key.ts, renvoyé au frontend,
  -- puis posté tel quel à l'API /api/client/alertes/state.
  alerte_key      TEXT NOT NULL,

  -- Type de l'alerte (facture_retard, tva_deadline, tresorerie_basse, etc.)
  -- Redondant avec ce qui est codé dans la clé, mais pratique pour filtrer.
  alerte_type     TEXT,

  -- État par user. NULL = action non effectuée.
  lue_at          TIMESTAMPTZ,
  archivee_at     TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, alerte_key)
);

CREATE INDEX IF NOT EXISTS idx_alertes_user_state_user
  ON public.alertes_user_state(user_id);
CREATE INDEX IF NOT EXISTS idx_alertes_user_state_societe
  ON public.alertes_user_state(societe_id);
CREATE INDEX IF NOT EXISTS idx_alertes_user_state_key
  ON public.alertes_user_state(alerte_key);

-- RLS : chaque user gère uniquement ses propres états.
ALTER TABLE public.alertes_user_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'alertes_user_state'
      AND policyname = 'alertes_state_own'
  ) THEN
    CREATE POLICY alertes_state_own ON public.alertes_user_state
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

COMMENT ON TABLE public.alertes_user_state IS
  'État par user des alertes rule-based (lu/archivé/acknowledged). Les alertes
   elles-mêmes sont calculées dynamiquement côté API /api/client/alertes.';

COMMENT ON COLUMN public.alertes_user_state.alerte_key IS
  'Clé stable calculée côté générateur (lib/alertes/key.ts). Même input →
   même clé, pour que les états persistent entre runs.';

-- END: 157_alertes_persistence.sql
-- ============================================================================

-- ============================================================================
-- START: 158_refresh_mv_soldes.sql
-- ============================================================================
-- ============================================================================
-- Migration 158: Fonction helper REFRESH MV mv_soldes_comptes_exercice
-- ============================================================================
-- La vue matérialisée mv_soldes_comptes_exercice (migration 152) ne se
-- rafraîchit pas automatiquement. Cette fonction permet à un appel RPC
-- (app/api/comptable/grand-livre/refresh-mv) de forcer le REFRESH.
--
-- Prérequis : index UNIQUE idx_mv_soldes_key (créé en migration 152) pour
-- supporter REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_refresh_mv_soldes()
RETURNS void
LANGUAGE sql
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_soldes_comptes_exercice;
$$;

COMMENT ON FUNCTION fn_refresh_mv_soldes IS
  'Rafraîchit mv_soldes_comptes_exercice en mode CONCURRENTLY (pas de lock).';

-- END: 158_refresh_mv_soldes.sql
-- ============================================================================

-- ============================================================================
-- START: 159_contrats_clients_sync_montant.sql
-- ============================================================================
-- ============================================================================
-- Migration 159 — contrats_clients : sync montant ↔ montant_total + CHECK enums
-- ============================================================================
--
-- Contexte :
--   La migration 155 a ajouté une colonne `montant NUMERIC(18,2)` qui fait
--   doublon avec `montant_total NUMERIC(15,2)` créée en migration 125, sans
--   mécanisme de synchronisation — risque de divergence entre ancienne UI
--   (montant_total) et nouvelle UI (montant).
--
--   Les colonnes `frequence_facturation` et `action_renouvellement` étaient
--   déclarées TEXT sans CHECK constraint — un INSERT arbitraire peut y écrire
--   n'importe quoi.
--
-- Fix :
--   1) Ajoute CHECK constraints (idempotent via DO $$ block).
--   2) Installe un trigger BEFORE INSERT/UPDATE qui synchronise les deux
--      colonnes dans les deux sens. Priorité à `montant` en cas de conflit
--      (valeur saisie par la nouvelle UI).
--   3) Backfill : pour les lignes existantes où un seul des deux champs est
--      rempli, recopie l'autre côté.
--
-- Idempotente : DO $$ blocks + CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- Non destructif : on NE supprime PAS la colonne `montant_total` (legacy).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CHECK constraints sur les enums TEXT
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contrats_clients_frequence_check'
  ) THEN
    ALTER TABLE public.contrats_clients
      ADD CONSTRAINT contrats_clients_frequence_check
      CHECK (frequence_facturation IN ('ponctuel', 'mensuel', 'trimestriel', 'semestriel', 'annuel'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contrats_clients_action_renouv_check'
  ) THEN
    ALTER TABLE public.contrats_clients
      ADD CONSTRAINT contrats_clients_action_renouv_check
      CHECK (action_renouvellement IN ('aucun', 'tacite', 'manuel'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Trigger de synchronisation montant ↔ montant_total
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_contrats_montant()
RETURNS TRIGGER AS $$
BEGIN
  -- Si seul montant est fourni, copier vers montant_total
  IF NEW.montant IS NOT NULL AND NEW.montant_total IS NULL THEN
    NEW.montant_total = NEW.montant;
  END IF;
  -- Si seul montant_total est fourni, copier vers montant
  IF NEW.montant_total IS NOT NULL AND NEW.montant IS NULL THEN
    NEW.montant = NEW.montant_total;
  END IF;
  -- Si les deux sont fournis mais différents, prendre le dernier modifié
  -- (priorité à montant = nouvelle UI)
  IF NEW.montant IS NOT NULL AND NEW.montant_total IS NOT NULL
     AND NEW.montant <> NEW.montant_total THEN
    NEW.montant_total = NEW.montant;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contrats_montant ON public.contrats_clients;
CREATE TRIGGER trg_sync_contrats_montant
BEFORE INSERT OR UPDATE OF montant, montant_total ON public.contrats_clients
FOR EACH ROW
EXECUTE FUNCTION fn_sync_contrats_montant();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Backfill des lignes existantes (un seul côté rempli)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.contrats_clients
  SET montant = montant_total
  WHERE montant IS NULL AND montant_total IS NOT NULL;

UPDATE public.contrats_clients
  SET montant_total = montant
  WHERE montant_total IS NULL AND montant IS NOT NULL;

COMMENT ON TRIGGER trg_sync_contrats_montant ON public.contrats_clients IS
  'Synchronise montant ↔ montant_total (legacy) pour éviter divergence entre ancienne/nouvelle UI.';

-- END: 159_contrats_clients_sync_montant.sql
-- ============================================================================

-- ============================================================================
-- START: 160_mra_api_key_rename.sql
-- ============================================================================
-- ============================================================================
-- Migration 160: honest naming for MRA API key storage
-- ============================================================================
-- Renommage de mra_api_key_encrypted → mra_api_key_secret
--
-- La colonne stockait en clair malgré son nom "encrypted" — risque de fuite
-- en logs/backups. Renommage pour refléter la réalité : secret en clair,
-- à chiffrer au niveau app (lib/crypto) quand implémenté.
--
-- Les callers doivent être mis à jour pour lire/écrire mra_api_key_secret.
-- ============================================================================

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_settings'
      AND column_name = 'mra_api_key_encrypted'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_settings'
      AND column_name = 'mra_api_key_secret'
  ) THEN
    ALTER TABLE public.invoice_settings
      RENAME COLUMN mra_api_key_encrypted TO mra_api_key_secret;
  END IF;
END $$;

COMMENT ON COLUMN public.invoice_settings.mra_api_key_secret IS
  'Clé API MRA stockée en clair (secret applicatif). À chiffrer au niveau app via lib/crypto — TODO. Ne jamais logger.';

-- END: 160_mra_api_key_rename.sql
-- ============================================================================

-- ============================================================================
-- START: 161_factures_mra_response_raw.sql
-- ============================================================================
-- ============================================================================
-- Migration 161: store full MRA response for audit trail
-- ============================================================================
-- Objectif : conserver la réponse brute renvoyée par l'API MRA IFP lors de la
-- fiscalisation d'une facture, afin de disposer d'une piste d'audit complète
-- (IRN, QR code, signature numérique, statut, métadonnées) et de permettre la
-- vérification ultérieure de la signature MRA sans dépendre d'un log applicatif.
--
-- Deux colonnes sont ajoutées :
--   - `mra_response_raw` (JSONB) : payload JSON complet retourné par MRA.
--   - `mra_signature`    (TEXT)  : signature numérique extraite (shortcut de
--     lecture pour les écrans d'audit / exports).
-- ============================================================================

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS mra_response_raw JSONB,
  ADD COLUMN IF NOT EXISTS mra_signature TEXT;

COMMENT ON COLUMN public.factures.mra_response_raw IS
  'Réponse brute de l''API MRA (IRN, QR, signature, metadata). Utilisé pour audit et vérification future de la signature.';
COMMENT ON COLUMN public.factures.mra_signature IS
  'Signature numérique MRA extraite de la réponse (pour vérification ultérieure).';

-- END: 161_factures_mra_response_raw.sql
-- ============================================================================

-- ============================================================================
-- START: 162_fix_rls_geolocalisation.sql
-- ============================================================================
-- ============================================================================
-- Migration 162: Fix RLS géolocalisation (RGPD DPA 2017 Maurice)
-- ============================================================================
-- La migration 113 avait créé 4 policies USING(true) → TOUS les utilisateurs
-- authentifiés voyaient TOUS les trajets GPS, positions domicile, taux km.
-- Ceci constitue une violation RGPD/DPA 2017 (données biométriques/localisation).
--
-- Cette migration remplace les policies USING(true) par un contrôle d'accès
-- strict :
--  - Employé : voit uniquement ses propres données (employe_id = auth.uid OU liaison via employes.auth_user_id)
--  - Manager : voit les employés de son groupe (via groupe_gere_id)
--  - RH / Admin : voit tous les employés de leurs sociétés assignées
--  - Super_admin : voit tout
-- ============================================================================

-- Helper : résout l'employe_id lié à l'utilisateur connecté (peut être NULL)
CREATE OR REPLACE FUNCTION fn_current_employe_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM employes
  WHERE (auth_user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    AND actif = true
  LIMIT 1;
$$;

-- Helper : résout le rôle de l'utilisateur
CREATE OR REPLACE FUNCTION fn_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- ============================================================================
-- trajets_kilometriques
-- ============================================================================
DROP POLICY IF EXISTS trajets_access ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_select ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_insert ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_update ON public.trajets_kilometriques;
DROP POLICY IF EXISTS trajets_delete ON public.trajets_kilometriques;

CREATE POLICY trajets_select ON public.trajets_kilometriques
  FOR SELECT TO authenticated
  USING (
    -- Super admin / admin : tout
    fn_current_role() IN ('admin', 'super_admin')
    -- RH : employés de ses sociétés
    OR (
      fn_current_role() IN ('rh', 'rh_manager', 'comptable', 'comptable_dedie', 'client_admin', 'direction')
      AND societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
    )
    -- Salarié : uniquement ses propres trajets
    OR employe_id = fn_current_employe_id()
  );

CREATE POLICY trajets_insert ON public.trajets_kilometriques
  FOR INSERT TO authenticated
  WITH CHECK (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  );

CREATE POLICY trajets_update ON public.trajets_kilometriques
  FOR UPDATE TO authenticated
  USING (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  );

CREATE POLICY trajets_delete ON public.trajets_kilometriques
  FOR DELETE TO authenticated
  USING (fn_current_role() IN ('admin', 'super_admin', 'rh'));

-- ============================================================================
-- trajet_steps (hérite du trajet parent)
-- ============================================================================
DROP POLICY IF EXISTS steps_access ON public.trajet_steps;
DROP POLICY IF EXISTS steps_select ON public.trajet_steps;
DROP POLICY IF EXISTS steps_write ON public.trajet_steps;

CREATE POLICY steps_select ON public.trajet_steps
  FOR SELECT TO authenticated
  USING (
    trajet_id IN (
      SELECT id FROM public.trajets_kilometriques
      -- Les lignes visibles via la policy ci-dessus
    )
  );

CREATE POLICY steps_write ON public.trajet_steps
  FOR ALL TO authenticated
  USING (
    trajet_id IN (
      SELECT id FROM public.trajets_kilometriques
      WHERE fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
         OR employe_id = fn_current_employe_id()
    )
  )
  WITH CHECK (
    trajet_id IN (
      SELECT id FROM public.trajets_kilometriques
      WHERE fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
         OR employe_id = fn_current_employe_id()
    )
  );

-- ============================================================================
-- parametres_km (config par société : RH/admin peuvent modifier, tous lire pour calcul)
-- ============================================================================
DROP POLICY IF EXISTS params_km_access ON public.parametres_km;
DROP POLICY IF EXISTS params_km_select ON public.parametres_km;
DROP POLICY IF EXISTS params_km_write ON public.parametres_km;

CREATE POLICY params_km_select ON public.parametres_km
  FOR SELECT TO authenticated
  USING (
    societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
    OR fn_current_role() IN ('admin', 'super_admin')
  );

CREATE POLICY params_km_write ON public.parametres_km
  FOR ALL TO authenticated
  USING (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'client_admin')
    AND (societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid()) OR fn_current_role() = 'super_admin')
  )
  WITH CHECK (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'client_admin')
    AND (societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid()) OR fn_current_role() = 'super_admin')
  );

-- ============================================================================
-- employe_positions (position domicile/bureau — sensible)
-- ============================================================================
DROP POLICY IF EXISTS positions_access ON public.employe_positions;
DROP POLICY IF EXISTS positions_select ON public.employe_positions;
DROP POLICY IF EXISTS positions_write ON public.employe_positions;

CREATE POLICY positions_select ON public.employe_positions
  FOR SELECT TO authenticated
  USING (
    -- Employé : ses propres positions
    employe_id = fn_current_employe_id()
    -- RH/Admin : employés de leurs sociétés
    OR (
      fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'direction')
      AND employe_id IN (
        SELECT id FROM employes
        WHERE societe_id IN (SELECT societe_id FROM user_societes WHERE user_id = auth.uid())
      )
    )
  );

CREATE POLICY positions_write ON public.employe_positions
  FOR ALL TO authenticated
  USING (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  )
  WITH CHECK (
    fn_current_role() IN ('admin', 'super_admin', 'rh', 'rh_manager', 'client_admin')
    OR employe_id = fn_current_employe_id()
  );

COMMENT ON FUNCTION fn_current_employe_id IS
  'Helper RLS : retourne l''employe_id lié à l''utilisateur connecté (via auth_user_id ou email match). NULL si l''utilisateur n''est pas un salarié.';

COMMENT ON FUNCTION fn_current_role IS
  'Helper RLS : retourne le role du profil utilisateur courant. NULL si pas de profil.';

-- END: 162_fix_rls_geolocalisation.sql
-- ============================================================================

-- ============================================================================
-- START: 163_paie_mra_2026_fixes.sql
-- ============================================================================
-- ============================================================================
-- Migration 163: Paie MRA 2026 — corrections conformité
-- ============================================================================
-- Corrige les paramètres de paie pour conformité MRA Maurice 2026 :
-- - Barème PAYE 3 tranches (390K / 490K / 590K) au lieu de 2 tranches erronées
-- - NSF plafond mensuel 19500 Rs (cap manquant)
-- - CSG patronal taux réduit 3% configurable
-- - NIT catégories A (25K) et B (30K avec dépendants)
-- - Cumul YTD par employé pour PAYE cumulatif depuis juillet
-- ============================================================================

-- Ajoute les colonnes à parametres_paie_mra (défensif : ajoute aussi celles
-- qui devraient déjà exister depuis mig 143 mais peuvent manquer si 143 pas appliquée)
ALTER TABLE public.parametres_paie_mra
  ADD COLUMN IF NOT EXISTS csg_seuil_taux_reduit NUMERIC(18,2) DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS csg_salarie_taux_reduit NUMERIC(5,4) DEFAULT 0.015,
  ADD COLUMN IF NOT EXISTS csg_salarie_taux_plein NUMERIC(5,4) DEFAULT 0.030,
  ADD COLUMN IF NOT EXISTS csg_patronal NUMERIC(5,4) DEFAULT 0.060,
  ADD COLUMN IF NOT EXISTS csg_patronal_taux_reduit NUMERIC(5,4) DEFAULT 0.030,
  ADD COLUMN IF NOT EXISTS nsf_salarie NUMERIC(5,4) DEFAULT 0.015,
  ADD COLUMN IF NOT EXISTS nsf_patronal NUMERIC(5,4) DEFAULT 0.025,
  ADD COLUMN IF NOT EXISTS nsf_plafond_mensuel NUMERIC(18,2) DEFAULT 19500,
  ADD COLUMN IF NOT EXISTS training_levy NUMERIC(5,4) DEFAULT 0.010,
  ADD COLUMN IF NOT EXISTS prgf_patronal_par_jour NUMERIC(18,2) DEFAULT 4.50,
  ADD COLUMN IF NOT EXISTS prgf_taux_emoluments NUMERIC(5,4) DEFAULT 0.045,
  ADD COLUMN IF NOT EXISTS paye_seuil_exoneration NUMERIC(18,2) DEFAULT 390000,
  ADD COLUMN IF NOT EXISTS paye_taux_1 NUMERIC(5,4) DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS paye_seuil_taux_2 NUMERIC(18,2) DEFAULT 490000,
  ADD COLUMN IF NOT EXISTS paye_taux_2 NUMERIC(5,4) DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS paye_seuil_taux_3 NUMERIC(18,2) DEFAULT 590000,
  ADD COLUMN IF NOT EXISTS paye_taux_3 NUMERIC(5,4) DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS salary_compensation NUMERIC(18,2) DEFAULT 635,
  ADD COLUMN IF NOT EXISTS salary_compensation_seuil NUMERIC(18,2) DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS nit_seuil_categorie_a NUMERIC(18,2) DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS nit_seuil_categorie_b NUMERIC(18,2) DEFAULT 30000;

-- Met à jour le seuil tranche 2 (bug historique : 650000 au lieu de 490000)
-- Wrap dans DO block pour que ça marche même si aucune ligne n'existe encore.
DO $$
BEGIN
  UPDATE public.parametres_paie_mra
  SET paye_seuil_taux_2 = 490000
  WHERE paye_seuil_taux_2 = 650000;
END $$;

-- Note : pas d'INSERT automatique — les paramètres_paie_mra doivent
-- être créés par société via UI/migration dédiée (contrainte UNIQUE(societe_id)).

-- ============================================================================
-- Table cumul YTD (pour PAYE cumulatif depuis juillet, année fiscale Maurice)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.paie_cumul_ytd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  annee_fiscale INT NOT NULL,
  mois_fiscal INT NOT NULL CHECK (mois_fiscal BETWEEN 1 AND 12),
  salaire_brut_cumul NUMERIC(18,2) NOT NULL DEFAULT 0,
  paye_retenu_cumul NUMERIC(18,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employe_id, annee_fiscale, mois_fiscal)
);

CREATE INDEX IF NOT EXISTS idx_paie_cumul_employe_annee
  ON public.paie_cumul_ytd(employe_id, annee_fiscale DESC);

COMMENT ON TABLE public.paie_cumul_ytd IS
  'Cumul year-to-date du salaire brut et PAYE par employé/mois fiscal (juillet=1). Utilisé pour calcul PAYE cumulatif Maurice.';

-- Nouvelle colonne sur bulletins_paie pour référence au cumul utilisé
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS paye_ytd_cumul NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS salaire_ytd_cumul NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS nb_dependants INT DEFAULT 0;

COMMENT ON COLUMN public.bulletins_paie.paye_ytd_cumul IS
  'Cumul YTD PAYE utilisé pour calculer le PAYE du mois (depuis juillet).';
COMMENT ON COLUMN public.bulletins_paie.nb_dependants IS
  'Nombre de dépendants pour déterminer la catégorie NIT (A/B).';

-- RLS sur paie_cumul_ytd (admin + RH + accès société)
ALTER TABLE public.paie_cumul_ytd ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='paie_cumul_ytd' AND policyname='paie_cumul_access') THEN
    CREATE POLICY paie_cumul_access ON public.paie_cumul_ytd
      FOR ALL TO authenticated
      USING (
        employe_id IN (
          SELECT id FROM public.employes
          WHERE societe_id IN (SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid())
        )
      );
  END IF;
END $$;

-- END: 163_paie_mra_2026_fixes.sql
-- ============================================================================

-- ============================================================================
-- START: 164_employes_pii_encrypted_columns.sql
-- ============================================================================
-- ============================================================================
-- Migration 164: PII encryption for employees (DPA 2017 Maurice compliance)
-- ============================================================================
-- Ajoute des colonnes _encrypted pour les données sensibles (NIC, NPF, IBAN,
-- bank_account). Les colonnes existantes (clear text) restent pour migration
-- progressive : l'application doit écrire dans _encrypted, puis éventuellement
-- effacer les colonnes clear après vérification.
--
-- Stratégie : dual-write app-side pendant une période, puis purge via migration
-- finale une fois tout lu depuis _encrypted.
-- ============================================================================

ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS nic_number_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS npf_number_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS iban_encrypted TEXT;

COMMENT ON COLUMN public.employes.nic_number_encrypted IS
  'NIC chiffré AES-256-GCM via lib/crypto/pii.ts. Format: v1:iv_b64:tag_b64:cipher_b64. À lire via decryptPii().';
COMMENT ON COLUMN public.employes.npf_number_encrypted IS
  'NPF chiffré AES-256-GCM. Même format que nic_number_encrypted.';
COMMENT ON COLUMN public.employes.bank_account_encrypted IS
  'Bank account chiffré AES-256-GCM.';
COMMENT ON COLUMN public.employes.iban_encrypted IS
  'IBAN chiffré AES-256-GCM.';

-- Index sur les champs chiffrés n'est PAS possible (chaque ciphertext est unique).
-- Si recherche par NIC nécessaire, prévoir une colonne nic_hash (SHA-256) en sus.

-- Note : audit log d'accès à ces colonnes devrait être ajouté dans un trigger séparé.

-- END: 164_employes_pii_encrypted_columns.sql
-- ============================================================================

-- ============================================================================
-- START: 165_rh_quality_fixes.sql
-- ============================================================================
-- ============================================================================
-- Migration 165: RH quality fixes
-- ============================================================================
-- 1. Email employés case-insensitive (CITEXT) pour empêcher doublons par casse
-- 2. TTL sur token_signature contrats (expiration 48h)
-- 3. Historique modifications salaire (audit trail)
-- ============================================================================

-- CITEXT extension si pas déjà présente
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- 1. Email case-insensitive sur employes
-- ============================================================================
-- Stratégie adoptée : INDEX UNIQUE sur LOWER(email) au lieu de conversion CITEXT.
--
-- Raison : Postgres bloque ALTER TYPE sur une colonne référencée par des RLS
-- policies (erreur 0A000 "cannot alter type of a column used in a policy
-- definition"). Plutôt que de dropper/recréer toutes les policies dépendantes
-- (risqué — on ne connaît pas toutes leurs définitions), on utilise un index
-- fonctionnel sur LOWER(email) qui donne le même effet pratique :
--   - Unicité case-insensitive garantie côté DB
--   - Les requêtes WHERE LOWER(email) = LOWER($1) utilisent l'index
--
-- Côté application (routes auth/signer), toujours normaliser avec .toLowerCase()
-- avant lookup pour garantir match consistant.
-- ============================================================================

-- Dédoublonnage case-insensitive préalable (garde la ligne la plus récente,
-- NULL les autres pour éviter violation du nouvel index UNIQUE)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employes' AND column_name = 'email'
  ) THEN
    WITH doublons AS (
      SELECT id, email,
             ROW_NUMBER() OVER (
               PARTITION BY LOWER(email)
               ORDER BY created_at DESC NULLS LAST, id DESC
             ) AS rn
      FROM public.employes
      WHERE email IS NOT NULL AND email <> ''
    )
    UPDATE public.employes
    SET email = NULL
    WHERE id IN (SELECT id FROM doublons WHERE rn > 1);

    RAISE NOTICE '[mig 165] Dédoublonnage email case-insensitive effectué (doublons mis à NULL).';
  END IF;
END $$;

-- Index UNIQUE fonctionnel sur LOWER(email) — case-insensitive sans changer le type
DROP INDEX IF EXISTS public.uq_employes_email_ci;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employes_email_ci
  ON public.employes (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

COMMENT ON INDEX public.uq_employes_email_ci IS
  'Unicité case-insensitive de employes.email via LOWER(). Plus portable que CITEXT (évite conflit policies RLS).';

-- ============================================================================
-- 2. TTL sur token_signature des contrats employés
-- ============================================================================

ALTER TABLE public.contrats_employes
  ADD COLUMN IF NOT EXISTS token_signature_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_signature_attempts INT DEFAULT 0;

-- Set expiration à 48h pour les tokens existants (NULL = jamais expiré = risque)
UPDATE public.contrats_employes
SET token_signature_expires_at = created_at + INTERVAL '48 hours'
WHERE token_signature IS NOT NULL AND token_signature_expires_at IS NULL;

COMMENT ON COLUMN public.contrats_employes.token_signature_expires_at IS
  'Expiration du token de signature (48h par défaut). Vérifier avant d''accepter une signature.';
COMMENT ON COLUMN public.contrats_employes.token_signature_attempts IS
  'Nombre de tentatives de signature (max 3 avant blocage).';

-- ============================================================================
-- 3. Historique salaire (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.historique_salaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  ancien_salaire NUMERIC(18,2),
  nouveau_salaire NUMERIC(18,2) NOT NULL,
  date_effet DATE NOT NULL DEFAULT CURRENT_DATE,
  motif TEXT,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historique_salaires_employe
  ON public.historique_salaires(employe_id, changed_at DESC);

ALTER TABLE public.historique_salaires ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='historique_salaires' AND policyname='hist_sal_read') THEN
    CREATE POLICY hist_sal_read ON public.historique_salaires
      FOR SELECT TO authenticated
      USING (
        employe_id IN (
          SELECT id FROM public.employes
          WHERE societe_id IN (SELECT societe_id FROM public.user_societes WHERE user_id = auth.uid())
        )
      );
  END IF;
END $$;

-- Trigger qui log les changements de salaire sur employes
CREATE OR REPLACE FUNCTION fn_log_salaire_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.salaire_base IS DISTINCT FROM NEW.salaire_base THEN
    BEGIN
      INSERT INTO public.historique_salaires (
        employe_id, ancien_salaire, nouveau_salaire, date_effet, changed_by
      ) VALUES (
        NEW.id, OLD.salaire_base, NEW.salaire_base, CURRENT_DATE, auth.uid()
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[fn_log_salaire_change] failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_salaire_change ON public.employes;
CREATE TRIGGER trg_log_salaire_change
AFTER UPDATE OF salaire_base ON public.employes
FOR EACH ROW
EXECUTE FUNCTION fn_log_salaire_change();

-- ============================================================================
-- 4. Verrouillage automatique bulletins post-paiement
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_verrouille_bulletin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Quand un bulletin passe en statut 'paye' ou 'declare_mra', le verrouille
  IF TG_OP = 'UPDATE' AND OLD.statut IS DISTINCT FROM NEW.statut
     AND NEW.statut IN ('paye', 'declare_mra')
     AND (NEW.verrouille IS NULL OR NEW.verrouille = false) THEN
    NEW.verrouille = true;
    NEW.date_verrouillage = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_verrouille_bulletin ON public.bulletins_paie;
CREATE TRIGGER trg_auto_verrouille_bulletin
BEFORE UPDATE OF statut ON public.bulletins_paie
FOR EACH ROW
EXECUTE FUNCTION fn_auto_verrouille_bulletin();

COMMENT ON FUNCTION fn_auto_verrouille_bulletin IS
  'Verrouille automatiquement un bulletin quand son statut passe à paye/declare_mra.';

-- END: 165_rh_quality_fixes.sql
-- ============================================================================

-- ============================================================================
-- START: 166_batch_reanalyze_jobs.sql
-- ============================================================================
-- Table pour tracker les jobs de batch re-analyse OCR
-- Admin-only : permet de relancer l'extraction IA sur un ensemble de documents
-- déjà uploadés, pour tester les améliorations du pipeline (validation-rules,
-- confidence-scorer, suggest-account, workflow_action).
CREATE TABLE IF NOT EXISTS public.batch_reanalyze_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  societe_id UUID REFERENCES public.societes(id) ON DELETE SET NULL,
  filters JSONB,
  total_documents INT NOT NULL DEFAULT 0,
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  stats JSONB DEFAULT '{}'::jsonb,
  errors JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_reanalyze_status ON public.batch_reanalyze_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_reanalyze_initiator ON public.batch_reanalyze_jobs(initiated_by);

COMMENT ON TABLE public.batch_reanalyze_jobs IS 'Tracker des jobs de batch re-analyse OCR (admin-only). Utile pour monitoring + audit.';

ALTER TABLE public.batch_reanalyze_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='batch_reanalyze_jobs' AND policyname='batch_jobs_admin_read') THEN
    CREATE POLICY batch_jobs_admin_read ON public.batch_reanalyze_jobs
      FOR SELECT TO authenticated
      USING (
        initiated_by = auth.uid()
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin','super_admin')
      );
  END IF;
END $$;

-- END: 166_batch_reanalyze_jobs.sql
-- ============================================================================

-- ============================================================================
-- VÉRIFICATIONS POST-MIGRATION (run after all the above)
-- ============================================================================

-- 1. Toutes les nouvelles tables existent
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'paie_cumul_ytd',
    'invoice_settings',
    'alertes_user_state',
    'relances_factures',
    'lettres_operations',
    'historique_salaires',
    'batch_reanalyze_jobs',
    'factures_approbations_historique',
    'factures_doublons_detectes'
  )
ORDER BY tablename;

-- 2. Vérifier colonnes MRA 2026 sur parametres_paie_mra
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'parametres_paie_mra'
  AND column_name IN (
    'paye_seuil_taux_3','paye_taux_3','nsf_plafond_mensuel',
    'csg_patronal_taux_reduit','nit_seuil_categorie_a','nit_seuil_categorie_b'
  )
ORDER BY column_name;

-- 3. Vérifier colonnes PII _encrypted sur employes
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'employes'
  AND column_name LIKE '%_encrypted';

-- 4. Vérifier colonnes MRA sur factures
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'factures'
  AND column_name IN ('mra_response_raw','mra_signature','numero_sequence','exercice','statut_workflow');

-- 5. Vérifier le trigger R7 (anti-lettrage classes 6/7)
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_enforce_r7_lettre_v2','trg_log_lettre_change','trg_auto_verrouille_bulletin','trg_log_salaire_change','trg_factures_log_statut_workflow');

-- 6. Vérifier les policies RGPD trajets (devrait trouver 4+ nouvelles policies)
SELECT policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('trajets_kilometriques','trajet_steps','parametres_km','employe_positions')
ORDER BY tablename, policyname;

-- 7. Vérifier la fonction MRA cumul YTD
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_next_facture_number','normalize_numero','fn_sync_contrats_montant',
    'fn_log_lettre_change','fn_enforce_r7_no_lettre_resultat',
    'fn_solde_compte_at_date','fn_soldes_par_classe','fn_refresh_mv_soldes',
    'fn_current_employe_id','fn_current_role',
    'fn_log_salaire_change','fn_auto_verrouille_bulletin'
  )
ORDER BY routine_name;

-- Si tout retourne le nombre de lignes attendu ci-dessus, les migrations sont OK.
