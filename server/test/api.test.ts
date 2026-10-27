import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { limiter, TokenBucketLimiter } from '../src/lib/ratelimit.ts';
import { verifyStripeSignature } from '../src/services/billing.ts';
import { hmac } from '../src/lib/crypto.ts';

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  limiter.reset();
  app = createApp({ db: openDb(':memory:'), secret: 'test-secret' });
});

const post = (path: string, body: unknown, token?: string) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const get = (path: string, token?: string) => app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

async function signIn(email = 'sam@example.com') {
  const start = await (await post('/v1/auth/start', { email })).json();
  assert.match(start.devCode, /^\d{6}$/);
  const res = await post('/v1/auth/verify', { email, code: start.devCode, client: 'extension' });
  assert.equal(res.status, 200);
  return (await res.json()).token as string;
}

const role = (title: string) => ({ profile: { title, company: 'Stripe', location: 'New York, NY' } });

test('guests get 3 unique lookups a day; re-views and edits are free', async () => {
  for (const t of ['Software Engineer', 'Product Manager', 'Data Scientist']) {
    const res = await post('/v1/estimate', role(t));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).charged, true);
  }
  const blocked = await post('/v1/estimate', role('Product Designer'));
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.error.code, 'quota_exceeded');
  assert.equal(body.error.upgrade.action, 'signup');
  assert.equal(blocked.headers.get('X-Quota-Remaining'), '0');

  // Same role again: free re-view, even with the quota spent.
  const again = await post('/v1/estimate', role('Software Engineer'));
  assert.equal(again.status, 200);
  assert.equal((await again.json()).chargeReason, 'review');
});

test('editing a lookup (via lookupId) is free up to the cap', async () => {
  const first = await (await post('/v1/estimate', role('Software Engineer'))).json();
  const edited = await (await post('/v1/estimate', { lookupId: first.lookupId, profile: { title: 'Senior Software Engineer', company: 'Stripe', location: 'Austin, TX' } })).json();
  assert.equal(edited.charged, false);
  assert.equal(edited.chargeReason, 'adjustment');
  assert.equal(edited.quota.used, 1);
});

test('a pasted URL without details asks for input instead of failing', async () => {
  const res = await (await post('/v1/estimate', { url: 'https://www.linkedin.com/in/jane-doe-4a5b12/' })).json();
  assert.equal(res.status, 'needs_input');
  assert.equal(res.profile.name, 'Jane Doe');
  assert.ok(res.missing.includes('title'));
  const filled = await (await post('/v1/estimate', { url: 'https://www.linkedin.com/in/jane-doe-4a5b12/', profile: { title: 'Staff Engineer', company: 'Airbnb' } })).json();
  assert.equal(filled.status, 'ok');
  assert.equal(filled.quota.used, 1);
  const bad = await post('/v1/estimate', { url: 'https://example.com/in/jane' });
  assert.equal(bad.status, 400);
});

test('sign-in upgrades guests to the free plan and keeps history', async () => {
  const token = await signIn();
  const me = await (await get('/v1/me', token)).json();
  assert.equal(me.plan.id, 'free');
  assert.equal(me.quota.limit, 30);
  await post('/v1/estimate', { ...role('Software Engineer'), url: 'linkedin.com/in/alex-kim' }, token);
  const history = await (await get('/v1/history', token)).json();
  assert.equal(history.items.length, 1);
  assert.match(history.items[0].label, /Software Engineer @ Stripe/);
  assert.equal((await get('/v1/history.csv', token)).status, 402);
});

test('wrong codes are rejected and attempts are capped', async () => {
  await post('/v1/auth/start', { email: 'lee@example.com' });
  for (let i = 0; i < 4; i++) assert.equal((await post('/v1/auth/verify', { email: 'lee@example.com', code: '000000' })).status, 400);
  assert.equal((await post('/v1/auth/verify', { email: 'lee@example.com', code: '000000' })).status, 429);
});

test('test checkout upgrades to Pro, unlocks paid sections, and cancel downgrades', async () => {
  const token = await signIn();
  const checkout = await (await post('/v1/billing/checkout', { interval: 'month' }, token)).json();
  assert.equal(checkout.mode, 'dev');
  const session = new URL(checkout.url).searchParams.get('session');
  assert.equal((await post('/v1/billing/dev/complete', { session })).status, 200);
  const me = await (await get('/v1/me', token)).json();
  assert.equal(me.plan.id, 'pro');
  assert.equal(me.quota.limit, 1000);
  const est = await (await post('/v1/estimate', role('Product Manager'), token)).json();
  assert.ok(est.estimate.negotiation.target > 0);
  assert.ok(est.estimate.totalComp.p90 > 0);
  assert.equal((await get('/v1/history.csv', token)).status, 200);
  await post('/v1/billing/dev/cancel', {}, token);
  assert.equal((await (await get('/v1/me', token)).json()).plan.id, 'free');
});

test('a 30-day pass grants Pro without a subscription', async () => {
  const token = await signIn();
  const { url } = await (await post('/v1/billing/checkout', { interval: 'pass' }, token)).json();
  await post('/v1/billing/dev/complete', { session: new URL(url).searchParams.get('session') });
  const me = await (await get('/v1/me', token)).json();
  assert.equal(me.plan.id, 'pro');
  assert.ok(me.subscription.passExpiresAt);
  assert.equal(me.subscription.renewsAt, null);
});

test('burst limit returns 429 with Retry-After', async () => {
  let last: Response | undefined;
  for (let i = 0; i < 11; i++) last = await get('/v1/me');
  assert.equal(last!.status, 429);
  assert.ok(Number(last!.headers.get('Retry-After')) >= 1);
  assert.equal((await last!.json()).error.code, 'rate_limited');
});

test('token bucket refills over time', () => {
  const b = new TokenBucketLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(b.take('k', 5, 60_000, t0).allowed, true);
  assert.equal(b.take('k', 5, 60_000, t0).allowed, false);
  assert.equal(b.take('k', 5, 60_000, t0 + 12_000).allowed, true);
});

test('opted-out profiles are never estimated', async () => {
  assert.equal((await post('/v1/privacy/opt-out', { url: 'linkedin.com/in/private-person' })).status, 200);
  const res = await post('/v1/estimate', { url: 'https://www.linkedin.com/in/private-person/', profile: { title: 'Engineer' } });
  assert.equal(res.status, 451);
});

test('stripe webhook signatures are verified', () => {
  const body = '{"id":"evt_1"}';
  const t = Math.floor(Date.now() / 1000);
  const sig = hmac('whsec_test', `${t}.${body}`);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_test'), true);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig.replace(/.$/, '0')}`, 'whsec_test'), false);
  assert.equal(verifyStripeSignature(body, `t=${t - 3600},v1=${hmac('whsec_test', `${t - 3600}.${body}`)}`, 'whsec_test'), false);
});
