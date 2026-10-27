// Billing. With STRIPE_SECRET_KEY set this uses Stripe Checkout, the Customer Portal and webhooks
// (plain REST, no SDK). Without it, a built-in test checkout applies plans instantly so the full
// upgrade flow works locally.

import type { DB, UserRow } from '../db.ts';
import { billingMode, config } from '../config.ts';
import { PASS_DURATION_MS } from '../plans.ts';
import type { BillingInterval } from '../plans.ts';
import { hmac, newId, safeEqual } from '../lib/crypto.ts';
import { getUser } from './accounts.ts';

const DAY = 86_400_000;

// ---------- plan state transitions (shared by Stripe and dev mode) ----------

export function applyPass(db: DB, userId: string, now = Date.now()) {
  const user = getUser(db, userId);
  if (!user) return;
  const from = Math.max(now, user.pass_expires_at ?? 0);
  db.prepare('UPDATE users SET pass_expires_at = ? WHERE id = ?').run(from + PASS_DURATION_MS, userId);
}

export function applySubscription(
  db: DB,
  userId: string,
  s: {
    status: string;
    interval: 'month' | 'year';
    periodEnd: number;
    cancelAtPeriodEnd: boolean;
    customerId?: string | null;
    subscriptionId?: string | null;
  },
) {
  db.prepare(
    `UPDATE users SET plan = CASE WHEN plan = 'team' THEN 'team' ELSE 'pro' END, subscription_status = ?, subscription_interval = ?,
       current_period_end = ?, cancel_at_period_end = ?, stripe_customer_id = COALESCE(?, stripe_customer_id),
       stripe_subscription_id = COALESCE(?, stripe_subscription_id) WHERE id = ?`,
  ).run(s.status, s.interval, s.periodEnd, s.cancelAtPeriodEnd ? 1 : 0, s.customerId ?? null, s.subscriptionId ?? null, userId);
}

export function endSubscription(db: DB, userId: string) {
  db.prepare(
    `UPDATE users SET plan = 'free', subscription_status = 'canceled', cancel_at_period_end = 0, stripe_subscription_id = NULL
     WHERE id = ?`,
  ).run(userId);
}

// ---------- checkout ----------

export async function createCheckout(db: DB, user: UserRow, interval: BillingInterval, fetchImpl: typeof fetch = fetch) {
  if (billingMode() === 'dev') {
    const id = newId('cs_dev');
    db.prepare('INSERT INTO checkout_sessions (id, user_id, plan, interval, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      user.id,
      'pro',
      interval,
      'open',
      Date.now(),
    );
    return { url: `${config.publicUrl}/checkout.html?session=${encodeURIComponent(id)}`, mode: 'dev' as const };
  }

  const price = config.stripe.prices[interval];
  if (!price) throw new Error(`STRIPE_PRICE for "${interval}" is not configured`);
  const params: Record<string, string> = {
    mode: interval === 'pass' ? 'payment' : 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: `${config.publicUrl}/account.html?checkout=success`,
    cancel_url: `${config.publicUrl}/#pricing`,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'metadata[interval]': interval,
    allow_promotion_codes: 'true',
  };
  if (user.stripe_customer_id) params.customer = user.stripe_customer_id;
  else params.customer_email = user.email;
  if (interval === 'pass') {
    if (!user.stripe_customer_id) params.customer_creation = 'always';
  } else {
    params['subscription_data[metadata][user_id]'] = user.id;
  }
  const session = await stripe<{ url: string }>('POST', '/v1/checkout/sessions', params, fetchImpl);
  return { url: session.url, mode: 'stripe' as const };
}

export function completeDevCheckout(db: DB, sessionId: string, now = Date.now()) {
  const row = db.prepare("SELECT * FROM checkout_sessions WHERE id = ? AND status = 'open'").get(sessionId) as
    | { id: string; user_id: string; interval: BillingInterval }
    | undefined;
  if (!row) return null;
  db.prepare("UPDATE checkout_sessions SET status = 'complete' WHERE id = ?").run(sessionId);
  if (row.interval === 'pass') applyPass(db, row.user_id, now);
  else
    applySubscription(db, row.user_id, {
      status: 'active',
      interval: row.interval,
      periodEnd: now + (row.interval === 'year' ? 365 : 30) * DAY,
      cancelAtPeriodEnd: false,
    });
  return row;
}

export function getDevCheckout(db: DB, sessionId: string) {
  return db.prepare('SELECT id, interval, status FROM checkout_sessions WHERE id = ?').get(sessionId) as
    | { id: string; interval: BillingInterval; status: string }
    | undefined;
}

export async function createPortal(user: UserRow, fetchImpl: typeof fetch = fetch) {
  if (billingMode() === 'dev' || !user.stripe_customer_id) {
    return { url: `${config.publicUrl}/account.html?manage=1`, mode: 'dev' as const };
  }
  const session = await stripe<{ url: string }>(
    'POST',
    '/v1/billing_portal/sessions',
    { customer: user.stripe_customer_id, return_url: `${config.publicUrl}/account.html` },
    fetchImpl,
  );
  return { url: session.url, mode: 'stripe' as const };
}

// ---------- Stripe plumbing ----------

async function stripe<T>(method: 'GET' | 'POST', path: string, params: Record<string, string> | null, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe ${path} failed: ${body.error?.message ?? res.status}`);
  return body;
}

/** Verifies the `Stripe-Signature` header (t=…,v1=…) against the raw request body. */
export function verifyStripeSignature(rawBody: string, header: string | undefined, secret: string, now = Date.now(), toleranceSec = 300) {
  if (!header || !secret) return false;
  const pairs = header.split(',').map((kv) => {
    const i = kv.indexOf('=');
    return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()] as const;
  });
  const t = pairs.find(([k]) => k === 't')?.[1];
  const v1s = pairs.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !v1s.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = hmac(secret, `${t}.${rawBody}`);
  return v1s.some((sig) => safeEqual(sig, expected));
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data: Array<{ current_period_end?: number; price?: { recurring?: { interval?: string } } }> };
}

function subscriptionFields(sub: StripeSubscription) {
  const item = sub.items?.data?.[0];
  // Newer API versions moved the period end onto subscription items.
  const periodEnd = (sub.current_period_end ?? item?.current_period_end ?? 0) * 1000;
  const interval = item?.price?.recurring?.interval === 'year' ? 'year' : 'month';
  return {
    status: sub.status,
    interval: interval as 'month' | 'year',
    periodEnd,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    customerId: sub.customer,
    subscriptionId: sub.id,
  };
}

function userIdFor(db: DB, metadataUserId: string | undefined, customerId: string | undefined) {
  if (metadataUserId && getUser(db, metadataUserId)) return metadataUserId;
  if (!customerId) return null;
  const row = db.prepare('SELECT id FROM users WHERE stripe_customer_id = ?').get(customerId) as { id: string } | undefined;
  return row?.id ?? null;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Applies a verified Stripe event. Idempotent: each event id is processed once. */
export async function handleStripeEvent(db: DB, event: StripeEvent, fetchImpl: typeof fetch = fetch) {
  const seen = db.prepare('SELECT id FROM stripe_events WHERE id = ?').get(event.id);
  if (seen) return 'duplicate';

  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      const userId = userIdFor(db, meta.user_id ?? (obj.client_reference_id as string), obj.customer as string);
      if (!userId) break;
      if (obj.customer) db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(obj.customer as string, userId);
      if (obj.mode === 'payment' && obj.payment_status === 'paid') applyPass(db, userId);
      if (obj.mode === 'subscription' && obj.subscription) {
        const sub = await stripe<StripeSubscription>('GET', `/v1/subscriptions/${obj.subscription as string}`, null, fetchImpl);
        applySubscription(db, userId, subscriptionFields(sub));
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = obj as unknown as StripeSubscription;
      const userId = userIdFor(db, sub.metadata?.user_id, sub.customer);
      if (!userId) break;
      if (['canceled', 'incomplete_expired', 'unpaid'].includes(sub.status)) endSubscription(db, userId);
      else applySubscription(db, userId, subscriptionFields(sub));
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = obj as unknown as StripeSubscription;
      const userId = userIdFor(db, sub.metadata?.user_id, sub.customer);
      if (userId) endSubscription(db, userId);
      break;
    }
    default:
      break;
  }
  db.prepare('INSERT INTO stripe_events (id, type, created_at) VALUES (?, ?, ?)').run(event.id, event.type, Date.now());
  return 'processed';
}
