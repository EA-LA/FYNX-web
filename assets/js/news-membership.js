/* Optional saved research. Public news and publisher access never depend on this module. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FYNXNewsMembership = api.create({ window: root });
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const DRAFT_KEY = 'fynx.news.researchDraft.v1';
  const MAX_AGE = 2 * 60 * 60 * 1000;
  const PLANS_URL = '/pro.html?tool=watchlist&from=news#plans';
  function clean(value, limit) { return String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, limit); }
  function normalizeArticle(input = {}) {
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 1200) throw Error('Choose a valid original source link to save.');
    const title = clean(input.title, 300);
    if (!title) throw Error('This research item needs a title.');
    const timestamp = Date.parse(input.publishedAt);
    return { title, url: url.href, source: clean(input.source, 100) || url.hostname, publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
      symbols: Array.isArray(input.symbols) ? input.symbols.map(s => clean(s, 30)).filter(Boolean).slice(0, 30) : [] };
  }
  function entitled(state) {
    return state?.mode === 'live' && state.features?.researchNotesVersion === 1 && !state.billingUnavailable && ['starter', 'plus', 'pro'].includes(state.tier) && state.plans?.[state.tier]?.products?.includes('watchlist');
  }
  function saveRequest(article, labels, notes, uid, requestId) {
    const symbols = [...new Set(String(labels).split(',').map(s => clean(s, 30).toUpperCase()).filter(Boolean))];
    if (!symbols.length || symbols.length > 30) throw Error('Add between 1 and 30 research labels or symbols.');
    const citation = [article.title, 'Source: ' + article.source, article.publishedAt ? 'Published: ' + article.publishedAt : '', article.url].filter(Boolean).join('\n');
    const available = 2000 - citation.length - 9;
    const note = String(notes || '').trim();
    if (note.length > available) throw Error('Shorten your note to ' + Math.max(0, available) + ' characters so its full source link can be saved.');
    return { action: 'save', accountUid: uid, requestId, product: 'watchlist', name: article.title.slice(0, 100), input: { symbols, notes: citation + (note ? '\n\nNote: ' + note : '') } };
  }
  async function defaultServices() {
    const [config, authSDK, functionsSDK] = await Promise.all([
      import('../../auth/firebase.js'), import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'), import('https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js')
    ]);
    await config.authPersistenceReady;
    await new Promise(resolve => { let off; off = authSDK.onAuthStateChanged(config.auth, () => { resolve(); queueMicrotask(() => off?.()); }); });
    const callable = functionsSDK.httpsCallable(functionsSDK.getFunctions(config.app, 'us-central1'), 'consumerLiveWorkspace', { timeout: 8000 });
    return { getUser: () => config.auth.currentUser, call: async data => (await callable(data)).data, onAccountChange: fn => authSDK.onAuthStateChanged(config.auth, fn) };
  }
  function create(options = {}) {
    const win = options.window, doc = win.document;
    let servicePromise, services, dialog, current, version = 0, accountUid = null, requestId, state, pending = false, trigger;
    const node = (tag, text, className) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
    const timeout = (promise, message) => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = win.setTimeout(() => reject(Error(message)), 8500); })]).finally(() => win.clearTimeout(timer)); };
    function draftPath() { return ['/news.html', '/news/news.html', '/market-analysis.html'].includes(win.location.pathname) ? win.location.pathname : '/news.html'; }
    function readDraft() {
      try { const d = JSON.parse(win.sessionStorage.getItem(DRAFT_KEY)); return d && Date.now() - d.createdAt < MAX_AGE && d.createdAt <= Date.now() && ['/news.html', '/news/news.html', '/market-analysis.html'].includes(d.returnPath) ? d : null; } catch { return null; }
    }
    function clearDraft() { try { win.sessionStorage.removeItem(DRAFT_KEY); } catch {} }
    function remember(claimOnSignIn = false) {
      if (!current) return;
      try { win.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ article: current, notes: dialog.querySelector('[name="notes"]').value, labels: dialog.querySelector('[name="labels"]').value,
        ownerUid: accountUid, claimOnSignIn, requestId, createdAt: Date.now(), returnPath: draftPath() })); } catch {}
    }
    function status(text) { dialog.querySelector('[role="status"]').textContent = text; }
    function close() { version++; pending = false; dialog.close(); trigger?.focus?.(); }
    function addLink(parent, label, href, className) { const a = node('a', label, className); a.href = href; parent.append(a); return a; }
    function build() {
      if (dialog) return;
      dialog = node('dialog', undefined, 'news-member-dialog'); dialog.id = 'newsMembershipDialog'; dialog.setAttribute('aria-labelledby', 'newsMembershipTitle');
      const header = node('header'); header.append(node('span', 'YOUR RESEARCH WORKSPACE', 'news-member-kicker'));
      const dismiss = node('button', '×', 'news-member-close'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Close research workspace'); dismiss.onclick = close; header.append(dismiss);
      const title = node('h2', 'Keep the story. Build your view.'); title.id = 'newsMembershipTitle';
      const intro = node('p', 'Save the original source with your notes and research labels, then return to it across your signed-in web sessions.', 'news-member-intro');
      const article = node('div', undefined, 'news-member-source'); article.id = 'newsMembershipSource';
      const form = node('form'); form.id = 'newsMembershipForm';
      for (const [name, label, type] of [['labels', 'Research labels or symbols', 'input'], ['notes', 'Your research note', 'textarea']]) {
        const l = node('label', label); l.htmlFor = 'newsMember-' + name;
        const field = node(type); field.id = l.htmlFor; field.name = name;
        if (name === 'labels') { field.required = true; field.maxLength = 800; field.placeholder = 'AAPL, US rates, earnings'; }
        else { field.rows = 3; field.maxLength = 1000; field.placeholder = 'What matters, what to watch, and what would change your view.'; }
        field.addEventListener('input', () => { requestId = win.crypto.randomUUID(); }); form.append(l, field);
      }
      form.append(node('p', 'Labels organize your research. They do not subscribe you to a live price feed.', 'news-member-fine'));
      const actions = node('div', undefined, 'news-member-actions'); actions.id = 'newsMembershipActions';
      const message = node('p', '', 'news-member-status'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
      const detail = node('p', 'Headlines, official releases, publisher videos, live pages and podcasts stay free. Publisher subscriptions are separate. Web memberships and App Store purchases are not automatically interchangeable.', 'news-member-fine');
      dialog.append(header, title, intro, article, form, actions, message, detail); doc.body.append(dialog);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
      form.addEventListener('submit', event => { event.preventDefault(); save(); });
    }
    async function connect() {
      if (!servicePromise) servicePromise = (options.services || defaultServices)().then(value => {
        services = value; accountUid = value.getUser()?.uid || null;
        value.onAccountChange?.(user => {
          const next = user?.uid || null;
          if (next === accountUid) return;
          accountUid = next; state = null; version++; pending = false;
          const draft = readDraft(); if (draft?.ownerUid && draft.ownerUid !== next) clearDraft();
          if (dialog?.open) { dialog.querySelector('[name="notes"]').value = ''; dialog.querySelector('[name="labels"]').value = current?.symbols.join(', ') || 'Market news'; requestId = win.crypto.randomUUID(); renderActions('checking'); status('Your account changed. Refresh membership before saving.'); renderActions('error'); }
        }); return value;
      }).catch(error => { servicePromise = null; throw error; });
      return timeout(servicePromise, 'Sign-in services are taking too long. Your source remains free to read.');
    }
    function renderActions(kind) {
      const area = dialog.querySelector('#newsMembershipActions'); area.replaceChildren();
      const link = addLink(area, 'Continue reading free', current?.url || '/news.html', 'news-member-free'); link.target = '_blank'; link.rel = 'noopener noreferrer';
      if (kind === 'checking') return;
      if (kind === 'member') {
        const b = node('button', 'Save to my research', 'news-member-primary'); b.type = 'submit'; b.setAttribute('form', 'newsMembershipForm'); b.disabled = pending; area.prepend(b);
        addLink(area, 'Open saved research', '/pro.html?tool=watchlist#workbench', 'news-member-secondary');
      } else if (kind === 'error') {
        const b = node('button', 'Retry membership check', 'news-member-secondary'); b.type = 'button'; b.onclick = () => refreshStatus(); area.prepend(b);
        addLink(area, 'Open my workspace', '/pro.html?tool=watchlist#workbench', 'news-member-secondary');
      } else {
        const plans = addLink(area, 'Explore Essential · $5.99/month', PLANS_URL, 'news-member-primary'); plans.onclick = () => remember(!accountUid);
        if (kind === 'guest') { const login = addLink(area, 'Already a member? Sign in', '/auth/login.html?returnTo=' + encodeURIComponent(draftPath() + '?resumeResearch=1'), 'news-member-secondary'); login.onclick = () => remember(true); }
        else addLink(area, 'Manage an existing membership', '/pro.html?tool=watchlist#plans', 'news-member-secondary');
      }
    }
    async function refreshStatus() {
      if (!dialog?.open) return null;
      const run = ++version; state = null; renderActions('checking'); status('Checking your web membership…');
      try {
        const svc = await connect(); if (run !== version) return null;
        const user = svc.getUser(); accountUid = user?.uid || null;
        if (!user || user.isAnonymous) { renderActions('guest'); status('Reading is free. Essential includes research saves, Journal intelligence and export, and risk-planning tools. Billed monthly in USD until canceled.'); return null; }
        const draft = readDraft();
        if (draft?.ownerUid && draft.ownerUid !== user.uid) { clearDraft(); dialog.querySelector('[name="notes"]').value = ''; dialog.querySelector('[name="labels"]').value = current?.symbols.join(', ') || 'Market news'; }
        if (draft && !draft.ownerUid && draft.claimOnSignIn) { draft.ownerUid = user.uid; draft.claimOnSignIn = false; try { win.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {} }
        const result = await timeout(svc.call({ action: 'status', accountUid: user.uid }), 'Membership verification is taking too long. Please retry; public coverage remains available.');
        if (run !== version || svc.getUser()?.uid !== user.uid) return null;
        state = result;
        if (result.features?.researchNotesVersion !== 1) throw Error('Research saving is being updated. Open your existing workspace or retry shortly; public coverage remains free.');
        if (result.billingUnavailable) throw Error('Membership verification is temporarily unavailable. You can still manage billing in your workspace.');
        renderActions(entitled(result) ? 'member' : 'free');
        status(entitled(result) ? result.plans[result.tier].name + ' includes this research save. Your plan allows ' + result.plans[result.tier].saved + ' saved workspaces.' : 'Add Essential for research saves and the six advanced tools. $5.99/month in USD until canceled; public coverage stays free.');
        return result;
      } catch (error) { if (run === version) { renderActions('error'); status(error.message || 'Unable to verify membership. Please retry.'); } return null; }
    }
    async function save() {
      if (pending || !dialog.querySelector('form').reportValidity()) return;
      if (!entitled(state) || !services?.getUser() || services.getUser().uid !== accountUid) { await refreshStatus(); return; }
      const uid = accountUid, run = version;
      try {
        const payload = saveRequest(current, dialog.querySelector('[name="labels"]').value, dialog.querySelector('[name="notes"]').value, uid, requestId);
        pending = true; remember(); renderActions('member'); status('Saving to your account…');
        const result = await timeout(services.call(payload), 'The save could not be confirmed yet. Check your saved workspace, or retry this unchanged note safely.');
        if (run !== version || services.getUser()?.uid !== uid) return;
        if (!result.saved) throw Error('The server did not confirm this save.');
        clearDraft(); renderActions('checking'); addLink(dialog.querySelector('#newsMembershipActions'), 'View saved research', '/pro.html?tool=watchlist#workbench', 'news-member-primary'); status('Saved to your account. The original source and your note are together in Research watchlists.');
      } catch (error) { if (run === version) { pending = false; if (/permission-denied|unauthenticated/.test(error.code || '')) { state = null; renderActions('error'); } else renderActions('member'); status(error.message || 'Unable to save. Your note is still here.'); } }
      finally { if (run === version) pending = false; }
    }
    async function saveResearch(input, draft) {
      build(); trigger = doc.activeElement; current = normalizeArticle(input); requestId = draft?.requestId || win.crypto.randomUUID(); state = null; pending = false;
      const source = dialog.querySelector('#newsMembershipSource'); source.replaceChildren(node('strong', current.title), node('span', current.source + (current.publishedAt ? ' · ' + new Date(current.publishedAt).toLocaleDateString() : '')));
      dialog.querySelector('[name="labels"]').value = draft?.labels || current.symbols.join(', ') || 'Market news';
      dialog.querySelector('[name="notes"]').value = draft?.notes || '';
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.news-member-close').focus();
      return refreshStatus();
    }
    function openPlans() { if (current) remember(!accountUid); win.location.assign(PLANS_URL); }
    function resume() {
      if (new URLSearchParams(win.location.search).get('resumeResearch') !== '1') return;
      const draft = readDraft(); if (!draft) return;
      connect().then(svc => {
        const uid = svc.getUser()?.uid;
        if (draft.ownerUid && draft.ownerUid !== uid) { clearDraft(); return; }
        if (!draft.ownerUid && !draft.claimOnSignIn) return;
        saveResearch(draft.article, draft);
      }).catch(() => {});
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', resume, { once: true }); else resume();
    return { saveResearch, openPlans, refreshStatus };
  }
  return { create, normalizeArticle, saveRequest, entitled, DRAFT_KEY };
});
