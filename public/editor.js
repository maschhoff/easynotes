/* ============================================================
   editor.js — WYSIWYG/MD editor, uploads, tags, save
   ============================================================ */
'use strict';
// A is declared once in core.js (window.App); referenced here as global.

/* ---------- Show editor for a note ---------- */
A.showEditor = function (note) {
  // Alle Übersichts-Views ausblenden, damit der Editor nie zusammen mit
  // Pinnwand/Favoriten/Tags/Willkommen angezeigt wird (Standalone-Ansicht).
  ['#welcome', '#pinboard', '#favview', '#tagsview'].forEach(sel => {
    A.$(sel)?.classList.add('hidden');
  });
  const ed = A.$('#editor');
  ed.classList.remove('hidden');

  A.$('#note-title').value = note.name;
  renderTags(note.tags || []);

  const md = note.content || '';
  if (A.state.editorMode === 'wysiwyg') {
    A.$('#mdsrc').classList.add('hidden');
    A.$('#wysiwyg').classList.remove('hidden');
    A.$('#wysiwyg').innerHTML = A.mdToHtml(md);
  } else {
    A.$('#wysiwyg').classList.add('hidden');
    A.$('#mdsrc').classList.remove('hidden');
    A.$('#mdsrc').value = md;
  }
  updatePlaceholder();
  updatePageFavPinState();
};

/* Favorit-/Pin-Schalter für die aktuelle Seite aktualisieren */
function updatePageFavPinState() {
  const p = A.state.currentPath;
  const favBtn = A.$('#btn-toggle-fav');
  const pinBtn = A.$('#btn-toggle-pin');
  const tplBtn = A.$('#btn-template');
  const note = A.state.currentNote;
  if (favBtn) favBtn.classList.toggle('active', !!(p && (A.settings.favorites || []).includes(p)));
  if (pinBtn) pinBtn.classList.toggle('active', !!(p && (A.settings.pinned || []).includes(p)));
  if (tplBtn) tplBtn.classList.toggle('active', !!(note && note.isTemplate));
}
A.updatePageFavPinState = updatePageFavPinState;

A.hideEditor = function () {
  A.$('#editor').classList.add('hidden');
  A.$('#welcome')?.classList.remove('hidden');
  A.state.currentNote = null;
  A.state.currentPath = null;
};

/* ---------- get current content as markdown ---------- */
A.getMarkdown = function () {
  if (A.state.editorMode === 'md') {
    return A.$('#mdsrc').value;
  }
  return htmlToPlain(A.$('#wysiwyg').innerHTML);
};
function htmlToPlain(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  div.querySelectorAll('h1,h2,h3,h4').forEach(h => {
    h.replaceWith('\n' + '#'.repeat(+h.tagName[1]) + ' ' + h.textContent.trim() + '\n');
  });
  div.querySelectorAll('li').forEach(li => {
    const ordered = li.parentElement && li.parentElement.tagName === 'OL';
    li.replaceWith('\n' + (ordered ? '1. ' : '- ') + li.textContent.trim());
  });
  // todo items: keep checkbox state in markdown as - [ ] / - [x]
  div.querySelectorAll('.todo-item').forEach(ti => {
    const cb = ti.querySelector('input[type=checkbox]');
    const lbl = ti.querySelector('.todo-lbl');
    const state = cb && cb.checked ? 'x' : ' ';
    const txt = lbl ? lbl.textContent.trim() : '';
    ti.replaceWith('- [' + state + '] ' + txt);
  });
  div.querySelectorAll('blockquote').forEach(bq => {
    bq.replaceWith('\n' + bq.textContent.split('\n').map(l => '> ' + l.trim()).join('\n') + '\n');
  });
  div.querySelectorAll('pre').forEach(pre => pre.replaceWith('\n```\n' + pre.textContent + '\n```\n'));
  div.querySelectorAll('code').forEach(c => { if (!c.closest('pre')) c.replaceWith('`' + c.textContent + '`'); });
  div.querySelectorAll('a').forEach(a => a.replaceWith('[' + a.textContent + '](' + a.href + ')'));
  div.querySelectorAll('img').forEach(img => img.replaceWith('![](' + (img.getAttribute('src') || '') + ')'));
  div.querySelectorAll('.md-attach').forEach(a => a.replaceWith('[' + (a.dataset.name || a.textContent) + '](' + a.href + ')'));
  div.querySelectorAll('hr').forEach(hr => hr.replaceWith('\n---\n'));
  let text = div.textContent || '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- tags ---------- */
function renderTags(tags) {
  const list = A.$('#tag-list');
  list.innerHTML = '';
  for (const tg of tags) {
    const span = document.createElement('span');
    span.className = 'tag-pill';
    span.innerHTML = A.esc(tg) + '<span class="x" data-tag="' + A.esc(tg) + '">×</span>';
    list.appendChild(span);
  }
}
function currentTags() {
  return Array.from(A.$('#tag-list').querySelectorAll('.tag-pill')).map(p => p.textContent.replace('×', '').trim());
}

/* ---------- save ---------- */
let saveTimer;
A.saveCurrent = async function (auto = false, { final = false } = {}) {
  if (!A.state.currentPath) return null;
  const stateEl = A.$('#save-state');
  stateEl.textContent = A.t('saving');
  const tags = settingsTagsEnabled() ? currentTags() : [];
  try {
    const res = await A.api('/api/note', { method: 'POST', body: {
      path: A.state.currentPath, content: A.getMarkdown(), tags, isNew: false
    } });
    A.state.dirty = false;
    stateEl.textContent = A.t('saved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { stateEl.textContent = ''; }, 1500);
    return res;
  } catch (err) {
    stateEl.textContent = '⚠';
    if (!auto) A.toast(err.message, true);
    throw err;
  }
};
function settingsTagsEnabled() { return A.settings.tagsEnabled !== false; }

/* ---------- editor mode toggle ---------- */
A.toggleEditorMode = function () {
  const md = A.getMarkdown();
  if (A.state.editorMode === 'wysiwyg') {
    A.state.editorMode = 'md';
    A.$('#wysiwyg').classList.add('hidden');
    const ta = A.$('#mdsrc');
    ta.classList.remove('hidden');
    ta.value = md;
    A.$('#btn-view').classList.add('tb-btn-active');
  } else {
    A.state.editorMode = 'wysiwyg';
    A.$('#mdsrc').classList.add('hidden');
    const w = A.$('#wysiwyg');
    w.classList.remove('hidden');
    w.innerHTML = A.mdToHtml(taValue());
    A.$('#btn-view').classList.remove('tb-btn-active');
  }
  updatePlaceholder();
};
function taValue() { return A.$('#mdsrc').value; }

/* ---------- exec command (toolbar) ---------- */
function execCmd(cmd, val) {
  A.$('#wysiwyg').focus();
  if (cmd === 'createLink') {
    const url = prompt(A.t('linkUrl'), 'https://');
    if (!url) return;
    document.execCommand('createLink', false, url);
    return;
  }
  if (cmd === 'formatBlock') {
    document.execCommand('formatBlock', false, val || 'p');
    return;
  }
  if (cmd === 'insertCheckbox') {
    insertCheckboxWysiwyg();
    return;
  }
  document.execCommand(cmd, false, val || null);
}

/* ---------- todo / checkbox ---------- */
function insertCheckboxWysiwyg() {
  const w = A.$('#wysiwyg');
  w.focus();
  const br = document.createElement('div');
  br.className = 'todo-item';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'todo-cb';
  const lab = document.createElement('span');
  lab.className = 'todo-lbl';
  lab.contentEditable = 'true';
  lab.textContent = A.t('todoItem');
  br.appendChild(box);
  br.appendChild(lab);
  const sel = window.getSelection();
  if (sel && sel.rangeCount && w.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    w.appendChild(br);
  }
  w.appendChild(document.createElement('br'));
  markDirty();
  if (lab.focus) lab.focus();
}

/* ---------- upload handlers ---------- */
function currentFolder() {
  if (!A.state.currentPath) return '';
  return A.state.currentPath.split('/').slice(0, -1).join('/');
}

async function uploadFile(file, isImage) {
  if (!A.state.currentPath) { A.toast(A.t('saveFirst'), true); return null; }
  const fd = new FormData();
  fd.append('file', file);
  fd.append('folder', currentFolder());
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload fehlgeschlagen');
  return data;
}

function insertMdLink(link) {
  const t = (link.isImage ? `\n![${link.filename}](${link.url})\n` : `\n[${link.filename}](${link.url})\n`);
  const ta = A.$('#mdsrc');
  if (A.state.editorMode === 'md') {
    ta.value = (ta.value ? (ta.value.endsWith('\n') ? ta.value : ta.value + '\n\n') : '') + t.trim();
    ta.dispatchEvent(new Event('input'));
    return;
  }
  const w = A.$('#wysiwyg');
  w.focus();
  let node;
  if (link.isImage) {
    const img = document.createElement('img');
    img.src = link.url;
    img.alt = link.filename;
    node = img;
  } else {
    const a = document.createElement('a');
    a.className = 'md-attach';
    a.href = link.url;
    a.dataset.name = link.filename;
    a.innerHTML = '📎 ' + A.esc(link.filename);
    node = a;
  }
  // Robust insertion into the contenteditable caret (works even after await)
  const sel = window.getSelection();
  if (sel && sel.rangeCount && w.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    w.appendChild(node);
  }
  w.appendChild(document.createElement('br'));
  markDirty();
  // ensure the change reaches the underlying markdown and triggers a save
  w.dispatchEvent(new Event('input', { bubbles: true }));
}

function markDirty() { A.state.dirty = true; }

async function handleFiles(files) {
  for (const f of files) {
    const isImage = f.type.startsWith('image/');
    try {
      const link = await uploadFile(f, isImage);
      insertMdLink(link);
      A.toast(isImage ? A.t('imageSaved') : A.t('fileSaved'));
    } catch (err) { A.toast(err.message, true); }
  }
}

/* ---------- placeholder ---------- */
function updatePlaceholder() {
  const w = A.$('#wysiwyg');
  if (w) w.dataset.placeholder = A.t('welcomeDesc').split('.')[0] + '…';
}

/* ---------- edit events ---------- */
A.editorInit = function () {
  const w = A.$('#wysiwyg');
  const ta = A.$('#mdsrc');
  const title = A.$('#note-title');

  w.addEventListener('input', markDirty);
  ta.addEventListener('input', markDirty);
  title.addEventListener('input', markDirty);

  // paste handling: auto-upload pasted images
  w.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      handleFiles(files);
    }
  });

  // toolbar
  A.$$('#editor-toolbar .tb-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (A.state.editorMode === 'md') {
        // in md mode, apply simple text transformations
        applyMdCommand(btn.dataset.cmd);
      } else {
        execCmd(btn.dataset.cmd, btn.dataset.val);
        markDirty();
      }
    });
  });

  // upload buttons
  A.$('#btn-upload-img').addEventListener('click', () => A.$('#file-input-img').click());
  A.$('#btn-upload-file').addEventListener('click', () => A.$('#file-input-file').click());
  A.$('#file-input-img').addEventListener('change', (e) => { handleFiles(Array.from(e.target.files)); e.target.value = ''; });
  A.$('#file-input-file').addEventListener('change', (e) => { handleFiles(Array.from(e.target.files)); e.target.value = ''; });

  // view toggle
  A.$('#btn-view').addEventListener('click', () => { A.toggleEditorMode(); });

  // manual save button in the toolbar
  A.$('#btn-save').addEventListener('click', async () => {
    if (!A.state.currentPath) { A.toast(A.t('saveFirst'), true); return; }
    try { await A.saveCurrent(false); A.toast(A.t('saved')); }
    catch (err) { A.toast(err.message, true); }
  });

  // PDF export (save as PDF via print dialog)
  A.$('#btn-pdf').addEventListener('click', () => {
    if (!A.state.currentPath) { A.toast(A.t('saveFirst'), true); return; }
    // save current content first so the printed page reflects edits
    A.saveCurrent(false).then(() => {
      window.open('/api/note/pdf?path=' + encodeURIComponent(A.state.currentPath), '_blank');
    }).catch(() => {});
  });

  // tags
  const tagInput = A.$('#tag-input');
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = tagInput.value.trim();
      if (v && !currentTags().includes(v)) {
        const list = A.$('#tag-list');
        const span = document.createElement('span');
        span.className = 'tag-pill';
        span.innerHTML = A.esc(v) + '<span class="x" data-tag="' + A.esc(v) + '">×</span>';
        list.appendChild(span);
        markDirty();
      }
      tagInput.value = '';
    }
  });
  A.$('#tag-list').addEventListener('click', (e) => {
    const x = e.target.closest('.x');
    if (x) { x.parentElement.remove(); markDirty(); }
  });

  // title change: rename note on blur (debounced)
  title.addEventListener('blur', async () => {
    const newName = title.value.trim();
    if (newName && A.state.currentNote && newName !== A.state.currentNote.name) {
      try {
        await A.api('/api/rename', { method: 'POST', body: { path: A.state.currentPath, name: newName, type: 'note' } });
        A.state.currentPath = A.state.currentPath.split('/').slice(0, -1).concat(newName + '.md').join('/');
        A.state.currentNote.name = newName;
        await A.refreshTree();
      } catch (err) { A.toast(err.message, true); }
    }
  });

  // page actions
  A.$('#btn-toggle-fav').addEventListener('click', async () => {
    const p = A.state.currentPath;
    if (!p) return;
    const favs = (A.settings.favorites || []).slice();
    const i = favs.indexOf(p);
    if (i >= 0) favs.splice(i, 1); else favs.push(p);
    A.settings.favorites = favs;
    try {
      await A.api('/api/settings', { method: 'POST', body: { favorites: favs } });
      updatePageFavPinState();
      A.toast(i >= 0 ? A.t('favoriteRemove') : A.t('favoriteAdd'));
    } catch (e) { A.toast(e.message, true); }
  });
  A.$('#btn-toggle-pin').addEventListener('click', async () => {
    const p = A.state.currentPath;
    if (!p) return;
    const pinned = (A.settings.pinned || []).slice();
    const i = pinned.indexOf(p);
    if (i >= 0) pinned.splice(i, 1); else pinned.push(p);
    A.settings.pinned = pinned;
    try {
      await A.api('/api/settings', { method: 'POST', body: { pinned } });
      updatePageFavPinState();
      A.toast(i >= 0 ? A.t('unpin') : A.t('pinToBoard'));
    } catch (e) { A.toast(e.message, true); }
  });
  A.$('#btn-copy-page').addEventListener('click', async () => {
    if (!A.state.currentPath) return;
    try {
      const res = await A.api('/api/duplicate', { method: 'POST', body: { path: A.state.currentPath } });
      await A.refreshTree();
      A.toast(A.t('copy'));
      openNote(res.path);
    } catch (err) { A.toast(err.message, true); }
  });
  A.$('#btn-delete-page').addEventListener('click', async () => {
    if (!A.state.currentPath) return;
    if (!confirm(A.t('deleteConfirm'))) return;
    try {
      await A.api('/api/item', { method: 'DELETE', body: { path: A.state.currentPath, type: 'note' } });
      A.hideEditor();
      await A.refreshTree();
    } catch (err) { A.toast(err.message, true); }
  });

  // template toggle
  A.$('#btn-template').addEventListener('click', async () => {
    const p = A.state.currentPath;
    if (!p) return;
    const next = !(A.state.currentNote && A.state.currentNote.isTemplate);
    try {
      await A.api('/api/note/template', { method: 'POST', body: { path: p, isTemplate: next } });
      A.state.currentNote.isTemplate = next;
      updatePageFavPinState();
      A.toast(next ? A.t('markAsTemplate') : A.t('unmarkTemplate'));
    } catch (err) { A.toast(err.message, true); }
  });

  // versions modal
  A.$('#btn-versions').addEventListener('click', openVersions);
  A.$('#versions-modal')?.addEventListener('click', (e) => {
    if (e.target === A.$('#versions-modal')) A.$('#versions-modal').classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      A.saveCurrent(false);
    }
  });

  // drag & drop upload onto editor
  ['dragenter', 'dragover'].forEach(ev => {
    w.addEventListener(ev, (e) => { e.preventDefault(); A.$('#drop-overlay').classList.remove('hidden'); });
  });
  ['dragleave', 'drop'].forEach(ev => {
    w.addEventListener(ev, (e) => {
      e.preventDefault();
      A.$('#drop-overlay').classList.add('hidden');
      if (ev === 'drop') { handleFiles(Array.from(e.dataTransfer.files)); }
    });
  });
};

/* ---------- open versions modal ---------- */
async function openVersions() {
  const p = A.state.currentPath;
  if (!p) return;
  const list = A.$('#versions-list');
  const modal = A.$('#versions-modal');
  list.innerHTML = '<div class="muted">' + A.esc(A.t('noVersions')) + '</div>';
  modal.classList.remove('hidden');
  let versions = [];
  try { versions = await A.api('/api/note/versions?path=' + encodeURIComponent(p)); }
  catch (e) { list.innerHTML = '<div class="muted" style="color:var(--danger)">' + A.esc(e.message) + '</div>'; return; }
  if (!versions.length) { list.innerHTML = '<div class="muted">' + A.esc(A.t('noVersions')) + '</div>'; return; }
  list.innerHTML = versions.map(v => {
    const t = new Date(v.updated);
    const ts = t.toLocaleString();
    return '<div class="version-item" data-ver="' + A.esc(v.name) + '">' +
      '<span class="vtime">' + A.esc(ts) + '</span>' +
      '<button class="btn-secondary v-preview" data-ver="' + A.esc(v.name) + '">' + A.esc(A.t('view')) + '</button>' +
      '<button class="btn-primary v-restore" data-ver="' + A.esc(v.name) + '">' + A.esc(A.t('restore')) + '</button>' +
      '</div>';
  }).join('');
  list.querySelectorAll('.v-restore').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ver = btn.dataset.ver;
      if (!confirm(A.t('restoreConfirm'))) return;
      try {
        await A.api('/api/note/restore', { method: 'POST', body: { path: p, version: ver } });
        modal.classList.add('hidden');
        // reload the note to show restored content
        const note = await A.api('/api/note?path=' + encodeURIComponent(p));
        A.state.currentNote = note;
        A.showEditor(note);
        A.toast(A.t('versionRestored'));
      } catch (e) { A.toast(e.message, true); }
    });
  });
  list.querySelectorAll('.v-preview').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ver = btn.dataset.ver;
      try {
        const v = await A.api('/api/note/version?path=' + encodeURIComponent(p) + '&version=' + encodeURIComponent(ver));
        const preview = A.$('#version-preview');
        if (!preview) { A.toast('#' + ver); return; }
        preview.classList.remove('hidden');
        preview.textContent = v.content || '';
      } catch (e) { A.toast(e.message, true); }
    });
  });
}


// simple md-mode toolbar commands (text insertion)
function applyMdCommand(cmd) {
  const ta = A.$('#mdsrc');
  ta.focus();
  const sel = ta.selectionStart, end = ta.selectionEnd;
  const v = ta.value, selected = v.substring(sel, end) || 'Text';
  let out = v;
  const wrap = (pre, post) => {
    out = v.slice(0, sel) + pre + selected + post + v.slice(end);
    ta.value = out; ta.selectionStart = sel + pre.length; ta.selectionEnd = sel + pre.length + selected.length;
  };
  const startLine = () => { const s = v.lastIndexOf('\n', sel - 1) + 1; return s; };
  if (cmd === 'bold') wrap('**', '**');
  else if (cmd === 'italic') wrap('_', '_');
  else if (cmd === 'strikethrough') wrap('~~', '~~');
  else if (cmd === 'h1' || cmd === 'h2' || cmd === 'h3') {
    const s = startLine(), hashes = '#' + ''; const n = +cmd[1];
    out = v.slice(0, s) + '#'.repeat(n) + ' ' + v.slice(s);
    ta.value = out;
  } else if (cmd === 'insertUnorderedList') { const s = startLine(); out = v.slice(0, s) + '- ' + v.slice(s); ta.value = out; }
  else if (cmd === 'insertCheckbox') { const s = startLine(); out = v.slice(0, s) + '- [ ] ' + v.slice(s); ta.value = out; }
  else if (cmd === 'insertOrderedList') { const s = startLine(); out = v.slice(0, s) + '1. ' + v.slice(s); ta.value = out; }
  else if (cmd === 'formatBlock' && A.$('#btn-view').dataset.val === 'blockquote') { const s = startLine(); out = v.slice(0, s) + '> ' + v.slice(s); ta.value = out; }
  markDirty();
}

async function openNote(path) {
  if (A.state.dirty) { try { await A.saveCurrent(); } catch (e) {} }
  try {
    const note = await A.api('/api/note?path=' + encodeURIComponent(path));
    A.state.currentNote = note;
    A.state.currentPath = note.path;
    A.state.dirty = false;
    A.showEditor(note);
    A.$('#note-title').focus();
  } catch (err) { A.toast(err.message, true); }
}
A.openNote = openNote;

// Public API: make headline editor helpers available to other modules (drawing.js).
A.insertMdLink = insertMdLink;
A.getMarkdown = A.getMarkdown;
