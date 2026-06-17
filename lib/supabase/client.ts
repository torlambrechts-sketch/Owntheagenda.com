import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config";

// Browser Supabase client (publishable key; all access governed by RLS).
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
