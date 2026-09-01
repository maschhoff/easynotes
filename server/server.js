import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createHmac } from 'crypto';
import matter from 'gray-matter';
import mime from 'mime-types';

import * as fsApi from './fsApi.js';
import { importOnenoteExport, listImportableArchives } from './importer.js';
import { generateWithAI } from './ai.js';
import {
  initSettings, getSettings, updateSettings, verifyPin,
  createSession, isValidSession, destroySession, getSecret
} from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.NOTES_ROOT || path.resolve(__dirname, '../data/notes');
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
const PORT = process.env.PORT || 3500;

fsApi.ensureRoot(ROOT);
fs.mkdirSync(path.join(DATA_DIR, 'imports'), { recursive: true });
initSettings(DATA_DIR);

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use(express.static(path.resolve(__dirname, '../public')));

// ---- Lock gate ----
// If a PIN is set, all note/data endpoints require a valid server session
// cookie (issued only after a successful PIN verification). This is enforced
// server-side so the lock cannot be bypassed via direct API calls (e.g. the
// print/PDF view) or by disabling client-side JS.
const SESSION_COOKIE = 'easynotes_session';

function sessionCookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    path: '/',
    maxAge: 8 * 60 * 60 * 1000 // 8h
  };
}

function isLockRequired() {
  return !!getSettings().pinHash;
}

function readSessionToken(req) {
  // We sign the cookie value ourselves so we can verify integrity without
  // depending on the cookie-parser middleware.
  const raw = (req.headers.cookie || '').split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(SESSION_COOKIE + '='));
  if (!raw) return null;
  const value = raw.slice(SESSION_COOKIE.length + 1);
  const [token, sig] = value.split('.');
  if (!token || !sig) return null;
  const expected = createHmac('sha256', getSecret())
    .update(token)
    .digest('hex');
  // timingSafeEqual-safe comparison
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return token;
}

function setSessionCookie(res, token) {
  const sig = createHmac('sha256', getSecret())
    .update(token)
    .digest('hex');
  res.cookie(SESSION_COOKIE, `${token}.${sig}`, sessionCookieOpts());
}

// Protect everything except the lock-critical endpoints below.
function requireUnlock(req, res, next) {
  if (!isLockRequired()) return next(); // no PIN set -> always open
  const token = readSessionToken(req);
  if (token && isValidSession(token)) return next();
  return res.status(401).json({ error: 'Gesperrt (PIN erforderlich)' });
}

// ---- Config ----
app.get('/api/config', (req, res) => {
  res.json({ root: ROOT, port: PORT, dataDir: DATA_DIR });
});

// ---- Lock status (public: tells client whether a PIN is set) ----
app.get('/api/lock-status', (req, res) => {
  const token = readSessionToken(req);
  const unlocked = !isLockRequired() || (token && isValidSession(token));
  res.json({ locked: isLockRequired(), unlocked });
});

// ---- Logout ----
app.post('/api/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/verify-pin', (req, res) => {
  // Support HEAD/GET fallback (e.g. if the print page needs a token check).
  res.status(405).json({ error: 'POST required' });
});

// ---- Settings ----
app.get('/api/settings', (req, res) => res.json(getSettings()));
app.post('/api/settings', (req, res) => {
  try {
    res.json(updateSettings(req.body || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- PIN verification ----
app.post('/api/verify-pin', (req, res) => {
  const ok = verifyPin((req.body || {}).pin);
  if (!ok) return res.status(401).json({ ok: false, error: 'Falsche PIN' });
  // Issue a server-side session token and store it in an HttpOnly cookie.
  const token = createSession();
  setSessionCookie(res, token);
  return res.json({ ok: true });
});

// ---- Tree ----
app.get('/api/tree', requireUnlock, (req, res) => {
  try {
    res.json(fsApi.buildTree(ROOT));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Read note ----
app.get('/api/note', requireUnlock, (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const note = fsApi.readNoteJson(ROOT, rel);
    if (!note) return res.status(404).json({ error: 'Not found' });
    res.json(note);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- PDF (print view) ----
// Serves a self-contained print page: it fetches the note by ?path, renders
// the markdown with the same `marked` lib, prints via @media print, then the
// browser's "Save as PDF" dialog completes the export.
// IMPORTANT: this route requires a valid lock session (PIN), so the print/PDF
// view cannot be used to bypass the PIN lock.
app.get('/api/note/pdf', requireUnlock, (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const note = fsApi.readNoteJson(ROOT, rel);
    if (!note) return res.status(404).json({ error: 'Not found' });
    const pathJson = JSON.stringify(rel);
    res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${String(note.name).replace(/</g, '&lt;')}</title>
<script src="/marked.min.js?v=6"></script>
<style>
  body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:820px;margin:24px auto;padding:0 20px;color:#1d2126;line-height:1.6}
  h1{border-bottom:2px solid #2563eb;padding-bottom:8px;font-size:1.6em}
  img{max-width:100%} pre{background:#f1f3f5;padding:12px;border-radius:8px;overflow-x:auto;white-space:pre-wrap}
  code{background:#f1f3f5;padding:1px 5px;border-radius:4px} pre code{background:none;padding:0}
  blockquote{border-left:3px solid #2563eb;margin:.5em 0;padding:2px 12px;color:#4b5563}
  table{border-collapse:collapse;width:100%} th,td{border:1px solid #d1d5db;padding:6px 10px;text-align:left}
  a{color:#2563eb} .todo-cb{transform:scale(1.2)}
  @media print{body{margin:0} body *{visibility:visible}}
  @page{margin:16mm}
</style></head><body><div id="out">Lädt…</div>
<script>
  (async function(){
    const rel=${pathJson};
    try{
      const r=await fetch('/api/note?path='+encodeURIComponent(rel));
      const n=await r.json();
      document.title=n.name||'EasyNotes';
      const html=(window.marked?marked.parse(n.content||'',{breaks:true,gfm:true}):n.content||'');
      document.getElementById('out').innerHTML='<h1>'+esc(n.name)+'</h1>'+html;
      setTimeout(function(){ window.print(); }, 350);
    }catch(e){ document.getElementById('out').textContent='Fehler: '+e.message; }
    function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  })();
</script></body></html>`);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Save / create note ----
app.post('/api/note', requireUnlock, (req, res) => {
  try {
    const { path: rel, name, content, tags, parent, isNew } = req.body || {};
    const result = fsApi.saveNote(ROOT, { rel, name, content, tags, parent, isNew });
    // Apply rotation of version history based on the configured keep-count.
    const keep = getSettings().versionHistory;
    if (keep >= 0) fsApi.rotateVersions(ROOT, result.path, keep);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Note versions (MD history) ----
app.get('/api/note/versions', requireUnlock, (req, res) => {
  try {
    const rel = String(req.query.path || '');
    res.json(fsApi.listVersions(ROOT, rel));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/note/version', requireUnlock, (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const ver = String(req.query.version || '');
    const v = fsApi.readVersion(ROOT, rel, ver);
    if (!v) return res.status(404).json({ error: 'Version nicht gefunden' });
    res.json(v);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/note/restore', requireUnlock, (req, res) => {
  try {
    const { path: rel, version } = req.body || {};
    const keep = getSettings().versionHistory;
    fsApi.restoreVersion(ROOT, rel, version, keep >= 0 ? keep : 3);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/note/version', requireUnlock, (req, res) => {
  try {
    fsApi.deleteVersion(ROOT, req.body.path, req.body.version);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Templates ----
app.get('/api/templates', requireUnlock, (req, res) => {
  try {
    // Liste aller Notizen, die als Template markiert sind (frontmatter template: true)
    const all = fsApi.notesByTags(ROOT, []);
    const out = [];
    for (const n of all) {
      try { const note = fsApi.readNoteJson(ROOT, n.path); if (note && note.isTemplate) out.push(note); } catch (e) {}
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/note/template', requireUnlock, (req, res) => {
  try {
    const { path, isTemplate } = req.body || {};
    res.json(fsApi.setTemplateFlag(ROOT, path, !!isTemplate));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Tags ----
app.get('/api/tags', requireUnlock, (req, res) => {
  try { res.json(fsApi.allTags(ROOT)); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notes-by-tags', requireUnlock, (req, res) => {
  try {
    const tags = (req.query.tags || '').split(',').map(String).filter(Boolean);
    res.json(fsApi.notesByTags(ROOT, tags));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Create note from template ----
app.post('/api/note/from-template', requireUnlock, (req, res) => {
  try {
    const { templatePath, name, parent, tags } = req.body || {};
    const src = fsApi.readNoteJson(ROOT, templatePath);
    if (!src) return res.status(404).json({ error: 'Template nicht gefunden' });
    const result = fsApi.saveNote(ROOT, { name: name || src.name, content: src.content, tags, parent, isNew: true });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Create folder ----
app.post('/api/folder', requireUnlock, (req, res) => {
  try {
    const { parent, name } = req.body || {};
    res.json(fsApi.createFolder(ROOT, parent, name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Move ----
app.post('/api/move', requireUnlock, (req, res) => {
  try {
    res.json(fsApi.move(ROOT, req.body.from, req.body.to, req.body.type));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ---- Copy ----
app.post('/api/copy', requireUnlock, (req, res) => {
  try {
    res.json(fsApi.copyItem(ROOT, req.body.from, req.body.to, req.body.type));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Duplicate note ----
app.post('/api/duplicate', requireUnlock, (req, res) => {
  try {
    res.json(fsApi.duplicateNote(ROOT, req.body.path));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Delete ----
app.delete('/api/item', requireUnlock, (req, res) => {
  try {
    fsApi.remove(ROOT, req.body.path, req.body.type);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Rename ----
app.post('/api/rename', requireUnlock, (req, res) => {
  try {
    res.json(fsApi.rename(ROOT, req.body.path, req.body.name, req.body.type));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Upload (images & attachments) ----
// Save to a temp dir, then promote into the target folder AFTER multer has
// fully parsed the form (so req.body.folder is reliably available regardless
// of the field order sent by the client).
const TMP_DIR = path.join(DATA_DIR, '.tmp-upload');
fs.mkdirSync(TMP_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TMP_DIR),
    filename: (req, file, cb) => {
      const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
      const base = path.parse(safe).name.slice(0, 120);
      const ext = path.extname(safe);
      cb(null, `${base}-${Date.now()}${ext}`);
    }
  })
});

function sameFileGuard(req, file, cb) {
  // limit single upload size to 25MB
  if (req.headers['content-length'] && Number(req.headers['content-length']) > 25 * 1024 * 1024) {
    return cb(new Error('Datei zu groß (max. 25 MB)'));
  }
  cb(null, true);
}

app.post('/api/upload', requireUnlock, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    // Central asset store: all uploads go to ROOT/_assets so paths stay stable
    // when notes/folders are moved, copied or renamed.
    const assets = fsApi.ensureAssetsDir(ROOT);
    const finalName = fsApi.uniqueAssetName(ROOT, req.file.originalname || req.file.filename);
    const finalPath = path.join(assets, finalName);
    fs.renameSync(req.file.path, finalPath); // move from tmp to central store
    const relPath = '_assets/' + finalName;
    const isImage = (req.file.mimetype || '').startsWith('image/');
    res.json({
      path: relPath,
      url: '/files/_assets/' + finalName,
      filename: finalName,
      original: req.file.originalname,
      isImage,
      size: req.file.size
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Drawing upload (PNG from the canvas) ----
// The canvas sends a data-URL string in JSON; we decode & store into _assets.
app.post('/api/upload-drawing', requireUnlock, (req, res) => {
  try {
    const dataUrl = String((req.body || {}).dataUrl || '');
    const m = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(400).json({ error: 'Ungültige Zeichnungsdaten' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const buf = Buffer.from(m[2], 'base64');
    const assets = fsApi.ensureAssetsDir(ROOT);
    const finalName = fsApi.uniqueAssetName(ROOT, 'zeichnung.png').replace(/\.png$/i, '.' + ext);
    const finalPath = path.join(assets, finalName);
    fs.writeFileSync(finalPath, buf);
    res.json({ path: '_assets/' + finalName, url: '/files/_assets/' + finalName, filename: finalName, isImage: true, size: buf.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Backup / Export (ZIP) ----
// Creates a .zip of all notes + assets and streams it to the client.
app.get('/api/export', requireUnlock, async (req, res) => {
  const tmpDir = path.join(DATA_DIR, '.tmp-export');
  let zipDir = null;
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = 'easynotes-backup-' + stamp;
    zipDir = path.join(tmpDir, name);
    fs.mkdirSync(zipDir, { recursive: true });

    // Kopiere Notizen (*.md) + Assets in das Temp-Verzeichnis
    const rootFull = path.resolve(ROOT);
    const cpDir = (src, dst) => {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === '.tmp-upload') continue;
        const sFull = path.join(src, e.name);
        const dFull = path.join(dst, e.name);
        if (e.isDirectory()) {
          fs.mkdirSync(dFull, { recursive: true });
          cpDir(sFull, dFull);
        } else if (/\.md$/i.test(e.name)) {
          fs.mkdirSync(path.dirname(dFull), { recursive: true });
          fs.copyFileSync(sFull, dFull);
        }
      }
    };
    cpDir(rootFull, zipDir);
    const assetsSrc = path.join(rootFull, '_assets');
    if (fs.existsSync(assetsSrc)) {
      const assetsDst = path.join(zipDir, '_assets');
      fs.mkdirSync(assetsDst, { recursive: true });
      cpDir(assetsSrc, assetsDst);
    }

    // ZIP mit system 'zip' erzeugen
    const { execFile } = await import('child_process');
    await new Promise((resolve, reject) => {
      execFile('zip', ['-rq', 'backup.zip', '.'], { cwd: zipDir }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
    const finalZip = path.join(zipDir, 'backup.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
    const stream = fs.createReadStream(finalZip);
    stream.pipe(res);
    stream.on('close', () => {
      setTimeout(() => { try { fs.rmSync(zipDir, { recursive: true, force: true }); } catch (e) {} }, 5000);
    });
  } catch (e) {
    try { if (zipDir) fs.rmSync(zipDir, { recursive: true, force: true }); } catch (e2) {}
    if (!res.headersSent) res.status(500).json({ error: e.message || String(e) });
  }
});

// Serve uploaded files (+ assets from OneNote imports)
app.use('/files', express.static(ROOT, {
  setHeaders: (res, p) => {
    const ct = mime.lookup(p) || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-cache');
  }
}));

// ---- AI ----
app.post('/api/ai', requireUnlock, async (req, res) => {
  try {
    const { provider, prompt, instructions, apiKey, model, lang } = req.body || {};
    if (!provider || !prompt) return res.status(400).json({ error: 'Anbieter und Eingabe erforderlich' });
    const text = await generateWithAI({ provider, prompt, instructions, apiKey, model, lang });
    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ---- OneNote importer ----
app.get('/api/imports', requireUnlock, (req, res) => {
  try {
    res.json(listImportableArchives(DATA_DIR));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/import', requireUnlock, async (req, res) => {
  try {
    const { archive, destFolder } = req.body || {};
    const result = await importOnenoteExport({ dataDir: DATA_DIR, root: ROOT, archive, destFolder });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload a OneNote export .zip directly (stored into data/imports) and import it
app.post('/api/import-upload', requireUnlock, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
    const name = req.file.originalname;
    if (!/\.zip$/i.test(name)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Nur .zip-Dateien werden unterstützt' });
    }
    const importsDir = path.join(DATA_DIR, 'imports');
    fs.mkdirSync(importsDir, { recursive: true });
    const dest = path.join(importsDir, path.posix.basename(name).replace(/\\/g, '_'));
    fs.renameSync(req.file.path, dest);
    res.json({ ok: true, name: path.posix.basename(dest), path: '/imports/' + path.posix.basename(dest) });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// error handler for multer
app.use((err, req, res, next) => {
  if (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`📒 EasyNotes running on http://0.0.0.0:${PORT}`);
  console.log(`   Root: ${ROOT}`);
  console.log(`   Data: ${DATA_DIR}`);
});
