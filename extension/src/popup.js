(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const send = (msg) => chrome.runtime.sendMessage(msg);
  const errMsg = (r, fallback) => (r && r.body && r.body.error && r.body.error.message) || fallback;
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  let state = (await send({ type: 'settings:get' })).body;
  let signInEmail = null;

  function showError(msg) {
    $('error').textContent = msg || '';
    $('error').hidden = !msg;
  }

  function paint(me) {
    const plan = (me && me.plan) || state.plan || { id: 'guest', name: 'Guest', features: {} };
    const user = (me && me.user) || state.user;
    const q = (me && me.quota) || state.quota;
    $('plan').textContent = plan.name;
    $('who').textContent = user ? user.email : 'Browsing as a guest';
    $('signout').hidden = !user;
    $('signin').hidden = Boolean(user);
    $('upgrade').hidden = plan.id === 'pro' || plan.id === 'team';
    if (q) {
      const period = q.period === 'day' ? 'today' : 'this month';
      $('quota-text').textContent = `${q.remaining.toLocaleString('en-US')} of ${q.limit.toLocaleString('en-US')} left ${period}`;
      $('quota-reset').textContent = q.period === 'month' ? `resets ${fmtDate(q.resetsAt)}` : '';
      $('quota-bar').style.width = `${Math.max(0, Math.min(100, (q.remaining / q.limit) * 100))}%`;
    }
    const canAuto = Boolean(plan.features && plan.features.autoReveal);
    $('autoReveal').disabled = !canAuto;
    $('autoReveal').checked = canAuto && Boolean(state.autoReveal);
    $('showOnJobs').checked = state.showOnJobs !== false;
    $('apiBase').value = state.apiBase;
  }

  async function loadRecent() {
    const r = await send({ type: 'history' });
    const items = (r.ok && r.body.items) || [];
    $('recent-block').hidden = !items.length;
    $('recent').replaceChildren(
      ...items.slice(0, 5).map((it) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = it.label || 'Lookup';
        if (it.url) Object.assign(a, { href: it.url, target: '_blank', rel: 'noopener' });
        const v = document.createElement('span');
        v.textContent = it.summary ? `${WTPCard.money(it.summary.p25, it.summary.currency)} – ${WTPCard.money(it.summary.p75, it.summary.currency)}` : '';
        li.append(a, v);
        return li;
      }),
    );
  }

  async function refresh() {
    paint(null);
    const me = await send({ type: 'me' });
    if (!me.ok) return showError(errMsg(me, 'Could not load your plan.'));
    showError('');
    state = (await send({ type: 'settings:get' })).body;
    paint(me.body);
    if (me.body.user) loadRecent();
    else $('recent-block').hidden = true;
  }

  $('signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('signin-input');
    const btn = $('signin-btn');
    btn.disabled = true;
    try {
      if (!signInEmail) {
        const email = input.value.trim();
        const r = await send({ type: 'auth:start', email });
        if (!r.ok) return showError(errMsg(r, 'Could not send the code.'));
        showError('');
        signInEmail = email;
        $('signin-title').textContent = 'Check your email';
        $('signin-sub').textContent = `Enter the code sent to ${email}.${r.body.devCode ? ' (Development mode: filled in.)' : ''}`;
        Object.assign(input, { type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', placeholder: '123456', value: r.body.devCode || '' });
        btn.textContent = 'Continue';
        input.focus();
        return;
      }
      const r = await send({ type: 'auth:verify', email: signInEmail, code: input.value.trim() });
      if (!r.ok) return showError(errMsg(r, 'That code did not work.'));
      signInEmail = null;
      Object.assign(input, { type: 'email', value: '', placeholder: 'you@example.com' });
      btn.textContent = 'Email me a code';
      await refresh();
    } finally {
      btn.disabled = false;
    }
  });

  $('signout').addEventListener('click', async () => {
    await send({ type: 'auth:logout' });
    state = (await send({ type: 'settings:get' })).body;
    refresh();
  });
  $('upgrade').addEventListener('click', () => send({ type: 'open', path: '/#pricing' }));
  $('account').addEventListener('click', () => send({ type: 'open', path: '/account.html' }));
  $('autoReveal').addEventListener('change', (e) => send({ type: 'settings:set', values: { autoReveal: e.target.checked } }));
  $('showOnJobs').addEventListener('change', (e) => send({ type: 'settings:set', values: { showOnJobs: e.target.checked } }));
  $('saveApi').addEventListener('click', async () => {
    const value = $('apiBase').value.trim().replace(/\/$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(value)) return showError('Enter a full URL, like http://localhost:8787');
    await send({ type: 'settings:set', values: { apiBase: value } });
    state = (await send({ type: 'settings:get' })).body;
    refresh();
  });

  refresh();
})();
