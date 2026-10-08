drop policy "Enable read access for all users" on "public"."Courses";

create policy "Enable read access for all users"
on "public"."Courses"
as permissive
for select
to anon
using (true);



