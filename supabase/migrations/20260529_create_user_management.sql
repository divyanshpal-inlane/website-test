-- Add columns to Admin table first (if not exists)
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS created_by_admin_id uuid;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT true;

-- Create User table for users created by admins (without foreign keys first)
CREATE TABLE IF NOT EXISTS "User" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text NOT NULL,
  admin_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  signed_up timestamp with time zone,
  created_by_admin_id uuid NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_admin_id ON "User"(admin_id);
CREATE INDEX IF NOT EXISTS idx_user_created_by_admin_id ON "User"(created_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_user_phone ON "User"(phone);

-- Enable RLS on User table
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own data" ON "User";
CREATE POLICY "Users can view their own data"
  ON "User"
  FOR SELECT
  USING (phone = auth.jwt()->>'phone');

DROP POLICY IF EXISTS "Admins can view their created users" ON "User";
CREATE POLICY "Admins can view their created users"
  ON "User"
  FOR SELECT
  USING (
    created_by_admin_id = (
      SELECT id FROM "Admin" 
      WHERE phone = auth.jwt()->>'phone'
    )
  );

DROP POLICY IF EXISTS "Super admins can view all users" ON "User";
CREATE POLICY "Super admins can view all users"
  ON "User"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Admin"
      WHERE "Admin".phone = auth.jwt()->>'phone'
      AND "Admin".is_super_admin = true
    )
  );

-- Create user_permissions table
CREATE TABLE IF NOT EXISTS user_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    permission TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, permission)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- Enable RLS on user_permissions
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies for user_permissions
DROP POLICY IF EXISTS "Admins can manage user permissions" ON user_permissions;
CREATE POLICY "Admins can manage user permissions"
    ON user_permissions FOR ALL
    USING (
        auth.role() = 'service_role'
        OR EXISTS (
            SELECT 1 FROM "User"
            WHERE "User".id = user_permissions.user_id
            AND "User".created_by_admin_id = (
              SELECT id FROM "Admin" 
              WHERE phone = auth.jwt()->>'phone'
            )
        )
    );

DROP POLICY IF EXISTS "Super admins can manage all user permissions" ON user_permissions;
CREATE POLICY "Super admins can manage all user permissions"
    ON user_permissions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "Admin"
            WHERE "Admin".phone = auth.jwt()->>'phone'
            AND "Admin".is_super_admin = true
        )
    );

DROP POLICY IF EXISTS "Users can view own permissions" ON user_permissions;
CREATE POLICY "Users can view own permissions"
    ON user_permissions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE "User".id = user_permissions.user_id
            AND (
                "User".phone = auth.jwt()->>'phone'
                OR REPLACE(REPLACE(REPLACE("User".phone, '+', ''), ' ', ''), '-', '') = REPLACE(REPLACE(REPLACE(auth.jwt()->>'phone', '+', ''), ' ', ''), '-', '')
            )
        )
    );

-- Update the update_signed_up_flag function to handle user role
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
  ELSIF user_role = 'user' THEN
    IF EXISTS (SELECT 1 FROM public."User" WHERE phone = NEW.phone) THEN
      -- Update the signedUp flag for User
      UPDATE public."User"
      SET signed_up = current_timestamp
      WHERE phone = NEW.phone;
      -- Set a custom claim for the user role
      PERFORM public.set_claim(NEW.id, 'user_role', '"user"'::jsonb);
    ELSE
      RAISE EXCEPTION 'User with phone % does not exist in User table', NEW.phone;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid user_role: %', user_role;
  END IF;
  
  -- Return the new user record
  RETURN NEW;
END;
$$;
