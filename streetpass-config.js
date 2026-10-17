/* KloofStreet.online v2 — Street Pass / Supabase configuration.
 *
 * ACTION REQUIRED before Street Pass goes live on this deployment:
 *   Supabase Dashboard -> Project Settings -> API ->
 *     - Project URL      -> url
 *     - anon public key  -> anonKey
 *
 * The anon key is safe to ship client-side (row-level security protects data).
 * NEVER put the service-role key in this file.
 *
 * In v1 this file existed only on a developer machine and was never committed,
 * so every Supabase-backed feature (member login, QR scan, rewards, pageview
 * tracking) silently no-op'd in production. Committing it fixes that.
 */
window.SP_CONFIG = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR-SUPABASE-ANON-PUBLIC-KEY"
};
