(async function () {
  'use strict';
  const { api } = window.WTP;
  const $ = (s) => document.querySelector(s);
  const id = new URLSearchParams(location.search).get('session') || '';
  const fail = (msg) => {
    $('#error').textContent = msg;
    $('#error').hidden = false;
    $('#pay').disabled = true;
  };
  const names = { month: 'Pro · Monthly', year: 'Pro · Yearly', pass: 'Pro · 30-day pass' };

  try {
    const s = await api.get(`/v1/billing/dev/session/${encodeURIComponent(id)}`);
    $('#item').textContent = names[s.interval] || 'Pro';
    $('#item-note').textContent = s.price ? s.price.note : '';
    $('#price').textContent = s.price ? `$${s.price.amount}` : '';
    if (s.status !== 'open') fail('This checkout was already completed.');
  } catch (err) {
    return fail(err.message);
  }

  $('#pay').addEventListener('click', async () => {
    $('#pay').disabled = true;
    try {
      const res = await api.post('/v1/billing/dev/complete', { session: id });
      location.href = res.redirect;
    } catch (err) {
      fail(err.message);
    }
  });
})();
