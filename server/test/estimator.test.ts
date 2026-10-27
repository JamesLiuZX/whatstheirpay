import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../src/estimator/index.ts';
import { matchLevel, matchMarket, matchRole } from '../src/estimator/normalize.ts';
import { parsePostedSalary } from '../src/estimator/salary.ts';
import { nameFromSlug, parseLinkedInUrl } from '../src/resolvers/linkedin.ts';

const full = { fullPercentiles: true, negotiationBrief: true };
const free = { fullPercentiles: false, negotiationBrief: false };

test('pay rises with level and with employer tier', () => {
  const at = (title: string, company?: string) => estimate({ title, company, location: 'Seattle, WA' }, full).totalComp.p50;
  const ladder = ['Junior Software Engineer', 'Software Engineer', 'Senior Software Engineer', 'Staff Software Engineer', 'Principal Software Engineer'];
  const values = ladder.map((t) => at(t, 'Microsoft'));
  for (let i = 1; i < values.length; i++) assert.ok(values[i] > values[i - 1], `${ladder[i]} should out-earn ${ladder[i - 1]}`);
  assert.ok(at('Senior Software Engineer', 'Microsoft') > at('Senior Software Engineer', 'Acme Widgets'));
});

test('calibration: senior engineer at Big Tech in SF lands in a realistic band', () => {
  const r = estimate({ title: 'Senior Software Engineer', company: 'Google', location: 'San Francisco Bay Area', yearsExperience: 7 }, full);
  assert.equal(r.currency, 'USD');
  assert.ok(r.totalComp.p50 > 300_000 && r.totalComp.p50 < 450_000, `got ${r.totalComp.p50}`);
  assert.ok(r.equity.p50 > 0 && r.variable.p50 > 0);
  assert.equal(r.confidence.label, 'High');
  assert.ok(r.totalComp.p10! < r.totalComp.p25 && r.totalComp.p25 < r.totalComp.p50 && r.totalComp.p50 < r.totalComp.p75 && r.totalComp.p75 < r.totalComp.p90!);
});

test('local currency, and IT services pay below global employers in emerging markets', () => {
  const infosys = estimate({ title: 'Software Engineer', company: 'Infosys', location: 'Bengaluru, Karnataka, India' }, full);
  const google = estimate({ title: 'Software Engineer', company: 'Google', location: 'Bengaluru, Karnataka, India' }, full);
  assert.equal(infosys.currency, 'INR');
  assert.ok(infosys.usd);
  assert.ok(google.totalComp.p50 > infosys.totalComp.p50 * 2.5);
});

test('sparse input still answers, with low confidence and a wider range', () => {
  const sparse = estimate({ title: 'Marketing Manager' }, full);
  const rich = estimate({ title: 'Marketing Manager', company: 'Nike', location: 'Portland, Oregon', yearsExperience: 6 }, full);
  assert.equal(sparse.confidence.label, 'Low');
  const width = (e: typeof sparse) => (e.totalComp.p75 - e.totalComp.p25) / e.totalComp.p50;
  assert.ok(width(sparse) > width(rich));
  assert.ok(sparse.improve.some((i) => i.field === 'location'));
});

test('paid sections are withheld server-side for free plans', () => {
  const r = estimate({ title: 'Product Manager', company: 'Stripe' }, free);
  assert.equal(r.negotiation, null);
  assert.equal(r.totalComp.p10, null);
  assert.deepEqual(r.locked.sort(), ['negotiation', 'percentiles']);
});

test('title parsing handles tricky cases', () => {
  assert.equal(matchRole('Head of Product Design').family.id, 'design');
  assert.equal(matchRole('Director of Product Marketing').family.id, 'pmm');
  assert.equal(matchRole('Co-founder & CTO').family.id, 'founder');
  assert.equal(matchRole('Vice President, Equities').family.id === 'founder', false);
  const swe = matchRole('Software Engineer').family;
  assert.equal(matchLevel('Software Engineer L5', swe).level.id, 'senior');
  assert.equal(matchLevel('SDE 2', swe).level.id, 'mid');
  assert.equal(matchLevel('Software Engineer', swe, { years: 9 }).source, 'experience');
});

test('location matching uses whole words', () => {
  assert.equal(matchMarket('Indianapolis, Indiana, United States').market.country, 'US');
  assert.equal(matchMarket('Kyiv, Ukraine').market.country, 'UA');
  assert.equal(matchMarket('Greater Seattle Area').market.id, 'us-sea');
});

test('posted salary ranges parse and compare against market', () => {
  assert.deepEqual(parsePostedSalary('$150K/yr - $190K/yr'), { min: 150_000, max: 190_000, currency: 'USD', period: 'year' });
  assert.deepEqual(parsePostedSalary('$60/hr - $75/hr'), { min: 60, max: 75, currency: 'USD', period: 'hour' });
  assert.equal(parsePostedSalary('£50,000 - £60,000 a year')?.currency, 'GBP');
  const r = estimate({ title: 'Senior Software Engineer', company: 'Acme', location: 'Austin, TX', postedRange: parsePostedSalary('$90K/yr - $110K/yr') }, full);
  assert.equal(r.posted?.verdict, 'below');
});

test('LinkedIn URLs: profiles, jobs, junk', () => {
  assert.deepEqual(parseLinkedInUrl('linkedin.com/in/Jane-Doe-4a5b12/?trk=x'), {
    kind: 'profile', slug: 'jane-doe-4a5b12', key: 'li:jane-doe-4a5b12', url: 'https://www.linkedin.com/in/jane-doe-4a5b12/',
  });
  assert.equal(parseLinkedInUrl('https://www.linkedin.com/jobs/view/senior-engineer-at-acme-4012345678/')?.key, 'job:4012345678');
  assert.equal(parseLinkedInUrl('https://www.linkedin.com/jobs/search/?currentJobId=4012345678')?.key, 'job:4012345678');
  assert.equal(parseLinkedInUrl('https://evil.com/in/jane'), null);
  assert.equal(parseLinkedInUrl('https://linkedin.com.evil.com/in/jane'), null);
  assert.equal(nameFromSlug('jane-doe-4a5b12'), 'Jane Doe');
  assert.equal(nameFromSlug('jdoe'), undefined);
});
