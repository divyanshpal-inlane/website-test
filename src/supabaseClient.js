import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isValidUrl = supabaseUrl && supabaseUrl.startsWith("http");
const isValidKey = supabaseAnonKey && supabaseAnonKey.length > 20;

let supabase;

if (!isValidUrl || !isValidKey) {
  console.warn("⚠️ Supabase env vars missing. Using mock client.");
  supabase = createClient("https://placeholder.supabase.co", "placeholder-key");
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };
