-- Create email_errors table
CREATE TABLE IF NOT EXISTS public.email_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  error TEXT NOT NULL,
  stack TEXT,
  details JSONB,
  resolved BOOLEAN DEFAULT FALSE
);

-- Create failed_emails table
CREATE TABLE IF NOT EXISTS public.failed_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  learner_email TEXT,
  instructor_email TEXT,
  admin_email TEXT,
  learner_sent BOOLEAN DEFAULT FALSE,
  instructor_sent BOOLEAN DEFAULT FALSE,
  admin_sent BOOLEAN DEFAULT FALSE,
  is_multi_event BOOLEAN DEFAULT FALSE,
  events_data JSONB,
  errors TEXT[],
  learner_ics_array JSONB,
  instructor_ics_array JSONB,
  instructor_name TEXT,
  learner_name TEXT,
  subject TEXT,
  message TEXT,
  resolved BOOLEAN DEFAULT FALSE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS email_errors_created_at_idx ON public.email_errors (created_at);
CREATE INDEX IF NOT EXISTS email_errors_resolved_idx ON public.email_errors (resolved);
CREATE INDEX IF NOT EXISTS failed_emails_created_at_idx ON public.failed_emails (created_at);
CREATE INDEX IF NOT EXISTS failed_emails_resolved_idx ON public.failed_emails (resolved);

-- Set up RLS policies
ALTER TABLE public.email_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failed_emails ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Allow full access to admins" 
ON public.email_errors 
FOR ALL 
TO authenticated
USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Allow full access to admins" 
ON public.failed_emails 
FOR ALL 
TO authenticated
USING (auth.jwt() ->> 'role' = 'admin');

-- Grant permissions
GRANT ALL ON TABLE public.email_errors TO service_role;
GRANT ALL ON TABLE public.failed_emails TO service_role;
GRANT SELECT, INSERT ON TABLE public.email_errors TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.failed_emails TO anon, authenticated;
