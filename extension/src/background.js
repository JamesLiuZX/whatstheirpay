// Service worker: the only place that talks to the API. Content scripts and the popup send it
// messages; it attaches the session token, caches plan/quota, and keeps the toolbar badge current.

// Point this at your deployment (and add it to host_permissions in manifest.json).
const DEFAULT_API_BASE = 'http://localhost:8787';
const CONFIG_TTL_MS = 6 * 60 * 60 * 1000;
const VERSION = chrome.runtime.getManifest().version;

const DEFAULTS = {
  apiBase: DEFAULT_API_BASE,
  token: null,
  user: null,
  plan: null,
  quota: null,
  autoReveal: false,
  showOnJobs: true,
};

const getState = () => chrome.storage.local.get(DEFAULTS);

async function api(path, { method = 'GET', body } = {}, retried = false) {
  const { apiBase, token } = await getState();
  const headers = { 'X-Client': `extension/${VERSION}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(apiBase.replace(/\/$/, '') + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (_) {
    return { ok: false, status: 0, body: { error: { code: 'network', message: "Can't reach WhatsTheirPay. Check your connection, or that the API server is running." } } };
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && data && data.error && data.error.code === 'session_expired' && !retried) {
    await chrome.storage.local.set({ token: null, user: null });
    return api(path, { method, body }, true);
  }
  const quota = (data && data.quota) || (data && data.error && data.error.quota);
  if (quota) {
    await chrome.storage.local.set({ quota });
    updateBadge(quota);
  }
  if (data && data.plan && data.plan.id) await chrome.storage.local.set({ plan: data.plan });
  return { ok: res.ok, status: res.status, body: data };
}

function updateBadge(quota) {
  // Only speak up when it matters: a few estimates left, or none.
  const low = quota && quota.remaining <= 3;
  chrome.action.setBadgeText({ text: low ? String(quota.remaining) : '' });
  if (low) chrome.action.setBadgeBackgroundColor({ color: quota.remaining === 0 ? '#b4261e' : '#c98500' });
}

async function getConfig() {
  const { cfg, cfgAt } = await chrome.storage.local.get(['cfg', 'cfgAt']);
  if (cfg && Date.now() - cfgAt < CONFIG_TTL_MS) return { ok: true, body: cfg };
  const r = await api('/v1/extension/config');
  if (r.ok && r.body) {
    await chrome.storage.local.set({ cfg: r.body, cfgAt: Date.now() });
    return r;
  }
  return { ok: Boolean(cfg), status: r.status, body: cfg || null };
}

async function handle(msg) {
  switch (msg && msg.type) {
    case 'estimate':
      return api('/v1/estimate', { method: 'POST', body: Object.assign({}, msg.payload, { source: 'extension' }) });
    case 'me': {
      const r = await api('/v1/me');
      if (r.ok) await chrome.storage.local.set({ user: r.body.user, plan: r.body.plan, quota: r.body.quota });
      return r;
    }
    case 'config':
      return getConfig();
    case 'history':
      return api('/v1/history');
    case 'auth:start':
      return api('/v1/auth/start', { method: 'POST', body: { email: msg.email } });
    case 'auth:verify': {
      const r = await api('/v1/auth/verify', { method: 'POST', body: { email: msg.email, code: msg.code, client: 'extension' } });
      if (r.ok) await chrome.storage.local.set({ token: r.body.token, user: r.body.user, plan: r.body.plan, quota: r.body.quota });
      return r;
    }
    case 'auth:logout':
      await api('/v1/auth/logout', { method: 'POST', body: {} });
      await chrome.storage.local.set({ token: null, user: null, plan: null, quota: null });
      updateBadge(null);
      return { ok: true };
    case 'checkout': {
      const r = await api('/v1/billing/checkout', { method: 'POST', body: { interval: msg.interval } });
      if (r.ok && r.body && r.body.url) await chrome.tabs.create({ url: r.body.url });
      return r;
    }
    case 'open': {
      const { apiBase } = await getState();
      await chrome.tabs.create({ url: apiBase.replace(/\/$/, '') + msg.path });
      return { ok: true };
    }
    case 'settings:get':
      return { ok: true, body: await getState() };
    case 'settings:set': {
      const allowed = ['autoReveal', 'showOnJobs', 'apiBase'];
      const values = Object.fromEntries(Object.entries(msg.values || {}).filter(([k]) => allowed.includes(k)));
      if (values.apiBase !== undefined) Object.assign(values, { token: null, user: null, plan: null, quota: null, cfg: null, cfgAt: 0 });
      await chrome.storage.local.set(values);
      return { ok: true };
    }
    default:
      return { ok: false, status: 400, body: { error: { code: 'unknown_message', message: 'Unknown request.' } } };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from this extension's own pages and content scripts.
  if (sender.id !== chrome.runtime.id) return false;
  handle(msg).then(sendResponse, (err) =>
    sendResponse({ ok: false, status: 0, body: { error: { code: 'internal', message: err.message || 'Something went wrong.' } } }),
  );
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const { apiBase } = await getState();
  chrome.tabs.create({ url: `${apiBase.replace(/\/$/, '')}/?installed=1` });
});
