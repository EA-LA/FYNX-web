/* FYNX Builder, Phase 1. Private projects, sandboxed preview, install on this terminal only.
 * Loaded before terminal/app.js so the plugin is registered without delaying the desk scripts. */
(function () {
  'use strict';
  const Core = window.FynxBuilderCore;
  if (!Core) return;
  window.FynxBuilderKey = true;

  const state = {uid: null, projects: [], installs: [], draft: null, status: 'loading', error: '', ready: false};
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

  const LOCAL_PREFIX = 'fx-term-builder-v1:';
  let captureDraft = () => null;

  function localKey(uid) { return LOCAL_PREFIX + uid; }

  function draftRecord(draft) {
    if (!draft || typeof draft !== 'object') return null;
    const main = String(draft.main || '');
    if (!main.trim() || main.length > Core.LIMITS.code) return null;
    const category = Core.CATEGORIES.some(([id]) => id === draft.category) ? draft.category : 'macro';
    return {
      id: typeof draft.id === 'string' && /^p[a-z0-9]{8,24}$/.test(draft.id) ? draft.id : null,
      name: Core.cleanText(draft.name, Core.LIMITS.name) || 'Global Market Intelligence',
      description: Core.cleanText(draft.description, Core.LIMITS.description),
      category,
      main,
      version: Number(draft.version) || 1,
      versions: Array.isArray(draft.versions) ? draft.versions.slice(-Core.LIMITS.versions) : []
    };
  }

  function readDevice(uid) {
    if (!uid) return null;
    try {
      const raw = JSON.parse(localStorage.getItem(localKey(uid)) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      const merged = Core.mergeAccount(Array.isArray(raw.projects) ? raw.projects : [], {projects: [], installs: []});
      const accountInstalls = Core.sanitizeWidgets(raw.installs).map(widget => ({...widget, deviceOnly: false}));
      const deviceInstalls = Core.sanitizeWidgets(raw.deviceInstalls).map(widget => ({...widget, deviceOnly: true}));
      const seen = new Set(accountInstalls.map(widget => widget.projectId));
      return {
        projects: merged.projects,
        installs: accountInstalls.concat(deviceInstalls.filter(widget => !seen.has(widget.projectId))).slice(0, Core.LIMITS.widgets),
        draft: draftRecord(raw.draft)
      };
    } catch (e) {
      return null;
    }
  }

  function writeDevice(uid) {
    if (!uid || uid !== state.uid) return false;
    try {
      const projects = state.projects.slice(0, Core.LIMITS.projects).map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        category: project.category,
        visibility: 'private',
        version: Number(project.version) || 1,
        main: project.main,
        updatedAt: Number(project.updatedAt) || 0,
        versions: Array.isArray(project.versions) ? project.versions.slice(-Core.LIMITS.versions) : [],
        authorUid: uid,
        stored: project.stored === 'account' ? 'account' : 'device'
      }));
      const installs = Core.sanitizeWidgets(state.installs.filter(widget => !widget.deviceOnly));
      const deviceInstalls = Core.sanitizeWidgets(state.installs.filter(widget => widget.deviceOnly));
      const draft = draftRecord(captureDraft());
      localStorage.setItem(localKey(uid), JSON.stringify({projects, installs, deviceInstalls, draft}));
      return true;
    } catch (e) {
      return false;
    }
  }

  function watch(T) {
    connect().then(api => {
      stopWatch = api.onAuthStateChanged(api.auth, user => {
        const nextUid = user ? user.uid : null;
        if (state.uid && state.uid !== nextUid) writeDevice(state.uid);
        const switching = state.ready;
        stopAllFrames();
        clearInstalls(T);
        if (switching && T.buildGrid) { try { T.buildGrid(); T.renderAll(); } catch (e) {} }
        state.uid = nextUid;
        state.projects = [];
        state.installs = [];
        state.draft = null;
        state.error = '';
        if (!user) {
          state.status = 'signed-out';
          state.ready = true;
          emit();
          return;
        }
        const local = readDevice(user.uid);
        if (local) {
          state.projects = local.projects.map(project => ({...project, authorUid: user.uid, stored: project.stored === 'account' ? 'account' : 'device'}));
          state.installs = local.installs.filter(widget => state.projects.some(project => project.id === widget.projectId));
          state.draft = local.draft;
          state.status = 'device';
          state.ready = true;
          registerInstalls(T);
          if (state.installs.length && !T.PG?.isOpen()) { try { T.buildGrid(); T.renderAll(); } catch (e) {} }
        } else {
          state.status = 'loading';
        }
        emit();
        const db = api.firestore.getFirestore(api.app);
        const projects = api.firestore.collection(db, 'users', user.uid, 'builderProjects');
        const installs = api.firestore.doc(db, 'users', user.uid, 'builderInstalls', 'current');
        Promise.all([api.firestore.getDocs(projects), api.firestore.getDoc(installs)]).then(([projectSnap, installSnap]) => {
          if (api.auth.currentUser?.uid !== user.uid) return;
          const rows = projectSnap.docs.map(row => ({id: row.id, ...row.data()}));
          const widgets = installSnap.exists() ? installSnap.data().widgets : [];
          const view = Core.accountView(user.uid, rows, widgets);
          const merged = Core.mergeAccount(state.projects, view);
          state.projects = merged.projects.map(project => ({
            ...project,
            authorUid: user.uid,
            stored: project.stored === 'device' ? 'device' : 'account'
          }));
          const serverInstalls = merged.installs.map(widget => ({...widget, deviceOnly: false}));
          const serverIds = new Set(serverInstalls.map(widget => widget.projectId));
          const kept = state.installs.filter(widget => widget.deviceOnly && !serverIds.has(widget.projectId) && state.projects.some(project => project.id === widget.projectId));
          state.installs = serverInstalls.concat(kept).slice(0, Core.LIMITS.widgets);
          state.status = 'ready';
          state.error = '';
          state.ready = true;
          writeDevice(user.uid);
          registerInstalls(T);
          if (state.installs.length && !T.PG?.isOpen()) { try { T.buildGrid(); T.renderAll(); } catch (e) {} }
          emit();
        }).catch(error => {
          if (api.auth.currentUser?.uid !== user.uid) return;
          state.ready = true;
          const denied = error && error.code === 'permission-denied';
          state.error = denied
            ? 'Your account refused builder storage. This browser can keep a copy until the builder security rules are deployed.'
            : 'Account storage is unavailable. This browser can keep a copy.';
          state.status = (state.projects.length || state.draft) ? 'device' : 'error';
          if (!state.projects.length && !state.draft) state.status = 'error';
          registerInstalls(T);
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
    let pageListener = null;

    PG.add('builder', 'Builder', host => {
      PG.setHead('BUILD', 'FYNX Builder', 'Create. Code. Test. Your terminal, your tool.');
      const root = document.createElement('div');
      root.className = 'fxb';
      host.append(root);
      try {
        const panes = JSON.parse(localStorage.getItem('fx-term-builder-panes') || 'null');
        if (panes && Number(panes.side) >= 180) root.style.setProperty('--fxb-side', Math.min(520, Number(panes.side)) + 'px');
        if (panes && Number(panes.preview) >= 220) root.style.setProperty('--fxb-preview', Math.min(640, Number(panes.preview)) + 'px');
      } catch (e) {}

      let currentId = null;
      let draft = null;
      let stopPreview = () => {};
      let consoleText = 'Ctrl/Cmd+Enter runs. Ctrl/Cmd+S saves. Ctrl/Cmd+F finds. Ctrl/Cmd+H replaces.';
      let consoleLevel = '';
      let dirty = false;
      let cm = null;
      let projectQuery = '';
      let seenUid = state.uid;
      let draftTimer = 0;

      const draftOf = project => ({
        id: project?.id || null,
        name: project?.name || 'Global Market Intelligence',
        description: project?.description || 'A private snapshot dashboard for the S&P 500, gold, and the dollar index.',
        category: project?.category || 'macro',
        main: project?.main || Core.TEMPLATE,
        version: project?.version || 1,
        versions: (project?.versions || []).map(version => ({version: version.version, savedAt: version.savedAt || 0, main: version.main}))
      });
      const applyRecord = record => {
        const next = draftOf(null);
        if (!record) return next;
        next.id = record.id || null;
        next.name = record.name || next.name;
        next.description = record.description || next.description;
        next.category = record.category || next.category;
        next.main = record.main || next.main;
        next.version = record.version || 1;
        next.versions = Array.isArray(record.versions) ? record.versions : [];
        return next;
      };
      if (state.draft && state.draft.main) {
        draft = applyRecord(state.draft);
        currentId = draft.id;
      } else if (state.projects[0]) {
        currentId = state.projects[0].id;
        draft = draftOf(state.projects[0]);
      } else draft = draftOf(null);
      captureDraft = () => draft;

      function say(text, level) {
        consoleText = text;
        consoleLevel = level || '';
        const log = root.querySelector('[data-fxb-console]');
        if (!log) return;
        log.textContent = text;
        log.className = 'fxb-console' + (level === 'error' ? ' error' : level === 'ok' ? ' ok' : '');
      }
      function setSaveLabel(text, kind) {
        const node = root.querySelector('[data-fxb-save]');
        if (!node) return;
        node.textContent = text;
        node.className = 'fxb-save' + (kind ? ' ' + kind : '');
      }
      function statusText() {
        if (state.status === 'signed-out') return 'Sign in to save to your account';
        if (state.status === 'loading') return 'Loading your projects…';
        if (state.status === 'device') return state.error || 'This browser has a local copy. Account storage is not confirmed.';
        if (state.status === 'error') return state.error || 'Builder storage is unavailable.';
        return 'Private to your account';
      }
      function markDirty() {
        dirty = true;
        scheduleDraft();
        setSaveLabel('Unsaved', 'warn');
      }
      function scheduleDraft() {
        const uid = state.uid;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => { if (state.uid === uid) writeDevice(uid); }, 250);
      }
      function syncCode() {
        if (cm) draft.main = cm.getValue();
        else {
          const area = root.querySelector('textarea.fxb-code');
          if (area) draft.main = area.value;
        }
      }
      function installedNow() {
        return !!(draft.id && state.installs.some(widget => widget.projectId === draft.id && widget.enabled));
      }
      function updateInstallButton() {
        const button = root.querySelector('[data-fxb-install]');
        if (!button) return;
        const installed = installedNow();
        button.textContent = installed ? 'Remove from terminal' : 'Add to my terminal';
        button.classList.toggle('on', !installed);
      }
      function updateStatus() {
        const node = root.querySelector('[data-fxb-status]');
        if (node) node.textContent = statusText();
        updateInstallButton();
      }
      function updateLines() {
        const badge = root.querySelector('[data-fxb-lines]');
        if (!badge) return;
        if (cm) {
          const pos = cm.getCursor();
          badge.textContent = 'Ln ' + (pos.line + 1) + ', Col ' + (pos.ch + 1);
        } else badge.textContent = 'Ln ' + String(draft.main || '').split('\n').length;
      }
      function mountEditor(code) {
        const editorHost = root.querySelector('[data-fxb-editor-host]');
        if (!editorHost) return;
        editorHost.replaceChildren();
        cm = null;
        if (!window.CodeMirror) {
          const area = document.createElement('textarea');
          area.className = 'fxb-code';
          area.spellcheck = false;
          area.autocomplete = 'off';
          area.setAttribute('aria-label', 'Project source, main.js');
          area.value = code;
          area.addEventListener('input', () => { draft.main = area.value; markDirty(); updateLines(); });
          editorHost.append(area);
          return;
        }
        cm = window.CodeMirror(editorHost, {
          value: code,
          mode: 'javascript',
          theme: 'fynx',
          lineNumbers: true,
          indentUnit: 2,
          smartIndent: true,
          tabSize: 2,
          indentWithTabs: false,
          matchBrackets: true,
          autoCloseBrackets: true,
          undoDepth: 200,
          extraKeys: {
            Tab: editor => {
              if (editor.somethingSelected()) editor.indentSelection('add');
              else editor.replaceSelection('  ', 'end');
            },
            'Shift-Tab': editor => editor.indentSelection('subtract')
          }
        });
        const input = cm.getInputField();
        input.spellcheck = false;
        input.autocomplete = 'off';
        input.setAttribute('aria-label', 'Project source, main.js');
        cm.on('change', () => { draft.main = cm.getValue(); markDirty(); updateLines(); });
        cm.on('cursorActivity', updateLines);
        requestAnimationFrame(() => { if (cm) cm.refresh(); });
      }
      function previewNote(text, bad) {
        const note = root.querySelector('[data-fxb-preview-note]');
        if (!note) return;
        note.textContent = text || '';
        note.className = 'fxb-note' + (bad ? ' bad' : '');
      }
      function showPreviewMessage(text) {
        const preview = root.querySelector('[data-fxb-preview]');
        if (!preview) return;
        stopPreview();
        preview.replaceChildren();
        const paragraph = document.createElement('p');
        paragraph.className = 'fxb-error';
        paragraph.textContent = text;
        preview.append(paragraph);
      }
      function bindSplit(handle, variable, fallback, invert, min, max) {
        if (!handle) return;
        handle.addEventListener('pointerdown', event => {
          if (window.matchMedia('(max-width: 1100px)').matches) return;
          event.preventDefault();
          try { handle.setPointerCapture(event.pointerId); } catch (e) {}
          const startX = event.clientX;
          const current = parseInt(root.style.getPropertyValue(variable), 10) || fallback;
          function move(ev) {
            const dx = ev.clientX - startX;
            const next = Math.max(min, Math.min(max, current + (invert ? -dx : dx)));
            root.style.setProperty(variable, next + 'px');
          }
          function up(ev) {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            try { handle.releasePointerCapture(ev.pointerId); } catch (e) {}
            if (cm) cm.refresh();
            try {
              const side = parseInt(root.style.getPropertyValue('--fxb-side'), 10) || 248;
              const preview = parseInt(root.style.getPropertyValue('--fxb-preview'), 10) || 340;
              localStorage.setItem('fx-term-builder-panes', JSON.stringify({side, preview}));
            } catch (e) {}
          }
          handle.addEventListener('pointermove', move);
          handle.addEventListener('pointerup', up);
        });
      }

      async function writeAccountInstalls(widgets) {
        const api = await connect();
        if (!state.uid) throw new Error('Sign in before installing.');
        const clean = Core.sanitizeWidgets(widgets);
        await api.firestore.setDoc(api.firestore.doc(api.firestore.getFirestore(api.app), 'users', state.uid, 'builderInstalls', 'current'), {widgets: clean});
        return clean;
      }

      async function persist() {
        syncCode();
        const check = Core.validateProject(draft);
        if (!check.ok) { say(check.errors[0], 'error'); setSaveLabel('Not saved', 'warn'); return; }
        if (!state.uid) { say('Sign in before saving. Nothing was stored.', 'error'); setSaveLabel('Not saved', 'warn'); return; }
        const id = draft.id || ('p' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).replace(/-/g, '').slice(0, 20));
        if (!/^p[a-z0-9]{8,24}$/.test(id)) { say('Project id is not valid. Nothing was stored.', 'error'); return; }
        if (!draft.id && state.projects.length >= Core.LIMITS.projects) { say('You can save up to ' + Core.LIMITS.projects + ' private projects.', 'error'); return; }
        const prior = byId(id);
        const next = Core.withVersion(prior, check.project);
        next.updatedAt = Date.now();
        const view = {
          id,
          name: next.name,
          description: next.description,
          category: next.category,
          version: next.version,
          visibility: 'private',
          main: next.main,
          updatedAt: next.updatedAt,
          versions: next.versions,
          stored: 'device',
          authorUid: state.uid
        };
        state.projects = [view, ...state.projects.filter(project => project.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt);
        draft.id = id;
        draft.version = view.version;
        draft.versions = view.versions.map(version => ({...version}));
        draft.name = view.name;
        draft.description = view.description;
        draft.category = view.category;
        draft.main = view.main;
        currentId = id;
        dirty = false;
        const localOk = writeDevice(state.uid);
        setSaveLabel(localOk ? 'On this browser' : 'Not saved', localOk ? 'warn' : 'warn');
        rebuildList();
        updateInstallButton();
        if (!dbApi) {
          say(localOk ? 'Saved on this browser only. Account storage is not available, so it will not follow you to another device.' : 'Not saved. This browser refused local storage.', localOk ? '' : 'error');
          return;
        }
        try {
          const api = dbApi;
          await api.firestore.setDoc(api.firestore.doc(api.firestore.getFirestore(api.app), 'users', state.uid, 'builderProjects', id), {
            name: next.name,
            description: next.description,
            category: next.category,
            visibility: 'private',
            version: next.version,
            authorUid: state.uid,
            main: next.main,
            updatedAt: next.updatedAt,
            versions: next.versions
          });
          view.stored = 'account';
          state.projects = state.projects.map(project => project.id === id ? {...view} : project);
          writeDevice(state.uid);
          say('Saved to your account as version ' + view.version + '. Only you can read it.', 'ok');
          setSaveLabel('Account · v' + view.version, 'on');
          if (state.installs.some(widget => widget.projectId === id)) registerInstalls(T);
        } catch (error) {
          const denied = error && error.code === 'permission-denied';
          if (!localOk) {
            say('Not saved. The account refused the write and this browser could not keep a copy.', 'error');
            setSaveLabel('Not saved', 'warn');
            return;
          }
          say(denied
            ? 'Not saved to your account. The builder security rules are not deployed, so this copy stays on this browser only.'
            : 'Not saved to your account. ' + (error.message || 'Try again.') + ' A copy remains on this browser.', 'error');
          setSaveLabel('Browser only', 'warn');
        }
      }

      async function install() {
        syncCode();
        const check = Core.validateProject(draft);
        if (!check.ok) { say(check.errors[0], 'error'); return; }
        if (!state.uid) { say('Sign in before installing. Nothing was added.', 'error'); return; }
        const saved = draft.id ? byId(draft.id) : null;
        if (!saved || saved.main !== draft.main || saved.name !== draft.name) { say('Save the project before adding it to your terminal.', 'error'); return; }
        let slot = '';
        try { slot = Core.slotFor(draft.id); }
        catch (error) { say('Project id is not valid. Nothing was installed.', 'error'); return; }
        const widgets = state.installs.filter(widget => widget.projectId !== draft.id);
        if (widgets.length >= Core.LIMITS.widgets) { say('You can install up to ' + Core.LIMITS.widgets + ' private tools.', 'error'); return; }
        let accountOk = false;
        if (saved.stored === 'account' && dbApi) {
          try {
            await writeAccountInstalls(widgets.filter(widget => !widget.deviceOnly).concat([{slot, projectId: draft.id, name: saved.name, version: saved.version, enabled: true}]));
            accountOk = true;
          } catch (error) { accountOk = false; }
        }
        widgets.push({slot, projectId: draft.id, name: saved.name, version: saved.version, enabled: true, deviceOnly: !accountOk});
        state.installs = widgets;
        registerInstalls(T);
        const localOk = writeDevice(state.uid);
        let placed = null;
        try { placed = Core.placeWidget(T.getSlots(), slot); } catch (e) { placed = null; }
        if (!placed) {
          say('Not installed on this desk. The desk is full.' + (accountOk ? ' It is saved in your tools. Use Edit, free a box, then add it from Built by you.' : ''), 'error');
          updateInstallButton();
          return;
        }
        if (!accountOk && !localOk) {
          state.installs = state.installs.filter(widget => widget.projectId !== draft.id);
          registerInstalls(T);
          say('Not installed. Your account refused the installation and this browser could not keep a copy.', 'error');
          updateInstallButton();
          return;
        }
        const layoutKey = T.S && T.S.sym ? 'sym-' + T.S.sym.cls : (T.S && T.S.deskKey);
        if (layoutKey && T.store) T.store.set('layout-' + layoutKey, JSON.stringify(placed));
        try { PG.closeAll(); } catch (e) {}
        try { T.buildGrid(); T.renderAll(); } catch (e) {}
        if (accountOk) T.say(draft.name + ' is on this desk. Other people cannot see it.');
        else T.say('Added to this desk on this browser only. Your account refused the installation, so it will not follow you to another device.');
      }

      async function uninstall(quiet) {
        if (!draft.id) return;
        let slot = '';
        try { slot = Core.slotFor(draft.id); }
        catch (error) { say('Project id is not valid.', 'error'); return; }
        const current = state.installs.find(widget => widget.projectId === draft.id);
        const remaining = state.installs.filter(widget => widget.projectId !== draft.id);
        let accountOk = true;
        if (current && !current.deviceOnly && state.uid && dbApi) {
          try { await writeAccountInstalls(remaining.filter(widget => !widget.deviceOnly)); }
          catch (error) {
            accountOk = false;
            if (!quiet) say('Removed from this desk on this browser. Your account still lists it: ' + (error.message || 'the update was refused.'), 'error');
          }
        }
        state.installs = remaining;
        registerInstalls(T);
        delete T.PANELS[slot];
        delete T.RENDER[slot];
        delete T.PANEL_DESC[slot];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('fx-term-layout-')) continue;
            const slots = JSON.parse(localStorage.getItem(key) || 'null');
            if (Array.isArray(slots) && slots.includes(slot)) localStorage.setItem(key, JSON.stringify(Core.stripWidget(slots, slot)));
          }
        } catch (e) {}
        writeDevice(state.uid);
        try { T.buildGrid(); T.renderAll(); } catch (e) {}
        if (!quiet && accountOk) say(current && !current.deviceOnly ? 'Removed from your terminal. The project is still saved.' : 'Removed from this browser. The project is still saved.', 'ok');
        updateInstallButton();
        rebuildList();
      }

      async function removeProject() {
        syncCode();
        if (!draft.id) {
          currentId = null;
          draft = draftOf(null);
          dirty = false;
          say('Cleared the unsaved draft.', '');
          writeDevice(state.uid);
          paint();
          return;
        }
        if (!window.confirm('Delete this private project from your account and this browser?')) return;
        const id = draft.id;
        const project = byId(id);
        const deviceOnly = !project || project.stored !== 'account';
        if (state.installs.some(widget => widget.projectId === id)) await uninstall(true);
        if (!deviceOnly && state.uid && dbApi) {
          try {
            const api = await connect();
            await api.firestore.deleteDoc(api.firestore.doc(api.firestore.getFirestore(api.app), 'users', state.uid, 'builderProjects', id));
          } catch (error) {
            say('Could not delete it from your account. ' + (error.message || 'It is still saved there.'), 'error');
            paint();
            return;
          }
        }
        state.projects = state.projects.filter(item => item.id !== id);
        writeDevice(state.uid);
        currentId = state.projects[0]?.id || null;
        draft = currentId ? draftOf(byId(currentId)) : draftOf(null);
        dirty = false;
        say(deviceOnly ? 'Deleted from this browser.' : 'Project deleted from your account.', 'ok');
        paint();
      }

      function duplicate() {
        syncCode();
        currentId = null;
        draft = {...draft, id: null, name: (draft.name + ' copy').slice(0, Core.LIMITS.name), version: 1, versions: []};
        dirty = true;
        say('Duplicated into an unsaved project. Save it to keep the copy.', '');
        scheduleDraft();
        paint();
      }

      function run() {
        stopPreview();
        syncCode();
        const syntax = Core.syntaxError(draft.main);
        if (syntax) { say(syntax, 'error'); showPreviewMessage(syntax); previewNote(syntax, true); return; }
        const check = Core.validateProject({...draft, description: draft.description || 'Preview of a financial widget.', name: draft.name || 'Preview'});
        const blocking = check.errors.find(error => /credential|secret|access key|empty|define function|limited/i.test(error));
        if (blocking) { say(blocking, 'error'); showPreviewMessage(blocking); previewNote(blocking, true); return; }
        const preview = root.querySelector('[data-fxb-preview]');
        if (!preview) return;
        const quotes = snapshot(T);
        say('Running in the sandbox…', '');
        previewNote('Running…', false);
        stopPreview = mount(preview, draft.main, quotes, {
          title: draft.name,
          onError: message => { say(message, 'error'); previewNote(message, true); },
          onDone: () => {
            const count = quotes.length;
            const text = count
              ? 'Running in the sandbox. ' + count + ' snapshot price' + (count === 1 ? '' : 's') + ' available. Network access is blocked.'
              : 'Running. No prices are in this terminal snapshot, so missing symbols stay blank. Nothing was invented.';
            say(text, 'ok');
            previewNote(text, false);
          }
        }) || (() => {});
      }
      function stop() {
        stopPreview();
        say('Stopped.', '');
        showPreviewMessage('Stopped.');
        previewNote('Stopped.', false);
      }
      function findValue() { return root.querySelector('[data-fxb-find]')?.value || ''; }
      function replaceValue() { return root.querySelector('[data-fxb-replace]')?.value || ''; }
      function findNext() {
        syncCode();
        const query = findValue();
        if (!query) { say('Type something to find.', 'error'); return; }
        if (cm && cm.getSearchCursor) {
          let cursor = cm.getSearchCursor(query, cm.getCursor('to'), {caseFold: true});
          let wrapped = false;
          if (!cursor.findNext()) {
            cursor = cm.getSearchCursor(query, {line: 0, ch: 0}, {caseFold: true});
            if (!cursor.findNext()) { say('No match for "' + query + '".', 'error'); return; }
            wrapped = true;
          }
          cm.setSelection(cursor.from(), cursor.to());
          cm.scrollIntoView({from: cursor.from(), to: cursor.to()}, 40);
          cm.focus();
          say((wrapped ? 'Wrapped to the top. ' : '') + 'Found "' + query + '".', 'ok');
          return;
        }
        const area = root.querySelector('textarea.fxb-code');
        if (!area) return;
        const hay = area.value.toLowerCase();
        const needle = query.toLowerCase();
        let at = hay.indexOf(needle, area.selectionEnd || 0);
        if (at < 0) at = hay.indexOf(needle);
        if (at < 0) { say('No match for "' + query + '".', 'error'); return; }
        area.focus();
        area.setSelectionRange(at, at + query.length);
        say('Found "' + query + '".', 'ok');
      }
      function replaceOne() {
        const query = findValue();
        if (!query) { say('Type something to find.', 'error'); return; }
        if (!cm) { say('Replace is available in the code editor.', 'error'); return; }
        if (cm.getSelection().toLowerCase() === query.toLowerCase()) cm.replaceSelection(replaceValue());
        findNext();
      }
      function replaceAll() {
        const query = findValue();
        if (!query) { say('Type something to find.', 'error'); return; }
        if (!cm) { say('Replace is available in the code editor.', 'error'); return; }
        const next = replaceValue();
        let count = 0;
        cm.operation(() => {
          const cursor = cm.getSearchCursor(query, {line: 0, ch: 0}, {caseFold: true});
          while (cursor.findNext()) {
            cursor.replace(next);
            count += 1;
            if (count > 2000) break;
          }
        });
        draft.main = cm.getValue();
        markDirty();
        say(count ? 'Replaced ' + count + ' match' + (count === 1 ? '' : 'es') + '.' : 'No match for "' + query + '".', count ? 'ok' : 'error');
      }
      function undo() {
        if (cm) { cm.undo(); cm.focus(); return; }
        const area = root.querySelector('textarea.fxb-code');
        if (area) { area.focus(); document.execCommand('undo'); }
      }
      function redo() {
        if (cm) { cm.redo(); cm.focus(); return; }
        const area = root.querySelector('textarea.fxb-code');
        if (area) { area.focus(); document.execCommand('redo'); }
      }
      function openProject(id) {
        syncCode();
        const project = byId(id);
        if (!project) return;
        currentId = id;
        draft = draftOf(project);
        dirty = false;
        consoleText = project.stored === 'device' ? 'Opened the copy stored on this browser.' : 'Opened version ' + project.version + '.';
        consoleLevel = '';
        paint();
      }
      function rebuildList() {
        const list = root.querySelector('[data-fxb-list]');
        const versions = root.querySelector('[data-fxb-versions]');
        if (!list || !versions) return;
        list.replaceChildren();
        const query = projectQuery.trim().toLowerCase();
        const rows = state.projects.filter(item => !query || item.name.toLowerCase().includes(query) || String(item.category).toLowerCase().includes(query));
        if (!rows.length) list.append(el('p', 'fxb-note', state.projects.length ? 'No project matches that search.' : (state.status === 'error' ? state.error : 'No saved projects yet.')));
        rows.slice(0, Core.LIMITS.projects).forEach(item => {
          const row = buttonEl(item.name, item.id === draft.id ? 'on' : '', () => openProject(item.id));
          row.append(el('small', '', (item.stored === 'device' ? 'this browser' : 'v' + item.version) + ' · private'));
          list.append(row);
        });
        versions.replaceChildren();
        const history = (draft.versions || []).slice().reverse();
        if (!history.length) versions.append(el('p', 'fxb-note', 'No saved versions yet. Saving a change keeps the previous one.'));
        history.forEach(version => {
          versions.append(buttonEl('Restore v' + version.version, '', () => {
            draft.main = String(version.main || '');
            dirty = true;
            if (cm) cm.setValue(draft.main);
            else {
              const area = root.querySelector('textarea.fxb-code');
              if (area) area.value = draft.main;
            }
            say('Restored version ' + version.version + ' into the editor. Save to keep it.', '');
            setSaveLabel('Unsaved', 'warn');
            scheduleDraft();
          }));
        });
      }
      function fillSide(side) {
        side.replaceChildren();
        const scroll = el('div', 'fxb-side-scroll');
        scroll.append(el('h2', '', 'Projects'));
        scroll.append(buttonEl('New project', '', () => {
          syncCode();
          currentId = null;
          draft = draftOf(null);
          dirty = true;
          consoleText = 'Unsaved project. Save it before installing.';
          consoleLevel = '';
          paint();
        }));
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'fxb-field';
        search.placeholder = 'Search projects';
        search.setAttribute('aria-label', 'Search projects');
        search.value = projectQuery;
        search.addEventListener('input', () => { projectQuery = search.value; rebuildList(); });
        scroll.append(search);
        scroll.append(field('Name', draft.name, Core.LIMITS.name, value => { draft.name = value; markDirty(); }, 'Project name'));
        const description = document.createElement('textarea');
        description.className = 'fxb-field';
        description.rows = 3;
        description.maxLength = Core.LIMITS.description;
        description.value = draft.description;
        description.setAttribute('aria-label', 'Project description');
        description.addEventListener('input', () => { draft.description = description.value; markDirty(); });
        const descriptionLabel = document.createElement('label');
        descriptionLabel.append(el('span', '', 'Description'), description);
        scroll.append(descriptionLabel);
        const category = document.createElement('label');
        category.append(el('span', '', 'Category'));
        const select = document.createElement('select');
        select.className = 'fxb-field';
        select.setAttribute('aria-label', 'Finance category');
        Core.CATEGORIES.forEach(([id, label]) => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = label;
          option.selected = id === draft.category;
          select.append(option);
        });
        select.addEventListener('change', () => { draft.category = select.value; markDirty(); rebuildList(); });
        category.append(select);
        scroll.append(category);
        scroll.append(el('h2', '', 'Explorer'));
        scroll.append(buttonEl('main.js', 'on', () => { if (cm) cm.focus(); else root.querySelector('textarea.fxb-code')?.focus(); }));
        scroll.append(el('h2', '', 'Saved'));
        const list = el('div', 'fxb-list');
        list.setAttribute('data-fxb-list', '');
        scroll.append(list);
        scroll.append(el('h2', '', 'Versions'));
        const versions = el('div', 'fxb-versions');
        versions.setAttribute('data-fxb-versions', '');
        scroll.append(versions);
        const actions = el('div', 'fxb-tools');
        actions.append(buttonEl('Duplicate', '', duplicate));
        actions.append(buttonEl('Delete project', 'danger', removeProject));
        scroll.append(actions);
        scroll.append(el('p', 'fxb-note', 'Visibility is private. Community Library, official submission, and external API credentials are not part of this release. Widgets cannot make network requests.'));
        side.append(scroll);
        const split = el('div', 'fxb-split');
        split.setAttribute('data-fxb-split', 'side');
        split.setAttribute('role', 'separator');
        split.setAttribute('aria-orientation', 'vertical');
        split.setAttribute('aria-label', 'Resize projects');
        split.tabIndex = 0;
        side.append(split);
        bindSplit(split, '--fxb-side', 248, false, 180, 520);
        rebuildList();
      }

      function paint() {
        stopPreview();
        cm = null;
        root.replaceChildren();
        const bar = el('div', 'fxb-bar');
        bar.append(el('strong', '', 'FYNX BUILDER'));
        const status = el('span', '', statusText());
        status.setAttribute('data-fxb-status', '');
        bar.append(status);
        const tools = el('div', 'fxb-tools');
        tools.append(buttonEl('Run', 'on', () => { syncCode(); run(); }));
        tools.append(buttonEl('Stop', '', stop));
        tools.append(buttonEl('Save', '', () => { syncCode(); persist(); }));
        const installButton = buttonEl('Add to my terminal', 'on', () => { if (installedNow()) uninstall(false); else install(); });
        installButton.setAttribute('data-fxb-install', '');
        tools.append(installButton);
        bar.append(tools);

        const side = el('aside', 'fxb-side');
        const editor = el('section', 'fxb-editor');
        const fileBar = el('div', 'fxb-filebar');
        fileBar.append(el('span', 'fxb-tab', 'main.js'));
        const lines = el('span', '', '');
        lines.setAttribute('data-fxb-lines', '');
        const save = el('span', 'fxb-save', '');
        save.setAttribute('data-fxb-save', '');
        fileBar.append(lines, save);
        editor.append(fileBar);
        const editorHost = el('div', 'fxb-cmhost');
        editorHost.setAttribute('data-fxb-editor-host', '');
        editor.append(editorHost);
        const find = el('div', 'fxb-find');
        const findInput = document.createElement('input');
        findInput.type = 'search';
        findInput.className = 'fxb-field';
        findInput.placeholder = 'Find';
        findInput.setAttribute('aria-label', 'Find in main.js');
        findInput.setAttribute('data-fxb-find', '');
        const replaceInput = document.createElement('input');
        replaceInput.type = 'text';
        replaceInput.className = 'fxb-field';
        replaceInput.placeholder = 'Replace';
        replaceInput.setAttribute('aria-label', 'Replace in main.js');
        replaceInput.setAttribute('data-fxb-replace', '');
        find.append(findInput, replaceInput, buttonEl('Find', '', findNext), buttonEl('Replace', '', replaceOne), buttonEl('All', '', replaceAll), buttonEl('Undo', '', undo), buttonEl('Redo', '', redo));
        editor.append(find);
        const log = el('p', 'fxb-console', '');
        log.setAttribute('data-fxb-console', '');
        editor.append(log);

        const preview = el('section', 'fxb-preview');
        const split = el('div', 'fxb-split');
        split.setAttribute('data-fxb-split', 'preview');
        split.setAttribute('role', 'separator');
        split.setAttribute('aria-orientation', 'vertical');
        split.setAttribute('aria-label', 'Resize preview');
        split.tabIndex = 0;
        preview.append(split);
        preview.append(el('h2', '', 'Preview'));
        const screen = el('div', 'fxb-screen');
        screen.setAttribute('data-fxb-preview', '');
        preview.append(screen);
        const note = el('p', 'fxb-note', '');
        note.setAttribute('data-fxb-preview-note', '');
        preview.append(note);
        preview.append(buttonEl('Refresh preview', '', () => { syncCode(); run(); }));
        bindSplit(split, '--fxb-preview', 340, true, 220, 640);

        const assist = el('section', 'fxb-assist');
        assist.append(el('h2', '', 'Builder assistant'));
        assist.append(el('p', 'fxb-note', 'No AI provider is connected here. Copy this prompt into ChatGPT or Claude, then paste the JavaScript it returns into main.js and press Run. Do not paste API keys.'));
        const prompt = document.createElement('textarea');
        prompt.className = 'fxb-field';
        prompt.readOnly = true;
        prompt.value = Core.ASSISTANT_PROMPT;
        prompt.setAttribute('aria-label', 'Prompt for an external coding assistant');
        assist.append(prompt);
        assist.append(buttonEl('Copy prompt', '', async () => {
          try { await navigator.clipboard.writeText(Core.ASSISTANT_PROMPT); say('Prompt copied.', 'ok'); }
          catch (e) { prompt.focus(); prompt.select(); say('Select the prompt and copy it manually.', 'error'); }
        }));
        assist.append(el('p', 'fxb-note', 'The widget contract is function render(root, FYNX). FYNX.quote returns a snapshot price or null. Missing symbols stay blank. Prices are never invented.'));
        root.append(bar, side, editor, preview, assist);
        fillSide(side);
        mountEditor(draft.main);
        updateLines();
        const label = dirty ? ['Unsaved', 'warn'] : (!draft.id ? ['Not saved', 'warn'] : (byId(draft.id)?.stored === 'account' ? ['Account · v' + draft.version, 'on'] : ['On this browser', 'warn']));
        setSaveLabel(label[0], label[1]);
        say(consoleText, consoleLevel);
        updateStatus();
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
      function field(label, value, max, onInput, aria) {
        const wrap = document.createElement('label');
        wrap.append(el('span', '', label));
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fxb-field';
        input.value = value;
        input.maxLength = max;
        input.setAttribute('aria-label', aria || label);
        input.addEventListener('input', () => onInput(input.value));
        wrap.append(input);
        return wrap;
      }

      root.addEventListener('keydown', event => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === 's') { event.preventDefault(); syncCode(); persist(); }
        else if (key === 'enter') { event.preventDefault(); syncCode(); run(); }
        else if (key === 'f') { event.preventDefault(); const input = root.querySelector('[data-fxb-find]'); if (input) { input.focus(); input.select(); } }
        else if (key === 'h') { event.preventDefault(); const input = root.querySelector('[data-fxb-replace]'); if (input) { input.focus(); input.select(); } }
        else if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
        else if ((key === 'y') || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
      });

      function onState() {
        if (!root.isConnected) {
          listeners.delete(onState);
          if (captureDraft && captureDraft() === draft) captureDraft = () => null;
          return;
        }
        if (state.uid !== seenUid) {
          const previous = seenUid;
          seenUid = state.uid;
          if (previous && previous !== state.uid) {
            dirty = false;
            if (state.draft && state.draft.main) draft = applyRecord(state.draft);
            else if (state.projects[0]) draft = draftOf(state.projects[0]);
            else draft = draftOf(null);
            currentId = draft.id;
            consoleText = state.uid
              ? 'Ctrl/Cmd+Enter runs. Ctrl/Cmd+S saves. Ctrl/Cmd+F finds. Ctrl/Cmd+H replaces.'
              : 'Sign in to save a project to your account.';
            consoleLevel = '';
            paint();
            return;
          }
          if (!dirty && state.draft && state.draft.main && state.draft.main !== draft.main) {
            draft = applyRecord(state.draft);
            currentId = draft.id;
            paint();
            return;
          }
          if (!dirty && !draft.id && draft.main === Core.TEMPLATE && state.projects[0]) {
            currentId = state.projects[0].id;
            draft = draftOf(state.projects[0]);
            paint();
            return;
          }
        }
        updateStatus();
        rebuildList();
      }
      if (pageListener) listeners.delete(pageListener);
      pageListener = onState;
      listeners.add(onState);
      paint();
    });
    window.FynxBuilderReady = true;
  });
})();
