import type { DB, UserRow } from '../db.ts';
import { PLANS } from '../plans.ts';
import type { Plan, PlanId } from '../plans.ts';
import { hmac, newId, newOtpCode, newToken, safeEqual, sha256 } from '../lib/crypto.ts';

const DAY = 86_400_000;
const SESSION_TTL: Record<string, number> = { extension: 180 * DAY, web: 30 * DAY };
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
/** Keep paid features through short payment hiccups (Stripe retries failed cards for days). */
const PAST_DUE_GRACE_MS = 7 * DAY;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isValidEmail = (email: string) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i.test(email);

export function effectivePlanId(user: UserRow | null, now = Date.now()): PlanId {
  if (!user) return 'guest';
  const status = user.subscription_status ?? '';
  const periodOk = !user.current_period_end || user.current_period_end + (status === 'past_due' ? PAST_DUE_GRACE_MS : DAY) > now;
  if ((user.plan === 'pro' || user.plan === 'team') && ['active', 'trialing', 'past_due'].includes(status) && periodOk) {
    return user.plan;
  }
  if (user.pass_expires_at && user.pass_expires_at > now) return 'pro';
  return 'free';
}

export function effectivePlan(user: UserRow | null, now = Date.now()): Plan {
  return PLANS[effectivePlanId(user, now)];
}

export function getUser(db: DB, id: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null;
}

export function upsertUserByEmail(db: DB, email: string, now = Date.now()): UserRow {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (existing) return existing;
  const id = newId('usr');
  db.prepare('INSERT INTO users (id, email, plan, created_at) VALUES (?, ?, ?, ?)').run(id, email, 'free', now);
  return getUser(db, id)!;
}

export function createSession(db: DB, userId: string, client: 'web' | 'extension', now = Date.now()) {
  const token = newToken();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, client, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(sha256(token), userId, client, now, now, now + SESSION_TTL[client]);
  return token;
}

export function userForToken(db: DB, token: string, now = Date.now()): UserRow | null {
  const hash = sha256(token);
  const session = db.prepare('SELECT user_id, last_used_at, expires_at FROM sessions WHERE token_hash = ?').get(hash) as
    | { user_id: string; last_used_at: number; expires_at: number }
    | undefined;
  if (!session || session.expires_at < now) return null;
  if (now - session.last_used_at > 60 * 60 * 1000) {
    db.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').run(now, hash);
  }
  return getUser(db, session.user_id);
}

export function deleteSession(db: DB, token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

export function issueOtp(db: DB, secret: string, email: string, now = Date.now()) {
  const code = newOtpCode();
  db.prepare(
    `INSERT INTO otp_codes (email, code_hash, attempts, expires_at, created_at) VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
  ).run(email, hmac(secret, `${email}:${code}`), now + OTP_TTL_MS, now);
  return code;
}

export type OtpResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts';

export function verifyOtp(db: DB, secret: string, email: string, code: string, now = Date.now()): OtpResult {
  const row = db.prepare('SELECT code_hash, attempts, expires_at FROM otp_codes WHERE email = ?').get(email) as
    | { code_hash: string; attempts: number; expires_at: number }
    | undefined;
  if (!row) return 'invalid';
  if (row.expires_at < now) {
    db.prepare('DELETE FROM otp_codes WHERE email = ?').run(email);
    return 'expired';
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) return 'too_many_attempts';
  if (!safeEqual(row.code_hash, hmac(secret, `${email}:${code.trim()}`))) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    return row.attempts + 1 >= OTP_MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid';
  }
  db.prepare('DELETE FROM otp_codes WHERE email = ?').run(email);
  return 'ok';
}

export function subscriptionSummary(user: UserRow | null, now = Date.now()) {
  if (!user) return null;
  const passActive = Boolean(user.pass_expires_at && user.pass_expires_at > now);
  return {
    status: user.subscription_status,
    interval: user.subscription_interval,
    renewsAt: user.current_period_end && !user.cancel_at_period_end ? new Date(user.current_period_end).toISOString() : null,
    endsAt: user.current_period_end && user.cancel_at_period_end ? new Date(user.current_period_end).toISOString() : null,
    passExpiresAt: passActive ? new Date(user.pass_expires_at!).toISOString() : null,
    managedBy: user.stripe_customer_id ? 'stripe' : user.subscription_status ? 'dev' : null,
  };
}
