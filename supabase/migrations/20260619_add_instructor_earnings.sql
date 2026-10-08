-- Instructor Earnings domain
-- Adds the data layer behind the instructor Earnings screens (Earnings Home,
-- More ways to earn, My earnings comparison) and the admin Instructor Earnings
-- tooling.
--
-- Model: earnings are COMPUTED on read from completed Schedule rows × a
-- per-class rate, plus an adjustments layer so admins/KAMs can correct or top up
-- anything manually. Persisted here are: global config, per-instructor rate /
-- target overrides, the earning-opportunity cards (Screen 2), payout runs, and
-- manual adjustments / bonuses.
--
-- RLS note: the instructor app reads with the anon key keyed by phone (same as
-- the existing Instructor / Schedule tables, which have no per-row scoping), so
-- these tables expose a public SELECT policy and restrict writes to admins —
-- mirroring the KAM domain (20260527_add_kam_domain.sql) but with read access.

-- ---------------------------------------------------------------------------
-- 1. earning_config — singleton global config (one row, id = 1)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS earning_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    default_per_class_rate NUMERIC(10, 2) NOT NULL DEFAULT 425,
    default_monthly_target INT NOT NULL DEFAULT 30,
    payout_day TEXT NOT NULL DEFAULT 'Monday',
    leaderboard_top_n INT NOT NULL DEFAULT 10,
    leaderboard_bonus_amount NUMERIC(10, 2) NOT NULL DEFAULT 1500,
    tip_copy TEXT,
    availability_message_template TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO earning_config (
    id, default_per_class_rate, default_monthly_target, payout_day,
    leaderboard_top_n, leaderboard_bonus_amount, tip_copy,
    availability_message_template
)
VALUES (
    1, 425, 30, 'Monday', 10, 1500,
    'Quick tip: Most referrals happen after the final class. Ask your learner if they know someone who needs driving lessons before you drop them off.',
    'Hi, this is {name}. I have free slots this week and I''m available to take extra classes. Please assign me more lessons when demand picks up in my area.'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. instructor_earning_settings — per-instructor overrides (NULL = use global)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS instructor_earning_settings (
    instructor_id UUID PRIMARY KEY REFERENCES "Instructor"(id_instructor) ON DELETE CASCADE,
    per_class_rate NUMERIC(10, 2),
    monthly_class_target INT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. earning_program — drives the "More ways to earn" cards (Screen 2)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS earning_program (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    amount_label TEXT,
    status_pill TEXT NOT NULL DEFAULT 'active'
        CHECK (status_pill IN ('active', 'new', 'coming_soon')),
    cta_label TEXT,
    cta_url TEXT,
    icon_bg TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO earning_program
    (key, title, description, amount_label, status_pill, cta_label, cta_url, icon_bg, is_active, sort_order)
VALUES
    ('refer_learner', 'Refer a new learner',
     'Share your referral link. You get paid when they book their first class.',
     '₹500 per referral', 'active', 'Get my link', '', '#E8FAF3', true, 1),
    ('refer_instructor', 'Refer a new instructor',
     'Know someone who can teach? Refer them and earn when they complete onboarding.',
     '₹3000 per instructor (after 50 classes)', 'new', 'Learn more', '', '#FFF4CC', true, 2),
    ('leaderboard_bonus', 'Monthly top instructor bonus',
     'Finish in the top 10 instructors by classes completed this month.',
     '₹1500 bonus', 'active', 'See ranks', '', '#EFE8FF', true, 3),
    ('lane_cars', 'Refer a car buyer',
     'Earn commission when your learners buy through Lane Cars.',
     '₹1500 per sale', 'coming_soon', '', '', '#F0F0F0', false, 4)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. instructor_payout — weekly payout runs (the disbursement ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS instructor_payout (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES "Instructor"(id_instructor) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    classes_count INT NOT NULL DEFAULT 0,
    per_class_rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
    gross_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    adjustments_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    payout_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (instructor_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_instructor_payout_instructor ON instructor_payout (instructor_id);
CREATE INDEX IF NOT EXISTS idx_instructor_payout_period ON instructor_payout (period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_instructor_payout_status ON instructor_payout (status);

-- ---------------------------------------------------------------------------
-- 5. instructor_earning_adjustment — manual corrections / bonuses / referrals
--    This is the "admin can change anything" + discrepancy-resolution layer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS instructor_earning_adjustment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL REFERENCES "Instructor"(id_instructor) ON DELETE CASCADE,
    payout_id UUID REFERENCES instructor_payout(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'adjustment'
        CHECK (type IN ('adjustment', 'bonus', 'referral', 'correction')),
    amount NUMERIC(10, 2) NOT NULL,
    reason TEXT,
    effective_date DATE NOT NULL,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_earning_adjustment_instructor ON instructor_earning_adjustment (instructor_id);
CREATE INDEX IF NOT EXISTS idx_earning_adjustment_payout ON instructor_earning_adjustment (payout_id);
CREATE INDEX IF NOT EXISTS idx_earning_adjustment_date ON instructor_earning_adjustment (effective_date);

-- ---------------------------------------------------------------------------
-- updated_at trigger (shared)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_earnings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_earning_config_updated_at ON earning_config;
CREATE TRIGGER trg_earning_config_updated_at
    BEFORE UPDATE ON earning_config
    FOR EACH ROW EXECUTE FUNCTION update_earnings_updated_at();

DROP TRIGGER IF EXISTS trg_instructor_earning_settings_updated_at ON instructor_earning_settings;
CREATE TRIGGER trg_instructor_earning_settings_updated_at
    BEFORE UPDATE ON instructor_earning_settings
    FOR EACH ROW EXECUTE FUNCTION update_earnings_updated_at();

DROP TRIGGER IF EXISTS trg_earning_program_updated_at ON earning_program;
CREATE TRIGGER trg_earning_program_updated_at
    BEFORE UPDATE ON earning_program
    FOR EACH ROW EXECUTE FUNCTION update_earnings_updated_at();

DROP TRIGGER IF EXISTS trg_instructor_payout_updated_at ON instructor_payout;
CREATE TRIGGER trg_instructor_payout_updated_at
    BEFORE UPDATE ON instructor_payout
    FOR EACH ROW EXECUTE FUNCTION update_earnings_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: public read (instructor app reads via anon key), admin-only writes.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'earning_config',
        'instructor_earning_settings',
        'earning_program',
        'instructor_payout',
        'instructor_earning_adjustment'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

        EXECUTE format('DROP POLICY IF EXISTS "Anyone can read %1$s" ON %1$I;', tbl);
        EXECUTE format(
            'CREATE POLICY "Anyone can read %1$s" ON %1$I FOR SELECT USING (true);',
            tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS "Admins manage %1$s" ON %1$I;', tbl);
        EXECUTE format(
            'CREATE POLICY "Admins manage %1$s" ON %1$I FOR ALL USING (EXISTS (' ||
            'SELECT 1 FROM "Admin" WHERE "Admin".phone = auth.jwt()->>''phone'' ' ||
            'AND ("Admin".is_admin = true OR "Admin".is_super_admin = true)));',
            tbl
        );
    END LOOP;
END $$;
