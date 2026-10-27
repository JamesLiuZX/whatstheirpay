import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

/** Opaque bearer token. Only its SHA-256 is stored server-side. */
export function newToken() {
  return `wtp_${randomBytes(32).toString('base64url')}`;
}

export function newOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
