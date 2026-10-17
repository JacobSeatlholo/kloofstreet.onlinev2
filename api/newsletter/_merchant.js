/**
 * Merchant auth helper — recreated in v2.
 *
 * In v1 this file lived inside api/newsletter/ and was removed from the repo
 * during the newsletter migration to HustlePortal, leaving api/merchant/*
 * with a broken import (every /api/merchant/* call would fail to bundle on
 * Vercel). This file restores the helper with identical semantics so the
 * three merchant functions (me.js, scans.js, redemptions.js) work unchanged.
 *
 * requireMerchant(req):
 *   1. reads the Supabase session token from `Authorization: Bearer <token>`
 *   2. verifies it via auth.getUser()
 *   3. looks up the partners row whose login_email matches the signed-in email
 *      (partners.login_email is set by the store-registration SQL — see
 *      supabase-schema.sql / merchant-schema.sql)
 *   4. resolves { ok: true, merchant: { email, partner } } on success, or
 *      { ok: false, status, error } on failure — call jsonError() to send it.
 *
 * The 403 message deliberately contains the phrase "not a registered":
 * the frontend (index.html mchAfterLogin) matches on it to sign the user out.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

export async function requireMerchant(req) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return { ok: false, status: 401, error: 'Sign in required' };
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return { ok: false, status: 401, error: 'Invalid or expired session' };
    }

    const email = userData.user.email;
    if (!email) {
      return { ok: false, status: 403, error: 'This account is not a registered Kloof Street business' };
    }

    const { data: partner, error: pErr } = await supabase
      .from('partners')
      .select('*')
      .eq('login_email', email)
      .maybeSingle();

    if (pErr) {
      return { ok: false, status: 500, error: 'Store lookup failed' };
    }
    if (!partner) {
      return { ok: false, status: 403, error: 'This account is not a registered Kloof Street business' };
    }

    return { ok: true, merchant: { email, partner } };
  } catch (e) {
    return { ok: false, status: 500, error: 'Authentication failed' };
  }
}

export function jsonError(res, auth) {
  return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
}
