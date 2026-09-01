/* ============================================================
   tree.js — sidebar navigation, move/copy, folders, search
   ============================================================ */
'use strict';
// A is declared once in core.js (window.App); referenced here as global.

const FOLDER_ICON = '<svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const NOTE_ICON = '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const CARET = '<svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* Recursively build an HTML tree */
function buildTreeHtml(node, depth) {
  let html = '';
  for (const folder of node.folders || []) {
    html += `<div class="tree-folder" data-path="${A.esc(folder.path)}" data-type="folder">
      <span class="tw">${CARET}</span>
      <span class="icon">${FOLDER_ICON}</span>
      <span class="lbl">${A.esc(folder.name)}</span>
      <span class="row-btn" data-act="moveF" title="${A.t('moveTo')}">⇄</span>
      <span class="row-btn" data-act="renameF" title="${A.t('rename')}">✎</span>
      <span class="row-btn" data-act="delF" title="${A.t('delete')}">🗑</span>
    </div>
    <div class="tree-children" data-cfpath="${A.esc(folder.path)}" style="display:none">
      ${buildTreeHtml(folder, depth + 1)}
    </div>`;
  }
  for (const note of node.notes || []) {
    html += `<div class="tree-note" data-path="${A.esc(note.path)}" data-type="note">
      <span class="icon">${NOTE_ICON}</span>
      <span class="lbl">${A.esc(note.name)}</span>
      <span class="row-btn" data-act="copyN" title="${A.t('copy')}">⧉</span>
      <span class="row-btn" data-act="moveN" title="${A.t('moveTo')}">⇄</span>
      <span class="row-btn" data-act="renameN" title="${A.t('rename')}">✎</span>
      <span class="row-btn" data-act="delN" title="${A.t('delete')}">🗑</span>
    </div>`;
  }
  return html;
}

/* Render the whole tree into #tree */
A.renderTree = function () {
  const cont = A.$('#tree');
  if (!cont) return;
  if (!A.state.tree || (!A.state.tree.folders.length && !A.state.tree.notes.length)) {
    cont.innerHTML = '<div style="padding:12px;color:var(--text-muted)">—</div>';
    return;
  }
  cont.innerHTML = buildTreeHtml(A.state.tree, 0);
  // re-apply open states and active highlight
  (A._openFolders || []).forEach(p => {
    const el = cont.querySelector(`.tree-folder[data-path="${CSS.escape(p)}"]`);
    if (el) { el.classList.add('open'); }
    const kids = el && el.nextElementSibling;
    if (kids) kids.style.display = '';
  });
  if (A.state.currentPath) {
    cont.querySelectorAll('.tree-note').forEach(n => {
      if (n.dataset.path === A.state.currentPath) n.classList.add('active');
    });
  }
  applySearchFilter();
};

function collectAll(node, arr, parentChain) {
  parentChain = parentChain || [];
  for (const f of node.folders || []) {
    arr.push({ type: 'folder', path: f.path, name: f.name, chain: [...parentChain, f.name] });
    collectAll(f, arr, [...parentChain, f.name]);
  }
  for (const n of node.notes || []) {
    arr.push({ type: 'note', path: n.path, name: n.name, chain: [...parentChain] });
  }
  return arr;
}

function applySearchFilter() {
  const q = (A.state.searchQuery || '').trim().toLowerCase();
  const cont = A.$('#tree');
  if (!cont) return;
  if (!q) {
    cont.querySelectorAll('.tree-note, .tree-folder').forEach(el => el.style.display = '');
    return;
  }
  const items = collectAll(A.state.tree, []);
  cont.querySelectorAll('.tree-note').forEach(note => {
    const it = items.find(i => i.type === 'note' && i.path === note.dataset.path);
    const show = it && it.name.toLowerCase().includes(q);
    note.style.display = show ? '' : 'none';
  });
  cont.querySelectorAll('.tree-folder').forEach(f => {
    const fpath = f.dataset.path;
    const it = items.find(i => i.type === 'folder' && i.path === fpath);
    const kids = f.nextElementSibling;
    if (!it) { f.style.display = 'none'; if (kids) kids.style.display = 'none'; return; }
    const hasHit = it.name.toLowerCase().includes(q) ||
      it.chain.some(c => c.toLowerCase().includes(q)) ||
      items.some(i => i.chain.includes(it.name) && i.type === 'note' && i.name.toLowerCase().includes(q));
    f.style.display = hasHit ? '' : 'none';
    if (kids) {
      const kidHas = Array.from(kids.querySelectorAll('.tree-note')).some(n => n.style.display !== 'none');
      kids.style.display = hasHit ? '' : (kidHas ? '' : 'none');
    }
  });
}
A.applySearchFilter = applySearchFilter;

/* Expand ancestor folders of a given note path */
async function showNoteInTree(path) {
  const parts = path.split('/').slice(0, -1); // folders
  A._openFolders = A._openFolders || [];
  const chain = [];
  for (const p of parts) {
    chain.push(p);
    if (!A._openFolders.includes(chain.join('/'))) A._openFolders.push(chain.join('/'));
  }
  // Find the tree node and scroll into view, expand parent chain
  const cont = A.$('#tree');
  const noteEl = cont.querySelector(`.tree-note[data-path="${CSS.escape(path)}"]`);
  if (noteEl) {
    // ensure all ancestor children shown
    let sib = noteEl.parentElement;
    while (sib && !sib.classList.contains('tree-children')) sib = sib.parentElement;
    // open every ancestor folder
    A._openFolders.forEach(p => {
      const el = cont.querySelector(`.tree-folder[data-path="${CSS.escape(p)}"]`);
      if (el) { el.classList.add('open'); const k = el.nextElementSibling; if (k) k.style.display = ''; }
    });
    noteEl.scrollIntoView({ block: 'nearest' });
  }
}

/* ---------- event handlers ---------- */
function bindTreeEvents() {
  const tree = A.$('#tree');
  if (!tree) return;

  tree.addEventListener('click', (e) => {
    // folder toggle
    const folder = e.target.closest('.tree-folder');
    if (folder && !e.target.closest('.row-btn')) {
      const kids = folder.nextElementSibling;
      const open = !folder.classList.contains('open');
      folder.classList.toggle('open', open);
      if (kids) kids.style.display = open ? '' : 'none';
      return;
    }
    // note open
    const note = e.target.closest('.tree-note');
    if (note && !e.target.closest('.row-btn')) {
      openNote(note.dataset.path);
      return;
    }
    // row actions
    const btn = e.target.closest('.row-btn');
    if (!btn) return;
    const act = btn.dataset.act;
    const item = btn.closest('.tree-note, .tree-folder');
    const path = item.dataset.path;
    const type = item.dataset.type;
    if (act === 'moveN' || act === 'moveF') openMoveDialog({ path, type }, 'move');
    else if (act === 'copyN') openMoveDialog({ path, type: 'note' }, 'copy');
    else if (act === 'renameN' || act === 'renameF') renameItem(path, type === 'note' ? 'note' : 'folder');
    else if (act === 'delN') deleteItem(path, 'note');
    else if (act === 'delF') deleteItem(path, 'folder');
  });
}

async function openNote(path) {
  if (A.state.dirty) await A.saveCurrent(false, true);
  try {
    const note = await A.api('/api/note?path=' + encodeURIComponent(path));
    A.state.currentNote = note;
    A.state.currentPath = note.path;
    A.state.dirty = false;
    A.showEditor(note);
    A.renderTree();
    showNoteInTree(note.path);
  } catch (err) {
    A.toast(err.message, true);
  }
}

/* ---------- move / copy dialog ---------- */
async function openMoveDialog(item, mode) {
  const modal = A.$('#move-modal');
  A.$('#move-title').textContent = mode === 'move' ? A.t('moveTo') : A.t('copyTo');
  const p = A.$('#move-desc');
  p.textContent = (mode === 'move' ? '⇄ ' : '⧉ ') + (item.type === 'note' ? '📄' : '📁') + ' ' + item.path;
  const tree = A.$('#move-tree');
  A.moveDest = null;
  tree.innerHTML = buildFolderPicker(A.state.tree, item);
  tree.style.display = '';
  A.moveOpenMode = mode;
  A.moveOpenItem = item;
  modal.classList.remove('hidden');
}

function buildFolderPicker(node, excludeItem) {
  let html = '<div class="fp-item" data-target="">' + (A.state.currentPath ? '' : '') + '📂 <b>Notizbücher (Root)</b></div>';
  const walk = (n, indent) => {
    for (const f of n.folders || []) {
      if (f.path === excludeItem.path) continue; // can't move into itself
      html += `<div class="fp-item" data-target="${A.esc(f.path)}" style="padding-left:${12 + indent * 18}px">📁 ${A.esc(f.name)}</div>`;
      walk(f, indent + 1);
    }
  };
  walk(node, 0);
  return html;
}

/* ---------- rename ---------- */
async function renameItem(path, type) {
  const name = prompt(A.t('rename'), decodeURIComponent(path.split('/').pop().replace(/\.md$/, '')));
  if (!name || !name.trim()) return;
  try {
    await A.api('/api/rename', { method: 'POST', body: { path, name: name.trim(), type } });
    await refreshTree();
  } catch (err) { A.toast(err.message, true); }
}

/* ---------- delete ---------- */
async function deleteItem(path, type) {
  const msg = type === 'folder' ? A.t('deleteFolderConfirm') : A.t('deleteConfirm');
  if (!confirm(msg + '\n\n' + path)) return;
  try {
    await A.api('/api/item', { method: 'DELETE', body: { path, type } });
    if (A.state.currentPath && (A.state.currentPath === path || A.state.currentPath.startsWith(path + '/'))) {
      A.hideEditor();
    }
    await refreshTree();
    A.toast(A.t('delete'));
  } catch (err) { A.toast(err.message, true); }
}

/* ---------- folder create ---------- */
async function createFolder(parent = '') {
  const name = prompt(A.t('newNotebook') + ':\n' + A.t('notebookName'));
  if (!name || !name.trim()) return;
  try {
    await A.api('/api/folder', { method: 'POST', body: { parent, name: name.trim() } });
    await refreshTree();
  } catch (err) { A.toast(err.message, true); }
}

/* refresh tree from server */
async function refreshTree() {
  try {
    A.state.tree = await A.api('/api/tree');
    A.renderTree();
  } catch (err) { A.toast(err.message, true); }
}
A.refreshTree = refreshTree;

/* ---------- init ---------- */
A.treeInit = function () {
  bindTreeEvents();
  const search = A.$('#search');
  const clear = A.$('#btn-search-clear');
  if (search) search.addEventListener('input', (e) => {
    A.state.searchQuery = e.target.value;
    applySearchFilter();
  });
  if (clear) clear.addEventListener('click', () => {
    if (search) { search.value = ''; A.state.searchQuery = ''; applySearchFilter(); }
  });
  A.$('#btn-new-page')?.addEventListener('click', () => newPage());
  A.$('#btn-new-folder')?.addEventListener('click', () => createFolder());
  A.$('#btn-welcome-page')?.addEventListener('click', () => newPage());
  A.$('#btn-welcome-folder')?.addEventListener('click', () => createFolder());
};

async function newPage() {
  if (A.state.dirty) await A.saveCurrent(false, true);
  // determine parent: current note's folder, else root
  let parent = '';
  if (A.state.currentPath && A.state.currentPath.includes('/')) {
    parent = A.state.currentPath.split('/').slice(0, -1).join('/');
  }
  // offer templates if any exist
  let templates = [];
  try { templates = await A.api('/api/templates'); } catch (e) { templates = []; }
  if (templates.length) {
    const sel = A.$('#newpage-template');
    sel.innerHTML = '<option value="__blank">' + A.esc(A.t('emptyPage')) + '</option>' +
      templates.map(t => '<option value="' + A.esc(t.path) + '">' + A.esc(t.name) + '</option>').join('');
    A.$('#newpage-name').value = '';
    A.$('#newpage-modal').classList.remove('hidden');
    A.$('#newpage-name').focus();
    A.newPagePending = { parent };
    return;
  }
  const name = prompt(A.t('pageName'), A.t('untitled'));
  if (!name || !name.trim()) return;
  try {
    await createNewPage({ name: name.trim(), parent, template: null });
  } catch (err) { A.toast(err.message, true); }
}
A.newPage = newPage;

async function createNewPage({ name, parent, template }) {
  let note;
  if (template && template !== '__blank') {
    const res = await A.api('/api/note/from-template', { method: 'POST', body: { templatePath: template, name, parent, tags: [] } });
    note = await A.api('/api/note?path=' + encodeURIComponent(res.path));
  } else {
    const res = await A.api('/api/note', { method: 'POST', body: {
      name, content: '', tags: [], parent, isNew: true
    } });
    note = await A.api('/api/note?path=' + encodeURIComponent(res.path));
  }
  A.state.currentNote = note;
  A.state.currentPath = note.path;
  A.state.dirty = false;
  A.showEditor(note);
  await refreshTree();
  showNoteInTree(note.path);
  A.$('#note-title')?.focus();
  return note;
}
A.createNewPage = createNewPage;
