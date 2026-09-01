import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { safePath } from './fsApi.js';
import matter from 'gray-matter';

// Handles imports from https://github.com/alxnbl/onenote-md-exporter
// The exporter produces a folder tree of <Notebook>/<Section>/<Page>.md
// plus each folder having an "assets" (or ".assets") subfolder with images/attachments.

export function listImportableArchives(dataDir) {
  const importsDir = path.join(dataDir, 'imports');
  if (!fs.existsSync(importsDir)) return [];
  return fs.readdirSync(importsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() || /\.(zip|tar|gz)$/i.test(e.name))
    .map(e => ({ name: e.name, isDir: e.isDirectory() }));
}

export async function importOnenoteExport({ dataDir, root, archive, destFolder }) {
  const importsDir = path.join(dataDir, 'imports');
  let srcRoot = path.join(importsDir, archive);
  let extracted = false;
  let singleRoot = null;

  const srcIsDir = fs.existsSync(srcRoot) && fs.statSync(srcRoot).isDirectory();
  if (!srcIsDir) {
    const archiveFile = path.join(importsDir, archive);
    if (fs.existsSync(archiveFile) && /\.(zip|tar|gz)$/i.test(archive)) {
      const extractDir = path.join(importsDir, stripName(archive) + '_extracted');
      fs.mkdirSync(extractDir, { recursive: true });
      if (/\.zip$/i.test(archive)) {
        try {
          execSync(`unzip -o "${archiveFile}" -d "${extractDir}"`, { stdio: 'ignore' });
        } catch (e) {
          // exit 1 = warnings (e.g. non-ASCII filename bytes); 0 = ok; only real errors (2+) throw
          if (!e.status || e.status > 1) throw e;
        }
      } else {
        execSync(`tar -xf "${archiveFile}" -C "${extractDir}"`, { stdio: 'ignore' });
      }
      // If extraction produced a single root folder, remember it so we can avoid
      // re-nesting it under a destination folder with the same name.
      const entries = fs.readdirSync(extractDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      singleRoot = dirs.length === 1 && entries.filter(e => e.isFile()).length === 0
        ? dirs[0].name : null;
      srcRoot = singleRoot ? path.join(extractDir, singleRoot) : extractDir;
      extracted = true;
    } else {
      throw new Error(`Import-Quelle nicht gefunden: ${archive}`);
    }
  }

  // Destination folder in notes root
  const destName = stripName(archive);
  let dest = destFolder
    ? safePath(root, String(destFolder).replace(/^\/|\/$/g, '') + '/' + destName)
    : safePath(root, destName);
  if (!dest) throw new Error('Ungültiges Ziel');
  if (fs.existsSync(dest)) {
    throw new Error(`Ziel existiert bereits: ${destName}. Bitte lösche es oder wähle einen neuen Zielordner.`);
  }

  // If the extracted archive has a single root folder whose (decoded) name equals
  // the destination name, import its CONTENT directly into dest instead of
  // re-nesting the root folder (avoids e.g. .../Notizbuch von ma/Notizbuch von ma/...).
  if (extracted && singleRoot) {
    const rootName = singleRoot.replace(/\.(zip|tar|gz)$/i, '');
    if (rootName.toLowerCase() === destName.toLowerCase()) {
      // If the user gave an explicit destFolder, keep it; otherwise import the
      // root folder's contents straight into the notes root.
      if (!destFolder) {
        dest = safePath(root, destName);
      }
    }
  }

  const stats = { pages: 0, folders: 0, assets: 0 };

  // Index every asset file anywhere in the source tree (assets/, .assets/, nested)
  // by basename so any relative link can be resolved regardless of where the file sits.
  const assetIndex = new Map(); // lowercase basename -> { srcPath, name }
  indexAssets(srcRoot);

  // When the archive had a single root folder matching the destination name,
  // walk that root folder itself (its content goes directly into dest).
  walkAndCopy(srcRoot, '');
  return { ok: true, dest: path.relative(root, dest).replace(/\\/g, '/'), extracted, ...stats };

  function indexAssets(dir) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      try {
        if (e.isDirectory()) {
          if (/^\.?assets$/i.test(e.name)) indexAssetsDir(full);
          else indexAssets(full);
        }
      } catch { /* ignore */ }
    }
  }
  function indexAssetsDir(dir) {
    let items = [];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const full = path.join(dir, it.name);
      try {
        if (it.isFile()) {
          const key = (it.name || '').toLowerCase();
          if (key && !assetIndex.has(key)) assetIndex.set(key, { srcPath: full, name: it.name });
        } else if (it.isDirectory()) {
          indexAssetsDir(full);
        }
      } catch { /* ignore */ }
    }
  }

  function walkAndCopy(dir, rel) {
    const relDest = rel ? safePath(dest, rel) : dest;
    if (!relDest) return;
    fs.mkdirSync(relDest, { recursive: true });

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const mdFiles = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'));
    const subDirs = entries.filter(e => e.isDirectory() && !/^\.?assets$/i.test(e.name));

    for (const md of mdFiles) {
      copyNote(path.join(dir, md.name), relDest);
      stats.pages++;
    }
    for (const sd of subDirs) {
      walkAndCopy(path.join(dir, sd.name), rel ? `${rel}/${sd.name}` : sd.name);
      stats.folders++;
    }
  }

  function copyNote(srcFile, relDest) {
    const raw = fs.readFileSync(srcFile, 'utf8');
    const normalized = rewriteAssetLinks(raw, relDest);
    let body = normalized;
    try {
      const { data, content } = matter(normalized);
      const fm = { ...data, imported: true, source: 'onenote-md-exporter', importedAt: new Date().toISOString() };
      body = matter.stringify(content, fm);
    } catch {
      // leave as-is if not valid yaml
    }
    fs.writeFileSync(path.join(relDest, mdSafeName(srcFile)), body, 'utf8');
  }

  // Ensure the referenced asset is available in the central _assets store and
  // return an absolute /files/_assets/... link. Central storage means the link
  // never changes when pages/folders are later moved, copied or renamed.
  function placeAsset(target, relDest) {
    if (/^(https?:|data:|mailto:|#|\/)/i.test(target)) return target;
    const clean = String(target).split('#')[0].split('?')[0].replace(/\\/g, '/');
    const base = clean.split('/').pop();
    if (!base) return target;

    const key = base.toLowerCase();
    const hit = assetIndex.get(key) || assetIndex.get(decodeURIComponent(key).toLowerCase());
    if (!hit) return target;

    const assetsStore = path.join(root, '_assets');
    fs.mkdirSync(assetsStore, { recursive: true });
    // Random suffix keeps imported filenames collision-free in the shared store.
    const parsed = path.parse(hit.name);
    const safeBase = (parsed.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'file';
    const rand = Math.random().toString(36).slice(2, 8);
    const targetFile = path.join(assetsStore, `${safeBase}-${rand}${parsed.ext || ''}`);
    if (!fs.existsSync(targetFile)) {
      try { fs.copyFileSync(hit.srcPath, targetFile); } catch { /* ignore */ }
    }
    stats.assets++;
    // Return an absolute /files/_assets/ URL; encode spaces/special chars.
    const rawUrl = '/files/_assets/' + path.basename(targetFile);
    return typeof encodeURI === 'function' ? encodeURI(rawUrl) : rawUrl;
  }

  function rewriteAssetLinks(text, relDest) {
    return text.replace(/(!\[[^\]]*\]\(|\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?(\))/g, (m, pre, p, opt, post) => {
      const target = (p || '').trim();
      const mapped = placeAsset(target, relDest);
      return mapped === target ? m : `${pre}${mapped}${opt || ''}${post}`;
    });
  }
}

function stripName(name) {
  return name.replace(/\.(zip|tar|gz)$/i, '').replace(/_extracted$/i, '').replace(/[\\/:*?"<>|]/g, '-');
}

function mdSafeName(p) {
  return path.basename(p).replace(/[\\/:*?"<>|]/g, '-');
}
