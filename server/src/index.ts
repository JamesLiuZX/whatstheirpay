import { serve } from '@hono/node-server';
import { config } from './config.ts';
import { getOrCreateSecret, openDb } from './db.ts';
import { createApp } from './app.ts';

if (config.isProduction && !config.appSecret) {
  console.error('APP_SECRET is required in production.');
  process.exit(1);
}

const db = openDb(config.databasePath);
const secret = config.appSecret || getOrCreateSecret(db);
const app = createApp({ db, secret });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`WhatsTheirPay API on http://localhost:${info.port}`);
  console.log(`  billing: ${config.stripe.secretKey ? 'stripe' : 'built-in test checkout'} · email: ${config.email.resendApiKey ? 'resend' : 'codes printed here'} · enrichment: ${config.pdlApiKey ? 'people data labs' : 'off (web try asks for title/company/city)'}`);
});
