-- KAM (Key Account Manager) domain
-- Adds:
--   1. KAM table — admin-managed list of key account managers
--   2. kam_instructor join table — many-to-many between KAMs and instructors
--   3. RLS policies matching the admin_permissions pattern (admins read, super admins write)

CREATE TABLE IF NOT EXISTS "KAM" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kam_name ON "KAM" (name);

CREATE TABLE IF NOT EXISTS kam_instructor (
    kam_id UUID NOT NULL REFERENCES "KAM"(id) ON DELETE CASCADE,
    instructor_id UUID NOT NULL REFERENCES "Instructor"(id_instructor) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (kam_id, instructor_id)
);

CREATE INDEX IF NOT EXISTS idx_kam_instructor_instructor ON kam_instructor (instructor_id);

-- RLS

ALTER TABLE "KAM" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view KAMs" ON "KAM";
CREATE POLICY "Admins can view KAMs"
    ON "KAM" FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM "Admin"
        WHERE "Admin".phone = auth.jwt()->>'phone'
    ));

DROP POLICY IF EXISTS "Admins can manage KAMs" ON "KAM";
CREATE POLICY "Admins can manage KAMs"
    ON "KAM" FOR ALL
    USING (EXISTS (
        SELECT 1 FROM "Admin"
        WHERE "Admin".phone = auth.jwt()->>'phone'
        AND ("Admin".is_admin = true OR "Admin".is_super_admin = true)
    ));

ALTER TABLE kam_instructor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view kam_instructor" ON kam_instructor;
CREATE POLICY "Admins can view kam_instructor"
    ON kam_instructor FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM "Admin"
        WHERE "Admin".phone = auth.jwt()->>'phone'
    ));

DROP POLICY IF EXISTS "Admins can manage kam_instructor" ON kam_instructor;
CREATE POLICY "Admins can manage kam_instructor"
    ON kam_instructor FOR ALL
    USING (EXISTS (
        SELECT 1 FROM "Admin"
        WHERE "Admin".phone = auth.jwt()->>'phone'
        AND ("Admin".is_admin = true OR "Admin".is_super_admin = true)
    ));

-- updated_at trigger for KAM
CREATE OR REPLACE FUNCTION update_kam_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kam_updated_at ON "KAM";
CREATE TRIGGER trg_kam_updated_at
    BEFORE UPDATE ON "KAM"
    FOR EACH ROW
    EXECUTE FUNCTION update_kam_updated_at();
