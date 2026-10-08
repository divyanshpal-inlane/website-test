create table if not exists public."demo-payments" (
    id uuid primary key default gen_random_uuid(),
    name text,
    phone text,
    course text,
    amount numeric,
    status text,
    created_at timestamptz default now()
);