/* ============================================================
   pinboard.js — Favoriten-Übersicht & Pinnwand (angeheftete Notizen)
   Ähnlich Google Notizen / Blinko: angepinnte Notizen als Karten.
   ============================================================ */
'use strict';
// A in core.js (window.App)

A.pinboardInit = function () {
  A.$('#btn-show-fav')?.addEventListener('click', () => showFavView());
  A.$('#btn-show-pinboard')?.addEventListener('click', () => showPinboard());
  A.$('#btn-pinboard-close')?.addEventListener('click', closeOverview);
  A.$('#btn-fav-close')?.addEventListener('click', closeOverview);
};

function hideAllViews() {
  A.$('#welcome')?.classList.add('hidden');
  A.$('#editor')?.classList.add('hidden');
  A.$('#favview')?.classList.add('hidden');
  A.$('#pinboard')?.classList.add('hidden');
  A.$('#tagsview')?.classList.add('hidden');
}

function closeOverview() {
  hideAllViews();
  // zurück zur Startansicht: Welcome (falls Editor nicht aktiv) bzw. Editor
  if (A.state.currentPath && A.state.currentNote) {
    A.$('#editor')?.classList.remove('hidden');
  } else {
    A.$('#welcome')?.classList.remove('hidden');
  }
}
A.closeOverview = closeOverview;

/* ---------- Favoriten ---------- */
async function showFavView() {
  if (A.state.dirty) await A.saveCurrent(false, true);
  hideAllViews();
  A.$('#favview').classList.remove('hidden');
  const paths = (A.settings.favorites || []).slice();
  const grid = A.$('#fav-list');
  const empty = A.$('#fav-empty');
  if (!paths.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const items = [];
  for (const p of paths) {
    try {
      const note = await A.api('/api/note?path=' + encodeURIComponent(p));
      items.push(note);
    } catch (e) { /* Notiz evtl. gelöscht */ }
  }
  // gelöschte Pfade automatisch bereinigen
  const missing = paths.filter(p => !items.find(n => n.path === p));
  if (missing.length && !items.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
  } else {
    grid.innerHTML = items.map(cardHtml).join('');
    bindCardClicks(grid);
  }
}

/* ---------- Pinnwand ---------- */
async function showPinboard() {
  if (A.state.dirty) await A.saveCurrent(false, true);
  hideAllViews();
  A.$('#pinboard').classList.remove('hidden');
  const paths = (A.settings.pinned || []).slice();
  // angepinnte zuerst, ergänzt durch Favoriten (wie Google Notizen oben anheften)
  const grid = A.$('#pinboard-grid');
  const empty = A.$('#pinboard-empty');
  const all = [];
  for (const p of paths) {
    try { all.push(await A.api('/api/note?path=' + encodeURIComponent(p))); } catch (e) {}
  }
  if (!all.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  grid.innerHTML = all.map(cardHtml).join('');
  bindCardClicks(grid);
}

function cardHtml(note) {
  const name = (note.name || 'Unbenannt').replace(/\.md$/i, '');
  const preview = A.plainText ? A.plainText(note.content || '') : (note.content || '').replace(/[#*`>_-]/g, '');
  const cls = A.state.currentPath === note.path ? ' class="pin-card active"' : ' class="pin-card"';
  return `<div${cls} data-path="${A.esc(note.path)}">
    <div class="pin-card-title">${A.esc(name)}</div>
    <div class="pin-card-preview">${A.esc(preview.slice(0, 160))}</div>
  </div>`;
}

function bindCardClicks(grid) {
  grid.querySelectorAll('.pin-card').forEach(card => {
    card.addEventListener('click', () => openNoteFromCard(card.dataset.path));
  });
}

async function openNoteFromCard(path) {
  try {
    const note = await A.api('/api/note?path=' + encodeURIComponent(path));
    A.state.currentNote = note;
    A.state.currentPath = note.path;
    A.state.dirty = false;
    hideAllViews();
    A.$('#editor').classList.remove('hidden');
    A.showEditor(note);
    A.renderTree();
    // Baum aufklappen + markieren
    if (A.showNoteInTree) showNoteInTree(note.path);
    A.updatePageFavPinState();
  } catch (err) { A.toast(err.message, true); }
}
A.openNoteFromCard = openNoteFromCard;

// Public API: Pinnwand anzeigen (für Startseiten-Logik und andere Module)
A.showPinboard = showPinboard;
A.hideAllViews = hideAllViews;
