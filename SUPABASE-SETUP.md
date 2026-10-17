# Supabase Setup — KloofStreet.online v2

Step-by-step guide to wiring Street Pass (members, QR scans, points, rewards,
payments) and the Merchant Workstation to a live Supabase project.

> **Context**: in v1 the config file `streetpass-config.js` was never committed,
> so *every* Supabase-backed feature silently no-op'd on the live site. v2 fixes
> that — but only once you complete the steps below. Budget ~30 minutes.

---

## 1. Which Supabase project?

Two valid paths:

| Path | When | Result |
|---|---|---|
| **A. Reuse the existing KloofStreet project** *(recommended)* | You still have access to the original Supabase account (project ref starts `uzzoyk…`). | All historic members / scans / partners are preserved. The schema below just tops up anything missing. |
| **B. Fresh project** | The original account is lost or you want a clean slate. | Zero data — run the full schema, seed stores + rewards, members sign up anew. |

Either way the steps are identical; the schema (`supabase-schema.sql`) is
idempotent and handles both cases.

---

## 2. Get your three credentials

Supabase Dashboard → your project → **Project Settings → API**:

| Credential | Where it goes | Secret? |
|---|---|---|
| **Project URL** (`https://<ref>.supabase.co`) | `streetpass-config.js` + Vercel `SUPABASE_URL` | No |
| **anon public key** | `streetpass-config.js` + nothing else | No — safe client-side (RLS protects data) |
| **service_role key** | Vercel only: `SUPABASE_SERVICE_ROLE_KEY` | **YES — never in git, never in the browser** |

---

## 3. Run the schema

1. Supabase Dashboard → **SQL Editor** → New query.
2. Open `supabase-schema.sql` from this repo, copy **all** of it, paste, **Run**.
3. It creates 7 tables (`profiles`, `partners`, `scans`, `weekly_activity`,
   `rewards`, `redemptions`, `daily_stats`), indexes, the redemption-code and
   referral-code triggers, and all Row Level Security policies.
4. Re-running it is safe (and a good idea after pulling repo updates).

> The old `merchant-schema.sql` is now superseded — its columns are included
> in `supabase-schema.sql`. Keep it only for reference.

---

## 4. Auth settings (critical)

Supabase Dashboard → **Authentication → Sign In / Providers → Email**:

- **Enable** the Email provider.
- **Disable "Confirm email"**. The signup flow (index.html `spSignup`) expects
  a session immediately after `auth.signUp()`; with confirmation ON, members
  would appear signed-up but be unable to log in until they click an email
  link the app never sends them to. If you later want verified emails, the
  frontend needs a "check your inbox" state added first.
- Minimum password length is already 6 in Supabase, matching the client check.

Also under **Authentication → URL Configuration**: set **Site URL** to the
site root (e.g. `https://www.kloofstreet.online`). Password logins don't
redirect, so no extra redirect URLs are needed.

---

## 5. Seed the stores (partners) + merchant logins

The 12 Kloof Street directory businesses. In the **SQL Editor**:

```sql
INSERT INTO partners (name, short_name, category, suburb) VALUES
  ('Body Vision Studio',      'Body Vision',  'Gyrotonic / Movement', 'Gardens'),
  ('Revive Studio',           'Revive',       'Fitness / Recovery',   'Gardens'),
  ('Hayley Schuter Physio',   'Hayley',       'Physiotherapy',        'Gardens'),
  ('Dr Wendy Dicks',          'Dr Wendy',     'Psychology',           'Gardens'),
  ('Dr Thomas Jahn',          'Dr Thomas',    'Psychiatry',           'Gardens'),
  ('Dr Dale Geoffreys',       'Dr Dale',      'Dental',               'Gardens'),
  ('Just Hearing',            'Just Hearing', 'Audiology',            'Gardens'),
  ('Trudy Christians',        'Trudy',        'Beauty / Skincare',    'Gardens'),
  ('Postnet Gardens',         'Postnet',      'Courier / Print',      'Gardens'),
  ('Arnold''s Restaurant',    'Arnold''s',    'Restaurant',           'Gardens'),
  ('Ubuntu Wellness',         'Ubuntu',       'Wellness',             'Gardens'),
  ('On Safari Art Studios',   'On Safari',    'Art Studio',           'Gardens')
ON CONFLICT DO NOTHING;
```

Only add stores that actually join Street Pass — delete the rows you don't
need. Then, **for each participating store**:

1. **Authentication → Users → Add user** — the store owner's email +
   a temporary password, tick *Auto-confirm*.
2. Link that login to the store row:

   ```sql
   UPDATE partners SET login_email = 'kim@bodyvision.co.za'
     WHERE name ILIKE '%body vision%';
   ```

3. Verify: `SELECT id, name, short_name, login_email FROM partners ORDER BY name;`
   — every active store should show an email.

The owner signs in at `kloofstreet.online/merchant` → *Open Street Pass tools*
with exactly that email + password.

---

## 6. Seed rewards

Members only see rewards where `active = true` (sorted by `sort_order`).
Example per store:

```sql
INSERT INTO rewards (partner_id, name, description, points_required, max_per_month, active, sort_order)
SELECT id, 'Free cappuccino', 'Any handcrafted coffee, on us', 150, 1, true, 1
FROM partners WHERE name ILIKE '%arnolds%';
```

Points maths (from the code): a scan earns **10 pts**, a first visit to a
store **+40 bonus** (50 total), visiting **3+ different stores in one week
doubles** everything. So a coffee at 150 pts ≈ 3 visits. Price rewards
accordingly.

---

## 7. Store QR codes (how members check in)

A member's Scan screen reads any QR and posts it to `/api/scan`. The payload
is either the raw partner id or `kloof://partner/<partner_id>` — both work.

1. Grab each store's id:
   `SELECT id, name FROM partners WHERE login_email IS NOT NULL;`
2. Generate a QR (any generator, e.g. qr.io / Canva / qr-code-generator.com)
   with the content exactly:
   `kloof://partner/<paste-the-uuid>`
3. Print it for the counter. Members scan → 10/50 pts, 4-hour cooldown per
   store, weekly 2x — all enforced server-side.

Merchants can also type a member's **referral code** manually in the
workstation (check-ins tab) — codes are auto-generated by the schema trigger
(`KIM-4821` style), visible to members on their Street Pass dashboard.

---

## 8. Vercel environment variables

Vercel → your v2 project → **Settings → Environment Variables** (add for
Production + Preview):

| Variable | Value | Used by |
|---|---|---|
| `SUPABASE_URL` | Project URL | all `api/*` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | member/scan/redeem, merchant/*, pass/*, yoco-webhook |
| `GEMINI_API_KEY` | Google AI Studio key | `api/ai-chat.js` (AI Concierge) |
| `YOCO_SECRET_KEY` | Yoco secret key | `api/create-checkout.js` (R199/mo Street Pass checkout) |

Redeploy after adding them (Deployments → latest → Redeploy).

---

## 9. Point the client at Supabase

Edit **`streetpass-config.js`** in the repo:

```js
window.SP_CONFIG = {
  url: "https://<your-project-ref>.supabase.co",
  anonKey: "<your-anon-public-key>"
};
```

Commit and push — Vercel redeploys. **Never** put the service_role key here.

---

## 10. Yoco payment activation flow

How a member goes from signup to `status = 'active'`:

```
signup (Supabase auth) → profile row (status 'pending')
  → "Join for R199/month" → POST /api/create-checkout  (Yoco checkout, R199.00)
  → member pays on Yoco's hosted page
  → Yoco sends payment.succeeded webhook → POST /api/yoco-webhook
  → profiles.status = 'active', activated_at = now()
```

To enable: Yoco Business Portal → **Developers / Webhooks** → add endpoint
`https://<your-domain>/api/yoco-webhook`, subscribed to `payment.succeeded`.

⚠️ Note: `api/yoco-webhook.js` currently trusts the payload body without
verifying Yoco's signature header — fine for launch, but add signature
verification (per Yoco docs) before real money flows. Also, if v2 ships on a
different domain than v1, update the `success_url` / `cancel_url` in
`api/create-checkout.js` (they currently point at `kloofstreet.online`).

---

## 11. How this relates to HustlePortal

Deliberately **two separate Supabase projects**:

- **KloofStreet v2** (this setup): Street Pass members, scans, rewards,
  merchants, analytics.
- **HustlePortal** (its own project): newsletter contacts, Gmail OAuth, HP accounts.

There is no shared database — the "seamless plugin" is at product level:
member bar + footer links into the portal (UTM-tagged), the `/merchant`
gateway page, and merchants using their **KloofStreet Street Pass login**
here vs. their HP account there. No Supabase changes needed on the HP side.

---

## 12. Go-live checklist

- [ ] Schema run in SQL Editor (section 3) — no errors
- [ ] Email provider ON, **Confirm email OFF** (section 4)
- [ ] Stores seeded + `login_email` linked (section 5)
- [ ] At least one reward per store (section 6)
- [ ] Vercel env vars set + redeployed (section 8)
- [ ] `streetpass-config.js` filled with URL + anon key, pushed (section 9)
- [ ] Yoco webhook endpoint registered (section 10)
- [ ] Test: sign up a member → profile row exists (Table Editor → profiles)
- [ ] Test: dashboard loads, rewards catalog visible on /streetpass/rewards
- [ ] Test: scan a store QR → +50 pts first visit; second scan within 4h → cooldown message
- [ ] Test: redeem → code appears → merchant workstation confirms it
- [ ] Test: merchant login at /merchant → stats + check-ins render
- [ ] Check **Table Editor → daily_stats** is gaining rows (analytics alive)

---

## 13. Security model (what's public, what's locked)

| Table | Browser (anon key) can | Notes |
|---|---|---|
| `profiles` | read / insert / update **own row only** | `auth.uid() = id` enforced by RLS |
| `rewards` | read **active** rows only | the public catalog |
| `redemptions` | read **own** codes only | creation + confirm = service-role API |
| `daily_stats` | read + upsert | intentional public counter |
| `scans` | nothing | all writes via `/api/scan` (service role) |
| `weekly_activity` | nothing | service role only |
| `partners` | nothing | service role only |

- The **anon key** in `streetpass-config.js` is designed to be public — RLS is
  the boundary.
- The **service_role key** bypasses RLS; it lives only in Vercel env vars and
  must never enter git or client code.
- Point totals are computed server-side (`/api/scan`, `/api/redeem`) — the
  browser can't award itself points.
