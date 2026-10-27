import type { DB } from '../db.ts';
import { config } from '../config.ts';
import { nameFromSlug } from './linkedin.ts';
import type { LinkedInRef } from './linkedin.ts';

export interface ResolvedProfile {
  name?: string;
  title?: string;
  company?: string;
  location?: string;
  yearsExperience?: number;
  headline?: string;
}

export interface Resolution {
  profile: ResolvedProfile;
  provider: 'cache' | 'pdl' | 'slug';
  /** Fields still needed before we can estimate. */
  complete: boolean;
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Resolve a pasted LinkedIn URL to profile fields: cache → licensed enrichment API (if configured)
 * → name from the URL slug, asking the user for the rest.
 */
export async function resolveLinkedIn(db: DB, ref: LinkedInRef, fetchImpl: typeof fetch = fetch): Promise<Resolution> {
  const cached = db
    .prepare('SELECT profile_json, provider FROM profile_cache WHERE subject_key = ? AND expires_at > ?')
    .get(ref.key, Date.now()) as { profile_json: string; provider: string } | undefined;
  if (cached) {
    const profile = JSON.parse(cached.profile_json) as ResolvedProfile;
    return { profile, provider: 'cache', complete: Boolean(profile.title) };
  }

  if (ref.kind === 'profile' && config.pdlApiKey) {
    const profile = await enrichWithPdl(ref.url, fetchImpl).catch((err) => {
      console.warn('[resolver] PDL lookup failed:', (err as Error).message);
      return null;
    });
    if (profile?.title) {
      db.prepare(
        'INSERT OR REPLACE INTO profile_cache (subject_key, profile_json, provider, expires_at) VALUES (?, ?, ?, ?)',
      ).run(ref.key, JSON.stringify(profile), 'pdl', Date.now() + CACHE_TTL_MS);
      return { profile, provider: 'pdl', complete: true };
    }
  }

  const name = ref.kind === 'profile' ? nameFromSlug(ref.slug) : undefined;
  return { profile: name ? { name } : {}, provider: 'slug', complete: false };
}

// People Data Labs Person Enrichment API: https://docs.peopledatalabs.com/docs/enrichment-api
async function enrichWithPdl(profileUrl: string, fetchImpl: typeof fetch): Promise<ResolvedProfile | null> {
  const url = new URL('https://api.peopledatalabs.com/v5/person/enrich');
  url.searchParams.set('profile', profileUrl);
  url.searchParams.set('min_likelihood', '6');
  const res = await fetchImpl(url, {
    headers: { 'X-Api-Key': config.pdlApiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`PDL HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, unknown> };
  const d = body.data ?? {};
  const s = (k: string) => (typeof d[k] === 'string' && d[k] ? (d[k] as string) : undefined);
  const titleCase = (v?: string) => v?.replace(/\b\w/g, (ch) => ch.toUpperCase());
  const years = typeof d.inferred_years_experience === 'number' ? d.inferred_years_experience : undefined;
  return {
    name: titleCase(s('full_name')),
    title: titleCase(s('job_title')),
    company: titleCase(s('job_company_name')),
    location: titleCase(s('location_name')),
    yearsExperience: years,
  };
}
