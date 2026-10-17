# KloofStreet.online — v2 (PWA)

The installable, offline-capable v2 of [KloofStreet.online](https://www.kloofstreet.online/) —
the curated guide to Kloof Street, Gardens, Cape Town (#22 World's Coolest Street, Time Out 2025).
Same zero-build architecture as v1 (single SPA + Vercel serverless functions + Supabase),
upgraded into a real Progressive Web App and hardened by a full v1 audit.

## What's new in v2

**PWA layer**
- `manifest.webmanifest` — installable, standalone display, app shortcuts (Directory / AI Concierge / Street Pass / For Business)
- `sw.js` — offline-first service worker: precached app shell, stale-while-revalidate assets, network-first navigations; **never** caches `/api/*`, Supabase, analytics or payment endpoints
- Generated icon set (`icons/` — 192, 512, maskable, apple-touch, favicon.svg)
- Custom install prompt bar (respects dismissal, hidden in standalone mode)
- Deep links: `?page=<name-or-slug>` routing so manifest shortcuts land on the right page

**Audit fixes**
- `streetpass-config.js` **committed** — in v1 this file never made it into the repo, so Street
  Pass login, QR scans, rewards and analytics silently no-op'd in production. ⚠️ **Fill in your
  Supabase Project URL + anon key** (Supabase → Project Settings → API) before going live.
- `llms.txt` + `llms-full.txt` now exist (v1 linked them in `<head>` but never shipped them)
- `robots.txt` + full `sitemap.xml` (23 clean-URL pages)
- Mobile overflow fixed on **Revive Studio** and **Hayley Schuter Physio** (4-col stats/accolade
  grids now collapse to 2 columns ≤640px: `.stat4` / `.accol4`)
- All 20 remote images lazy-load
- Canonical/OG URLs standardised on `https://www.kloofstreet.online`

**HustlePortal integration (seamless plugin)**
- Every portal link carries attribution: `?utm_source=kloofstreet&utm_medium=referral&utm_campaign=kloofv2`
- `/newsletter` still 308-redirects to the portal (with UTM)
- AI Concierge cross-sells the portal to business owners
- Merchant gateway page unchanged: sign-in hero → HustlePortal, 5-step backoffice guide,
  Street Pass check-in tools

## Deploy (Vercel)

1. Push this repo to GitHub → import in Vercel (it auto-detects the `vercel.json` static config).
2. Set environment variables (Project → Settings → Environment Variables):

| Variable | Used by |
|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | `api/*` |
| `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | `api/member.js`, `api/scan.js`, `api/redeem.js`, `api/merchant/*`, `api/pass/*` |
| `GEMINI_API_KEY` | `api/ai-chat.js` (AI concierge) |
| `YOCO_SECRET_KEY` | `api/create-checkout.js`, `api/yoco-webhook.js` (Street Pass R199/mo signup) |

3. Paste Supabase values into `streetpass-config.js` (client side) and commit.
4. Run `merchant-schema.sql` once against Supabase (idempotent) if not already applied.

## Notes

- **Domain**: canonical origin is set in `index.html` (canonical/OG), `sitemap.xml`, `robots.txt`,
  `llms.txt` — all currently `https://www.kloofstreet.online`. Update those four files if v2
  ships on a different domain.
- **Service worker**: bump `VERSION` in `sw.js` whenever `index.html` changes meaningfully so
  clients refresh the shell.
- **Local dev**: `python3 -m http.server` in this folder, open `http://localhost:8000`
  (service worker registers on localhost; `/api/*` only works on Vercel).
- Repo hygiene: v1's unused Next.js template files (`next.config.ts`, `tailwind.config.ts`,
  `tsconfig.json`, `components.json`, eslint/postcss configs) are gone; `api/` functions are
  dependency-free (plain `fetch`).

## File map

```
index.html            the entire SPA (20 pages, dark/gold design system)
manifest.webmanifest  PWA manifest + shortcuts
sw.js                 service worker (offline shell)
icons/                generated gold-K monogram icon set
streetpass-config.js  ⚠️ Supabase client config (fill in!)
vercel.json           static build + clean-URL rewrites + sw.js headers
api/                  12 serverless functions (AI, Street Pass, payments, wallet passes)
merchant-schema.sql   Supabase migration (merchants, scans, redemptions)
robots.txt / sitemap.xml / llms.txt / llms-full.txt   SEO + AI-crawler surface
```
