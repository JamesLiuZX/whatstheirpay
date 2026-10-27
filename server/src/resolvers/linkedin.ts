// Parse and normalize LinkedIn URLs. We never fetch LinkedIn from the server: profile details
// come from the page the user is viewing (extension), a licensed data provider, or the user.

export type LinkedInRef =
  | { kind: 'profile'; slug: string; key: string; url: string }
  | { kind: 'job'; jobId: string; key: string; url: string };

export function parseLinkedInUrl(raw: string): LinkedInRef | null {
  if (!raw) return null;
  let input = raw.trim();
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;

  const path = url.pathname.replace(/\/+$/, '');
  const profile = path.match(/^\/(?:in|pub)\/([^/]+)/i);
  if (profile) {
    let slug: string;
    try {
      slug = decodeURIComponent(profile[1]).toLowerCase();
    } catch {
      slug = profile[1].toLowerCase();
    }
    if (!/^[\p{L}\p{N}._-]{2,100}$/u.test(slug)) return null;
    return { kind: 'profile', slug, key: `li:${slug}`, url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/` };
  }

  const jobView = path.match(/^\/jobs\/view\/(?:[^/]*?-)?(\d{6,})$/i);
  const jobId = jobView?.[1] ?? url.searchParams.get('currentJobId') ?? undefined;
  if (jobId && /^\d{6,}$/.test(jobId) && path.startsWith('/jobs')) {
    return { kind: 'job', jobId, key: `job:${jobId}`, url: `https://www.linkedin.com/jobs/view/${jobId}/` };
  }
  return null;
}

/** "jane-doe-4a5b12" → "Jane Doe". Returns undefined when the slug doesn't look like a name. */
export function nameFromSlug(slug: string): string | undefined {
  const parts = slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .filter((p) => !/\d/.test(p) && !/^[a-f0-9]{6,}$/.test(p));
  if (parts.length < 2 || parts.length > 5) return undefined;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
