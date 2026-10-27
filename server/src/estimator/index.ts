// Deterministic, explainable compensation estimator.
// Same inputs → same output, every factor is shown to the user, and no per-lookup AI cost,
// which is what lets the free tier be generous.

import { FX, FX_AS_OF, LEVELS, METHODOLOGY_VERSION, TIERS } from './data.ts';
import type { TierId } from './data.ts';
import { matchCompany, matchLevel, matchMarket, matchRole } from './normalize.ts';

export interface PostedRange {
  min: number;
  max: number;
  currency: string;
  period: 'year' | 'month' | 'hour';
}

export interface EstimateInput {
  title: string;
  company?: string;
  location?: string;
  yearsExperience?: number;
  /** LinkedIn job "Seniority level" (Entry level, Mid-Senior level, Director…). */
  jobLevel?: string;
  postedRange?: PostedRange;
  overrides?: { tier?: TierId; marketId?: string; level?: number };
}

export interface Band {
  p25: number;
  p50: number;
  p75: number;
}

export interface Factor {
  key: 'role' | 'level' | 'company' | 'market' | 'experience';
  label: string;
  value: string;
  detail: string;
  /** Multiplier applied to base pay by this factor (null when it only informs). */
  multiplier: number | null;
  strength: 'strong' | 'medium' | 'weak';
}

export interface EstimateResult {
  currency: string;
  totalComp: Band & { p10: number | null; p90: number | null };
  base: Band;
  variable: Band & { kind: 'bonus' | 'commission'; label: string; targetPct: number };
  equity: Band & { label: string; note: string | null };
  usd: Band | null;
  confidence: { score: number; label: 'High' | 'Medium' | 'Low' };
  normalized: {
    roleFamily: { id: string; label: string };
    level: { code: number; id: string; label: string };
    company: { name: string | null; tier: TierId; tierLabel: string };
    market: { id: string; label: string; country: string; currency: string };
  };
  factors: Factor[];
  improve: Array<{ field: 'company' | 'location' | 'yearsExperience' | 'title'; hint: string; gain: number }>;
  negotiation: {
    openingAsk: number;
    target: number;
    walkAway: number;
    baseAsk: number;
    talkTrack: string;
  } | null;
  posted: (PostedRange & { annualMid: number; vsMarketBase: number; verdict: 'above' | 'at' | 'below' }) | null;
  locked: Array<'percentiles' | 'negotiation'>;
  methodology: { version: string; fxAsOf: string };
  disclaimer: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Round to 3 significant figures: 187,342 → 187,000; 2,345,678 → 2,350,000. */
export function nice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const mag = 10 ** (Math.floor(Math.log10(value)) - 2);
  return Math.round(value / mag) * mag;
}

const fmtUsd = (v: number) => `$${Math.round(v / 1000)}k`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function estimate(input: EstimateInput, opts: { fullPercentiles: boolean; negotiationBrief: boolean }): EstimateResult {
  const title = input.title.trim();
  const years = input.yearsExperience;
  const role = matchRole(title);
  const family = role.family;
  const company = matchCompany(input.company, input.overrides?.tier);
  const tier = company.tier;
  const levelMatch =
    input.overrides?.level !== undefined && LEVELS[input.overrides.level]
      ? { level: LEVELS[input.overrides.level], source: 'override' as const, evidence: 'Set by you' }
      : matchLevel(title, family, { years, jobLevel: input.jobLevel, tierId: tier.id });
  const level = levelMatch.level;
  const market = matchMarket(input.location, input.overrides?.marketId);
  const mk = market.market;

  const isFounder = family.id === 'founder';
  const isStudent = family.id === 'student';
  const levelMult = isFounder || isStudent ? 1 : level.mult;
  const locMult = mk.country === 'US' ? 1 + (mk.mult - 1) * (family.locationSensitivity ?? 1) : mk.mult;
  const expDelta = years === undefined || isFounder || isStudent ? 0 : clamp(years - level.years, -4, 6);
  const expAdj = 1 + 0.012 * expDelta;

  // Global employers pay a premium over local ones in emerging markets; IT-services firms pay below.
  const globalTiers: TierId[] = ['big_tech', 'high_growth', 'top_finance', 'elite_consulting', 'bank'];
  const tierMarketAdj = globalTiers.includes(tier.id)
    ? mk.premium
    : tier.id === 'enterprise'
      ? 1 + (mk.premium - 1) * 0.5
      : tier.id === 'agency'
        ? 1 / mk.premium
        : 1;

  // --- Point estimate (USD) ---
  const baseUsd = family.base * levelMult * tier.baseMult * tierMarketAdj * locMult * expAdj;
  const levelVariable = family.variableKind === 'commission' ? 1 : 1 + 0.18 * Math.max(0, level.code - 2);
  const variablePct =
    level.code === 0 || isStudent
      ? 0
      : Math.min(family.variable * levelVariable * tier.variableMult, family.variableKind === 'commission' ? 1.2 : 1.5);
  const equityPct = isFounder || isStudent ? 0 : tier.equityBase * family.equity * level.equity;
  // Drop components too small to matter (a $900 bonus on a nurse's pay is noise, not signal).
  const variableUsd = variablePct >= 0.02 ? baseUsd * variablePct : 0;
  const equityUsd = equityPct >= 0.02 ? baseUsd * equityPct : 0;
  const totalUsd = baseUsd + variableUsd + equityUsd;

  // --- Confidence ---
  let score = 0;
  score += role.signal === 'strong' ? 30 : role.signal === 'weak' ? 15 : 5;
  score += { title: 20, override: 20, job: 16, experience: 12, default: 6 }[levelMatch.source];
  score += { metro: 20, override: 20, country: 14, remote: 10, default: 4 }[market.source];
  score += { known: 20, override: 20, keyword: 12, unknown: 8, none: 2 }[company.source];
  score += years !== undefined ? 10 : 0;
  score = Math.min(score, family.maxConfidence ?? 95);
  const confidence = { score, label: (score >= 75 ? 'High' : score >= 50 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low' };

  // --- Ranges: lower confidence → wider band; pay distributions skew right ---
  const spread = 0.08 + (1 - score / 100) * 0.25;
  const fx = FX[mk.currency] ?? 1;
  const band = (usd: number, s: number): Band => ({
    p25: nice(usd * (1 - s) * fx),
    p50: nice(usd * fx),
    p75: nice(usd * (1 + s * 1.15) * fx),
  });
  const total = band(totalUsd, spread);
  const p10 = nice(totalUsd * Math.max(0.35, 1 - spread * 1.85) * fx);
  const p90 = nice(totalUsd * (1 + spread * 2.4) * fx);
  const base = band(baseUsd, spread * 0.75);
  const variable = band(variableUsd, spread * 1.3);
  const equity = band(equityUsd, spread * 1.6);

  // --- Explanation ---
  const strength = (s: 'strong' | 'weak' | 'none' | boolean): Factor['strength'] =>
    s === 'strong' || s === true ? 'strong' : s === 'weak' ? 'medium' : 'weak';
  const factors: Factor[] = [
    {
      key: 'role',
      label: 'Role',
      value: family.label,
      detail:
        role.signal === 'none'
          ? `We couldn't match "${title}" to a role family, so this uses a general benchmark (${fmtUsd(family.base)}).`
          : `US benchmark: ${fmtUsd(family.base)} base for a mid-level ${family.noun.replace(/s$/, '')}.`,
      multiplier: null,
      strength: strength(role.signal),
    },
    {
      key: 'level',
      label: 'Level',
      value: isFounder ? 'Founder' : isStudent ? 'Student' : level.label,
      detail: isFounder
        ? 'Founder pay is mostly ownership, which we do not annualize.'
        : levelMatch.source === 'default'
          ? 'No seniority in the title, so we assumed mid level. Add years of experience to refine.'
          : `${levelMatch.evidence ?? level.label}${levelMatch.source === 'experience' ? ' (inferred)' : ''}.`,
      multiplier: levelMult,
      strength: levelMatch.source === 'title' || levelMatch.source === 'override' ? 'strong' : levelMatch.source === 'default' ? 'weak' : 'medium',
    },
    {
      key: 'company',
      label: 'Company',
      value: input.company ? `${input.company} · ${tier.label}` : tier.label,
      detail:
        company.source === 'none'
          ? 'No company given, so we used a typical employer.'
          : `${tier.label}: base ×${tier.baseMult.toFixed(2)}, ${family.variableKind} ×${tier.variableMult.toFixed(1)}${
              equityPct > 0 ? `, ${tier.equityLabel.toLowerCase()} ≈ ${pct(equityPct)} of base` : ''
            }.`,
      multiplier: tier.baseMult,
      strength: company.source === 'known' || company.source === 'override' ? 'strong' : company.source === 'keyword' ? 'medium' : 'weak',
    },
    {
      key: 'market',
      label: 'Market',
      value: mk.label,
      detail:
        market.source === 'default'
          ? 'No location given, so we used the US national market.'
          : `${mk.country === 'US' ? `×${locMult.toFixed(2)} vs. US national` : `×${locMult.toFixed(2)} vs. US national, shown in ${mk.currency}`}.`,
      multiplier: Number(locMult.toFixed(3)),
      strength: market.source === 'metro' || market.source === 'override' ? 'strong' : market.source === 'country' ? 'medium' : 'weak',
    },
    {
      key: 'experience',
      label: 'Experience',
      value: years === undefined ? 'Not provided' : `${Math.round(years)} yrs`,
      detail:
        years === undefined
          ? 'Optional. Adds precision within a level.'
          : expDelta === 0
            ? 'Typical for this level.'
            : `${expDelta > 0 ? '+' : ''}${(expDelta * 1.2).toFixed(1)}% vs. typical ${level.years} yrs at this level.`,
      multiplier: years === undefined ? null : Number(expAdj.toFixed(3)),
      strength: years === undefined ? 'weak' : 'strong',
    },
  ];

  const improve: EstimateResult['improve'] = [];
  if (company.source === 'none') improve.push({ field: 'company', hint: 'Add the company', gain: 18 });
  if (market.source === 'default') improve.push({ field: 'location', hint: 'Add a city', gain: 16 });
  if (years === undefined && !isFounder) improve.push({ field: 'yearsExperience', hint: 'Add years of experience', gain: 10 });
  if (role.signal !== 'strong') improve.push({ field: 'title', hint: 'Use a more specific job title', gain: 15 });

  // --- Negotiation brief (paid feature; gated server-side) ---
  const tierPhrase = company.source === 'none' ? 'comparable companies' : `${tier.label.toLowerCase()} companies`;
  const targetTotal = nice(total.p50 + 0.4 * (total.p75 - total.p50));
  const negotiation = opts.negotiationBrief
    ? {
        openingAsk: nice(total.p75 + 0.25 * (p90 - total.p75)),
        target: targetTotal,
        walkAway: nice(total.p50 - 0.4 * (total.p50 - total.p25)),
        baseAsk: base.p75,
        talkTrack: `Based on market data for ${isFounder ? '' : `${level.label.toLowerCase()} `}${family.noun} at ${tierPhrase} in ${mk.label}, I'm targeting total compensation of around ${formatMoney(targetTotal, mk.currency)}.`,
      }
    : null;

  // --- Posted salary on a job (pay-transparency data) ---
  let posted: EstimateResult['posted'] = null;
  if (input.postedRange && input.postedRange.max > 0) {
    const pr = input.postedRange;
    const annualize = pr.period === 'hour' ? 2080 : pr.period === 'month' ? 12 : 1;
    const mid = ((pr.min + pr.max) / 2) * annualize;
    const midInEstimateCurrency = (mid / (FX[pr.currency] ?? 1)) * fx;
    const vs = base.p50 > 0 ? midInEstimateCurrency / base.p50 - 1 : 0;
    posted = { ...pr, annualMid: nice(mid), vsMarketBase: Number(vs.toFixed(3)), verdict: vs > 0.05 ? 'above' : vs < -0.05 ? 'below' : 'at' };
  }

  const locked: EstimateResult['locked'] = [];
  if (!opts.fullPercentiles) locked.push('percentiles');
  if (!opts.negotiationBrief) locked.push('negotiation');

  return {
    currency: mk.currency,
    totalComp: { ...total, p10: opts.fullPercentiles ? p10 : null, p90: opts.fullPercentiles ? p90 : null },
    base,
    variable: {
      ...variable,
      kind: family.variableKind,
      label: family.variableKind === 'commission' ? 'Commission' : 'Bonus',
      targetPct: Number(variablePct.toFixed(3)),
    },
    equity: {
      ...equity,
      label: tier.equityLabel,
      note: isFounder
        ? 'Founder ownership is not annualized.'
        : /paper value/.test(tier.equityLabel)
          ? 'Private-company equity is illiquid; this is its paper value per year.'
          : null,
    },
    usd: mk.currency === 'USD' ? null : { p25: nice(totalUsd * (1 - spread)), p50: nice(totalUsd), p75: nice(totalUsd * (1 + spread * 1.15)) },
    confidence,
    normalized: {
      roleFamily: { id: family.id, label: family.label },
      level: { code: level.code, id: level.id, label: isFounder ? 'Founder' : level.label },
      company: { name: input.company ?? null, tier: tier.id, tierLabel: TIERS[tier.id].label },
      market: { id: mk.id, label: mk.label, country: mk.country, currency: mk.currency },
    },
    factors,
    improve,
    negotiation,
    posted,
    locked,
    methodology: { version: METHODOLOGY_VERSION, fxAsOf: FX_AS_OF },
    disclaimer: "A market estimate for this role, not this person's actual pay.",
  };
}

export function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString('en-US')}`;
  }
}
