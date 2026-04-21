-- ============================================================================
-- Migration 162 — Garde-fou : warning (non-bloquant) sur INSERT bare 3-digits
-- ============================================================================
--
-- Contexte : migrations 158-160 ont corrigé tous les chemins connus qui
-- écrivaient en codes 3-digits bare (421, 431, 432, 444). Pour éviter une
-- régression future (nouveau pipeline qui oublie de migrer vers PCM 4-digits),
-- on ajoute un trigger BEFORE INSERT qui REMAPPE silencieusement les 3-digits
-- connus vers leur équivalent 4-digits le plus probable, en loggant un WARNING
-- qui sera visible dans les logs Supabase.
--
-- IMPORTANT : non-bloquant. On préfère une écriture sur un compte approché
-- remappé à une erreur qui stopperait la paie / la génération d'écritures.
-- Les warnings doivent être surveillés et le pipeline corrigé à la source.
--
-- Remaps 3-digit → 4-digit (approximations par défaut) :
--   421 → 4210 (salaires nets à payer)
--   431 → 4312 (NSF salarié, le + fréquent ; ambigu, warning levé)
--   432 → 4323 (PRGF, ambigu, warning levé)
--   433 → 4330 (PAYE)
--   444 → 4330 (PAYE)
--
-- Pour `431` et `432`, le remap par libellé reste préférable — on retente dans
-- le trigger si le libellé contient un mot-clé clair.
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_warn_legacy_3digit_compte()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_remapped TEXT;
  v_nom      TEXT;
BEGIN
  -- Ne touche pas si le code est déjà normé (4+ chiffres) ou non pertinent
  IF NEW.numero_compte IS NULL OR LENGTH(NEW.numero_compte) <> 3 THEN
    RETURN NEW;
  END IF;

  -- Mapping best-effort
  IF NEW.numero_compte = '421' THEN
    v_remapped := '4210';
    v_nom      := 'Salaires nets à payer';
  ELSIF NEW.numero_compte = '431' THEN
    -- Essaie d'affiner par libellé
    IF NEW.libelle ILIKE '%CSG salarie%' OR NEW.libelle ILIKE '%CSG salarié%' THEN
      v_remapped := '4311'; v_nom := 'CSG salarié à verser';
    ELSIF NEW.libelle ILIKE '%NSF salarie%' OR NEW.libelle ILIKE '%NSF salarié%' THEN
      v_remapped := '4312'; v_nom := 'NSF salarié à verser';
    ELSIF NEW.libelle ILIKE '%CSG patronal%' THEN
      v_remapped := '4321'; v_nom := 'CSG patronal à verser';
    ELSIF NEW.libelle ILIKE '%NSF patronal%' THEN
      v_remapped := '4322'; v_nom := 'NSF patronal à verser';
    ELSE
      v_remapped := '4312'; v_nom := 'NSF salarié à verser (fallback)';
    END IF;
  ELSIF NEW.numero_compte = '432' THEN
    IF NEW.libelle ILIKE '%PRGF%' THEN
      v_remapped := '4323'; v_nom := 'PRGF à verser';
    ELSIF NEW.libelle ILIKE '%Training%' OR NEW.libelle ILIKE '%Levy%' OR NEW.libelle ILIKE '%HRDC%' THEN
      v_remapped := '4324'; v_nom := 'Training Levy HRDC à verser';
    ELSE
      v_remapped := '4323'; v_nom := 'PRGF à verser (fallback)';
    END IF;
  ELSIF NEW.numero_compte = '433' OR NEW.numero_compte = '444' THEN
    v_remapped := '4330';
    v_nom      := 'PAYE à reverser à la MRA';
  ELSE
    -- Pas un 3-digit connu, ne touche pas
    RETURN NEW;
  END IF;

  RAISE WARNING '[legacy-3digit] INSERT ecriture societe=% ref_folio=% journal=% compte legacy "%" remappé vers "%" (libelle: "%"). Le pipeline d''origine devrait utiliser directement le code PCM 4-digits.',
    NEW.societe_id, NEW.ref_folio, NEW.journal,
    NEW.numero_compte, v_remapped, LEFT(COALESCE(NEW.libelle, ''), 60);

  NEW.numero_compte := v_remapped;
  IF NEW.nom_compte IS NULL OR NEW.nom_compte = '' THEN
    NEW.nom_compte := v_nom;
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION trg_warn_legacy_3digit_compte IS
  'Garde-fou non-bloquant : remappe silencieusement 421/431/432/433/444 (codes '
  '3-digits bare) vers leur équivalent PCM 4-digits + log WARNING. À combiner '
  'avec tr_ecritures_remap_pcm (mig 144) pour les codes 6-digits legacy.';

-- Le trigger doit s'exécuter AVANT tr_ecritures_remap_pcm pour que les valeurs
-- soient déjà en 4-digits quand la table compte_remap_pcm est consultée.
-- En PostgreSQL, les triggers d'un même timing/event s'exécutent par ordre
-- alphabétique du nom → on préfixe avec `00_` pour garantir la priorité.
DROP TRIGGER IF EXISTS tr_00_legacy_3digit_warn ON public.ecritures_comptables_v2;
CREATE TRIGGER tr_00_legacy_3digit_warn
  BEFORE INSERT OR UPDATE OF numero_compte ON public.ecritures_comptables_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_warn_legacy_3digit_compte();
