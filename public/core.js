/* ============================================================
   core.js — shared helpers, state, i18n, api, toast
   Loaded FIRST.
   Exposes a single global: `App = { ... }`
   ============================================================ */
'use strict';
window.App = window.App || {};

const A = window.App;

A.state = {
  tree: null,
  currentNote: null,
  currentPath: null,
  dirty: false,
  editorMode: 'wysiwyg',   // 'wysiwyg' | 'md'
  searchQuery: ''
};

A.settings = { lang: 'de', theme: 'light', tagsEnabled: true, ai: {} };

/* ---------- i18n ---------- */
A.I18N = {
  de: {
    appname: 'EasyNotes', newpage: 'Seite', newfolder: 'Ordner', search: 'Suchen…',
    title: 'Titel der Seite', tag: '+ Tag',
    welcomeTitle: 'Willkommen', welcomeDesc: 'Erstelle Notizbücher als Ordner, Notizen als Markdown-Dateien. Der WYSIWYG-Editor macht das Schreiben einfach – ganz ohne Markdown-Kenntnisse.',
    welcomePage: 'Erste Seite erstellen', welcomeFolder: 'Ordner anlegen',
    dropHere: 'Datei hier ablegen', cancel: 'Abbrechen', move: 'Verschieben',
    duplicate: 'Seite duplizieren', delete: 'Seite löschen', rename: 'Umbenennen',
    copy: 'Kopieren', moveTo: 'Verschieben nach…', copyTo: 'Kopieren nach…',
    deleteConfirm: 'Wirklich löschen?', deleteFolderConfirm: 'Ordner und alle Inhalte wirklich löschen?',
    ai: 'KI-Assistent', provider: 'Anbieter', model: 'Modell',
    aiKeyHint: 'API-Key wird in den Einstellungen gespeichert.', aiKeyRequired: 'Bitte API-Key in den Einstellungen eintragen.',
    aiInstructions: 'Anweisungen (optional)', aiPrompt: 'Was soll die Notiz enthalten?',
    generate: 'Erzeugen', generating: 'Generiere…', insertNote: 'In Seite einfügen',
    importTitle: 'Importieren', importHint: 'Lege deinen Export (Ordner oder .zip) unter data/imports/ ab.',
    importTarget: 'Zielordner (optional)', reload: 'Neu laden', close: 'Schließen', import: 'Importieren',
    saved: 'Gespeichert', saving: 'Speichert…', unsaved: 'Ungespeichert', save: 'Speichern',
    noImports: 'Keine Importe vorhanden.', v: 'Verschieben', c: 'Kopieren', d: 'Duplizieren', r: 'Umbenennen', del: 'Löschen',
    addTag: 'Tag hinzufügen', newNotebook: 'Neues Notizbuch', notebookName: 'Name des Ordners / Notizbuchs',
    pageName: 'Name der Seite', deletePage: 'Seite löschen', deleteFolder: 'Ordner löschen',
    imageSaved: 'Bild eingefügt', fileSaved: 'Anlage eingefügt', linkUrl: 'Link-URL eingeben:',
    todoItem: 'Neuer To-do-Punkt', todo: 'To-do-Liste',
    aiError: 'Fehler', aiDone: 'KI-Inhalt erzeugt.', untitled: 'Unbenannt',
    saveFirst: 'Bitte zuerst einen Titel eingeben.',
    settings: 'Einstellungen', language: 'Sprache', theme: 'Darstellung', tagsToggle: 'Tags anzeigen',
    aiKeys: 'KI-API-Schlüssel', security: 'Sicherheit', pin: 'PIN', pinRemove: 'PIN entfernen',
    pinNote: 'Leer lassen = keine PIN. Mit einer PIN wird EasyNotes gesperrt und verlangt sie beim Öffnen.',
    locked: 'EasyNotes ist gesperrt', enterPin: 'Bitte PIN eingeben', unlock: 'Entsperren', wrongPin: 'Falsche PIN',
    pdf: 'Als PDF speichern', pinSaved: 'PIN gespeichert', pinRemoved: 'PIN entfernt',
    settingsSaved: 'Einstellungen gespeichert', pinned: 'Gesperrt', pinHint: 'PIN erforderlich',
    favorite: 'Als Favorit', favoriteAdd: 'Zu Favoriten hinzufügen', favoriteRemove: 'Aus Favoriten entfernen',
    favorites: 'Favoriten', favEmpty: 'Noch keine Favoriten. Füge Notizen über das Stern-Symbol hinzu.',
    pinNote: 'Notiz anpinnen', pinToBoard: 'Auf der Pinnwand anzeigen', unpin: 'Loslösen',
    pinboard: 'Pinnwand', pinboardEmpty: 'Noch nichts angepinnt. Pinge Notizen an, um sie hier zu sehen.',
    backup: 'Backup / Export', backupDesc: 'Alle Notizen und Dateien als ZIP herunterladen.',
    backupNow: 'Backup als ZIP', gemini: 'Gemini (Google)',
    versions: 'Versionen', versionHistory: 'MD-Versionen behalten', versionHistoryDesc: 'Wie viele ältere Versionen einer Seite aufbewahrt werden (0 = deaktiviert).',
    noVersions: 'Noch keine Versionen vorhanden.', restore: 'Wiederherstellen', restoreConfirm: 'Diese Version wiederherstellen? Der aktuelle Stand wird als neue Version gesichert.', versionRestored: 'Version wiederhergestellt',
    startPage: 'Startseite', startPagePinboard: 'Pinnwand', startPageWelcome: 'Willkommensseite', startPageTree: 'Notizbaum',
    templates: 'Templates', markAsTemplate: 'Als Template markieren', unmarkTemplate: 'Template-Markierung entfernen', template: 'Template',
    newPageFromTemplate: 'Neue Seite aus Template erstellen', templateChoose: 'Vorlage auswählen', emptyPage: 'Leere Seite',
    newPageModalTitle: 'Neue Seite erstellen',
    tags: 'Tags', tagSearch: 'Tags durchsuchen…', allNotes: 'Alle Notizen', backToTags: 'Zurück zu Tags',
    drawings: 'Zeichnen', drawingInsert: 'Zeichnung einfügen', drawingSave: 'Zeichnung einfügen', drawingClear: 'Löschen', drawingColor: 'Farbe', drawingBrush: 'Strich',
    drawingPen: 'Stift', drawingEraser: 'Radierer', drawingUndo: 'Rückgängig', cancel: 'Abbrechen'
  },
  en: {
    appname: 'EasyNotes', newpage: 'Page', newfolder: 'Folder', search: 'Search…',
    title: 'Page title', tag: '+ Tag',
    welcomeTitle: 'Welcome', welcomeDesc: 'Create notebooks as folders, notes as Markdown files. The WYSIWYG editor makes writing easy – no Markdown knowledge required.',
    welcomePage: 'Create first page', welcomeFolder: 'Create folder',
    dropHere: 'Drop file here', cancel: 'Cancel', move: 'Move',
    duplicate: 'Duplicate page', delete: 'Delete page', rename: 'Rename',
    copy: 'Copy', moveTo: 'Move to…', copyTo: 'Copy to…',
    deleteConfirm: 'Really delete?', deleteFolderConfirm: 'Delete folder and all contents?',
    ai: 'AI Assistant', provider: 'Provider', model: 'Model',
    aiKeyHint: 'API key is stored in Settings.', aiKeyRequired: 'Please add an API key in Settings.',
    aiInstructions: 'Instructions (optional)', aiPrompt: 'What should the note contain?',
    generate: 'Generate', generating: 'Generating…', insertNote: 'Insert into page',
    importTitle: 'Import', importHint: 'Put your export (folder or .zip) into data/imports/.',
    importTarget: 'Destination folder (optional)', reload: 'Reload', close: 'Close', import: 'Import',
    saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', save: 'Save',
    noImports: 'No imports available.', v: 'Move', c: 'Copy', d: 'Duplicate', r: 'Rename', del: 'Delete',
    addTag: 'Add tag', newNotebook: 'New notebook', notebookName: 'Folder / notebook name',
    pageName: 'Page name', deletePage: 'Delete page', deleteFolder: 'Delete folder',
    imageSaved: 'Image inserted', fileSaved: 'Attachment inserted', linkUrl: 'Enter link URL:',
    aiError: 'Error', aiDone: 'AI content generated.', untitled: 'Untitled',
    saveFirst: 'Please enter a title first.',
    settings: 'Settings', language: 'Language', theme: 'Appearance', tagsToggle: 'Show tags',
    aiKeys: 'AI API keys', security: 'Security', pin: 'PIN', pinRemove: 'Remove PIN',
    pinNote: 'Leave empty = no PIN. Set a PIN to lock EasyNotes; it will ask for it when opened.',
    locked: 'EasyNotes is locked', enterPin: 'Please enter your PIN', unlock: 'Unlock', wrongPin: 'Wrong PIN',
    pdf: 'Save as PDF', pinSaved: 'PIN saved', pinRemoved: 'PIN removed',
    settingsSaved: 'Settings saved', pinned: 'Locked', pinHint: 'PIN required',
    favorite: 'Mark favorite', favoriteAdd: 'Add to favorites', favoriteRemove: 'Remove from favorites',
    favorites: 'Favorites', favEmpty: 'No favorites yet. Star notes to add them here.',
    pinNote: 'Pin note', pinToBoard: 'Show on pinboard', unpin: 'Unpin',
    pinboard: 'Pinboard', pinboardEmpty: 'Nothing pinned yet. Pin notes to see them here.',
    backup: 'Backup / Export', backupDesc: 'Download all notes and files as ZIP.',
    backupNow: 'Backup as ZIP', gemini: 'Gemini (Google)',
    versions: 'Versions', versionHistory: 'MD versions to keep', versionHistoryDesc: 'How many older versions of a page are kept (0 = disabled).',
    noVersions: 'No versions yet.', restore: 'Restore', restoreConfirm: 'Restore this version? The current state will be saved as a new version.', versionRestored: 'Version restored',
    startPage: 'Start page', startPagePinboard: 'Pinboard', startPageWelcome: 'Welcome', startPageTree: 'Note tree',
    templates: 'Templates', markAsTemplate: 'Mark as template', unmarkTemplate: 'Remove template marker', template: 'Template',
    newPageFromTemplate: 'Create new page from template', templateChoose: 'Choose template', emptyPage: 'Blank page',
    newPageModalTitle: 'Create new page',
    tags: 'Tags', tagSearch: 'Search tags…', allNotes: 'All notes', backToTags: 'Back to tags',
    drawings: 'Draw', drawingInsert: 'Insert drawing', drawingSave: 'Insert drawing', drawingClear: 'Clear', drawingColor: 'Color', drawingBrush: 'Brush',
    drawingPen: 'Pen', drawingEraser: 'Eraser', drawingUndo: 'Undo', cancel: 'Cancel'
  }
};
A.t = (key) => (A.I18N[A.settings.lang] || A.I18N.de)[key] || A.I18N.de[key] || key;

/* ---------- utils ---------- */
A.$ = (sel, el) => (el || document).querySelector(sel);
A.$$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

A.esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

A.renderMarkdown = (md) => {
  if (!window.marked) return md || '';
  try { return window.marked.parse(md || '', { breaks: true, gfm: true }); }
  catch (e) { return md || ''; }
};

A.mdToHtml = (md) => A.renderMarkdown(md);

A.api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
};

/* ---------- toast ---------- */
let toastTimer;
A.toast = (msg, isError = false) => {
  const el = A.$('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
};
