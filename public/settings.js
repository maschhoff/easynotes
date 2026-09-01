/* ============================================================
   import.js — OneNote (onenote-md-exporter) import + settings/i18n
   ============================================================ */
'use strict';
// A is declared once in core.js (window.App); referenced here as global.

let selectedArchive = null;

A.importInit = function () {
  A.$('#btn-import').addEventListener('click', openImportModal);
  A.$('#btn-import-refresh').addEventListener('click', loadImportList);
  A.$('#btn-import-confirm').addEventListener('click', runImport);
  // zip upload
  const upBtn = A.$('#btn-import-upload');
  const input = A.$('#import-file-input');
  upBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const status = A.$('#import-upload-status');
    status.textContent = '⬆️ ' + A.esc(file.name) + ' …';
    upBtn.disabled = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/import-upload', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
      status.textContent = '✅ ' + A.esc(data.name);
      selectedArchive = data.name;
      A.$('#import-target-wrap').classList.remove('hidden');
      A.$('#import-target').value = '';
      await loadImportList();
    } catch (err) {
      status.textContent = '❌ ' + A.esc(err.message);
    } finally {
      upBtn.disabled = false;
    }
  });
};

async function openImportModal() {
  selectedArchive = null;
  A.$('#import-target').value = '';
  A.$('#import-target-wrap').classList.add('hidden');
  A.$('#import-result').classList.add('hidden');
  A.$('#import-result').innerHTML = '';
  A.$('#import-modal').classList.remove('hidden');
  await loadImportList();
}

async function loadImportList() {
  const list = A.$('#import-list');
  list.innerHTML = '<div class="muted">Lädt…</div>';
  try {
    const items = await A.api('/api/imports');
    if (!items.length) {
      list.innerHTML = '<div class="muted">' + A.t('noImports') + '</div>';
      return;
    }
    list.innerHTML = '';
    for (const it of items) {
      const d = document.createElement('div');
      d.className = 'import-item';
      d.dataset.name = it.name;
      d.innerHTML = '<span class="ic">' + (it.isDir ? '📁' : '🗜️') + '</span><span>' + A.esc(it.name) + '</span>';
      d.addEventListener('click', () => {
        list.querySelectorAll('.import-item').forEach(x => x.classList.remove('selected'));
        d.classList.add('selected');
        selectedArchive = it.name;
        A.$('#import-target-wrap').classList.remove('hidden');
      });
      list.appendChild(d);
    }
  } catch (err) {
    list.innerHTML = '<div class="error" style="color:var(--danger)">' + A.esc(err.message) + '</div>';
  }
}

async function runImport() {
  if (!selectedArchive) { A.toast(A.t('importTitle'), true); return; }
  const rez = A.$('#import-result');
  rez.classList.remove('hidden');
  rez.className = '';
  rez.textContent = 'Importiere…';
  A.$('#btn-import-confirm').disabled = true;
  try {
    const data = await A.api('/api/import', { method: 'POST', body: {
      archive: selectedArchive,
      destFolder: A.$('#import-target').value.trim()
    } });
    rez.className = '';
    rez.textContent = '✅ ' + (data.dest || '') +
      ' — ' + (data.pages || 0) + ' Seiten, ' + (data.assets || 0) + ' Assets';
    A.$('#btn-import-confirm').disabled = false;
    await A.refreshTree();
  } catch (err) {
    rez.classList.add('error');
    rez.textContent = A.t('aiError') + ': ' + err.message;
    A.$('#btn-import-confirm').disabled = false;
  }
}

/* ---------- settings: modal page, lock, i18n ---------- */
A.applySettings = function () {
  const s = A.settings;
  document.documentElement.lang = s.lang || 'de';

  // theme
  let theme = s.theme || 'light';
  if (theme === 'auto') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  A.$('#icon-sun').classList.toggle('hidden', theme !== 'dark');
  A.$('#icon-moon').classList.toggle('hidden', theme === 'dark');

  // language select (topbar + settings) + i18n texts
  const sel = A.$('#sel-lang');
  if (sel) sel.value = s.lang || 'de';
  const sL = A.$('#sett-lang');
  if (sL) sL.value = s.lang || 'de';
  const sT = A.$('#sett-theme');
  if (sT) sT.value = s.theme || 'light';
  const sTags = A.$('#sett-tags');
  if (sTags) sTags.checked = s.tagsEnabled !== false;
  const sVers = A.$('#sett-versions');
  if (sVers) sVers.value = (typeof s.versionHistory === 'number' ? s.versionHistory : 3);
  const sStart = A.$('#sett-startpage');
  if (sStart) sStart.value = s.startPage || 'pinboard';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = A.t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = A.t(el.dataset.i18nPh || el.dataset.i18n);
  });
  document.title = A.t('appname') + ' · EasyNotes';
  // tags on/off
  A.$('#tag-wrap').style.display = A.settings.tagsEnabled === false ? 'none' : '';
  // prefill AI keys in settings modal
  const ai = s.ai || {};
  const provSel = A.$('#sett-provider');
  const active = A.getActiveAIProvider ? A.getActiveAIProvider() : (ai.activeProvider || 'deepseek');
  if (provSel) provSel.value = active;
  ['deepseek', 'claude', 'openai', 'gemini'].forEach(k => {
    const el = A.$('#sett-key-' + k);
    if (el) el.value = (ai[k] && ai[k].apiKey) || '';
  });
};

A.openSettings = function () {
  A.$('#sett-pin').value = '';
  A.applySettings();
  A.$('#settings-modal').classList.remove('hidden');
};

A.settingsInit = function () {
  const sel = A.$('#sel-lang');
  sel.addEventListener('change', async function () {
    A.settings.lang = this.value;
    await A.api('/api/settings', { method: 'POST', body: { lang: this.value } });
    A.applySettings();
  });

  A.$('#btn-darkmode').addEventListener('click', async function () {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    A.settings.theme = next;
    await A.api('/api/settings', { method: 'POST', body: { theme: next } });
    A.applySettings();
  });

  // Settings modal bindings
  A.$('#btn-settings').addEventListener('click', A.openSettings);
  A.$('#btn-settings-cancel').addEventListener('click', () => A.$('#settings-modal').classList.add('hidden'));
  A.$('#sett-lang').addEventListener('change', async function () {
    A.settings.lang = this.value;
    await A.api('/api/settings', { method: 'POST', body: { lang: this.value } });
    A.applySettings();
  });
  A.$('#sett-theme').addEventListener('change', async function () {
    A.settings.theme = this.value;
    await A.api('/api/settings', { method: 'POST', body: { theme: this.value } });
    A.applySettings();
  });
  A.$('#sett-tags').addEventListener('change', async function () {
    A.settings.tagsEnabled = this.checked;
    await A.api('/api/settings', { method: 'POST', body: { tagsEnabled: this.checked } });
    A.applySettings();
  });
  A.$('#sett-startpage').addEventListener('change', async function () {
    A.settings.startPage = this.value;
    await A.api('/api/settings', { method: 'POST', body: { startPage: this.value } });
  });
  A.$('#sett-versions').addEventListener('change', async function () {
    const v = Math.max(0, parseInt(this.value, 10) || 3);
    A.settings.versionHistory = v;
    await A.api('/api/settings', { method: 'POST', body: { versionHistory: v } });
  });

  A.$('#btn-settings-save').addEventListener('click', async () => {
    const patch = {};
    const ai = A.settings.ai || {};
    for (const k of ['deepseek', 'claude', 'openai', 'gemini']) {
      const el = A.$('#sett-key-' + k);
      const v = el ? el.value.trim() : '';
      ai[k] = Object.assign({}, ai[k] || {}, { apiKey: v });
    }
    const provSel = A.$('#sett-provider');
    if (provSel) ai.activeProvider = provSel.value;
    patch.ai = ai;
    const startPageEl = A.$('#sett-startpage');
    if (startPageEl) patch.startPage = startPageEl.value;
    const versionsEl = A.$('#sett-versions');
    if (versionsEl) patch.versionHistory = Math.max(0, parseInt(versionsEl.value, 10) || 3);
    const pinEl = A.$('#sett-pin');
    if (pinEl && pinEl.value) {
      patch.pin = pinEl.value;
      patch.currentPin = '';
    }
    try {
      await A.api('/api/settings', { method: 'POST', body: patch });
      A.settings = await A.api('/api/settings');
      A.applySettings();
      A.$('#settings-modal').classList.add('hidden');
      A.toast(A.t('settingsSaved'));
    } catch (e) { A.toast(e.message, true); }
  });

  A.$('#btn-pin-remove').addEventListener('click', async () => {
    try {
      await A.api('/api/settings', { method: 'POST', body: { clearPin: true } });
      A.settings = await A.api('/api/settings');
      A.$('#sett-pin').value = '';
      A.toast(A.t('pinRemoved'));
    } catch (e) { A.toast(e.message, true); }
  });

  // Backup / Export as ZIP
  const backupBtn = A.$('#btn-backup-now');
  if (backupBtn) backupBtn.addEventListener('click', () => {
    try {
      // Serverseitig erzeugte ZIP direkt herunterladen (Session-Cookie wird automatisch mitgesendet)
      window.location = '/api/export';
      A.toast(A.t('backupDesc'));
    } catch (e) { A.toast(e.message, true); }
  });

  // close settings when clicking the backdrop
  A.$('#settings-modal').addEventListener('click', (e) => {
    if (e.target === A.$('#settings-modal') || e.target.closest('[data-close]')) {
      A.$('#settings-modal').classList.add('hidden');
    }
  });
};

/* ---------- PIN lock screen ---------- */
A.initLockScreen = async function () {
  const ls = A.$('#lockscreen');
  const input = A.$('#lockscreen-pin');
  const unlock = A.$('#lockscreen-unlock');
  const closeBtn = A.$('#lockscreen-close');

  const s = A.settings;
  if (!s.pinHash) return; // no PIN set -> always open

  // Ask the server whether this browser already holds a valid unlock session
  // (HttpOnly cookie set after a successful PIN entry). This replaces the old
  // client-side sessionStorage flag, which could be bypassed.
  async function checkUnlocked() {
    try {
      const r = await fetch('/api/lock-status');
      const d = await r.json().catch(() => ({}));
      if (d && d.unlocked) {
        ls.classList.add('hidden');
        return true;
      }
    } catch (e) { /* fall through to show lock */ }
    return false;
  }

  const already = await checkUnlocked();
  if (already) return;

  ls.classList.remove('hidden');
  input.focus();
  if (closeBtn) closeBtn.classList.remove('hidden');

  async function tryUnlock() {
    const pin = input.value;
    if (!pin) { input.focus(); return; }
    try {
      const r = await fetch('/api/verify-pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        // Session cookie is now set server-side; refresh the tree.
        ls.classList.add('hidden');
        A.$('#lock-error').classList.add('hidden');
        await A.refreshTree();
        // Nach dem Entsperren die konfigurierte Startseite anzeigen (Standard: Pinnwand)
        if ((A.settings.startPage || 'pinboard') === 'pinboard' && typeof A.showPinboard === 'function') {
          A.showPinboard();
        }
      } else {
        A.$('#lock-error').classList.remove('hidden');
        input.value = '';
        input.focus();
      }
    } catch (e) {
      A.$('#lock-error').classList.remove('hidden');
    }
  }
  unlock.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  if (closeBtn) closeBtn.addEventListener('click', () => { window.location.href = '/'; });
};

