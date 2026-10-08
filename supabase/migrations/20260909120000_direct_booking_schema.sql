-- =============================================================================
-- Direct customer booking flow — schema (Website / same Supabase project)
-- Creates the booking plumbing on top of the existing web-app schema. Existing
-- tables (Learner, Instructor, Courses, Serviceable_Areas, Schedule, enrollment,
-- payment, app_settings) are only extended with new columns; nothing existing is
-- modified or dropped. RPC-only slot reservation keeps concurrency safe and
-- gated to the service role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. booking_addons — centrally managed add-on catalogue (DB-driven pricing)
-- -----------------------------------------------------------------------------
create table if not exists public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price numeric(10, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_addons_active on public.booking_addons (active) where active;

-- -----------------------------------------------------------------------------
-- 2. course_addons — which add-ons apply to which course (+ "included" grouping)
-- -----------------------------------------------------------------------------
create table if not exists public.course_addons (
  course_id uuid not null references public."Courses"(id) on delete cascade,
  addon_id uuid not null references public.booking_addons(id) on delete cascade,
  included boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (course_id, addon_id)
);

-- -----------------------------------------------------------------------------
-- 3. enrollment_addons — purchased add-ons with price snapshots (price history)
-- -----------------------------------------------------------------------------
create table if not exists public.enrollment_addons (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollment(id) on delete cascade,
  addon_id uuid references public.booking_addons(id) on delete set null,
  name_snapshot text not null,
  price_snapshot numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_enrollment_addons_enrollment_id on public.enrollment_addons (enrollment_id);
create index if not exists idx_enrollment_addons_addon_id on public.enrollment_addons (addon_id);

-- -----------------------------------------------------------------------------
-- 4. booking — idempotency anchor + price/selection snapshot for the whole flow
-- -----------------------------------------------------------------------------
create table if not exists public.booking (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  learner_id uuid not null references public."Learner"(id) on delete cascade,
  area_id uuid references public."Serviceable_Areas"(id) on delete restrict,
  area_name text not null,
  course_id uuid references public."Courses"(id) on delete restrict,
  course_name text not null,
  course_price numeric(10, 2) not null default 0,
  "has_a_DL" boolean not null default false,
  two_wheeler_license_state text check (
    two_wheeler_license_state is null or
    two_wheeler_license_state in ('none', 'll_only', 'active_dl')
  ),
  female_instructor_preference boolean not null default false,
  base_amount numeric(10, 2) not null default 0,
  addons_amount numeric(10, 2) not null default 0,
  discount_amount numeric(10, 2) not null default 0,
  total_amount numeric(10, 2) not null default 0,
  installment_mode text not null default 'full' check (
    installment_mode in ('full', 'first_half')
  ),
  installment1_amount numeric(10, 2),
  installment2_amount numeric(10, 2),
  gateway text not null default 'razorpay' check (gateway in ('razorpay', 'icici')),
  return_origin text not null default 'website',
  selected_slots jsonb not null default '[]'::jsonb,
  status text not null default 'created' check (
    status in ('created', 'payment_completed', 'confirmed', 'conflict', 'failed', 'abandoned')
  ),
  gateway_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_booking_learner_id on public.booking (learner_id);
create index if not exists idx_booking_status on public.booking (status);
create index if not exists idx_booking_created_at on public.booking (created_at);

-- -----------------------------------------------------------------------------
-- 6. Existing-table extensions (IF NOT EXISTS — safe on the live DB)
-- -----------------------------------------------------------------------------
alter table public."Instructor"
  add column if not exists gender text;

alter table public."Learner"
  add column if not exists two_wheeler_license_state text check (
    two_wheeler_license_state is null or
    two_wheeler_license_state in ('none', 'll_only', 'active_dl')
  );

alter table public."Schedule"
  add column if not exists booking_id uuid references public.booking(id) on delete set null;

alter table public."Schedule"
  add column if not exists payment_id uuid references public.payment(id) on delete set null;

create index if not exists idx_schedule_booking_id on public."Schedule" (booking_id) where booking_id is not null;
create index if not exists idx_schedule_payment_id on public."Schedule" (payment_id) where payment_id is not null;

-- -----------------------------------------------------------------------------
-- 7. Row level security — new tables are read/write for the service role only.
--    No policies are created, so anon/authenticated are denied by default.
-- -----------------------------------------------------------------------------
alter table public.booking_addons enable row level security;
alter table public.course_addons enable row level security;
alter table public.enrollment_addons enable row level security;
alter table public.booking enable row level security;

-- -----------------------------------------------------------------------------
-- 8. reserve_booking_slots — atomic, serialized slot hold (status pending_payment).
--    Locks potentially-conflicting rows before inserting, and the pre-existing
--    schedule_no_overlap_new_rows exclusion constraint is the backstop for races.
--    On any conflict the function sub-transaction rolls back, so no partial
--    reservations are ever left behind.
-- -----------------------------------------------------------------------------
create or replace function public.reserve_booking_slots(
  p_booking_id uuid,
  p_learner_id uuid,
  p_course_id uuid,
  p_slots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot record;
  v_reserved integer := 0;
begin
  -- Serialize concurrent calls for the same booking.
  perform 1 from public.booking b where b.id = p_booking_id for update;

  for v_slot in
    select *
    from jsonb_to_recordset(p_slots) as t(
      date date,
      start_time time,
      end_time time,
      instructor_id uuid
    )
  loop
    -- Lock any conflicting schedule for this instructor so two concurrent
    -- reservations serialize on the same rows.
    perform 1
    from public."Schedule" s
    where s.instructor_id = v_slot.instructor_id
      and s.date = v_slot.date
      and s.status not in ('cancelled', 'rejected')
      and s.start_time < v_slot.end_time
      and v_slot.start_time < s.end_time
    for update;

    if found then
      return jsonb_build_object(
        'ok', false,
        'error', 'slot_conflict',
        'message', 'This time slot is no longer available. Please choose another slot.',
        'slot', jsonb_build_object(
          'date', v_slot.date,
          'start_time', v_slot.start_time,
          'end_time', v_slot.end_time
        )
      );
    end if;

    insert into public."Schedule" (
      learner_id, instructor_id, course_id, lesson_id,
      date, start_time, end_time, status, enabled, booking_id, payment_id
    )
    values (
      p_learner_id, v_slot.instructor_id, p_course_id, null,
      v_slot.date, v_slot.start_time, v_slot.end_time,
      'pending_payment', false, p_booking_id, null
    );

    v_reserved := v_reserved + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reserved', v_reserved,
    'booking_id', p_booking_id
  );
exception
  when exclusion_violation then
    return jsonb_build_object(
      'ok', false,
      'error', 'slot_conflict',
      'message', 'This time slot was just taken by someone else. Please choose another slot.'
    );
end;
$$;

revoke all on function public.reserve_booking_slots(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_booking_slots(uuid, uuid, uuid, jsonb)
  to service_role;