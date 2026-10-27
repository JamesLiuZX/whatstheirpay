// Single source of truth for pricing, quotas, burst limits and feature gates.
// The landing page, the extension and the API all read this through GET /v1/plans.

export type PlanId = 'guest' | 'free' | 'pro' | 'team';
export type BillingInterval = 'month' | 'year' | 'pass';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Unique profiles/jobs you can estimate per period. Re-views and edits are free. */
  quota: { limit: number; period: 'day' | 'month' };
  /** Token-bucket size for every API request (refills continuously over a minute). */
  burstPerMinute: number;
  features: {
    /** p10/p90 tails in addition to the p25–p75 range everyone gets. */
    fullPercentiles: boolean;
    /** Opening ask / target / walk-away numbers plus a talk track. */
    negotiationBrief: boolean;
    /** Estimate automatically when a profile opens (otherwise one click). */
    autoReveal: boolean;
    /** How many past lookups the history keeps visible. */
    historyLimit: number;
    csvExport: boolean;
  };
  prices: Partial<Record<BillingInterval, { amount: number; label: string; note: string }>>;
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  guest: {
    id: 'guest',
    name: 'Guest',
    tagline: 'Try it without an account',
    quota: { limit: 3, period: 'day' },
    burstPerMinute: 10,
    features: { fullPercentiles: false, negotiationBrief: false, autoReveal: false, historyLimit: 0, csvExport: false },
    prices: {},
    highlights: ['3 estimates a day', 'Website and extension', 'No signup'],
  },
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'For the occasional check',
    quota: { limit: 30, period: 'month' },
    burstPerMinute: 20,
    features: { fullPercentiles: false, negotiationBrief: false, autoReveal: false, historyLimit: 10, csvExport: false },
    prices: { month: { amount: 0, label: '$0', note: 'forever' } },
    highlights: [
      '30 estimates a month',
      'Base, bonus and equity breakdown',
      'The math behind every estimate',
      'LinkedIn profiles and job posts',
      'Last 10 lookups saved',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For job hunts and negotiations',
    quota: { limit: 1000, period: 'month' },
    burstPerMinute: 60,
    features: { fullPercentiles: true, negotiationBrief: true, autoReveal: true, historyLimit: 500, csvExport: true },
    prices: {
      month: { amount: 12, label: '$12', note: 'per month, cancel in one click' },
      year: { amount: 96, label: '$8', note: 'per month, billed $96 yearly' },
      pass: { amount: 15, label: '$15', note: 'once, 30 days of Pro, never renews' },
    },
    highlights: [
      '1,000 estimates a month',
      'Negotiation brief: ask, target, walk-away',
      'Full p10–p90 pay range',
      'Auto-reveal on every profile',
      'Unlimited history and CSV export',
    ],
  },
  team: {
    id: 'team',
    name: 'Team',
    tagline: 'For recruiting and talent teams',
    quota: { limit: 3000, period: 'month' },
    burstPerMinute: 120,
    features: { fullPercentiles: true, negotiationBrief: true, autoReveal: true, historyLimit: 5000, csvExport: true },
    prices: { month: { amount: 39, label: '$39', note: 'per seat per month, billed yearly' } },
    highlights: ['3,000 estimates per seat each month', 'Everything in Pro', 'Shared workspace and API (beta)', 'Priority support'],
  },
};

/** Lookups re-viewed within this window never cost a credit. */
export const FREE_REVIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Edits to a lookup's inputs (title, city…) that stay free before an edit counts as a new lookup. */
export const FREE_ADJUSTMENTS_PER_LOOKUP = 10;
export const PASS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function publicPlanCatalog() {
  return {
    plans: Object.values(PLANS).map(({ id, name, tagline, quota, burstPerMinute, features, prices, highlights }) => ({
      id,
      name,
      tagline,
      quota,
      burstPerMinute,
      features,
      prices,
      highlights,
    })),
    rules: {
      freeReviewWindowDays: FREE_REVIEW_WINDOW_MS / 86_400_000,
      freeAdjustmentsPerLookup: FREE_ADJUSTMENTS_PER_LOOKUP,
      passDays: PASS_DURATION_MS / 86_400_000,
    },
  };
}
