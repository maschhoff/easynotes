/* ============================================================
   tags.js — Tags-Seite: Übersicht, Suche & Filter
   Feature 3: Tags einsehen & filtern, Suche oben, Pinnwand-Layout.
   ============================================================ */
'use strict';
// A in core.js (window.App)

let _allTagsCache = [];
let _activeTag = null;   // null = alle Notizen, sonst Tag-Name

function hideAllTagsViews() {
  A.$('#welcome')?.classList.add('hidden');
  A.$('#editor')?.classList.add('hidden');
  A.$('#favview')?.classList.add('hidden');
  A.$('#pinboard')?.classList.add('hidden');
  A.$('#tagsview')?.classList.add('hidden');
}

A.tagsInit = function () {
  A.$('#btn-show-tags')?.addEventListener('click', showTagsView);
  A.$('#btn-tags-close')?.addEventListener('click', () => {
    hideAllTagsViews();
    if (A.state.currentPath && A.state.currentNote) {
      A.$('#editor')?.classList.remove('hidden');
    } else {
      // zurück zur Startseite-Anzeige
      if ((A.settings.startPage || 'pinboard') === 'pinboard') A.showPinboard();
      else A.$('#welcome')?.classList.remove('hidden');
    }
  });
  A.$('#btn-tags-all')?.addEventListener('click', () => {
    _activeTag = null;
    renderTagNotes();
  });
  A.$('#btn-tags-back')?.addEventListener('click', () => {
    _activeTag = null;
    showTagsCloud();
  });
  A.$('#tags-search')?.addEventListener('input', (e) => {
    const q = (e.target.value || '').toLowerCase().trim();
    A.$$('#tags-cloud .tag-badge').forEach(b => {
      const t = (b.dataset.tag || '').toLowerCase();
      b.classList.toggle('hidden', !!q && t.indexOf(q) === -1);
    });
  });
};

async function showTagsView() {
  if (A.state.dirty) await A.saveCurrent(false, true);
  hideAllTagsViews();
  A.$('#tagsview').classList.remove('hidden');
  A.$('#tags-search').value = '';
  try {
    _allTagsCache = await A.api('/api/tags');
  } catch (e) { _allTagsCache = []; }
  _activeTag = null;
  showTagsCloud();
}
A.showTagsView = showTagsView;

function showTagsCloud() {
  A.$('#tags-cloud').classList.remove('hidden');
  A.$('#tag-notes-wrap').classList.add('hidden');
  const cloud = A.$('#tags-cloud');
  if (!_allTagsCache.length) {
    cloud.innerHTML = '<div class="pin-empty">' + A.esc(A.t('noTags')) + '</div>';
    return;
  }
  cloud.innerHTML = _allTagsCache.map(t =>
    '<span class="tag-badge" data-tag="' + A.esc(t.tag) + '">#' + A.esc(t.tag) +
    ' <span class="cnt">' + t.count + '</span></span>'
  ).join('');
  A.$$('#tags-cloud .tag-badge').forEach(b => {
    b.addEventListener('click', () => {
      _activeTag = b.dataset.tag;
      renderTagNotes();
    });
  });
}

async function renderTagNotes() {
  A.$('#tags-cloud').classList.add('hidden');
  const wrap = A.$('#tag-notes-wrap');
  wrap.classList.remove('hidden');
  const title = A.$('#tag-notes-title');
  title.textContent = _activeTag ? '#' + _activeTag : A.t('allNotes');
  const grid = A.$('#tag-notes');
  let list = [];
  try {
    list = _activeTag
      ? await A.api('/api/notes-by-tags?tags=' + encodeURIComponent(_activeTag))
      : await A.api('/api/notes-by-tags?tags=');
  } catch (e) { list = []; }
  if (!list.length) {
    grid.innerHTML = '<div class="pin-empty">' + A.esc(A.t('favEmpty')) + '</div>';
    return;
  }
  grid.innerHTML = list.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map(n => cardHtml(n)).join('');
  A.$$('#tag-notes .pin-card').forEach(card => {
    card.addEventListener('click', () => openFromTag(card.dataset.path));
  });
}

function cardHtml(note) {
  const name = (note.name || 'Unbenannt').replace(/\.md$/i, '');
  const cls = A.state.currentPath === note.path ? ' pin-card active' : '';
  const preview = A.plainText ? A.plainText(note.content || '') : (note.content || '')
    .replace(/^\s*[-*#]\s+[^\n]*$/gm, '')   // Markdown-Listen/Header-Zeilen ausblenden
    .replace(/[#*`>_\[\]()~-]/g, '')
    .replace(/\s+/g, ' ');
  const tags = note.tags && note.tags.length ? note.tags.map(t => '#' + t).join(' ') : '';
  return '<div class="pin-card' + cls + '" data-path="' + A.esc(note.path) + '">' +
    '<div class="pin-card-title">' + A.esc(name) + '</div>' +
    (preview && preview.trim()
      ? '<div class="pin-card-preview">' + A.esc(preview.trim().slice(0, 140)) + '</div>'
      : '') +
    (tags ? '<div class="pin-card-tags">' + A.esc(tags) + '</div>' : '') +
    '</div>';
}

async function openFromTag(path) {
  try {
    if (A.state.dirty) await A.saveCurrent(false, true);
    const note = await A.api('/api/note?path=' + encodeURIComponent(path));
    A.state.currentNote = note;
    A.state.currentPath = note.path;
    A.state.dirty = false;
    hideAllTagsViews();
    A.$('#editor').classList.remove('hidden');
    A.showEditor(note);
    A.renderTree();
    if (A.showNoteInTree) A.showNoteInTree(note.path);
    if (A.updatePageFavPinState) A.updatePageFavPinState();
  } catch (err) { A.toast(err.message, true); }
}
