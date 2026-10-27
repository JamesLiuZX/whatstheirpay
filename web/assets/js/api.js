// Tiny API client shared by the site's pages. Defines window.WTP.
(function (global) {
  'use strict';
  const TOKEN_KEY = 'wtp-token';

  const token = {
    get() {
      try {
        return localStorage.getItem(TOKEN_KEY);
      } catch (_) {
        return null;
      }
    },
    set(value) {
      try {
        if (value) localStorage.setItem(TOKEN_KEY, value);
        else localStorage.removeItem(TOKEN_KEY);
      } catch (_) {}
    },
  };

  class ApiError extends Error {
    constructor(status, body) {
      super((body && body.error && body.error.message) || `Request failed (${status})`);
      this.status = status;
      this.body = body;
      this.code = body && body.error && body.error.code;
    }
  }

  async function request(method, path, body, retried) {
    const headers = { 'X-Client': 'web' };
    const t = token.get();
    if (t) headers.Authorization = `Bearer ${t}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (_) {
      throw new ApiError(0, { error: { code: 'network', message: "Can't reach WhatsTheirPay. Check your connection and try again." } });
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json() : await res.text();
    if (res.status === 401 && data && data.error && data.error.code === 'session_expired' && !retried) {
      // Stale token: forget it and continue as a guest.
      token.set(null);
      return request(method, path, body, true);
    }
    if (!res.ok) throw new ApiError(res.status, isJson ? data : { error: { code: `http_${res.status}`, message: 'Request failed.' } });
    return data;
  }

  async function download(path, filename) {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token.get()}` } });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms || 3200);
  }

  /** Two-step email code sign-in bound to the #dlg-signin dialog markup. */
  function signInDialog() {
    const dlg = document.getElementById('dlg-signin');
    if (!dlg) return null;
    const emailForm = dlg.querySelector('#signin-email');
    const codeForm = dlg.querySelector('#signin-code');
    let email = '';
    let onDone = null;

    const showError = (form, msg) => {
      const el = form.querySelector('[data-error]');
      el.textContent = msg || '';
      el.hidden = !msg;
    };
    const busy = (form, on) => form.querySelectorAll('button[type=submit]').forEach((b) => (b.disabled = on));

    emailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      email = String(new FormData(emailForm).get('email') || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return showError(emailForm, 'Enter a valid email address.');
      showError(emailForm, '');
      busy(emailForm, true);
      try {
        const res = await request('POST', '/v1/auth/start', { email });
        emailForm.hidden = true;
        codeForm.hidden = false;
        codeForm.querySelector('[data-email]').textContent = email;
        const input = codeForm.querySelector('[name=code]');
        input.value = res.devCode || '';
        codeForm.querySelector('[data-dev]').hidden = !res.devCode;
        input.focus();
      } catch (err) {
        showError(emailForm, err.message);
      } finally {
        busy(emailForm, false);
      }
    });

    codeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = String(new FormData(codeForm).get('code') || '').replace(/\D/g, '');
      if (code.length !== 6) return showError(codeForm, 'Enter the 6-digit code.');
      showError(codeForm, '');
      busy(codeForm, true);
      try {
        const res = await request('POST', '/v1/auth/verify', { email, code, client: 'web' });
        token.set(res.token);
        dlg.close();
        toast(`Signed in as ${res.user.email}`);
        if (onDone) onDone(res);
      } catch (err) {
        showError(codeForm, err.message);
      } finally {
        busy(codeForm, false);
      }
    });

    codeForm.querySelector('[data-back]').addEventListener('click', () => {
      codeForm.hidden = true;
      emailForm.hidden = false;
      emailForm.querySelector('[name=email]').focus();
    });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));

    return {
      open({ title, sub, done } = {}) {
        onDone = done || null;
        dlg.querySelector('#signin-title').textContent = title || 'Sign in';
        dlg.querySelector('#signin-sub').textContent = sub || "We'll email you a 6-digit code. No password needed.";
        codeForm.hidden = true;
        emailForm.hidden = false;
        showError(emailForm, '');
        showError(codeForm, '');
        dlg.showModal();
        emailForm.querySelector('[name=email]').focus();
      },
    };
  }

  global.WTP = {
    api: { get: (p) => request('GET', p), post: (p, b) => request('POST', p, b === undefined ? {} : b), download },
    token,
    ApiError,
    toast,
    signInDialog,
  };
})(window);
