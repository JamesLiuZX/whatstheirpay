import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = resolve(here, '..');
export const WEB_ROOT = resolve(SERVER_ROOT, '..', 'web');

// Minimal .env loader so the server runs with `npm start` and no extra tooling.
function loadDotEnv(path: string) {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv(resolve(SERVER_ROOT, '.env'));

const env = (key: string, fallback = '') => (process.env[key] ?? '').trim() || fallback;
const list = (key: string) =>
  env(key)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const port = Number(env('PORT', '8787'));

export const config = {
  port,
  publicUrl: env('PUBLIC_URL', `http://localhost:${port}`).replace(/\/$/, ''),
  isProduction: env('NODE_ENV') === 'production',
  appSecret: env('APP_SECRET'),
  trustProxy: env('TRUST_PROXY') === '1',
  webOrigins: list('WEB_ORIGINS'),
  extensionIds: list('EXTENSION_IDS'),
  databasePath: resolve(SERVER_ROOT, env('DATABASE_PATH', './data/wtp.db')),
  email: {
    resendApiKey: env('RESEND_API_KEY'),
    from: env('EMAIL_FROM', 'WhatsTheirPay <login@whatstheirpay.com>'),
  },
  stripe: {
    secretKey: env('STRIPE_SECRET_KEY'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
    prices: {
      month: env('STRIPE_PRICE_PRO_MONTHLY'),
      year: env('STRIPE_PRICE_PRO_YEARLY'),
      pass: env('STRIPE_PRICE_PRO_PASS'),
    },
  },
  pdlApiKey: env('PDL_API_KEY'),
};

export const billingMode = () => (config.stripe.secretKey ? 'stripe' : 'dev');
