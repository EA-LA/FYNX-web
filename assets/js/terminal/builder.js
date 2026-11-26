/* FYNX Builder, Phase 1. Private projects, sandboxed preview, install on this terminal only.
 * Loaded before terminal/app.js so the plugin is registered without delaying the desk scripts. */
(function () {
  'use strict';
  const Core = window.FynxBuilderCore;
  if (!Core) return;
  window.FynxBuilderKey = true;

  const state = {uid: null, projects: [], installs: [], trash: [], draft: null, status: 'loading', error: '', ready: false};
  const listeners = new Set();
  const frames = new Set();
  let dbApi = null;
  let stopWatch = null;
  // One queue across Builder page mounts; stale pages cannot overtake new saves.
  let accountWriteQueue = Promise.resolve();

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
        // Never silently substitute a newer, unreviewed autosave for the
        // exact source version the user explicitly installed.
        const installedSource = live.version === widget.version
          ? live.main
          : (live.versions || []).find(version => version.version === widget.version)?.main;
        if (!installedSource) {
          const message = document.createElement('p');
          message.textContent = 'Installed version is no longer retained. Open Builder, run the latest version, and choose Update installed tool.';
          host.replaceChildren(message);
          return;
        }
        mount(host, installedSource, T.S && T.S.quotes, {title: live.name});
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
  // The terminal redraws an open page once its data finishes loading. Keep the
  // last message and the chosen tab so a redraw does not look like a reset.
  const pageMemory = {text: '', level: '', at: 0, tab: 'preview', uid: null};

  function localKey(uid) { return LOCAL_PREFIX + uid; }

  function draftRecord(draft) {
    if (!draft || typeof draft !== 'object') return null;
    const main = String(draft.main || '');
    if (!main.trim() || main.length > Core.LIMITS.code || Core.secretFindings(main).length) return null;
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
      // Validate every cached project against this account. Previously merging
      // against an empty cloud view discarded account-synced browser backups.
      // Those must remain readable when Firestore is temporarily unavailable.
      const merged = Core.accountView(uid, Array.isArray(raw.projects) ? raw.projects : [], []);
      const storedById = new Map((Array.isArray(raw.projects) ? raw.projects : []).map(row => [row?.id, row?.stored]));
      const accountInstalls = Core.sanitizeWidgets(raw.installs).map(widget => ({...widget, deviceOnly: false}));
      const deviceInstalls = Core.sanitizeWidgets(raw.deviceInstalls).map(widget => ({...widget, deviceOnly: true}));
      const seen = new Set(accountInstalls.map(widget => widget.projectId));
      return {
        projects: merged.projects.map(project => ({...project, stored: storedById.get(project.id) === 'account' ? 'account' : 'device'})),
        installs: accountInstalls.concat(deviceInstalls.filter(widget => !seen.has(widget.projectId))).slice(0, Core.LIMITS.widgets),
        draft: draftRecord(raw.draft),
        trash: (Array.isArray(raw.trash) ? raw.trash : []).filter(row => row && row.project && row.project.authorUid === uid && Core.validateProject(row.project).ok && Number(row.deletedAt) > Date.now() - 30 * 86400000).slice(-Core.LIMITS.projects)
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
      const editorDraft = captureDraft();
      // Never persist apparent credentials in local recovery data either.
      const unsafeDraft = editorDraft && Core.secretFindings(editorDraft.main).length > 0;
      const draft = unsafeDraft ? null : (draftRecord(editorDraft) || draftRecord(state.draft));
      localStorage.setItem(localKey(uid), JSON.stringify({projects, installs, deviceInstalls, draft, trash: state.trash}));
      // Reopening the Builder page must use the latest editor recovery draft,
      // not the snapshot from the last authentication event.
      state.draft = draft;
      return !unsafeDraft;
    } catch (e) {
      return false;
    }
  }

  // A browser can close before the debounced recovery timer fires.
  window.addEventListener('pagehide', () => { if (state.uid) writeDevice(state.uid); });

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
        state.trash = [];
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
          state.trash = local.trash;
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
  // Market Data Display settings for FYNX.tick inside widgets (plain data only).
  function tickDisplay() { try { return window.FynxTick ? window.FynxTick.sandboxSettings() : null; } catch (e) { return null; } }

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
        try { frame.contentWindow.postMessage({type: 'fynx-run', token, code, quotes: Core.snapshotQuotes(quotes), display: tickDisplay()}, '*'); }
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
      try { frame.contentWindow.postMessage({type: 'fynx-quotes', token: frame.dataset.token || '', quotes, display: tickDisplay()}, '*'); } catch (e) {}
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
      // A previous mount may still hold keystrokes inside its 750 ms recovery debounce: flush them first.
      if (state.uid && captureDraft()) writeDevice(state.uid);
      PG.setHead('BUILD', 'FYNX Builder', 'Write a small market tool, preview it safely, and add it to your terminal.');
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
      let successfulPreviewCode = null;
      const remembered = pageMemory.uid === state.uid && Date.now() - pageMemory.at < 120000;
      let consoleText = remembered && pageMemory.text ? pageMemory.text : 'Ctrl/Cmd+Enter runs. Ctrl/Cmd+S saves. Ctrl/Cmd+F finds. Ctrl/Cmd+H replaces.';
      let consoleLevel = remembered ? pageMemory.level : '';
      let dirty = false;
      let cm = null;
      let projectQuery = '';
      let showTrash = false;
      let onboardingOpen = false;
      let seenUid = state.uid;
      let draftTimer = 0;
      let cloudTimer = 0;
      let editRevision = 0;

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
      try { onboardingOpen = !localStorage.getItem('fx-term-builder-tour:' + state.uid); } catch (e) { onboardingOpen = false; }

      function say(text, level) {
        consoleText = text;
        consoleLevel = level || '';
        Object.assign(pageMemory, {text, level: level || '', at: Date.now(), uid: state.uid});
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
        // Any source edit invalidates the last successfully tested source.
        successfulPreviewCode = null;
        dirty = true;
        editRevision += 1;
        scheduleDraft();
        scheduleCloudSync();
        scheduleLive();
        setSaveLabel('Unsaved changes', 'warn');
      }
      function scheduleDraft() {
        const uid = state.uid;
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
          if (state.uid !== uid) return;
          const preserved = writeDevice(uid);
          if (dirty) setSaveLabel(preserved ? 'Saved to this browser · syncing…' : 'Recovery save failed', 'warn');
        }, 750);
      }
      function scheduleCloudSync() {
        clearTimeout(cloudTimer);
        const uid = state.uid;
        cloudTimer = setTimeout(() => {
          if (!root.isConnected || state.uid !== uid || !uid) return;
          // Invalid JS or secrets remain recoverable locally, never uploaded.
          if (!Core.validateProject(draft).ok) return;
          persist(true);
        }, 1800);
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
        const installation = draft.id && state.installs.find(widget => widget.projectId === draft.id && widget.enabled);
        const updateAvailable = installation && Number(installation.version) !== Number(draft.version);
        button.textContent = updateAvailable ? 'Update installed tool' : installation ? 'Remove from terminal' : 'Add to my terminal';
        button.classList.toggle('on', !installation || !!updateAvailable);
      }
      function updateStatus() {
        const node = root.querySelector('[data-fxb-status]');
        if (node) { node.textContent = statusText(); node.className = 'fxb-status' + (state.status === 'ready' ? ' ok' : state.status === 'loading' ? '' : ' warn'); }
        const retry = root.querySelector('[data-fxb-retry]');
        if (retry) retry.hidden = !(state.uid && (state.status === 'device' || state.status === 'error'));
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
          lineWrapping: true,
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
      function showPreviewMessage(text, neutral) {
        const preview = root.querySelector('[data-fxb-preview]');
        if (!preview) return;
        stopPreview();
        preview.replaceChildren();
        if (!neutral) setRunState(false);
        const paragraph = document.createElement('p');
        paragraph.className = neutral ? 'fxb-empty' : 'fxb-error';
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
              const side = parseInt(root.style.getPropertyValue('--fxb-side'), 10) || 260;
              const preview = parseInt(root.style.getPropertyValue('--fxb-preview'), 10) || 380;
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

      async function persist(automatic = false) {
        clearTimeout(cloudTimer);
        syncCode();
        const check = Core.validateProject(draft);
        if (!check.ok) { say(check.errors[0], 'error'); setSaveLabel('Not saved', 'warn'); return; }
        if (!state.uid) { say('Sign in before saving. Nothing was stored.', 'error'); setSaveLabel('Not saved', 'warn'); return; }
        const id = draft.id || ('p' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).replace(/-/g, '').slice(0, 20));
        if (!/^p[a-z0-9]{8,24}$/.test(id)) { say('Project id is not valid. Nothing was stored.', 'error'); return; }
        if (!draft.id && state.projects.length >= Core.LIMITS.projects) { say('You can save up to ' + Core.LIMITS.projects + ' private projects.', 'error'); return; }
        clearTimeout(draftTimer);
        const ownerUid = state.uid;
        const savingRevision = editRevision;
        const prior = byId(id);
        // Each changed source is versioned, including autosaves. Keep only
        // the last bounded snapshots under the existing Firestore schema.
        const next = Core.withVersion(prior, check.project);
        // An explicit Save Version creates a checkpoint even if autosave
        // already synchronized identical source at the current revision.
        if (!automatic && prior && next.version === prior.version && prior.main === check.project.main) {
          next.version = prior.version + 1;
          next.versions = [...(prior.versions || []), {version: prior.version, savedAt: prior.updatedAt || Date.now(), main: prior.main}].slice(-Core.LIMITS.versions);
        }
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
          // Serialize cloud writes: an older network request cannot finish
          // after a newer write and become the final account copy.
          const previousSave = accountWriteQueue;
          let releaseSave;
          accountWriteQueue = new Promise(resolve => { releaseSave = resolve; });
          await previousSave;
          if (state.uid !== ownerUid) { releaseSave(); return; }
          try {
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
          } finally { releaseSave(); }
          if (state.uid !== ownerUid) return;
          view.stored = 'account';
          // Do not roll back a newer local project while an older request resolves.
          state.projects = state.projects.map(project => project.id === id
            ? (project.updatedAt > view.updatedAt ? project : {...view}) : project);
          writeDevice(state.uid);
          if (editRevision === savingRevision && currentId === id) {
            say(automatic ? 'Autosaved to your account.' : 'Synced to your account as version ' + view.version + '.', 'ok');
            setSaveLabel('Synced to your account · v' + view.version, 'on');
          } else {
            setSaveLabel('Newer changes · saved to this browser', 'warn');
          }
          if (state.installs.some(widget => widget.projectId === id)) registerInstalls(T);
          rebuildList();
        } catch (error) {
          if (state.uid !== ownerUid) return;
          const denied = error && error.code === 'permission-denied';
          if (!localOk) {
            say('Not saved. The account refused the write and this browser could not keep a copy.', 'error');
            setSaveLabel('Not saved', 'warn');
            return;
          }
          say(denied
            ? 'Not saved to your account. The builder security rules are not deployed, so this copy stays on this browser only.'
            : 'Not saved to your account. ' + (error.message || 'Try again.') + ' A copy remains on this browser.', 'error');
          if (editRevision === savingRevision && currentId === id) setSaveLabel('Saved to this browser · sync failed', 'warn');
        }
      }

      async function install() {
        syncCode();
        const check = Core.validateProject(draft);
        if (!check.ok) { say(check.errors[0], 'error'); return; }
        if (!state.uid) { say('Sign in before installing. Nothing was added.', 'error'); return; }
        const saved = draft.id ? byId(draft.id) : null;
        if (!saved || saved.main !== draft.main || saved.name !== draft.name) { say('Save the project before adding it to your terminal.', 'error'); return; }
        if (successfulPreviewCode !== draft.main) { say('Run this saved code successfully before installing it.', 'error'); return; }
        const deskName = String(T.S?.deskKey || 'current').toUpperCase() + ' desk';
        const previousInstall = state.installs.find(widget => widget.projectId === draft.id);
        const action = previousInstall ? 'Update' : 'Install';
        if (!window.confirm(action + ' "' + saved.name + '" (version ' + saved.version + ') on ' + deskName + '? This does not delete or publish your source project.')) {
          say('Installation cancelled; your project is unchanged.', ''); return;
        }
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

      async function uninstall(quiet, targetId) {
        const projectId = targetId || draft.id;
        if (!projectId) return;
        let slot = '';
        try { slot = Core.slotFor(projectId); }
        catch (error) { say('Project id is not valid.', 'error'); return; }
        const current = state.installs.find(widget => widget.projectId === projectId);
        const remaining = state.installs.filter(widget => widget.projectId !== projectId);
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

      // Account writes and deletes share one queue, so a save that started
      // before a delete can never land after it and bring the project back.
      async function queueAccount(task) {
        const previous = accountWriteQueue;
        let release;
        accountWriteQueue = new Promise(resolve => { release = resolve; });
        try { await previous; return await task(); } finally { release(); }
      }
      function blankDraft() {
        return {id: null, name: 'Untitled project', description: 'A new private financial tool.', category: 'research', main: templateSource('blank'), version: 1, versions: []};
      }
      async function removeProject(targetId) {
        syncCode();
        const id = targetId || draft.id;
        if (!id) {
          if (!window.confirm('Discard "' + (draft.name || 'this project') + '"? It was never saved.')) return;
          clearTimeout(cloudTimer); clearTimeout(draftTimer);
          currentId = state.projects[0]?.id || null;
          draft = currentId ? draftOf(byId(currentId)) : blankDraft();
          dirty = false;
          state.draft = draftRecord(draft);
          writeDevice(state.uid);
          consoleText = 'Discarded the unsaved project.'; consoleLevel = 'ok';
          paint();
          return;
        }
        const project = byId(id);
        if (!project) { say('This project is no longer in your list.', 'error'); rebuildList(); return; }
        const isCurrent = id === draft.id;
        const source = isCurrent ? draft.main : project.main;
        if (Core.secretFindings(source).length) { say('Remove credentials from the code before deleting this project.', 'error'); return; }
        const installed = state.installs.some(widget => widget.projectId === id);
        if (!window.confirm('Delete "' + project.name + '"?\n\nIt is removed from your projects' + (installed ? ' and from your terminal' : '') + '. You can restore it from Trash on this browser for 30 days.')) return;
        if (isCurrent) { clearTimeout(cloudTimer); clearTimeout(draftTimer); }
        // Keep a recovery copy before anything destructive; refuse if the browser cannot store it.
        const previousTrash = state.trash.slice();
        state.trash = state.trash.filter(row => row.project.id !== id).concat([{project: {...project, main: source, authorUid: state.uid}, deletedAt: Date.now()}]).slice(-Core.LIMITS.projects);
        if (!writeDevice(state.uid)) {
          state.trash = previousTrash;
          say('Not deleted. This browser could not keep a recovery copy.', 'error');
          return;
        }
        const inAccount = project.stored === 'account';
        // The label can lag behind an autosave, so always remove the account copy when signed in.
        if (state.uid && dbApi) {
          try {
            await queueAccount(async () => {
              const api = await connect();
              if (api.auth.currentUser?.uid !== state.uid) throw new Error('Account changed during deletion.');
              await api.firestore.deleteDoc(api.firestore.doc(api.firestore.getFirestore(api.app), 'users', state.uid, 'builderProjects', id));
            });
          } catch (error) {
            if (inAccount) {
              state.trash = previousTrash;
              writeDevice(state.uid);
              say('Not deleted. Your account still has the project: ' + (error.message || 'the request was refused.'), 'error');
              return;
            }
          }
        } else if (inAccount) {
          state.trash = previousTrash;
          writeDevice(state.uid);
          say('Not deleted. Account storage is unavailable right now; try again in a moment.', 'error');
          return;
        }
        if (installed) await uninstall(true, id);
        state.projects = state.projects.filter(item => item.id !== id);
        if (isCurrent) {
          currentId = state.projects[0]?.id || null;
          draft = currentId ? draftOf(byId(currentId)) : blankDraft();
          dirty = false;
          successfulPreviewCode = null;
        }
        state.draft = draftRecord(draft);
        writeDevice(state.uid);
        consoleText = 'Deleted "' + project.name + '". Restore it from Trash within 30 days on this browser.';
        consoleLevel = 'ok';
        paint();
      }

      async function restoreTrash(id) {
        const entry = state.trash.find(row => row.project.id === id);
        if (!entry || entry.project.authorUid !== state.uid) return;
        if (state.projects.some(project => project.id === id)) {
          say('A project with this identifier already exists. Recovery cancelled.', 'error');
          return;
        }
        if (state.projects.length >= Core.LIMITS.projects) {
          say('Your project limit is full. Export a project before restoring; no existing projects were changed.', 'error');
          return;
        }
        const restored = {...entry.project, stored: 'device', updatedAt: Date.now()};
        const check = Core.validateProject(restored);
        if (!check.ok) { say('Recovery failed: ' + check.errors[0], 'error'); return; }
        const previous = state.trash.slice();
        state.projects = [restored, ...state.projects].slice(0, Core.LIMITS.projects);
        state.trash = state.trash.filter(row => row !== entry);
        currentId = id;
        draft = draftOf(restored);
        dirty = false;
        if (!writeDevice(state.uid)) {
          state.projects = state.projects.filter(row => row.id !== id);
          state.trash = previous;
          say('Restore cancelled: browser storage is full or unavailable.', 'error');
          return;
        }
        showTrash = false;
        consoleText = 'Restored "' + restored.name + '".' + (state.status === 'ready' ? ' Syncing it back to your account…' : ' It is on this browser; Save syncs it to your account when storage is available.');
        consoleLevel = 'ok';
        paint();
        if (state.status === 'ready' && dbApi) persist(true);
      }

      // Starter code follows the same render(root, FYNX) SDK as the original.
      // All values come from the terminal snapshot; missing prices stay blank.
      const starterTemplates = [
        ['blank', 'Blank project', 'research', 'A new private financial tool.'],
        ['stocks', 'Stock Market Dashboard', 'stocks', 'Stock market snapshots and daily changes.'],
        ['forex', 'Forex Tool', 'forex', 'Currency-market snapshots and utilities.'],
        ['crypto', 'Cryptocurrency Monitor', 'crypto', 'Cryptocurrency snapshot monitor.'],
        ['news', 'Economic News Dashboard', 'news', 'Notes and economic event overview.'],
        ['calculator', 'Financial Calculator', 'risk', 'Interactive financial calculation.'],
        ['research', 'AI Research Dashboard', 'research', 'Research workspace without a connected AI provider.'],
        ['custom', 'Custom Financial Tool', 'visualization', 'Create a custom finance widget.']
      ];
      function templateSource(key) {
        if (key === 'blank' || key === 'custom') return 'function render(root, FYNX) {\n  const title = document.createElement("h2");\n  title.textContent = "My financial tool";\n  root.replaceChildren(title);\n}\n';
        if (key === 'calculator') return 'function render(root, FYNX) {\n  const label = document.createElement("p");\n  label.textContent = "Position risk calculator — example";\n  const input = document.createElement("input"); input.type = "number"; input.value = "10000"; input.setAttribute("aria-label", "Account balance");\n  const output = document.createElement("p");\n  function update() { const balance = Number(input.value); output.textContent = Number.isFinite(balance) && balance >= 0 ? "Risk at 1%: " + (balance * 0.01).toFixed(2) : "Enter a valid balance"; }\n  input.addEventListener("input", update); update();\n  root.replaceChildren(label, input, output);\n}\n';
        const symbols = key === 'forex' ? ['EURUSD', 'GBPUSD'] : key === 'crypto' ? ['BTCUSD', 'ETHUSD'] : ['SPY', 'QQQ', 'GLD'];
        const title = starterTemplates.find(row => row[0] === key)?.[1] || 'Financial dashboard';
        return 'function render(root, FYNX) {\n  const heading = document.createElement("h2"); heading.textContent = ' + JSON.stringify(title) + ';\n  root.replaceChildren(heading);\n  ' + (key === 'news' || key === 'research'
          ? 'const note = document.createElement("p"); note.textContent = "Research notes are private. Connect a reviewed data source before displaying live headlines."; root.append(note);'
          : 'for (const symbol of ' + JSON.stringify(symbols) + ') { const quote = FYNX.quote(symbol); const line = document.createElement("p"); line.textContent = symbol + ": " + (quote ? FYNX.format(quote.price, 2) : "Not in terminal snapshot"); root.append(line); }') + '\n}\n';
      }
      async function createTemplate(key, name) {
        if (!Core.cleanText(name, Core.LIMITS.name)) { say('Enter a name for the new project.', 'error'); root.querySelector('[aria-label="New project name"]')?.focus(); return; }
        if (dirty && !(await settleDirty())) return;
        const template = starterTemplates.find(row => row[0] === key) || starterTemplates[0];
        const cleaned = Core.cleanText(name, Core.LIMITS.name);
        if (!cleaned) { say('Enter a project name.', 'error'); return; }
        currentId = null;
        draft = {id: null, name: cleaned, description: template[3], category: template[2], main: templateSource(key), version: 1, versions: []};
        dirty = true;
        editRevision += 1;
        scheduleDraft();
        scheduleCloudSync();
        say('Created a private draft. Run to preview; automatic saving preserves it, and Save Version makes a checkpoint.', 'ok');
        paint();
      }

      function duplicate() {
        syncCode();
        currentId = null;
        draft = {...draft, id: null, name: (draft.name + ' copy').slice(0, Core.LIMITS.name), version: 1, versions: []};
        dirty = true;
        editRevision += 1;
        say('Duplicated into an unsaved project. Save it to keep the copy.', '');
        scheduleDraft();
        paint();
      }

      function run(options) {
        const quiet = !!(options && options.quiet);
        const tell = (text, level) => { if (!quiet) say(text, level); };
        clearTimeout(liveTimer);
        stopPreview();
        syncCode();
        successfulPreviewCode = null;
        const syntax = Core.syntaxError(draft.main);
        if (syntax) { tell(syntax, 'error'); showPreviewMessage(syntax); previewNote(syntax, true); return; }
        const check = Core.validateProject({...draft, description: draft.description || 'Preview of a financial widget.', name: draft.name || 'Preview'});
        const blocking = check.errors.find(error => /credential|secret|access key|empty|define function|limited/i.test(error));
        if (blocking) { tell(blocking, 'error'); showPreviewMessage(blocking); previewNote(blocking, true); return; }
        const preview = root.querySelector('[data-fxb-preview]');
        if (!preview) return;
        const quotes = snapshot(T);
        const sourceUnderTest = draft.main;
        tell('Running in the sandbox…', '');
        previewNote('Running…', false);
        setRunState(true);
        stopPreview = mount(preview, draft.main, quotes, {
          title: draft.name,
          onError: message => { tell(message, 'error'); previewNote(message, true); setRunState(false); },
          onDone: () => {
            if (draft.main === sourceUnderTest) successfulPreviewCode = sourceUnderTest;
            const count = quotes.length;
            const text = count
              ? 'Running in the sandbox. ' + count + ' snapshot price' + (count === 1 ? '' : 's') + ' available. Network access is blocked.'
              : 'Running. No prices are in this terminal snapshot, so missing symbols stay blank. Nothing was invented.';
            tell(text, 'ok');
            previewNote(text, false);
          }
        }) || (() => {});
      }
      function setRunState(on) {
        const pill = root.querySelector('[data-fxb-runstate]');
        if (pill) { pill.textContent = on ? '● Live' : '○ Stopped'; pill.className = 'fxb-runstate' + (on ? ' on' : ''); }
      }
      let liveTimer = 0;
      function liveEnabled() { try { return localStorage.getItem('fx-term-builder-live') !== 'off'; } catch (e) { return true; } }
      function scheduleLive() {
        clearTimeout(liveTimer);
        if (!liveEnabled()) return;
        liveTimer = setTimeout(() => { if (root.isConnected && !Core.syntaxError(draft.main)) run({quiet: true}); }, 1200);
      }
      function stop() {
        clearTimeout(liveTimer);
        stopPreview();
        say('Stopped.', '');
        showPreviewMessage('Stopped. Press Run to start the preview again.', true);
        previewNote('Stopped.', false);
        setRunState(false);
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
      // Saves the open project before switching away. Returns false if it cannot be kept safely.
      async function settleDirty() {
        syncCode();
        if (!dirty) return true;
        if (state.uid && Core.validateProject(draft).ok) { await persist(true); return !dirty; }
        say('Your current changes are not saved yet (' + (Core.validateProject(draft).errors[0] || 'sign in to save') + '). Fix or save them first; nothing was discarded.', 'error');
        return false;
      }
      async function openProject(id) {
        if (dirty && !(await settleDirty())) return;
        const project = byId(id);
        if (!project) return;
        currentId = id;
        draft = draftOf(project);
        successfulPreviewCode = null;
        dirty = false;
        state.draft = draftRecord(draft);
        writeDevice(state.uid);
        consoleText = project.stored === 'device' ? 'Opened the copy stored on this browser.' : 'Opened version ' + project.version + '.';
        consoleLevel = '';
        paint();
      }
      function relTime(ms) {
        if (!ms) return 'unknown';
        const d = Date.now() - ms;
        if (d < 60000) return 'just now';
        if (d < 3600000) return Math.round(d / 60000) + ' min ago';
        if (d < 86400000) return Math.round(d / 3600000) + ' h ago';
        return new Date(ms).toLocaleDateString();
      }
      function rebuildList() {
        const list = root.querySelector('[data-fxb-list]');
        const versions = root.querySelector('[data-fxb-versions]');
        if (!list || !versions) return;
        list.replaceChildren();
        const count = root.querySelector('[data-fxb-count]');
        if (count) count.textContent = state.projects.length + ' / ' + Core.LIMITS.projects;
        const query = projectQuery.trim().toLowerCase();
        const rows = state.projects.filter(item => !query || item.name.toLowerCase().includes(query) || String(item.category).toLowerCase().includes(query));
        if (!draft.id) {
          const unsaved = el('div', 'fxb-proj on');
          const open = el('div', 'fxb-proj-open');
          open.textContent = draft.name || 'Untitled project';
          open.append(el('small', '', dirty ? 'Unsaved draft · autosaves while you type' : 'New draft · not saved yet'));
          unsaved.append(open);
          list.append(unsaved);
        }
        if (!rows.length) list.append(el('p', 'fxb-note', state.projects.length ? 'No project matches that search.' : (state.status === 'error' ? state.error : state.status === 'loading' ? 'Loading your projects…' : 'No saved projects yet. Your first save appears here.')));
        rows.slice(0, Core.LIMITS.projects).forEach(item => {
          const isInstalled = state.installs.some(widget => widget.projectId === item.id);
          const row = el('div', 'fxb-proj' + (item.id === draft.id ? ' on' : ''));
          const open = buttonEl(item.name, 'fxb-proj-open', () => openProject(item.id));
          const meta = el('small', '', 'v' + item.version + ' · ' + (item.stored === 'device' ? 'this browser' : 'account') + ' · ' + relTime(item.updatedAt));
          open.append(meta);
          if (isInstalled) open.append(el('span', 'fxb-badge', 'ON TERMINAL'));
          open.title = item.description || item.name;
          const del = buttonEl('✕', 'fxb-icon danger', event => { event.stopPropagation(); removeProject(item.id); });
          del.title = 'Delete ' + item.name;
          del.setAttribute('aria-label', 'Delete ' + item.name);
          row.append(open, del);
          list.append(row);
        });
        versions.replaceChildren();
        const history = (draft.versions || []).slice().reverse();
        const head = el('div', 'fxb-row');
        if (draft.id) {
          head.append(buttonEl('Save version', 'on', () => persist()));
          head.append(buttonEl('Export main.js', '', exportMain));
        }
        versions.append(head);
        versions.append(el('p', 'fxb-note', draft.id
          ? 'Current: v' + (draft.version || 1) + '. Every save keeps the previous code, up to ' + Core.LIMITS.versions + ' versions.'
          : 'Save this project to start its version history.'));
        if (draft.id && !history.length) versions.append(el('p', 'fxb-note', 'No earlier versions yet.'));
        history.forEach(version => {
          const row = el('div', 'fxb-version-row');
          const when = version.savedAt ? new Date(version.savedAt).toLocaleString() : 'Time unavailable';
          row.append(el('b', '', 'v' + version.version), el('span', 'fxb-note', when));
          row.append(buttonEl('Compare', '', () => {
            syncCode();
            let view = root.querySelector('[data-fxb-compare]');
            if (!view) {
              view = document.createElement('pre');
              view.setAttribute('data-fxb-compare', '');
              view.className = 'fxb-diff';
              versions.append(view);
            }
            const oldLines = String(version.main || '').split('\n');
            const newLines = String(draft.main || '').split('\n');
            const lines = ['Changes from v' + version.version + ' to the editor:'];
            for (let i = 0; i < Math.min(120, Math.max(oldLines.length, newLines.length)); i++) {
              if (oldLines[i] === newLines[i]) continue;
              if (oldLines[i] != null) lines.push('- ' + (i + 1) + ' ' + oldLines[i]);
              if (newLines[i] != null) lines.push('+ ' + (i + 1) + ' ' + newLines[i]);
            }
            view.textContent = lines.length > 1 ? lines.slice(0, 100).join('\n').slice(0, 10000) : 'No differences.';
            view.scrollIntoView({block: 'nearest'});
          }));
          row.append(buttonEl('Restore', '', () => {
            if (!window.confirm('Put version ' + version.version + ' back in the editor? Your current code stays in history.')) return;
            draft.main = String(version.main || '');
            if (cm) cm.setValue(draft.main);
            else {
              const area = root.querySelector('textarea.fxb-code');
              if (area) area.value = draft.main;
            }
            markDirty();
            say('Restored version ' + version.version + ' into the editor. It autosaves as a new version.', 'ok');
          }));
          versions.append(row);
        });
      }
      function exportMain() {
        syncCode();
        const blob = new Blob([draft.main], {type: 'text/javascript'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (draft.name || 'project').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 48) + '-main.js';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        say('Downloaded main.js. Your saved project was not changed.', 'ok');
      }
      async function newProject() {
        if (dirty && !(await settleDirty())) return;
        currentId = null;
        draft = blankDraft();
        dirty = true;
        editRevision += 1;
        successfulPreviewCode = null;
        scheduleDraft();
        consoleText = 'New project. Write your code, press Run to preview, and it saves automatically.';
        consoleLevel = '';
        paint();
        const name = root.querySelector('[aria-label="Project name"]');
        if (name) { name.focus(); name.select(); }
      }
      function fillSide(side) {
        side.replaceChildren();
        const scroll = el('div', 'fxb-side-scroll');
        const head = el('div', 'fxb-side-head');
        head.append(el('h2', '', 'Projects'));
        const count = el('span', 'fxb-count', '');
        count.setAttribute('data-fxb-count', '');
        head.append(count);
        scroll.append(head);
        scroll.append(buttonEl('+ New project', 'on fxb-wide', newProject));
        const creator = el('div', 'fxb-creator');
        creator.append(el('span', 'fxb-label', 'Or start from a template'));
        const templateSelect = document.createElement('select');
        templateSelect.className = 'fxb-field';
        templateSelect.setAttribute('aria-label', 'Starting template');
        starterTemplates.forEach(([key, label]) => {
          const option = document.createElement('option'); option.value = key; option.textContent = label; templateSelect.append(option);
        });
        const creatorName = document.createElement('input');
        creatorName.className = 'fxb-field';
        creatorName.maxLength = Core.LIMITS.name;
        creatorName.placeholder = 'Name, e.g. My FX dashboard';
        creatorName.setAttribute('aria-label', 'New project name');
        creatorName.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); createTemplate(templateSelect.value, creatorName.value); } });
        creator.append(templateSelect, creatorName, buttonEl('Create project', '', () => createTemplate(templateSelect.value, creatorName.value)));
        scroll.append(creator);
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'fxb-field';
        search.placeholder = 'Search projects';
        search.setAttribute('aria-label', 'Search projects');
        search.value = projectQuery;
        search.addEventListener('input', () => { projectQuery = search.value; rebuildList(); });
        if (state.projects.length > 4 || projectQuery) scroll.append(search);
        const list = el('div', 'fxb-list');
        list.setAttribute('data-fxb-list', '');
        scroll.append(list);
        const trash = el('div', 'fxb-trash');
        trash.append(buttonEl((showTrash ? 'Hide Trash' : 'Trash (' + state.trash.length + ')'), 'fxb-ghost', () => { showTrash = !showTrash; paint(); }));
        if (showTrash) {
          const entries = state.trash.slice().reverse();
          if (!entries.length) trash.append(el('p', 'fxb-note', 'Trash is empty.'));
          entries.forEach(entry => {
            const row = el('div', 'fxb-trash-row');
            row.append(el('span', 'fxb-note', entry.project.name + ' · deleted ' + relTime(entry.deletedAt)));
            row.append(buttonEl('Restore ' + entry.project.name, '', () => restoreTrash(entry.project.id)));
            trash.append(row);
          });
          trash.append(el('p', 'fxb-note', 'Deleted projects can be restored for 30 days on this browser.'));
        }
        scroll.append(trash);
        side.append(scroll);
        const split = el('div', 'fxb-split');
        split.setAttribute('data-fxb-split', 'side');
        split.setAttribute('role', 'separator');
        split.setAttribute('aria-orientation', 'vertical');
        split.setAttribute('aria-label', 'Resize projects');
        split.tabIndex = 0;
        side.append(split);
        bindSplit(split, '--fxb-side', 260, false, 200, 520);
        rebuildList();
      }
      let paneTab = pageMemory.uid === state.uid ? pageMemory.tab : 'preview';
      function showPane(name) {
        paneTab = name;
        pageMemory.tab = name; pageMemory.uid = state.uid;
        root.querySelectorAll('[data-fxb-tab]').forEach(tab => {
          const on = tab.getAttribute('data-fxb-tab') === name;
          tab.classList.toggle('sel', on); tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
        });
        root.querySelectorAll('[data-fxb-pane]').forEach(pane => { pane.hidden = pane.getAttribute('data-fxb-pane') !== name; });
      }

      function paint() {
        stopPreview();
        clearTimeout(liveTimer);
        cm = null;
        root.replaceChildren();
        const bar = el('div', 'fxb-bar');
        const ident = el('div', 'fxb-ident');
        ident.append(el('strong', '', 'BUILDER'));
        ident.append(el('span', 'fxb-active-title', draft.name || 'Untitled project'));
        const save = el('span', 'fxb-save', '');
        save.setAttribute('data-fxb-save', '');
        save.setAttribute('role', 'status');
        save.setAttribute('aria-live', 'polite');
        ident.append(save);
        const status = el('span', 'fxb-status', statusText());
        status.setAttribute('data-fxb-status', '');
        ident.append(status);
        bar.append(ident);
        const tools = el('div', 'fxb-tools');
        const runButton = buttonEl('Run', 'on', () => { syncCode(); showPane('preview'); run(); });
        runButton.title = 'Run in the preview (Ctrl/Cmd+Enter)';
        const stopButton = buttonEl('Stop', '', stop);
        const saveButton = buttonEl('Save', '', () => { syncCode(); persist(); });
        saveButton.title = 'Save a version (Ctrl/Cmd+S)';
        tools.append(runButton, stopButton, saveButton);
        const retry = buttonEl('Retry account sync', 'fxb-ghost', () => { syncCode(); persist(true); });
        retry.title = 'Try saving to your account again';
        retry.setAttribute('data-fxb-retry', '');
        tools.append(retry);
        const installButton = buttonEl('Add to my terminal', 'on', () => {
          const existing = draft.id && state.installs.find(widget => widget.projectId === draft.id && widget.enabled);
          if (existing && Number(existing.version) === Number(draft.version)) uninstall(false);
          else install();
        });
        installButton.setAttribute('data-fxb-install', '');
        installButton.title = 'Adds this tool as a box on your ' + String(T.S?.deskKey || 'current').toUpperCase() + ' desk';
        tools.append(installButton);
        bar.append(tools);

        const side = el('aside', 'fxb-side');
        const editor = el('section', 'fxb-editor');
        const meta = el('div', 'fxb-meta');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'fxb-field fxb-name';
        nameInput.value = draft.name;
        nameInput.maxLength = Core.LIMITS.name;
        nameInput.placeholder = 'Project name';
        nameInput.setAttribute('aria-label', 'Project name');
        nameInput.addEventListener('input', () => {
          draft.name = nameInput.value; markDirty();
          const title = root.querySelector('.fxb-active-title'); if (title) title.textContent = draft.name || 'Untitled project';
        });
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
        select.addEventListener('change', () => { draft.category = select.value; markDirty(); });
        const metaActions = el('div', 'fxb-row');
        metaActions.append(buttonEl('Duplicate', 'fxb-ghost', duplicate), buttonEl('Export', 'fxb-ghost', exportMain), buttonEl('Delete project', 'danger', () => removeProject()));
        const description = document.createElement('input');
        description.type = 'text';
        description.className = 'fxb-field fxb-desc';
        description.maxLength = Core.LIMITS.description;
        description.value = draft.description;
        description.placeholder = 'Short description: what does this tool show?';
        description.setAttribute('aria-label', 'Project description');
        description.addEventListener('input', () => { draft.description = description.value; markDirty(); });
        meta.append(nameInput, select, metaActions, description);
        editor.append(meta);
        const fileBar = el('div', 'fxb-filebar');
        fileBar.append(el('span', 'fxb-tab', 'main.js'));
        const lines = el('span', '', '');
        lines.setAttribute('data-fxb-lines', '');
        fileBar.append(lines, el('span', 'fxb-spacer', ''));
        fileBar.append(buttonEl('Format', 'fxb-ghost', () => {
          if (!cm) { say('Formatting requires the code editor.', 'error'); return; }
          if (cm.lineCount() > 3000) { say('Too many lines to format at once.', 'error'); return; }
          cm.operation(() => { for (let line = 0; line < cm.lineCount(); line++) cm.indentLine(line, 'smart'); });
          syncCode(); markDirty();
          say('Indentation tidied. Run to check it still works.', 'ok');
        }));
        editor.append(fileBar);
        const editorHost = el('div', 'fxb-cmhost');
        editorHost.setAttribute('data-fxb-editor-host', '');
        editor.append(editorHost);
        const find = el('div', 'fxb-find');
        const findInput = document.createElement('input');
        findInput.type = 'search';
        findInput.className = 'fxb-field';
        findInput.placeholder = 'Find (Ctrl/Cmd+F)';
        findInput.setAttribute('aria-label', 'Find in main.js');
        findInput.setAttribute('data-fxb-find', '');
        findInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); findNext(); } });
        const replaceInput = document.createElement('input');
        replaceInput.type = 'text';
        replaceInput.className = 'fxb-field';
        replaceInput.placeholder = 'Replace with';
        replaceInput.setAttribute('aria-label', 'Replace in main.js');
        replaceInput.setAttribute('data-fxb-replace', '');
        find.append(findInput, replaceInput, buttonEl('Find', '', findNext), buttonEl('Replace', '', replaceOne), buttonEl('All', '', replaceAll), buttonEl('Undo', 'fxb-ghost', undo), buttonEl('Redo', 'fxb-ghost', redo));
        editor.append(find);
        const log = el('p', 'fxb-console', '');
        log.setAttribute('data-fxb-console', '');
        log.setAttribute('role', 'log');
        editor.append(log);

        const preview = el('section', 'fxb-preview');
        const split = el('div', 'fxb-split');
        split.setAttribute('data-fxb-split', 'preview');
        split.setAttribute('role', 'separator');
        split.setAttribute('aria-orientation', 'vertical');
        split.setAttribute('aria-label', 'Resize preview');
        split.tabIndex = 0;
        preview.append(split);
        const tabsRow = el('div', 'fxb-tabs');
        tabsRow.setAttribute('role', 'tablist');
        tabsRow.setAttribute('aria-label', 'Builder views');
        for (const [key, label] of [['preview', 'Preview'], ['versions', 'Versions'], ['guide', 'Guide & SDK']]) {
          const tab = buttonEl(label, 'fxb-tabbtn', () => showPane(key));
          tab.id = 'fxb-tab-' + key;
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-controls', 'fxb-pane-' + key);
          tab.setAttribute('data-fxb-tab', key);
          tabsRow.append(tab);
        }
        tabsRow.addEventListener('keydown', event => {
          if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          const tabs = [...tabsRow.querySelectorAll('[role="tab"]')], current = tabs.indexOf(event.target);
          if (current < 0) return;
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length
            : event.key === 'ArrowRight' ? (current + 1) % tabs.length : null;
          if (next === null) return;
          event.preventDefault();
          showPane(tabs[next].dataset.fxbTab);
          tabs[next].focus();
        });
        preview.append(tabsRow);

        const tabPanel = (key, cls = 'fxb-pane') => {
          const node = el('div', cls);
          node.id = 'fxb-pane-' + key;
          node.setAttribute('data-fxb-pane', key);
          node.setAttribute('role', 'tabpanel');
          node.setAttribute('aria-labelledby', 'fxb-tab-' + key);
          node.tabIndex = 0;
          return node;
        };
        const pPane = tabPanel('preview');
        const pHead = el('div', 'fxb-row');
        const runState = el('span', 'fxb-runstate', '○ Stopped');
        runState.setAttribute('data-fxb-runstate', '');
        const liveLabel = document.createElement('label');
        liveLabel.className = 'fxb-check';
        const liveBox = document.createElement('input');
        liveBox.type = 'checkbox';
        liveBox.checked = liveEnabled();
        liveBox.setAttribute('aria-label', 'Live preview');
        liveBox.addEventListener('change', () => { try { localStorage.setItem('fx-term-builder-live', liveBox.checked ? 'on' : 'off'); } catch (e) {} if (liveBox.checked) scheduleLive(); else clearTimeout(liveTimer); });
        liveLabel.append(liveBox, el('span', '', 'Live preview while typing'));
        pHead.append(runState, liveLabel, el('span', 'fxb-spacer', ''), buttonEl('Refresh preview', 'fxb-ghost', () => { syncCode(); run(); }));
        pPane.append(pHead);
        const screen = el('div', 'fxb-screen');
        screen.setAttribute('data-fxb-preview', '');
        pPane.append(screen);
        const note = el('p', 'fxb-note', '');
        note.setAttribute('data-fxb-preview-note', '');
        note.setAttribute('role', 'status');
        note.setAttribute('aria-live', 'polite');
        pPane.append(note);
        pPane.append(el('p', 'fxb-note fxb-fine', 'The preview runs in a locked sandbox: no network, no account access. Prices come from this terminal’s snapshot.'));

        const vPane = tabPanel('versions');
        const versions = el('div', 'fxb-versions');
        versions.setAttribute('data-fxb-versions', '');
        vPane.append(versions);

        const gPane = tabPanel('guide', 'fxb-pane fxb-assist');
        const steps = el('ol', 'fxb-steps');
        for (const [title, text] of [['Write', 'Edit main.js. Your tool is one function: render(root, FYNX).'], ['Run', 'Press Run (or Ctrl/Cmd+Enter) to see it in the preview.'], ['Save', 'It autosaves while you type; Save keeps a named version.'], ['Add to my terminal', 'Puts the tool on your desk as its own box. Only you can see it.']]) {
          const li = document.createElement('li'); li.append(el('b', '', title), el('span', '', text)); steps.append(li);
        }
        gPane.append(el('h2', '', 'How it works'), steps);
        gPane.append(el('h2', '', 'Widget SDK'));
        const sdk = el('dl', 'fxb-sdk');
        for (const [sig, text] of [['render(root, FYNX)', 'Required. Build your tool inside root with document.createElement and textContent.'], ['FYNX.quote("SPY")', '{symbol, price, changePercent} from the terminal snapshot, or null if missing.'], ['FYNX.quotes()', 'Every quote in the current snapshot.'], ['FYNX.format(n, 2)', 'Formats a number with fixed digits.'], ['FYNX.signed(n)', 'Formats a change with + or − sign.'], ['FYNX.onQuotes(fn)', 'Calls fn again when prices refresh (about every 30 s).']]) {
          sdk.append(el('dt', '', sig), el('dd', '', text));
        }
        gPane.append(sdk);
        gPane.append(el('p', 'fxb-note', 'Not allowed: network requests (fetch, WebSocket), innerHTML, storage, cookies and API keys. Symbols: SPY, QQQ, AAPL, BTC-USD, EURUSD=X, GC=F, DX-Y.NYB, ^TNX and anything on your desk.'));
        gPane.append(el('p', 'fxb-note', 'Visibility is private. Community Library, official submission, and external API credentials are not part of this release. Widgets cannot make network requests.'));
        gPane.append(el('h2', '', 'Write it with AI'));
        gPane.append(el('p', 'fxb-note', 'Pick an idea, copy the prompt into any AI assistant, then paste the code it returns into main.js.'));
        const prompt = document.createElement('textarea');
        prompt.className = 'fxb-field';
        prompt.readOnly = true;
        prompt.value = Core.ASSISTANT_PROMPT;
        prompt.setAttribute('aria-label', 'Prompt for an external coding assistant');
        const examples = el('div', 'fxb-row');
        for (const idea of ['Stock scanner', 'Forex calculator', 'Crypto monitor', 'Macro dashboard']) {
          examples.append(buttonEl(idea, 'fxb-ghost', () => {
            prompt.value = Core.ASSISTANT_PROMPT.split('\n').slice(0, -1).join('\n') + '\nBuild this: a ' + idea.toLowerCase() + ' that uses the terminal snapshot and says clearly when a symbol is missing.';
            say('Prompt ready for a ' + idea.toLowerCase() + '. Copy it into an AI assistant.', 'ok');
          }));
        }
        gPane.append(examples, prompt);
        gPane.append(buttonEl('Copy prompt', 'on', async () => {
          try { await navigator.clipboard.writeText(prompt.value); say('Prompt copied.', 'ok'); }
          catch (e) { prompt.focus(); prompt.select(); say('Select the prompt and copy it manually.', 'error'); }
        }));
        gPane.append(el('h2', '', 'Shortcuts'));
        gPane.append(el('p', 'fxb-note', 'Ctrl/Cmd+Enter run · Ctrl/Cmd+S save · Ctrl/Cmd+F find · Ctrl/Cmd+H replace · Tab indent'));
        preview.append(pPane, vPane, gPane);
        bindSplit(split, '--fxb-preview', 380, true, 260, 700);

        root.append(bar, side, editor, preview);
        if (onboardingOpen) {
          const welcome = el('div', 'fxb-welcome');
          welcome.append(el('b', '', 'Welcome to FYNX Builder.'), el('span', '', ' Write a small JavaScript tool, press Run to preview it, then Add to my terminal. It autosaves and only you can see it.'));
          welcome.append(buttonEl('Got it', 'fxb-ghost', () => {
            onboardingOpen = false; welcome.remove();
            try { localStorage.setItem('fx-term-builder-tour:' + state.uid, 'seen'); } catch (e) {}
          }), buttonEl('Show guide', 'fxb-ghost', () => showPane('guide')));
          editor.insertBefore(welcome, meta);
        }
        fillSide(side);
        mountEditor(draft.main);
        updateLines();
        const label = dirty ? ['Unsaved changes', 'warn'] : (!draft.id ? ['Not saved yet', 'warn'] : (byId(draft.id)?.stored === 'account' ? ['Saved · v' + draft.version, 'on'] : ['Saved on this browser · v' + draft.version, 'warn']));
        setSaveLabel(label[0], label[1]);
        say(consoleText, consoleLevel);
        previewNote('Ready.', false);
        showPane(paneTab);
        updateStatus();
        // Show the tool straight away; the sandbox is isolated, so an automatic run is safe.
        requestAnimationFrame(() => { if (root.isConnected && draft.main && !Core.syntaxError(draft.main)) run({quiet: true}); });
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
          clearTimeout(draftTimer);
          clearTimeout(cloudTimer);
          if (state.uid === seenUid && captureDraft && captureDraft() === draft) {
            // Leaving a page must never discard a change still in debounce.
            writeDevice(state.uid);
            captureDraft = () => null;
          }
          return;
        }
        if (state.uid !== seenUid) {
          const previous = seenUid;
          seenUid = state.uid;
          if (previous && previous !== state.uid) {
            dirty = false;
            try { onboardingOpen = !localStorage.getItem('fx-term-builder-tour:' + state.uid); } catch (e) { onboardingOpen = false; }
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
