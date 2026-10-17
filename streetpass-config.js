/* KloofStreet.online v2 — Street Pass / Supabase configuration.
 *
 * CONFIGURED 2026-10: original project (ref uzzoykmbadxriycvxycy), reuse
 * decided once dashboard access was recovered. The publishable key is safe
 * to ship client-side (row-level security protects data).
 * NEVER put the service-role / sb_secret_ key in this file — that lives in
 * Vercel env vars only.
 *
 * In v1 this file existed only on a developer machine and was never committed,
 * so every Supabase-backed feature (member login, QR scan, rewards, pageview
 * tracking) silently no-op'd in production. Committing it fixes that.
 */
window.SP_CONFIG = {
  url: "https://uzzoykmbadxriycvxycy.supabase.co",
  anonKey: "sb_publishable_4hYHLx9oElVFE-kHIb8cLg_8xEf2NWY"
};
