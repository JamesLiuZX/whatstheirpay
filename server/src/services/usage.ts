// Lookup ledger + quota accounting. A "lookup" is one unique profile/job/role per subject;
// re-viewing it within 30 days is free, and so are the first few edits to its inputs.

import type { DB, LookupRow } from '../db.ts';
import { FREE_ADJUSTMENTS_PER_LOOKUP, FREE_REVIEW_WINDOW_MS } from '../plans.ts';
import type { Plan } from '../plans.ts';
import { newId } from '../lib/crypto.ts';

export interface QuotaStatus {
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  period: 'day' | 'month';
  resetsAt: string;
}

export function quotaWindow(plan: Plan, now = Date.now()) {
  if (plan.quota.period === 'day') {
    // Rolling 24h for guests: no midnight cliff to game, and "resets in 9h" is easy to show.
    return { start: now - 86_400_000, resetsAt: null as number | null };
  }
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const resetsAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { start, resetsAt };
}

export function quotaStatus(db: DB, subject: string, plan: Plan, now = Date.now()): QuotaStatus {
  const { start, resetsAt } = quotaWindow(plan, now);
  const rows = db
    .prepare('SELECT created_at FROM lookups WHERE subject = ? AND created_at >= ? ORDER BY created_at ASC')
    .all(subject, start) as Array<{ created_at: number }>;
  const used = rows.length;
  // Rolling window: the next slot frees up 24h after the oldest lookup in the window.
  const reset = resetsAt ?? (rows.length ? rows[0].created_at + 86_400_000 : now + 86_400_000);
  return {
    plan: plan.id,
    limit: plan.quota.limit,
    used,
    remaining: Math.max(0, plan.quota.limit - used),
    period: plan.quota.period,
    resetsAt: new Date(reset).toISOString(),
  };
}

export function findRecentLookup(db: DB, subject: string, subjectKey: string, now = Date.now()): LookupRow | null {
  return (
    (db
      .prepare('SELECT * FROM lookups WHERE subject = ? AND subject_key = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1')
      .get(subject, subjectKey, now - FREE_REVIEW_WINDOW_MS) as LookupRow | undefined) ?? null
  );
}

export function findLookupById(db: DB, subject: string, id: string, now = Date.now()): LookupRow | null {
  return (
    (db.prepare('SELECT * FROM lookups WHERE id = ? AND subject = ? AND created_at > ?').get(id, subject, now - FREE_REVIEW_WINDOW_MS) as
      | LookupRow
      | undefined) ?? null
  );
}

export type ChargeDecision =
  | { charge: false; reason: 'review' | 'adjustment'; existing: LookupRow }
  | { charge: true; reason: 'new' | 'adjustments_exhausted' };

export function decideCharge(existing: LookupRow | null, inputHash: string): ChargeDecision {
  if (!existing) return { charge: true, reason: 'new' };
  if (existing.input_hash === inputHash) return { charge: false, reason: 'review', existing };
  if (existing.adjustments < FREE_ADJUSTMENTS_PER_LOOKUP) return { charge: false, reason: 'adjustment', existing };
  return { charge: true, reason: 'adjustments_exhausted' };
}

export interface LookupWrite {
  subject: string;
  subjectKey: string;
  source: string;
  kind: string;
  inputHash: string;
  label: string | null;
  url: string | null;
  resultJson: string | null;
}

export function insertLookup(db: DB, w: LookupWrite, now = Date.now()): string {
  const id = newId('lk');
  db.prepare(
    `INSERT INTO lookups (id, subject, subject_key, source, kind, input_hash, label, url, result_json, adjustments, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, w.subject, w.subjectKey, w.source, w.kind, w.inputHash, w.label, w.url, w.resultJson, now, now);
  return id;
}

export function updateLookup(db: DB, id: string, w: Pick<LookupWrite, 'inputHash' | 'label' | 'resultJson'>, isAdjustment: boolean, now = Date.now()) {
  db.prepare(
    `UPDATE lookups SET input_hash = ?, label = COALESCE(?, label), result_json = COALESCE(?, result_json),
       adjustments = adjustments + ?, updated_at = ? WHERE id = ?`,
  ).run(w.inputHash, w.label, w.resultJson, isAdjustment ? 1 : 0, now, id);
}
