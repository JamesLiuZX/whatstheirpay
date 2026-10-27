// Landing page controller: paste-a-URL free try, examples, pricing, sign-in and upgrade.
(function () {
  'use strict';
  const { api, token, toast } = window.WTP;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  // Set once the Chrome Web Store listing is live; until then "Add to Chrome" explains load-unpacked.
  const CHROME_STORE_URL = '';

  // Hero illustration: a real engine response for a fictional person, so the first card
  // visitors see is exactly what a lookup returns (with Pro sections shown as a preview).
  const SAMPLE = {"status":"ok","example":true,"profile":{"kind":"manual","name":"Alex Rivera","title":"Senior Product Designer","company":"Figma","location":"San Francisco Bay Area","yearsExperience":8},"estimate":{"currency":"USD","totalComp":{"p25":289000,"p50":319000,"p75":353000,"p10":264000,"p90":389000},"base":{"p25":182000,"p50":196000,"p75":212000},"variable":{"p25":22800,"p50":25900,"p75":29500,"kind":"bonus","label":"Bonus","targetPct":0.132},"equity":{"p25":82600,"p50":97000,"p75":113000,"label":"Stock (RSUs)","note":null},"usd":null,"confidence":{"score":95,"label":"High"},"normalized":{"roleFamily":{"id":"design","label":"Product Design & UX"},"level":{"code":3,"id":"senior","label":"Senior"},"company":{"name":"Figma","tier":"big_tech","tierLabel":"Big Tech"},"market":{"id":"us-sf","label":"San Francisco Bay Area","country":"US","currency":"USD"}},"factors":[{"key":"role","label":"Role","value":"Product Design & UX","detail":"US benchmark: $112k base for a mid-level product designer.","multiplier":null,"strength":"strong"},{"key":"level","label":"Level","value":"Senior","detail":"Senior.","multiplier":1.25,"strength":"strong"},{"key":"company","label":"Company","value":"Figma · Big Tech","detail":"Big Tech: base ×1.12, bonus ×1.4, stock (rsus) ≈ 50% of base.","multiplier":1.12,"strength":"strong"},{"key":"market","label":"Market","value":"San Francisco Bay Area","detail":"×1.22 vs. US national.","multiplier":1.22,"strength":"strong"},{"key":"experience","label":"Experience","value":"8 yrs","detail":"+2.4% vs. typical 6 yrs at this level.","multiplier":1.024,"strength":"strong"}],"improve":[],"negotiation":{"openingAsk":362000,"target":333000,"walkAway":307000,"baseAsk":212000,"talkTrack":"Based on market data for senior product designers at big tech companies in San Francisco Bay Area, I'm targeting total compensation of around $333K."},"posted":null,"locked":[],"methodology":{"version":"2026.10","fxAsOf":"2026-10"},"disclaimer":"A market estimate for this role, not this person's actual pay."}};

  const LINKEDIN_RE = /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/(in|pub)\/[^/?#\s]{2,}|^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/jobs\/(view\/|[^?\s]*\?(.*&)?currentJobId=\d)/i;

  const state = { url: null, lookupId: null, me: null, plans: null, interval: 'month' };
  const signIn = WTP.signInDialog();

  // ---------- Card ----------
  WTPCard.adoptStyles(document);
  const cardEl = $('#hero-card');
  const card = WTPCard.create(cardEl, { context: 'web', onSubmit, onAction });
  const installCta = '<button type="button" class="wtp-btn wtp-btn-primary wtp-btn-block" data-action="install">Get this on every LinkedIn profile</button>';
  card.result(SAMPLE, { ctaHtml: installCta });

  const isStacked = () => matchMedia('(max-width: 980px)').matches;
  const revealCard = () => {
    if (isStacked()) cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function lookup(payload) {
    state.lastPayload = payload;
    state.blocked = false;
    card.loading();
    revealCard();
    $('#stage-caption').textContent = 'Live result';
    try {
      const resp = await api.post('/v1/estimate', Object.assign({ source: 'web' }, payload));
      if (resp.status === 'needs_input') {
        card.form({ mode: 'needs_input', profile: resp.profile, message: resp.message });
        paintMock(resp.profile, null);
        return;
      }
      state.lookupId = resp.lookupId;
      card.result(resp, { overrides: payload.overrides, ctaHtml: installCta });
      paintMock(resp.profile, resp.estimate);
      paintQuota(resp.quota);
    } catch (err) {
      handleError(err, () => lookup(payload));
    }
  }

  function onSubmit(fields, meta) {
    const payload = { profile: fields, overrides: meta.overrides };
    if (state.url) payload.url = state.url;
    if (meta.mode === 'edit' && state.lookupId) payload.lookupId = state.lookupId;
    lookup(payload);
  }

  function onAction(action) {
    if (action === 'install') return install();
    if (action === 'signup') {
      return signIn.open({
        title: 'Create your free account',
        sub: '30 estimates a month, free. We will email you a 6-digit code.',
        done: afterSignIn,
      });
    }
    if (action === 'upgrade') {
      $('#pricing').scrollIntoView({ behavior: 'smooth' });
    }
  }

  function handleError(err, retry) {
    const code = err.code;
    if (code === 'quota_exceeded') {
      state.blocked = true;
      card.wall(err.body);
      if (err.body.error.quota) paintQuota(err.body.error.quota);
      return;
    }
    if (code === 'invalid_url') {
      showUrlError(err.message);
      if (card.current) card.result(card.current, { ctaHtml: installCta });
      else card.result(SAMPLE, { ctaHtml: installCta });
      return;
    }
    if (code === 'opted_out') return card.error('This person has asked us not to estimate their profile.');
    if (code === 'rate_limited') toast(err.message);
    card.error(err.message, retry);
  }

  // ---------- Try form ----------
  const field = $('#try-field');
  const input = $('#try-url');
  const errorEl = $('#try-error');
  function showUrlError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
    field.classList.toggle('invalid', Boolean(msg));
  }
  input.addEventListener('input', () => {
    const v = input.value.trim();
    field.classList.toggle('valid', LINKEDIN_RE.test(v));
    if (!errorEl.hidden) showUrlError('');
  });
  input.addEventListener('paste', () => setTimeout(() => LINKEDIN_RE.test(input.value.trim()) && $('#try-form').requestSubmit(), 0));
  $('#try-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return showUrlError('Paste a LinkedIn profile URL, like linkedin.com/in/jane-doe.');
    if (!LINKEDIN_RE.test(v)) return showUrlError("That doesn't look like a LinkedIn profile or job URL.");
    showUrlError('');
    state.url = v;
    state.lookupId = null;
    clearExamplePressed();
    lookup({ url: v });
  });
  $('#describe-btn').addEventListener('click', () => {
    state.url = null;
    state.lookupId = null;
    clearExamplePressed();
    card.form({ mode: 'describe' });
    paintMock({ title: 'Describe a role' }, null);
    revealCard();
  });

  // ---------- Examples (free, never count) ----------
  const examplesEl = $('#examples');
  function clearExamplePressed() {
    $$('.chip', examplesEl).forEach((c) => c.setAttribute('aria-pressed', 'false'));
  }
  api
    .get('/v1/examples')
    .then(({ examples }) => {
      examples.forEach((ex) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = ex.label;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          clearExamplePressed();
          b.setAttribute('aria-pressed', 'true');
          state.url = null;
          state.lookupId = null;
          lookup({ example: ex.id });
        });
        examplesEl.appendChild(b);
      });
      examplesEl.hidden = false;
    })
    .catch(() => {});

  // ---------- Browser mock mirrors the lookup ----------
  function paintMock(profile, estimate) {
    const p = profile || {};
    const who = p.name || p.title || 'This role';
    $('#mock-name').textContent = who;
    $('#mock-avatar').textContent = who
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => (w[0] || '').toUpperCase())
      .join('');
    $('#mock-headline').textContent = [p.name ? p.title : null, p.company ? `at ${p.company}` : null].filter(Boolean).join(' ') || 'Add title, company and city';
    $('#mock-loc').textContent = p.location || 'Location not set';
    $('#mock-url').textContent = state.url ? state.url.replace(/^https?:\/\/(www\.)?/, '') : 'linkedin.com/in/…';
    $('#mock-chip').textContent = estimate
      ? `${WTPCard.money(estimate.totalComp.p25, estimate.currency)} – ${WTPCard.money(estimate.totalComp.p75, estimate.currency)}`
      : 'Estimate pay';
  }

  function paintQuota(q) {
    if (!q) return;
    const period = q.period === 'day' ? 'today' : 'this month';
    $('[data-quota-text]').textContent = `${q.remaining} of ${q.limit} free estimates left ${period}`;
  }

  // ---------- Session ----------
  async function refreshMe() {
    try {
      state.me = await api.get('/v1/me');
      const signedIn = Boolean(state.me.user);
      $$('[data-account-link]').forEach((a) => (a.textContent = signedIn ? 'Account' : 'Sign in'));
      if (state.me.quota.used > 0 || signedIn) paintQuota(state.me.quota);
      if (state.plans) renderPlans();
    } catch (_) {}
  }
  function afterSignIn() {
    refreshMe();
    // Resume the lookup that hit the guest limit, now on the free plan's quota.
    if (state.blocked && state.lastPayload) lookup(state.lastPayload);
  }

  // ---------- Pricing ----------
  const check = '<svg aria-hidden="true"><use href="#i-check"/></svg>';
  function renderPlans() {
    const byId = Object.fromEntries(state.plans.plans.map((p) => [p.id, p]));
    const current = state.me && state.me.plan ? state.me.plan.id : 'guest';
    const pro = byId.pro;
    const proPrice = pro.prices[state.interval];
    const team = byId.team;
    const planCard = (plan, price, note, cta, featured) => `
      <article class="plan${featured ? ' featured' : ''}">
        ${featured ? '<span class="ribbon">Most popular</span>' : ''}
        <div><div class="plan-name">${plan.name}</div><div class="plan-tagline">${plan.tagline}</div></div>
        <div><div class="price"><strong>${price}</strong></div><div class="price-note">${note}</div></div>
        <ul>${plan.highlights.map((h) => `<li>${check}<span>${h}</span></li>`).join('')}</ul>
        ${cta}
      </article>`;
    const freeCta =
      current === 'guest'
        ? '<button class="btn btn-ghost btn-block" type="button" data-plan="free">Create free account</button>'
        : `<button class="btn btn-ghost btn-block" type="button" disabled>${current === 'free' ? 'Your current plan' : 'Included'}</button>`;
    const proLabel = state.interval === 'pass' ? 'Get the 30-day pass' : current === 'pro' ? 'Manage plan' : 'Get Pro';
    const proCta = `<button class="btn btn-primary btn-block btn-lg" type="button" data-plan="pro">${proLabel}</button>`;
    const teamCta = '<a class="btn btn-ghost btn-block" href="mailto:hello@whatstheirpay.com?subject=WhatsTheirPay%20Team">Talk to us</a>';
    $('#plans').innerHTML =
      planCard(byId.free, '$0', 'Forever. No card needed.', freeCta) +
      planCard(pro, proPrice.label, proPrice.note, proCta, true) +
      planCard(team, team.prices.month.label, team.prices.month.note, teamCta);
    $$('[data-plan]', $('#plans')).forEach((b) =>
      b.addEventListener('click', () => (b.dataset.plan === 'free' ? onAction('signup') : startCheckout(state.interval))),
    );
    renderLimits(byId);
  }

  function renderLimits(byId) {
    const rows = ['guest', 'free', 'pro', 'team'].map((id) => byId[id]);
    const yes = '<span class="yes"><svg><use href="#i-check"/></svg>Yes</span>';
    const no = '<span class="no">—</span>';
    $('#limits-table').innerHTML = `
      <thead><tr><th>Plan</th><th>Estimates</th><th>Requests / min</th><th>History</th><th>Negotiation brief</th><th>Full p10–p90 range</th></tr></thead>
      <tbody>${rows
        .map(
          (p) => `<tr><td>${p.name}</td><td>${p.quota.limit.toLocaleString('en-US')} / ${p.quota.period}</td><td>${p.burstPerMinute}</td>
          <td>${p.features.historyLimit ? `${p.features.historyLimit.toLocaleString('en-US')} lookups` : 'None'}</td>
          <td>${p.features.negotiationBrief ? yes : no}</td><td>${p.features.fullPercentiles ? yes : no}</td></tr>`,
        )
        .join('')}</tbody>`;
  }

  $$('.billing-toggle button').forEach((b) =>
    b.addEventListener('click', () => {
      state.interval = b.dataset.interval;
      $$('.billing-toggle button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (state.plans) renderPlans();
    }),
  );

  async function startCheckout(interval) {
    if (!token.get()) {
      return signIn.open({
        title: 'Create your account',
        sub: 'Sign in first so your plan follows you to the extension. We will email you a code.',
        done: () => startCheckout(interval),
      });
    }
    if (state.me && state.me.plan.id === 'pro' && interval !== 'pass') {
      location.href = '/account.html';
      return;
    }
    try {
      const { url } = await api.post('/v1/billing/checkout', { interval });
      location.href = url;
    } catch (err) {
      if (err.code === 'already_subscribed') location.href = '/account.html';
      else toast(err.message);
    }
  }

  api
    .get('/v1/plans')
    .then((plans) => {
      state.plans = plans;
      renderPlans();
    })
    .catch(() => ($('#plans').innerHTML = '<p class="muted">Pricing is unavailable right now. Please refresh.</p>'));

  // ---------- Install, opt-out, dialogs, nav ----------
  function install() {
    if (CHROME_STORE_URL) window.open(CHROME_STORE_URL, '_blank', 'noopener');
    else $('#dlg-install').showModal();
  }
  $$('[data-action="install"]').forEach((b) => b.addEventListener('click', install));
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => e.target === d && d.close()));

  const optout = $('#dlg-optout');
  $$('[data-open="optout"]').forEach((b) =>
    b.addEventListener('click', () => {
      $('#optout-form').hidden = false;
      $('#optout-done').hidden = true;
      optout.showModal();
    }),
  );
  $('#optout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const err = $('[data-error]', form);
    try {
      await api.post('/v1/privacy/opt-out', { url: String(new FormData(form).get('url') || '') });
      form.hidden = true;
      $('#optout-done').hidden = false;
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  $$('[data-scroll-try]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => input.focus({ preventScroll: true }), 350);
    }),
  );
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (new URLSearchParams(location.search).get('installed') === '1') {
    toast('Installed. Open any LinkedIn profile and click the pay chip next to the name.', 6000);
  }

  refreshMe();
})();
