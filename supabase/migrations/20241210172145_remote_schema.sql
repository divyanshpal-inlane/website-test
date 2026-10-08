

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS "pgsodium";
CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."enrollment_status" AS ENUM (
    'pending',
    'active',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."enrollment_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_type" AS ENUM (
    'course',
    'reschedule'
);


ALTER TYPE "public"."payment_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN 'error: access denied';
      ELSE        
        update auth.users set raw_app_meta_data = 
          raw_app_meta_data - claim where id = uid;
        return 'OK';
      END IF;
    END;
$$;


ALTER FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    DECLARE retval jsonb;
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN '{"error":"access denied"}'::jsonb;
      ELSE
        select coalesce(raw_app_meta_data->claim, null) from auth.users into retval where id = uid::uuid;
        return retval;
      END IF;
    END;
$$;


ALTER FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_claims"("uid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    DECLARE retval jsonb;
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN '{"error":"access denied"}'::jsonb;
      ELSE
        select raw_app_meta_data from auth.users into retval where id = uid::uuid;
        return retval;
      END IF;
    END;
$$;


ALTER FUNCTION "public"."get_claims"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_claim"("claim" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  	coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' -> claim, null)
$$;


ALTER FUNCTION "public"."get_my_claim"("claim" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_claims"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select 
  	coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata', '{}'::jsonb)::jsonb
$$;


ALTER FUNCTION "public"."get_my_claims"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_claims_admin"() RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
  BEGIN
    IF session_user = 'authenticator' THEN
      --------------------------------------------
      -- To disallow any authenticated app users
      -- from editing claims, delete the following
      -- block of code and replace it with:
      -- RETURN FALSE;
      --------------------------------------------
      IF extract(epoch from now()) > coalesce((current_setting('request.jwt.claims', true)::jsonb)->>'exp', '0')::numeric THEN
        return false; -- jwt expired
      END IF;
      If current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
        RETURN true; -- service role users have admin rights
      END IF;
      IF coalesce((current_setting('request.jwt.claims', true)::jsonb)->'app_metadata'->'claims_admin', 'false')::bool THEN
        return true; -- user has claims_admin set to true
      ELSE
        return false; -- user does NOT have claims_admin set to true
      END IF;
      --------------------------------------------
      -- End of block 
      --------------------------------------------
    ELSE -- not a user session, probably being called from a trigger or something
      return true;
    END IF;
  END;
$$;


ALTER FUNCTION "public"."is_claims_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    BEGIN
      IF NOT is_claims_admin() THEN
          RETURN 'error: access denied';
      ELSE        
        update auth.users set raw_app_meta_data = 
          raw_app_meta_data || 
            json_build_object(claim, value)::jsonb where id = uid;
        return 'OK';
      END IF;
    END;
$$;


ALTER FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_signed_up_flag"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the user_role from the new user's metadata
  user_role := (NEW.raw_user_meta_data->>'user_role')::TEXT;

  -- Check if the user exists in the correct table based on the user_role
  IF user_role = 'learner' THEN
    IF EXISTS (SELECT 1 FROM public."Learner" WHERE phone = NEW.phone) THEN
      -- Update the signedUp flag for Learner
      UPDATE public."Learner"
      SET signed_up = current_timestamp
      WHERE phone = NEW.phone;
      -- Set a custom claim for the user role
      PERFORM public.set_claim(NEW.id, 'user_role', '"learner"'::jsonb);
    ELSE
      RAISE EXCEPTION 'User with phone % does not exist in Learner table', NEW.phone;
    END IF;
  ELSIF user_role = 'instructor' THEN
    IF EXISTS (SELECT 1 FROM public."Instructor" WHERE phone = NEW.phone) THEN
      -- Update the signedUp flag for Instructor
      UPDATE public."Instructor"
      SET signed_up = current_timestamp
      WHERE phone = NEW.phone;
      -- Set a custom claim for the user role
      PERFORM public.set_claim(NEW.id, 'user_role', '"instructor"'::jsonb);
    ELSE
      RAISE EXCEPTION 'User with phone % does not exist in Instructor table', NEW.phone;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid user_role: %', user_role;
  END IF;
  
  -- Return the new user record
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_signed_up_flag"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."Courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "code" bigint,
    "duration" bigint,
    "total_lessons" bigint,
    "price" bigint,
    "enabled" boolean
);


ALTER TABLE "public"."Courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Instructor" (
    "id_instructor" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "phone" "text",
    "email" "text",
    "DL_number" "text",
    "car_make" "text",
    "car_mode" "text",
    "car_license" "text",
    "experience" smallint,
    "enabled" boolean,
    "password" "text",
    "areas" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "car_number" "text",
    "signed_up" timestamp without time zone
);


ALTER TABLE "public"."Instructor" OWNER TO "postgres";


COMMENT ON COLUMN "public"."Instructor"."areas" IS 'areas serviced by the instructor';



CREATE TABLE IF NOT EXISTS "public"."Instructor Unavailability" (
    "instructor_id" "uuid" NOT NULL,
    "booked_date" "date",
    "booked_start_time" "text",
    "booked_end_time" "text"
);


ALTER TABLE "public"."Instructor Unavailability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Learner" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "email" "text",
    "phone" "text" NOT NULL,
    "city" "text",
    "has_a_DL" boolean,
    "LL_test_date" "date",
    "LL_result" boolean,
    "LL_application_id" "text",
    "DL_test_date" "date",
    "DL_result" boolean,
    "DL_id" "text",
    "enabled" boolean DEFAULT true,
    "password" "text",
    "dob" "text",
    "start_date" "date",
    "pick_up_location" "text",
    "unavailability" "json",
    "signed_up" timestamp without time zone,
    "aadhar_state" "text",
    "area" "text",
    "pincode" "text",
    "LL_application_approved" boolean DEFAULT false,
    "LL_team_appointment_booked" boolean DEFAULT false,
    "address_lat" numeric,
    "address_lng" numeric,
    "onboarding_completed" boolean
);


ALTER TABLE "public"."Learner" OWNER TO "postgres";


COMMENT ON COLUMN "public"."Learner"."aadhar_state" IS 'registration state of user''s aadhar';



COMMENT ON COLUMN "public"."Learner"."area" IS 'area of the pickup location';



CREATE TABLE IF NOT EXISTS "public"."Learner Availability" (
    "learner_id" "uuid" NOT NULL,
    "day_of_the_week" "text",
    "list_of_available_timeslots" "json"
);


ALTER TABLE "public"."Learner Availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."Lesson" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "course_id" "uuid",
    "duration" bigint,
    "description" "text",
    "enabled" boolean,
    "number" bigint
);


ALTER TABLE "public"."Lesson" OWNER TO "postgres";


COMMENT ON COLUMN "public"."Lesson"."number" IS 'lesson number';



CREATE TABLE IF NOT EXISTS "public"."Schedule" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "learner_id" "uuid",
    "instructor_id" "uuid",
    "course_id" "uuid",
    "lesson_id" "uuid",
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "status" "text",
    "enabled" boolean DEFAULT false NOT NULL,
    "otp" "text"
);


ALTER TABLE "public"."Schedule" OWNER TO "postgres";


ALTER TABLE "public"."Schedule" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."Schedule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."enrollment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learner_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "payment_id" "uuid",
    "status" "public"."enrollment_status" DEFAULT 'pending'::"public"."enrollment_status" NOT NULL,
    "progress" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."enrollment" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "learner_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "payment_type" "public"."payment_type" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "gateway_reference" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."payment" OWNER TO "postgres";


ALTER TABLE ONLY "public"."Courses"
    ADD CONSTRAINT "Courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Instructor Unavailability"
    ADD CONSTRAINT "Instructor Unavailability_pkey" PRIMARY KEY ("instructor_id");



ALTER TABLE ONLY "public"."Instructor"
    ADD CONSTRAINT "Instructor_pkey" PRIMARY KEY ("id_instructor");



ALTER TABLE ONLY "public"."Learner Availability"
    ADD CONSTRAINT "Learner Availability_pkey" PRIMARY KEY ("learner_id");



ALTER TABLE ONLY "public"."Learner"
    ADD CONSTRAINT "Learner_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."Learner"
    ADD CONSTRAINT "Learner_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Lesson"
    ADD CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Schedule"
    ADD CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrollment"
    ADD CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_pkey" PRIMARY KEY ("id");



CREATE INDEX "enrollment_course_id_idx" ON "public"."enrollment" USING "btree" ("course_id");



CREATE INDEX "enrollment_learner_id_idx" ON "public"."enrollment" USING "btree" ("learner_id");



CREATE INDEX "enrollment_payment_id_idx" ON "public"."enrollment" USING "btree" ("payment_id");



CREATE INDEX "payment_learner_id_idx" ON "public"."payment" USING "btree" ("learner_id");



CREATE OR REPLACE TRIGGER "handle_enrollment_updated_at" BEFORE UPDATE ON "public"."enrollment" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "handle_payments_updated_at" BEFORE UPDATE ON "public"."payment" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."Instructor Unavailability"
    ADD CONSTRAINT "Instructor Unavailability_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."Instructor"("id_instructor") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Learner Availability"
    ADD CONSTRAINT "Learner Availability_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."Learner"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Lesson"
    ADD CONSTRAINT "Lesson_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."Courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Schedule"
    ADD CONSTRAINT "Schedule_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."Courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Schedule"
    ADD CONSTRAINT "Schedule_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."Instructor"("id_instructor") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Schedule"
    ADD CONSTRAINT "Schedule_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."Learner"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Schedule"
    ADD CONSTRAINT "Schedule_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."Lesson"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrollment"
    ADD CONSTRAINT "enrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."Courses"("id");



ALTER TABLE ONLY "public"."enrollment"
    ADD CONSTRAINT "enrollment_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."Learner"("id");



ALTER TABLE ONLY "public"."enrollment"
    ADD CONSTRAINT "enrollment_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id");



ALTER TABLE ONLY "public"."payment"
    ADD CONSTRAINT "payment_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "public"."Learner"("id");



CREATE POLICY "Enable read access for all users" ON "public"."Courses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."Instructor" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."Lesson" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."Instructor Unavailability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Learner Availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Learners can view their own enrollments" ON "public"."enrollment" FOR SELECT USING (("learner_id" IN ( SELECT "Learner"."id"
   FROM "public"."Learner"
  WHERE ("Learner"."phone" = ("auth"."jwt"() ->> 'phone'::"text")))));



CREATE POLICY "Learners can view their own payments" ON "public"."payment" FOR SELECT USING (("learner_id" IN ( SELECT "Learner"."id"
   FROM "public"."Learner"
  WHERE ("Learner"."phone" = ("auth"."jwt"() ->> 'phone'::"text")))));



ALTER TABLE "public"."Lesson" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Service role can manage enrollments" ON "public"."enrollment" TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can manage payments" ON "public"."payment" TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."enrollment" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
































































































































































































GRANT ALL ON FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_claim"("uid" "uuid", "claim" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_claim"("uid" "uuid", "claim" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_claims"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_claims"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_claims"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_claim"("claim" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_claim"("claim" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_claim"("claim" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_claims"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_claims"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_claims"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_claims_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_claims_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_claims_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_claim"("uid" "uuid", "claim" "text", "value" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_signed_up_flag"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_signed_up_flag"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_signed_up_flag"() TO "service_role";





















GRANT ALL ON TABLE "public"."Courses" TO "anon";
GRANT ALL ON TABLE "public"."Courses" TO "authenticated";
GRANT ALL ON TABLE "public"."Courses" TO "service_role";



GRANT ALL ON TABLE "public"."Instructor" TO "anon";
GRANT ALL ON TABLE "public"."Instructor" TO "authenticated";
GRANT ALL ON TABLE "public"."Instructor" TO "service_role";



GRANT ALL ON TABLE "public"."Instructor Unavailability" TO "anon";
GRANT ALL ON TABLE "public"."Instructor Unavailability" TO "authenticated";
GRANT ALL ON TABLE "public"."Instructor Unavailability" TO "service_role";



GRANT ALL ON TABLE "public"."Learner" TO "anon";
GRANT ALL ON TABLE "public"."Learner" TO "authenticated";
GRANT ALL ON TABLE "public"."Learner" TO "service_role";



GRANT ALL ON TABLE "public"."Learner Availability" TO "anon";
GRANT ALL ON TABLE "public"."Learner Availability" TO "authenticated";
GRANT ALL ON TABLE "public"."Learner Availability" TO "service_role";



GRANT ALL ON TABLE "public"."Lesson" TO "anon";
GRANT ALL ON TABLE "public"."Lesson" TO "authenticated";
GRANT ALL ON TABLE "public"."Lesson" TO "service_role";



GRANT ALL ON TABLE "public"."Schedule" TO "anon";
GRANT ALL ON TABLE "public"."Schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."Schedule" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Schedule_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Schedule_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Schedule_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."enrollment" TO "anon";
GRANT ALL ON TABLE "public"."enrollment" TO "authenticated";
GRANT ALL ON TABLE "public"."enrollment" TO "service_role";



GRANT ALL ON TABLE "public"."payment" TO "anon";
GRANT ALL ON TABLE "public"."payment" TO "authenticated";
GRANT ALL ON TABLE "public"."payment" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
