import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export type DB = DatabaseSync;

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     plan TEXT NOT NULL DEFAULT 'free',
     stripe_customer_id TEXT,
     stripe_subscription_id TEXT,
     subscription_status TEXT,
     subscription_interval TEXT,
     current_period_end INTEGER,
     cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
     pass_expires_at INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     client TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     last_used_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
   CREATE TABLE IF NOT EXISTS otp_codes (
     email TEXT PRIMARY KEY,
     code_hash TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     expires_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS lookups (
     id TEXT PRIMARY KEY,
     subject TEXT NOT NULL,
     subject_key TEXT NOT NULL,
     source TEXT NOT NULL,
     kind TEXT NOT NULL,
     input_hash TEXT NOT NULL,
     label TEXT,
     url TEXT,
     result_json TEXT,
     adjustments INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS lookups_subject_created ON lookups(subject, created_at);
   CREATE INDEX IF NOT EXISTS lookups_subject_key ON lookups(subject, subject_key, created_at);
   CREATE TABLE IF NOT EXISTS opt_outs (subject_key TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS profile_cache (
     subject_key TEXT PRIMARY KEY,
     profile_json TEXT NOT NULL,
     provider TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS checkout_sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     plan TEXT NOT NULL,
     interval TEXT NOT NULL,
     status TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, created_at INTEGER NOT NULL);`,
];

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  for (; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]);
      db.prepare('UPDATE schema_version SET version = ?').run(version + 1);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

/** Stable per-install secret for hashing IPs when APP_SECRET is not configured. */
export function getOrCreateSecret(db: DB): string {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'app_secret'").get() as { value: string } | undefined;
  if (row) return row.value;
  const value = randomBytes(32).toString('hex');
  db.prepare("INSERT INTO meta (key, value) VALUES ('app_secret', ?)").run(value);
  return value;
}

export interface UserRow {
  id: string;
  email: string;
  plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  subscription_interval: string | null;
  current_period_end: number | null;
  cancel_at_period_end: number;
  pass_expires_at: number | null;
  created_at: number;
}

export interface LookupRow {
  id: string;
  subject: string;
  subject_key: string;
  source: string;
  kind: string;
  input_hash: string;
  label: string | null;
  url: string | null;
  result_json: string | null;
  adjustments: number;
  created_at: number;
  updated_at: number;
}
