-- Create admin table
CREATE TABLE "Admin" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  signed_up timestamp with time zone
);

-- Enable RLS on Admin table
ALTER TABLE "Admin" ENABLE ROW LEVEL SECURITY;

-- Create policy for admin users to view their own data
CREATE POLICY "Admin users can view their own data"
  ON "Admin"
  FOR SELECT
  USING (phone = auth.jwt()->>'phone');

-- Update the update_signed_up_flag function to handle admin role
CREATE OR REPLACE FUNCTION public.update_signed_up_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  ELSIF user_role = 'admin' THEN
    IF EXISTS (SELECT 1 FROM public."Admin" WHERE phone = NEW.phone) THEN
      -- Update the signedUp flag for Admin
      UPDATE public."Admin"
      SET signed_up = current_timestamp
      WHERE phone = NEW.phone;
      -- Set a custom claim for the user role
      PERFORM public.set_claim(NEW.id, 'user_role', '"admin"'::jsonb);
    ELSE
      RAISE EXCEPTION 'User with phone % does not exist in Admin table', NEW.phone;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid user_role: %', user_role;
  END IF;
  
  -- Return the new user record
  RETURN NEW;
END;
$$;

-- Update schedule_preferences policies for admin access
DROP POLICY IF EXISTS "Admins can view all preferences" ON schedule_preferences;
DROP POLICY IF EXISTS "Admins can manage all preferences" ON schedule_preferences;

CREATE POLICY "Admins can view all preferences"
  ON schedule_preferences FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "Admin"
    WHERE "Admin".phone = auth.jwt()->>'phone'
  ));

CREATE POLICY "Admins can manage all preferences"
  ON schedule_preferences FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "Admin"
    WHERE "Admin".phone = auth.jwt()->>'phone'
  ));
