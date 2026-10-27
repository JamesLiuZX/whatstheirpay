// LinkedIn integration. Detects profile and job pages, reads only what's on screen, and shows the
// estimate in an isolated (shadow DOM) chip and side panel. Nothing is sent until the user clicks,
// unless they're on Pro and turned on auto-reveal.
(() => {
  'use strict';
  if (window.__wtpLoaded) return;
  window.__wtpLoaded = true;

  // Bundled fallback. The server's /v1/extension/config is merged over this, so selectors can be
  // fixed without a Chrome Web Store release.
  const DEFAULT_SELECTORS = {
    profile: {
      name: ['main h1', 'h1.text-heading-xlarge', '.pv-text-details__left-panel h1'],
      headline: ['main section .text-body-medium.break-words', '.pv-text-details__left-panel .text-body-medium', 'main section div.text-body-medium'],
      location: ['main section span.text-body-small.inline.t-black--light.break-words', '.pv-text-details__left-panel span.text-body-small', 'main section span.text-body-small.inline'],
      anchor: ['main section h1', 'main h1'],
      experienceSection: ['section:has(> #experience)', 'section:has(#experience)', 'section[data-section="experience"]'],
      experienceItem: ['li.artdeco-list__item', 'li.pvs-list__paged-list-item', ':scope ul > li'],
      text: ['span[aria-hidden="true"]'],
    },
    job: {
      container: ['.jobs-search__job-details--container', '.job-view-layout', '.jobs-details', '.scaffold-layout__detail', 'main'],
      title: ['.job-details-jobs-unified-top-card__job-title h1', '.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '.top-card-layout__title', 'h1.t-24', 'main h1'],
      company: ['.job-details-jobs-unified-top-card__company-name a', '.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name', '.topcard__org-name-link'],
      meta: ['.job-details-jobs-unified-top-card__primary-description-container', '.job-details-jobs-unified-top-card__tertiary-description-container', '.jobs-unified-top-card__primary-description', '.topcard__flavor--bullet'],
      insights: ['.job-details-fit-level-preferences', '.job-details-preferences-and-skills', '.job-details-jobs-unified-top-card__job-insight', '.jobs-unified-top-card__job-insight', '.description__job-criteria-list', '.compensation__salary'],
      anchor: ['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '.top-card-layout__title', 'main h1'],
    },
  };

  let selectors = DEFAULT_SELECTORS;
  let prefs = { autoReveal: false, showOnJobs: true, plan: null, user: null, quota: null };
  let page = null; // { kind, key, url }
  let lookupId = null;
  let pendingPayload = null;
  const cache = new Map(); // page key → last estimate response (this tab only)

  // ---------- messaging ----------
  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (_) {
      return { ok: false, status: 0, body: { error: { code: 'extension_reloaded', message: 'WhatsTheirPay was updated. Refresh this page to keep using it.' } } };
    }
  }

  // ---------- DOM reading ----------
  const text = (el) => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  function q(list, root) {
    for (const s of list || []) {
      try {
        const el = (root || document).querySelector(s);
        if (el && text(el)) return el;
      } catch (_) {
        /* selector unsupported in this browser */
      }
    }
    return null;
  }
  function qa(list, root) {
    for (const s of list || []) {
      try {
        const els = [...(root || document).querySelectorAll(s)];
        if (els.length) return els;
      } catch (_) {}
    }
    return [];
  }
  const dedupe = (lines) => lines.filter((l, i) => l && l !== lines[i - 1]);
  // "Spotify · Full-time" → "Spotify", even if the separator glyph changes.
  const companyFrom = (line) =>
    (line || '')
      .split(/\s[·•|]\s/)[0]
      .replace(/\W+(full-time|part-time|contract|internship|self-employed|freelance|seasonal|apprenticeship)\s*$/i, '')
      .trim();

  function yearsFromRanges(ranges) {
    let earliest;
    for (const r of ranges) {
      const m = r.match(/((?:19|20)\d{2})\s*[-–—]/);
      if (m && (!earliest || Number(m[1]) < earliest)) earliest = Number(m[1]);
    }
    if (!earliest) return undefined;
    const years = new Date().getFullYear() - earliest;
    return years >= 0 && years < 60 ? years : undefined;
  }

  function splitHeadline(h) {
    const first = (h || '').split(/\s[|•·]\s|\s\/\s/)[0];
    const m = first.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
    return m ? { title: m[1].trim(), company: m[2].trim() } : { title: first.trim() || undefined };
  }

  function extractProfile() {
    const S = selectors.profile;
    const name = text(q(S.name)) || document.title.replace(/^\(\d+\)\s*/, '').split(/\s[|–-]\s/)[0].trim();
    const headline = text(q(S.headline));
    const location = text(q(S.location));
    let title;
    let company;
    let yearsExperience;
    const section = q(S.experienceSection);
    if (section) {
      const items = qa(S.experienceItem, section).filter((li) => !li.parentElement.closest('li'));
      const first = items[0];
      if (first) {
        const lines = dedupe(qa(S.text, first).map(text));
        const nested = first.querySelector('li');
        if (nested && lines.length >= 3) {
          // Several roles at one company: company first, then each role.
          company = companyFrom(lines[0]);
          title = dedupe(qa(S.text, nested).map(text))[0];
        } else {
          title = lines[0];
          company = companyFrom(lines[1]);
        }
      }
      yearsExperience = yearsFromRanges(qa(S.text, section).map(text).filter((t) => /(?:19|20)\d{2}\s*[-–—]/.test(t)));
    }
    if (!title && headline) {
      const h = splitHeadline(headline);
      title = h.title;
      company = company || h.company;
    }
    return { name, headline, title, company, location, yearsExperience };
  }

  const SALARY_RE = /(?:CA\$|C\$|A\$|AU\$|S\$|US\$|\$|£|€|₹)\s?[\d.,]+\s?[KkMm]?(?:\/(?:yr|hr|mo))?\s*[-–—]\s*(?:CA\$|C\$|A\$|AU\$|S\$|US\$|\$|£|€|₹)?\s?[\d.,]+\s?[KkMm]?(?:\/(?:yr|hr|mo))?/;

  function extractJob() {
    const S = selectors.job;
    const container = q(S.container) || document;
    const title = text(q(S.title, container)) || text(q(S.title));
    const company = text(q(S.company, container)) || text(q(S.company));
    const meta = S.meta.map((s) => text(safeQuery(container, s))).filter(Boolean).join(' · ');
    const segments = meta.split(/\s·\s/).map((x) => x.trim()).filter((x) => x && x !== company);
    const location = segments.find((x) => !/ago|applicant|promoted|reposted|clicked|responses?/i.test(x));
    const insights = S.insights.map((s) => qa([s], container).map(text).join(' · ')).join(' · ');
    const haystack = `${meta} · ${insights}`;
    const salary = haystack.match(SALARY_RE);
    const level = haystack.match(/\b(Internship|Entry level|Associate|Mid-Senior level|Director|Executive)\b/);
    return { title, company, location, postedSalary: salary ? salary[0] : undefined, jobLevel: level ? level[1] : undefined };
  }
  function safeQuery(root, s) {
    try {
      return root.querySelector(s);
    } catch (_) {
      return null;
    }
  }

  // ---------- page detection (LinkedIn is a single-page app) ----------
  function detectPage() {
    const { pathname, searchParams } = new URL(location.href);
    const profile = pathname.match(/^\/in\/([^/]+)\/?$/);
    if (profile) {
      const slug = decodeURIComponent(profile[1]).toLowerCase();
      return { kind: 'profile', key: `li:${slug}`, url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/` };
    }
    if (pathname.startsWith('/jobs')) {
      const view = pathname.match(/^\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/);
      const id = (view && view[1]) || searchParams.get('currentJobId');
      if (id && /^\d{6,}$/.test(id)) return { kind: 'job', key: `job:${id}`, url: `https://www.linkedin.com/jobs/view/${id}/` };
    }
    return null;
  }

  // ---------- UI: shadow-DOM panel ----------
  const PANEL_CSS = `
:host{all:initial}
.wtp-panel{position:fixed;top:64px;right:16px;width:404px;max-width:calc(100vw - 32px);max-height:calc(100vh - 80px);overflow:auto;z-index:2147483647;
  border-radius:22px;background:var(--wtp-surface);border:1px solid var(--wtp-line);box-shadow:var(--wtp-shadow);font-family:var(--wtp-font);color:var(--wtp-ink);
  overscroll-behavior:contain;animation:wtp-in .2s ease both}
.wtp-panel[hidden]{display:none}
.wtp-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:12px 12px 12px 18px;background:var(--wtp-surface);border-bottom:1px solid var(--wtp-line)}
.wtp-brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;letter-spacing:-.01em}
.wtp-brand svg{width:22px;height:22px}
.wtp-pill{margin-left:auto;font:500 11px/1 var(--wtp-mono);color:var(--wtp-ink-2);background:var(--wtp-surface-2);border:1px solid var(--wtp-line);border-radius:999px;padding:6px 8px;white-space:nowrap}
.wtp-close{width:32px;height:32px;border-radius:10px;border:0;background:transparent;color:var(--wtp-muted);font:400 22px/1 var(--wtp-font);cursor:pointer}
.wtp-close:hover{background:var(--wtp-surface-2);color:var(--wtp-ink)}
.wtp-mount .wtp-card{border:0;box-shadow:none;border-radius:0;padding:18px}
.wtp-fab{position:fixed;right:24px;bottom:24px;z-index:2147483646;display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:12px 16px 12px 12px;
  background:#0e7a53;color:#fff;font:600 14px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 30px -10px rgba(0,0,0,.45);cursor:pointer}
.wtp-fab[hidden]{display:none}
.wtp-fab svg{width:18px;height:18px}
.wtp-auth{display:grid;gap:12px}
.wtp-plans{display:grid;gap:8px}
.wtp-plan{display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;border:1px solid var(--wtp-line-2);background:var(--wtp-surface);color:var(--wtp-ink);border-radius:14px;padding:12px 14px}
.wtp-plan:hover{border-color:var(--wtp-brand)}
.wtp-plan b{display:block;font-size:14px}.wtp-plan small{color:var(--wtp-muted);font-size:12px}
.wtp-plan strong{font-size:18px;letter-spacing:-.01em}
.wtp-center{text-align:center;display:grid;gap:10px;justify-items:center}
`;
  const CHIP_CSS = `
:host{all:initial;display:inline-block;vertical-align:middle}
button{display:inline-flex;align-items:center;gap:6px;margin:6px 0 2px;border:0;border-radius:999px;padding:6px 12px 6px 8px;cursor:pointer;
  font:600 13px/1.2 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#0e7a53;color:#fff;box-shadow:0 0 0 3px rgba(14,122,83,.18);transition:transform .12s}
button:hover{transform:translateY(-1px)}
button.done{background:#0d1411}
button.muted{background:#6b7570}
svg{width:15px;height:15px;flex:none}
.spin{width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
`;
  const ICON_DOLLAR =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 5 7 7.5 9.5 10.6 12 11.2s5 1.4 5 4-2.2 3.8-5 3.8-5-.9-5-3"/></svg>';
  const LOGO =
    '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0D1411"/><rect x="5.5" y="14" width="21" height="4" rx="2" fill="#2B3832"/><rect x="9.5" y="14" width="12" height="4" rx="2" fill="#34D399"/><circle cx="16.5" cy="16" r="3.6" fill="#C8F169" stroke="#0D1411" stroke-width="2"/></svg>';

  const sheet = (css) => {
    const s = new CSSStyleSheet();
    s.replaceSync(css);
    return s;
  };

  const host = document.createElement('div');
  host.id = 'wtp-root-host';
  const shadow = host.attachShadow({ mode: 'closed' });
  WTPCard.adoptStyles(shadow);
  shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet(PANEL_CSS)];
  const ui = document.createElement('div');
  ui.className = 'wtp-root';
  ui.innerHTML = `
    <button class="wtp-fab" type="button" hidden>${ICON_DOLLAR}<span>Estimate pay</span></button>
    <aside class="wtp-panel" role="dialog" aria-label="WhatsTheirPay estimate" hidden>
      <div class="wtp-bar"><span class="wtp-brand">${LOGO}whatstheirpay</span><span class="wtp-pill" data-pill></span>
        <button class="wtp-close" type="button" aria-label="Close">×</button></div>
      <div class="wtp-mount"></div>
    </aside>`;
  shadow.appendChild(ui);
  document.documentElement.appendChild(host);

  const panel = ui.querySelector('.wtp-panel');
  const fab = ui.querySelector('.wtp-fab');
  const pill = ui.querySelector('[data-pill]');
  const card = WTPCard.create(ui.querySelector('.wtp-mount'), { context: 'extension', onSubmit, onAction });

  ui.querySelector('.wtp-close').addEventListener('click', closePanel);
  fab.addEventListener('click', () => openPanel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) closePanel();
  });

  function syncTheme() {
    // Follow LinkedIn's own theme by sampling the page background.
    const bg = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g) || [255, 255, 255];
    const lum = (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) / 255;
    // The card mount is its own .wtp-root, so it needs the attribute too.
    [ui, ...ui.querySelectorAll('.wtp-root')].forEach((el) => el.setAttribute('data-theme', lum < 0.4 ? 'dark' : 'light'));
  }

  function paintPill(q) {
    if (!q) return (pill.textContent = '');
    const period = q.period === 'day' ? 'today' : 'this month';
    pill.textContent = `${q.remaining.toLocaleString('en-US')} left ${period}`;
  }

  // ---------- UI: inline chip next to the name / job title ----------
  let chip = null;
  function createChip() {
    const el = document.createElement('span');
    el.setAttribute('data-wtp-chip', '');
    const root = el.attachShadow({ mode: 'closed' });
    root.adoptedStyleSheets = [sheet(CHIP_CSS)];
    root.innerHTML = `<button type="button" aria-haspopup="dialog">${ICON_DOLLAR}<span></span></button>`;
    const btn = root.querySelector('button');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });
    const api = {
      el,
      set(label, mode) {
        btn.className = mode || '';
        btn.innerHTML = `${mode === 'loading' ? '<span class="spin"></span>' : ICON_DOLLAR}<span></span>`;
        btn.querySelector('span:last-child').textContent = label;
        fab.querySelector('span').textContent = label;
      },
    };
    api.set(idleLabel());
    return api;
  }
  const idleLabel = () => (page && page.kind === 'job' ? 'Market pay for this job' : 'Estimate pay');

  let anchorTimer = null;
  function mountChip() {
    clearInterval(anchorTimer);
    chip = createChip();
    let tries = 0;
    const place = () => {
      const anchor = q(page && page.kind === 'job' ? selectors.job.anchor : selectors.profile.anchor);
      if (anchor) {
        if (!chip.el.isConnected) anchor.insertAdjacentElement('afterend', chip.el);
        fab.hidden = true;
        return true;
      }
      return false;
    };
    if (place()) return;
    anchorTimer = setInterval(() => {
      if (place() || ++tries > 16) {
        clearInterval(anchorTimer);
        // Couldn't find the name on the page: fall back to the floating button, which always works.
        if (!chip.el.isConnected) fab.hidden = false;
      }
    }, 300);
  }

  // LinkedIn re-renders the top card; put the chip back if it gets dropped.
  const observer = new MutationObserver(() => {
    if (!page || !chip || chip.el.isConnected || !fab.hidden) return;
    const anchor = q(page.kind === 'job' ? selectors.job.anchor : selectors.profile.anchor);
    if (anchor) anchor.insertAdjacentElement('afterend', chip.el);
  });

  // ---------- estimate flow ----------
  function openPanel() {
    if (!page) return;
    syncTheme();
    panel.hidden = false;
    const cached = cache.get(page.key);
    if (cached) return showResult(cached);
    run();
  }
  function closePanel() {
    panel.hidden = true;
  }

  function currentPayload(extra) {
    const data = page.kind === 'profile' ? extractProfile() : extractJob();
    const profile = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== '') profile[k] = v;
    return Object.assign({ url: page.url, profile }, extra || {});
  }

  async function run(payload, opts) {
    const silent = opts && opts.silent;
    const forKey = page.key;
    const body = payload || currentPayload();
    pendingPayload = body;
    if (!silent) card.loading();
    if (chip) chip.set('Estimating…', 'loading');
    const r = await send({ type: 'estimate', payload: body });
    if (!page || page.key !== forKey) return; // user navigated away meanwhile
    const data = r.body || {};
    paintPill(data.quota || (data.error && data.error.quota));
    if (r.ok && data.status === 'ok') {
      lookupId = data.lookupId;
      cache.set(forKey, data);
      const t = data.estimate.totalComp;
      if (chip) chip.set(`${WTPCard.money(t.p25, data.estimate.currency)} – ${WTPCard.money(t.p75, data.estimate.currency)}`, 'done');
      if (!silent) showResult(data, body.overrides);
      return;
    }
    if (chip) chip.set(idleLabel());
    if (silent) return;
    if (r.ok && data.status === 'needs_input') {
      return card.form({ mode: 'needs_input', profile: data.profile, message: "We couldn't read every detail on this page. Fill in what's missing:" });
    }
    const code = data.error && data.error.code;
    if (code === 'quota_exceeded') {
      if (chip) chip.set('Limit reached', 'muted');
      return card.wall(data);
    }
    if (code === 'opted_out') return card.error('This person has asked not to be estimated.');
    card.error((data.error && data.error.message) || 'Something went wrong.', () => run(body));
  }

  function showResult(data, overrides) {
    card.result(data, { overrides, ctaHtml: ctaFor((data.plan && data.plan.id) || 'guest') });
  }

  function ctaFor(planId) {
    if (planId === 'guest') return '<button type="button" class="wtp-btn wtp-btn-ghost wtp-btn-block" data-action="signup">Sign in for 30 free estimates a month</button>';
    if (planId === 'free') return '<button type="button" class="wtp-btn wtp-btn-ghost wtp-btn-block" data-action="upgrade">Go Pro: 1,000 a month and the negotiation brief</button>';
    return '';
  }

  function onSubmit(fields, meta) {
    const payload = { url: page.url, profile: fields, overrides: meta.overrides };
    if (meta.mode === 'edit' && lookupId) payload.lookupId = lookupId;
    run(payload);
  }

  function onAction(action) {
    if (action === 'signup') return showSignIn(() => (pendingPayload ? run(pendingPayload) : openPanel()));
    if (action === 'upgrade') return prefs.user ? showUpgrade() : showSignIn(showUpgrade);
  }

  // ---------- in-panel sign-in (no tab switch) ----------
  function showSignIn(then) {
    const root = card.custom(`
      <form class="wtp-form wtp-auth" data-step="email" novalidate>
        <div><div class="wtp-form-title">Create your free account</div><p class="wtp-form-sub">30 estimates a month, history, and your plan everywhere. We'll email a 6-digit code.</p></div>
        <label>Email<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
        <p class="wtp-error" data-error hidden></p>
        <button class="wtp-btn wtp-btn-primary wtp-btn-block" type="submit">Email me a code</button>
      </form>`);
    const form = root.querySelector('form');
    const err = (m) => {
      const e = form.querySelector('[data-error]');
      e.textContent = m || '';
      e.hidden = !m;
    };
    let email = '';
    form.querySelector('input').focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      if (form.dataset.step === 'email') {
        email = input.value.trim();
        const r = await send({ type: 'auth:start', email });
        if (!r.ok) return err(r.body && r.body.error ? r.body.error.message : 'Could not send the code.');
        err('');
        form.dataset.step = 'code';
        form.querySelector('.wtp-form-title').textContent = 'Check your email';
        form.querySelector('.wtp-form-sub').textContent = `Enter the 6-digit code sent to ${email}.${r.body.devCode ? ' (Development mode: filled in for you.)' : ''}`;
        form.querySelector('label').firstChild.textContent = 'Code';
        Object.assign(input, { type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', placeholder: '123456', value: r.body.devCode || '' });
        form.querySelector('button').textContent = 'Continue';
        input.focus();
        return;
      }
      const r = await send({ type: 'auth:verify', email, code: input.value.trim() });
      if (!r.ok) return err(r.body && r.body.error ? r.body.error.message : 'That code did not work.');
      prefs.user = r.body.user;
      prefs.plan = r.body.plan;
      paintPill(r.body.quota);
      if (then) then();
    });
  }

  function showUpgrade() {
    const root = card.custom(`
      <div class="wtp-form">
        <div><div class="wtp-form-title">Go Pro</div><p class="wtp-form-sub">1,000 estimates a month, the negotiation brief, the full p10–p90 range and auto-reveal.</p></div>
        <div class="wtp-plans">
          <button class="wtp-plan" type="button" data-interval="pass"><span><b>30-day pass</b><small>Pay once. Never renews.</small></span><strong>$15</strong></button>
          <button class="wtp-plan" type="button" data-interval="month"><span><b>Monthly</b><small>Cancel in one click.</small></span><strong>$12</strong></button>
          <button class="wtp-plan" type="button" data-interval="year"><span><b>Yearly</b><small>$8 a month, billed $96.</small></span><strong>$96</strong></button>
        </div>
        <p class="wtp-error" data-error hidden></p>
        <button class="wtp-btn wtp-btn-ghost wtp-btn-block" type="button" data-back>Not now</button>
      </div>`);
    root.querySelector('[data-back]').addEventListener('click', () => (cache.get(page.key) ? showResult(cache.get(page.key)) : run()));
    root.querySelectorAll('[data-interval]').forEach((b) =>
      b.addEventListener('click', async () => {
        const r = await send({ type: 'checkout', interval: b.dataset.interval });
        if (!r.ok) {
          const e = root.querySelector('[data-error]');
          e.textContent = r.body && r.body.error ? r.body.error.message : 'Could not start checkout.';
          e.hidden = false;
          return;
        }
        const wait = card.custom(`
          <div class="wtp-center">
            <div class="wtp-form-title">Finish checkout in the new tab</div>
            <p class="wtp-form-sub">Then come back here. Your plan updates instantly.</p>
            <button class="wtp-btn wtp-btn-primary wtp-btn-block" type="button" data-done>I've paid, refresh</button>
          </div>`);
        wait.querySelector('[data-done]').addEventListener('click', async () => {
          await refreshPrefs();
          cache.delete(page.key);
          run();
        });
      }),
    );
  }

  // ---------- routing ----------
  let lastHref = '';
  function onRoute() {
    const next = detectPage();
    if (next && page && next.key === page.key) return;
    clearInterval(anchorTimer);
    if (chip) chip.el.remove();
    chip = null;
    fab.hidden = true;
    lookupId = null;
    page = next;
    if (!page || (page.kind === 'job' && !prefs.showOnJobs)) {
      page = null;
      closePanel();
      return;
    }
    mountChip();
    if (!panel.hidden) {
      // Panel stays open while browsing; offer the new page instead of spending an estimate.
      const cached = cache.get(page.key);
      if (cached) showResult(cached);
      else
        card
          .custom(`<div class="wtp-center"><div class="wtp-form-title">New ${page.kind}</div><p class="wtp-form-sub">Estimate this one? It uses one estimate unless you've viewed it in the last 30 days.</p><button class="wtp-btn wtp-btn-primary wtp-btn-block" type="button" data-go>Estimate pay</button></div>`)
          .querySelector('[data-go]')
          .addEventListener('click', () => run());
    }
    const planAllows = prefs.plan && prefs.plan.features && prefs.plan.features.autoReveal;
    if (page.kind === 'profile' && prefs.autoReveal && planAllows && !cache.has(page.key)) {
      // Wait for the profile to render before reading it.
      setTimeout(() => page && page.kind === 'profile' && run(undefined, { silent: true }), 1200);
    }
  }

  // Cached plan/quota from storage. Deliberately no API call here: page loads must not spend the
  // burst limit; every estimate response refreshes plan and quota anyway.
  async function loadPrefs() {
    const s = await send({ type: 'settings:get' });
    if (s.ok) {
      prefs = Object.assign(prefs, s.body);
      paintPill(prefs.quota);
    }
  }

  async function refreshPrefs() {
    await loadPrefs();
    const me = await send({ type: 'me' });
    if (me.ok) {
      prefs.plan = me.body.plan;
      prefs.user = me.body.user;
      paintPill(me.body.quota);
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    for (const k of ['autoReveal', 'showOnJobs', 'plan', 'user']) if (changes[k]) prefs[k] = changes[k].newValue;
    if (changes.quota) paintPill(changes.quota.newValue);
  });

  (async function init() {
    const cfg = await send({ type: 'config' });
    if (cfg.ok && cfg.body && cfg.body.selectors) {
      selectors = {
        profile: Object.assign({}, DEFAULT_SELECTORS.profile, cfg.body.selectors.profile),
        job: Object.assign({}, DEFAULT_SELECTORS.job, cfg.body.selectors.job),
      };
    }
    await loadPrefs();
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', onRoute);
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        onRoute();
      }
    }, 700);
  })();
})();
