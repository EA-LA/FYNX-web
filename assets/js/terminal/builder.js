/* FYNX Builder, Phase 1. Private projects, sandboxed preview, install on this terminal only.
 * Loaded before terminal/app.js so the plugin is registered without delaying the desk scripts. */
(function () {
  'use strict';
  const Core = window.FynxBuilderCore;
  if (!Core) return;
  window.FynxBuilderKey = true;

  const state = {uid: null, projects: [], installs: [], status: 'loading', error: '', ready: false};
  const listeners = new Set();
  const frames = new Set();
  let dbApi = null;
  let stopWatch = null;

  function emit() { listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }
  const byId = id => state.projects.find(project => project.id === id) || null;

  function projectView(id, data) {
    return {
      id,
      name: String(data.name || 'Untitled'),
      description: String(data.description || ''),
      category: String(data.category || ''),
      version: Number(data.version) || 1,
      visibility: 'private',
      main: String(data.main || ''),
      updatedAt: Number(data.updatedAt) || 0,
      versions: Array.isArray(data.versions) ? data.versions.slice(-Core.LIMITS.versions) : []
    };
  }

  function registerInstalls(T) {
    for (const key of Object.keys(T.PANELS)) {
      if (!key.startsWith('mine-')) continue;
      delete T.PANELS[key];
      delete T.RENDER[key];
      delete T.PANEL_DESC[key];
    }
    const ids = [];
    for (const widget of state.installs) {
      if (!widget.enabled) continue;
      const project = byId(widget.projectId);
      if (!project) continue;
      ids.push(widget.slot);
      T.PANELS[widget.slot] = ['MINE', project.name.slice(0, 28), ''];
      T.PANEL_DESC[widget.slot] = 'Private tool · ' + project.name;
      const projectId = widget.projectId;
      T.RENDER[widget.slot] = () => {
        const live = byId(projectId);
        if (!live) return;
        const host = T.panel(widget.slot);
        if (!host) return;
        mount(host, live.main, T.S && T.S.quotes, {title: live.name});
      };
    }
    const groups = T.EXTRA_GROUPS;
    const at = groups.findIndex(group => group[0] === 'Built by you');
    if (at >= 0) groups.splice(at, 1);
    if (ids.length) groups.push(['Built by you', ids]);
  }

  function stopAllFrames() {
    for (const frame of [...frames]) {
      try { frame._fxbStop?.(); } catch (e) {}
    }
  }

  function clearInstalls(T) {
    if (!T || !T.PANELS) return;
    for (const key of Object.keys(T.PANELS)) {
      if (!key.startsWith('mine-')) continue;
      delete T.PANELS[key];
      delete T.RENDER[key];
      delete T.PANEL_DESC[key];
    }
    const at = T.EXTRA_GROUPS.findIndex(group => group[0] === 'Built by you');
    if (at >= 0) T.EXTRA_GROUPS.splice(at, 1);
  }

  async function connect() {
    if (dbApi) return dbApi;
    const [{app, auth}, firestore, authApi] = await Promise.all([
      import('/auth/firebase.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')
    ]);
    dbApi = {app, auth, firestore, onAuthStateChanged: authApi.onAuthStateChanged};
    return dbApi;
  }

  function watch(T) {
    connect().then(api => {
      stopWatch = api.onAuthStateChanged(api.auth, user => {
        const switching = state.ready;
        stopAllFrames();
        clearInstalls(T);
        if (switching && T.buildGrid) { try { T.buildGrid(); T.renderAll(); } catch (e) {} }
        state.uid = user ? user.uid : null;
        state.projects = [];
        state.installs = [];
        state.error = '';
        if (!user) { state.status = 'signed-out'; state.ready = true; emit(); return; }
        state.status = 'loading';
        emit();
        const db = api.firestore.getFirestore(api.app);
        const projects = api.firestore.collection(db, 'users', user.uid, 'builderProjects');
        const installs = api.firestore.doc(db, 'users', user.uid, 'builderInstalls', 'current');
        Promise.all([api.firestore.getDocs(projects), api.firestore.getDoc(installs)]).then(([projectSnap, installSnap]) => {
          if (api.auth.currentUser?.uid !== user.uid) return;
          const rows = projectSnap.docs.map(row => ({id: row.id, ...row.data()}));
          const widgets = installSnap.exists() ? installSnap.data().widgets : [];
          const view = Core.accountView(user.uid, rows, widgets);
          state.projects = view.projects.sort((a, b) => b.updatedAt - a.updatedAt);
          state.installs = view.installs;
          state.status = 'ready';
          state.ready = true;
          registerInstalls(T);
          if (state.installs.length && !T.PG?.isOpen()) { T.buildGrid(); T.renderAll(); }
          emit();
        }).catch(error => {
          state.status = 'error';
          state.ready = true;
          state.error = error && error.code === 'permission-denied'
            ? 'Your account refused builder storage. The builder security rules need to be deployed before projects can be saved.'
            : 'Builder storage is unavailable. Nothing was saved.';
          emit();
        });
      });
    }).catch(() => {
      state.status = 'error';
      state.ready = true;
      state.error = 'Builder storage could not be loaded.';
      emit();
    });
  }

  function snapshot(T) { return Core.snapshotQuotes(T.S && T.S.quotes); }

  function sweepFrames() {
    for (const frame of [...frames]) {
      if (!frame.isConnected) frame._fxbStop?.();
    }
  }

  function mount(host, code, quotes, hooks) {
    hooks = hooks || {};
    host._fxbStop?.();
    host._fxbStop = null;
    sweepFrames();
    host.replaceChildren();
    const checked = Core.validateProject({name: 'Preview', description: 'Preview of a financial widget.', category: 'research', main: code});
    const structural = checked.errors.filter(error => !error.startsWith('Name') && !error.startsWith('Add a short') && !error.startsWith('Choose'));
    if (structural.length) {
      hooks.onError?.(structural[0]);
      host.append(Object.assign(document.createElement('p'), {className: 'fx-empty', textContent: structural[0]}));
      return () => {};
    }
    const frame = document.createElement('iframe');
    const token = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
    frame.dataset.fxb = '1';
    frame.dataset.token = token;
    frame.setAttribute('sandbox', Core.SANDBOX_ATTR);
    frame.setAttribute('csp', Core.SANDBOX_CSP);
    frame.setAttribute('allow', '');
    frame.referrerPolicy = 'no-referrer';
    frame.title = hooks.title || 'FYNX widget preview';
    frame.srcdoc = Core.SANDBOX_HTML;
    host.append(frame);
    frames.add(frame);
    let settled = false;
    let stop = function () {};
    const timer = setTimeout(() => {
      if (settled) return;
      hooks.onError?.('Stopped. The widget did not finish within 8 seconds.');
      stop();
    }, 8000);
    function finish() { if (settled) return; settled = true; clearTimeout(timer); }
    let readySeen = false;
    let initialLoadSeen = false;
    function onMessage(event) {
      if (event.source !== frame.contentWindow || !event.data || typeof event.data !== 'object') return;
      if (event.origin !== 'null') { hooks.onError?.('Stopped. The sandbox origin check failed.'); stop(); return; }
      if (event.data.type === 'fynx-ready') {
        if (readySeen) { hooks.onError?.('Stopped. The widget tried to leave the sandbox.'); stop(); return; }
        readySeen = true;
        try { frame.contentWindow.postMessage({type: 'fynx-run', token, code, quotes: Core.snapshotQuotes(quotes)}, '*'); }
        catch (error) { finish(); hooks.onError?.(String(error.message || 'The widget failed.').slice(0, 500)); }
        return;
      }
      if (event.data.type === 'fynx-error' && event.data.token === token) { finish(); hooks.onError?.(String(event.data.message || 'The widget failed.').slice(0, 500)); }
      if (event.data.type === 'fynx-done' && event.data.token === token) { finish(); hooks.onDone?.(); }
    }
    stop = function () {
      finish();
      window.removeEventListener('message', onMessage);
      frames.delete(frame);
      frame._fxbStop = null;
      frame.remove();
      if (host._fxbStop === stop) host._fxbStop = null;
    };
    frame._fxbStop = stop;
    host._fxbStop = stop;
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', () => {
      if (!readySeen) return;
      if (!initialLoadSeen) { initialLoadSeen = true; return; }
      hooks.onError?.('Stopped. The widget tried to leave the sandbox.');
      stop();
    });
    return stop;
  }

  setInterval(() => {
    if (!frames.size || !window.FynxTerminalCore) return;
    const quotes = snapshot(window.FynxTerminalCore);
    frames.forEach(frame => {
      if (!frame.isConnected || !frame.contentWindow) { frame._fxbStop?.(); return; }
      try { frame.contentWindow.postMessage({type: 'fynx-quotes', token: frame.dataset.token || '', quotes}, '*'); } catch (e) {}
    });
  }, 30000);

  window.FynxBuilderMount = mount;
  window.FynxBuilderSweep = sweepFrames;
  window.FynxBuilderStop = stopAllFrames;

  (window.FynxTerminalPlugins = window.FynxTerminalPlugins || []).push((T, PG) => {
    window.FynxTerminalCore = T;
    if (!PG || !PG.add) return;
    watch(T);
    const button = document.getElementById('fx-build');
    if (button) button.addEventListener('click', () => T.openPage('builder'));

    PG.add('builder', 'Builder', host => {
      PG.setHead('BUILD', 'FYNX Builder', 'Create. Code. Test. Your terminal, your tool.');
      const root = document.createElement('div');
      root.className = 'fxb';
      host.append(root);
      let currentId = state.projects[0]?.id || null;
      let draft = null;
      let stopPreview = () => {};
      let consoleText = '';

      const draftOf = project => ({
        id: project?.id || null,
        name: project?.name || 'Global Market Intelligence',
        description: project?.description || 'A private snapshot dashboard for the S&P 500, gold, and the dollar index.',
        category: project?.category || 'macro',
        main: project?.main || Core.TEMPLATE,
        version: project?.version || 1,
        versions: project?.versions || []
      });
      if (!draft) draft = draftOf(byId(currentId));

      function say(text) {
        consoleText = text;
        const log = root.querySelector('.fxb-log');
        if (log) log.textContent = text;
      }
      function selected() { return draft; }

      async function persist() {
        const check = Core.validateProject(draft);
        if (!check.ok) { say(check.errors[0]); return; }
        if (!state.uid || !dbApi) { say(state.error || 'Sign in before saving. Nothing was stored.'); return; }
        const id = draft.id || ('p' + crypto.randomUUID().replace(/-/g, '').slice(0, 20));
        if (!/^p[a-z0-9]{8,24}$/.test(id)) { say('Project id is not valid. Nothing was stored.'); return; }
        if (!draft.id && state.projects.length >= Core.LIMITS.projects) { say('You can save up to ' + Core.LIMITS.projects + ' private projects.'); return; }
        const api = dbApi;
        const prior = byId(id);
        const next = Core.withVersion(prior, check.project);
        next.authorUid = state.uid;
        next.updatedAt = Date.now();
        try {
          await api.firestore.setDoc(api.firestore.doc(api.firestore.getFirestore(api.app), 'users', state.uid, 'builderProjects', id), next);
          const view = projectView(id, next);
          state.projects = [view, ...state.projects.filter(project => project.id !== id)];
          currentId = id;
          draft = draftOf(view);
          say('Saved to your account as version ' + view.version + '. Only you can read it.');
        } catch (error) {
          say(error && error.code === 'permission-denied'
            ? 'Not saved. Deploy the builder security rules, then try again. The project is still only in this editor.'
            : 'Not saved to your account. ' + (error.message || 'Try again.'));
        }
      }

      async function writeInstalls(widgets) {
        const api = await connect();
        if (!state.uid) throw new Error('Sign in before installing.');
        const clean = Core.sanitizeWidgets(widgets);
        await api.firestore.setDoc(api.firestore.doc(api.firestore.getFirestore(api.app), 'users', state.uid, 'builderInstalls', 'current'), {widgets: clean});
        state.installs = clean;
        registerInstalls(T);
      }

      async function install() {
        const check = Core.validateProject(draft);
        if (!check.ok) { say(check.errors[0]); return; }
        if (!draft.id || !byId(draft.id) || byId(draft.id).main !== draft.main) { say('Save the project to your account before installing it.'); return; }
        const slot = Core.slotFor(draft.id);
        const widgets = state.installs.filter(widget => widget.projectId !== draft.id);
        widgets.push({slot, projectId: draft.id, name: draft.name, version: byId(draft.id).version, enabled: true});
        if (widgets.length > Core.LIMITS.widgets) { say('You can install up to ' + Core.LIMITS.widgets + ' private tools.'); return; }
        try {
          await writeInstalls(widgets);
          const key = T.S.sym ? 'sym-' + T.S.sym.cls : T.S.deskKey;
          const placed = Core.placeWidget(T.getSlots(), slot);
          if (!placed) { say('Saved to your tools, but this desk is full. Use Edit, free a box, then add it from Built by you.'); return; }
          T.store.set('layout-' + key, JSON.stringify(placed));
          PG.closeAll();
          T.buildGrid();
          T.renderAll();
          T.say(draft.name + ' is on this desk. Other people cannot see it.');
        } catch (error) {
          say('Not installed. ' + (error.message || 'Your account did not store the installation.'));
        }
      }

      async function uninstall() {
        if (!draft.id) return;
        const slot = Core.slotFor(draft.id);
        try {
          await writeInstalls(state.installs.filter(widget => widget.projectId !== draft.id));
          delete T.PANELS[slot]; delete T.RENDER[slot]; delete T.PANEL_DESC[slot];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('fx-term-layout-')) continue;
            try {
              const slots = JSON.parse(localStorage.getItem(key) || 'null');
              if (Array.isArray(slots) && slots.includes(slot)) localStorage.setItem(key, JSON.stringify(Core.stripWidget(slots, slot)));
            } catch (e) {}
          }
          T.buildGrid(); T.renderAll();
          say('Removed from your terminal. The project is still saved.');
        } catch (error) { say('Could not remove it. ' + (error.message || '')); }
      }

      async function removeProject() {
        if (!draft.id) { draft = draftOf(null); currentId = null; say('Cleared the unsaved draft.'); return; }
        if (!window.confirm('Delete this private project from your account?')) return;
        await uninstall();
        const api = await connect();
        try {
          await api.firestore.deleteDoc(api.firestore.doc(api.firestore.getFirestore(api.app), 'users', state.uid, 'builderProjects', draft.id));
        } catch (error) {
          say('Removed from the terminal, but the account copy is still there. ' + (error.message || 'Try deleting it again.'));
          return;
        }
        state.projects = state.projects.filter(project => project.id !== draft.id);
        currentId = state.projects[0]?.id || null;
        draft = draftOf(byId(currentId));
        say('Project deleted from your account.');
      }

      function run() {
        stopPreview();
        const preview = root.querySelector('[data-fxb-preview]');
        const check = Core.validateProject({...draft, description: draft.description || 'Preview of a financial widget.', name: draft.name || 'Preview'});
        const blocking = check.errors.find(error => error.includes('credential') || error.includes('secret') || error.includes('access key') || error.includes('empty') || error.includes('define function') || error.includes('limited'));
        if (blocking) { say(blocking); return; }
        if (!preview) return;
        say('Running in the sandbox…');
        stopPreview = mount(preview, draft.main, snapshot(T), {
          title: draft.name,
          onError: message => say(message),
          onDone: () => say('Running in the sandbox. Network access is blocked.')
        }) || (() => {});
      }

      function paint() {
        stopPreview();
        const project = selected();
        const installed = project.id && state.installs.some(widget => widget.projectId === project.id && widget.enabled);
        root.replaceChildren();
        const bar = el('div', 'fxb-bar');
        bar.append(el('strong', '', 'FYNX BUILDER'));
        bar.append(el('span', '', state.status === 'ready' ? 'Private to your account' : state.error || 'Loading your projects…'));
        const tools = el('div', 'fxb-tools');
        [['Run', run], ['Stop', () => { stopPreview(); say('Stopped.'); }], ['Save', persist], [installed ? 'Remove from terminal' : 'Add to my terminal', installed ? uninstall : install]].forEach(([label, action]) => {
          tools.append(buttonEl(label, label === 'Add to my terminal' || label === 'Run' ? 'on' : '', action));
        });
        bar.append(tools);
        root.append(bar);

        const body = el('div', 'fxb-body');
        const side = el('aside', 'fxb-side');
        side.append(el('h2', '', 'Projects'));
        side.append(buttonEl('New project', '', () => { currentId = null; draft = draftOf(null); consoleText = 'Unsaved project. Save it to your account before installing.'; paint(); }));
        if (!state.projects.length) side.append(el('p', 'fxb-note', state.status === 'error' ? state.error : 'No saved projects yet.'));
        state.projects.slice(0, Core.LIMITS.projects).forEach(item => {
          const b = buttonEl(item.name, item.id === project.id ? 'on' : '', () => { currentId = item.id; draft = draftOf(item); consoleText = ''; paint(); });
          b.append(el('small', '', 'v' + item.version + ' · private'));
          side.append(b);
        });
        body.append(side);

        const editor = el('section', 'fxb-editor');
        const fileBar = el('div', 'fxb-filebar');
        fileBar.append(el('span', '', 'main.js'));
        fileBar.append(el('span', 'fxb-note', 'Line ' + (project.main.split('\n').length)));
        editor.append(fileBar);
        const area = document.createElement('textarea');
        area.className = 'fxb-code';
        area.spellcheck = false;
        area.autocomplete = 'off';
        area.setAttribute('aria-label', 'Project source, main.js');
        area.value = project.main;
        area.addEventListener('input', () => { draft.main = area.value; });
        area.addEventListener('keydown', event => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); draft.main = area.value; run(); }
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); draft.main = area.value; persist(); }
        });
        editor.append(area);
        const find = el('div', 'fxb-find');
        const findInput = document.createElement('input');
        findInput.type = 'search';
        findInput.placeholder = 'Find in main.js';
        findInput.setAttribute('aria-label', 'Find in main.js');
        find.append(findInput);
        find.append(buttonEl('Find', '', () => {
          const at = area.value.toLowerCase().indexOf(findInput.value.toLowerCase());
          if (at < 0 || !findInput.value) { say('No match.'); return; }
          area.focus(); area.setSelectionRange(at, at + findInput.value.length);
        }));
        editor.append(find);
        body.append(editor);

        const preview = el('section', 'fxb-preview');
        preview.append(el('h2', '', 'Preview'));
        const screen = el('div', 'fxb-screen');
        screen.dataset.fxbPreview = '1';
        screen.setAttribute('data-fxb-preview', '');
        preview.append(screen);
        const log = el('p', 'fxb-log', consoleText || 'Run checks syntax inside the sandbox. Ctrl or Cmd + Enter also runs.');
        preview.append(log);
        body.append(preview);
        root.append(body);

        const settings = el('section', 'fxb-settings');
        settings.append(field('Name', 'text', project.name, value => { draft.name = value; }));
        settings.append(field('Description', 'text', project.description, value => { draft.description = value; }));
        const category = document.createElement('label');
        category.append(el('span', '', 'Category'));
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Finance category');
        Core.CATEGORIES.forEach(([id, label]) => {
          const option = document.createElement('option');
          option.value = id; option.textContent = label; option.selected = id === project.category;
          select.append(option);
        });
        select.addEventListener('change', () => { draft.category = select.value; });
        category.append(select);
        settings.append(category);
        settings.append(el('p', 'fxb-note', 'Visibility is private. Community Library, official submission, and external API credentials are not part of this release. Widgets cannot make network requests.'));
        const versions = el('div', 'fxb-versions');
        (project.versions || []).slice().reverse().forEach(version => {
          versions.append(buttonEl('Restore v' + version.version, '', () => { draft.main = String(version.main || ''); say('Restored version ' + version.version + ' into the editor. Save to keep it.'); paint(); }));
        });
        settings.append(versions);
        settings.append(buttonEl('Duplicate', '', () => {
          currentId = null;
          draft = {...draft, id: null, name: (draft.name + ' copy').slice(0, 80), version: 1, versions: []};
          say('Duplicated into an unsaved project.'); paint();
        }));
        settings.append(buttonEl('Delete project', 'danger', removeProject));
        root.append(settings);

        const assist = el('section', 'fxb-assist');
        assist.append(el('h2', '', 'Builder assistant'));
        assist.append(el('p', '', 'No AI provider is connected here. Copy this prompt into ChatGPT or Claude, then paste the JavaScript it returns into main.js.'));
        const prompt = document.createElement('textarea');
        prompt.readOnly = true;
        prompt.value = Core.ASSISTANT_PROMPT;
        prompt.setAttribute('aria-label', 'Prompt for an external coding assistant');
        assist.append(prompt);
        assist.append(buttonEl('Copy prompt', '', async () => {
          try { await navigator.clipboard.writeText(Core.ASSISTANT_PROMPT); say('Prompt copied.'); }
          catch (e) { prompt.focus(); prompt.select(); say('Select the prompt and copy it manually.'); }
        }));
        root.append(assist);
      }

      function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text) node.textContent = text;
        return node;
      }
      function buttonEl(text, cls, action) {
        const node = el('button', 'fxb-btn' + (cls ? ' ' + cls : ''), text);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
      }
      function field(label, type, value, onInput) {
        const wrap = document.createElement('label');
        wrap.append(el('span', '', label));
        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        input.maxLength = label === 'Name' ? Core.LIMITS.name : Core.LIMITS.description;
        input.setAttribute('aria-label', label);
        input.addEventListener('input', () => onInput(input.value));
        wrap.append(input);
        return wrap;
      }

      paint();
    });
    window.FynxBuilderReady = true;
  });
})();
