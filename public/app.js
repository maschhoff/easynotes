/* ============================================================
   app.js — bootstrap / entry point
   Loaded LAST (after core, tree, editor, ai, settings).
   ============================================================ */
'use strict';
// A is declared once in core.js (window.App); referenced here as global.

/* ---------- modal close helper ---------- */
function bindModalClose() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
    modal.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => modal.classList.add('hidden'));
    });
  });

  // Move modal confirm
  A.$('#btn-move-confirm').addEventListener('click', async () => {
    const item = A.moveOpenItem;
    const dest = A.moveDest;
    if (!item || dest === undefined) { A.$('#move-modal').classList.add('hidden'); return; }
    try {
      if (A.moveOpenMode === 'move') {
        await A.api('/api/move', { method: 'POST', body: { from: item.path, to: dest, type: item.type } });
        if (A.state.currentPath && (A.state.currentPath === item.path || A.state.currentPath.startsWith(item.path + '/'))) {
          // currently-open item moved: close if its folder moved
          if (item.type === 'folder') A.hideEditor();
          else A.hideEditor();
        }
      } else {
        await A.api('/api/copy', { method: 'POST', body: { from: item.path, to: dest, type: item.type } });
      }
      A.$('#move-modal').classList.add('hidden');
      await A.refreshTree();
      A.toast(A.moveOpenMode === 'move' ? A.t('move') : A.t('copy'));
    } catch (err) { A.toast(err.message, true); }
  });

  // Move modal folder picker
  A.$('#move-tree').addEventListener('click', (e) => {
    const item = e.target.closest('.fp-item');
    if (!item) return;
    A.$('#move-tree').querySelectorAll('.fp-item').forEach(x => x.classList.remove('selected'));
    item.classList.add('selected');
    A.moveDest = item.dataset.target;
  });
}

/* ---------- topbar mobile menu ---------- */
function bindMobileMenu() {
  const sidebar = A.$('#sidebar');
  const backdrop = A.$('#sidebar-backdrop');
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  // btn-menu toggles the sidebar: drawer on mobile, collapse on desktop
  A.$('#btn-menu').addEventListener('click', () => {
    if (isMobile()) {
      sidebar.classList.add('open');
      backdrop.classList.remove('hidden');
    } else {
      document.body.classList.toggle('sidebar-collapsed');
    }
  });
  A.$('#btn-search').addEventListener('click', () => { sidebar.classList.add('open'); backdrop.classList.remove('hidden'); A.$('#search').focus(); });
  backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); backdrop.classList.add('hidden'); });
}

/* ---------- welcome state ---------- */
function toggleWelcome() {
  const hasContent = A.state.tree && (A.state.tree.folders.length || A.state.tree.notes.length);
  if (!hasContent) {
    A.$('#welcome').classList.remove('hidden');
  }
}

/* ---------- New page modal (template chooser) ---------- */
function bindNewPageModal() {
  const modal = A.$('#newpage-modal');
  if (!modal) return;
  const name = A.$('#newpage-name');
  const create = A.$('#btn-newpage-create');
  const cancel = A.$('#btn-newpage-cancel');
  create.addEventListener('click', async () => {
    if (!A.newPagePending) return;
    const n = (name.value || '').trim() || A.t('untitled');
    const tpl = A.$('#newpage-template').value;
    const parent = A.newPagePending.parent;
    modal.classList.add('hidden');
    A.newPagePending = null;
    try { await A.createNewPage({ name: n, parent, template: tpl }); }
    catch (err) { A.toast(err.message, true); }
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') create.click(); });
  cancel.addEventListener('click', () => { modal.classList.add('hidden'); A.newPagePending = null; });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) { modal.classList.add('hidden'); A.newPagePending = null; }
  });
}

/* ---------- init ---------- */
async function boot() {
  try {
    A.settings = await A.api('/api/settings');
  } catch (e) { /* defaults */ }

  A.applySettings();
  A.settingsInit();
  bindModalClose();
  bindMobileMenu();
  bindNewPageModal();
  A.treeInit();
  A.editorInit();
  A.aiInit();
  A.pinboardInit();
  A.tagsInit();
  A.drawingInit();
  A.importInit();

  await A.refreshTree();
  A.renderTree();
  toggleWelcome();

  // Startseite: Standard ist die Pinnwand (Feature 2)
  const startPage = A.settings.startPage || 'pinboard';
  if (startPage === 'pinboard') {
    if (A.showPinboard) {
      A.showPinboard();
    } else {
      toggleWelcome();
    }
  } else if (startPage === 'tree' && window.matchMedia('(max-width: 768px)').matches) {
    A.$('#sidebar')?.classList.add('open');
    A.$('#sidebar-backdrop')?.classList.remove('hidden');
  } else {
    toggleWelcome();
  }

  // If a PIN is set, show the lock screen (also gates visibility of the tree)
  A.initLockScreen();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
