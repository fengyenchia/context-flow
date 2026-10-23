-- Remove the runtime fallback without destroying the only copy of legacy data.
-- After comparing normalized data, the archived table can be removed manually.
DO $$
BEGIN
  IF to_regclass('public.app_state') IS NOT NULL THEN
    IF to_regclass('public.app_state_legacy_backup') IS NOT NULL THEN
      RAISE EXCEPTION 'Both legacy tables exist; compare them before migrating';
    END IF;
    ALTER TABLE public.app_state RENAME TO app_state_legacy_backup;
  END IF;
END $$;
