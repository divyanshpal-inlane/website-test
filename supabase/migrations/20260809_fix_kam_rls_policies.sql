-- Fix KAM and kam_instructor RLS policies
--
-- Root cause of the "0 managers" bug:
--
-- 1. The original policies used a bare phone equality check:
--      WHERE "Admin".phone = auth.jwt()->>'phone'
--    This fails whenever the Admin record and the JWT use different phone formats:
--      • Manually inserted rows store 10-digit phones  (e.g. '9831270111')
--      • Supabase JWTs carry E.164 format              (e.g. '+919831270111')
--
-- 2. "user" role accounts (team members created by admins) are stored in the
--    "User" table, not the "Admin" table. The original policies only checked
--    "Admin", so user-role accounts always got 0 results.
--
-- 3. Attempting to fix (2) by adding an EXISTS subquery on "User" inside the
--    RLS USING clause still fails because PostgreSQL applies the "User" table's
--    OWN RLS to that subquery ("Users can view their own data": exact phone
--    comparison). In some configurations the inner RLS blocks the row before
--    the outer normalized comparison can run.
--
-- Fix: use a SECURITY DEFINER helper function that bypasses all nested RLS.
--   • SECURITY DEFINER runs as the function owner (postgres / db-owner), so
--     it can freely read "Admin" and "User" tables without row-level filtering.
--   • Two functions cover the two access levels:
--       is_admin_or_team_member()   — SELECT (read) access for everyone
--       is_admin_with_write_access() — INSERT/UPDATE/DELETE for admins only

-- ── Helper: read access ────────────────────────────────────────────────────
-- Returns TRUE when the current JWT belongs to:
--   a) An Admin row (matched by UUID or by last-10-digit phone normalization)
--   b) A User  row (team member, matched by last-10-digit phone normalization)

CREATE OR REPLACE FUNCTION public.is_admin_or_team_member()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- (a) Admin: UUID match (reliable for DB-created admins) or normalised phone
    IF EXISTS (
        SELECT 1 FROM "Admin"
        WHERE
            "Admin".id = auth.uid()
            OR (
                auth.jwt()->>'phone' IS NOT NULL
                AND RIGHT(REGEXP_REPLACE("Admin".phone,        '[^0-9]', '', 'g'), 10)
                  = RIGHT(REGEXP_REPLACE(auth.jwt()->>'phone', '[^0-9]', '', 'g'), 10)
            )
    ) THEN
        RETURN true;
    END IF;

    -- (b) Team member ("user" role): normalised phone in "User" table
    IF auth.jwt()->>'phone' IS NOT NULL AND EXISTS (
        SELECT 1 FROM "User"
        WHERE RIGHT(REGEXP_REPLACE("User".phone,          '[^0-9]', '', 'g'), 10)
            = RIGHT(REGEXP_REPLACE(auth.jwt()->>'phone',  '[^0-9]', '', 'g'), 10)
    ) THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$$;

-- ── Helper: write access ───────────────────────────────────────────────────
-- Returns TRUE only for admins with is_admin = true OR is_super_admin = true.
-- "user" role team members are intentionally excluded (read-only on KAM data).

CREATE OR REPLACE FUNCTION public.is_admin_with_write_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "Admin"
        WHERE (
            "Admin".id = auth.uid()
            OR (
                auth.jwt()->>'phone' IS NOT NULL
                AND RIGHT(REGEXP_REPLACE("Admin".phone,        '[^0-9]', '', 'g'), 10)
                  = RIGHT(REGEXP_REPLACE(auth.jwt()->>'phone', '[^0-9]', '', 'g'), 10)
            )
        )
        AND ("Admin".is_admin = true OR "Admin".is_super_admin = true)
    );
END;
$$;

-- ── KAM table ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can view KAMs" ON "KAM";
CREATE POLICY "Admins can view KAMs"
    ON "KAM" FOR SELECT
    USING (public.is_admin_or_team_member());

DROP POLICY IF EXISTS "Admins can manage KAMs" ON "KAM";
CREATE POLICY "Admins can manage KAMs"
    ON "KAM" FOR ALL
    USING (public.is_admin_with_write_access());

-- ── kam_instructor table ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can view kam_instructor" ON kam_instructor;
CREATE POLICY "Admins can view kam_instructor"
    ON kam_instructor FOR SELECT
    USING (public.is_admin_or_team_member());

DROP POLICY IF EXISTS "Admins can manage kam_instructor" ON kam_instructor;
CREATE POLICY "Admins can manage kam_instructor"
    ON kam_instructor FOR ALL
    USING (public.is_admin_with_write_access());
