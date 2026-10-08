drop policy "Enable read access for all users" on "public"."Courses";

alter table "public"."Courses" enable row level security;

create policy "Enable read access for all users"
on "public"."Courses"
as permissive
for select
to public
using (true);



