import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export function ensureRoot(root) {
  fs.mkdirSync(root, { recursive: true });
}

function isHidden(name) {
  return name.startsWith('.') || name === 'assets' || name === '_assets';
}

// Central asset store lives at ROOT/_assets so paths stay stable when notes
// are moved/copied/renamed. Filenames get a random suffix to avoid collisions.
export function assetsDir(root) {
  const dir = path.join(root, '_assets');
  return dir;
}

export function ensureAssetsDir(root) {
  const dir = assetsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Generate a collision-free central asset filename: <base>-<rand><ext>
export function uniqueAssetName(root, originalName) {
  const parsed = path.parse(originalName || 'file');
  const safeBase = (parsed.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
  const ext = (parsed.ext || '').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const assets = ensureAssetsDir(root);
  let name = `${safeBase}-${rand}${ext}`;
  let n = 1;
  while (fs.existsSync(path.join(assets, name))) {
    name = `${safeBase}-${rand}-${n}${ext}`;
    n++;
  }
  return name;
}

export function safePath(root, rel) {
  if (!rel) return null;
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) {
    return null;
  }
  return full;
}

export function buildTree(root) {
  return walk(root, '');
}

function walk(dir, rel) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !isHidden(e.name));
  const folders = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name));

  return {
    type: 'folder',
    name: rel ? path.basename(rel) : 'Notizbücher',
    path: rel,
    folders: folders.map(f => walk(path.join(dir, f.name), rel ? `${rel}/${f.name}` : f.name)),
    notes: files.map(f => ({
      type: 'note',
      name: path.basename(f.name, '.md'),
      path: rel ? `${rel}/${f.name}` : f.name
    }))
  };
}

// Version directory is hidden from the tree but lives next to each note.
export function versionsDir(root, rel) {
  const full = safePath(root, rel);
  if (!full) return null;
  return path.join(path.dirname(full), '.' + path.basename(full) + '.versions');
}

// Rotate versions: keep at most `keep` history snapshots. Returns current version list.
export function rotateVersions(root, rel, keep) {
  const vdir = versionsDir(root, rel);
  if (!vdir) return [];
  if (!fs.existsSync(vdir)) return [];
  const files = fs.readdirSync(vdir)
    .filter(f => /^\.v/.test(f))
    .sort((a, b) => (a < b ? 1 : -1)); // newest first
  const maxKeep = Math.max(0, parseInt(keep, 10) || 0);
  while (files.length > maxKeep) {
    const oldest = files.pop();
    try { fs.rmSync(path.join(vdir, oldest), { force: true }); } catch (e) {}
  }
  return files.map(f => ({ name: f, updated: fs.statSync(path.join(vdir, f)).mtime.toISOString() }));
}

// Snapshot the current note content into the version history before it is overwritten.
export function snapshotVersion(root, rel) {
  const full = safePath(root, rel);
  if (!full || !fs.existsSync(full)) return;
  const vdir = versionsDir(root, rel);
  if (!vdir) return;
  fs.mkdirSync(vdir, { recursive: true });
  const v = parseInt(Date.now() / 1000, 10);
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let vname = `.v${stamp}`;
  let n = 1;
  while (fs.existsSync(path.join(vdir, vname))) { vname = `.v${stamp}-${n}`; n++; }
  fs.copyFileSync(full, path.join(vdir, vname));
  return vname;
}

export function listVersions(root, rel) {
  const vdir = versionsDir(root, rel);
  if (!vdir || !fs.existsSync(vdir)) return [];
  return fs.readdirSync(vdir)
    .filter(f => /^\.v/.test(f))
    .sort((a, b) => (a < b ? 1 : -1)) // newest first
    .map(f => ({ name: f, updated: fs.statSync(path.join(vdir, f)).mtime.toISOString() }));
}

export function readVersion(root, rel, ver) {
  const vdir = versionsDir(root, rel);
  const vpath = vdir && safePath(vdir, String(ver || '').replace(/^\//, ''));
  if (!vpath || !fs.existsSync(vpath)) return null;
  const raw = fs.readFileSync(vpath, 'utf8');
  const { data, content } = matter(raw);
  return { version: ver, updated: fs.statSync(vpath).mtime.toISOString(), frontmatter: data, tags: Array.isArray(data.tags) ? data.tags : [], content };
}

// Restore a version: overwrite current note with the version content (a history snapshot is taken first).
export function restoreVersion(root, rel, ver, keep) {
  const vdir = versionsDir(root, rel);
  const vpath = vdir && safePath(vdir, String(ver || '').replace(/^\//, ''));
  if (!vpath || !fs.existsSync(vpath)) throw new Error('Version nicht gefunden');
  snapshotVersion(root, rel);
  const full = safePath(root, rel);
  if (!full) throw new Error('Invalid path');
  fs.copyFileSync(vpath, full);
  return rotateVersions(root, rel, keep);
}

export function deleteVersion(root, rel, ver) {
  const vdir = versionsDir(root, rel);
  const vpath = vdir && safePath(vdir, String(ver || '').replace(/^\//, ''));
  if (!vpath || !fs.existsSync(vpath)) return;
  fs.rmSync(vpath, { force: true });
}

export function saveNote(root, { rel, name, content, tags, parent, isNew }) {
  let targetRel;
  if (isNew) {
    const dir = parent ? String(parent).replace(/^\/|\/$/g, '') : '';
    const fileName = sanitizeFileName(name || 'Unbenannt') + '.md';
    const dirFull = dir ? safePath(root, dir) : root;
    if (!dirFull) throw new Error('Invalid parent');
    fs.mkdirSync(dirFull, { recursive: true });
    targetRel = dir ? `${dir}/${fileName}` : fileName;
    let n = 1;
    while (fs.existsSync(safePath(root, targetRel))) {
      targetRel = dir ? `${dir}/${sanitizeFileName(name)}-${n}.md` : `${sanitizeFileName(name)}-${n}.md`;
      n++;
    }
  } else {
    targetRel = String(rel || '');
    if (!targetRel.endsWith('.md')) targetRel += '.md';
  }

  const full = safePath(root, targetRel);
  if (!full) throw new Error('Invalid path');
  fs.mkdirSync(path.dirname(full), { recursive: true });

  // Before overwriting an existing note, snapshot the previous content as a version.
  const prevExists = fs.existsSync(full);
  if (prevExists) snapshotVersion(root, targetRel);

  const tagList = Array.isArray(tags) ? tags.filter(Boolean).map(String) : [];
  const fm = { tags: tagList, updated: new Date().toISOString() };
  if (isNew) { fm.created = new Date().toISOString(); }
  const body = matter.stringify(content || '', fm);
  fs.writeFileSync(full, body, 'utf8');

  return {
    path: targetRel,
    name: path.basename(targetRel, '.md'),
    tags: tagList
  };
}

export function readNoteJson(root, rel) {
  const full = safePath(root, rel);
  if (!full || !fs.existsSync(full)) return null;
  const raw = fs.readFileSync(full, 'utf8');
  const { data, content } = matter(raw);
  return {
    path: rel,
    name: path.basename(rel, '.md'),
    frontmatter: data,
    tags: Array.isArray(data.tags) ? data.tags : [],
    isTemplate: data.template === true || data.template === 'true',
    content
  };
}

// Set (or clear) the `template: true` flag in a note's frontmatter.
export function setTemplateFlag(root, rel, isTemplate) {
  const full = safePath(root, rel);
  if (!full || !fs.existsSync(full)) throw new Error('Notiz nicht gefunden');
  const raw = fs.readFileSync(full, 'utf8');
  const { data, content } = matter(raw);
  if (isTemplate) data.template = true; else delete data.template;
  data.updated = new Date().toISOString();
  fs.writeFileSync(full, matter.stringify(content || '', data), 'utf8');
  return { path: rel, isTemplate: !!isTemplate };
}

// Collect notes matching any of the given tags (or all tags if a tag list is empty).
export function notesByTags(root, tags) {
  const want = Array.isArray(tags) ? tags.map(String).filter(Boolean) : [];
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(full, relPath);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        try {
          const { data, content } = matter(fs.readFileSync(full, 'utf8'));
          const t = (Array.isArray(data.tags) ? data.tags : []).map(String);
          if (!want.length || want.every(w => t.includes(w))) {
            out.push({ path: relPath, name: path.basename(relPath, '.md'), tags: t, content });
          }
        } catch (e2) {}
      }
    }
  };
  walk(root, '');
  return out;
}

// Collect every distinct tag across all notes, with counts.
export function allTags(root) {
  const counts = {};
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        try {
          const { data } = matter(fs.readFileSync(full, 'utf8'));
          for (const t of (Array.isArray(data.tags) ? data.tags : [])) {
            const key = String(t); if (key) counts[key] = (counts[key] || 0) + 1;
          }
        } catch (e2) {}
      }
    }
  };
  walk(root);
  return Object.keys(counts).sort((a, b) => a.localeCompare(b)).map(t => ({ tag: t, count: counts[t] }));
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Unbenannt';
}

export function createFolder(root, parent, name) {
  const clean = sanitizeFileName(name || 'Neuer Ordner');
  const dir = parent ? String(parent).replace(/^\/|\/$/g, '') : '';
  const full = safePath(root, dir ? `${dir}/${clean}` : clean);
  if (!full) throw new Error('Invalid parent');
  fs.mkdirSync(full, { recursive: true });
  return { path: dir ? `${dir}/${clean}` : clean, name: clean };
}

export function move(root, from, to, type) {
  if (!from) throw new Error('from required');
  if (to === undefined || to === null) throw new Error('to required');
  const src = safePath(root, from);
  if (!src || !fs.existsSync(src)) throw new Error('Source not found');

  const toClean = String(to).replace(/^\/|\/$/g, '');
  const baseName = path.basename(from);
  let dest = toClean ? safePath(root, `${toClean}/${baseName}`) : safePath(root, baseName);
  if (!dest) throw new Error('Invalid destination');
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (fs.existsSync(dest)) {
    const parsed = path.parse(baseName);
    let n = 1;
    do {
      dest = path.join(toClean ? safePath(root, toClean) : root, `${parsed.name}-${n}${parsed.ext}`);
      n++;
    } while (fs.existsSync(dest));
  }
  fs.renameSync(src, dest);
  const relDest = path.relative(root, dest).replace(/\\/g, '/');
  return { type, from, to: relDest };
}

export function copyItem(root, from, to, type) {
  if (!from) throw new Error('from required');
  if (to === undefined || to === null) throw new Error('to required');
  const src = safePath(root, from);
  if (!src || !fs.existsSync(src)) throw new Error('Source not found');

  const toClean = String(to).replace(/^\/|\/$/g, '');
  const baseName = path.basename(from);
  let dest = toClean ? safePath(root, `${toClean}/${baseName}`) : safePath(root, baseName);
  if (!dest) throw new Error('Invalid destination');
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  if (fs.existsSync(dest)) {
    const parsed = path.parse(baseName);
    let n = 1;
    do {
      dest = path.join(toClean ? safePath(root, toClean) : root, `${parsed.name}-Kopie-${n}${parsed.ext}`);
      n++;
    } while (fs.existsSync(dest));
  }
  fs.cpSync(src, dest, { recursive: true });
  const relDest = path.relative(root, dest).replace(/\\/g, '/');
  return { type, from, to: relDest };
}

export function duplicateNote(root, rel) {
  const src = safePath(root, rel);
  if (!src || !fs.existsSync(src)) throw new Error('Not found');
  const baseName = path.basename(rel, '.md');
  const parentRel = path.dirname(rel) === '.' ? '' : path.dirname(rel);
  const parentFull = parentRel ? safePath(root, parentRel) : root;
  let dest;
  let n = 1;
  do {
    dest = path.join(parentFull, `${baseName}-Kopie-${n}.md`);
    n++;
  } while (fs.existsSync(dest));
  fs.copyFileSync(src, dest);
  return { path: path.relative(root, dest).replace(/\\/g, '/'), name: path.basename(dest, '.md') };
}

export function remove(root, rel, type) {
  const full = safePath(root, rel);
  if (!full || !fs.existsSync(full)) throw new Error('Not found');
  if (type === 'folder') fs.rmSync(full, { recursive: true, force: true });
  else fs.rmSync(full, { force: true });
}

export function rename(root, rel, name, type) {
  const full = safePath(root, rel);
  if (!full || !fs.existsSync(full)) throw new Error('Not found');
  const targetName = sanitizeFileName(name);
  let dest = path.join(path.dirname(full), type === 'note' ? targetName + '.md' : targetName);
  if (fs.existsSync(dest)) throw new Error('Ziel existiert bereits');
  fs.renameSync(full, dest);
  return { path: path.relative(root, dest).replace(/\\/g, '/'), name: targetName };
}

export function ensureFolderForUpload(root, rel) {
  const clean = String(rel || '').replace(/^\/|\/$/g, '');
  const full = clean ? safePath(root, clean) : root;
  if (!full) throw new Error('Invalid folder');
  fs.mkdirSync(full, { recursive: true });
  return full;
}
