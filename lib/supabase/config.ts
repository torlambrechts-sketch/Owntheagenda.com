// Public Supabase client config.
//
// The URL and the *publishable* key are not secrets — the publishable key is
// designed to ship in the browser bundle and every request is still governed
// by RLS. We read them from env (so Vercel / other environments can override,
// and so key rotation works), falling back to this project's known public
// values so a fresh deploy works without manual env setup.
//
// NOTE: never put the service_role key here — that one is a real secret.
//
// Use `||` (not `??`) so an *empty-string* env var — e.g. a CI job that wires an
// unset secret as `""` — falls back to the known public value instead of
// crashing the Supabase client ("URL and Key are required").
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://fqeohcfkimoopwjxxcft.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_h6rj3hux3D3oPct8FkfUJQ_cjkdtKO2";
