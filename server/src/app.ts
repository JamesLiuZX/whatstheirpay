import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { serveStatic } from '@hono/node-server/serve-static';
import { WEB_ROOT, billingMode, config } from './config.ts';
import type { DB, UserRow } from './db.ts';
import { PLANS, publicPlanCatalog } from './plans.ts';
import type { BillingInterval, Plan } from './plans.ts';
import { limiter } from './lib/ratelimit.ts';
import { hmac, sha256 } from './lib/crypto.ts';
import { apiError, clientIp, num, readJson, str } from './lib/http.ts';
import {
  createSession,
  deleteSession,
  effectivePlan,
  getUser,
  isValidEmail,
  issueOtp,
  normalizeEmail,
  subscriptionSummary,
  upsertUserByEmail,
  userForToken,
  verifyOtp,
} from './services/accounts.ts';
import { decideCharge, findLookupById, findRecentLookup, insertLookup, quotaStatus, updateLookup } from './services/usage.ts';
import type { QuotaStatus } from './services/usage.ts';
import { emailConfigured, sendSignInCode } from './services/email.ts';
import {
  completeDevCheckout,
  createCheckout,
  createPortal,
  endSubscription,
  getDevCheckout,
  handleStripeEvent,
  verifyStripeSignature,
} from './services/billing.ts';
import type { StripeEvent } from './services/billing.ts';
import { estimate } from './estimator/index.ts';
import { parsePostedSalary } from './estimator/salary.ts';
import { TIERS } from './estimator/data.ts';
import type { TierId } from './estimator/data.ts';
import { parseLinkedInUrl } from './resolvers/linkedin.ts';
import { resolveLinkedIn } from './resolvers/index.ts';
import { EXTENSION_CONFIG } from './extension-config.ts';
import { EXAMPLES, isExampleId } from './examples.ts';

type Vars = {
  user: UserRow | null;
  plan: Plan;
  subject: string;
  ipHash: string;
  token: string | null;
};
type Env = { Variables: Vars };

export interface AppDeps {
  db: DB;
  secret: string;
  fetch?: typeof fetch;
}

export function createApp({ db, secret, fetch: fetchImpl = fetch }: AppDeps) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error('[api] unhandled', err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.' } }, 500);
  });

  // ---------- CORS: our site + the extension. Extension service workers aren't bound by CORS,
  // but content-script and popup requests carry an Origin we want to allow explicitly.
  const allowedOrigins = new Set([new URL(config.publicUrl).origin, ...config.webOrigins]);
  app.use(
    '/v1/*',
    cors({
      origin: (origin) => {
        if (!origin) return null;
        if (allowedOrigins.has(origin)) return origin;
        if (origin.startsWith('chrome-extension://')) {
          const id = origin.slice('chrome-extension://'.length);
          if (!config.isProduction || config.extensionIds.includes(id)) return origin;
        }
        if (!config.isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
        return null;
      },
      allowHeaders: ['Authorization', 'Content-Type', 'X-Client'],
      exposeHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After', 'X-Quota-Limit', 'X-Quota-Remaining', 'X-Quota-Reset'],
      maxAge: 600,
    }),
  );

  // ---------- Identity: bearer token → user; everyone else is a guest keyed by a hashed IP.
  app.use('/v1/*', async (c, next) => {
    const auth = c.req.header('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const user = token ? userForToken(db, token) : null;
    if (token && !user && !c.req.path.startsWith('/v1/auth/')) {
      throw apiError(401, 'session_expired', 'Your session expired. Please sign in again.');
    }
    const ipHash = hmac(secret, `ip:${clientIp(c)}`).slice(0, 32);
    c.set('token', user ? token : null);
    c.set('user', user);
    c.set('plan', effectivePlan(user));
    c.set('ipHash', ipHash);
    c.set('subject', user ? `u:${user.id}` : `ip:${ipHash}`);
    await next();
  });

  // ---------- Burst limit (token bucket per subject). Webhooks are exempt.
  app.use('/v1/*', async (c, next) => {
    if (c.req.path === '/v1/billing/webhook' || c.req.method === 'OPTIONS') return next();
    const plan = c.get('plan');
    const r = limiter.take(`burst:${c.get('subject')}`, plan.burstPerMinute, 60_000);
    c.header('RateLimit-Limit', String(r.limit));
    c.header('RateLimit-Remaining', String(r.remaining));
    c.header('RateLimit-Reset', String(r.resetSeconds));
    if (!r.allowed) {
      c.header('Retry-After', String(r.retryAfterSeconds));
      throw apiError(429, 'rate_limited', `Too many requests. Try again in ${r.retryAfterSeconds}s.`, {
        retryAfter: r.retryAfterSeconds,
      });
    }
    await next();
  });

  const requireUser = (c: Context<Env>) => {
    const user = c.get('user');
    if (!user) throw apiError(401, 'auth_required', 'Sign in to continue.');
    return user;
  };
  const setQuotaHeaders = (c: Context<Env>, q: QuotaStatus) => {
    c.header('X-Quota-Limit', String(q.limit));
    c.header('X-Quota-Remaining', String(q.remaining));
    c.header('X-Quota-Reset', q.resetsAt);
  };
  const planPayload = (plan: Plan) => ({ id: plan.id, name: plan.name, features: plan.features });

  // ---------- Meta
  app.get('/health', (c) =>
    c.json({ ok: true, billing: billingMode(), email: emailConfigured() ? 'resend' : 'console', enrichment: config.pdlApiKey ? 'pdl' : 'none' }),
  );
  app.get('/v1/plans', (c) => {
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ ...publicPlanCatalog(), billingMode: billingMode() });
  });
  app.get('/v1/extension/config', (c) => {
    c.header('Cache-Control', 'public, max-age=600');
    return c.json(EXTENSION_CONFIG);
  });
  app.get('/v1/options', (c) =>
    c.json({ tiers: Object.values(TIERS).map(({ id, label }) => ({ id, label })) }),
  );

  // ---------- Auth: passwordless 6-digit email codes (typed right inside the extension panel)
  app.post('/v1/auth/start', async (c) => {
    const body = await readJson<{ email?: unknown }>(c);
    const email = normalizeEmail(str(body.email, 320) ?? '');
    if (!isValidEmail(email)) throw apiError(400, 'invalid_email', 'Enter a valid email address.');
    const perIp = limiter.take(`otp-ip:${c.get('ipHash')}`, 10, 60 * 60_000);
    const perEmail = limiter.take(`otp-email:${email}`, 3, 10 * 60_000);
    if (!perIp.allowed || !perEmail.allowed) {
      const wait = Math.max(perIp.retryAfterSeconds, perEmail.retryAfterSeconds);
      c.header('Retry-After', String(wait));
      throw apiError(429, 'rate_limited', `Too many codes requested. Try again in ${Math.ceil(wait / 60)} min.`, { retryAfter: wait });
    }
    const code = issueOtp(db, secret, email);
    try {
      await sendSignInCode(email, code, fetchImpl);
    } catch (err) {
      console.error('[auth] email failed', err);
      throw apiError(502, 'email_failed', "We couldn't send the code. Please try again.");
    }
    const exposeCode = !config.isProduction && !emailConfigured();
    return c.json({ ok: true, ...(exposeCode ? { devCode: code } : {}) });
  });

  app.post('/v1/auth/verify', async (c) => {
    const body = await readJson<{ email?: unknown; code?: unknown; client?: unknown }>(c);
    const email = normalizeEmail(str(body.email, 320) ?? '');
    const code = str(body.code, 12) ?? '';
    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) throw apiError(400, 'invalid_code', 'Enter the 6-digit code from your email.');
    const result = verifyOtp(db, secret, email, code);
    if (result === 'expired') throw apiError(400, 'code_expired', 'That code expired. Request a new one.');
    if (result === 'too_many_attempts') throw apiError(429, 'too_many_attempts', 'Too many wrong attempts. Request a new code.');
    if (result !== 'ok') throw apiError(400, 'invalid_code', "That code didn't match. Check your email and try again.");
    const user = upsertUserByEmail(db, email);
    const client = body.client === 'extension' ? 'extension' : 'web';
    const token = createSession(db, user.id, client);
    const plan = effectivePlan(user);
    return c.json({
      token,
      user: { id: user.id, email: user.email },
      plan: planPayload(plan),
      quota: quotaStatus(db, `u:${user.id}`, plan),
    });
  });

  app.post('/v1/auth/logout', (c) => {
    const token = c.req.header('authorization')?.replace(/^Bearer\s+/, '');
    if (token) deleteSession(db, token);
    return c.json({ ok: true });
  });

  app.get('/v1/me', (c) => {
    const user = c.get('user');
    const plan = c.get('plan');
    const quota = quotaStatus(db, c.get('subject'), plan);
    setQuotaHeaders(c, quota);
    return c.json({
      user: user ? { id: user.id, email: user.email } : null,
      plan: planPayload(plan),
      quota,
      subscription: subscriptionSummary(user),
      billingMode: billingMode(),
    });
  });

  app.get('/v1/examples', (c) => c.json({ examples: Object.entries(EXAMPLES).map(([id, e]) => ({ id, label: e.label })) }));

  // ---------- Estimate
  app.post('/v1/estimate', async (c) => {
    const body = await readJson<Record<string, unknown>>(c);
    const plan = c.get('plan');
    const user = c.get('user');
    const subject = c.get('subject');

    if (isExampleId(body.example)) {
      const { label: _label, ...ex } = EXAMPLES[body.example];
      const quota = quotaStatus(db, subject, plan);
      return c.json({
        status: 'ok',
        example: true,
        lookupId: null,
        charged: false,
        chargeReason: 'example',
        provider: null,
        profile: { kind: 'manual', url: null, name: null, jobLevel: null, postedSalary: null, ...ex },
        estimate: estimate(ex, { fullPercentiles: true, negotiationBrief: true }),
        quota,
        plan: planPayload(plan),
      });
    }
    const p = (body.profile && typeof body.profile === 'object' ? body.profile : {}) as Record<string, unknown>;
    const o = (body.overrides && typeof body.overrides === 'object' ? body.overrides : {}) as Record<string, unknown>;
    const source = ['web', 'extension', 'api'].includes(body.source as string) ? (body.source as string) : 'web';

    const rawUrl = str(body.url, 500);
    const ref = rawUrl ? parseLinkedInUrl(rawUrl) : null;
    if (rawUrl && !ref) {
      throw apiError(400, 'invalid_url', 'Paste a LinkedIn profile (linkedin.com/in/…) or job (linkedin.com/jobs/view/…) URL.');
    }
    if (ref && db.prepare('SELECT 1 FROM opt_outs WHERE subject_key = ?').get(ref.key)) {
      throw apiError(451, 'opted_out', 'This person has asked us not to estimate their profile.');
    }

    const existingById = str(body.lookupId, 64) ? findLookupById(db, subject, str(body.lookupId, 64)!) : null;

    const fields = {
      name: str(p.name, 120),
      title: str(p.title, 160),
      company: str(p.company, 120),
      location: str(p.location, 120),
      headline: str(p.headline, 220),
      yearsExperience: num(p.yearsExperience, 0, 50),
      jobLevel: str(p.jobLevel, 60),
      postedSalary: str(p.postedSalary, 160),
    };

    // Fill gaps from the URL (cache → licensed enrichment → name from slug). Never scrapes LinkedIn.
    let provider: string | null = null;
    if (ref && !fields.title) {
      const resolved = await resolveLinkedIn(db, ref, fetchImpl);
      provider = resolved.provider;
      for (const [k, v] of Object.entries(resolved.profile)) {
        if (v !== undefined && (fields as Record<string, unknown>)[k] === undefined) (fields as Record<string, unknown>)[k] = v;
      }
    }
    if (!fields.title) {
      return c.json({
        status: 'needs_input',
        ref: ref ? { kind: ref.kind, url: ref.url } : null,
        profile: fields,
        missing: ['title', ...(!fields.company ? ['company'] : []), ...(!fields.location ? ['location'] : [])],
        message:
          ref?.kind === 'job'
            ? 'Add the job title, company and city and we will price it.'
            : "We can't read this profile automatically yet. Add their title, company and city (about 10 seconds).",
      });
    }

    const overrides = {
      tier: typeof o.tier === 'string' && o.tier in TIERS ? (o.tier as TierId) : undefined,
      marketId: str(o.marketId, 40),
      level: typeof o.level === 'number' && Number.isInteger(o.level) && o.level >= 0 && o.level <= 9 ? o.level : undefined,
    };
    const normalizedInput = [fields.title, fields.company, fields.location].map((v) => (v ?? '').toLowerCase()).join('|');
    const subjectKey = existingById?.subject_key ?? ref?.key ?? `role:${sha256(normalizedInput).slice(0, 20)}`;
    const kind = ref?.kind ?? (fields.postedSalary || fields.jobLevel ? 'job' : 'manual');
    const inputHash = sha256(
      JSON.stringify([fields.title, fields.company, fields.location, fields.yearsExperience, fields.jobLevel, fields.postedSalary, overrides]),
    );

    // Everything from here to the write is synchronous, so the quota check can't race.
    const recent = existingById ?? findRecentLookup(db, subject, subjectKey);
    const decision = decideCharge(recent, inputHash);
    if (decision.charge) {
      const q = quotaStatus(db, subject, plan);
      setQuotaHeaders(c, q);
      if (q.remaining <= 0) {
        throw apiError(429, 'quota_exceeded', quotaMessage(plan, q), {
          quota: q,
          upgrade: plan.id === 'guest' ? { action: 'signup', plan: 'free' } : plan.id === 'free' ? { action: 'upgrade', plan: 'pro' } : null,
        });
      }
    }

    const result = estimate(
      {
        title: fields.title,
        company: fields.company,
        location: fields.location,
        yearsExperience: fields.yearsExperience,
        jobLevel: fields.jobLevel,
        postedRange: parsePostedSalary(fields.postedSalary),
        overrides,
      },
      plan.features,
    );

    const profileOut = {
      kind,
      url: ref?.url ?? null,
      name: fields.name ?? null,
      title: fields.title,
      company: fields.company ?? null,
      location: fields.location ?? null,
      yearsExperience: fields.yearsExperience ?? null,
      jobLevel: fields.jobLevel ?? null,
      postedSalary: fields.postedSalary ?? null,
    };
    // Guests: store only what quota accounting needs. Signed-in users get history.
    const label = user ? [fields.name, `${fields.title}${fields.company ? ` @ ${fields.company}` : ''}`].filter(Boolean).join(' · ') : null;
    const resultJson = user ? JSON.stringify({ profile: profileOut, estimate: result }) : null;

    let lookupId: string;
    if (decision.charge) {
      lookupId = insertLookup(db, { subject, subjectKey, source, kind, inputHash, label, url: user ? (ref?.url ?? null) : null, resultJson });
    } else {
      lookupId = decision.existing.id;
      updateLookup(db, lookupId, { inputHash, label, resultJson }, decision.reason === 'adjustment');
    }
    const quota = quotaStatus(db, subject, plan);
    setQuotaHeaders(c, quota);

    return c.json({
      status: 'ok',
      lookupId,
      charged: decision.charge,
      chargeReason: decision.reason,
      provider,
      profile: profileOut,
      estimate: result,
      quota,
      plan: planPayload(plan),
    });
  });

  // ---------- History
  app.get('/v1/history', (c) => {
    const user = requireUser(c);
    const plan = c.get('plan');
    const rows = db
      .prepare('SELECT id, kind, label, url, result_json, created_at, updated_at FROM lookups WHERE subject = ? ORDER BY updated_at DESC LIMIT ?')
      .all(`u:${user.id}`, plan.features.historyLimit) as Array<{
      id: string;
      kind: string;
      label: string | null;
      url: string | null;
      result_json: string | null;
      created_at: number;
      updated_at: number;
    }>;
    return c.json({
      items: rows.map((r) => {
        const parsed = r.result_json ? JSON.parse(r.result_json) : null;
        const e = parsed?.estimate;
        return {
          id: r.id,
          kind: r.kind,
          label: r.label,
          url: r.url,
          profile: parsed?.profile ?? null,
          summary: e ? { currency: e.currency, p25: e.totalComp.p25, p50: e.totalComp.p50, p75: e.totalComp.p75, confidence: e.confidence.label } : null,
          viewedAt: new Date(r.updated_at).toISOString(),
        };
      }),
      limit: plan.features.historyLimit,
    });
  });

  app.get('/v1/history.csv', (c) => {
    const user = requireUser(c);
    if (!c.get('plan').features.csvExport) throw apiError(402, 'upgrade_required', 'CSV export is a Pro feature.');
    const rows = db
      .prepare('SELECT result_json, updated_at FROM lookups WHERE subject = ? AND result_json IS NOT NULL ORDER BY updated_at DESC')
      .all(`u:${user.id}`) as Array<{ result_json: string; updated_at: number }>;
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      // Neutralize spreadsheet formulas and quote everything.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const header = ['viewed_at', 'name', 'title', 'company', 'location', 'url', 'currency', 'total_p25', 'total_p50', 'total_p75', 'base_p50', 'variable_p50', 'equity_p50', 'confidence'];
    const lines = rows.map(({ result_json, updated_at }) => {
      const { profile: pr, estimate: e } = JSON.parse(result_json);
      return [new Date(updated_at).toISOString(), pr.name, pr.title, pr.company, pr.location, pr.url, e.currency, e.totalComp.p25, e.totalComp.p50, e.totalComp.p75, e.base.p50, e.variable.p50, e.equity.p50, e.confidence.score]
        .map(esc)
        .join(',');
    });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="whatstheirpay-history.csv"');
    return c.body([header.join(','), ...lines].join('\n'));
  });

  // ---------- Billing
  app.post('/v1/billing/checkout', async (c) => {
    const user = requireUser(c);
    const body = await readJson<{ interval?: unknown }>(c);
    const interval = (['month', 'year', 'pass'] as const).find((i) => i === body.interval);
    if (!interval) throw apiError(400, 'invalid_interval', 'Choose monthly, yearly or a 30-day pass.');
    const fresh = getUser(db, user.id)!;
    if (interval !== 'pass' && effectivePlan(fresh).id !== 'free' && fresh.subscription_status === 'active') {
      throw apiError(409, 'already_subscribed', 'You already have an active subscription. Manage it from your account.');
    }
    try {
      return c.json(await createCheckout(db, fresh, interval, fetchImpl));
    } catch (err) {
      console.error('[billing] checkout failed', err);
      throw apiError(502, 'checkout_failed', "We couldn't start checkout. Please try again.");
    }
  });

  app.post('/v1/billing/portal', async (c) => {
    const user = requireUser(c);
    try {
      return c.json(await createPortal(user, fetchImpl));
    } catch (err) {
      console.error('[billing] portal failed', err);
      throw apiError(502, 'portal_failed', "We couldn't open billing. Please try again.");
    }
  });

  app.post('/v1/billing/webhook', async (c) => {
    const raw = await c.req.text();
    if (!verifyStripeSignature(raw, c.req.header('stripe-signature'), config.stripe.webhookSecret)) {
      throw apiError(400, 'invalid_signature', 'Invalid Stripe signature.');
    }
    const event = JSON.parse(raw) as StripeEvent;
    const outcome = await handleStripeEvent(db, event, fetchImpl);
    return c.json({ received: true, outcome });
  });

  // Built-in test checkout (only when Stripe isn't configured).
  const requireDevBilling = () => {
    if (billingMode() !== 'dev') throw apiError(404, 'not_found', 'Not found.');
  };
  app.get('/v1/billing/dev/session/:id', (c) => {
    requireDevBilling();
    const session = getDevCheckout(db, c.req.param('id'));
    if (!session) throw apiError(404, 'not_found', 'Checkout session not found.');
    const price = PLANS.pro.prices[session.interval as BillingInterval];
    return c.json({ ...session, plan: 'pro', price });
  });
  app.post('/v1/billing/dev/complete', async (c) => {
    requireDevBilling();
    const body = await readJson<{ session?: unknown }>(c);
    const done = completeDevCheckout(db, str(body.session, 80) ?? '');
    if (!done) throw apiError(404, 'not_found', 'Checkout session not found or already used.');
    return c.json({ ok: true, redirect: `${config.publicUrl}/account.html?checkout=success` });
  });
  app.post('/v1/billing/dev/cancel', (c) => {
    requireDevBilling();
    const user = requireUser(c);
    endSubscription(db, user.id);
    db.prepare('UPDATE users SET pass_expires_at = NULL WHERE id = ?').run(user.id);
    return c.json({ ok: true });
  });

  // ---------- Privacy: anyone can ask us to never estimate a profile.
  app.post('/v1/privacy/opt-out', async (c) => {
    const body = await readJson<{ url?: unknown }>(c);
    const ref = parseLinkedInUrl(str(body.url, 500) ?? '');
    if (!ref || ref.kind !== 'profile') throw apiError(400, 'invalid_url', 'Paste the LinkedIn profile URL (linkedin.com/in/…).');
    db.prepare('INSERT OR IGNORE INTO opt_outs (subject_key, created_at) VALUES (?, ?)').run(ref.key, Date.now());
    db.prepare('DELETE FROM lookups WHERE subject_key = ?').run(ref.key);
    db.prepare('DELETE FROM profile_cache WHERE subject_key = ?').run(ref.key);
    return c.json({ ok: true });
  });

  app.all('/v1/*', () => {
    throw apiError(404, 'not_found', 'Unknown API route.');
  });

  // ---------- Static site (landing page, account, test checkout)
  app.use('*', async (c, next) => {
    await next();
    if ((c.res.headers.get('Content-Type') ?? '').includes('text/html')) {
      c.res.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      c.res.headers.set('X-Content-Type-Options', 'nosniff');
      c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    }
  });
  app.use('*', serveStatic({ root: WEB_ROOT }));
  app.notFound((c) => c.text('Not found', 404));

  return app;
}

function quotaMessage(plan: Plan, q: QuotaStatus) {
  const when = new Date(q.resetsAt);
  if (plan.id === 'guest') return `You've used today's ${q.limit} free estimates. Create a free account for ${PLANS.free.quota.limit} a month.`;
  if (plan.id === 'free') return `You've used all ${q.limit} free estimates this month. They reset on ${when.toUTCString().slice(5, 11)}, or go Pro for ${PLANS.pro.quota.limit.toLocaleString('en-US')}.`;
  return `You've reached this month's ${q.limit.toLocaleString('en-US')} estimates. They reset on ${when.toUTCString().slice(5, 11)}.`;
}
