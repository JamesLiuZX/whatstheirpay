import {
  COMPANY_KEYWORDS,
  COMPANY_TIERS,
  FOUNDER_PATTERN,
  GENERAL_FAMILY,
  LEVELS,
  MARKETS,
  ROLE_FAMILIES,
  TIERS,
  US_NATIONAL,
  WEAK_FAMILIES,
} from './data.ts';
import type { Level, Market, RoleFamily, Tier, TierId } from './data.ts';

export type Signal = 'strong' | 'weak' | 'none';

export interface RoleMatch {
  family: RoleFamily;
  signal: Signal;
}

export function matchRole(title: string): RoleMatch {
  const t = title.trim();
  if (!t) return { family: GENERAL_FAMILY, signal: 'none' };
  if (FOUNDER_PATTERN.test(t)) return { family: ROLE_FAMILIES.find((f) => f.id === 'founder')!, signal: 'strong' };
  for (const family of ROLE_FAMILIES) {
    if (family.patterns.some((p) => p.test(t))) return { family, signal: 'strong' };
  }
  for (const family of WEAK_FAMILIES) {
    if (family.patterns.some((p) => p.test(t))) return { family, signal: 'weak' };
  }
  return { family: GENERAL_FAMILY, signal: 'none' };
}

export interface LevelMatch {
  level: Level;
  source: 'title' | 'experience' | 'job' | 'default';
  /** The words that decided it, for the explanation panel. */
  evidence?: string;
}

const L = (code: number) => LEVELS[code];

// Internal ladders used at large tech companies (L5 at Google ≈ Senior, E6 at Meta ≈ Staff…).
const LADDER = /\b(?:L|E|IC|ICT)([1-9])\b/i;
const ladderToLevel: Record<string, number> = { '1': 1, '2': 1, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7 };
// "SDE 2", "SWE III" style numbering counts from entry level instead.
const SDE_N = /\b(?:SDE|SWE|SE)\s?([1-5])\b/i;
const ROMAN = /\b(?:engineer|developer|scientist|analyst|designer|manager|sde|specialist|associate|consultant|accountant|representative)\s+(I{1,3}|IV|V)\b/i;
const romanToLevel: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

export function matchLevel(
  title: string,
  family: RoleFamily,
  opts: { years?: number; jobLevel?: string; tierId?: TierId } = {},
): LevelMatch {
  const { years, jobLevel, tierId } = opts;
  const t = ` ${title.toLowerCase()} `;
  const has = (re: RegExp) => re.test(t);
  const managerLevel = family.tech ? 4 : 3;
  const found = (code: number, evidence: string): LevelMatch => ({ level: L(code), source: 'title', evidence });

  // C-suite and executive titles first: they override every other keyword.
  if (has(/\b(chief [a-z]+ officer|ceo|cto|cfo|coo|cmo|cpo|cro|ciso|cio|chro|president)\b/) && !has(/\bvice president\b/))
    return found(9, 'C-suite title');
  const bankingLadder = family.id === 'ib' || family.id === 'investing' || (family.banking && (tierId === 'bank' || tierId === 'top_finance'));
  if (bankingLadder) {
    if (has(/\b(managing director|md)\b/)) return found(7, 'Managing Director');
    if (has(/\b(executive director|director)\b/)) return found(5, 'Director (banking ladder)');
    if (has(/\b(vice president|vp)\b/) && !has(/\b(svp|evp|senior vice president|executive vice president)\b/))
      return found(4, 'VP (banking ladder)');
    if (has(/\bassociate\b/)) return found(2, 'Associate (banking ladder)');
    if (has(/\banalyst\b/) && !has(/\bsenior\b/)) return found(1, 'Analyst (banking ladder)');
  }
  if (has(/\b(svp|evp|senior vice president|executive vice president)\b/)) return found(9, 'SVP / EVP');
  if (has(/\b(vice president|vp)\b/)) return found(8, 'Vice President');
  if (has(/\b(senior director|sr\.? director|executive director|managing director|group director)\b/)) return found(7, 'Senior Director');
  if (has(/\bassociate director\b/)) return found(5, 'Associate Director');
  if (has(/\b(director|head of)\b/)) return found(6, has(/\bhead of\b/) ? 'Head of' : 'Director');
  if (has(/\bpartner\b/) && !has(/\b(business|talent|channel|hr|people|account)\s+partner\b|\bpartner (manager|success|marketing)\b/))
    return found(7, 'Partner');

  // Interns and academic ranks.
  if (has(/\b(intern|internship|trainee|apprentice|co-op|working student)\b/)) return found(0, 'Intern');
  if (family.id === 'academia') {
    if (has(/\bassistant professor\b/)) return found(2, 'Assistant Professor');
    if (has(/\bassociate professor\b/)) return found(3, 'Associate Professor');
    if (has(/\bprofessor\b/)) return found(4, 'Professor');
    if (has(/\bpost-?doc/)) return found(1, 'Postdoc');
  }

  const ladder = title.match(LADDER);
  if (ladder && ladderToLevel[ladder[1]] !== undefined) return found(ladderToLevel[ladder[1]], `Level ${ladder[0].trim().toUpperCase()}`);
  const sde = title.match(SDE_N);
  if (sde) return found(Number(sde[1]), `Level ${sde[0].trim().toUpperCase()}`);
  const roman = title.match(ROMAN);
  if (roman) return found(romanToLevel[roman[1].toUpperCase()], `Level ${roman[1].toUpperCase()}`);

  if (has(/\bdistinguished\b/)) return found(6, 'Distinguished');
  if (has(/\b(senior staff|sr\.? staff|senior principal|principal)\b/)) return found(5, 'Principal');
  if (has(/\bstaff\b/) && family.tech) return found(4, 'Staff');

  const isManagerTitle = has(/\bmanager\b/) && !family.managerIsIc;
  if (has(/\b(senior|sr\.?|group)\s+manager\b/) && !family.managerIsIc) return found(managerLevel + 1, 'Senior Manager');
  if (has(/\bgroup (product|program) manager\b/)) return found(5, 'Group Manager');
  if (isManagerTitle) return found(managerLevel, 'Manager');
  if (has(/\b(lead|team lead|tech lead)\b/) && !has(/\blead (generation|gen)\b/)) return found(managerLevel, 'Lead');
  if (has(/\b(senior|sr\.?|snr)\b/)) return found(3, 'Senior');
  if (has(/\b(junior|jr\.?|entry[- ]level|graduate|new grad|associate|apprentice|assistant professor)\b/)) return found(1, 'Junior / Associate');

  if (jobLevel) {
    const j = jobLevel.toLowerCase();
    const map: Array<[RegExp, number]> = [
      [/intern/, 0],
      [/entry/, 1],
      [/associate/, 2],
      [/mid-senior|mid senior/, 3],
      [/director/, 6],
      [/executive/, 8],
    ];
    for (const [re, code] of map) if (re.test(j)) return { level: L(code), source: 'job', evidence: `Job seniority: ${jobLevel}` };
  }

  if (years !== undefined) {
    const code = years < 2 ? 1 : years < 5 ? 2 : years < 8 ? 3 : 4;
    return { level: L(code), source: 'experience', evidence: `~${Math.round(years)} yrs experience` };
  }
  return { level: L(2), source: 'default' };
}

const normCompany = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|ag|bv|pvt|private|group|holdings|technologies|technology|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface CompanyMatch {
  tier: Tier;
  source: 'known' | 'keyword' | 'unknown' | 'none' | 'override';
}

export function matchCompany(company?: string, override?: string): CompanyMatch {
  if (override && override in TIERS) return { tier: TIERS[override as TierId], source: 'override' };
  if (!company) return { tier: TIERS.standard, source: 'none' };
  const n = normCompany(company);
  const exact = COMPANY_TIERS.get(n) ?? COMPANY_TIERS.get(n.replace(/ /g, ''));
  if (exact) return { tier: TIERS[exact], source: 'known' };
  // "Google Cloud", "Amazon Web Services (AWS)", "Meta Reality Labs" → parent company.
  const words = n.split(' ');
  for (let len = Math.min(3, words.length - 1); len >= 1; len--) {
    const prefix = COMPANY_TIERS.get(words.slice(0, len).join(' '));
    if (prefix && words.slice(0, len).join(' ').length >= 3) return { tier: TIERS[prefix], source: 'known' };
  }
  for (const { pattern, tier } of COMPANY_KEYWORDS) {
    if (pattern.test(company)) return { tier: TIERS[tier], source: 'keyword' };
  }
  return { tier: TIERS.standard, source: 'unknown' };
}

export interface MarketMatch {
  market: Market;
  source: 'metro' | 'country' | 'remote' | 'default' | 'override';
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word matching so "india" never matches "Indiana" and "uk" never matches "Ukraine".
const MARKET_MATCHERS = MARKETS.flatMap((market) =>
  market.keywords.map((kw) => ({
    market,
    kw,
    re: new RegExp(`${/^\p{L}/u.test(kw) ? '(?:^|[^\\p{L}])' : ''}${escapeRe(kw)}${/\p{L}$/u.test(kw) ? '(?:[^\\p{L}]|$)' : ''}`, 'u'),
  })),
);

export function matchMarket(location?: string, overrideId?: string): MarketMatch {
  if (overrideId) {
    const o = MARKETS.find((mk) => mk.id === overrideId);
    if (o) return { market: o, source: 'override' };
  }
  if (!location) return { market: US_NATIONAL, source: 'default' };
  const loc = location.toLowerCase().normalize('NFC');
  let best: { market: Market; score: number } | undefined;
  for (const { market, kw, re } of MARKET_MATCHERS) {
    if (!re.test(loc)) continue;
    // Prefer metros over countries, then the longest keyword.
    const score = kw.length + (market.metro ? 100 : 0);
    if (!best || score > best.score) best = { market, score };
  }
  if (best) return { market: best.market, source: best.market.metro ? 'metro' : 'country' };
  if (/\bremote\b/i.test(location)) return { market: MARKETS.find((mk) => mk.id === 'us-remote')!, source: 'remote' };
  return { market: US_NATIONAL, source: 'default' };
}

/** Parse "Jan 2016 - Present", "2019 – 2023" etc. into the earliest start year. */
export function yearsFromDateRanges(ranges: string[], now = new Date()): number | undefined {
  let earliest: number | undefined;
  for (const r of ranges) {
    const m = r.match(/(?:[A-Za-z]{3,9}\.?\s+)?((?:19|20)\d{2})\s*[-–—]/);
    if (!m) continue;
    const y = Number(m[1]);
    if (!earliest || y < earliest) earliest = y;
  }
  if (!earliest) return undefined;
  const years = now.getFullYear() - earliest;
  return years >= 0 && years < 60 ? years : undefined;
}

/** Split a LinkedIn headline like "Senior PM @ Stripe | ex-Google" into title and company. */
export function splitHeadline(headline: string): { title?: string; company?: string } {
  const first = headline.split(/\s[|•·]\s|\s\/\s/)[0];
  const m = first.match(/^(.*?)\s+(?:at|@|chez|bei|en)\s+(.+)$/i);
  if (m) return { title: m[1].trim(), company: m[2].replace(/^the\s+/i, '').trim() };
  return { title: first.trim() };
}
