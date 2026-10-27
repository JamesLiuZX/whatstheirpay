// Burst limiter: an in-memory token bucket per subject.
// Fine for a single instance; swap the Map for Redis (same algorithm) when scaling out.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export interface BucketResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the next token is available (when blocked) or until the bucket is full. */
  resetSeconds: number;
  retryAfterSeconds: number;
}

export class TokenBucketLimiter {
  private buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  /**
   * @param capacity max burst size
   * @param windowMs time to refill an empty bucket completely
   */
  take(key: string, capacity: number, windowMs: number, now = Date.now()): BucketResult {
    const refillPerMs = capacity / windowMs;
    const bucket = this.buckets.get(key) ?? { tokens: capacity, updatedAt: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    this.sweep(now, windowMs);

    const missing = capacity - bucket.tokens;
    return {
      allowed,
      limit: capacity,
      remaining: Math.floor(bucket.tokens),
      resetSeconds: Math.ceil(missing / refillPerMs / 1000),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs / 1000)),
    };
  }

  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > Math.max(windowMs, 60_000) * 2) this.buckets.delete(key);
    }
  }

  reset() {
    this.buckets.clear();
  }
}

export const limiter = new TokenBucketLimiter();
