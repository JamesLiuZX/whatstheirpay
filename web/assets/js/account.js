(function () {
  'use strict';
  const { api, token, toast } = window.WTP;
  const $ = (s) => document.querySelector(s);
  const signIn = WTP.signInDialog();
  const params = new URLSearchParams(location.search);
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  if (params.get('checkout') === 'success') {
    $('#banner').textContent = "You're on Pro. It's already active in the extension: reopen its panel to see the new limits.";
    $('#banner').hidden = false;
  }

  $('#signin-btn').addEventListener('click', () => signIn.open({ done: render }));
  $('#signout').addEventListener('click', async () => {
    await api.post('/v1/auth/logout').catch(() => {});
    token.set(null);
    render();
  });
  document.querySelectorAll('#upgrade [data-interval]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        const { url } = await api.post('/v1/billing/checkout', { interval: b.dataset.interval });
        location.href = url;
      } catch (err) {
        toast(err.message);
      }
    }),
  );
  $('#dev-cancel').addEventListener('click', async () => {
    await api.post('/v1/billing/dev/cancel');
    toast('Plan canceled (test mode).');
    history.replaceState(null, '', '/account.html');
    render();
  });
  $('#export').addEventListener('click', () => api.download('/v1/history.csv', 'whatstheirpay-history.csv').catch((e) => toast(e.message)));

  async function render() {
    if (!token.get()) return showSignedOut();
    let me;
    try {
      me = await api.get('/v1/me');
    } catch (err) {
      return toast(err.message);
    }
    if (!me.user) return showSignedOut();
    $('#signed-out').hidden = true;
    $('#signed-in').hidden = false;

    const q = me.quota;
    $('#plan-name').textContent = me.plan.name;
    $('#email').textContent = me.user.email;
    $('#quota-text').textContent = `${q.used.toLocaleString('en-US')} of ${q.limit.toLocaleString('en-US')} estimates used this ${q.period}. Resets ${fmtDate(q.resetsAt)}.`;
    const meter = $('.meter');
    meter.setAttribute('aria-valuemax', String(q.limit));
    meter.setAttribute('aria-valuenow', String(q.used));
    $('#quota-bar').style.width = `${Math.min(100, (q.used / q.limit) * 100)}%`;

    const s = me.subscription || {};
    $('#sub-text').textContent = s.passExpiresAt
      ? `30-day pass active until ${fmtDate(s.passExpiresAt)}. It won't renew.`
      : s.renewsAt
        ? `Renews ${fmtDate(s.renewsAt)} (${s.interval}ly).`
        : s.endsAt
          ? `Canceled. Pro stays active until ${fmtDate(s.endsAt)}.`
          : 'No subscription.';

    const isPaid = me.plan.id === 'pro' || me.plan.id === 'team';
    $('#upgrade').hidden = isPaid;
    const actions = $('#plan-actions');
    actions.innerHTML = '';
    if (isPaid && (s.managedBy || s.status)) {
      const b = Object.assign(document.createElement('button'), { className: 'btn btn-ghost', type: 'button', textContent: 'Manage billing or cancel' });
      b.addEventListener('click', async () => {
        try {
          const { url } = await api.post('/v1/billing/portal');
          location.href = url;
        } catch (err) {
          toast(err.message);
        }
      });
      actions.appendChild(b);
    }
    $('#dev-portal').hidden = !(me.billingMode === 'dev' && isPaid && params.get('manage') === '1');
    $('#export').hidden = !me.plan.features.csvExport;

    const { items } = await api.get('/v1/history');
    const list = $('#history');
    list.innerHTML = '';
    $('#history-empty').hidden = items.length > 0;
    for (const it of items) {
      const li = document.createElement('li');
      const left = document.createElement('div');
      left.style.minWidth = '0';
      const label = document.createElement(it.url ? 'a' : 'div');
      label.className = 'h-label';
      label.textContent = it.label || 'Lookup';
      if (it.url) Object.assign(label, { href: it.url, target: '_blank', rel: 'noopener' });
      const meta = Object.assign(document.createElement('div'), { className: 'h-meta', textContent: `${it.profile?.location || 'No location'} · ${fmtDate(it.viewedAt)}` });
      left.append(label, meta);
      const val = Object.assign(document.createElement('div'), {
        className: 'h-val',
        textContent: it.summary ? `${WTPCard.money(it.summary.p25, it.summary.currency)} – ${WTPCard.money(it.summary.p75, it.summary.currency)}` : '',
      });
      li.append(left, val);
      list.appendChild(li);
    }
  }

  function showSignedOut() {
    $('#signed-in').hidden = true;
    $('#signed-out').hidden = false;
  }

  render();
})();
