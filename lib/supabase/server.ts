import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config";

// Server Supabase client. Reads/writes auth cookies. In a Server Component
// the cookie write throws (read-only render) — that's fine; the middleware
// refreshes the session on every request.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component render — ignore; middleware handles refresh.
          }
        },
      },
    },
  );
}
