import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Create a mock client if environment variables are not set or are placeholders
const isValidUrl = supabaseUrl && supabaseUrl !== 'your_supabase_url_here' && supabaseUrl.startsWith('http')
const isValidKey = supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key_here'

let supabase

if (!isValidUrl || !isValidKey) {
  console.warn('⚠️ Supabase environment variables not configured. Using mock client.')
  // Create a mock Supabase client for development
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key')
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey)
}

export { supabase }
