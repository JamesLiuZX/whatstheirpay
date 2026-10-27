import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { config } from '../config.ts';

export interface ApiErrorBody {
  error: { code: string; message: string; [key: string]: unknown };
}

/** Throw from any handler; rendered as `{ error: { code, message, ...extra } }`. */
export function apiError(status: ContentfulStatusCode, code: string, message: string, extra: Record<string, unknown> = {}) {
  const body: ApiErrorBody = { error: { code, message, ...extra } };
  return new HTTPException(status, { res: Response.json(body, { status }) });
}

export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0].trim();
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  const text = await c.req.text();
  if (text.length > 32_000) throw apiError(413, 'payload_too_large', 'Request body is too large.');
  if (!text) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as T;
  } catch {
    throw apiError(400, 'invalid_json', 'Request body must be a JSON object.');
  }
}

/** Trimmed, length-capped string or undefined. */
export function str(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

export function num(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}
