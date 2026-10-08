create type time_slot as enum ('6-9', '9-12', '12-15', '15-18', '18-21');
create type preference_level as enum ('preferred', 'available', 'unavailable');

create table schedule_preferences (
  id uuid default gen_random_uuid() primary key,
  learner_id uuid references auth.users(id) not null,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday, 6 = Saturday
  time_slot time_slot not null,
  preference preference_level not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (learner_id, day_of_week, time_slot)
);

-- Add RLS policies
alter table schedule_preferences enable row level security;

create policy "Users can view their own preferences"
  on schedule_preferences for select
  using (auth.uid() = learner_id);

create policy "Users can insert their own preferences"
  on schedule_preferences for insert
  with check (auth.uid() = learner_id);

create policy "Users can update their own preferences"
  on schedule_preferences for update
  using (auth.uid() = learner_id)
  with check (auth.uid() = learner_id);

create policy "Users can delete their own preferences"
  on schedule_preferences for delete
  using (auth.uid() = learner_id);

-- Add function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger update_schedule_preferences_updated_at
  before update on schedule_preferences
  for each row
  execute function update_updated_at_column();

-- Add policy for admins to view all preferences
create policy "Admins can view all preferences"
  on schedule_preferences for select
  using (
    exists (
      select 1
      from auth.users
      where auth.users.id = auth.uid()
      and auth.users.role = 'admin'
    )
  );

-- Add policy for admins to manage all preferences
create policy "Admins can manage all preferences"
  on schedule_preferences for all
  using (
    exists (
      select 1
      from auth.users
      where auth.users.id = auth.uid()
      and auth.users.role = 'admin'
    )
  );
