/* WhatsTheirPay estimate card, shared by the website and the Chrome extension.
 * Source of truth: shared/card.js. `npm run sync` copies it to web/assets/js and extension/src.
 * Classic script (no modules) so it works as a page script and as a content script.
 * Defines globalThis.WTPCard. */
(function (global) {
  'use strict';

  const TIERS = [
    ['big_tech', 'Big Tech'],
    ['high_growth', 'High-growth / late-stage'],
    ['startup', 'Early-stage startup'],
    ['enterprise', 'Established enterprise'],
    ['standard', 'Typical company'],
    ['bank', 'Major bank / financial firm'],
    ['top_finance', 'Top-tier trading firm'],
    ['elite_consulting', 'Top-tier consulting'],
    ['agency', 'Agency / IT services / Big Four'],
    ['public_sector', 'Public sector, education or non-profit'],
    ['freelance', 'Self-employed / freelance'],
  ];
  const LEVELS = ['Intern', 'Entry level', 'Mid level', 'Senior', 'Staff / Lead / Manager', 'Principal / Senior Manager', 'Director', 'Senior Director / Head of', 'Vice President', 'C-suite'];
  const LOADING_STEPS = ['Reading the profile…', 'Matching the role…', 'Pricing the market…'];

  const CSS = `
.wtp-root{--wtp-font:"Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--wtp-mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --wtp-surface:#fff;--wtp-surface-2:#f8f7f3;--wtp-ink:#0d1411;--wtp-ink-2:#3f4a44;--wtp-muted:#6b7570;--wtp-line:#e6e3da;--wtp-line-2:#d7d3c7;
  --wtp-brand:#0e7a53;--wtp-brand-ink:#fff;--wtp-brand-soft:#e3f3ea;--wtp-brand-wash:rgba(14,122,83,.12);--wtp-accent:#c8f169;
  --wtp-s1:#0f8a5f;--wtp-s2:#2a78d6;--wtp-s3:#e39b17;--wtp-track:#eceae3;--wtp-shadow:0 1px 2px rgba(13,20,17,.05),0 18px 40px -18px rgba(13,20,17,.25);
  --wtp-danger:#b4261e;color-scheme:light}
.wtp-root[data-theme=dark],:root[data-theme=dark] .wtp-root{--wtp-surface:#121815;--wtp-surface-2:#161d19;--wtp-ink:#ecf1ee;--wtp-ink-2:#b9c3bd;--wtp-muted:#8d9892;--wtp-line:#232c27;--wtp-line-2:#2e3933;
  --wtp-brand:#34d399;--wtp-brand-ink:#04140d;--wtp-brand-soft:#123326;--wtp-brand-wash:rgba(52,211,153,.14);--wtp-s1:#1f9e6e;--wtp-s2:#3987e5;--wtp-s3:#c98500;--wtp-track:#1e2622;
  --wtp-shadow:0 1px 2px rgba(0,0,0,.4),0 18px 40px -18px rgba(0,0,0,.7);--wtp-danger:#ff8a80;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .wtp-root:not([data-theme=light]),.wtp-root[data-theme=auto]{--wtp-surface:#121815;--wtp-surface-2:#161d19;--wtp-ink:#ecf1ee;--wtp-ink-2:#b9c3bd;--wtp-muted:#8d9892;--wtp-line:#232c27;--wtp-line-2:#2e3933;
  --wtp-brand:#34d399;--wtp-brand-ink:#04140d;--wtp-brand-soft:#123326;--wtp-brand-wash:rgba(52,211,153,.14);--wtp-s1:#1f9e6e;--wtp-s2:#3987e5;--wtp-s3:#c98500;--wtp-track:#1e2622;
  --wtp-shadow:0 1px 2px rgba(0,0,0,.4),0 18px 40px -18px rgba(0,0,0,.7);--wtp-danger:#ff8a80;color-scheme:dark}}
.wtp-card{font-family:var(--wtp-font);color:var(--wtp-ink);background:var(--wtp-surface);border:1px solid var(--wtp-line);border-radius:20px;box-shadow:var(--wtp-shadow);
  padding:20px;font-size:14px;line-height:1.45;text-align:left;-webkit-font-smoothing:antialiased;box-sizing:border-box;width:100%}
.wtp-card *,.wtp-card *::before,.wtp-card *::after{box-sizing:border-box}
.wtp-card button{font:inherit;cursor:pointer}
.wtp-card :focus-visible{outline:2px solid var(--wtp-brand);outline-offset:2px;border-radius:6px}
.wtp-head{display:flex;gap:12px;align-items:center}
.wtp-avatar{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--wtp-brand-soft);color:var(--wtp-brand);font-weight:600;font-size:14px;letter-spacing:.02em}
.wtp-who{min-width:0;flex:1}
.wtp-name{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtp-sub{color:var(--wtp-muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtp-icon-btn{flex:none;border:1px solid var(--wtp-line);background:var(--wtp-surface);color:var(--wtp-ink-2);width:34px;height:34px;border-radius:10px;display:grid;place-items:center}
.wtp-icon-btn:hover{border-color:var(--wtp-line-2);color:var(--wtp-ink)}
.wtp-icon-btn svg{width:16px;height:16px}
.wtp-badge{display:inline-flex;align-items:center;gap:6px;margin-top:14px;font:500 11px/1 var(--wtp-mono);letter-spacing:.04em;text-transform:uppercase;color:var(--wtp-ink-2);background:var(--wtp-surface-2);border:1px solid var(--wtp-line);padding:6px 8px;border-radius:999px}
.wtp-badge i{width:6px;height:6px;border-radius:50%;background:var(--wtp-brand)}
.wtp-hero{margin-top:18px}
.wtp-kicker{font:500 11px/1.2 var(--wtp-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--wtp-muted)}
.wtp-figure{font-size:48px;line-height:1.05;font-weight:600;letter-spacing:-.03em;margin-top:6px}
.wtp-range-text{color:var(--wtp-ink-2);margin-top:6px}
.wtp-range-text strong{color:var(--wtp-ink);font-weight:600}
.wtp-usd{color:var(--wtp-muted);font-size:12px;margin-top:2px}
.wtp-band{margin-top:16px}
.wtp-band-track{position:relative;height:10px;border-radius:999px;background:var(--wtp-track)}
.wtp-band-tail{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--wtp-brand-wash)}
.wtp-band-tail.locked{background:repeating-linear-gradient(135deg,var(--wtp-track) 0 4px,var(--wtp-line-2) 4px 6px)}
.wtp-band-iqr{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--wtp-brand)}
.wtp-band-mid{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--wtp-ink);box-shadow:0 0 0 2px var(--wtp-surface)}
.wtp-band-scale{display:flex;justify-content:space-between;margin-top:8px;font:500 11px/1.3 var(--wtp-mono);color:var(--wtp-muted)}
.wtp-band-scale button{border:0;background:none;color:var(--wtp-brand);padding:0;font:inherit;text-decoration:underline;text-underline-offset:2px}
[data-tip]:hover::after,[data-tip]:focus-visible::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);white-space:nowrap;
  background:var(--wtp-ink);color:var(--wtp-surface);font:500 12px/1 var(--wtp-font);padding:7px 9px;border-radius:8px;pointer-events:none;z-index:5}
.wtp-section{margin-top:20px;padding-top:16px;border-top:1px solid var(--wtp-line)}
.wtp-section-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;margin-bottom:12px}
.wtp-pro{font:600 10px/1 var(--wtp-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--wtp-brand);background:var(--wtp-brand-soft);padding:4px 6px;border-radius:6px}
.wtp-stack{display:flex;gap:2px;height:14px}
.wtp-stack .seg{display:block;height:100%;min-width:4px;position:relative}
.wtp-stack .seg:last-child{border-radius:0 4px 4px 0}
.seg-base,.sw-base{background:var(--wtp-s1)}.seg-var,.sw-var{background:var(--wtp-s2)}.seg-eq,.sw-eq{background:var(--wtp-s3)}
.wtp-legend{display:grid;gap:8px;margin:12px 0 0}
.wtp-legend div{display:flex;align-items:center;justify-content:space-between;gap:12px}
.wtp-legend dt{display:flex;align-items:center;gap:8px;color:var(--wtp-ink-2)}
.wtp-legend dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}
.wtp-legend dd span{color:var(--wtp-muted);font-weight:400;margin-left:6px;display:inline-block;min-width:3ch;text-align:right}
.wtp-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.wtp-note{color:var(--wtp-muted);font-size:12px;margin-top:10px}
.wtp-posted{display:flex;gap:10px;align-items:flex-start;background:var(--wtp-surface-2);border:1px solid var(--wtp-line);border-radius:12px;padding:10px 12px;margin-top:14px;font-size:13px;color:var(--wtp-ink-2)}
.wtp-posted strong{color:var(--wtp-ink)}
.wtp-conf-row{display:flex;align-items:center;gap:10px}
.wtp-conf-label{font-weight:600;font-size:13px;white-space:nowrap}
.wtp-meter{flex:1;height:6px;border-radius:999px;background:var(--wtp-brand-soft);overflow:hidden}
.wtp-meter span{display:block;height:100%;border-radius:999px;background:var(--wtp-brand)}
.wtp-conf-score{font:600 12px/1 var(--wtp-mono);color:var(--wtp-ink-2)}
.wtp-why{margin-top:12px}
.wtp-why summary{cursor:pointer;color:var(--wtp-ink-2);font-weight:500;list-style:none;display:flex;align-items:center;gap:6px}
.wtp-why summary::-webkit-details-marker{display:none}
.wtp-why summary::before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
.wtp-why[open] summary::before{transform:rotate(45deg)}
.wtp-factors{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:10px}
.wtp-factors li{display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;align-items:baseline}
.f-sig{display:inline-flex;gap:2px;align-items:flex-end;height:10px}
.f-sig i{width:3px;border-radius:1px;background:var(--wtp-line-2)}
.f-sig i:nth-child(1){height:4px}.f-sig i:nth-child(2){height:7px}.f-sig i:nth-child(3){height:10px}
.f-sig[data-s=strong] i,.f-sig[data-s=medium] i:nth-child(-n+2),.f-sig[data-s=weak] i:nth-child(1){background:var(--wtp-brand)}
.f-head{font-size:13px}.f-head b{font-weight:600}.f-head span{color:var(--wtp-muted)}
.f-mult{font:500 12px/1 var(--wtp-mono);color:var(--wtp-ink-2)}
.f-detail{grid-column:2/4;margin:0;color:var(--wtp-muted);font-size:12px}
.wtp-improve{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.wtp-chip{border:1px dashed var(--wtp-line-2);background:transparent;color:var(--wtp-ink-2);border-radius:999px;padding:5px 10px;font-size:12px}
.wtp-chip:hover{border-style:solid;color:var(--wtp-ink)}
.wtp-chip b{color:var(--wtp-brand);font-weight:600}
.wtp-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.wtp-tile{border:1px solid var(--wtp-line);border-radius:12px;padding:10px;min-width:0}
.wtp-tile span{display:block;color:var(--wtp-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtp-tile strong{display:block;font-size:18px;font-weight:600;margin-top:2px;letter-spacing:-.01em}
.wtp-tile.accent{background:var(--wtp-brand-soft);border-color:transparent}
.wtp-talk{margin:10px 0 0;padding:10px 12px;border-left:3px solid var(--wtp-brand);background:var(--wtp-surface-2);border-radius:0 10px 10px 0;color:var(--wtp-ink-2);font-size:13px}
.wtp-talk button{display:block;margin-top:6px;border:0;background:none;color:var(--wtp-brand);padding:0;font-weight:600;font-size:12px}
.wtp-locked{position:relative}
.wtp-locked .wtp-tiles,.wtp-locked .wtp-talk{filter:blur(5px);user-select:none;pointer-events:none;opacity:.7}
.wtp-unlock{position:absolute;inset:34px 0 0;display:grid;place-items:center}
.wtp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;padding:11px 16px;font-weight:600;font-size:14px;border:1px solid transparent;text-decoration:none;white-space:nowrap}
.wtp-btn-primary{background:var(--wtp-ink);color:var(--wtp-surface)}
.wtp-btn-primary:hover{opacity:.9}
.wtp-btn-brand{background:var(--wtp-brand);color:var(--wtp-brand-ink)}
.wtp-btn-ghost{background:var(--wtp-surface);color:var(--wtp-ink);border-color:var(--wtp-line-2)}
.wtp-btn-block{width:100%}
.wtp-foot{margin-top:20px;display:grid;gap:10px}
.wtp-quota{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--wtp-muted)}
.wtp-quota b{color:var(--wtp-ink-2);font-weight:600}
.wtp-disclaimer{margin:0;color:var(--wtp-muted);font-size:11px}
.wtp-form{display:grid;gap:12px}
.wtp-form-title{font-weight:600;font-size:17px;letter-spacing:-.01em}
.wtp-form-sub{margin:4px 0 0;color:var(--wtp-muted);font-size:13px}
.wtp-form label{display:grid;gap:6px;font-size:12px;font-weight:600;color:var(--wtp-ink-2)}
.wtp-form label em{font-style:normal;font-weight:400;color:var(--wtp-muted)}
.wtp-form input,.wtp-form select{font:inherit;font-size:14px;font-weight:400;color:var(--wtp-ink);background:var(--wtp-surface);border:1px solid var(--wtp-line-2);border-radius:10px;padding:10px 12px;width:100%;min-height:42px}
.wtp-form input:focus,.wtp-form select:focus{outline:none;border-color:var(--wtp-brand);box-shadow:0 0 0 3px var(--wtp-brand-wash)}
.wtp-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wtp-adv summary{cursor:pointer;font-size:12px;font-weight:600;color:var(--wtp-ink-2)}
.wtp-adv[open]{display:grid;gap:12px}
.wtp-hint{margin:0;text-align:center;color:var(--wtp-muted);font-size:12px}
.wtp-skel{display:grid;gap:12px}
.wtp-skel i{display:block;height:12px;border-radius:8px;background:linear-gradient(90deg,var(--wtp-track),var(--wtp-surface-2),var(--wtp-track));background-size:200% 100%;animation:wtp-shimmer 1.2s linear infinite}
.wtp-skel .big{height:44px;width:60%}.wtp-skel .w40{width:40%}.wtp-skel .w80{width:80%}
.wtp-status{display:flex;align-items:center;gap:8px;color:var(--wtp-muted);font-size:13px;margin-top:4px}
.wtp-spinner{width:14px;height:14px;border-radius:50%;border:2px solid var(--wtp-line-2);border-top-color:var(--wtp-brand);animation:wtp-spin .8s linear infinite}
@keyframes wtp-shimmer{to{background-position:-200% 0}}
@keyframes wtp-spin{to{transform:rotate(360deg)}}
.wtp-wall{text-align:center;display:grid;gap:10px;justify-items:center;padding:8px 4px}
.wtp-wall-icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--wtp-brand-soft);color:var(--wtp-brand)}
.wtp-wall h3{margin:6px 0 0;font-size:17px;letter-spacing:-.01em}
.wtp-wall p{margin:0;color:var(--wtp-ink-2)}
.wtp-wall .wtp-reset{font:500 12px/1 var(--wtp-mono);color:var(--wtp-muted)}
.wtp-wall .wtp-btn{width:100%}
.wtp-error{color:var(--wtp-danger)}
.wtp-fade{animation:wtp-in .35s ease both}
@keyframes wtp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.wtp-fade,.wtp-skel i,.wtp-spinner{animation:none}}
`;

  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function money(v, cur, compact) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '—';
    const currency = cur || 'USD';
    const opts =
      compact === false
        ? { style: 'currency', currency, maximumFractionDigits: 0 }
        : { style: 'currency', currency, notation: 'compact', maximumSignificantDigits: 3 };
    try {
      return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', opts).format(v).replace(/(\d)K\b/, '$1k');
    } catch (_) {
      return `${currency} ${Math.round(v).toLocaleString('en-US')}`;
    }
  }

  const initials = (s) =>
    String(s || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');

  const ICONS = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/></svg>',
  };

  function timeUntil(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (!(ms > 0)) return 'soon';
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    if (h >= 48) return `${Math.round(h / 24)} days`;
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  function quotaLine(q) {
    if (!q) return '';
    const period = q.period === 'day' ? 'today' : 'this month';
    const left = q.remaining;
    const noun = q.plan === 'guest' || q.plan === 'free' ? 'free estimates' : 'estimates';
    return `<span><b>${left.toLocaleString('en-US')}</b> of ${q.limit.toLocaleString('en-US')} ${noun} left ${period}</span>`;
  }

  function adoptStyles(root) {
    if (!root || root.__wtpStyled) return;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } catch (_) {
      const style = document.createElement('style');
      style.textContent = CSS;
      (root.head || root).appendChild(style);
    }
    root.__wtpStyled = true;
  }

  function create(container, opts) {
    const options = Object.assign({ context: 'web', onSubmit() {}, onAction() {} }, opts);
    container.classList.add('wtp-root');
    let current = null; // last result response
    let loadingTimer = null;

    const set = (html) => {
      clearInterval(loadingTimer);
      container.innerHTML = `<div class="wtp-card wtp-fade">${html}</div>`;
      const root = container.firstElementChild;
      // Geometry is applied through CSSOM, which strict CSPs (ours and LinkedIn's) allow,
      // unlike inline style attributes.
      root.querySelectorAll('[data-style]').forEach((el) => {
        el.getAttribute('data-style').split(';').forEach((decl) => {
          const i = decl.indexOf(':');
          if (i > 0) el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
        });
        el.removeAttribute('data-style');
      });
      return root;
    };

    function bindCommon(root) {
      root.querySelectorAll('[data-action]').forEach((el) =>
        el.addEventListener('click', (e) => {
          const action = el.getAttribute('data-action');
          if (action === 'edit') return form({ mode: 'edit', profile: current && current.profile, overrides: current && current.overrides });
          if (action === 'improve') {
            return form({ mode: 'edit', profile: current && current.profile, focus: el.getAttribute('data-field') });
          }
          if (action === 'copy') {
            const text = el.getAttribute('data-text') || '';
            (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
              .then(() => (el.textContent = 'Copied'))
              .catch(() => (el.textContent = 'Select the text to copy'));
            return;
          }
          e.preventDefault();
          options.onAction(action, current);
        }),
      );
    }

    function loading(label) {
      const root = set(`
        <div class="wtp-skel" aria-busy="true" aria-live="polite">
          <div class="wtp-head"><div class="wtp-avatar"></div><div class="wtp-who"><i class="w80"></i><i class="w40" data-style="margin-top:8px"></i></div></div>
          <i class="w40" data-style="margin-top:12px"></i><i class="big"></i><i></i><i class="w80"></i>
          <div class="wtp-status"><span class="wtp-spinner"></span><span data-status>${esc(label || LOADING_STEPS[0])}</span></div>
        </div>`);
      if (!label) {
        let i = 0;
        loadingTimer = setInterval(() => {
          i = Math.min(i + 1, LOADING_STEPS.length - 1);
          const s = root.querySelector('[data-status]');
          if (s) s.textContent = LOADING_STEPS[i];
        }, 650);
      }
    }

    function form(f) {
      const p = (f && f.profile) || {};
      const ov = (f && f.overrides) || {};
      const mode = (f && f.mode) || 'needs_input';
      const fromExample = mode === 'edit' && current && current.example;
      const title =
        mode === 'edit' ? 'Edit details' : mode === 'describe' ? 'Describe the role' : `Almost there${p.name ? `: ${esc(p.name)}` : ''}`;
      const sub =
        mode === 'edit'
          ? fromExample
            ? 'Editing an example creates your own estimate (it uses one free estimate).'
            : 'Change anything and we will recalculate. Edits are free.'
          : mode === 'describe'
            ? 'No URL needed. Only the title is required.'
            : esc((f && f.message) || 'Add their title, company and city.');
      const root = set(`
        <form class="wtp-form" novalidate>
          <div><div class="wtp-form-title">${title}</div><p class="wtp-form-sub">${sub}</p></div>
          <label>Job title <input name="title" required maxlength="160" autocomplete="off" placeholder="e.g. Senior Product Designer" value="${esc(p.title)}"></label>
          <div class="wtp-row">
            <label>Company <em>(recommended)</em><input name="company" maxlength="120" autocomplete="off" placeholder="e.g. Figma" value="${esc(p.company)}"></label>
            <label>City or country <em>(recommended)</em><input name="location" maxlength="120" autocomplete="off" placeholder="e.g. Austin, TX" value="${esc(p.location)}"></label>
          </div>
          <label>Years of experience <em>(optional)</em><input name="yearsExperience" type="number" inputmode="numeric" min="0" max="50" step="1" placeholder="e.g. 6" value="${esc(p.yearsExperience ?? '')}"></label>
          <details class="wtp-adv"${ov.tier || ov.level !== undefined ? ' open' : ''}>
            <summary>Fine-tune employer type and level</summary>
            <label>Employer type<select name="tier"><option value="">Detect from company</option>${TIERS.map(
              ([id, label]) => `<option value="${id}"${ov.tier === id ? ' selected' : ''}>${esc(label)}</option>`,
            ).join('')}</select></label>
            <label>Level<select name="level"><option value="">Detect from title</option>${LEVELS.map(
              (label, i) => `<option value="${i}"${ov.level === i ? ' selected' : ''}>${esc(label)}</option>`,
            ).join('')}</select></label>
          </details>
          <p class="wtp-error" data-error hidden></p>
          <button class="wtp-btn wtp-btn-primary wtp-btn-block" type="submit">${mode === 'edit' ? 'Update estimate' : 'Estimate pay'}</button>
          ${mode === 'edit' && current ? '<button class="wtp-btn wtp-btn-ghost wtp-btn-block" type="button" data-cancel>Cancel</button>' : ''}
        </form>`);
      const el = root.querySelector('form');
      const focusName = (f && f.focus) || (p.title ? 'company' : 'title');
      const focusEl = el.querySelector(`[name="${focusName}"]`) || el.querySelector('[name=title]');
      setTimeout(() => focusEl && focusEl.focus({ preventScroll: true }), 30);
      const cancel = el.querySelector('[data-cancel]');
      if (cancel) cancel.addEventListener('click', () => current && result(current));
      el.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = new FormData(el);
        const fields = {
          title: String(data.get('title') || '').trim(),
          company: String(data.get('company') || '').trim() || undefined,
          location: String(data.get('location') || '').trim() || undefined,
          yearsExperience: data.get('yearsExperience') === '' ? undefined : Number(data.get('yearsExperience')),
        };
        if (!fields.title) {
          const err = el.querySelector('[data-error]');
          err.textContent = 'Add a job title to continue.';
          err.hidden = false;
          el.querySelector('[name=title]').focus();
          return;
        }
        const overrides = {};
        if (data.get('tier')) overrides.tier = String(data.get('tier'));
        if (data.get('level') !== '' && data.get('level') !== null) overrides.level = Number(data.get('level'));
        if (p.name && !fromExample) fields.name = p.name;
        options.onSubmit(fields, { mode, overrides });
      });
    }

    function result(resp, extra) {
      current = Object.assign({}, resp, extra && extra.overrides ? { overrides: extra.overrides } : {});
      const e = resp.estimate;
      const p = resp.profile || {};
      const cur = e.currency;
      const t = e.totalComp;
      const who = p.name || p.title || 'This role';
      const sub = [p.name ? p.title : null, p.company, p.location].filter(Boolean).join(' · ');

      // Range band geometry (domain padded around the widest known band).
      const lo = (t.p10 ?? t.p25 - (t.p50 - t.p25) * 1.85) * 0.94;
      const hi = (t.p90 ?? t.p75 + (t.p75 - t.p50) * 2.1) * 1.03;
      const x = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
      const tailFrom = t.p10 ?? t.p25 - (t.p50 - t.p25) * 1.85;
      const tailTo = t.p90 ?? t.p75 + (t.p75 - t.p50) * 2.1;
      const percentilesLocked = t.p10 === null;

      const parts = [
        ['base', 'Base', e.base.p50],
        ['var', e.variable.label, e.variable.p50],
        ['eq', e.equity.label, e.equity.p50],
      ].filter(([, , v]) => v > 0);
      const sum = parts.reduce((a, [, , v]) => a + v, 0) || 1;

      const nego = e.negotiation;
      const negoLocked = !nego;
      const tiles = nego
        ? [
            ['Open with', nego.openingAsk],
            ['Target', nego.target, 'accent'],
            ['Walk away below', nego.walkAway],
          ]
        : [
            ['Open with', 1],
            ['Target', 1, 'accent'],
            ['Walk away below', 1],
          ];
      const posted = e.posted;
      const ctaHtml = (extra && extra.ctaHtml) || '';

      const root = set(`
        <div class="wtp-head">
          <div class="wtp-avatar" aria-hidden="true">${esc(initials(who))}</div>
          <div class="wtp-who"><div class="wtp-name">${esc(who)}</div><div class="wtp-sub">${esc(sub || 'Add company and city for a tighter range')}</div></div>
          <button class="wtp-icon-btn" type="button" data-action="edit" aria-label="Edit details" title="Edit details">${ICONS.edit}</button>
        </div>
        ${resp.example ? '<div class="wtp-badge"><i></i>Example · full Pro preview</div>' : ''}
        <div class="wtp-hero">
          <div class="wtp-kicker">Estimated total comp / year</div>
          <div class="wtp-figure">${esc(money(t.p50, cur))}</div>
          <div class="wtp-range-text">Likely range <strong>${esc(money(t.p25, cur))} – ${esc(money(t.p75, cur))}</strong></div>
          ${e.usd ? `<div class="wtp-usd">≈ ${esc(money(e.usd.p50, 'USD'))} USD median</div>` : ''}
        </div>
        <div class="wtp-band" role="img" aria-label="Pay range. Middle half from ${esc(money(t.p25, cur))} to ${esc(money(t.p75, cur))}, median ${esc(money(t.p50, cur))}.">
          <div class="wtp-band-track">
            <span class="wtp-band-tail${percentilesLocked ? ' locked' : ''}" data-style="left:${x(tailFrom)}%;width:${x(tailTo) - x(tailFrom)}%"
              tabindex="0" data-tip="${percentilesLocked ? 'Full p10–p90 range with Pro' : `p10–p90: ${esc(money(t.p10, cur))} – ${esc(money(t.p90, cur))}`}"></span>
            <span class="wtp-band-iqr" data-style="left:${x(t.p25)}%;width:${x(t.p75) - x(t.p25)}%" tabindex="0"
              data-tip="Middle 50%: ${esc(money(t.p25, cur))} – ${esc(money(t.p75, cur))}"></span>
            <span class="wtp-band-mid" data-style="left:${x(t.p50)}%" tabindex="0" data-tip="Median ${esc(money(t.p50, cur, false))}"></span>
          </div>
          <div class="wtp-band-scale">
            ${
              percentilesLocked
                ? `<span>Low end</span><button type="button" data-action="upgrade">See full range with Pro</button><span>High end</span>`
                : `<span>p10 ${esc(money(t.p10, cur))}</span><span>p90 ${esc(money(t.p90, cur))}</span>`
            }
          </div>
        </div>

        <div class="wtp-section">
          <div class="wtp-section-title">What it's made of</div>
          <div class="wtp-stack" role="img" aria-label="${esc(parts.map(([, l, v]) => `${l} ${money(v, cur)}`).join(', '))}">
            ${parts.map(([k, l, v]) => `<span class="seg seg-${k}" data-style="flex:${v}" tabindex="0" data-tip="${esc(l)} ${esc(money(v, cur, false))}"></span>`).join('')}
          </div>
          <dl class="wtp-legend">
            ${parts
              .map(
                ([k, l, v]) =>
                  `<div><dt><i class="sw-${k}"></i>${esc(l)}</dt><dd>${esc(money(v, cur))}<span>${Math.round((v / sum) * 100)}%</span></dd></div>`,
              )
              .join('')}
          </dl>
          ${e.equity.note && e.equity.p50 > 0 ? `<p class="wtp-note">${esc(e.equity.note)}</p>` : ''}
          ${
            posted
              ? `<div class="wtp-posted">${ICONS.info}<span>Posted <strong>${esc(money(posted.min * (posted.period === 'hour' ? 2080 : posted.period === 'month' ? 12 : 1), posted.currency))} – ${esc(
                  money(posted.max * (posted.period === 'hour' ? 2080 : posted.period === 'month' ? 12 : 1), posted.currency),
                )}</strong> base. That's <strong>${
                  posted.verdict === 'at' ? 'in line with' : `${Math.abs(Math.round(posted.vsMarketBase * 100))}% ${posted.verdict}`
                }</strong> the market's median base of ${esc(money(e.base.p50, cur))}.</span></div>`
              : ''
          }
        </div>

        <div class="wtp-section">
          <div class="wtp-conf-row">
            <span class="wtp-conf-label">${esc(e.confidence.label)} confidence</span>
            <span class="wtp-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${e.confidence.score}" aria-label="Confidence"><span data-style="width:${e.confidence.score}%"></span></span>
            <span class="wtp-conf-score">${e.confidence.score}/100</span>
          </div>
          <details class="wtp-why"${extra && extra.openWhy ? ' open' : ''}>
            <summary>Why this estimate</summary>
            <ul class="wtp-factors">
              ${e.factors
                .map(
                  (f) => `<li>
                <span class="f-sig" data-s="${f.strength}" aria-label="${f.strength} signal"><i></i><i></i><i></i></span>
                <span class="f-head"><b>${esc(f.label)}</b> <span>${esc(f.value)}</span></span>
                <span class="f-mult">${f.multiplier === null ? '' : `×${Number(f.multiplier).toFixed(2)}`}</span>
                <p class="f-detail">${esc(f.detail)}</p></li>`,
                )
                .join('')}
            </ul>
          </details>
          ${
            e.improve && e.improve.length && !resp.example
              ? `<div class="wtp-improve">${e.improve
                  .map((i) => `<button type="button" class="wtp-chip" data-action="improve" data-field="${esc(i.field)}">${esc(i.hint)} <b>+${i.gain}</b></button>`)
                  .join('')}</div>`
              : ''
          }
        </div>

        <div class="wtp-section${negoLocked ? ' wtp-locked' : ''}">
          <div class="wtp-section-title">Negotiation brief <span class="wtp-pro">Pro</span></div>
          <div class="wtp-tiles">${tiles
            .map(([l, v, cls]) => `<div class="wtp-tile ${cls || ''}"><span>${esc(l)}</span><strong>${negoLocked ? '•••' : esc(money(v, cur))}</strong></div>`)
            .join('')}</div>
          <blockquote class="wtp-talk">${
            nego
              ? `“${esc(nego.talkTrack)}”<button type="button" data-action="copy" data-text="${esc(nego.talkTrack)}">Copy talk track</button>`
              : '“Based on market data for this role and level, I’m targeting total compensation of around …”'
          }</blockquote>
          ${negoLocked ? '<div class="wtp-unlock"><button type="button" class="wtp-btn wtp-btn-brand" data-action="upgrade">Unlock with Pro</button></div>' : ''}
        </div>

        <div class="wtp-foot">
          ${resp.quota ? `<div class="wtp-quota">${resp.example ? '<span>Examples are free and don’t use an estimate</span>' : quotaLine(resp.quota)}${resp.charged === false && !resp.example ? '<span>Free re-view</span>' : ''}</div>` : ''}
          ${ctaHtml}
          <p class="wtp-disclaimer">${esc(e.disclaimer)} Methodology v${esc(e.methodology.version)}.</p>
        </div>`);
      bindCommon(root);
    }

    function wall(errBody) {
      const err = (errBody && errBody.error) || {};
      const q = err.quota;
      const isGuest = q && q.plan === 'guest';
      const root = set(`
        <div class="wtp-wall">
          <div class="wtp-wall-icon">${ICONS.lock}</div>
          <h3>${isGuest ? "You've used today's free estimates" : "You've hit this month's limit"}</h3>
          <p>${esc(err.message || '')}</p>
          ${q ? `<div class="wtp-reset">Next free estimate in ${esc(timeUntil(q.resetsAt))}</div>` : ''}
          ${isGuest ? `<button type="button" class="wtp-btn wtp-btn-primary" data-action="signup">Create a free account: 30 a month</button>` : ''}
          <button type="button" class="wtp-btn ${isGuest ? 'wtp-btn-ghost' : 'wtp-btn-brand'}" data-action="upgrade">${isGuest ? 'See Pro plans' : 'Go Pro: 1,000 a month'}</button>
          ${current ? '<button type="button" class="wtp-btn wtp-btn-ghost" data-back>Back to last estimate</button>' : ''}
        </div>`);
      bindCommon(root);
      const back = root.querySelector('[data-back]');
      if (back) back.addEventListener('click', () => result(current));
    }

    function error(message, retry) {
      const root = set(`
        <div class="wtp-wall">
          <div class="wtp-wall-icon" data-style="color:var(--wtp-danger)">${ICONS.alert}</div>
          <h3>Something went wrong</h3>
          <p>${esc(message)}</p>
          ${retry ? '<button type="button" class="wtp-btn wtp-btn-primary" data-retry>Try again</button>' : ''}
          ${current ? '<button type="button" class="wtp-btn wtp-btn-ghost" data-back>Back to last estimate</button>' : ''}
        </div>`);
      const r = root.querySelector('[data-retry]');
      if (r) r.addEventListener('click', retry);
      const b = root.querySelector('[data-back]');
      if (b) b.addEventListener('click', () => result(current));
    }

    function custom(html) {
      const root = set(html);
      bindCommon(root);
      return root;
    }

    return { loading, form, result, wall, error, custom, get current() { return current; } };
  }

  global.WTPCard = { create, adoptStyles, money, esc, timeUntil, CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
