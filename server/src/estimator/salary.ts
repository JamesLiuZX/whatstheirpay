import type { PostedRange } from './index.ts';

const SYMBOLS: Array<[string, string]> = [
  ['CA$', 'CAD'], ['C$', 'CAD'], ['AU$', 'AUD'], ['A$', 'AUD'], ['S$', 'SGD'], ['US$', 'USD'], ['NZ$', 'NZD'], ['HK$', 'HKD'],
  ['$', 'USD'], ['£', 'GBP'], ['€', 'EUR'], ['₹', 'INR'], ['¥', 'JPY'], ['CHF', 'CHF'], ['R$', 'BRL'],
];
const sym = SYMBOLS.map(([s]) => s.replace(/\$/g, '\\$')).join('|');
const amount = `(${sym})\\s?([\\d][\\d.,]*)\\s?([kKmML])?`;
const period = `(?:\\s?(?:\\/|per |a |an )\\s?(yr|year|hr|hour|mo|month))?`;
const RANGE = new RegExp(`${amount}${period}\\s*(?:-|–|—|to)\\s*(?:${sym})?\\s?([\\d][\\d.,]*)\\s?([kKmML])?${period}`, 'i');

const scale = (n: string, unit?: string) => {
  const v = Number(n.replace(/,/g, ''));
  if (!unit) return v;
  return v * ({ k: 1e3, m: 1e6, l: 1e5 }[unit.toLowerCase()] ?? 1);
};

/** "$150K/yr - $190K/yr", "$60/hr - $75/hr", "£50,000 - £60,000 a year" → PostedRange */
export function parsePostedSalary(text?: string): PostedRange | undefined {
  if (!text) return undefined;
  const m = text.match(RANGE);
  if (!m) return undefined;
  const [, symbol, a, ua, p1, b, ub, p2] = m;
  const currency = SYMBOLS.find(([s]) => s.toLowerCase() === symbol.toLowerCase())?.[1] ?? 'USD';
  const min = scale(a, ua);
  const max = scale(b, ub ?? ua);
  if (!(min > 0 && max >= min)) return undefined;
  const per = (p1 ?? p2 ?? '').toLowerCase();
  const periodOut: PostedRange['period'] = per.startsWith('h') ? 'hour' : per.startsWith('mo') ? 'month' : per ? 'year' : max < 500 ? 'hour' : 'year';
  return { min, max, currency, period: periodOut };
}
