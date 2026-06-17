import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Browser Supabase client (publishable key; all access governed by RLS).
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
